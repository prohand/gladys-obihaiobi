// -----------------------------------------------------------------------------
// HTTP Digest / Basic authentication of the OBi web interface.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAuthorization, parseChallenge } from '../src/obihai/digest.js';

test('parseChallenge reads a Digest challenge, quoted and bare values', () => {
  const challenge = parseChallenge(
    'Digest realm="OBi202", nonce="abc, def", qop="auth,auth-int", algorithm=MD5, stale=FALSE',
  );
  assert.deepEqual(challenge, {
    scheme: 'digest',
    params: {
      realm: 'OBi202',
      nonce: 'abc, def',
      qop: 'auth,auth-int',
      algorithm: 'MD5',
      stale: 'FALSE',
    },
  });
});

test('parseChallenge ignores missing headers and unknown schemes', () => {
  assert.equal(parseChallenge(null), null);
  assert.equal(parseChallenge(''), null);
  assert.equal(parseChallenge('Bearer realm="x"'), null);
  assert.equal(parseChallenge('Basic realm="OBi"').scheme, 'basic');
});

test('buildAuthorization matches the RFC 2617 example', () => {
  const header = buildAuthorization({
    challenge: parseChallenge(
      'Digest realm="testrealm@host.com", qop="auth,auth-int", nonce="dcd98b7102dd2f0e8b11d0f600bfb0c093", opaque="5ccc069c403ebaf9f0171e9517f40e41"',
    ),
    method: 'GET',
    uri: '/dir/index.html',
    username: 'Mufasa',
    password: 'Circle Of Life',
    nc: 1,
    cnonce: '0a4f113b',
  });
  assert.match(header, /^Digest /);
  assert.match(header, /response="6629fae49393a05397450978507c4ef1"/);
  assert.match(header, /qop=auth, nc=00000001, cnonce="0a4f113b"/);
  assert.match(header, /opaque="5ccc069c403ebaf9f0171e9517f40e41"/);
});

test('buildAuthorization without qop uses the RFC 2069 response', () => {
  const header = buildAuthorization({
    challenge: parseChallenge('Digest realm="r", nonce="n"'),
    method: 'GET',
    uri: '/DI_S_.xml',
    username: 'admin',
    password: 'admin',
  });
  assert.doesNotMatch(header, /qop=/);
  assert.match(header, /response="[0-9a-f]{32}"/);
});

test('buildAuthorization answers a Basic challenge', () => {
  const header = buildAuthorization({
    challenge: { scheme: 'basic', params: {} },
    method: 'GET',
    uri: '/',
    username: 'admin',
    password: 'secret',
  });
  assert.equal(header, `Basic ${Buffer.from('admin:secret').toString('base64')}`);
});
