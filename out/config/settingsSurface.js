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
        title: 'Provider & Models',
        description: 'Primary CLI provider, default model, and complexity-based model tiering.'
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
        id: 'copilot-foundry',
        title: 'Copilot Foundry',
        description: 'Grouped Copilot CLI + Azure OpenAI BYOK controls.'
    },
    {
        id: 'azure-foundry',
        title: 'Azure Foundry',
        description: 'Grouped Azure AI Foundry direct-provider controls.'
    }
];
const SETTINGS_SURFACE_REGISTRY = [
    { key: 'operatorMode', manifestKey: 'ralphCodex.operatorMode', sectionId: 'operator-mode', title: 'Operator Mode', control: 'enum', description: 'Preset that seeds multiple Ralph settings at once.' },
    { key: 'autonomyMode', manifestKey: 'ralphCodex.autonomyMode', sectionId: 'operator-mode', title: 'Autonomy Mode', control: 'enum', description: 'Shorthand for supervised or autonomous loop behaviour.' },
    { key: 'agentCount', manifestKey: 'ralphCodex.agentCount', sectionId: 'operator-mode', title: 'Agent Count', control: 'number', description: 'Number of concurrent Ralph agents configured for the workspace.' },
    { key: 'preferredHandoffMode', manifestKey: 'ralphCodex.preferredHandoffMode', sectionId: 'operator-mode', title: 'Preferred Handoff', control: 'enum', description: 'Preferred way to hand a generated prompt to Codex.' },
    { key: 'cliProvider', manifestKey: 'ralphCodex.cliProvider', sectionId: 'provider', title: 'CLI Provider', control: 'enum', description: 'Primary language-model CLI backend for the agent loop.', options: ['claude', 'codex', 'copilot', 'copilot-foundry', 'azure-foundry', 'gemini'] },
    { key: 'model', manifestKey: 'ralphCodex.model', sectionId: 'provider', title: 'Default Model', control: 'suggested-string', description: 'Fallback model used when model tiering is disabled.' },
    { key: 'codexCommandPath', manifestKey: 'ralphCodex.codexCommandPath', sectionId: 'provider', title: 'Codex Command Path', control: 'string', description: 'Path or command name for the Codex CLI executable.' },
    { key: 'claudeCommandPath', manifestKey: 'ralphCodex.claudeCommandPath', sectionId: 'provider', title: 'Claude Command Path', control: 'string', description: 'Path or command name for the Claude CLI executable.' },
    { key: 'copilotCommandPath', manifestKey: 'ralphCodex.copilotCommandPath', sectionId: 'provider', title: 'Copilot Command Path', control: 'string', description: 'Path or command name for the GitHub Copilot CLI executable.' },
    { key: 'geminiCommandPath', manifestKey: 'ralphCodex.geminiCommandPath', sectionId: 'provider', title: 'Gemini Command Path', control: 'string', description: 'Path or command name for the Google Gemini CLI executable.' },
    { key: 'modelTiering.enabled', manifestKey: 'ralphCodex.modelTiering', sectionId: 'provider', title: 'Enable Model Tiering', control: 'boolean', description: 'Route tasks to different models dynamically based on task properties.' },
    { key: 'modelTiering.simpleThreshold', manifestKey: 'ralphCodex.modelTiering', sectionId: 'provider', title: 'Tier Threshold: Simple', control: 'number', description: 'Score strictly below this threshold maps to Simple.' },
    { key: 'modelTiering.complexThreshold', manifestKey: 'ralphCodex.modelTiering', sectionId: 'provider', title: 'Tier Threshold: Complex', control: 'number', description: 'Score at or above this threshold maps to Complex.' },
    { key: 'modelTiering.simple.model', manifestKey: 'ralphCodex.modelTiering', sectionId: 'provider', title: 'Simple Tier: Model', control: 'suggested-string', description: 'Model identifier for the Simple tier.' },
    { key: 'modelTiering.simple.provider', manifestKey: 'ralphCodex.modelTiering', sectionId: 'provider', title: 'Simple Tier: Provider', control: 'enum', description: 'Optional provider override for the Simple tier.', options: ['claude', 'codex', 'copilot', 'copilot-foundry', 'azure-foundry', 'gemini'] },
    { key: 'modelTiering.medium.model', manifestKey: 'ralphCodex.modelTiering', sectionId: 'provider', title: 'Medium Tier: Model', control: 'suggested-string', description: 'Model identifier for the Medium tier.' },
    { key: 'modelTiering.medium.provider', manifestKey: 'ralphCodex.modelTiering', sectionId: 'provider', title: 'Medium Tier: Provider', control: 'enum', description: 'Optional provider override for the Medium tier.', options: ['claude', 'codex', 'copilot', 'copilot-foundry', 'azure-foundry', 'gemini'] },
    { key: 'modelTiering.complex.model', manifestKey: 'ralphCodex.modelTiering', sectionId: 'provider', title: 'Complex Tier: Model', control: 'suggested-string', description: 'Model identifier for the Complex tier.' },
    { key: 'modelTiering.complex.provider', manifestKey: 'ralphCodex.modelTiering', sectionId: 'provider', title: 'Complex Tier: Provider', control: 'enum', description: 'Optional provider override for the Complex tier.', options: ['claude', 'codex', 'copilot', 'copilot-foundry', 'azure-foundry', 'gemini'] },
    { key: 'memoryStrategy', manifestKey: 'ralphCodex.memoryStrategy', sectionId: 'memory', title: 'Memory Strategy', control: 'enum', description: 'Controls how Ralph carries context between iterations.' },
    { key: 'memoryWindowSize', manifestKey: 'ralphCodex.memoryWindowSize', sectionId: 'memory', title: 'Memory Window Size', control: 'number', description: 'Number of recent iterations included in sliding-window memory.' },
    { key: 'memorySummaryThreshold', manifestKey: 'ralphCodex.memorySummaryThreshold', sectionId: 'memory', title: 'Memory Summary Threshold', control: 'number', description: 'Iteration count before summary mode starts condensing history.' },
    { key: 'promptBudgetProfile', manifestKey: 'ralphCodex.promptBudgetProfile', sectionId: 'memory', title: 'Prompt Budget Profile', control: 'enum', description: 'Prompt-budget calibration profile used when shaping prompts.' },
    { key: 'planningPass.enabled', manifestKey: 'ralphCodex.planningPass', sectionId: 'planning', title: 'Planning Pass Enabled', control: 'boolean', description: 'Enable the pre-execution planning pass.' },
    { key: 'planningPass.mode', manifestKey: 'ralphCodex.planningPass', sectionId: 'planning', title: 'Planning Pass Mode', control: 'enum', description: 'Choose inline or dedicated planning execution.', options: ['dedicated', 'inline'] },
    { key: 'copilotFoundry.commandPath', manifestKey: 'ralphCodex.copilotFoundry', sectionId: 'copilot-foundry', title: 'Command Path', control: 'string', description: 'Path or command name for the Copilot CLI executable.' },
    { key: 'copilotFoundry.approvalMode', manifestKey: 'ralphCodex.copilotFoundry', sectionId: 'copilot-foundry', title: 'Approval Mode', control: 'enum', description: 'Approval posture used by the Copilot CLI harness.', options: ['allow-all', 'allow-tools-only', 'interactive'] },
    { key: 'copilotFoundry.maxAutopilotContinues', manifestKey: 'ralphCodex.copilotFoundry', sectionId: 'copilot-foundry', title: 'Max Autopilot Continues', control: 'number', description: 'Maximum number of autopilot continuation turns per Copilot CLI invocation.' },
    { key: 'copilotFoundry.auth.mode', manifestKey: 'ralphCodex.copilotFoundry', sectionId: 'copilot-foundry', title: 'Auth Mode', control: 'enum', description: 'How the provider resolves Azure credentials.', options: ['az-bearer', 'env-api-key', 'vscode-secret'] },
    { key: 'copilotFoundry.auth.tenantId', manifestKey: 'ralphCodex.copilotFoundry', sectionId: 'copilot-foundry', title: 'Auth Tenant Id', control: 'string', description: 'Azure tenant identifier used for bearer-token auth.' },
    { key: 'copilotFoundry.auth.subscriptionId', manifestKey: 'ralphCodex.copilotFoundry', sectionId: 'copilot-foundry', title: 'Auth Subscription Id', control: 'string', description: 'Azure subscription identifier used for readiness diagnostics.' },
    { key: 'copilotFoundry.auth.apiKeyEnvVar', manifestKey: 'ralphCodex.copilotFoundry', sectionId: 'copilot-foundry', title: 'Auth API Key Env Var', control: 'string', description: 'Environment variable name used when the API key is sourced externally.' },
    { key: 'copilotFoundry.auth.secretStorageKey', manifestKey: 'ralphCodex.copilotFoundry', sectionId: 'copilot-foundry', title: 'Auth SecretStorage Key', control: 'string', description: 'SecretStorage key used when the API key is sourced from VS Code secrets.' },
    { key: 'copilotFoundry.azure.resourceGroup', manifestKey: 'ralphCodex.copilotFoundry', sectionId: 'copilot-foundry', title: 'Azure Resource Group', control: 'string', description: 'Azure resource group name used for operator clarity and diagnostics.' },
    { key: 'copilotFoundry.azure.resourceName', manifestKey: 'ralphCodex.copilotFoundry', sectionId: 'copilot-foundry', title: 'Azure Resource Name', control: 'string', description: 'Azure OpenAI resource name used to derive the Copilot Foundry base URL.' },
    { key: 'copilotFoundry.azure.baseUrlOverride', manifestKey: 'ralphCodex.copilotFoundry', sectionId: 'copilot-foundry', title: 'Azure Base URL Override', control: 'string', description: 'Optional override for the derived Azure OpenAI base URL.' },
    { key: 'copilotFoundry.model.deployment', manifestKey: 'ralphCodex.copilotFoundry', sectionId: 'copilot-foundry', title: 'Model Deployment', control: 'string', description: 'Azure deployment name and Copilot model identifier.' },
    { key: 'copilotFoundry.model.wireApi', manifestKey: 'ralphCodex.copilotFoundry', sectionId: 'copilot-foundry', title: 'Wire API', control: 'string', description: 'Wire protocol selected for the Copilot Foundry harness.' },
    { key: 'azureFoundry.commandPath', manifestKey: 'ralphCodex.azureFoundry', sectionId: 'azure-foundry', title: 'Command Path', control: 'string', description: 'Path or command name for the Azure AI Foundry CLI executable.' },
    { key: 'azureFoundry.endpointUrl', manifestKey: 'ralphCodex.azureFoundry', sectionId: 'azure-foundry', title: 'Endpoint URL', control: 'string', description: 'Azure AI Foundry endpoint URL.' },
    { key: 'azureFoundry.modelDeployment', manifestKey: 'ralphCodex.azureFoundry', sectionId: 'azure-foundry', title: 'Model Deployment', control: 'string', description: 'Azure AI Foundry model deployment name.' },
    { key: 'azureFoundry.apiVersion', manifestKey: 'ralphCodex.azureFoundry', sectionId: 'azure-foundry', title: 'API Version', control: 'string', description: 'Azure OpenAI API version used by Azure AI Foundry.' },
    { key: 'azureFoundry.auth.mode', manifestKey: 'ralphCodex.azureFoundry', sectionId: 'azure-foundry', title: 'Auth Mode', control: 'enum', description: 'How the Azure AI Foundry provider resolves Azure credentials.', options: ['az-bearer', 'env-api-key', 'vscode-secret'] },
    { key: 'azureFoundry.auth.tenantId', manifestKey: 'ralphCodex.azureFoundry', sectionId: 'azure-foundry', title: 'Auth Tenant Id', control: 'string', description: 'Azure tenant identifier used for bearer-token auth.' },
    { key: 'azureFoundry.auth.subscriptionId', manifestKey: 'ralphCodex.azureFoundry', sectionId: 'azure-foundry', title: 'Auth Subscription Id', control: 'string', description: 'Azure subscription identifier used for readiness diagnostics.' },
    { key: 'azureFoundry.auth.apiKeyEnvVar', manifestKey: 'ralphCodex.azureFoundry', sectionId: 'azure-foundry', title: 'Auth API Key Env Var', control: 'string', description: 'Environment variable name used when the API key is sourced externally.' },
    { key: 'azureFoundry.auth.secretStorageKey', manifestKey: 'ralphCodex.azureFoundry', sectionId: 'azure-foundry', title: 'Auth SecretStorage Key', control: 'string', description: 'SecretStorage key used when the API key is sourced from VS Code secrets.' }
];
const PROVIDER_MODELS = {
    claude: ['claude-3-7-sonnet-20250219', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
    codex: ['gpt-4o', 'gpt-4o-mini', 'o1', 'o3-mini'],
    copilot: ['gpt-4o', 'gpt-4o-mini', 'o1', 'o3-mini', 'claude-3.5-sonnet'],
    'copilot-foundry': [],
    'azure-foundry': [],
    gemini: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-1.5-pro', 'gemini-1.5-flash']
};
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
        const defaultValue = entry.key.includes('.')
            ? getDefaultValueFromConfig(entry.key)
            : manifestProperty?.default ?? getDefaultValueFromConfig(entry.key);
        const options = entry.options ?? manifestProperty?.enum;
        return {
            ...entry,
            description: entry.description || manifestProperty?.description || '',
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
                .map((entry) => {
                let options = entry.options;
                if (entry.control === 'suggested-string') {
                    let activeProvider = String(getConfigValue(config, 'cliProvider') ?? 'codex');
                    if (entry.key.startsWith('modelTiering.')) {
                        const tier = entry.key.split('.')[1];
                        const overrideProvider = getConfigValue(config, `modelTiering.${tier}.provider`);
                        if (overrideProvider) {
                            activeProvider = String(overrideProvider);
                        }
                    }
                    options = PROVIDER_MODELS[activeProvider] ?? [];
                }
                return {
                    ...entry,
                    value: getConfigValue(config, entry.key),
                    isNew: newSettingKeys.has(entry.key),
                    ...(options && options.length > 0 ? { options } : {})
                };
            });
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