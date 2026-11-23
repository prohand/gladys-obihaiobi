// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The store indexer validates the manifest, but nothing there knows which
// handlers the code registers: these tests keep both sides in sync, and catch
// the store rules that are easy to miss before a release.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { DEFAULT_CONFIG } from '../src/config.js';
import { createSceneActions, SCENE_TRIGGERS } from '../src/capabilities/scenes.js';
import { createWidgets } from '../src/capabilities/widget.js';
import { LANGUAGES } from '../src/i18n.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const manifest = JSON.parse(await read('gladys-assistant-integration.json'));
const pkg = JSON.parse(await read('package.json'));
const integrationSource = await read('src/integration.js');

test('every manifest action is registered', () => {
  for (const action of manifest.actions) {
    assert.match(
      integrationSource,
      new RegExp(`onAction\\('${action.key}'`),
      `manifest action "${action.key}" has no handler`,
    );
  }
});

test('scene actions: same keys in the manifest and the code', () => {
  assert.deepEqual(
    manifest.scene_actions.map((action) => action.key).sort(),
    Object.keys(createSceneActions({})).sort(),
  );
});

test('scene triggers: same keys, and every event key is declared', () => {
  assert.deepEqual(
    manifest.scene_triggers.map((trigger) => trigger.key).sort(),
    Object.keys(SCENE_TRIGGERS).sort(),
  );
  for (const trigger of manifest.scene_triggers) {
    const declared = [
      ...(trigger.fields ?? []).map((field) => field.key),
      ...(trigger.variables ?? []).map((variable) => variable.key),
    ];
    const sent = SCENE_TRIGGERS[trigger.key];
    for (const key of sent) {
      assert.ok(declared.includes(key), `${trigger.key}: data key "${key}" is not declared`);
    }
    for (const field of trigger.fields ?? []) {
      assert.ok(sent.includes(field.key), `${trigger.key}: filter "${field.key}" is never sent`);
    }
  }
});

test('widgets: same keys in the manifest and the code', () => {
  assert.deepEqual(
    manifest.widgets.map((widget) => widget.key).sort(),
    Object.keys(createWidgets({})).sort(),
  );
});

// The store schema is the admission authority: a field type outside this list
// gets the integration rejected by the indexer.
const FIELD_TYPES = ['string', 'number', 'boolean', 'select', 'multi_select', 'secret', 'section'];

test('every field uses a type the store accepts', () => {
  const allFields = [
    ...manifest.config_schema,
    ...manifest.actions.flatMap((action) => action.fields ?? []),
    ...manifest.widgets.flatMap((widget) => widget.settings ?? []),
    ...manifest.scene_triggers.flatMap((trigger) => trigger.fields ?? []),
    ...manifest.scene_actions.flatMap((action) => action.fields ?? []),
  ];
  for (const field of allFields) {
    assert.ok(FIELD_TYPES.includes(field.type), `field "${field.key}": type "${field.type}"`);
    assert.match(field.key, /^[a-z0-9_]+$/, `field key "${field.key}" must be snake_case`);
    if (field.placeholder !== undefined) {
      assert.ok(['string', 'number', 'secret'].includes(field.type));
    }
    if (field.min !== undefined || field.max !== undefined) {
      assert.equal(field.type, 'number', `field "${field.key}": min/max are number-only`);
    }
    if (field.source !== undefined) {
      assert.equal(field.default, undefined, `field "${field.key}": no default with a source`);
    }
  }
  // Scene trigger filters cannot be booleans, widget settings cannot be secrets.
  for (const trigger of manifest.scene_triggers) {
    for (const field of trigger.fields ?? []) {
      assert.notEqual(field.type, 'boolean');
      assert.notEqual(field.type, 'secret');
    }
  }
});

test('every text is written in English, French, German and Spanish', () => {
  const missing = [];
  const walk = (value, path) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${path}[${index}]`));
    } else if (value && typeof value === 'object') {
      if (typeof value.en === 'string') {
        for (const language of LANGUAGES) {
          if (typeof value[language] !== 'string' || value[language].trim() === '') {
            missing.push(`${path}.${language}`);
          }
        }
        return;
      }
      for (const [key, child] of Object.entries(value)) {
        walk(child, `${path}.${key}`);
      }
    }
  };
  walk(manifest, 'manifest');
  assert.deepEqual(missing, []);
});

test('the catalog texts fit what the store allows', () => {
  assert.ok(manifest.name.length >= 3 && manifest.name.length <= 30);
  for (const [language, text] of Object.entries(manifest.description)) {
    assert.ok(
      text.length >= 10 && text.length <= 100,
      `description.${language} must be 10-100 characters, got ${text.length}`,
    );
  }
  for (const widget of manifest.widgets) {
    for (const text of Object.values(widget.label)) {
      assert.ok(text.length >= 3 && text.length <= 30, `widget label "${text}"`);
    }
    for (const text of Object.values(widget.description ?? {})) {
      assert.ok(text.length <= 100, `widget description "${text}"`);
    }
  }
});

test('version, image and Gladys range agree', () => {
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.docker_image, `ghcr.io/prohand/gladys-obihaiobi:${pkg.version}`);
  // keywords and countries need 5.3.0; widgets and scenes 5.1.0.
  assert.equal(manifest.gladys_version, '>=5.3.0');
});

test('local transport, catalog categories, keywords and countries', () => {
  assert.deepEqual(manifest.transports, ['local']);
  const vocabulary = [
    'climate',
    'lighting',
    'energy',
    'security',
    'multimedia',
    'appliances',
    'environment',
    'protocols',
    'network',
    'notifications',
    'assistants',
    'services',
  ];
  assert.ok(manifest.categories.length >= 1 && manifest.categories.length <= 3);
  for (const category of manifest.categories) {
    assert.ok(vocabulary.includes(category), category);
  }
  const keywords = manifest.keywords.map((keyword) => keyword.trim().toLowerCase());
  assert.ok(keywords.length >= 1 && keywords.length <= 10);
  assert.equal(new Set(keywords).size, keywords.length);
  assert.ok(manifest.countries.length >= 1 && manifest.countries.length <= 20);
  assert.equal(new Set(manifest.countries).size, manifest.countries.length);
  for (const country of manifest.countries) {
    assert.match(country, /^[A-Z]{2}$/);
  }
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  for (const field of manifest.config_schema) {
    if (field.default !== undefined) {
      assert.equal(DEFAULT_CONFIG[field.key], field.default, `DEFAULT_CONFIG.${field.key}`);
    }
  }
  const password = manifest.config_schema.find((field) => field.key === 'password');
  assert.equal(password.type, 'secret');
});

test('the user documentation exists in every language', async () => {
  for (const language of LANGUAGES) {
    const text = await read(`docs/${language}.md`);
    assert.ok(text.length >= 300, `docs/${language}.md is too short`);
  }
});

test('the cover is an 800×534 PNG of 150 KB at most', async () => {
  const path = new URL('../cover.png', import.meta.url);
  const bytes = await readFile(path);
  assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
  assert.equal(bytes.readUInt32BE(16), 800);
  assert.equal(bytes.readUInt32BE(20), 534);
  assert.ok((await stat(path)).size <= 150 * 1024);
  assert.match(
    manifest.cover_image,
    /^https:\/\/raw\.githubusercontent\.com\/prohand\/gladys-obihaiobi\//,
  );
});
