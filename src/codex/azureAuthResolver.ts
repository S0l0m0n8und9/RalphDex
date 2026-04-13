import { AzureAuthConfig } from '../config/types';
import { runProcess } from '../services/processRunner';

export interface SecretStorageLike {
  get(key: string): Thenable<string | undefined> | Promise<string | undefined>;
}

export interface ResolvedAzureAuth {
  mode: AzureAuthConfig['mode'];
  kind: 'bearer' | 'api-key';
  headerName: 'Authorization' | 'api-key';
  headerValue: string;
  copilotEnv: NodeJS.ProcessEnv;
  redactedSource: string;
}

const AZURE_COGNITIVE_SERVICES_RESOURCE = 'https://cognitiveservices.azure.com/';

let secretStorage: SecretStorageLike | null = null;

export function configureAzureSecretStorage(storage: SecretStorageLike | null): void {
  secretStorage = storage;
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
  const args = ['account', 'get-access-token', '--resource', AZURE_COGNITIVE_SERVICES_RESOURCE, '--output', 'json'];
  const tenantId = config.tenantId.trim();
  const subscriptionId = config.subscriptionId.trim();

  if (tenantId) {
    args.push('--tenant', tenantId);
  }

  if (subscriptionId) {
    args.push('--subscription', subscriptionId);
  }

  const result = await runProcess('az', args, { cwd: process.cwd() });
  if (result.code !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || 'unknown Azure CLI error';
    throw new Error(`Azure CLI bearer-token acquisition failed: ${detail}`);
  }

  let token: string | undefined;
  try {
    const parsed = JSON.parse(result.stdout) as { accessToken?: string };
    token = parsed.accessToken?.trim();
  } catch {
    throw new Error('Azure CLI bearer-token acquisition returned invalid JSON.');
  }

  if (!token) {
    throw new Error('Azure CLI bearer-token acquisition returned no accessToken.');
  }

  return {
    mode: config.mode,
    kind: 'bearer',
    headerName: 'Authorization',
    headerValue: `Bearer ${token}`,
    copilotEnv: {
      COPILOT_PROVIDER_BEARER_TOKEN: token
    },
    redactedSource: subscriptionId
      ? `Azure CLI bearer token for subscription ${subscriptionId}`
      : 'Azure CLI bearer token'
  };
}
