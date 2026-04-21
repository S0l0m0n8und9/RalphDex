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

test('readConfig supports copilot-foundry and grouped Azure provider config', () => {
  const harness = vscodeTestHarness();
  harness.setConfiguration({
    cliProvider: 'copilot-foundry',
    copilotFoundry: {
      commandPath: 'copilot-foundry',
      approvalMode: 'interactive',
      maxAutopilotContinues: 123,
      auth: {
        mode: 'env-api-key',
        tenantId: 'tenant-1',
        subscriptionId: 'subscription-1',
        apiKeyEnvVar: 'COPILOT_FOUNDRY_API_KEY',
        secretStorageKey: 'copilot-foundry.secret'
      },
      azure: {
        resourceGroup: 'rg-1',
        resourceName: 'resource-1',
        baseUrlOverride: 'https://override.example'
      },
      model: {
        deployment: 'gpt-5.4',
        wireApi: 'responses'
      }
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
  assert.equal(config.copilotFoundry.auth.mode, 'env-api-key');
  assert.equal(config.copilotFoundry.auth.apiKeyEnvVar, 'COPILOT_FOUNDRY_API_KEY');
  assert.equal(config.copilotFoundry.azure.resourceName, 'resource-1');
  assert.equal(config.copilotFoundry.model.deployment, 'gpt-5.4');

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
  assert.equal(config.copilotFoundry.approvalMode, 'allow-all');
  assert.equal(config.copilotFoundry.maxAutopilotContinues, 200);
  assert.equal(config.copilotFoundry.auth.mode, 'az-bearer');
  assert.equal(config.copilotFoundry.model.wireApi, 'responses');
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

test('readConfig simple preset seeds baseline values when no individual overrides are set', () => {
  const harness = vscodeTestHarness();
  harness.setConfiguration({ operatorMode: 'simple' });

  const config = readConfig(workspaceFolder('C:\\repo'));

  assert.equal(config.operatorMode, 'simple');
  assert.equal(config.autonomyMode, 'supervised');
  assert.equal(config.agentCount, 1);
  assert.equal(config.preferredHandoffMode, 'ideCommand');
  assert.equal(config.modelTiering.enabled, false);
  assert.equal(config.ralphIterationCap, 20);
  assert.equal(config.stopOnHumanReviewNeeded, true);
  assert.equal(config.scmStrategy, 'none');
  assert.equal(config.memoryStrategy, 'verbatim');
  assert.equal(config.autoReplenishBacklog, false);
});

test('readConfig multi-agent preset with explicit agentCount override respects the override', () => {
  const harness = vscodeTestHarness();
  harness.setConfiguration({ operatorMode: 'multi-agent', agentCount: 1 });

  const config = readConfig(workspaceFolder('C:\\repo'));

  assert.equal(config.operatorMode, 'multi-agent');
  // explicit agentCount wins over preset value of 3
  assert.equal(config.agentCount, 1);
  // remaining preset values apply
  assert.equal(config.preferredHandoffMode, 'cliExec');
  assert.equal(config.autonomyMode, 'autonomous');
  assert.equal(config.scmStrategy, 'branch-per-task');
  assert.equal(config.memoryStrategy, 'sliding-window');
  assert.equal(config.autoReviewOnParentDone, true);
  assert.equal(config.autoWatchdogOnStall, true);
  assert.equal(config.modelTiering.enabled, true);
});

test('readConfig with no operatorMode does not inject preset values', () => {
  const harness = vscodeTestHarness();
  harness.setConfiguration({});

  const config = readConfig(workspaceFolder('C:\\repo'));

  assert.equal(config.operatorMode, undefined);
  assert.equal(config.autonomyMode, 'supervised');
  assert.equal(config.agentCount, 1);
  assert.equal(config.preferredHandoffMode, 'ideCommand');
  assert.equal(config.scmStrategy, 'none');
  assert.equal(config.memoryStrategy, 'verbatim');
  assert.equal(config.autoWatchdogOnStall, false);
  assert.equal(config.autoReviewOnParentDone, false);
});
