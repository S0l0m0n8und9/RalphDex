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

// ---------------------------------------------------------------------------
// API key redaction — key must never appear in transcripts
// ---------------------------------------------------------------------------

test('buildTranscript does not include API key value when key is configured', () => {
  const secretKey = 'super-secret-api-key-12345';
  const p = new AzureFoundryProvider({ endpointUrl: ENDPOINT_URL, apiKey: secretKey });
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

  const transcript = p.buildTranscript(res, req);

  assert.ok(!transcript.includes(secretKey), 'API key must not appear in transcript');
});

test('executeDirectly sends api-key header when API key is configured', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-azure-key-header-'));
  const req = {
    ...request(),
    transcriptPath: path.join(root, 'transcript.md'),
    lastMessagePath: path.join(root, 'last-message.md')
  };

  await fs.mkdir(root, { recursive: true });

  const secretKey = 'my-secret-key-abc';
  const p = new AzureFoundryProvider({ endpointUrl: ENDPOINT_URL, apiKey: secretKey });

  let capturedHeaders: Record<string, string> | undefined;
  setHttpsClientOverride(async (opts) => {
    capturedHeaders = opts.headers;
    return { responseBody: JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), statusCode: 200 };
  });
  try {
    await p.executeDirectly(req);

    assert.equal(capturedHeaders?.['api-key'], secretKey, 'api-key header must equal the configured key');
  } finally {
    setHttpsClientOverride(null);
  }
});

test('executeDirectly omits api-key header and warns when no API key is configured', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-azure-no-key-'));
  const req = {
    ...request(),
    transcriptPath: path.join(root, 'transcript.md'),
    lastMessagePath: path.join(root, 'last-message.md')
  };

  await fs.mkdir(root, { recursive: true });

  let capturedHeaders: Record<string, string> | undefined;
  setHttpsClientOverride(async (opts) => {
    capturedHeaders = opts.headers;
    return { responseBody: JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), statusCode: 200 };
  });
  try {
    // provider() creates AzureFoundryProvider without apiKey
    const result = await provider().executeDirectly(req);

    assert.ok(!('api-key' in (capturedHeaders ?? {})), 'api-key header must not be sent when key is not configured');
    assert.ok(result.warnings.length > 0, 'should have at least one warning');
    assert.ok(
      result.warnings.some((w) => /Azure AD/i.test(w)),
      'warning should mention Azure AD'
    );
  } finally {
    setHttpsClientOverride(null);
  }
});

// ---------------------------------------------------------------------------
// Prompt caching — cache_control placement and promptCacheStats
// ---------------------------------------------------------------------------

const PROMPT_WITH_BOUNDARY = `# System\n\nYou are Ralph.${STATIC_PREFIX_BOUNDARY}## Dynamic Section\n\nDo the task.`;

test('executeDirectly sends message content as array with cache_control on static prefix', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-azure-cache-ctrl-'));
  const req = {
    ...request(),
    prompt: PROMPT_WITH_BOUNDARY,
    promptHash: hashText(PROMPT_WITH_BOUNDARY),
    promptByteLength: Buffer.byteLength(PROMPT_WITH_BOUNDARY, 'utf8'),
    transcriptPath: path.join(root, 'transcript.md'),
    lastMessagePath: path.join(root, 'last-message.md')
  };

  await fs.mkdir(root, { recursive: true });

  let capturedBody: unknown;
  setHttpsClientOverride(async (opts) => {
    capturedBody = JSON.parse(opts.body);
    return { responseBody: JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), statusCode: 200 };
  });
  try {
    await provider().executeDirectly(req);

    const body = capturedBody as { messages: Array<{ role: string; content: unknown }> };
    const content = body.messages[0].content;
    assert.ok(Array.isArray(content), 'content should be an array when boundary is present');

    const blocks = content as Array<{ type: string; text: string; cache_control?: { type: string } }>;
    assert.equal(blocks[0].cache_control?.type, 'ephemeral', 'first block should have cache_control ephemeral');
    assert.ok(!blocks[1].cache_control, 'second block should not have cache_control');
  } finally {
    setHttpsClientOverride(null);
  }
});

test('executeDirectly returns promptCacheStats with staticPrefixBytes set', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-azure-cache-bytes-'));
  const req = {
    ...request(),
    prompt: PROMPT_WITH_BOUNDARY,
    promptHash: hashText(PROMPT_WITH_BOUNDARY),
    promptByteLength: Buffer.byteLength(PROMPT_WITH_BOUNDARY, 'utf8'),
    transcriptPath: path.join(root, 'transcript.md'),
    lastMessagePath: path.join(root, 'last-message.md')
  };

  await fs.mkdir(root, { recursive: true });

  setHttpsClientOverride(async () => ({
    responseBody: JSON.stringify({ choices: [{ message: { content: 'ok' } }] }),
    statusCode: 200
  }));
  try {
    const result = await provider().executeDirectly(req);

    assert.ok(result.promptCacheStats, 'promptCacheStats should be present on success');
    const boundaryIdx = PROMPT_WITH_BOUNDARY.indexOf(STATIC_PREFIX_BOUNDARY);
    const expectedStaticPrefixBytes = Buffer.byteLength(PROMPT_WITH_BOUNDARY.slice(0, boundaryIdx + 1), 'utf8');
    assert.equal(result.promptCacheStats?.staticPrefixBytes, expectedStaticPrefixBytes,
      'staticPrefixBytes should equal the byte length of the static prefix');
  } finally {
    setHttpsClientOverride(null);
  }
});

test('executeDirectly sets cacheHit=true when response reports cache_read_input_tokens > 0', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-azure-cache-hit-'));
  const req = {
    ...request(),
    transcriptPath: path.join(root, 'transcript.md'),
    lastMessagePath: path.join(root, 'last-message.md')
  };

  await fs.mkdir(root, { recursive: true });

  setHttpsClientOverride(async () => ({
    responseBody: JSON.stringify({
      choices: [{ message: { content: 'ok' } }],
      usage: { cache_read_input_tokens: 500, cache_creation_input_tokens: 0 }
    }),
    statusCode: 200
  }));
  try {
    const result = await provider().executeDirectly(req);

    assert.equal(result.promptCacheStats?.cacheHit, true, 'cacheHit should be true when cache_read_input_tokens > 0');
  } finally {
    setHttpsClientOverride(null);
  }
});

test('executeDirectly sets cacheHit=false when only cache_creation_input_tokens is present', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-azure-cache-miss-'));
  const req = {
    ...request(),
    transcriptPath: path.join(root, 'transcript.md'),
    lastMessagePath: path.join(root, 'last-message.md')
  };

  await fs.mkdir(root, { recursive: true });

  setHttpsClientOverride(async () => ({
    responseBody: JSON.stringify({
      choices: [{ message: { content: 'ok' } }],
      usage: { cache_read_input_tokens: 0, cache_creation_input_tokens: 800 }
    }),
    statusCode: 200
  }));
  try {
    const result = await provider().executeDirectly(req);

    assert.equal(result.promptCacheStats?.cacheHit, false, 'cacheHit should be false when cache_read_input_tokens is 0');
  } finally {
    setHttpsClientOverride(null);
  }
});

test('executeDirectly sets cacheHit=null when response has no cache usage data', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-azure-cache-null-'));
  const req = {
    ...request(),
    transcriptPath: path.join(root, 'transcript.md'),
    lastMessagePath: path.join(root, 'last-message.md')
  };

  await fs.mkdir(root, { recursive: true });

  setHttpsClientOverride(async () => ({
    responseBody: JSON.stringify({
      choices: [{ message: { content: 'ok' } }]
      // no usage field
    }),
    statusCode: 200
  }));
  try {
    const result = await provider().executeDirectly(req);

    assert.equal(result.promptCacheStats?.cacheHit, null, 'cacheHit should be null when response has no cache usage');
  } finally {
    setHttpsClientOverride(null);
  }
});

// ---------------------------------------------------------------------------
// promptCaching: off — cache_control omitted
// ---------------------------------------------------------------------------

test('executeDirectly omits cache_control when promptCaching is off', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-azure-caching-off-'));
  const req = {
    ...request(),
    prompt: PROMPT_WITH_BOUNDARY,
    promptHash: hashText(PROMPT_WITH_BOUNDARY),
    promptByteLength: Buffer.byteLength(PROMPT_WITH_BOUNDARY, 'utf8'),
    transcriptPath: path.join(root, 'transcript.md'),
    lastMessagePath: path.join(root, 'last-message.md')
  };

  await fs.mkdir(root, { recursive: true });

  let capturedBody: unknown;
  setHttpsClientOverride(async (opts) => {
    capturedBody = JSON.parse(opts.body);
    return { responseBody: JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), statusCode: 200 };
  });
  try {
    const p = new AzureFoundryProvider({ endpointUrl: ENDPOINT_URL, promptCaching: 'off' });
    await p.executeDirectly(req);

    const body = capturedBody as { messages: Array<{ role: string; content: unknown }> };
    const content = body.messages[0].content;
    assert.ok(Array.isArray(content), 'content should be an array');

    const blocks = content as Array<{ type: string; text: string; cache_control?: unknown }>;
    assert.equal(blocks.length, 1, 'off mode should send a single text block');
    assert.ok(!blocks[0].cache_control, 'single block must not have cache_control when promptCaching is off');
    assert.equal(blocks[0].text, PROMPT_WITH_BOUNDARY, 'full prompt should be sent as a single block');
  } finally {
    setHttpsClientOverride(null);
  }
});

test('executeDirectly applies cache_control normally when promptCaching is force', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-azure-caching-force-'));
  const req = {
    ...request(),
    prompt: PROMPT_WITH_BOUNDARY,
    promptHash: hashText(PROMPT_WITH_BOUNDARY),
    promptByteLength: Buffer.byteLength(PROMPT_WITH_BOUNDARY, 'utf8'),
    transcriptPath: path.join(root, 'transcript.md'),
    lastMessagePath: path.join(root, 'last-message.md')
  };

  await fs.mkdir(root, { recursive: true });

  let capturedBody: unknown;
  setHttpsClientOverride(async (opts) => {
    capturedBody = JSON.parse(opts.body);
    return { responseBody: JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), statusCode: 200 };
  });
  try {
    const p = new AzureFoundryProvider({ endpointUrl: ENDPOINT_URL, promptCaching: 'force' });
    await p.executeDirectly(req);

    const body = capturedBody as { messages: Array<{ role: string; content: unknown }> };
    const content = body.messages[0].content;
    const blocks = content as Array<{ type: string; text: string; cache_control?: { type: string } }>;
    assert.equal(blocks[0].cache_control?.type, 'ephemeral', 'force mode should still apply cache_control on Azure direct-HTTPS');
  } finally {
    setHttpsClientOverride(null);
  }
});
