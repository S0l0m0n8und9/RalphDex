import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { AzureFoundryProvider } from '../src/codex/azureFoundryProvider';
import {
  configureAzureSecretStorage,
  setAzureCredentialFactoryOverride
} from '../src/codex/azureAuthResolver';
import { createCliProviderForId } from '../src/codex/providerFactory';
import { DEFAULT_CONFIG } from '../src/config/defaults';
import { CodexExecRequest, CodexExecResult } from '../src/codex/types';
import { hashText } from '../src/ralph/integrity';
import { STATIC_PREFIX_BOUNDARY } from '../src/prompt/promptBuilder';
import { setHttpsClientOverride } from '../src/services/httpsClient';

const ENDPOINT_URL = 'https://my-project.inference.ai.azure.com/models/my-deployment';

function request(): CodexExecRequest {
  return {
    commandPath: 'azure-foundry',
    workspaceRoot: '/workspace',
    executionRoot: '/workspace/repo',
    prompt: 'Ship it.',
    promptPath: '/workspace/.ralph/prompts/bootstrap-001.prompt.md',
    promptHash: hashText('Ship it.'),
    promptByteLength: Buffer.byteLength('Ship it.', 'utf8'),
    transcriptPath: '/workspace/.ralph/runs/bootstrap-001.transcript.md',
    lastMessagePath: '/workspace/.ralph/runs/bootstrap-001.last-message.md',
    model: 'gpt-4o',
    reasoningEffort: 'medium',
    sandboxMode: 'workspace-write',
    approvalMode: 'never'
  };
}

function provider(overrides: Partial<ConstructorParameters<typeof AzureFoundryProvider>[0]> = {}): AzureFoundryProvider {
  return new AzureFoundryProvider({
    endpointUrl: ENDPOINT_URL,
    auth: {
      mode: 'env-api-key',
      tenantId: '',
      subscriptionId: '',
      apiKeyEnvVar: 'AZURE_OPENAI_API_KEY',
      secretStorageKey: ''
    },
    ...overrides
  });
}

test.afterEach(() => {
  delete process.env.AZURE_OPENAI_API_KEY;
  setHttpsClientOverride(null);
  configureAzureSecretStorage(null);
  setAzureCredentialFactoryOverride(null);
});

test('buildLaunchSpec includes configured endpoint URL and request model', () => {
  const launch = provider().buildLaunchSpec(request(), false);
  assert.equal(launch.args[launch.args.indexOf('--endpoint') + 1], ENDPOINT_URL);
  assert.equal(launch.args[launch.args.indexOf('--model') + 1], 'gpt-4o');
  assert.equal(launch.stdinText, 'Ship it.');
});

test('describeLaunchError points at grouped command path config', () => {
  const msg = provider().describeLaunchError('azure-foundry', { code: 'ENOENT', message: 'spawn azure-foundry ENOENT' });
  assert.match(msg, /ralphCodex\.azureFoundry\.commandPath/);
});

test('createCliProviderForId returns AzureFoundryProvider for azure-foundry', () => {
  const config = {
    ...DEFAULT_CONFIG,
    azureFoundry: {
      ...DEFAULT_CONFIG.azureFoundry,
      endpointUrl: ENDPOINT_URL
    }
  };

  const p = createCliProviderForId('azure-foundry', config);
  assert.equal(p.id, 'azure-foundry');
  assert.ok(p instanceof AzureFoundryProvider);
});

test('buildTranscript does not leak environment-sourced API key values', () => {
  process.env.AZURE_OPENAI_API_KEY = 'super-secret-api-key-12345';
  const req = request();
  const res: CodexExecResult = {
    strategy: 'cliExec',
    success: true,
    message: 'ok',
    warnings: [],
    exitCode: 0,
    stdout: 'response body',
    stderr: '',
    args: [],
    stdinHash: hashText('Ship it.'),
    transcriptPath: req.transcriptPath,
    lastMessagePath: req.lastMessagePath,
    lastMessage: 'Task done.'
  };

  const transcript = provider().buildTranscript(res, req);
  assert.ok(!transcript.includes(process.env.AZURE_OPENAI_API_KEY ?? ''));
});

test('executeDirectly sends api-key header when auth mode is env-api-key', async () => {
  process.env.AZURE_OPENAI_API_KEY = 'my-secret-key-abc';
  let capturedHeaders: Record<string, string> | undefined;
  setHttpsClientOverride(async (opts) => {
    capturedHeaders = opts.headers;
    return { responseBody: JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), statusCode: 200 };
  });

  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-azure-key-header-'));
  const req = {
    ...request(),
    transcriptPath: path.join(root, 'transcript.md'),
    lastMessagePath: path.join(root, 'last-message.md')
  };

  const result = await provider().executeDirectly(req);

  assert.equal(result.success, true);
  assert.equal(capturedHeaders?.['api-key'], 'my-secret-key-abc');
  assert.ok(!capturedHeaders?.Authorization);
});

test('executeDirectly sends api-key header when auth mode is vscode-secret', async () => {
  configureAzureSecretStorage({
    get: async (key: string) => key === 'azure-foundry.secret' ? 'secret-from-storage' : undefined
  });

  let capturedHeaders: Record<string, string> | undefined;
  setHttpsClientOverride(async (opts) => {
    capturedHeaders = opts.headers;
    return { responseBody: JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), statusCode: 200 };
  });

  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-azure-secret-header-'));
  const req = {
    ...request(),
    transcriptPath: path.join(root, 'transcript.md'),
    lastMessagePath: path.join(root, 'last-message.md')
  };

  const result = await provider({
    auth: {
      mode: 'vscode-secret',
      tenantId: '',
      subscriptionId: '',
      apiKeyEnvVar: '',
      secretStorageKey: 'azure-foundry.secret'
    }
  }).executeDirectly(req);

  assert.equal(result.success, true);
  assert.equal(capturedHeaders?.['api-key'], 'secret-from-storage');
});

test('executeDirectly sends bearer token when auth mode is az-bearer', async () => {
  setAzureCredentialFactoryOverride((config) => {
    assert.equal(config.tenantId, 'tenant-1');
    assert.equal(config.subscriptionId, 'sub-1');
    return {
      credential: {
        getToken: async (scopes) => {
          assert.deepEqual(Array.isArray(scopes) ? scopes : [scopes], ['https://cognitiveservices.azure.com/.default']);
          return { token: 'mock-bearer-token' };
        }
      },
      sourceLabel: 'DefaultAzureCredential'
    };
  });

  let capturedHeaders: Record<string, string> | undefined;
  setHttpsClientOverride(async (opts) => {
    capturedHeaders = opts.headers;
    return { responseBody: JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), statusCode: 200 };
  });

  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-azure-bearer-header-'));
  const req = {
    ...request(),
    transcriptPath: path.join(root, 'transcript.md'),
    lastMessagePath: path.join(root, 'last-message.md')
  };

  const result = await provider({
    auth: {
      mode: 'az-bearer',
      tenantId: 'tenant-1',
      subscriptionId: 'sub-1',
      apiKeyEnvVar: '',
      secretStorageKey: ''
    }
  }).executeDirectly(req);

  assert.equal(result.success, true);
  assert.equal(capturedHeaders?.Authorization, 'Bearer mock-bearer-token');
  assert.ok(result.warnings.some((warning) => /Azure bearer-token authentication/i.test(warning)));
  assert.ok(result.warnings.every((warning) => !warning.includes('mock-bearer-token')));
});

test('executeDirectly returns failure when required API key env var is missing', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-azure-missing-env-'));
  const req = {
    ...request(),
    transcriptPath: path.join(root, 'transcript.md'),
    lastMessagePath: path.join(root, 'last-message.md')
  };

  const result = await provider({
    auth: {
      mode: 'env-api-key',
      tenantId: '',
      subscriptionId: '',
      apiKeyEnvVar: 'MISSING_AZURE_KEY',
      secretStorageKey: ''
    }
  }).executeDirectly(req);

  assert.equal(result.success, false);
  assert.match(result.message, /MISSING_AZURE_KEY/);
});

test('extractResponseText parses Azure Foundry JSON response and persists content', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-azure-foundry-'));
  const lastMessagePath = path.join(root, 'last-message.md');
  const stdout = JSON.stringify({ choices: [{ message: { content: 'Task completed successfully.' } }] });

  const text = await provider().extractResponseText(stdout, '', lastMessagePath);

  assert.equal(text, 'Task completed successfully.');
  assert.equal(await fs.readFile(lastMessagePath, 'utf8'), 'Task completed successfully.');
});

const PROMPT_WITH_BOUNDARY = `# System\n\nYou are Ralph.${STATIC_PREFIX_BOUNDARY}## Dynamic Section\n\nDo the task.`;

test('executeDirectly applies cache_control markers when promptCaching is force', async () => {
  process.env.AZURE_OPENAI_API_KEY = 'cache-key';
  let capturedBody: unknown;
  setHttpsClientOverride(async (opts) => {
    capturedBody = JSON.parse(opts.body);
    return { responseBody: JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), statusCode: 200 };
  });

  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-azure-caching-force-'));
  const req = {
    ...request(),
    prompt: PROMPT_WITH_BOUNDARY,
    promptHash: hashText(PROMPT_WITH_BOUNDARY),
    promptByteLength: Buffer.byteLength(PROMPT_WITH_BOUNDARY, 'utf8'),
    transcriptPath: path.join(root, 'transcript.md'),
    lastMessagePath: path.join(root, 'last-message.md')
  };

  const result = await provider({ promptCaching: 'force' }).executeDirectly(req);

  assert.equal(result.success, true);
  const body = capturedBody as { messages: Array<{ content: Array<{ cache_control?: { type: string } }> }> };
  assert.equal(body.messages[0].content[0].cache_control?.type, 'ephemeral');
});
