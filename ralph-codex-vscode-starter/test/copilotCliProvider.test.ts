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

test('buildLaunchSpec uses argv prompt mode and executionRoot cwd', () => {
  const launch = provider().buildLaunchSpec(request(), false);

  assert.deepEqual(launch.args, ['-s', '--model', 'gpt-5.4', '--allow-all', '-p', 'Ship it.']);
  assert.equal(launch.cwd, '/workspace/repo');
  assert.equal(launch.stdinText, undefined);
});

test('buildLaunchSpec supports allow-tools-only and interactive modes', () => {
  assert.deepEqual(
    provider('allow-tools-only').buildLaunchSpec(request(), false).args,
    ['-s', '--model', 'gpt-5.4', '--allow-tool', 'shell', '-p', 'Ship it.']
  );
  assert.deepEqual(
    provider('interactive').buildLaunchSpec(request(), false).args,
    ['-s', '--model', 'gpt-5.4', '-p', 'Ship it.']
  );
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
  const res: CodexExecResult = {
    strategy: 'cliExec',
    success: true,
    message: 'ok',
    warnings: [],
    exitCode: 0,
    stdout: 'done',
    stderr: '',
    args: p.buildLaunchSpec(req, false).args,
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
