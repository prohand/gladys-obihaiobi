// -----------------------------------------------------------------------------
// A fake OBi box: the status pages, behind HTTP Digest authentication, served
// through an injected `fetch`. No network in the tests.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';

const md5 = (text) => createHash('md5').update(text).digest('hex');

const escape = (text) =>
  String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function object(name, parameters) {
  const body = Object.entries(parameters)
    .map(
      ([key, value]) =>
        `<parameter name="${escape(key)}"><value type="string" current="${escape(value)}" default=""/></parameter>`,
    )
    .join('\n    ');
  return `  <object name="${escape(name)}">\n    ${body}\n  </object>`;
}

/**
 * The DI_S_.xml page.
 * @param {object} state
 */
export function deviceInfoXml({
  model = 'OBi202',
  serial = '88E2ABC12345',
  mac = '9CADEF123456',
  firmware = '3.2.2 (Build: 5921EX)',
  uptime = '1 Days 2:03:04 (5)',
  rebootRequired = false,
  services = {
    'SP1 Service Status': { Status: 'Registered (server=sip.example.net:5060; expire in 3540s)' },
    'SP2 Service Status': { Status: 'Service Not Configured' },
    'OBiTALK Service Status': { Status: 'Normal (User Mode)' },
  },
} = {}) {
  const product = {
    ModelName: model,
    HardwareVersion: '1.4',
    SoftwareVersion: firmware,
    SerialNumber: serial,
    MACAddress: mac,
    UpTime: uptime,
  };
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<status>',
    `<model name="${model}" reboot_req="${rebootRequired}" />`,
    object('Product Information', product),
    ...Object.entries(services).map(([name, parameters]) =>
      object(name, { CallState: '0 Active Calls', ...parameters }),
    ),
    '</status>',
  ].join('\n');
}

/** The PI_FXS_1_Stats.xml page. */
export function portsXml(
  ports = {
    PHONE1: { State: 'On Hook', LastCallerInfo: '' },
    PHONE2: { State: 'On Hook', LastCallerInfo: '' },
  },
) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<status>',
    ...Object.entries(ports).map(([name, parameters]) =>
      object(`${name} Port Status`, { LoopCurrent: '25 mA', ...parameters }),
    ),
    '</status>',
  ].join('\n');
}

/**
 * A box answering on one host.
 * @param {object} [options]
 * @param {string} [options.host]
 * @param {Record<string, string>} [options.accounts] user name -> password
 */
export function createFakeObi({
  host = '192.168.1.50',
  accounts = { admin: 'secret', user: 'pw' },
} = {}) {
  const realm = 'OBi202';
  let nonceCounter = 0;
  const box = {
    host,
    online: true,
    info: {},
    ports: undefined,
    portsStatus: 200,
    nonce: 'nonce-0',
    requests: [],
    reboots: 0,
    /** Expire the current nonce: the next request gets a stale 401. */
    renewNonce() {
      nonceCounter += 1;
      box.nonce = `nonce-${nonceCounter}`;
    },
    fetch: async (input, init = {}) => {
      const url = new URL(String(input));
      box.requests.push({ url: url.toString(), headers: init.headers ?? {} });
      if (url.hostname !== host.split(':')[0] || !box.online) {
        const error = new TypeError('fetch failed');
        error.cause = { code: 'EHOSTUNREACH' };
        throw error;
      }
      const user = checkDigest(init.headers?.authorization, url, accounts, realm, box.nonce);
      if (!user) {
        return new Response('Unauthorized', {
          status: 401,
          headers: {
            'www-authenticate': `Digest realm="${realm}", nonce="${box.nonce}", qop="auth", algorithm=MD5`,
          },
        });
      }
      const prefix = user === 'user' ? '/user/' : '/';
      switch (url.pathname) {
        case `${prefix}DI_S_.xml`:
          return new Response(deviceInfoXml(box.info), { status: 200 });
        case `${prefix}PI_FXS_1_Stats.xml`:
          return box.portsStatus === 200
            ? new Response(portsXml(box.ports), { status: 200 })
            : new Response('Not found', { status: box.portsStatus });
        case '/rebootgetconfig.htm':
          box.reboots += 1;
          return new Response('<html>Rebooting</html>', { status: 200 });
        default:
          return new Response('Not found', { status: 404 });
      }
    },
  };
  return box;
}

/** Check a Digest Authorization header like the box would. @returns {string|null} user */
function checkDigest(header, url, accounts, realm, nonce) {
  if (typeof header !== 'string' || !header.startsWith('Digest ')) {
    return null;
  }
  const params = {};
  for (const [, key, quoted, token] of header.slice(7).matchAll(/(\w+)=(?:"([^"]*)"|([^\s,]+))/g)) {
    params[key] = quoted ?? token;
  }
  const password = accounts[params.username];
  if (password === undefined || params.nonce !== nonce || params.realm !== realm) {
    return null;
  }
  if (params.uri !== `${url.pathname}${url.search}`) {
    return null;
  }
  const ha1 = md5(`${params.username}:${realm}:${password}`);
  const ha2 = md5(`GET:${params.uri}`);
  const expected = md5(`${ha1}:${nonce}:${params.nc}:${params.cnonce}:${params.qop}:${ha2}`);
  return expected === params.response ? params.username : null;
}
