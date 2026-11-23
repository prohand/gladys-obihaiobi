// -----------------------------------------------------------------------------
// Client of the web interface of ONE OBi box, on the local network.
//
// Everything the integration reads comes from the status pages the OBi web
// interface already serves (the ones its own "Status" menu shows):
//   - DI_S_.xml           product, firmware, uptime, SPn and OBiTALK services;
//   - PI_FXS_1_Stats.xml  phone ports (on hook, off hook, ringing, caller id);
//   - rebootgetconfig.htm reboots the box (admin account only).
// The "user" account reads the same pages under /user/.
//
// No cloud: the box is reached directly, so the integration works without
// Internet and without an OBiTALK account.
// -----------------------------------------------------------------------------

import { buildAuthorization, parseChallenge } from './digest.js';
import { extractBox, parseStatusXml } from './parser.js';

export const PATHS = {
  DEVICE_INFO: 'DI_S_.xml',
  PORTS: 'PI_FXS_1_Stats.xml',
  REBOOT: 'rebootgetconfig.htm',
};

/** Why a request failed: what the user can do about it differs. */
export const ERROR_CODES = {
  UNREACHABLE: 'unreachable', // network: wrong address, box off, timeout
  AUTH: 'auth', // wrong user name or password
  HTTP: 'http', // the box answered with an unexpected HTTP status
  INVALID: 'invalid', // the box answered something that is not an OBi status page
};

export class ObihaiError extends Error {
  /**
   * @param {string} code one of ERROR_CODES
   * @param {string} message
   * @param {{ status?: number, cause?: unknown }} [details]
   */
  constructor(code, message, { status, cause } = {}) {
    super(message, { cause });
    this.name = 'ObihaiError';
    this.code = code;
    this.status = status;
  }
}

/**
 * Turn what the user typed into a base URL: "192.168.1.50",
 * "192.168.1.50:8080" or "http://obi.lan/" → "http://192.168.1.50/".
 */
export function toBaseUrl(host) {
  const trimmed = String(host ?? '').trim();
  if (!trimmed) {
    throw new ObihaiError(ERROR_CODES.UNREACHABLE, 'No address given for the OBi box');
  }
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  const url = new URL(withScheme);
  url.pathname = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
  url.search = '';
  url.hash = '';
  return url.toString();
}

export class ObihaiClient {
  /**
   * @param {object} options
   * @param {string} options.host address of the box (IP, name, optional port or scheme)
   * @param {string} options.username "admin" (full access) or "user" (read only)
   * @param {string} options.password
   * @param {number} [options.timeoutMs] per request
   * @param {typeof fetch} [options.fetch] injected in tests
   */
  constructor({ host, username, password, timeoutMs = 5000, fetch: fetchImpl = globalThis.fetch }) {
    this.host = String(host ?? '').trim();
    this.username = username;
    this.password = password ?? '';
    this.timeoutMs = timeoutMs;
    this.fetch = fetchImpl;
    // The last Digest challenge, reused with an increasing counter so a poll
    // costs one request per page instead of two. A stale nonce gets a new 401,
    // and the request is replayed once with the fresh challenge.
    this.challenge = null;
    this.nonceCount = 0;
  }

  /** Base URL of the pages this account reads. */
  get baseUrl() {
    const base = toBaseUrl(this.host);
    return this.username === 'user' ? new URL('user/', base).toString() : base;
  }

  /**
   * GET one page of the box, authenticated.
   * @param {string} page e.g. PATHS.DEVICE_INFO
   * @returns {Promise<string>} the body
   */
  async get(page) {
    const url = new URL(page, this.baseUrl);
    let response = await this.send(url, this.challenge);
    if (response.status === 401) {
      const challenge = parseChallenge(response.headers.get('www-authenticate'));
      // Drain the body so the connection can be reused.
      await response.text().catch(() => {});
      if (!challenge) {
        throw new ObihaiError(ERROR_CODES.AUTH, 'The OBi box refused the request (401)', {
          status: 401,
        });
      }
      this.challenge = challenge;
      this.nonceCount = 0;
      response = await this.send(url, challenge);
      if (response.status === 401) {
        await response.text().catch(() => {});
        this.challenge = null;
        throw new ObihaiError(ERROR_CODES.AUTH, 'Wrong user name or password for the OBi box', {
          status: 401,
        });
      }
    }
    if (!response.ok) {
      await response.text().catch(() => {});
      throw new ObihaiError(ERROR_CODES.HTTP, `The OBi box answered HTTP ${response.status}`, {
        status: response.status,
      });
    }
    return response.text();
  }

  async send(url, challenge) {
    const headers = {};
    if (challenge) {
      this.nonceCount += 1;
      headers.authorization = buildAuthorization({
        challenge,
        method: 'GET',
        uri: `${url.pathname}${url.search}`,
        username: this.username,
        password: this.password,
        nc: this.nonceCount,
      });
    }
    try {
      return await this.fetch(url, {
        method: 'GET',
        headers,
        redirect: 'manual',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      throw new ObihaiError(
        ERROR_CODES.UNREACHABLE,
        `OBi box unreachable at ${url.host} (${err?.cause?.code ?? err?.name ?? 'error'})`,
        { cause: err },
      );
    }
  }

  /**
   * Read the status pages and return the box as Gladys sees it (see
   * extractBox). The port page is optional: some models or accounts do not
   * serve it, and the services alone are still worth publishing.
   */
  async readStatus() {
    const deviceInfoXml = await this.get(PATHS.DEVICE_INFO);
    const deviceInfo = parseStatusXml(deviceInfoXml);
    if (Object.keys(deviceInfo.objects).length === 0) {
      throw new ObihaiError(ERROR_CODES.INVALID, 'The answer is not an OBi status page');
    }
    let portInfo = null;
    try {
      portInfo = parseStatusXml(await this.get(PATHS.PORTS));
    } catch (err) {
      if (err.code !== ERROR_CODES.HTTP) {
        throw err;
      }
    }
    return extractBox(deviceInfo, portInfo);
  }

  /** Ask the box to reboot. Needs the admin account. */
  async reboot() {
    if (this.username === 'user') {
      throw new ObihaiError(ERROR_CODES.AUTH, 'Rebooting needs the admin account of the OBi box');
    }
    await this.get(PATHS.REBOOT);
  }
}
