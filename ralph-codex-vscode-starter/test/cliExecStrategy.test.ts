import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import {
  CliExecCodexStrategy
} from '../src/codex/cliExecStrategy';
import { CopilotCliProvider } from '../src/codex/copilotCliProvider';
import { CodexCliProvider } from '../src/codex/codexCliProvider';
import { CodexExecRequest, CodexExecResult } from '../src/codex/types';
import { hashText } from '../src/ralph/integrity';
import { Logger } from '../src/services/logger';
import { ProcessLaunchError, setProcessRunnerOverride } from '../src/services/processRunner';

const codexProvider = new CodexCliProvider({
  reasoningEffort: 'medium',
  sandboxMode: 'workspace-write',
  approvalMode: 'on-request'
});

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
    args: codexProvider.buildLaunchSpec(request(), false).args,
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

test('buildArgs appends stdin marker and optional git-skip flag', () => {
  assert.deepEqual(codexProvider.buildLaunchSpec(request(), false).args, [
    'exec',
    '--model', 'gpt-5.4',
    '--config', 'model_reasoning_effort="medium"',
    '--sandbox', 'workspace-write',
    '--config', 'approval_policy="on-request"',
    '--cd', '/workspace/repo',
    '--output-last-message', '/workspace/.ralph/runs/bootstrap-001.last-message.md',
    '-'
  ]);

  assert.deepEqual(codexProvider.buildLaunchSpec(request(), true).args, [
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

test('buildTranscript captures command metadata and last message', () => {
  const transcript = codexProvider.buildTranscript(result(), request());

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

test('buildArgs allows deliberate high reasoning escalation', () => {
  assert.deepEqual(codexProvider.buildLaunchSpec({
    ...request(),
    reasoningEffort: 'high'
  }, false).args, [
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

test('CliExecCodexStrategy supports stdin-pipe providers such as Copilot', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-copilot-cli-'));
  let capturedArgs: string[] = [];
  let capturedStdinText: string | undefined;
  let capturedCwd = '';

  setProcessRunnerOverride(async (_command, args, options) => {
    capturedArgs = args;
    capturedStdinText = options.stdinText;
    capturedCwd = options.cwd;
    return {
      code: 0,
      stdout: 'Copilot response',
      stderr: ''
    };
  });

  try {
    const strategy = new CliExecCodexStrategy(
      createLogger(),
      new CopilotCliProvider({ approvalMode: 'allow-all' })
    );
    const result = await strategy.runExec({
      ...request(),
      commandPath: 'copilot',
      workspaceRoot: root,
      executionRoot: root,
      transcriptPath: path.join(root, '.ralph', 'runs', 'bootstrap-001.transcript.md'),
      lastMessagePath: path.join(root, '.ralph', 'runs', 'bootstrap-001.last-message.md')
    });

    assert.equal(result.exitCode, 0);
    assert.equal(result.lastMessage, 'Copilot response');
    assert.equal(capturedCwd, root);
    // Copilot provider pipes via stdin, no -p flag
    assert.equal(capturedStdinText, 'Ship it.');
    assert.ok(!capturedArgs.includes('-p'), 'should not have -p flag');
  } finally {
    setProcessRunnerOverride(null);
  }
});

test('describeLaunchError explains a missing Codex CLI path', () => {
  const launchError = new ProcessLaunchError(
    'codex',
    ['exec'],
    Object.assign(new Error('spawn codex ENOENT'), { code: 'ENOENT' })
  );

  assert.match(
    codexProvider.describeLaunchError('codex', launchError),
    /Codex CLI was not found/
  );
});

test('summarizeResult surfaces the root failure detail from stderr', () => {
  assert.equal(
    codexProvider.summarizeResult({
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
  setProcessRunnerOverride(async () => ({
    code: 1,
    stdout: '',
    stderr: [
      'ERROR: stream disconnected before completion: network offline',
      'ERROR: Failed to shutdown rollout recorder'
    ].join('\n')
  }));

  try {
    const strategy = new CliExecCodexStrategy(createLogger());
    const result = await strategy.runExec({
      ...request(),
      commandPath: 'codex',
      workspaceRoot: root,
      executionRoot: root,
      transcriptPath: path.join(root, '.ralph', 'runs', 'bootstrap-001.transcript.md'),
      lastMessagePath: path.join(root, '.ralph', 'runs', 'bootstrap-001.last-message.md')
    });

    assert.equal(result.exitCode, 1);
    assert.equal(result.message, 'codex exec exited with code 1: stream disconnected before completion: network offline');
    assert.match(result.stderr, /network offline/);
  } finally {
    setProcessRunnerOverride(null);
  }
});
