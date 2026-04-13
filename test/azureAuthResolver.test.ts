import assert from 'node:assert/strict';
import test from 'node:test';
import { configureAzureSecretStorage, resolveAzureAuth } from '../src/codex/azureAuthResolver';
import { setProcessRunnerOverride } from '../src/services/processRunner';

test.afterEach(() => {
  delete process.env.AZURE_TEST_KEY;
  configureAzureSecretStorage(null);
  setProcessRunnerOverride(null);
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

test('resolveAzureAuth requests Azure CLI bearer token for az-bearer mode', async () => {
  setProcessRunnerOverride(async (command, args) => {
    assert.equal(command, 'az');
    assert.ok(args.includes('--tenant'));
    assert.ok(args.includes('--subscription'));
    return {
      code: 0,
      stdout: JSON.stringify({ accessToken: 'cli-token' }),
      stderr: ''
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
  assert.equal(auth.headerValue, 'Bearer cli-token');
  assert.equal(auth.copilotEnv.COPILOT_PROVIDER_BEARER_TOKEN, 'cli-token');
});
