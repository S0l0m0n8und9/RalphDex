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
    ['operator-mode', 'provider', 'memory', 'planning', 'azure-foundry']
  );

  const operatorMode = metadata.entries.find((entry) => entry.key === 'operatorMode');
  assert.ok(operatorMode, 'operatorMode entry should exist');
  assert.equal(operatorMode?.manifestKey, 'ralphCodex.operatorMode');
  assert.equal(operatorMode?.defaultValue, DEFAULT_CONFIG.operatorMode);
  assert.ok(operatorMode?.description.includes('Operator mode preset'));

  const planningMode = metadata.entries.find((entry) => entry.key === 'planningPass.mode');
  assert.ok(planningMode, 'planningPass.mode entry should exist');
  assert.deepEqual(planningMode?.options, ['dedicated', 'inline']);

  const azureEndpoint = metadata.entries.find((entry) => entry.key === 'azureFoundryEndpointUrl');
  assert.ok(azureEndpoint, 'azureFoundryEndpointUrl entry should exist');
  assert.equal(azureEndpoint?.defaultValue, DEFAULT_CONFIG.azureFoundryEndpointUrl);
});

test('buildSettingsSurfaceSnapshot projects config values into grouped sections and marks NEW settings', () => {
  const snapshot = buildSettingsSurfaceSnapshot(
    {
      ...DEFAULT_CONFIG,
      cliProvider: 'azure-foundry',
      operatorMode: 'multi-agent',
      memoryStrategy: 'summary',
      memorySummaryThreshold: 42,
      planningPass: { enabled: true, mode: 'dedicated' },
      azureFoundryEndpointUrl: 'https://foundry.example',
      azureFoundryModelDeployment: 'gpt-4.1'
    },
    {
      newSettingKeys: ['planningPass.enabled', 'planningPass.mode']
    }
  );

  assert.equal(snapshot.sections.length, 5);
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
    azureSection?.entries.find((entry) => entry.key === 'azureFoundryModelDeployment')?.value,
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
