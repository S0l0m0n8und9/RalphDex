import test from 'node:test';
import assert from 'node:assert/strict';
import { readConfig } from '../src/config/readConfig';
import { buildSettingsSurfaceSnapshot } from '../src/config/settingsSurface';

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
