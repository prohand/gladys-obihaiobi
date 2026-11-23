// -----------------------------------------------------------------------------
// Configuration defaults and normalization.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, normalizeConfig, parseHosts } from '../src/config.js';

test('defaults apply to an empty config', () => {
  const config = normalizeConfig();
  assert.deepEqual(config.hosts, []);
  assert.equal(config.username, DEFAULT_CONFIG.username);
  assert.equal(config.password, '');
  assert.equal(config.poll_frequency, DEFAULT_CONFIG.poll_frequency);
});

test('hosts: one or several, any separator, no duplicate', () => {
  assert.deepEqual(parseHosts('192.168.1.50'), ['192.168.1.50']);
  assert.deepEqual(parseHosts(' 192.168.1.50, 192.168.1.51;obi.lan\n192.168.1.50 '), [
    '192.168.1.50',
    '192.168.1.51',
    'obi.lan',
  ]);
  assert.deepEqual(parseHosts(undefined), []);
});

test('poll frequency: numbers from a form, kept within bounds', () => {
  assert.equal(normalizeConfig({ poll_frequency: '30' }).poll_frequency, 30);
  assert.equal(normalizeConfig({ poll_frequency: 0 }).poll_frequency, 2);
  assert.equal(normalizeConfig({ poll_frequency: 99999 }).poll_frequency, 3600);
  assert.equal(normalizeConfig({ poll_frequency: 'abc' }).poll_frequency, 5);
});

test('an empty user name falls back to admin', () => {
  assert.equal(normalizeConfig({ username: '' }).username, 'admin');
  assert.equal(normalizeConfig({ username: 'user' }).username, 'user');
});
