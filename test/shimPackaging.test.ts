import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const PACKAGE_ROOT = path.resolve(__dirname, '..', '..');

// The CLI shim is a developer/automation surface, not part of the shipped
// extension. It must stay excluded from the VSIX unless that policy changes
// deliberately. This guard fails if the exclusion is dropped from .vscodeignore.
test('.vscodeignore excludes the compiled shim from the VSIX', async () => {
  const ignore = await fs.readFile(path.join(PACKAGE_ROOT, '.vscodeignore'), 'utf8');
  const patterns = ignore
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));

  assert.ok(
    patterns.includes('out/shim/**'),
    'expected .vscodeignore to exclude the shim via "out/shim/**"'
  );
});

test('shim source is never imported by the extension entrypoint', async () => {
  // The extension activation path must not pull the shim into the bundle, which
  // would defeat the VSIX exclusion. The shim depends on the extension modules,
  // not the other way around.
  const extension = await fs.readFile(path.join(PACKAGE_ROOT, 'src', 'extension.ts'), 'utf8');
  assert.doesNotMatch(extension, /['"][^'"]*shim[^'"]*['"]/, 'extension.ts must not import shim modules');
});
