import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { CopilotFoundryCliProvider } from '../src/codex/copilotFoundryCliProvider';
import { configureAzureSecretStorage } from '../src/codex/azureAuthResolver';
import { hashText } from '../src/ralph/integrity';
import { setProcessRunnerOverride } from '../src/services/processRunner';

function provider() {
  return new CopilotFoundryCliProvider({
    commandPath: 'copilot',
    approvalMode: 'allow-all',
    maxAutopilotContinues: 200,
    auth: {
      mode: 'az-bearer',
      tenantId: 'tenant-1',
      subscriptionId: 'sub-1',
      apiKeyEnvVar: '',
      secretStorageKey: ''
    },
    azure: {
      resourceGroup: 'rg-1',
      resourceName: 'resource-1',
      baseUrlOverride: ''
    },
    model: {
      deployment: 'deployment-1',
      wireApi: 'responses'
    }
  });
}

function request() {
  return {
    commandPath: 'copilot',
    workspaceRoot: '/workspace',
    executionRoot: '/workspace/repo',
    prompt: 'Ship it.',
    promptPath: '/workspace/.ralph/prompts/bootstrap-001.prompt.md',
    promptHash: hashText('Ship it.'),
    promptByteLength: Buffer.byteLength('Ship it.', 'utf8'),
    transcriptPath: '/workspace/.ralph/runs/bootstrap-001.transcript.md',
    lastMessagePath: '/workspace/.ralph/runs/bootstrap-001.last-message.md',
    model: 'gpt-5.4',
    reasoningEffort: 'medium' as const,
    sandboxMode: 'workspace-write' as const,
    approvalMode: 'never' as const
  };
}

test.afterEach(() => {
  setProcessRunnerOverride(null);
  configureAzureSecretStorage(null);
});

test('prepareLaunchSpec injects Azure Copilot BYOK environment variables', async () => {
  setProcessRunnerOverride(async () => ({
    code: 0,
    stdout: JSON.stringify({ accessToken: 'bearer-token' }),
    stderr: ''
  }));

  const launch = await provider().prepareLaunchSpec!(request(), false);

  assert.equal(launch.env?.COPILOT_PROVIDER_TYPE, 'azure');
  assert.equal(launch.env?.COPILOT_PROVIDER_BASE_URL, 'https://resource-1.openai.azure.com');
  assert.equal(launch.env?.COPILOT_PROVIDER_WIRE_API, 'responses');
  assert.equal(launch.env?.COPILOT_PROVIDER_MODEL_ID, 'gpt-5.4');
  assert.equal(launch.env?.COPILOT_PROVIDER_WIRE_MODEL, 'deployment-1');
  assert.equal(launch.env?.COPILOT_PROVIDER_BEARER_TOKEN, 'bearer-token');
});

test('prepareLaunchSpec supports vscode-secret API key mode', async () => {
  configureAzureSecretStorage({
    get: async () => 'secret-key'
  });

  const p = new CopilotFoundryCliProvider({
    commandPath: 'copilot',
    approvalMode: 'allow-all',
    maxAutopilotContinues: 200,
    auth: {
      mode: 'vscode-secret',
      tenantId: '',
      subscriptionId: '',
      apiKeyEnvVar: '',
      secretStorageKey: 'copilot.secret'
    },
    azure: {
      resourceGroup: 'rg-1',
      resourceName: 'resource-1',
      baseUrlOverride: ''
    },
    model: {
      deployment: 'deployment-1',
      wireApi: 'responses'
    }
  });

  const launch = await p.prepareLaunchSpec!(request(), false);
  assert.equal(launch.env?.COPILOT_PROVIDER_API_KEY, 'secret-key');
});

test('extractResponseText returns the last assistant message from Copilot JSONL output', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-copilot-foundry-'));
  const lastMessagePath = path.join(root, 'last-message.md');

  const stdout = [
    JSON.stringify({ type: 'assistant.message', data: { content: 'first message' } }),
    JSON.stringify({ type: 'assistant.message', data: { content: 'final message' } })
  ].join('\n');

  const text = await provider().extractResponseText(stdout, '', lastMessagePath);
  assert.equal(text, 'final message');
  assert.equal(await fs.readFile(lastMessagePath, 'utf8'), 'final message');
});
