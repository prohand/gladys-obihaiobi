// -----------------------------------------------------------------------------
// The OBi service: reads every configured box on a timer and turns what changed
// into Gladys calls.
//
//   - device states (text, uptime)        -> publishChangedStates
//   - a new box, a new port or service    -> publishDiscoveredDevices
//   - box reachable or not                -> publishTransports (local / unreachable)
//   - all boxes fine or not               -> setConnectionStatus
//   - a phone rings, a call ends, a SIP
//     account registers or drops, a box
//     goes offline or comes back          -> publishSceneEvent (scene triggers)
//
// The service owns no Gladys handler: index.js wires them, the capabilities
// (src/capabilities/) read the service through its public methods.
// -----------------------------------------------------------------------------

import { createLogger, DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';
import { ERROR_CODES, ObihaiClient, ObihaiError } from './client.js';
import {
  boxIds,
  buildDevice,
  buildStates,
  deviceName,
  platformId,
  shapeSignature,
} from '../devices/obiBox.js';
import { localize, pick } from '../i18n.js';

const logger = createLogger({ name: 'obihai' });

/** Keys of the manifest `scene_triggers`: stored by users, never renamed. */
export const SCENE_EVENTS = {
  INCOMING_CALL: 'incoming_call',
  CALL_ENDED: 'call_ended',
  REGISTRATION_CHANGED: 'registration_changed',
  BOX_CONNECTION_CHANGED: 'box_connection_changed',
};

// A state that did not change is re-sent every 30 minutes all the same, so
// Gladys shows a fresh "last seen" on a quiet box.
const STATE_HEARTBEAT_MS = 30 * 60 * 1000;

/** Why a box could not be read, in every language. */
export function errorReason(error) {
  const status = error?.status;
  switch (error?.code) {
    case ERROR_CODES.AUTH:
      return {
        en: 'wrong user name or password',
        fr: "nom d'utilisateur ou mot de passe incorrect",
        de: 'falscher Benutzername oder falsches Passwort',
        es: 'usuario o contraseña incorrectos',
      };
    case ERROR_CODES.HTTP:
      return {
        en: `unexpected answer (HTTP ${status})`,
        fr: `réponse inattendue (HTTP ${status})`,
        de: `unerwartete Antwort (HTTP ${status})`,
        es: `respuesta inesperada (HTTP ${status})`,
      };
    case ERROR_CODES.INVALID:
      return {
        en: 'this address does not answer like an OBi box',
        fr: 'cette adresse ne répond pas comme un boîtier OBi',
        de: 'diese Adresse antwortet nicht wie eine OBi-Box',
        es: 'esta dirección no responde como un equipo OBi',
      };
    default:
      return {
        en: 'unreachable (check the address and that the box is on)',
        fr: "injoignable (vérifiez l'adresse et que le boîtier est allumé)",
        de: 'nicht erreichbar (Adresse prüfen und ob die Box eingeschaltet ist)',
        es: 'inaccesible (compruebe la dirección y que el equipo esté encendido)',
      };
  }
}

export class ObihaiService {
  /**
   * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
   * @param {object} [options]
   * @param {(options: object) => ObihaiClient} [options.createClient] injected in tests
   * @param {() => number} [options.now] injected in tests
   */
  constructor(
    gladys,
    { createClient = (options) => new ObihaiClient(options), now = Date.now } = {},
  ) {
    this.gladys = gladys;
    this.createClient = createClient;
    this.now = now;
    this.config = null;
    /** @type {BoxEntry[]} */
    this.entries = [];
    this.timer = null;
    this.generation = 0;
    this.running = null;
    this.lastConnectionStatus = null;
    this.lastTransports = null;
    this.listeners = new Set();
  }

  /**
   * Apply a (new) configuration. The boxes already known keep their state, so a
   * config change does not replay the scene triggers.
   * @param {ReturnType<import('../config.js').normalizeConfig>} config
   */
  configure(config) {
    this.config = config;
    const previous = new Map(this.entries.map((entry) => [entry.host, entry]));
    this.entries = config.hosts.map((host) => {
      const client = this.createClient({
        host,
        username: config.username,
        password: config.password,
      });
      const entry = previous.get(host);
      if (entry) {
        entry.client = client;
        return entry;
      }
      return newEntry(host, client);
    });
    // Force a fresh publication of the derived statuses.
    this.lastConnectionStatus = null;
    this.lastTransports = null;
  }

  /** Called after every poll that changed something (the widget refreshes on it). */
  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // --- Polling --------------------------------------------------------------

  /** Poll now, then every `poll_frequency` seconds, until stop(). */
  start() {
    this.stop();
    // A restart (config update, reconnection) while a poll is in flight must
    // not leave two loops running: each loop only reschedules itself while it
    // is still the current generation.
    const generation = ++this.generation;
    const loop = async () => {
      await this.pollAll();
      if (generation === this.generation) {
        this.timer = setTimeout(loop, this.config.poll_frequency * 1000);
      }
    };
    this.timer = setTimeout(loop, 0);
  }

  stop() {
    this.generation += 1;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * Read every box once and publish what changed. Never throws: a box that
   * fails is reported, the others go on. Overlapping calls share one run.
   */
  pollAll() {
    if (!this.running) {
      this.running = this.runPoll().finally(() => {
        this.running = null;
      });
    }
    return this.running;
  }

  async runPoll() {
    const results = await Promise.all(this.entries.map((entry) => this.pollEntry(entry)));
    await this.safely('publishTransports', () => this.publishTransports());
    await this.safely('setConnectionStatus', () => this.publishConnectionStatus());
    if (results.some((changed) => changed)) {
      for (const listener of this.listeners) {
        listener();
      }
    }
  }

  /**
   * Read one box and publish what changed.
   * @param {BoxEntry} entry
   * @returns {Promise<boolean>} something changed (the widget refreshes)
   */
  async pollEntry(entry) {
    let box;
    try {
      box = await entry.client.readStatus();
      if (!platformId(box)) {
        throw new ObihaiError(
          ERROR_CODES.INVALID,
          'No serial number nor MAC address in the status',
        );
      }
    } catch (err) {
      return this.markUnreachable(entry, err);
    }

    const wasReachable = entry.reachable;
    const previous = entry.box;
    const signature = shapeSignature(box, entry.host);
    const discoveryChanged = signature !== entry.signature;
    entry.box = box;
    entry.signature = signature;
    entry.reachable = true;
    entry.error = null;
    entry.lastSeen = this.now();

    // The device must exist (discovered) before its states mean anything, so
    // a new shape is published first.
    if (discoveryChanged) {
      await this.safely('publishDiscoveredDevices', () =>
        this.gladys.publishDiscoveredDevices(this.discoveredDevices()),
      );
    }
    await this.safely('publishChangedStates', () =>
      this.gladys.publishChangedStates(buildStates(this.gladys, box), {
        heartbeat: STATE_HEARTBEAT_MS,
      }),
    );

    let changed = discoveryChanged || wasReachable !== true;
    if (wasReachable === false) {
      await this.fireConnectionChanged(entry, true);
    }
    if (previous) {
      changed = (await this.fireBoxEvents(entry, previous, box)) || changed;
      changed = changed || JSON.stringify(previous) !== JSON.stringify(box);
    } else {
      // First read: start counting the calls already in progress from now.
      for (const port of box.ports) {
        if (port.state === 'off_hook') {
          entry.offHookSince.set(port.id, this.now());
        }
      }
    }
    return changed;
  }

  async markUnreachable(entry, err) {
    const wasReachable = entry.reachable;
    const sameError = entry.error?.code === err.code && entry.error?.message === err.message;
    entry.reachable = false;
    entry.error =
      err instanceof ObihaiError
        ? err
        : new ObihaiError(ERROR_CODES.UNREACHABLE, String(err?.message ?? err));
    if (!sameError || wasReachable !== false) {
      logger.warn(`OBi box ${entry.host}: ${entry.error.message}`);
    }
    if (wasReachable === true) {
      await this.fireConnectionChanged(entry, false);
    }
    // A box that stops answering ends its calls: nobody can tell when.
    entry.offHookSince.clear();
    return wasReachable !== false;
  }

  // --- Scene triggers -------------------------------------------------------

  /** Compare two reads of a box and fire the scene events. @returns {Promise<boolean>} fired any */
  async fireBoxEvents(entry, previous, box) {
    const device = boxIds(this.gladys, box).device;
    const name = deviceName(box, entry.host);
    const before = new Map(previous.ports.map((port) => [port.id, port]));
    let fired = false;

    for (const port of box.ports) {
      const old = before.get(port.id);
      if (!old) {
        continue;
      }
      if (port.state === 'ringing' && old.state !== 'ringing') {
        fired = true;
        await this.fire(SCENE_EVENTS.INCOMING_CALL, {
          device,
          device_name: name,
          port: port.id,
          caller_number: port.caller.number,
          caller_name: port.caller.name,
        });
      }
      if (port.state === 'off_hook' && old.state !== 'off_hook') {
        entry.offHookSince.set(port.id, this.now());
      }
      if (old.state === 'off_hook' && port.state !== 'off_hook') {
        fired = true;
        const since = entry.offHookSince.get(port.id);
        entry.offHookSince.delete(port.id);
        await this.fire(SCENE_EVENTS.CALL_ENDED, {
          device,
          device_name: name,
          port: port.id,
          duration_seconds: since === undefined ? 0 : Math.round((this.now() - since) / 1000),
        });
      }
    }

    const services = new Map(previous.services.map((service) => [service.id, service]));
    for (const service of box.services) {
      const old = services.get(service.id);
      if (!old || old.registered === service.registered) {
        continue;
      }
      fired = true;
      await this.fire(SCENE_EVENTS.REGISTRATION_CHANGED, {
        device,
        device_name: name,
        service: service.id,
        status: service.registered ? 'registered' : 'not_registered',
        status_text: service.status,
      });
    }
    return fired;
  }

  async fireConnectionChanged(entry, online) {
    if (!entry.box) {
      return;
    }
    await this.fire(SCENE_EVENTS.BOX_CONNECTION_CHANGED, {
      device: boxIds(this.gladys, entry.box).device,
      device_name: deviceName(entry.box, entry.host),
      host: entry.host,
      status: online ? 'online' : 'offline',
      reason: online ? '' : pick('en', errorReason(entry.error)),
    });
  }

  async fire(key, data) {
    logger.info(`Scene event ${key} <- ${data.device_name}`);
    await this.safely(`publishSceneEvent(${key})`, () => this.gladys.publishSceneEvent(key, data));
  }

  // --- What Gladys shows ----------------------------------------------------

  /** The discovered devices: every box read at least once since the start. */
  discoveredDevices() {
    return this.entries
      .filter((entry) => entry.box)
      .map((entry) => buildDevice(this.gladys, entry.box, entry.host));
  }

  async publishTransports() {
    const transports = this.entries
      .filter((entry) => entry.box)
      .map((entry) => ({
        external_id: boxIds(this.gladys, entry.box).device,
        transport: entry.reachable ? DEVICE_TRANSPORTS.LOCAL : DEVICE_TRANSPORTS.UNREACHABLE,
      }));
    const key = JSON.stringify(transports);
    if (transports.length === 0 || key === this.lastTransports) {
      return;
    }
    await this.gladys.publishTransports(transports);
    this.lastTransports = key;
  }

  /** The connection status of the Configuration screen. */
  connectionStatus() {
    if (this.entries.length === 0) {
      return {
        connected: false,
        message: {
          en: 'Enter the address of your OBi box in the configuration.',
          fr: "Renseignez l'adresse de votre boîtier OBi dans la configuration.",
          de: 'Gib die Adresse deiner OBi-Box in der Konfiguration ein.',
          es: 'Introduzca la dirección de su equipo OBi en la configuración.',
        },
      };
    }
    const failing = this.entries.filter((entry) => entry.reachable === false);
    if (failing.length === 0) {
      return { connected: true };
    }
    return {
      connected: false,
      message: localize((language) =>
        failing
          .map((entry) => `${entry.host}: ${pick(language, errorReason(entry.error))}`)
          .join(' · '),
      ),
    };
  }

  async publishConnectionStatus() {
    // Wait for the first answer of every box: "unknown" is not "failed".
    if (this.entries.some((entry) => entry.reachable === null)) {
      return;
    }
    const status = this.connectionStatus();
    const key = JSON.stringify(status);
    if (key === this.lastConnectionStatus) {
      return;
    }
    await this.gladys.setConnectionStatus(status.connected, status.message);
    this.lastConnectionStatus = key;
  }

  /**
   * Publish every state of a box, changed or not: right after the user adds
   * the device, publishChangedStates would otherwise wait for a change (or its
   * 30-minute heartbeat) before Gladys shows anything.
   */
  async publishAllStates(deviceExternalId) {
    const entry = this.findByDevice(deviceExternalId);
    if (entry?.reachable) {
      await this.gladys.publishStates(buildStates(this.gladys, entry.box));
    }
  }

  // --- Lookups and commands -------------------------------------------------

  /** The entry of a device external id, null when no box read so far has it. */
  findByDevice(deviceExternalId) {
    return (
      this.entries.find(
        (entry) => entry.box && boxIds(this.gladys, entry.box).device === deviceExternalId,
      ) ?? null
    );
  }

  /** A read-only view of the boxes, for the widget and the scene actions. */
  boxes() {
    return this.entries.map((entry) => ({
      host: entry.host,
      reachable: entry.reachable,
      error: entry.error,
      box: entry.box,
      deviceExternalId: entry.box ? boxIds(this.gladys, entry.box).device : null,
      name: entry.box ? deviceName(entry.box, entry.host) : entry.host,
    }));
  }

  /**
   * Reboot a box.
   * @returns {Promise<{ ok: boolean, message: Record<string, string> }>}
   */
  async reboot(deviceExternalId) {
    const entry = this.findByDevice(deviceExternalId);
    if (!entry) {
      return {
        ok: false,
        message: {
          en: 'Unknown OBi box: it has not answered since the integration started.',
          fr: "Boîtier OBi inconnu : il n'a pas répondu depuis le démarrage de l'intégration.",
          de: 'Unbekannte OBi-Box: Sie hat seit dem Start der Integration nicht geantwortet.',
          es: 'Equipo OBi desconocido: no ha respondido desde que se inició la integración.',
        },
      };
    }
    const name = deviceName(entry.box, entry.host);
    try {
      await entry.client.reboot();
      logger.info(`Reboot requested for ${name}`);
      return {
        ok: true,
        message: {
          en: `${name} is rebooting: back in about a minute.`,
          fr: `${name} redémarre : de retour dans une minute environ.`,
          de: `${name} startet neu: in etwa einer Minute wieder da.`,
          es: `${name} se está reiniciando: vuelve en un minuto aproximadamente.`,
        },
      };
    } catch (err) {
      logger.warn(`Reboot of ${name} failed: ${err.message}`);
      const reason =
        err.code === ERROR_CODES.AUTH && entry.client.username === 'user'
          ? {
              en: 'rebooting needs the admin account',
              fr: 'le redémarrage demande le compte admin',
              de: 'der Neustart braucht das Admin-Konto',
              es: 'el reinicio necesita la cuenta admin',
            }
          : errorReason(err);
      return {
        ok: false,
        message: {
          en: `Reboot of ${name} failed: ${reason.en}.`,
          fr: `Échec du redémarrage de ${name} : ${reason.fr}.`,
          de: `Neustart von ${name} fehlgeschlagen: ${reason.de}.`,
          es: `Error al reiniciar ${name}: ${reason.es}.`,
        },
      };
    }
  }

  /**
   * Read every box now and describe the result: the answer of the
   * "Test the connection" button.
   * @returns {Promise<Record<string, string>>}
   */
  async testConnection() {
    if (this.entries.length === 0) {
      return this.connectionStatus().message;
    }
    await this.pollAll();
    return localize((language) =>
      this.entries
        .map((entry) => {
          if (!entry.reachable) {
            return `${entry.host}: ${pick(language, errorReason(entry.error))}`;
          }
          const parts = [
            ...entry.box.services.map((service) => `${service.label} ${service.status}`),
            ...entry.box.ports.map((port) => `${port.label} ${port.status}`),
          ];
          const details = parts.length ? ` (${parts.join(', ')})` : '';
          return `${deviceName(entry.box, entry.host)}: OK${details}`;
        })
        .join(' · '),
    );
  }

  /** Log and swallow: one failed call to Gladys must not stop the polling. */
  async safely(what, fn) {
    try {
      await fn();
    } catch (err) {
      logger.error(`${what} failed`, err);
    }
  }
}

/**
 * @typedef {object} BoxEntry
 * @property {string} host
 * @property {ObihaiClient} client
 * @property {ReturnType<import('./parser.js').extractBox>|null} box last successful read
 * @property {boolean|null} reachable null until the first answer
 * @property {ObihaiError|null} error last failure
 * @property {string|null} signature shape of the published device
 * @property {Map<string, number>} offHookSince port id -> when it went off hook
 * @property {number|null} lastSeen
 */
function newEntry(host, client) {
  return {
    host,
    client,
    box: null,
    reachable: null,
    error: null,
    signature: null,
    offHookSince: new Map(),
    lastSeen: null,
  };
}
