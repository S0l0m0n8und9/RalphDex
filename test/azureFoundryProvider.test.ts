import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { AzureFoundryProvider } from '../src/codex/azureFoundryProvider';
import { createCliProviderForId } from '../src/codex/providerFactory';
import { DEFAULT_CONFIG } from '../src/config/defaults';
import { CodexExecRequest, CodexExecResult } from '../src/codex/types';
import { hashText } from '../src/ralph/integrity';
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

function provider(endpointUrl = ENDPOINT_URL): AzureFoundryProvider {
  return new AzureFoundryProvider({ endpointUrl });
}

// ---------------------------------------------------------------------------
// buildLaunchSpec
// ---------------------------------------------------------------------------

test('buildLaunchSpec includes configured endpoint URL', () => {
  const launch = provider().buildLaunchSpec(request(), false);

  assert.ok(launch.args.includes('--endpoint'), 'should include --endpoint flag');
  const endpointIdx = launch.args.indexOf('--endpoint');
  assert.equal(launch.args[endpointIdx + 1], ENDPOINT_URL, 'endpoint value should match configured URL');
});

test('buildLaunchSpec includes model from request', () => {
  const launch = provider().buildLaunchSpec(request(), false);

  assert.ok(launch.args.includes('--model'), 'should include --model flag');
  const modelIdx = launch.args.indexOf('--model');
  assert.equal(launch.args[modelIdx + 1], 'gpt-4o', 'model should match request.model');
});

test('buildLaunchSpec pipes prompt via stdin', () => {
  const launch = provider().buildLaunchSpec(request(), false);

  assert.equal(launch.stdinText, 'Ship it.');
  assert.equal(launch.cwd, '/workspace/repo');
});

// ---------------------------------------------------------------------------
// extractResponseText — success
// ---------------------------------------------------------------------------

test('extractResponseText parses Azure Foundry JSON response and persists content', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-azure-foundry-'));
  const lastMessagePath = path.join(root, 'last-message.md');

  const stdout = JSON.stringify({
    choices: [{ message: { content: 'Task completed successfully.' } }]
  });

  const text = await provider().extractResponseText(stdout, '', lastMessagePath);

  assert.equal(text, 'Task completed successfully.');
  assert.equal(await fs.readFile(lastMessagePath, 'utf8'), 'Task completed successfully.');
});

test('extractResponseText falls back to raw text when stdout is not JSON', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-azure-foundry-raw-'));
  const lastMessagePath = path.join(root, 'last-message.md');

  const text = await provider().extractResponseText('Plain text output.', '', lastMessagePath);

  assert.equal(text, 'Plain text output.');
  assert.equal(await fs.readFile(lastMessagePath, 'utf8'), 'Plain text output.');
});

test('extractResponseText returns empty string for empty stdout', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-azure-foundry-empty-'));
  const lastMessagePath = path.join(root, 'last-message.md');

  const text = await provider().extractResponseText('', '', lastMessagePath);

  assert.equal(text, '');
});

// ---------------------------------------------------------------------------
// describeLaunchError — ENOENT and non-200 status
// ---------------------------------------------------------------------------

test('describeLaunchError explains missing CLI path', () => {
  const msg = provider().describeLaunchError('azure-foundry', { code: 'ENOENT', message: 'spawn azure-foundry ENOENT' });

  assert.match(msg, /Azure AI Foundry CLI was not found/);
  assert.match(msg, /ralphCodex\.azureFoundryCommandPath/);
});

test('describeLaunchError describes non-200 HTTP status', () => {
  const msg = provider().describeLaunchError('azure-foundry', {
    code: 'HTTP_ERROR',
    message: '401 Unauthorized: Invalid API key'
  });

  assert.match(msg, /Azure AI Foundry endpoint returned an error/);
  assert.match(msg, /401/);
});

test('describeLaunchError describes non-200 status via message pattern', () => {
  const msg = provider().describeLaunchError('azure-foundry', {
    message: 'Request failed with status 404'
  });

  assert.match(msg, /Azure AI Foundry endpoint returned an error/);
  assert.match(msg, /404/);
});

test('describeLaunchError describes generic launch failure', () => {
  const msg = provider().describeLaunchError('azure-foundry', { message: 'permission denied' });

  assert.match(msg, /Failed to start Azure AI Foundry CLI/);
  assert.match(msg, /permission denied/);
});

// ---------------------------------------------------------------------------
// createCliProviderForId — factory wiring
// ---------------------------------------------------------------------------

test('createCliProviderForId returns AzureFoundryProvider for azure-foundry', () => {
  const config = {
    ...DEFAULT_CONFIG,
    azureFoundryEndpointUrl: ENDPOINT_URL
  };

  const p = createCliProviderForId('azure-foundry', config);

  assert.equal(p.id, 'azure-foundry');
  assert.ok(p instanceof AzureFoundryProvider);
});

// ---------------------------------------------------------------------------
// buildTranscript
// ---------------------------------------------------------------------------

test('buildTranscript produces Azure-specific transcript format', () => {
  const p = provider();
  const req = request();
  const launch = p.buildLaunchSpec(req, false);
  const res: CodexExecResult = {
    strategy: 'cliExec',
    success: true,
    message: 'ok',
    warnings: [],
    exitCode: 0,
    stdout: 'done',
    stderr: '',
    args: launch.args,
    stdinHash: hashText('Ship it.'),
    transcriptPath: req.transcriptPath,
    lastMessagePath: req.lastMessagePath,
    lastMessage: 'done'
  };

  const transcript = p.buildTranscript(res, req);

  assert.match(transcript, /Azure AI Foundry Transcript/);
  assert.match(transcript, new RegExp(ENDPOINT_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(transcript, /Model: gpt-4o/);
  assert.match(transcript, /Payload matched prompt artifact: yes/);
});

test('buildTranscript shows "Direct HTTPS POST" label when args is empty', () => {
  const p = provider();
  const req = request();
  const res: CodexExecResult = {
    strategy: 'cliExec',
    success: true,
    message: 'ok',
    warnings: [],
    exitCode: 0,
    stdout: 'done',
    stderr: '',
    args: [],
    stdinHash: hashText('Ship it.'),
    transcriptPath: req.transcriptPath,
    lastMessagePath: req.lastMessagePath,
    lastMessage: 'done'
  };

  const transcript = p.buildTranscript(res, req);

  assert.match(transcript, /Direct HTTPS POST to/);
  assert.match(transcript, new RegExp(ENDPOINT_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

// ---------------------------------------------------------------------------
// executeDirectly — HTTPS path
// ---------------------------------------------------------------------------

test('executeDirectly extracts content from a successful Azure Foundry response', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-azure-direct-ok-'));
  const req = {
    ...request(),
    transcriptPath: path.join(root, 'transcript.md'),
    lastMessagePath: path.join(root, 'last-message.md')
  };

  await fs.mkdir(root, { recursive: true });

  const responseJson = JSON.stringify({
    choices: [{ message: { content: 'Direct response text.' } }]
  });

  setHttpsClientOverride(async () => ({ responseBody: responseJson, statusCode: 200 }));
  try {
    const result = await provider().executeDirectly(req);

    assert.equal(result.exitCode, 0);
    assert.equal(result.success, true);
    assert.equal(result.lastMessage, 'Direct response text.');
    assert.equal(result.stdout, responseJson);
    assert.deepEqual(result.args, []);
    assert.equal(await fs.readFile(req.lastMessagePath, 'utf8'), 'Direct response text.');
  } finally {
    setHttpsClientOverride(null);
  }
});

test('executeDirectly returns failure result on HTTP error status', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-azure-direct-err-'));
  const req = {
    ...request(),
    transcriptPath: path.join(root, 'transcript.md'),
    lastMessagePath: path.join(root, 'last-message.md')
  };

  await fs.mkdir(root, { recursive: true });

  const errorBody = JSON.stringify({ error: { message: 'Invalid API key', code: 'unauthorized' } });

  setHttpsClientOverride(async () => ({ responseBody: errorBody, statusCode: 401 }));
  try {
    const result = await provider().executeDirectly(req);

    assert.equal(result.exitCode, 1);
    assert.equal(result.success, false);
    assert.match(result.message, /HTTP 401/);
    assert.match(result.message, /Invalid API key/);
    assert.equal(result.lastMessage, '');
  } finally {
    setHttpsClientOverride(null);
  }
});

test('executeDirectly returns failure result on network error or timeout', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-azure-direct-timeout-'));
  const req = {
    ...request(),
    transcriptPath: path.join(root, 'transcript.md'),
    lastMessagePath: path.join(root, 'last-message.md')
  };

  await fs.mkdir(root, { recursive: true });

  setHttpsClientOverride(async () => { throw new Error('HTTPS request timed out after 5000ms'); });
  try {
    const result = await provider().executeDirectly(req);

    assert.equal(result.exitCode, 1);
    assert.equal(result.success, false);
    assert.match(result.message, /Azure AI Foundry HTTPS request failed/);
    assert.match(result.message, /timed out/);
  } finally {
    setHttpsClientOverride(null);
  }
});
