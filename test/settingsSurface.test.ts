import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_CONFIG } from '../src/config/defaults';
import {
  buildSettingsDiscoveryState,
  buildSettingsSurfaceSnapshot,
  collectNewSettingsNotice,
  getSettingsSurfaceMetadata
} from '../src/config/settingsSurface';

test('getSettingsSurfaceMetadata exposes the planned settings-panel sections with manifest-backed defaults', () => {
  const metadata = getSettingsSurfaceMetadata();
  const sectionIds = new Set(metadata.sections.map((section) => section.id));

  assert.deepEqual(
    Array.from(sectionIds),
    ['operator-mode', 'provider', 'memory', 'planning', 'copilot-foundry', 'azure-foundry']
  );

  const operatorMode = metadata.entries.find((entry) => entry.key === 'operatorMode');
  assert.ok(operatorMode, 'operatorMode entry should exist');
  assert.equal(operatorMode?.manifestKey, 'ralphCodex.operatorMode');
  assert.equal(operatorMode?.defaultValue, DEFAULT_CONFIG.operatorMode);
  assert.ok(operatorMode?.description.includes('Preset that seeds multiple Ralph settings'));

  const planningMode = metadata.entries.find((entry) => entry.key === 'planningPass.mode');
  assert.ok(planningMode, 'planningPass.mode entry should exist');
  assert.deepEqual(planningMode?.options, ['dedicated', 'inline']);

  const copilotFoundryMode = metadata.entries.find((entry) => entry.key === 'copilotFoundry.auth.mode');
  assert.ok(copilotFoundryMode, 'copilotFoundry.auth.mode entry should exist');
  assert.deepEqual(copilotFoundryMode?.options, ['az-bearer', 'env-api-key', 'vscode-secret']);
  assert.equal(copilotFoundryMode?.defaultValue, DEFAULT_CONFIG.copilotFoundry.auth.mode);

  const azureEndpoint = metadata.entries.find((entry) => entry.key === 'azureFoundry.endpointUrl');
  assert.ok(azureEndpoint, 'azureFoundry.endpointUrl entry should exist');
  assert.equal(azureEndpoint?.defaultValue, DEFAULT_CONFIG.azureFoundry.endpointUrl);

  assert.equal(metadata.entries.some((entry) => entry.key === 'azureFoundryApiKey'), false);
});

test('buildSettingsSurfaceSnapshot projects config values into grouped sections and marks NEW settings', () => {
  const snapshot = buildSettingsSurfaceSnapshot(
    {
      ...DEFAULT_CONFIG,
      cliProvider: 'copilot-foundry',
      operatorMode: 'multi-agent',
      memoryStrategy: 'summary',
      memorySummaryThreshold: 42,
      planningPass: { enabled: true, mode: 'dedicated' },
      copilotFoundry: {
        ...DEFAULT_CONFIG.copilotFoundry,
        commandPath: 'copilot-foundry',
        azure: {
          ...DEFAULT_CONFIG.copilotFoundry.azure,
          resourceName: 'resource-1',
          baseUrlOverride: 'https://foundry.example/openai/v1'
        },
        model: {
          ...DEFAULT_CONFIG.copilotFoundry.model,
          deployment: 'gpt-5.4'
        }
      },
      azureFoundry: {
        ...DEFAULT_CONFIG.azureFoundry,
        endpointUrl: 'https://foundry.example',
        modelDeployment: 'gpt-4.1'
      }
    },
    {
      newSettingKeys: ['planningPass.enabled', 'planningPass.mode']
    }
  );

  assert.equal(snapshot.sections.length, 6);
  const copilotSection = snapshot.sections.find((section) => section.id === 'copilot-foundry');
  assert.ok(copilotSection, 'copilot section should exist');
  assert.equal(
    copilotSection?.entries.find((entry) => entry.key === 'copilotFoundry.model.deployment')?.value,
    'gpt-5.4'
  );

  const planningSection = snapshot.sections.find((section) => section.id === 'planning');
  assert.ok(planningSection, 'planning section should exist');
  assert.equal(planningSection?.hasNewSettings, true);

  const planningEnabled = planningSection?.entries.find((entry) => entry.key === 'planningPass.enabled');
  assert.ok(planningEnabled, 'planningPass.enabled entry should exist');
  assert.equal(planningEnabled?.value, true);
  assert.equal(planningEnabled?.isNew, true);

  const azureSection = snapshot.sections.find((section) => section.id === 'azure-foundry');
  assert.ok(azureSection, 'azure section should exist');
  assert.equal(
    azureSection?.entries.find((entry) => entry.key === 'azureFoundry.modelDeployment')?.value,
    'gpt-4.1'
  );
});

test('collectNewSettingsNotice reports only unseen settings and returns the first deep-link target', () => {
  const metadata = getSettingsSurfaceMetadata();

  const previousState = buildSettingsDiscoveryState([
    'operatorMode',
    'autonomyMode',
    'agentCount',
    'preferredHandoffMode'
  ]);
  const result = collectNewSettingsNotice(metadata, previousState);

  assert.ok(result, 'new settings should be reported when seen keys are incomplete');
  assert.deepEqual(result?.newSettingKeys, metadata.entries.slice(4).map((entry) => entry.key));
  assert.equal(result?.focusSettingKey, metadata.entries[4]?.key);
  assert.match(result?.message ?? '', /^Ralphdex: \d+ new settings available$/);
});

test('collectNewSettingsNotice returns null when every surfaced setting was already seen', () => {
  const metadata = getSettingsSurfaceMetadata();
  const seenAll = buildSettingsDiscoveryState(metadata.entries.map((entry) => entry.key));

  assert.equal(collectNewSettingsNotice(metadata, seenAll), null);
});
