import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { CopilotCliProvider } from '../src/codex/copilotCliProvider';
import { CodexExecResult, CodexExecRequest } from '../src/codex/types';
import { hashText } from '../src/ralph/integrity';

function request(): CodexExecRequest {
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
    reasoningEffort: 'medium',
    sandboxMode: 'workspace-write',
    approvalMode: 'never'
  };
}

function provider(approvalMode: 'allow-all' | 'allow-tools-only' | 'interactive' = 'allow-all'): CopilotCliProvider {
  return new CopilotCliProvider({ approvalMode });
}

test('buildLaunchSpec pipes prompt via stdin without -p flag', () => {
  const launch = provider().buildLaunchSpec(request(), false);

  // Should deliver prompt via stdinText — the Copilot CLI reads piped
  // input when no -p flag is present.
  assert.equal(launch.stdinText, 'Ship it.');

  // Must NOT include -p (piped input is ignored when -p is present).
  assert.ok(!launch.args.includes('-p'), 'should not have -p flag');
  assert.ok(!launch.args.includes('--prompt'), 'should not have --prompt flag');

  assert.ok(launch.args.includes('-s'), 'should include -s for silent mode');
  assert.ok(launch.args.includes('--no-ask-user'), 'should include --no-ask-user');
  assert.equal(launch.cwd, '/workspace/repo');
});

test('buildLaunchSpec supports allow-tools-only and interactive modes', () => {
  const toolsLaunch = provider('allow-tools-only').buildLaunchSpec(request(), false);
  assert.ok(toolsLaunch.args.includes('--allow-tool'));
  assert.ok(toolsLaunch.args.includes('shell'));
  assert.equal(toolsLaunch.stdinText, 'Ship it.');

  const interactiveLaunch = provider('interactive').buildLaunchSpec(request(), false);
  assert.ok(!interactiveLaunch.args.includes('--allow-all'));
  assert.ok(!interactiveLaunch.args.includes('--allow-tool'));
  assert.equal(interactiveLaunch.stdinText, 'Ship it.');
});

test('extractResponseText returns stdout text and persists it', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-copilot-'));
  const lastMessagePath = path.join(root, 'last-message.md');

  const text = await provider().extractResponseText('Done.\n', '', lastMessagePath);

  assert.equal(text, 'Done.');
  assert.equal(await fs.readFile(lastMessagePath, 'utf8'), 'Done.');
});

test('describeLaunchError explains missing Copilot CLI path', () => {
  const msg = provider().describeLaunchError('copilot', { code: 'ENOENT', message: 'spawn copilot ENOENT' });
  assert.match(msg, /GitHub Copilot CLI was not found/);
  assert.match(msg, /ralphCodex\.copilotCommandPath/);
});

test('buildTranscript produces Copilot-specific transcript format', () => {
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

  assert.match(transcript, /GitHub Copilot CLI Transcript/);
  assert.match(transcript, /Approval mode: allow-all/);
  assert.match(transcript, /Model: gpt-5.4/);
  assert.match(transcript, /Payload matched prompt artifact: yes/);
});

// ---------------------------------------------------------------------------
// Stdin prompt delivery for large prompts
// ---------------------------------------------------------------------------

test('buildLaunchSpec uses stdin for any prompt size', () => {
  const largePrompt = 'x'.repeat(100_000);
  const req = { ...request(), prompt: largePrompt, promptHash: hashText(largePrompt), promptByteLength: Buffer.byteLength(largePrompt, 'utf8') };
  const launch = provider().buildLaunchSpec(req, false);

  assert.equal(launch.stdinText, largePrompt);
  assert.ok(!launch.args.includes('-p'), 'should not have -p for large prompts');

  // Small prompts also use stdin for consistency.
  const smallPrompt = 'Hello';
  const smallReq = { ...request(), prompt: smallPrompt, promptHash: hashText(smallPrompt), promptByteLength: Buffer.byteLength(smallPrompt, 'utf8') };
  const smallLaunch = provider().buildLaunchSpec(smallReq, false);

  assert.equal(smallLaunch.stdinText, smallPrompt);
  assert.ok(!smallLaunch.args.includes('-p'), 'should not have -p for small prompts');
});

// ---------------------------------------------------------------------------
// Structured JSON output extraction
// ---------------------------------------------------------------------------

test('extractResponseText parses NDJSON result event from stdout', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-copilot-json-'));
  const lastMessagePath = path.join(root, 'last-message.md');
  const stdout = '{"type":"progress","message":"working..."}\n{"type":"result","result":"Task completed successfully."}\n';

  const text = await provider().extractResponseText(stdout, '', lastMessagePath);

  assert.equal(text, 'Task completed successfully.');
  assert.equal(await fs.readFile(lastMessagePath, 'utf8'), 'Task completed successfully.');
});

test('extractResponseText falls back to raw text when stdout is not JSON', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-copilot-raw-'));
  const lastMessagePath = path.join(root, 'last-message.md');

  const text = await provider().extractResponseText('Plain text output.', '', lastMessagePath);

  assert.equal(text, 'Plain text output.');
});

test('extractResponseText returns empty string for empty stdout', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-copilot-empty-'));
  const lastMessagePath = path.join(root, 'last-message.md');

  const text = await provider().extractResponseText('', '', lastMessagePath);

  assert.equal(text, '');
});
