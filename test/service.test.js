// -----------------------------------------------------------------------------
// The OBi service against the fake Gladys of the SDK and fake boxes: discovery,
// states, transports, connection status and scene triggers.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { ObihaiClient } from '../src/obihai/client.js';
import { ObihaiService, SCENE_EVENTS } from '../src/obihai/service.js';
import { normalizeConfig } from '../src/config.js';
import { createFakeObi } from './helpers/fakeObi.js';

function setup({ hosts = ['192.168.1.50'], password = 'secret', username = 'admin' } = {}) {
  const gladys = createFakeGladys({ selector: 'obihai' });
  const boxes = Object.fromEntries(hosts.map((host) => [host, createFakeObi({ host })]));
  const clock = { now: 1_000_000 };
  const service = new ObihaiService(gladys, {
    now: () => clock.now,
    createClient: (options) => new ObihaiClient({ ...options, fetch: boxes[options.host].fetch }),
  });
  service.configure(normalizeConfig({ hosts: hosts.join(','), password, username }));
  return { gladys, service, boxes, box: boxes[hosts[0]], clock };
}

const DEVICE = 'ext:obihai:obi:88E2ABC12345';

test('the first poll publishes the box, its states, its transport and the status', async () => {
  const { gladys, service } = setup();
  await service.pollAll();

  const [device] = gladys.fake.discoveredDevices;
  assert.equal(device.external_id, DEVICE);
  assert.equal(device.name, 'OBi202 (192.168.1.50)');
  assert.deepEqual(
    device.features.map((feature) => feature.external_id.slice(DEVICE.length + 1)),
    [
      'sp1-status',
      'sp2-status',
      'obitalk-status',
      'phone1-state',
      'phone2-state',
      'uptime',
      'firmware',
    ],
  );
  for (const feature of device.features) {
    for (const column of ['name', 'min', 'max', 'read_only', 'has_feedback']) {
      assert.notEqual(feature[column], undefined, `${feature.external_id}.${column}`);
    }
    assert.equal(feature.read_only, true);
  }

  assert.equal(gladys.fake.lastState(`${DEVICE}:sp1-status`), 'Registered');
  assert.equal(gladys.fake.lastState(`${DEVICE}:phone1-state`), 'On Hook');
  assert.equal(gladys.fake.lastState(`${DEVICE}:uptime`), 93784);
  assert.equal(gladys.fake.lastState(`${DEVICE}:firmware`), '3.2.2');
  assert.deepEqual(gladys.fake.transports, [{ device_external_id: DEVICE, transport: 'local' }]);
  assert.deepEqual(gladys.fake.connectionStatus, { connected: true });
  assert.deepEqual(gladys.fake.sceneEvents, []);
});

test('a quiet box publishes nothing new on the next poll', async () => {
  const { gladys, service } = setup();
  await service.pollAll();
  const before = gladys.fake.requests.length;
  await service.pollAll();
  assert.equal(gladys.fake.requests.length, before);
});

test('a ringing phone fires incoming_call with the caller', async () => {
  const { gladys, service, box } = setup();
  await service.pollAll();
  box.ports = {
    PHONE1: { State: 'Ringing', LastCallerInfo: '"Jane Doe" 0612345678' },
    PHONE2: { State: 'On Hook' },
  };
  await service.pollAll();
  await service.pollAll(); // still ringing: no second event
  assert.deepEqual(gladys.fake.sceneEvents, [
    {
      key: SCENE_EVENTS.INCOMING_CALL,
      data: {
        device: DEVICE,
        device_name: 'OBi202 (192.168.1.50)',
        port: 'phone1',
        caller_number: '0612345678',
        caller_name: 'Jane Doe',
      },
    },
  ]);
  assert.equal(gladys.fake.lastState(`${DEVICE}:phone1-state`), 'Ringing');
});

test('hanging up fires call_ended with the call duration', async () => {
  const { gladys, service, box, clock } = setup();
  await service.pollAll();
  box.ports = { PHONE1: { State: 'Off Hook' }, PHONE2: { State: 'On Hook' } };
  await service.pollAll();
  clock.now += 95_000;
  box.ports = { PHONE1: { State: 'On Hook' }, PHONE2: { State: 'On Hook' } };
  await service.pollAll();
  assert.deepEqual(gladys.fake.sceneEvents, [
    {
      key: SCENE_EVENTS.CALL_ENDED,
      data: {
        device: DEVICE,
        device_name: 'OBi202 (192.168.1.50)',
        port: 'phone1',
        duration_seconds: 95,
      },
    },
  ]);
});

test('a SIP account that loses its registration fires registration_changed', async () => {
  const { gladys, service, box } = setup();
  await service.pollAll();
  box.info = {
    services: {
      'SP1 Service Status': { Status: 'Backing Off (30 seconds)' },
      'SP2 Service Status': { Status: 'Service Not Configured' },
      'OBiTALK Service Status': { Status: 'Normal (User Mode)' },
    },
  };
  await service.pollAll();
  assert.deepEqual(gladys.fake.sceneEvents, [
    {
      key: SCENE_EVENTS.REGISTRATION_CHANGED,
      data: {
        device: DEVICE,
        device_name: 'OBi202 (192.168.1.50)',
        service: 'sp1',
        status: 'not_registered',
        status_text: 'Backing Off',
      },
    },
  ]);
  assert.equal(gladys.fake.lastState(`${DEVICE}:sp1-status`), 'Backing Off');
});

test('a box going offline then back fires box_connection_changed twice', async () => {
  const { gladys, service, box } = setup();
  const changes = [];
  service.onChange(() => changes.push('change'));
  await service.pollAll();
  box.online = false;
  await service.pollAll();
  assert.deepEqual(gladys.fake.transports.at(-1), {
    device_external_id: DEVICE,
    transport: 'unreachable',
  });
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.fr, /192\.168\.1\.50 : |192\.168\.1\.50: /);
  assert.ok(gladys.fake.connectionStatus.message.de);
  assert.ok(gladys.fake.connectionStatus.message.es);

  box.online = true;
  await service.pollAll();
  assert.deepEqual(
    gladys.fake.sceneEvents.map(({ key, data }) => [key, data.status]),
    [
      [SCENE_EVENTS.BOX_CONNECTION_CHANGED, 'offline'],
      [SCENE_EVENTS.BOX_CONNECTION_CHANGED, 'online'],
    ],
  );
  assert.deepEqual(gladys.fake.connectionStatus, { connected: true });
  assert.equal(changes.length, 3);
});

test('a wrong password is reported in the connection status', async () => {
  const { gladys, service } = setup({ password: 'wrong' });
  await service.pollAll();
  assert.deepEqual(gladys.fake.discoveredDevices, []);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /wrong user name or password/);
});

test('no address configured: the status says what to do', async () => {
  const gladys = createFakeGladys({ selector: 'obihai' });
  const service = new ObihaiService(gladys);
  service.configure(normalizeConfig({}));
  await service.pollAll();
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /Enter the address/);
});

test('several boxes are discovered together', async () => {
  const { gladys, service, boxes } = setup({ hosts: ['192.168.1.50', '192.168.1.51'] });
  boxes['192.168.1.51'].info = { serial: 'SECOND1', model: 'OBi200' };
  await service.pollAll();
  assert.deepEqual(gladys.fake.discoveredDevices.map((device) => device.external_id).sort(), [
    DEVICE,
    'ext:obihai:obi:SECOND1',
  ]);
});

test('reboot: admin account, unknown device, user account', async () => {
  const { service, box } = setup();
  await service.pollAll();
  const done = await service.reboot(DEVICE);
  assert.equal(done.ok, true);
  assert.equal(box.reboots, 1);
  assert.ok(done.message.en && done.message.fr && done.message.de && done.message.es);

  const unknown = await service.reboot('ext:obihai:obi:NOPE');
  assert.equal(unknown.ok, false);

  const readOnly = setup({ username: 'user', password: 'pw' });
  await readOnly.service.pollAll();
  const refused = await readOnly.service.reboot(DEVICE);
  assert.equal(refused.ok, false);
  assert.match(refused.message.en, /admin account/);
});

test('testConnection describes every box', async () => {
  const { service } = setup();
  const message = await service.testConnection();
  assert.match(message.en, /^OBi202 \(192\.168\.1\.50\): OK \(SP1 Registered/);
  assert.match(message.de, /PHONE1 On Hook/);
});

test('a new configuration keeps the state of the known boxes', async () => {
  const { gladys, service, box } = setup();
  await service.pollAll();
  service.configure(normalizeConfig({ hosts: '192.168.1.50', password: 'secret' }));
  box.ports = { PHONE1: { State: 'Ringing' }, PHONE2: { State: 'On Hook' } };
  await service.pollAll();
  assert.deepEqual(
    gladys.fake.sceneEvents.map((event) => event.key),
    [SCENE_EVENTS.INCOMING_CALL],
  );
});

test('publishAllStates re-sends every state of a created box', async () => {
  const { gladys, service } = setup();
  await service.pollAll();
  const before = gladys.fake.states.length;
  await service.publishAllStates(DEVICE);
  assert.equal(gladys.fake.states.length, before * 2);
});

test('start twice runs one loop, stop ends it', async () => {
  const gladys = createFakeGladys({ selector: 'obihai' });
  let reads = 0;
  const service = new ObihaiService(gladys, {
    createClient: () => ({
      readStatus: async () => {
        reads += 1;
        throw new Error('offline');
      },
    }),
  });
  service.configure(normalizeConfig({ hosts: '192.168.1.50', poll_frequency: 2 }));
  service.start();
  service.start();
  await new Promise((resolve) => setTimeout(resolve, 50));
  service.stop();
  assert.equal(reads, 1);
  assert.equal(service.timer, null);
});
