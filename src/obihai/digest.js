// -----------------------------------------------------------------------------
// HTTP authentication of the OBi web interface.
//
// The OBi boxes protect their status pages with HTTP Digest authentication
// (RFC 2617, MD5, qop "auth"); a few firmwares answer with Basic instead.
// Node's fetch knows neither, so the header is built here, without any
// dependency: the SDK stays the only runtime dependency of the integration.
// -----------------------------------------------------------------------------

import { createHash, randomBytes } from 'node:crypto';

const md5 = (text) => createHash('md5').update(text).digest('hex');

/**
 * Read a `WWW-Authenticate` header.
 *
 * @param {string|null|undefined} header the raw header value
 * @returns {{ scheme: 'digest'|'basic', params: Record<string, string> }|null}
 *   null when the header is missing or uses a scheme we do not speak
 */
export function parseChallenge(header) {
  if (typeof header !== 'string') {
    return null;
  }
  const match = header.trim().match(/^(\w+)\s*(.*)$/s);
  if (!match) {
    return null;
  }
  const scheme = match[1].toLowerCase();
  if (scheme !== 'digest' && scheme !== 'basic') {
    return null;
  }
  const params = {};
  // key="quoted, value" or key=token, separated by commas.
  const re = /([a-zA-Z0-9_-]+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^\s,]+))/g;
  for (const [, key, quoted, token] of match[2].matchAll(re)) {
    params[key.toLowerCase()] = quoted !== undefined ? quoted.replace(/\\(.)/g, '$1') : token;
  }
  return { scheme, params };
}

/**
 * The `Authorization` header answering a challenge.
 *
 * @param {object} options
 * @param {{ scheme: string, params: Record<string, string> }} options.challenge
 * @param {string} options.method HTTP method
 * @param {string} options.uri path (and query) of the request
 * @param {string} options.username
 * @param {string} options.password
 * @param {number} [options.nc] request counter for this nonce
 * @param {string} [options.cnonce] client nonce (random when omitted)
 * @returns {string}
 */
export function buildAuthorization({ challenge, method, uri, username, password, nc = 1, cnonce }) {
  if (challenge.scheme === 'basic') {
    return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  }
  const { realm = '', nonce = '', opaque, algorithm } = challenge.params;
  const qop = pickQop(challenge.params.qop);
  const clientNonce = cnonce ?? randomBytes(8).toString('hex');
  const ncHex = nc.toString(16).padStart(8, '0');

  let ha1 = md5(`${username}:${realm}:${password}`);
  if (algorithm && algorithm.toLowerCase() === 'md5-sess') {
    ha1 = md5(`${ha1}:${nonce}:${clientNonce}`);
  }
  const ha2 = md5(`${method}:${uri}`);
  const response = qop
    ? md5(`${ha1}:${nonce}:${ncHex}:${clientNonce}:${qop}:${ha2}`)
    : md5(`${ha1}:${nonce}:${ha2}`);

  const parts = [
    `username="${username}"`,
    `realm="${realm}"`,
    `nonce="${nonce}"`,
    `uri="${uri}"`,
    `response="${response}"`,
  ];
  if (algorithm) {
    parts.push(`algorithm=${algorithm}`);
  }
  if (opaque !== undefined) {
    parts.push(`opaque="${opaque}"`);
  }
  if (qop) {
    parts.push(`qop=${qop}`, `nc=${ncHex}`, `cnonce="${clientNonce}"`);
  }
  return `Digest ${parts.join(', ')}`;
}

// The server may offer several qop values ("auth,auth-int"): only "auth" is
// supported (no body to hash on GET requests anyway).
function pickQop(qop) {
  if (!qop) {
    return null;
  }
  const values = qop.split(',').map((value) => value.trim().toLowerCase());
  return values.includes('auth') ? 'auth' : null;
}
