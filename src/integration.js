// -----------------------------------------------------------------------------
// Wiring of the SDK to the OBi service. Kept out of index.js so the tests can
// run the whole integration against the fake Gladys of the SDK.
//
// Every handler is registered here, BEFORE connect():
//   - discovery, device creation;
//   - the Configuration screen actions (manifest `actions`);
//   - the scene actions (manifest `scene_actions`) and the widget (`widgets`);
//   - the config updates and the connection lifecycle.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig } from './config.js';
import { ObihaiService } from './obihai/service.js';
import { createSceneActions } from './capabilities/scenes.js';
import { createWidgets, refreshWidgets } from './capabilities/widget.js';

const logger = createLogger({ name: 'integration' });

/**
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
 * @param {{ createClient?: Function, now?: () => number }} [options] injected in tests
 * @returns {{ service: ObihaiService, applyConfig: (raw: object) => void }}
 */
export function setupIntegration(gladys, options = {}) {
  const service = new ObihaiService(gladys, options);

  // Every poll that changed something nudges the dashboards.
  service.onChange(() => refreshWidgets(gladys));

  function applyConfig(raw) {
    const config = normalizeConfig(raw);
    logger.info(
      `Configuration: ${config.hosts.length} box(es), user "${config.username}", every ${config.poll_frequency} s`,
    );
    service.configure(config);
  }

  // --- Discovery ------------------------------------------------------------
  gladys.onScanRequest(async () => {
    logger.info('onScanRequest -> reading the boxes');
    await service.pollAll();
    await gladys.publishDiscoveredDevices(service.discoveredDevices());
  });

  // Right after the user adds a box, send all its states at once (the
  // changed-only publication would wait for a change).
  gladys.onDeviceCreated(async (device) => {
    await service.publishAllStates(device.external_id);
  });

  // --- Configuration screen buttons (manifest `actions`) ----------------------
  gladys.onAction('test_connection', async () => {
    logger.info('Action test_connection');
    return service.testConnection();
  });

  gladys.onAction('reboot', async (fields) => {
    logger.info(`Action reboot <- ${fields.device}`);
    const { message } = await service.reboot(fields.device);
    return message;
  });

  // --- Scene actions (manifest `scene_actions`) -------------------------------
  for (const [key, handler] of Object.entries(createSceneActions(service))) {
    gladys.onSceneAction(key, handler);
  }

  // --- Dashboard widget (manifest `widgets`) ----------------------------------
  for (const [key, widget] of Object.entries(createWidgets(service))) {
    gladys.onWidgetGet(key, (request) => widget.get(gladys, request));
    gladys.onWidgetAction(key, (actionKey, params, { settings } = {}) =>
      widget.action(gladys, { actionKey, params, settings }),
    );
  }

  // --- Configuration updated by the user --------------------------------------
  gladys.onConfigUpdated(async (newConfig) => {
    logger.info('onConfigUpdated -> new configuration received');
    applyConfig(newConfig);
    service.start();
    refreshWidgets(gladys);
  });

  // --- Connection lifecycle ---------------------------------------------------
  gladys.on('connected', async () => {
    try {
      applyConfig(await gladys.getConfig());
      // The first poll publishes the devices, their states, the transports
      // and the connection status.
      service.start();
      refreshWidgets(gladys);
    } catch (err) {
      logger.error('Post-connection initialization failed', err);
      await gladys
        .setConnectionStatus(false, {
          en: 'Initialization failed, check the integration logs.',
          fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
          de: 'Die Initialisierung ist fehlgeschlagen, prüfe die Logs der Integration.',
          es: 'La inicialización ha fallado, consulte los registros de la integración.',
        })
        .catch(() => {});
    }
  });

  gladys.on('disconnected', () => {
    service.stop();
  });

  return { service, applyConfig };
}
