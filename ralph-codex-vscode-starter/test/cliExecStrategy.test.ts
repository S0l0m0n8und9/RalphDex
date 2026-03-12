import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import {
  CliExecCodexStrategy,
  buildCodexExecArgs,
  buildCodexExecTranscript,
  describeCodexExecLaunchError,
  summarizeCodexExecResultMessage
} from '../src/codex/cliExecStrategy';
import { CodexExecRequest, CodexExecResult } from '../src/codex/types';
import { hashText } from '../src/ralph/integrity';
import { Logger } from '../src/services/logger';
import { ProcessLaunchError } from '../src/services/processRunner';

function request(): CodexExecRequest {
  return {
    commandPath: 'codex',
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
    approvalMode: 'on-request'
  };
}

function result(): CodexExecResult {
  return {
    strategy: 'cliExec',
    success: true,
    message: 'ok',
    warnings: [],
    exitCode: 0,
    stdout: 'stdout text',
    stderr: '',
    args: buildCodexExecArgs(request(), false),
    stdinHash: hashText('Ship it.'),
    transcriptPath: '/workspace/.ralph/runs/bootstrap-001.transcript.md',
    lastMessagePath: '/workspace/.ralph/runs/bootstrap-001.last-message.md',
    lastMessage: 'Final answer'
  };
}

function createLogger(): Logger {
  return new Logger({
    appendLine: () => undefined,
    append: () => undefined,
    show: () => undefined,
    dispose: () => undefined
  } as never);
}

test('buildCodexExecArgs appends stdin marker and optional git-skip flag', () => {
  assert.deepEqual(buildCodexExecArgs(request(), false), [
    'exec',
    '--model', 'gpt-5.4',
    '--config', 'model_reasoning_effort="medium"',
    '--sandbox', 'workspace-write',
    '--config', 'approval_policy="on-request"',
    '--cd', '/workspace/repo',
    '--output-last-message', '/workspace/.ralph/runs/bootstrap-001.last-message.md',
    '-'
  ]);

  assert.deepEqual(buildCodexExecArgs(request(), true), [
    'exec',
    '--model', 'gpt-5.4',
    '--config', 'model_reasoning_effort="medium"',
    '--sandbox', 'workspace-write',
    '--config', 'approval_policy="on-request"',
    '--cd', '/workspace/repo',
    '--output-last-message', '/workspace/.ralph/runs/bootstrap-001.last-message.md',
    '--skip-git-repo-check',
    '-'
  ]);
});

test('buildCodexExecTranscript captures command metadata and last message', () => {
  const transcript = buildCodexExecTranscript(result(), request());

  assert.match(transcript, /Codex Exec Transcript/);
  assert.match(transcript, /--model gpt-5.4/);
  assert.match(transcript, /model_reasoning_effort="medium"/);
  assert.match(transcript, /approval_policy="on-request"/);
  assert.match(transcript, /Reasoning effort: medium/);
  assert.match(transcript, /Workspace root: \/workspace/);
  assert.match(transcript, /Execution root: \/workspace\/repo/);
  assert.match(transcript, /Prompt path: \/workspace\/\.ralph\/prompts\/bootstrap-001\.prompt\.md/);
  assert.match(transcript, /Payload matched prompt artifact: yes/);
  assert.match(transcript, /Final answer/);
});

test('buildCodexExecArgs allows deliberate high reasoning escalation', () => {
  assert.deepEqual(buildCodexExecArgs({
    ...request(),
    reasoningEffort: 'high'
  }, false), [
    'exec',
    '--model', 'gpt-5.4',
    '--config', 'model_reasoning_effort="high"',
    '--sandbox', 'workspace-write',
    '--config', 'approval_policy="on-request"',
    '--cd', '/workspace/repo',
    '--output-last-message', '/workspace/.ralph/runs/bootstrap-001.last-message.md',
    '-'
  ]);
});

test('describeCodexExecLaunchError explains a missing Codex CLI path', () => {
  const launchError = new ProcessLaunchError(
    'codex',
    ['exec'],
    Object.assign(new Error('spawn codex ENOENT'), { code: 'ENOENT' })
  );

  assert.match(
    describeCodexExecLaunchError(request(), launchError),
    /Codex CLI was not found/
  );
});

test('summarizeCodexExecResultMessage surfaces the root failure detail from stderr', () => {
  assert.equal(
    summarizeCodexExecResultMessage({
      exitCode: 1,
      stderr: [
        'WARNING: failed to clean up stale arg0 temp dirs',
        'Reconnecting... 5/5 (stream disconnected before completion)',
        'ERROR: stream disconnected before completion: error sending request for url (https://chatgpt.com/backend-api/codex/responses)',
        'ERROR: Failed to shutdown rollout recorder'
      ].join('\n'),
      lastMessage: ''
    }),
    'codex exec exited with code 1: stream disconnected before completion: error sending request for url (https://chatgpt.com/backend-api/codex/responses)'
  );
});

test('CliExecCodexStrategy fails before launch when the stdin payload hash diverges from the plan', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-cli-integrity-'));
  const strategy = new CliExecCodexStrategy(createLogger());

  await assert.rejects(
    () => strategy.runExec({
      ...request(),
      workspaceRoot: root,
      executionRoot: root,
      transcriptPath: path.join(root, '.ralph', 'runs', 'bootstrap-001.transcript.md'),
      lastMessagePath: path.join(root, '.ralph', 'runs', 'bootstrap-001.last-message.md'),
      promptHash: hashText('different prompt')
    }),
    /Execution integrity check failed before launch/
  );
});

test('CliExecCodexStrategy records a summarized stderr failure reason', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-cli-failure-'));
  const commandPath = path.join(root, 'fake-codex.sh');
  await fs.writeFile(commandPath, [
    '#!/bin/sh',
    'cat >/dev/null',
    'echo "ERROR: stream disconnected before completion: network offline" >&2',
    'echo "ERROR: Failed to shutdown rollout recorder" >&2',
    'exit 1'
  ].join('\n'), 'utf8');
  await fs.chmod(commandPath, 0o755);

  const strategy = new CliExecCodexStrategy(createLogger());
  const result = await strategy.runExec({
    ...request(),
    commandPath,
    workspaceRoot: root,
    executionRoot: root,
    transcriptPath: path.join(root, '.ralph', 'runs', 'bootstrap-001.transcript.md'),
    lastMessagePath: path.join(root, '.ralph', 'runs', 'bootstrap-001.last-message.md')
  });

  assert.equal(result.exitCode, 1);
  assert.equal(result.message, 'codex exec exited with code 1: stream disconnected before completion: network offline');
  assert.match(result.stderr, /network offline/);
});
