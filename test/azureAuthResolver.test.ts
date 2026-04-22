import assert from 'node:assert/strict';
import test from 'node:test';
import {
  configureAzureSecretStorage,
  inspectAzureAuthReadiness,
  resolveAzureAuth,
  setAzureCredentialFactoryOverride
} from '../src/codex/azureAuthResolver';

test.afterEach(() => {
  delete process.env.AZURE_TEST_KEY;
  configureAzureSecretStorage(null);
  setAzureCredentialFactoryOverride(null);
});

test('resolveAzureAuth reads API key from configured environment variable', async () => {
  process.env.AZURE_TEST_KEY = 'env-secret';
  const auth = await resolveAzureAuth({
    mode: 'env-api-key',
    tenantId: '',
    subscriptionId: '',
    apiKeyEnvVar: 'AZURE_TEST_KEY',
    secretStorageKey: ''
  });

  assert.equal(auth.headerName, 'api-key');
  assert.equal(auth.headerValue, 'env-secret');
  assert.equal(auth.copilotEnv.COPILOT_PROVIDER_API_KEY, 'env-secret');
});

test('resolveAzureAuth reads API key from VS Code secret storage', async () => {
  configureAzureSecretStorage({
    get: async (key: string) => key === 'azure.secret' ? 'stored-secret' : undefined
  });

  const auth = await resolveAzureAuth({
    mode: 'vscode-secret',
    tenantId: '',
    subscriptionId: '',
    apiKeyEnvVar: '',
    secretStorageKey: 'azure.secret'
  });

  assert.equal(auth.headerName, 'api-key');
  assert.equal(auth.headerValue, 'stored-secret');
});

test('resolveAzureAuth acquires a bearer token via the configured Azure credential factory', async () => {
  let capturedScopes: string[] | undefined;
  let capturedTenantId: string | undefined;
  let capturedSubscriptionId: string | undefined;
  setAzureCredentialFactoryOverride((config) => {
    capturedTenantId = config.tenantId;
    capturedSubscriptionId = config.subscriptionId;
    return {
      credential: {
        getToken: async (scopes) => {
          capturedScopes = Array.isArray(scopes) ? scopes : [scopes];
          return { token: 'identity-token' };
        }
      },
      sourceLabel: 'DefaultAzureCredential'
    };
  });

  const auth = await resolveAzureAuth({
    mode: 'az-bearer',
    tenantId: 'tenant-1',
    subscriptionId: 'sub-1',
    apiKeyEnvVar: '',
    secretStorageKey: ''
  });

  assert.equal(auth.headerName, 'Authorization');
  assert.equal(auth.headerValue, 'Bearer identity-token');
  assert.equal(auth.copilotEnv.COPILOT_PROVIDER_BEARER_TOKEN, 'identity-token');
  assert.deepEqual(capturedScopes, ['https://cognitiveservices.azure.com/.default']);
  assert.equal(capturedTenantId, 'tenant-1');
  assert.equal(capturedSubscriptionId, 'sub-1');
  assert.match(auth.redactedSource, /tenant tenant-1/i);
  assert.match(auth.redactedSource, /subscription sub-1/i);
  assert.ok(!auth.redactedSource.includes('identity-token'));
});

test('resolveAzureAuth normalizes Azure credential acquisition failures without leaking tokens', async () => {
  setAzureCredentialFactoryOverride(() => ({
    credential: {
      getToken: async () => {
        throw new Error('identity lookup failed for secret-token-value');
      }
    },
    sourceLabel: 'DefaultAzureCredential'
  }));

  await assert.rejects(
    resolveAzureAuth({
      mode: 'az-bearer',
      tenantId: 'tenant-1',
      subscriptionId: '',
      apiKeyEnvVar: '',
      secretStorageKey: ''
    }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Azure bearer-token acquisition failed via DefaultAzureCredential/i);
      assert.match(error.message, /tenant tenant-1/i);
      assert.doesNotMatch(error.message, /secret-token-value/);
      return true;
    }
  );
});

test('inspectAzureAuthReadiness confirms env-api-key readiness without exposing the secret value', async () => {
  process.env.AZURE_TEST_KEY = 'env-secret';

  const readiness = await inspectAzureAuthReadiness({
    mode: 'env-api-key',
    tenantId: '',
    subscriptionId: '',
    apiKeyEnvVar: 'AZURE_TEST_KEY',
    secretStorageKey: ''
  });

  assert.equal(readiness.status, 'ready');
  assert.equal(readiness.kind, 'api-key');
  assert.match(readiness.redactedSource, /environment variable AZURE_TEST_KEY/i);
  assert.doesNotMatch(readiness.detail, /env-secret/);
});

test('inspectAzureAuthReadiness reports bearer-token failures without leaking token-like substrings', async () => {
  setAzureCredentialFactoryOverride(() => ({
    credential: {
      getToken: async () => {
        throw new Error('Bearer secret-token-value was rejected by tenant policy');
      }
    },
    sourceLabel: 'DefaultAzureCredential'
  }));

  const readiness = await inspectAzureAuthReadiness({
    mode: 'az-bearer',
    tenantId: 'tenant-1',
    subscriptionId: 'sub-1',
    apiKeyEnvVar: '',
    secretStorageKey: ''
  });

  assert.equal(readiness.status, 'unavailable');
  assert.equal(readiness.kind, 'bearer');
  assert.match(readiness.redactedSource, /tenant tenant-1/i);
  assert.match(readiness.redactedSource, /subscription sub-1/i);
  assert.match(readiness.detail, /Azure bearer-token acquisition failed via DefaultAzureCredential/i);
  assert.doesNotMatch(readiness.detail, /secret-token-value/);
});
