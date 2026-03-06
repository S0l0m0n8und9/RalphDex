import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCodexExecArgs,
  buildCodexExecTranscript,
  describeCodexExecLaunchError
} from '../src/codex/cliExecStrategy';
import { CodexExecRequest, CodexExecResult } from '../src/codex/types';
import { ProcessLaunchError } from '../src/services/processRunner';

function request(): CodexExecRequest {
  return {
    commandPath: 'codex',
    workspaceRoot: '/workspace',
    prompt: 'Ship it.',
    promptPath: '/workspace/.ralph/prompts/bootstrap-001.prompt.md',
    transcriptPath: '/workspace/.ralph/runs/bootstrap-001.transcript.md',
    lastMessagePath: '/workspace/.ralph/runs/bootstrap-001.last-message.md',
    model: 'gpt-5.4',
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
    transcriptPath: '/workspace/.ralph/runs/bootstrap-001.transcript.md',
    lastMessagePath: '/workspace/.ralph/runs/bootstrap-001.last-message.md',
    lastMessage: 'Final answer'
  };
}

test('buildCodexExecArgs appends stdin marker and optional git-skip flag', () => {
  assert.deepEqual(buildCodexExecArgs(request(), false), [
    'exec',
    '--model', 'gpt-5.4',
    '--sandbox', 'workspace-write',
    '--ask-for-approval', 'on-request',
    '--cd', '/workspace',
    '--output-last-message', '/workspace/.ralph/runs/bootstrap-001.last-message.md',
    '-'
  ]);

  assert.deepEqual(buildCodexExecArgs(request(), true), [
    'exec',
    '--model', 'gpt-5.4',
    '--sandbox', 'workspace-write',
    '--ask-for-approval', 'on-request',
    '--cd', '/workspace',
    '--output-last-message', '/workspace/.ralph/runs/bootstrap-001.last-message.md',
    '--skip-git-repo-check',
    '-'
  ]);
});

test('buildCodexExecTranscript captures command metadata and last message', () => {
  const transcript = buildCodexExecTranscript(result(), request());

  assert.match(transcript, /Codex Exec Transcript/);
  assert.match(transcript, /--model gpt-5.4/);
  assert.match(transcript, /Prompt path: \/workspace\/\.ralph\/prompts\/bootstrap-001\.prompt\.md/);
  assert.match(transcript, /Final answer/);
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
