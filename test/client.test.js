// -----------------------------------------------------------------------------
// The HTTP client of one OBi box, against a fake box (no network).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ERROR_CODES, ObihaiClient, toBaseUrl } from '../src/obihai/client.js';
import { createFakeObi } from './helpers/fakeObi.js';

const client = (box, overrides = {}) =>
  new ObihaiClient({
    host: box.host,
    username: 'admin',
    password: 'secret',
    fetch: box.fetch,
    ...overrides,
  });

test('toBaseUrl accepts an IP, a port or a full URL', () => {
  assert.equal(toBaseUrl('192.168.1.50'), 'http://192.168.1.50/');
  assert.equal(toBaseUrl(' 192.168.1.50:8080 '), 'http://192.168.1.50:8080/');
  assert.equal(toBaseUrl('https://obi.lan'), 'https://obi.lan/');
  assert.throws(() => toBaseUrl(''), { code: ERROR_CODES.UNREACHABLE });
});

test('readStatus answers the Digest challenge and reads both pages', async () => {
  const box = createFakeObi();
  const status = await client(box).readStatus();
  assert.equal(status.serial, '88E2ABC12345');
  assert.equal(status.ports.length, 2);
  // 401 + retry for the first page, then the challenge is reused.
  assert.equal(box.requests.length, 3);
});

test('a stale nonce is renewed transparently', async () => {
  const box = createFakeObi();
  const obi = client(box);
  await obi.readStatus();
  box.renewNonce();
  const status = await obi.readStatus();
  assert.equal(status.model, 'OBi202');
});

test('a wrong password is an auth error', async () => {
  const box = createFakeObi();
  await assert.rejects(client(box, { password: 'nope' }).readStatus(), {
    code: ERROR_CODES.AUTH,
  });
});

test('an unreachable box is an unreachable error', async () => {
  const box = createFakeObi();
  box.online = false;
  await assert.rejects(client(box).readStatus(), { code: ERROR_CODES.UNREACHABLE });
});

test('the user account reads the pages under /user/', async () => {
  const box = createFakeObi();
  const status = await client(box, { username: 'user', password: 'pw' }).readStatus();
  assert.equal(status.serial, '88E2ABC12345');
  assert.ok(box.requests.every((request) => request.url.includes('/user/')));
});

test('a missing port page is not an error', async () => {
  const box = createFakeObi();
  box.portsStatus = 404;
  const status = await client(box).readStatus();
  assert.deepEqual(status.ports, []);
});

test('reboot calls the reboot page, and only with the admin account', async () => {
  const box = createFakeObi();
  await client(box).reboot();
  assert.equal(box.reboots, 1);
  await assert.rejects(client(box, { username: 'user', password: 'pw' }).reboot(), {
    code: ERROR_CODES.AUTH,
  });
  assert.equal(box.reboots, 1);
});

test('the password never appears in a request', async () => {
  const box = createFakeObi();
  await client(box).readStatus();
  for (const request of box.requests) {
    assert.doesNotMatch(JSON.stringify(request), /secret/);
  }
});
