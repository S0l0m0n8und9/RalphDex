import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import test from 'node:test';

const workspaceSettingsPath = path.join(__dirname, '..', '..', '.vscode', 'settings.json');

const DEPRECATED_RALPH_SETTINGS = [
  'ralphCodex.autoReloadOnControlPlaneChange'
] as const;

test('committed workspace settings do not include removed/deprecated ralphCodex keys', async () => {
  const raw = await fs.readFile(workspaceSettingsPath, 'utf8');
  const parsed = JSON.parse(raw) as Record<string, unknown>;

  for (const key of DEPRECATED_RALPH_SETTINGS) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(parsed, key),
      false,
      `${workspaceSettingsPath} must not contain deprecated setting key: ${key}`
    );
  }
});
