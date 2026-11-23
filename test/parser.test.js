// -----------------------------------------------------------------------------
// Readers of the OBi status pages.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeEntities,
  extractBox,
  isRegistered,
  parseCaller,
  parseStatusXml,
  parseUptime,
  portState,
  shortStatus,
} from '../src/obihai/parser.js';
import { deviceInfoXml, portsXml } from './helpers/fakeObi.js';

test('parseStatusXml maps every object and parameter to its current value', () => {
  const parsed = parseStatusXml(deviceInfoXml());
  assert.equal(parsed.model.name, 'OBi202');
  assert.equal(parsed.objects['Product Information'].SerialNumber, '88E2ABC12345');
  assert.equal(
    parsed.objects['SP1 Service Status'].Status,
    'Registered (server=sip.example.net:5060; expire in 3540s)',
  );
});

test('parseStatusXml copes with attribute order, single quotes and entities', () => {
  const xml = `<status><object name='SP1 Service Status'>
    <parameter name="Status"><value current='Registered &amp; ok' type="string"></value></parameter>
  </object></status>`;
  assert.equal(parseStatusXml(xml).objects['SP1 Service Status'].Status, 'Registered & ok');
  assert.equal(decodeEntities('&lt;a&gt; &#65;&#x42;'), '<a> AB');
  assert.throws(() => parseStatusXml(undefined), TypeError);
});

test('extractBox describes the box from both pages', () => {
  const box = extractBox(parseStatusXml(deviceInfoXml()), parseStatusXml(portsXml()));
  assert.equal(box.serial, '88E2ABC12345');
  assert.equal(box.mac, '9CADEF123456');
  assert.equal(box.model, 'OBi202');
  assert.equal(box.firmware, '3.2.2');
  assert.equal(box.uptime, 86400 + 2 * 3600 + 3 * 60 + 4);
  assert.equal(box.rebootRequired, false);
  assert.deepEqual(
    box.services.map(({ id, status, registered }) => [id, status, registered]),
    [
      ['sp1', 'Registered', true],
      ['sp2', 'Service Not Configured', false],
      ['obitalk', 'Normal', true],
    ],
  );
  assert.deepEqual(
    box.ports.map(({ id, label, state }) => [id, label, state]),
    [
      ['phone1', 'PHONE1', 'on_hook'],
      ['phone2', 'PHONE2', 'on_hook'],
    ],
  );
});

test('extractBox works without the port page', () => {
  const box = extractBox(parseStatusXml(deviceInfoXml({ model: 'OBi200' })));
  assert.equal(box.model, 'OBi200');
  assert.deepEqual(box.ports, []);
});

test('services are sorted SP1, SP2… then OBiTALK', () => {
  const box = extractBox(
    parseStatusXml(
      deviceInfoXml({
        services: {
          'OBiTALK Service Status': { Status: 'Normal' },
          'SP4 Service Status': { Status: 'Backing Off' },
          'SP1 Service Status': { Status: 'Registered' },
        },
      }),
    ),
  );
  assert.deepEqual(
    box.services.map((service) => service.id),
    ['sp1', 'sp4', 'obitalk'],
  );
});

test('helpers: status, registration, uptime, port state, caller id', () => {
  assert.equal(shortStatus('Backing Off (30 seconds)'), 'Backing Off');
  assert.equal(shortStatus(undefined), '');
  assert.equal(isRegistered('Registered (server=x)'), true);
  assert.equal(isRegistered('Backing Off'), false);
  assert.equal(isRegistered('Normal (User Mode)'), true);
  assert.equal(parseUptime('0 Days 0:12:30'), 750);
  assert.equal(parseUptime('3:04:05'), 11045);
  assert.equal(parseUptime('42'), 42);
  assert.equal(parseUptime('soon'), null);
  assert.equal(portState('Ringing'), 'ringing');
  assert.equal(portState('Off Hook'), 'off_hook');
  assert.equal(portState('On Hook'), 'on_hook');
  assert.equal(portState('Disabled'), 'unknown');
  assert.deepEqual(parseCaller('"John Doe" 555-123 4567'), {
    name: 'John Doe',
    number: '5551234567',
  });
  assert.deepEqual(parseCaller('+33612345678'), { name: '', number: '+33612345678' });
  assert.deepEqual(parseCaller(''), { name: '', number: '' });
});
