// -----------------------------------------------------------------------------
// Readers of the OBi status pages.
//
// The OBi web interface serves its status pages as small XML documents:
//
//   <status>
//     <model name="OBi202" reboot_req="false" ...>
//     <object name="SP1 Service Status">
//       <parameter name="Status"><value current="Registered (server=...)"/></parameter>
//       <parameter name="CallState"><value current="0 Active Calls"/></parameter>
//     </object>
//     ...
//
//   - DI_S_.xml          device info: product, firmware, uptime, SPn / OBiTALK services;
//   - PI_FXS_1_Stats.xml port status: PHONE1, PHONE2 (and LINE on the OBi110).
//
// The exact object and parameter names move a little between models and
// firmwares, so the readers are tolerant: they parse every object into a map,
// then look the values up by name with fallbacks. No XML dependency: the
// documents are flat and machine-written, a few regular expressions are enough.
// -----------------------------------------------------------------------------

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** Decode the XML entities of an attribute value. */
export function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_match, entity) => {
    const lower = entity.toLowerCase();
    if (lower.startsWith('#x')) {
      return String.fromCodePoint(parseInt(lower.slice(2), 16));
    }
    if (lower.startsWith('#')) {
      return String.fromCodePoint(parseInt(lower.slice(1), 10));
    }
    return ENTITIES[lower];
  });
}

/** The attributes of a tag, e.g. ` name="x" current="y"` → { name: 'x', current: 'y' }. */
function parseAttributes(text) {
  const attributes = {};
  for (const [, key, double, single] of text.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    attributes[key] = decodeEntities(double ?? single);
  }
  return attributes;
}

/**
 * Parse an OBi status XML document.
 *
 * @param {string} xml
 * @returns {{ model: Record<string, string>, objects: Record<string, Record<string, string>> }}
 *   `objects[objectName][parameterName]` is the `current` value of the parameter
 */
export function parseStatusXml(xml) {
  if (typeof xml !== 'string') {
    throw new TypeError('parseStatusXml: expected a string');
  }
  const modelTag = xml.match(/<model\b([^>]*)>/i);
  const model = modelTag ? parseAttributes(modelTag[1]) : {};
  const objects = {};
  for (const [, attributes, body] of xml.matchAll(/<object\b([^>]*)>([\s\S]*?)<\/object>/gi)) {
    const { name } = parseAttributes(attributes);
    if (!name) {
      continue;
    }
    const parameters = (objects[name] = objects[name] ?? {});
    const re = /<parameter\b([^>]*)>([\s\S]*?)<\/parameter>/gi;
    for (const [, parameterAttributes, parameterBody] of body.matchAll(re)) {
      const parameterName = parseAttributes(parameterAttributes).name;
      const valueTag = parameterBody.match(/<value\b([^>]*?)\/?>/i);
      if (!parameterName || !valueTag) {
        continue;
      }
      const value = parseAttributes(valueTag[1]);
      parameters[parameterName] = (value.current ?? value.default ?? '').trim();
    }
  }
  return { model, objects };
}

/** First parameter of `parameters` whose name matches one of the patterns. */
function findParameter(parameters = {}, ...patterns) {
  for (const pattern of patterns) {
    const key = Object.keys(parameters).find((name) => pattern.test(name));
    if (key !== undefined && parameters[key] !== '') {
      return parameters[key];
    }
  }
  return undefined;
}

/** First value, across every object, of a parameter matching one of the patterns. */
function findAnywhere(objects, ...patterns) {
  for (const pattern of patterns) {
    for (const parameters of Object.values(objects)) {
      const value = findParameter(parameters, pattern);
      if (value !== undefined) {
        return value;
      }
    }
  }
  return undefined;
}

/**
 * The status text without its details: "Registered (server=x; expire in 60s)"
 * → "Registered". Gladys shows it as is, so it stays short.
 */
export function shortStatus(text) {
  if (typeof text !== 'string') {
    return '';
  }
  const short = text.split('(')[0].replace(/\s+/g, ' ').trim();
  return (short || text.trim()).slice(0, 100);
}

/** Is this service status a working one? "Registered…" for SIP, "Normal…" for OBiTALK. */
export function isRegistered(text) {
  return /^\s*(registered|normal|connected)\b/i.test(text ?? '');
}

/**
 * The uptime in seconds, from the OBi formats: "2 Days 3:04:05 (12)",
 * "0 Days 0:12:30", "3:04:05" or a bare number of seconds.
 *
 * @returns {number|null}
 */
export function parseUptime(text) {
  if (typeof text !== 'string') {
    return null;
  }
  const clock = text.match(/(?:(\d+)\s*days?\s*,?\s*)?(\d+):(\d{1,2}):(\d{1,2})/i);
  if (clock) {
    const [, days = '0', hours, minutes, seconds] = clock;
    return Number(days) * 86400 + Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
  }
  const bare = text.trim().match(/^(\d+)\s*(?:s|sec|seconds)?$/i);
  return bare ? Number(bare[1]) : null;
}

/** "PHONE1 Port Status" → "phone1"; "SP1 Service Status" → "sp1". */
export function slug(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Normalized port state: 'ringing' | 'off_hook' | 'on_hook' | 'unknown'. */
export function portState(text) {
  if (/ring/i.test(text ?? '')) {
    return 'ringing';
  }
  if (/off[\s-]?hook/i.test(text ?? '')) {
    return 'off_hook';
  }
  if (/on[\s-]?hook/i.test(text ?? '')) {
    return 'on_hook';
  }
  return 'unknown';
}

/**
 * Split the caller id of a port: `"John Doe" 5551234567` → { name, number }.
 * @returns {{ name: string, number: string }}
 */
export function parseCaller(text) {
  if (typeof text !== 'string' || !text.trim()) {
    return { name: '', number: '' };
  }
  const quoted = text.match(/"([^"]*)"/);
  const name = quoted ? quoted[1].trim() : '';
  const rest = quoted ? text.replace(quoted[0], ' ') : text;
  const number = (rest.match(/\+?[\d*#][\d\s*#.-]*/) ?? [''])[0].replace(/[\s.-]/g, '');
  return { name: name.slice(0, 100), number: number.slice(0, 40) };
}

/** Number of active calls in "1 Active Calls" / "2 active calls". */
function activeCalls(text) {
  const match = (text ?? '').match(/(\d+)\s*active/i);
  return match ? Number(match[1]) : 0;
}

/**
 * The box as Gladys sees it, from the parsed status pages.
 *
 * @param {ReturnType<typeof parseStatusXml>} deviceInfo parsed DI_S_.xml
 * @param {ReturnType<typeof parseStatusXml>|null} [portInfo] parsed PI_FXS_1_Stats.xml
 * @returns {{
 *   serial: string|null, mac: string|null, model: string, firmware: string, hardware: string,
 *   uptime: number|null, rebootRequired: boolean,
 *   services: { id: string, label: string, status: string, registered: boolean, activeCalls: number }[],
 *   ports: { id: string, label: string, status: string, state: string, caller: { name: string, number: string } }[],
 * }}
 */
export function extractBox(deviceInfo, portInfo = null) {
  const objects = { ...(portInfo?.objects ?? {}), ...deviceInfo.objects };
  const product = deviceInfo.objects['Product Information'] ?? {};

  const serial = findParameter(product, /^serial/i) ?? findAnywhere(objects, /^serial/i) ?? null;
  const mac = findParameter(product, /mac/i) ?? findAnywhere(objects, /^mac/i) ?? null;
  const model =
    findParameter(product, /^model/i) ?? deviceInfo.model.name ?? deviceInfo.model.model ?? 'OBi';
  const firmware = findParameter(product, /^software/i, /firmware/i) ?? '';
  const hardware = findParameter(product, /^hardware/i) ?? '';
  const uptime = parseUptime(
    findParameter(product, /up\s*time/i) ?? findAnywhere(objects, /up\s*time/i) ?? null,
  );

  const services = [];
  for (const [name, parameters] of Object.entries(objects)) {
    const sip = name.match(/^SP(\d+)\s+Service Status$/i);
    const obitalk = /^OBiTALK\s+Service Status$/i.test(name);
    if (!sip && !obitalk) {
      continue;
    }
    const status = findParameter(parameters, /^status$/i) ?? '';
    services.push({
      id: sip ? `sp${sip[1]}` : 'obitalk',
      label: sip ? `SP${sip[1]}` : 'OBiTALK',
      status: shortStatus(status),
      registered: isRegistered(status),
      activeCalls: activeCalls(findParameter(parameters, /call\s*state/i)),
    });
  }
  // SP1, SP2… first, in order, OBiTALK last.
  services.sort((a, b) => serviceRank(a.id) - serviceRank(b.id));

  const ports = [];
  for (const [name, parameters] of Object.entries(objects)) {
    const match = name.match(/^(.+?)\s+Port Status$/i);
    if (!match) {
      continue;
    }
    const status = findParameter(parameters, /^state$/i, /^status$/i) ?? '';
    ports.push({
      id: slug(match[1]),
      label: match[1].trim(),
      status: shortStatus(status),
      state: portState(status),
      caller: parseCaller(findParameter(parameters, /caller/i)),
    });
  }
  ports.sort((a, b) => a.id.localeCompare(b.id));

  return {
    serial: serial ? serial.trim() : null,
    mac: mac ? mac.replace(/[^0-9a-f]/gi, '').toUpperCase() || null : null,
    model: model.trim(),
    firmware: shortStatus(firmware) || firmware,
    hardware,
    uptime,
    rebootRequired: /^true$/i.test(deviceInfo.model.reboot_req ?? ''),
    services,
    ports,
  };
}

function serviceRank(id) {
  return id === 'obitalk' ? Number.MAX_SAFE_INTEGER : Number(id.slice(2));
}
