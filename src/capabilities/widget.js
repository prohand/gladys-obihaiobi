// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+).
//
// "OBi box": the voice services (SIP accounts, OBiTALK), the phone ports, the
// uptime and the connection of one box, plus a Reboot button. The content is
// declarative: the core renders it with its own theme and translations.
// The widget setting `device` picks the box; empty, the first configured one.
// -----------------------------------------------------------------------------

import { createLogger, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { errorReason } from '../obihai/service.js';
import { localize, pick } from '../i18n.js';

const logger = createLogger({ name: 'widget' });

export const STATUS_WIDGET = 'obi_status';

export const WIDGET_ACTIONS = { REBOOT: 'reboot' };

const PORT_STATES = {
  on_hook: {
    value: { en: 'On hook', fr: 'Raccroché', de: 'Aufgelegt', es: 'Colgado' },
    color: WIDGET_COLORS.NEUTRAL,
  },
  off_hook: {
    value: { en: 'In call', fr: 'En ligne', de: 'Im Gespräch', es: 'En llamada' },
    color: WIDGET_COLORS.PRIMARY,
  },
  ringing: {
    value: { en: 'Ringing', fr: 'Sonne', de: 'Klingelt', es: 'Sonando' },
    color: WIDGET_COLORS.WARNING,
  },
  unknown: {
    value: { en: 'Unknown', fr: 'Inconnu', de: 'Unbekannt', es: 'Desconocido' },
    color: WIDGET_COLORS.NEUTRAL,
  },
};

/** "3 d 04:05" in every language. */
export function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = String(Math.floor((seconds % 86400) / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const unit = { en: 'd', fr: 'j', de: 'T', es: 'd' };
  return localize((language) => `${days} ${pick(language, unit)} ${hours}:${minutes}`);
}

function serviceColor(service) {
  if (service.registered) {
    return WIDGET_COLORS.SUCCESS;
  }
  return /not\s*config/i.test(service.status) ? WIDGET_COLORS.NEUTRAL : WIDGET_COLORS.DANGER;
}

/** The status widget content of one box view (see ObihaiService.boxes()). */
export function buildContent(view) {
  if (!view) {
    return {
      ttl_seconds: 60,
      components: [
        {
          type: 'text',
          variant: 'body',
          text: {
            en: 'No OBi box has answered yet: check the address in the integration configuration.',
            fr: "Aucun boîtier OBi n'a encore répondu : vérifiez l'adresse dans la configuration de l'intégration.",
            de: 'Noch keine OBi-Box hat geantwortet: Prüfe die Adresse in der Konfiguration der Integration.',
            es: 'Ningún equipo OBi ha respondido todavía: compruebe la dirección en la configuración de la integración.',
          },
        },
      ],
    };
  }

  const items = [];
  if (view.reachable === false) {
    items.push({
      label: { en: 'Connection', fr: 'Connexion', de: 'Verbindung', es: 'Conexión' },
      icon: 'wifi-off',
      value: localize((language) => pick(language, errorReason(view.error)).slice(0, 40)),
      color: WIDGET_COLORS.DANGER,
    });
  }
  const box = view.box;
  if (box) {
    for (const service of box.services) {
      items.push({
        label: service.label,
        icon: 'phone-call',
        value: (service.status || '?').slice(0, 40),
        color: view.reachable === false ? WIDGET_COLORS.NEUTRAL : serviceColor(service),
      });
    }
    for (const port of box.ports) {
      const state = PORT_STATES[port.state] ?? PORT_STATES.unknown;
      items.push({
        label: port.label,
        icon: 'phone',
        value: state.value,
        color: view.reachable === false ? WIDGET_COLORS.NEUTRAL : state.color,
      });
    }
    if (Number.isFinite(box.uptime) && view.reachable !== false) {
      items.push({
        label: { en: 'Uptime', fr: 'Allumé depuis', de: 'Laufzeit', es: 'Tiempo activo' },
        icon: 'clock',
        value: formatUptime(box.uptime),
        color: WIDGET_COLORS.NEUTRAL,
      });
    }
  }

  if (items.length === 0) {
    items.push({
      label: { en: 'Connection', fr: 'Connexion', de: 'Verbindung', es: 'Conexión' },
      icon: 'loader',
      value: { en: 'Waiting…', fr: 'En attente…', de: 'Warte…', es: 'Esperando…' },
      color: WIDGET_COLORS.NEUTRAL,
    });
  }

  const components = [
    { type: 'text', variant: 'heading', text: view.name.slice(0, 40) },
    { type: 'status', items: items.slice(0, 10) },
  ];
  if (view.deviceExternalId && view.reachable) {
    components.push({
      type: 'button',
      label: { en: 'Reboot', fr: 'Redémarrer', de: 'Neu starten', es: 'Reiniciar' },
      icon: 'refresh-cw',
      style: 'danger',
      action: {
        key: WIDGET_ACTIONS.REBOOT,
        params: { device: view.deviceExternalId },
        confirm: true,
      },
    });
  }
  return { ttl_seconds: 60, components };
}

/**
 * @param {import('../obihai/service.js').ObihaiService} service
 */
export function createWidgets(service) {
  return {
    [STATUS_WIDGET]: {
      async get(_gladys, { settings = {} } = {}) {
        logger.debug(`onWidgetGet <- ${STATUS_WIDGET}`);
        const views = service.boxes();
        const view = settings.device
          ? views.find((item) => item.deviceExternalId === settings.device)
          : (views.find((item) => item.box) ?? views[0]);
        return buildContent(view);
      },

      async action(_gladys, { actionKey, params }) {
        logger.info(`onWidgetAction <- ${STATUS_WIDGET}.${actionKey}`);
        if (actionKey === WIDGET_ACTIONS.REBOOT) {
          const { message } = await service.reboot(params.device);
          return message;
        }
        throw new Error(`Unknown widget action: ${actionKey}`);
      },
    },
  };
}

/** Ask the core to re-pull every widget now (rate-limited core-side). */
export function refreshWidgets(gladys) {
  gladys.requestWidgetRefresh(STATUS_WIDGET);
}
