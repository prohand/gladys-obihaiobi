// -----------------------------------------------------------------------------
// The Gladys device of an OBi box.
//
// One device per box, keyed on its serial number (its MAC address when the
// firmware hides the serial): the external id never changes, whatever the IP
// address or the name of the box. Its features follow what the box reports:
//
//   - one text feature per voice service (SP1…SP4, OBiTALK): "Registered",
//     "Backing Off", "Service Not Configured"…;
//   - one text feature per phone port (PHONE1, PHONE2, LINE): "On Hook",
//     "Off Hook", "Ringing";
//   - the uptime (seconds) and the firmware version.
//
// Everything is read-only: the only command, the reboot, is an action (manifest
// action, scene action and widget button), not a device feature.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';

export const DEVICE_TYPE = 'obi';

export const FEATURES = {
  UPTIME: 'uptime',
  FIRMWARE: 'firmware',
  service: (id) => `${id}-status`,
  port: (id) => `${id}-state`,
};

// A 32-bit signed integer: the largest uptime Gladys stores without a doubt
// (68 years).
const MAX_UPTIME = 2147483647;

/** The stable platform id of a box: its serial, or its MAC address. */
export function platformId(box) {
  // Only the characters an external id carries safely; never changed once
  // published (Gladys keys the device, its history and its scenes on it).
  const id = (box.serial || box.mac || '').replace(/[^A-Za-z0-9_-]/g, '');
  return id || null;
}

/** The external ids of a box (device + features). */
export function boxIds(gladys, box) {
  return gladys.externalIds(DEVICE_TYPE, platformId(box));
}

/** Name shown in Gladys: "OBi202 (192.168.1.50)". */
export function deviceName(box, host) {
  return host ? `${box.model} (${host})` : box.model;
}

function textFeature(name, externalId) {
  return {
    name,
    external_id: externalId,
    category: DEVICE_FEATURE_CATEGORIES.TEXT,
    type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
    min: 0,
    max: 0,
    read_only: true,
    has_feedback: false,
    keep_history: false,
  };
}

/**
 * The discovered device of a box.
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
 * @param {ReturnType<import('../obihai/parser.js').extractBox>} box
 * @param {string} host address the box was reached at
 */
export function buildDevice(gladys, box, host) {
  const ids = boxIds(gladys, box);
  const features = [
    ...box.services.map((service) =>
      textFeature(`${service.label} status`, ids.feature(FEATURES.service(service.id))),
    ),
    ...box.ports.map((port) =>
      textFeature(`${port.label} state`, ids.feature(FEATURES.port(port.id))),
    ),
    {
      name: 'Uptime',
      external_id: ids.feature(FEATURES.UPTIME),
      category: DEVICE_FEATURE_CATEGORIES.DURATION,
      type: DEVICE_FEATURE_TYPES.DURATION.INTEGER,
      unit: DEVICE_FEATURE_UNITS.SECONDS,
      min: 0,
      max: MAX_UPTIME,
      read_only: true,
      has_feedback: false,
      keep_history: false,
    },
    textFeature('Firmware', ids.feature(FEATURES.FIRMWARE)),
  ];
  return {
    name: deviceName(box, host),
    external_id: ids.device,
    model: box.model,
    features,
  };
}

/**
 * The states of a box, ready for publishChangedStates.
 * @returns {{ device_feature_external_id: string, state?: number, text?: string }[]}
 */
export function buildStates(gladys, box) {
  const ids = boxIds(gladys, box);
  const states = [
    ...box.services.map((service) => ({
      device_feature_external_id: ids.feature(FEATURES.service(service.id)),
      text: service.status || 'Unknown',
    })),
    ...box.ports.map((port) => ({
      device_feature_external_id: ids.feature(FEATURES.port(port.id)),
      text: port.status || 'Unknown',
    })),
  ];
  if (Number.isFinite(box.uptime)) {
    states.push({
      device_feature_external_id: ids.feature(FEATURES.UPTIME),
      state: Math.min(MAX_UPTIME, Math.max(0, box.uptime)),
    });
  }
  if (box.firmware) {
    states.push({ device_feature_external_id: ids.feature(FEATURES.FIRMWARE), text: box.firmware });
  }
  return states;
}

/** What the device looks like: a change means the discovery must be re-published. */
export function shapeSignature(box, host) {
  return JSON.stringify([
    box.model,
    host,
    box.services.map((service) => service.id),
    box.ports.map((port) => port.id),
  ]);
}
