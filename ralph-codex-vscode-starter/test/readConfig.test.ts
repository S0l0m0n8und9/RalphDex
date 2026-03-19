import assert from 'node:assert/strict';
import test from 'node:test';
import * as vscode from 'vscode';
import { readConfig } from '../src/config/readConfig';
import { vscodeTestHarness } from './support/vscodeTestHarness';

function workspaceFolder(rootPath: string): vscode.WorkspaceFolder {
  return {
    uri: vscode.Uri.file(rootPath),
    name: 'workspace',
    index: 0
  };
}

test.beforeEach(() => {
  const harness = vscodeTestHarness();
  harness.reset();
});

test('readConfig preserves individually configured autonomy settings in supervised mode', () => {
  const harness = vscodeTestHarness();
  harness.setConfiguration({
    autonomyMode: 'supervised',
    autoReloadOnControlPlaneChange: true,
    autoApplyRemediation: ['mark_blocked'],
    autoReplenishBacklog: false
  });

  const config = readConfig(workspaceFolder('C:\\repo'));

  assert.equal(config.autonomyMode, 'supervised');
  assert.equal(config.autoReloadOnControlPlaneChange, true);
  assert.deepEqual(config.autoApplyRemediation, ['mark_blocked']);
  assert.equal(config.autoReplenishBacklog, false);
});

test('readConfig forces the autonomous shorthand overrides regardless of individual settings', () => {
  const harness = vscodeTestHarness();
  harness.setConfiguration({
    autonomyMode: 'autonomous',
    autoReloadOnControlPlaneChange: false,
    autoApplyRemediation: [],
    autoReplenishBacklog: false
  });

  const config = readConfig(workspaceFolder('C:\\repo'));

  assert.equal(config.autonomyMode, 'autonomous');
  assert.equal(config.autoReloadOnControlPlaneChange, true);
  assert.deepEqual(config.autoApplyRemediation, ['decompose_task', 'mark_blocked']);
  assert.equal(config.autoReplenishBacklog, true);
});

test('readConfig reads scmStrategy and falls back to none', () => {
  const harness = vscodeTestHarness();
  harness.setConfiguration({
    scmStrategy: 'commit-on-done'
  });

  const configured = readConfig(workspaceFolder('C:\\repo'));
  assert.equal(configured.scmStrategy, 'commit-on-done');

  harness.reset();
  const fallback = readConfig(workspaceFolder('C:\\repo'));
  assert.equal(fallback.scmStrategy, 'none');
});
