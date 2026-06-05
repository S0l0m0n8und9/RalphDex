import test from 'node:test';
import assert from 'node:assert/strict';
import { readConfig } from '../src/config/readConfig';
import { buildSettingsSurfaceSnapshot } from '../src/config/settingsSurface';
import { AUTONOMY_MANAGED_KEYS } from '../src/config/autonomyManagedKeys';

interface VscodeStubHarness {
  reset(): void;
  setWorkspaceFolders(folders: unknown[]): void;
  setConfiguration(config: Record<string, unknown>): void;
}
const harness = (globalThis as unknown as { __RALPH_VSCODE_STUB__: VscodeStubHarness }).__RALPH_VSCODE_STUB__;
const wsFolder = { uri: { fsPath: '/ws' }, name: 'ws', index: 0 } as unknown as Parameters<typeof readConfig>[0];

// Documents why the Settings panel cannot directly untick autoReplenishBacklog /
// autoApplyRemediation under the default autonomous mode: readConfig force-derives
// them, so a stored false resolves back to true. The panel disables + annotates
// these (see SettingsPanel autonomyManagedNote) rather than presenting a control
// whose edits silently revert.
test('autonomous mode forces autoReplenishBacklog true even when stored false', () => {
  harness.reset();
  harness.setWorkspaceFolders([wsFolder]);
  harness.setConfiguration({ autoReplenishBacklog: false });

  const cfg = readConfig(wsFolder);
  assert.equal(cfg.autoReplenishBacklog, true);

  const surface = buildSettingsSurfaceSnapshot(cfg);
  const entry = surface.sections.flatMap((s) => s.entries).find((e) => e.key === 'autoReplenishBacklog');
  assert.equal(entry?.value, true);
});

test('supervised mode honors a stored autoReplenishBacklog=false', () => {
  harness.reset();
  harness.setWorkspaceFolders([wsFolder]);
  harness.setConfiguration({ autonomyMode: 'supervised', autoReplenishBacklog: false });

  assert.equal(readConfig(wsFolder).autoReplenishBacklog, false);
});

// Locks the Settings panel's AUTONOMY_MANAGED_KEYS list to readConfig's actual
// behavior: every listed key must genuinely be force-overridden under autonomous
// mode. Removing an override in readConfig without updating the shared list (or
// listing a key that isn't actually managed) fails here.
test('every autonomy-managed key is force-overridden under autonomous mode', () => {
  for (const key of AUTONOMY_MANAGED_KEYS) {
    harness.reset();
    harness.setWorkspaceFolders([wsFolder]);
    const storedOff = key === 'autoApplyRemediation' ? [] : false;
    harness.setConfiguration({ [key]: storedOff });

    const resolved = (readConfig(wsFolder) as unknown as Record<string, unknown>)[key];
    assert.notDeepEqual(resolved, storedOff, `${key} should be force-overridden under autonomous mode`);
  }
});
