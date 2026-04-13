"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSettingsSurfaceMetadata = getSettingsSurfaceMetadata;
exports.buildSettingsSurfaceSnapshot = buildSettingsSurfaceSnapshot;
exports.buildSettingsDiscoveryState = buildSettingsDiscoveryState;
exports.collectNewSettingsNotice = collectNewSettingsNotice;
exports.readSettingsDiscoveryState = readSettingsDiscoveryState;
exports.writeSettingsDiscoveryState = writeSettingsDiscoveryState;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const defaults_1 = require("./defaults");
const SETTINGS_DISCOVERY_STATE_KEY = 'ralphCodex.settingsSurfaceDiscovery';
const SECTION_METADATA = [
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
const SETTINGS_SURFACE_REGISTRY = [
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
let cachedManifest = null;
let cachedMetadata = null;
function resolvePackageManifestPath() {
    const candidates = [
        path.resolve(__dirname, '..', '..', 'package.json'),
        path.resolve(__dirname, '..', '..', '..', 'package.json')
    ];
    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }
    return candidates[0];
}
function loadPackageManifest() {
    if (cachedManifest) {
        return cachedManifest;
    }
    const manifestPath = resolvePackageManifestPath();
    cachedManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return cachedManifest;
}
function manifestProperties() {
    return loadPackageManifest().contributes?.configuration?.properties ?? {};
}
function getConfigValue(config, key) {
    return key.split('.').reduce((current, segment) => {
        if (current === null || current === undefined || typeof current !== 'object') {
            return undefined;
        }
        return current[segment];
    }, config);
}
function getDefaultValueFromConfig(key) {
    return getConfigValue(defaults_1.DEFAULT_CONFIG, key);
}
function getSettingsSurfaceMetadata() {
    if (cachedMetadata) {
        return cachedMetadata;
    }
    const properties = manifestProperties();
    const entries = SETTINGS_SURFACE_REGISTRY.map((entry) => {
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
function buildSettingsSurfaceSnapshot(config, options) {
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
function buildSettingsDiscoveryState(seenSettingKeys) {
    return {
        seenSettingKeys: [...new Set(seenSettingKeys)].sort()
    };
}
function collectNewSettingsNotice(metadata, state) {
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
        focusSettingKey: newSettingKeys[0]
    };
}
async function readSettingsDiscoveryState(state) {
    const raw = state.get(SETTINGS_DISCOVERY_STATE_KEY);
    if (!raw || !Array.isArray(raw.seenSettingKeys)) {
        return null;
    }
    return buildSettingsDiscoveryState(raw.seenSettingKeys);
}
async function writeSettingsDiscoveryState(state, metadata) {
    await state.update(SETTINGS_DISCOVERY_STATE_KEY, buildSettingsDiscoveryState(metadata.entries.map((entry) => entry.key)));
}
//# sourceMappingURL=settingsSurface.js.map