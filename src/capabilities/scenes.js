// -----------------------------------------------------------------------------
// Scene triggers and scene actions (manifest `scene_triggers` / `scene_actions`,
// Gladys 5.1+).
//
// Triggers need no handler: the service fires them with publishSceneEvent when
// it sees the change (src/obihai/service.js). Every event carries `device` (the
// external id of the box), so the "Box" field of the trigger filters on it.
//
// Actions are registered per key in index.js; each one receives the RESOLVED
// fields and returns the declared outputs (scalars only). A box that does not
// answer is an output, not a failure: the scene author gates on `reachable`.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { SCENE_EVENTS } from '../obihai/service.js';

const logger = createLogger({ name: 'scenes' });

/** Keys of the manifest `scene_triggers`, and the data keys each one sends. */
export const SCENE_TRIGGERS = {
  [SCENE_EVENTS.INCOMING_CALL]: ['device', 'device_name', 'port', 'caller_number', 'caller_name'],
  [SCENE_EVENTS.CALL_ENDED]: ['device', 'device_name', 'port', 'duration_seconds'],
  [SCENE_EVENTS.REGISTRATION_CHANGED]: [
    'device',
    'device_name',
    'service',
    'status',
    'status_text',
  ],
  [SCENE_EVENTS.BOX_CONNECTION_CHANGED]: ['device', 'device_name', 'host', 'status', 'reason'],
};

/** Keys of the manifest `scene_actions`. */
export const SCENE_ACTION_KEYS = {
  REBOOT: 'reboot_box',
  GET_STATUS: 'get_box_status',
};

/**
 * @param {import('../obihai/service.js').ObihaiService} service
 * @returns {Record<string, (fields: Record<string, unknown>) => Promise<object>>}
 */
export function createSceneActions(service) {
  return {
    async [SCENE_ACTION_KEYS.REBOOT](fields) {
      logger.info(`Scene action ${SCENE_ACTION_KEYS.REBOOT} <- ${fields.device}`);
      const { ok, message } = await service.reboot(fields.device);
      return { rebooted: ok, message: message.en };
    },

    async [SCENE_ACTION_KEYS.GET_STATUS](fields) {
      logger.info(`Scene action ${SCENE_ACTION_KEYS.GET_STATUS} <- ${fields.device}`);
      const entry = service.findByDevice(fields.device);
      if (!entry || !entry.reachable) {
        return {
          reachable: false,
          registered: false,
          status: '',
          in_call: false,
          ringing: false,
        };
      }
      const wanted = typeof fields.service === 'string' && fields.service ? fields.service : 'sp1';
      const found = entry.box.services.find((item) => item.id === wanted);
      return {
        reachable: true,
        registered: Boolean(found?.registered),
        status: found?.status ?? '',
        in_call: entry.box.ports.some((port) => port.state === 'off_hook'),
        ringing: entry.box.ports.some((port) => port.state === 'ringing'),
      };
    },
  };
}
