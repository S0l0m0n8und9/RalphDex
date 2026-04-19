"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configureAzureSecretStorage = configureAzureSecretStorage;
exports.setAzureCredentialFactoryOverride = setAzureCredentialFactoryOverride;
exports.resolveAzureAuth = resolveAzureAuth;
const identity_1 = require("@azure/identity");
const AZURE_COGNITIVE_SERVICES_SCOPE = 'https://cognitiveservices.azure.com/.default';
let secretStorage = null;
let azureCredentialFactoryOverride = null;
function configureAzureSecretStorage(storage) {
    secretStorage = storage;
}
function setAzureCredentialFactoryOverride(factory) {
    azureCredentialFactoryOverride = factory;
}
async function resolveAzureAuth(config) {
    switch (config.mode) {
        case 'env-api-key':
            return await resolveApiKeyFromEnv(config);
        case 'vscode-secret':
            return await resolveApiKeyFromSecretStorage(config);
        case 'az-bearer':
        default:
            return await resolveBearerToken(config);
    }
}
async function resolveApiKeyFromEnv(config) {
    const variableName = config.apiKeyEnvVar.trim();
    if (!variableName) {
        throw new Error('Azure auth mode "env-api-key" requires a non-empty apiKeyEnvVar setting.');
    }
    const apiKey = process.env[variableName]?.trim();
    if (!apiKey) {
        throw new Error(`Azure API key environment variable "${variableName}" is not set or is empty.`);
    }
    return {
        mode: config.mode,
        kind: 'api-key',
        headerName: 'api-key',
        headerValue: apiKey,
        copilotEnv: {
            COPILOT_PROVIDER_API_KEY: apiKey
        },
        redactedSource: `environment variable ${variableName}`
    };
}
async function resolveApiKeyFromSecretStorage(config) {
    const secretKey = config.secretStorageKey.trim();
    if (!secretKey) {
        throw new Error('Azure auth mode "vscode-secret" requires a non-empty secretStorageKey setting.');
    }
    if (!secretStorage) {
        throw new Error(`VS Code secret storage is not available to resolve Azure secret key "${secretKey}".`);
    }
    const apiKey = (await secretStorage.get(secretKey))?.trim();
    if (!apiKey) {
        throw new Error(`No Azure API key is stored under VS Code secret key "${secretKey}".`);
    }
    return {
        mode: config.mode,
        kind: 'api-key',
        headerName: 'api-key',
        headerValue: apiKey,
        copilotEnv: {
            COPILOT_PROVIDER_API_KEY: apiKey
        },
        redactedSource: `VS Code secret ${secretKey}`
    };
}
async function resolveBearerToken(config) {
    const tenantId = config.tenantId.trim();
    const subscriptionId = config.subscriptionId.trim();
    const { credential, sourceLabel } = createAzureCredentialFactory(config);
    let token;
    try {
        token = (await credential.getToken([AZURE_COGNITIVE_SERVICES_SCOPE]))?.token?.trim();
    }
    catch (error) {
        throw new Error(buildBearerFailureMessage(sourceLabel, tenantId, subscriptionId, error));
    }
    if (!token) {
        throw new Error(buildBearerFailureMessage(sourceLabel, tenantId, subscriptionId, 'credential returned an empty bearer token'));
    }
    return {
        mode: config.mode,
        kind: 'bearer',
        headerName: 'Authorization',
        headerValue: `Bearer ${token}`,
        copilotEnv: {
            COPILOT_PROVIDER_BEARER_TOKEN: token
        },
        redactedSource: formatBearerSourceLabel(sourceLabel, tenantId, subscriptionId)
    };
}
function createAzureCredentialFactory(config) {
    if (azureCredentialFactoryOverride) {
        return azureCredentialFactoryOverride(config);
    }
    const tenantId = config.tenantId.trim();
    return {
        credential: new identity_1.DefaultAzureCredential({
            ...(tenantId ? { tenantId } : {})
        }),
        sourceLabel: 'DefaultAzureCredential'
    };
}
function formatBearerSourceLabel(sourceLabel, tenantId, subscriptionId) {
    const qualifiers = [];
    if (tenantId) {
        qualifiers.push(`tenant ${tenantId}`);
    }
    if (subscriptionId) {
        qualifiers.push(`subscription ${subscriptionId}`);
    }
    return qualifiers.length > 0
        ? `${sourceLabel} bearer token (${qualifiers.join(', ')})`
        : `${sourceLabel} bearer token`;
}
function buildBearerFailureMessage(sourceLabel, tenantId, subscriptionId, error) {
    const detail = sanitizeFailureDetail(error);
    const qualifiers = [];
    if (tenantId) {
        qualifiers.push(`tenant ${tenantId}`);
    }
    if (subscriptionId) {
        qualifiers.push(`subscription ${subscriptionId}`);
    }
    const context = qualifiers.length > 0 ? ` for ${qualifiers.join(', ')}` : '';
    return `Azure bearer-token acquisition failed via ${sourceLabel}${context}: ${detail}`;
}
function sanitizeFailureDetail(error) {
    const message = (error instanceof Error ? error.message : String(error)).trim();
    if (!message) {
        return 'credential resolution failed';
    }
    const firstLine = message.split(/\r?\n/u)[0]?.trim() ?? '';
    const redactedLine = firstLine
        .replace(/Bearer\s+[A-Za-z0-9._~-]+/gu, 'Bearer [redacted]')
        .replace(/[A-Za-z0-9._%+-]*token[A-Za-z0-9._%+-]*/giu, '[redacted-token]');
    return redactedLine || 'credential resolution failed';
}
//# sourceMappingURL=azureAuthResolver.js.map