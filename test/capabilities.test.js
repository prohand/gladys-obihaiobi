// -----------------------------------------------------------------------------
// The whole integration (src/integration.js) against the fake Gladys: manifest
// actions, scene actions, widget content and widget button.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { ObihaiClient } from '../src/obihai/client.js';
import { setupIntegration } from '../src/integration.js';
import { buildContent, formatUptime, STATUS_WIDGET } from '../src/capabilities/widget.js';
import { createFakeObi } from './helpers/fakeObi.js';

const DEVICE = 'ext:obihai:obi:88E2ABC12345';

async function start(config = { hosts: '192.168.1.50', password: 'secret' }) {
  const box = createFakeObi();
  const gladys = createFakeGladys({ selector: 'obihai', config });
  const { service } = setupIntegration(gladys, {
    createClient: (options) => new ObihaiClient({ ...options, fetch: box.fetch }),
  });
  await gladys.connect();
  await service.pollAll();
  return { gladys, service, box, stop: () => service.stop() };
}

test('connecting reads the box and publishes it', async (t) => {
  const { gladys, stop } = await start();
  t.after(stop);
  assert.equal(gladys.fake.discoveredDevices[0].external_id, DEVICE);
  assert.deepEqual(gladys.fake.connectionStatus, { connected: true });
  assert.ok(gladys.fake.widgetRefreshes.includes(STATUS_WIDGET));
});

test('action test_connection answers in four languages', async (t) => {
  const { gladys, stop } = await start();
  t.after(stop);
  const ack = await gladys.fake.action('test_connection');
  assert.equal(ack.success, true);
  assert.deepEqual(Object.keys(ack.data.message).sort(), ['de', 'en', 'es', 'fr']);
  assert.match(ack.data.message.en, /OK/);
});

test('action reboot reboots the chosen box', async (t) => {
  const { gladys, box, stop } = await start();
  t.after(stop);
  const ack = await gladys.fake.action('reboot', { device: DEVICE });
  assert.equal(ack.success, true);
  assert.equal(box.reboots, 1);
  assert.match(ack.data.message.fr, /redémarre/);
});

test('scene action get_box_status returns the declared outputs', async (t) => {
  const { gladys, box, service, stop } = await start();
  t.after(stop);
  let ack = await gladys.fake.sceneAction('get_box_status', { device: DEVICE, service: 'sp1' });
  assert.deepEqual(ack.data.outputs, {
    reachable: true,
    registered: true,
    status: 'Registered',
    in_call: false,
    ringing: false,
  });

  box.ports = { PHONE1: { State: 'Off Hook' }, PHONE2: { State: 'On Hook' } };
  await service.pollAll();
  ack = await gladys.fake.sceneAction('get_box_status', { device: DEVICE, service: 'sp2' });
  assert.equal(ack.data.outputs.registered, false);
  assert.equal(ack.data.outputs.in_call, true);

  box.online = false;
  await service.pollAll();
  ack = await gladys.fake.sceneAction('get_box_status', { device: DEVICE });
  assert.equal(ack.data.outputs.reachable, false);
});

test('scene action reboot_box returns rebooted and a message', async (t) => {
  const { gladys, box, stop } = await start();
  t.after(stop);
  const ack = await gladys.fake.sceneAction('reboot_box', { device: DEVICE });
  assert.deepEqual(Object.keys(ack.data.outputs).sort(), ['message', 'rebooted']);
  assert.equal(ack.data.outputs.rebooted, true);
  assert.equal(box.reboots, 1);
});

test('the widget content is valid and shows the lines and ports', async (t) => {
  const { gladys, stop } = await start();
  t.after(stop);
  const ack = await gladys.fake.widgetGet(STATUS_WIDGET, { settings: { device: DEVICE } });
  assert.equal(ack.success, true);
  const { content } = ack.data;
  assert.deepEqual(validateWidgetContent(content), []);
  const status = content.components.find((component) => component.type === 'status');
  assert.deepEqual(
    status.items.map((item) => (typeof item.label === 'string' ? item.label : item.label.en)),
    ['SP1', 'SP2', 'OBiTALK', 'PHONE1', 'PHONE2', 'Uptime'],
  );
  const button = content.components.find((component) => component.type === 'button');
  assert.deepEqual(button.action, { key: 'reboot', params: { device: DEVICE }, confirm: true });
});

test('the widget button reboots the box', async (t) => {
  const { gladys, box, stop } = await start();
  t.after(stop);
  const ack = await gladys.fake.widgetAction(STATUS_WIDGET, 'reboot', { device: DEVICE });
  assert.equal(ack.success, true);
  assert.equal(box.reboots, 1);
});

test('the widget stays valid with no box, an unreachable box or a waiting one', () => {
  assert.deepEqual(validateWidgetContent(buildContent(undefined)), []);
  const offline = buildContent({
    host: '192.168.1.50',
    name: 'OBi202 (192.168.1.50)',
    reachable: false,
    error: { code: 'unreachable' },
    box: null,
    deviceExternalId: null,
  });
  assert.deepEqual(validateWidgetContent(offline), []);
  assert.equal(
    offline.components.some((component) => component.type === 'button'),
    false,
  );
  const waiting = buildContent({ host: 'obi.lan', name: 'obi.lan', reachable: null, box: null });
  assert.deepEqual(validateWidgetContent(waiting), []);
});

test('formatUptime', () => {
  assert.deepEqual(formatUptime(3 * 86400 + 4 * 3600 + 5 * 60), {
    en: '3 d 04:05',
    fr: '3 j 04:05',
    de: '3 T 04:05',
    es: '3 d 04:05',
  });
});

test('a config update re-reads the new boxes', async (t) => {
  const { gladys, service, stop } = await start({ hosts: '', password: 'secret' });
  t.after(stop);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  await gladys.fake.configUpdated({ hosts: '192.168.1.50', password: 'secret' });
  await service.pollAll();
  assert.equal(gladys.fake.discoveredDevices[0].external_id, DEVICE);
  assert.deepEqual(gladys.fake.connectionStatus, { connected: true });
});

test('a scan request re-publishes the discovered boxes', async (t) => {
  const { gladys, stop } = await start();
  t.after(stop);
  await gladys.fake.scanRequest();
  assert.equal(gladys.fake.discoveredDevices[0].external_id, DEVICE);
});
