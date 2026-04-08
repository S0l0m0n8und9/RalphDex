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

test('readConfig reads scmPrOnParentDone and falls back to false', () => {
  const harness = vscodeTestHarness();
  harness.setConfiguration({
    scmPrOnParentDone: true
  });

  const configured = readConfig(workspaceFolder('C:\\repo'));
  assert.equal(configured.scmPrOnParentDone, true);

  harness.reset();
  const fallback = readConfig(workspaceFolder('C:\\repo'));
  assert.equal(fallback.scmPrOnParentDone, false);
});

test('readConfig reads watchdogStaleTtlMs and falls back to 24 hours', () => {
  const harness = vscodeTestHarness();
  harness.setConfiguration({
    watchdogStaleTtlMs: 3600000
  });

  const configured = readConfig(workspaceFolder('C:\\repo'));
  assert.equal(configured.watchdogStaleTtlMs, 3600000);

  harness.reset();
  const fallback = readConfig(workspaceFolder('C:\\repo'));
  assert.equal(fallback.watchdogStaleTtlMs, 24 * 60 * 60 * 1000);
});

test('readConfig supports Copilot provider defaults and overrides', () => {
  const harness = vscodeTestHarness();
  harness.setConfiguration({
    cliProvider: 'copilot',
    copilotCommandPath: 'copilot-custom',
    copilotApprovalMode: 'interactive'
  });

  const config = readConfig(workspaceFolder('C:\\repo'));

  assert.equal(config.cliProvider, 'copilot');
  assert.equal(config.copilotCommandPath, 'copilot-custom');
  assert.equal(config.copilotApprovalMode, 'interactive');
  assert.equal(config.openSidebarCommandId, 'none');
  assert.equal(config.newChatCommandId, 'github.copilot.cli.newSession');
});

test('readConfig applies enableModelTiering workspace override to modelTiering.enabled', () => {
  const harness = vscodeTestHarness();
  harness.setConfiguration({
    enableModelTiering: true,
    modelTiering: {
      simple: { model: 'claude-haiku-4-5' },
      medium: { model: 'claude-sonnet-4-6' },
      complex: { model: 'claude-opus-4-6' }
    }
  });

  const config = readConfig(workspaceFolder('C:\\repo'));

  assert.equal(config.modelTiering.enabled, true);

  harness.setConfiguration({
    enableModelTiering: false,
    modelTiering: {
      simple: { model: 'claude-haiku-4-5' },
      medium: { model: 'claude-sonnet-4-6' },
      complex: { model: 'claude-opus-4-6' }
    }
  });

  const disabled = readConfig(workspaceFolder('C:\\repo'));
  assert.equal(disabled.modelTiering.enabled, false);
});

test('readConfig does not override modelTiering.enabled when enableModelTiering is absent', () => {
  const harness = vscodeTestHarness();
  harness.setConfiguration({
    // enableModelTiering intentionally absent — should not override modelTiering.enabled
    modelTiering: {
      enabled: true,
      simple: { model: 'claude-haiku-4-5' },
      medium: { model: 'claude-sonnet-4-6' },
      complex: { model: 'claude-opus-4-6' }
    }
  });

  const config = readConfig(workspaceFolder('C:\\repo'));

  assert.equal(
    config.modelTiering.enabled,
    true,
    'modelTiering.enabled should not be overridden when enableModelTiering is absent'
  );
});
