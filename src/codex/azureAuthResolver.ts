import { AzureAuthConfig } from '../config/types';
import { DefaultAzureCredential } from '@azure/identity';

export interface SecretStorageLike {
  get(key: string): Thenable<string | undefined> | Promise<string | undefined>;
}

export interface AzureBearerAccessToken {
  token: string;
}

export interface AzureBearerCredential {
  getToken(scopes: string | string[]): Promise<AzureBearerAccessToken | null>;
}

export interface AzureCredentialFactoryResult {
  credential: AzureBearerCredential;
  sourceLabel: string;
}

export type AzureCredentialFactory = (config: AzureAuthConfig) => AzureCredentialFactoryResult;

export interface ResolvedAzureAuth {
  mode: AzureAuthConfig['mode'];
  kind: 'bearer' | 'api-key';
  headerName: 'Authorization' | 'api-key';
  headerValue: string;
  copilotEnv: NodeJS.ProcessEnv;
  redactedSource: string;
}

export interface AzureAuthReadiness {
  mode: AzureAuthConfig['mode'];
  kind: 'bearer' | 'api-key';
  status: 'ready' | 'misconfigured' | 'unavailable';
  redactedSource: string;
  detail: string;
}

const AZURE_COGNITIVE_SERVICES_SCOPE = 'https://cognitiveservices.azure.com/.default';

let secretStorage: SecretStorageLike | null = null;
let azureCredentialFactoryOverride: AzureCredentialFactory | null = null;

export function configureAzureSecretStorage(storage: SecretStorageLike | null): void {
  secretStorage = storage;
}

export function setAzureCredentialFactoryOverride(factory: AzureCredentialFactory | null): void {
  azureCredentialFactoryOverride = factory;
}

export async function resolveAzureAuth(config: AzureAuthConfig): Promise<ResolvedAzureAuth> {
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

export async function inspectAzureAuthReadiness(config: AzureAuthConfig): Promise<AzureAuthReadiness> {
  switch (config.mode) {
    case 'env-api-key': {
      const variableName = config.apiKeyEnvVar.trim();
      if (!variableName) {
        return {
          mode: config.mode,
          kind: 'api-key',
          status: 'misconfigured',
          redactedSource: 'environment variable (unconfigured)',
          detail: 'Azure auth mode "env-api-key" requires a non-empty apiKeyEnvVar setting.'
        };
      }

      try {
        const auth = await resolveApiKeyFromEnv(config);
        return {
          mode: config.mode,
          kind: 'api-key',
          status: 'ready',
          redactedSource: auth.redactedSource,
          detail: `Azure API-key readiness confirmed via ${auth.redactedSource}.`
        };
      } catch (error) {
        return {
          mode: config.mode,
          kind: 'api-key',
          status: 'unavailable',
          redactedSource: `environment variable ${variableName}`,
          detail: sanitizeFailureDetail(error)
        };
      }
    }
    case 'vscode-secret': {
      const secretKey = config.secretStorageKey.trim();
      if (!secretKey) {
        return {
          mode: config.mode,
          kind: 'api-key',
          status: 'misconfigured',
          redactedSource: 'VS Code secret (unconfigured)',
          detail: 'Azure auth mode "vscode-secret" requires a non-empty secretStorageKey setting.'
        };
      }

      try {
        const auth = await resolveApiKeyFromSecretStorage(config);
        return {
          mode: config.mode,
          kind: 'api-key',
          status: 'ready',
          redactedSource: auth.redactedSource,
          detail: `Azure API-key readiness confirmed via ${auth.redactedSource}.`
        };
      } catch (error) {
        return {
          mode: config.mode,
          kind: 'api-key',
          status: 'unavailable',
          redactedSource: `VS Code secret ${secretKey}`,
          detail: sanitizeFailureDetail(error)
        };
      }
    }
    case 'az-bearer':
    default: {
      const { sourceLabel } = createAzureCredentialFactory(config);
      const tenantId = config.tenantId.trim();
      const subscriptionId = config.subscriptionId.trim();
      const redactedSource = formatBearerSourceLabel(sourceLabel, tenantId, subscriptionId);

      try {
        await resolveBearerToken(config);
        return {
          mode: config.mode,
          kind: 'bearer',
          status: 'ready',
          redactedSource,
          detail: `Azure bearer-token readiness confirmed via ${redactedSource}.`
        };
      } catch (error) {
        return {
          mode: config.mode,
          kind: 'bearer',
          status: 'unavailable',
          redactedSource,
          detail: error instanceof Error ? error.message : sanitizeFailureDetail(error)
        };
      }
    }
  }
}

async function resolveApiKeyFromEnv(config: AzureAuthConfig): Promise<ResolvedAzureAuth> {
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

async function resolveApiKeyFromSecretStorage(config: AzureAuthConfig): Promise<ResolvedAzureAuth> {
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

async function resolveBearerToken(config: AzureAuthConfig): Promise<ResolvedAzureAuth> {
  const tenantId = config.tenantId.trim();
  const subscriptionId = config.subscriptionId.trim();
  const { credential, sourceLabel } = createAzureCredentialFactory(config);

  let token: string | undefined;
  try {
    token = (await credential.getToken([AZURE_COGNITIVE_SERVICES_SCOPE]))?.token?.trim();
  } catch (error) {
    throw new Error(buildBearerFailureMessage(sourceLabel, tenantId, subscriptionId, error));
  }

  if (!token) {
    throw new Error(buildBearerFailureMessage(
      sourceLabel,
      tenantId,
      subscriptionId,
      'credential returned an empty bearer token'
    ));
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

function createAzureCredentialFactory(config: AzureAuthConfig): AzureCredentialFactoryResult {
  if (azureCredentialFactoryOverride) {
    return azureCredentialFactoryOverride(config);
  }

  const tenantId = config.tenantId.trim();
  return {
    credential: new DefaultAzureCredential({
      ...(tenantId ? { tenantId } : {})
    }),
    sourceLabel: 'DefaultAzureCredential'
  };
}

function formatBearerSourceLabel(sourceLabel: string, tenantId: string, subscriptionId: string): string {
  const qualifiers: string[] = [];
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

function buildBearerFailureMessage(
  sourceLabel: string,
  tenantId: string,
  subscriptionId: string,
  error: unknown
): string {
  const detail = sanitizeFailureDetail(error);
  const qualifiers: string[] = [];
  if (tenantId) {
    qualifiers.push(`tenant ${tenantId}`);
  }
  if (subscriptionId) {
    qualifiers.push(`subscription ${subscriptionId}`);
  }
  const context = qualifiers.length > 0 ? ` for ${qualifiers.join(', ')}` : '';
  return `Azure bearer-token acquisition failed via ${sourceLabel}${context}: ${detail}`;
}

function sanitizeFailureDetail(error: unknown): string {
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
