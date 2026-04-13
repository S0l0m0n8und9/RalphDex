import * as fs from 'node:fs';
import * as path from 'node:path';
import { DEFAULT_CONFIG } from './defaults';
import type { RalphCodexConfig } from './types';

export type SettingsSectionId =
  | 'operator-mode'
  | 'provider'
  | 'memory'
  | 'planning'
  | 'azure-foundry';

export type SettingsControlKind = 'string' | 'number' | 'boolean' | 'enum';

interface PackageManifestProperty {
  default?: unknown;
  description?: string;
  enum?: string[];
}

interface PackageManifest {
  contributes?: {
    configuration?: {
      properties?: Record<string, PackageManifestProperty>;
    };
  };
}

export interface SettingsSurfaceSectionMetadata {
  id: SettingsSectionId;
  title: string;
  description: string;
}

export interface SettingsSurfaceEntryMetadata {
  key: string;
  manifestKey: string;
  sectionId: SettingsSectionId;
  title: string;
  description: string;
  control: SettingsControlKind;
  defaultValue: unknown;
  options?: string[];
}

export interface SettingsSurfaceMetadata {
  sections: SettingsSurfaceSectionMetadata[];
  entries: SettingsSurfaceEntryMetadata[];
}

export interface SettingsSurfaceEntrySnapshot extends SettingsSurfaceEntryMetadata {
  value: unknown;
  isNew: boolean;
}

export interface SettingsSurfaceSectionSnapshot extends SettingsSurfaceSectionMetadata {
  entries: SettingsSurfaceEntrySnapshot[];
  hasNewSettings: boolean;
}

export interface SettingsSurfaceSnapshot {
  sections: SettingsSurfaceSectionSnapshot[];
}

export interface SettingsDiscoveryState {
  seenSettingKeys: string[];
}

export interface NewSettingsNotice {
  message: string;
  newSettingKeys: string[];
  focusSettingKey: string;
}

const SETTINGS_DISCOVERY_STATE_KEY = 'ralphCodex.settingsSurfaceDiscovery';

const SECTION_METADATA: SettingsSurfaceSectionMetadata[] = [
  {
    id: 'operator-mode',
    title: 'Operator Mode',
    description: 'Preset and orchestration controls that shape how Ralph runs.'
  },
  {
    id: 'provider',
    title: 'Provider',
    description: 'Primary CLI provider and the command or model settings that support it.'
  },
  {
    id: 'memory',
    title: 'Memory',
    description: 'Prompt-budget and history controls that govern cross-iteration context.'
  },
  {
    id: 'planning',
    title: 'Planning',
    description: 'Pre-execution planning pass controls surfaced from the shared config contract.'
  },
  {
    id: 'azure-foundry',
    title: 'Azure Foundry',
    description: 'Azure AI Foundry connection details for the direct provider path.'
  }
];

const SETTINGS_SURFACE_REGISTRY: Array<{
  key: string;
  manifestKey: string;
  sectionId: SettingsSectionId;
  title: string;
  control: SettingsControlKind;
}> = [
  { key: 'operatorMode', manifestKey: 'ralphCodex.operatorMode', sectionId: 'operator-mode', title: 'Operator Mode', control: 'enum' },
  { key: 'autonomyMode', manifestKey: 'ralphCodex.autonomyMode', sectionId: 'operator-mode', title: 'Autonomy Mode', control: 'enum' },
  { key: 'agentCount', manifestKey: 'ralphCodex.agentCount', sectionId: 'operator-mode', title: 'Agent Count', control: 'number' },
  { key: 'preferredHandoffMode', manifestKey: 'ralphCodex.preferredHandoffMode', sectionId: 'operator-mode', title: 'Preferred Handoff', control: 'enum' },

  { key: 'cliProvider', manifestKey: 'ralphCodex.cliProvider', sectionId: 'provider', title: 'CLI Provider', control: 'enum' },
  { key: 'model', manifestKey: 'ralphCodex.model', sectionId: 'provider', title: 'Model', control: 'string' },
  { key: 'codexCommandPath', manifestKey: 'ralphCodex.codexCommandPath', sectionId: 'provider', title: 'Codex Command Path', control: 'string' },
  { key: 'claudeCommandPath', manifestKey: 'ralphCodex.claudeCommandPath', sectionId: 'provider', title: 'Claude Command Path', control: 'string' },
  { key: 'copilotCommandPath', manifestKey: 'ralphCodex.copilotCommandPath', sectionId: 'provider', title: 'Copilot Command Path', control: 'string' },

  { key: 'memoryStrategy', manifestKey: 'ralphCodex.memoryStrategy', sectionId: 'memory', title: 'Memory Strategy', control: 'enum' },
  { key: 'memoryWindowSize', manifestKey: 'ralphCodex.memoryWindowSize', sectionId: 'memory', title: 'Memory Window Size', control: 'number' },
  { key: 'memorySummaryThreshold', manifestKey: 'ralphCodex.memorySummaryThreshold', sectionId: 'memory', title: 'Memory Summary Threshold', control: 'number' },
  { key: 'promptBudgetProfile', manifestKey: 'ralphCodex.promptBudgetProfile', sectionId: 'memory', title: 'Prompt Budget Profile', control: 'enum' },

  { key: 'planningPass.enabled', manifestKey: 'ralphCodex.planningPass', sectionId: 'planning', title: 'Planning Pass Enabled', control: 'boolean' },
  { key: 'planningPass.mode', manifestKey: 'ralphCodex.planningPass', sectionId: 'planning', title: 'Planning Pass Mode', control: 'enum' },

  { key: 'azureFoundryCommandPath', manifestKey: 'ralphCodex.azureFoundryCommandPath', sectionId: 'azure-foundry', title: 'Azure Foundry Command Path', control: 'string' },
  { key: 'azureFoundryEndpointUrl', manifestKey: 'ralphCodex.azureFoundryEndpointUrl', sectionId: 'azure-foundry', title: 'Azure Foundry Endpoint URL', control: 'string' },
  { key: 'azureFoundryApiKey', manifestKey: 'ralphCodex.azureFoundryApiKey', sectionId: 'azure-foundry', title: 'Azure Foundry API Key', control: 'string' },
  { key: 'azureFoundryModelDeployment', manifestKey: 'ralphCodex.azureFoundryModelDeployment', sectionId: 'azure-foundry', title: 'Azure Foundry Model Deployment', control: 'string' },
  { key: 'azureFoundryApiVersion', manifestKey: 'ralphCodex.azureFoundryApiVersion', sectionId: 'azure-foundry', title: 'Azure Foundry API Version', control: 'string' }
];

let cachedManifest: PackageManifest | null = null;
let cachedMetadata: SettingsSurfaceMetadata | null = null;

function resolvePackageManifestPath(): string {
  const candidates = [
    path.resolve(__dirname, '..', '..', 'package.json'),
    path.resolve(__dirname, '..', '..', '..', 'package.json')
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0]!;
}

function loadPackageManifest(): PackageManifest {
  if (cachedManifest) {
    return cachedManifest;
  }

  const manifestPath = resolvePackageManifestPath();
  cachedManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as PackageManifest;
  return cachedManifest;
}

function manifestProperties(): Record<string, PackageManifestProperty> {
  return loadPackageManifest().contributes?.configuration?.properties ?? {};
}

function getConfigValue(config: RalphCodexConfig, key: string): unknown {
  return key.split('.').reduce<unknown>((current, segment) => {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }

    return (current as Record<string, unknown>)[segment];
  }, config as unknown as Record<string, unknown>);
}

function getDefaultValueFromConfig(key: string): unknown {
  return getConfigValue(DEFAULT_CONFIG, key);
}

export function getSettingsSurfaceMetadata(): SettingsSurfaceMetadata {
  if (cachedMetadata) {
    return cachedMetadata;
  }

  const properties = manifestProperties();
  const entries = SETTINGS_SURFACE_REGISTRY.map((entry): SettingsSurfaceEntryMetadata => {
    const manifestProperty = properties[entry.manifestKey];
    const defaultValue = entry.key === 'planningPass.enabled' || entry.key === 'planningPass.mode'
      ? getDefaultValueFromConfig(entry.key)
      : manifestProperty?.default ?? getDefaultValueFromConfig(entry.key);
    const options = entry.key === 'planningPass.mode'
      ? ['dedicated', 'inline']
      : manifestProperty?.enum;

    return {
      ...entry,
      description: manifestProperty?.description ?? '',
      defaultValue,
      ...(options ? { options } : {})
    };
  });

  cachedMetadata = {
    sections: [...SECTION_METADATA],
    entries
  };
  return cachedMetadata;
}

export function buildSettingsSurfaceSnapshot(
  config: RalphCodexConfig,
  options?: {
    newSettingKeys?: string[];
  }
): SettingsSurfaceSnapshot {
  const metadata = getSettingsSurfaceMetadata();
  const newSettingKeys = new Set(options?.newSettingKeys ?? []);

  return {
    sections: metadata.sections.map((section) => {
      const entries = metadata.entries
        .filter((entry) => entry.sectionId === section.id)
        .map((entry) => ({
          ...entry,
          value: getConfigValue(config, entry.key),
          isNew: newSettingKeys.has(entry.key)
        }));

      return {
        ...section,
        entries,
        hasNewSettings: entries.some((entry) => entry.isNew)
      };
    })
  };
}

export function buildSettingsDiscoveryState(seenSettingKeys: string[]): SettingsDiscoveryState {
  return {
    seenSettingKeys: [...new Set(seenSettingKeys)].sort()
  };
}

export function collectNewSettingsNotice(
  metadata: SettingsSurfaceMetadata,
  state: SettingsDiscoveryState | null | undefined
): NewSettingsNotice | null {
  const seen = new Set(state?.seenSettingKeys ?? []);
  const newSettingKeys = metadata.entries
    .map((entry) => entry.key)
    .filter((key) => !seen.has(key));

  if (newSettingKeys.length === 0) {
    return null;
  }

  return {
    message: `Ralphdex: ${newSettingKeys.length} new settings available`,
    newSettingKeys,
    focusSettingKey: newSettingKeys[0]!
  };
}

export async function readSettingsDiscoveryState(
  state: Pick<{ get<T>(key: string): T | undefined }, 'get'>
): Promise<SettingsDiscoveryState | null> {
  const raw = state.get<SettingsDiscoveryState>(SETTINGS_DISCOVERY_STATE_KEY);
  if (!raw || !Array.isArray(raw.seenSettingKeys)) {
    return null;
  }

  return buildSettingsDiscoveryState(raw.seenSettingKeys);
}

export async function writeSettingsDiscoveryState(
  state: Pick<{ update(key: string, value: unknown): Thenable<void> | Promise<void> }, 'update'>,
  metadata: SettingsSurfaceMetadata
): Promise<void> {
  await state.update(
    SETTINGS_DISCOVERY_STATE_KEY,
    buildSettingsDiscoveryState(metadata.entries.map((entry) => entry.key))
  );
}
