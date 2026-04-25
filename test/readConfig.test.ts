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
    autoApplyRemediation: ['mark_blocked'],
    autoReplenishBacklog: false
  });

  const config = readConfig(workspaceFolder('C:\\repo'));

  assert.equal(config.autonomyMode, 'supervised');
  assert.deepEqual(config.autoApplyRemediation, ['mark_blocked']);
  assert.equal(config.autoReplenishBacklog, false);
});

test('readConfig defaults to supervised safe posture', () => {
  const harness = vscodeTestHarness();
  harness.reset();

  const config = readConfig(workspaceFolder('C:\\repo'));

  assert.equal(config.autonomyMode, 'supervised');
  assert.equal(config.autoReplenishBacklog, false);
  assert.deepEqual(config.autoApplyRemediation, []);
  assert.equal(config.scmStrategy, 'none');
  assert.equal(config.scmPrOnParentDone, false);
  assert.equal(config.reasoningEffort, 'medium');
  assert.equal(config.sandboxMode, 'workspace-write');
  assert.equal(config.approvalMode, 'never');
  assert.equal(config.ralphIterationCap, 20);
  assert.equal(config.claudePermissionMode, 'default');
  assert.equal(config.copilotApprovalMode, 'allow-tools-only');
});

test('readConfig forces the autonomous shorthand overrides regardless of individual settings', () => {
  const harness = vscodeTestHarness();
  harness.setConfiguration({
    autonomyMode: 'autonomous',
    autoApplyRemediation: [],
    autoReplenishBacklog: false
  });

  const config = readConfig(workspaceFolder('C:\\repo'));

  assert.equal(config.autonomyMode, 'autonomous');
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

test('readConfig supports copilot-foundry and grouped Azure provider config', () => {
  const harness = vscodeTestHarness();
  harness.setConfiguration({
    cliProvider: 'copilot-foundry',
    copilotFoundry: {
      commandPath: 'copilot-foundry',
      approvalMode: 'interactive',
      maxAutopilotContinues: 123,
      providerType: 'azure',
      baseUrlOverride: 'https://override.example',
      model: 'gpt-5.4',
      azure: {
        resourceName: 'resource-1',
        deployment: 'gpt-5.4'
      },
      offline: false,
      requiredApiKeyEnvVar: 'COPILOT_FOUNDRY_API_KEY'
    },
    azureFoundry: {
      commandPath: 'azure-foundry-custom',
      endpointUrl: 'https://foundry.example',
      modelDeployment: 'gpt-4.1',
      apiVersion: '2025-01-01',
      auth: {
        mode: 'vscode-secret',
        tenantId: 'tenant-2',
        subscriptionId: 'subscription-2',
        apiKeyEnvVar: 'AZURE_FOUNDRY_API_KEY',
        secretStorageKey: 'azure-foundry.secret'
      }
    }
  });

  const config = readConfig(workspaceFolder('C:\\repo'));

  assert.equal(config.cliProvider, 'copilot-foundry');
  assert.equal(config.copilotFoundry.commandPath, 'copilot-foundry');
  assert.equal(config.copilotFoundry.approvalMode, 'interactive');
  assert.equal(config.copilotFoundry.maxAutopilotContinues, 123);
  assert.equal(config.copilotFoundry.providerType, 'azure');
  assert.equal(config.copilotFoundry.requiredApiKeyEnvVar, 'COPILOT_FOUNDRY_API_KEY');
  assert.equal(config.copilotFoundry.azure.resourceName, 'resource-1');
  assert.equal(config.copilotFoundry.model, 'gpt-5.4');

  assert.equal(config.azureFoundry.commandPath, 'azure-foundry-custom');
  assert.equal(config.azureFoundry.endpointUrl, 'https://foundry.example');
  assert.equal(config.azureFoundry.modelDeployment, 'gpt-4.1');
  assert.equal(config.azureFoundry.apiVersion, '2025-01-01');
  assert.equal(config.azureFoundry.auth.mode, 'vscode-secret');
  assert.equal(config.azureFoundry.auth.secretStorageKey, 'azure-foundry.secret');
  assert.equal('azureFoundryApiKey' in config, false);
});

test('readConfig returns grouped provider defaults when no settings are configured', () => {
  const harness = vscodeTestHarness();
  harness.reset();

  const config = readConfig(workspaceFolder('C:\\repo'));

  assert.equal(config.copilotFoundry.commandPath, 'copilot');
  assert.equal(config.copilotFoundry.approvalMode, 'allow-tools-only');
  assert.equal(config.copilotFoundry.maxAutopilotContinues, 200);
  assert.equal(config.copilotFoundry.providerType, 'azure');
  assert.equal(config.copilotFoundry.requiredApiKeyEnvVar, 'COPILOT_PROVIDER_API_KEY');
  assert.equal(config.azureFoundry.commandPath, 'azure-foundry');
  assert.equal(config.azureFoundry.apiVersion, '2024-12-01-preview');
  assert.equal(config.azureFoundry.auth.mode, 'az-bearer');
  assert.equal('azureFoundryApiKey' in config, false);
});

test('readConfig defaults agentRole to implementer when absent', () => {
  const harness = vscodeTestHarness();
  harness.reset();

  const config = readConfig(workspaceFolder('C:\\repo'));
  assert.equal(config.agentRole, 'implementer');
});

test('readConfig accepts planning-layer agentRole values', () => {
  const harness = vscodeTestHarness();

  for (const role of ['planner', 'implementer', 'reviewer'] as const) {
    harness.setConfiguration({ agentRole: role });
    const config = readConfig(workspaceFolder('C:\\repo'));
    assert.equal(config.agentRole, role);
    harness.reset();
  }
});

test('readConfig falls back to implementer for unknown agentRole', () => {
  const harness = vscodeTestHarness();
  harness.setConfiguration({ agentRole: 'unknown-value' });

  const config = readConfig(workspaceFolder('C:\\repo'));
  assert.equal(config.agentRole, 'implementer');
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

