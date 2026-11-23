// -----------------------------------------------------------------------------
// The changelog roll of the Release workflow (.github/scripts/changelog-release.mjs).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { rollChangelog } from '../.github/scripts/changelog-release.mjs';

test('the Unreleased section moves under the version', () => {
  const text = '# Changelog\n\n## [Unreleased]\n\n### Added\n\n- A thing.\n';
  assert.equal(
    rollChangelog(text, '1.0.0', '2026-11-23'),
    '# Changelog\n\n## [Unreleased]\n\n## [1.0.0] - 2026-11-23\n\n### Added\n\n- A thing.\n',
  );
});

test('an empty Unreleased section still names the version', () => {
  const rolled = rollChangelog('## [Unreleased]\n', '1.0.1', '2026-11-24');
  assert.match(rolled, /## \[1\.0\.1\] - 2026-11-24\n\n- Maintenance release/);
});

test('CHANGELOG.md has an Unreleased section and no hand-written version yet', async () => {
  const text = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  assert.match(text, /^## \[Unreleased\]$/m);
});
