// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user in Gladys from the `config_schema` of
// `gladys-assistant-integration.json`. The SDK fetches it (`getConfig()`) and
// notifies every change (`onConfigUpdated()`). This module provides the
// defaults and normalizes the received object, so the rest of the code never
// deals with `undefined` or with numbers typed as strings.
// -----------------------------------------------------------------------------

// Defaults: they MUST stay consistent with the `default` values declared in
// the `config_schema` of the manifest (test/manifest.test.js checks it).
export const DEFAULT_CONFIG = {
  hosts: '',
  username: 'admin',
  password: '',
  // Seconds between two reads of the boxes. Short enough to catch an incoming
  // call while the phone rings (a ring cycle lasts about 6 s).
  poll_frequency: 5,
};

export const POLL_FREQUENCY_MIN = 2;
export const POLL_FREQUENCY_MAX = 3600;

/**
 * The addresses of the boxes, from the `hosts` field: one or several,
 * separated by commas, semicolons, spaces or new lines. Duplicates dropped.
 *
 * @param {unknown} value
 * @returns {string[]}
 */
export function parseHosts(value) {
  if (typeof value !== 'string') {
    return [];
  }
  const hosts = value
    .split(/[\s,;]+/)
    .map((host) => host.trim())
    .filter(Boolean);
  return [...new Set(hosts)];
}

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const pollFrequency = Number(raw.poll_frequency ?? DEFAULT_CONFIG.poll_frequency);
  const username = String(raw.username ?? '').trim() || DEFAULT_CONFIG.username;
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    hosts: parseHosts(raw.hosts ?? DEFAULT_CONFIG.hosts),
    username,
    password: typeof raw.password === 'string' ? raw.password : DEFAULT_CONFIG.password,
    poll_frequency: Number.isFinite(pollFrequency)
      ? Math.min(POLL_FREQUENCY_MAX, Math.max(POLL_FREQUENCY_MIN, Math.round(pollFrequency)))
      : DEFAULT_CONFIG.poll_frequency,
  };
}
