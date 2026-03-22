import assert from 'node:assert/strict';
import test from 'node:test';
import { ClaudeCliProvider } from '../src/codex/claudeCliProvider';
import { CodexExecRequest, CodexExecResult } from '../src/codex/types';
import { hashText } from '../src/ralph/integrity';

function request(): CodexExecRequest {
  return {
    commandPath: 'claude',
    workspaceRoot: '/workspace',
    executionRoot: '/workspace/repo',
    prompt: 'Ship it.',
    promptPath: '/workspace/.ralph/prompts/bootstrap-001.prompt.md',
    promptHash: hashText('Ship it.'),
    promptByteLength: Buffer.byteLength('Ship it.', 'utf8'),
    transcriptPath: '/workspace/.ralph/runs/bootstrap-001.transcript.md',
    lastMessagePath: '/workspace/.ralph/runs/bootstrap-001.last-message.md',
    model: 'claude-sonnet-4-20250514',
    reasoningEffort: 'medium',
    sandboxMode: 'workspace-write',
    approvalMode: 'never'
  };
}

function provider(options?: Partial<{ maxTurns: number; permissionMode: 'dangerously-skip-permissions' | 'default' }>): ClaudeCliProvider {
  return new ClaudeCliProvider({
    maxTurns: options?.maxTurns ?? 50,
    permissionMode: options?.permissionMode ?? 'dangerously-skip-permissions'
  });
}

test('buildArgs produces Claude CLI arguments with -p stdin marker', () => {
  const args = provider().buildArgs(request(), false);

  assert.deepEqual(args, [
    '-p', '-',
    '--model', 'claude-sonnet-4-20250514',
    '--output-format', 'stream-json',
    '--max-turns', '50',
    '--verbose',
    '--allowedTools', 'Read,Write,Edit,MultiEdit,Bash,Glob,Grep,LS',
    '--no-session-persistence',
    '--dangerously-skip-permissions'
  ]);
});

test('buildArgs omits --dangerously-skip-permissions in default permission mode', () => {
  const args = provider({ permissionMode: 'default' }).buildArgs(request(), false);

  assert.ok(!args.includes('--dangerously-skip-permissions'));
  assert.deepEqual(args, [
    '-p', '-',
    '--model', 'claude-sonnet-4-20250514',
    '--output-format', 'stream-json',
    '--max-turns', '50',
    '--verbose',
    '--allowedTools', 'Read,Write,Edit,MultiEdit,Bash,Glob,Grep,LS',
    '--no-session-persistence'
  ]);
});

test('buildArgs respects custom maxTurns', () => {
  const args = provider({ maxTurns: 10 }).buildArgs(request(), false);

  assert.ok(args.includes('--max-turns'));
  assert.ok(args.includes('10'));
});

test('buildArgs ignores skipGitCheck flag (not applicable to Claude)', () => {
  const withSkip = provider().buildArgs(request(), true);
  const withoutSkip = provider().buildArgs(request(), false);

  assert.deepEqual(withSkip, withoutSkip);
});

test('extractResponseText parses structured JSON output and returns result field', async () => {
  const stdout = JSON.stringify({
    type: 'result',
    subtype: 'success',
    result: 'The task is complete.\n\n```json\n{"selectedTaskId":"T1","requestedStatus":"done"}\n```',
    cost_usd: 0.05,
    duration_ms: 12000,
    num_turns: 3,
    session_id: 'abc123'
  });

  const text = await provider().extractResponseText(stdout, '', '');
  assert.equal(text, 'The task is complete.\n\n```json\n{"selectedTaskId":"T1","requestedStatus":"done"}\n```');
});

test('extractResponseText picks result event with most turns when follow-up turn is present', async () => {
  // Simulates the background-Task follow-up pattern: Claude emits a main
  // result (many turns, contains the completion report) then a task_notification
  // triggers a second result (1 turn, brief acknowledgement) that must not win.
  const mainResult = JSON.stringify({
    type: 'result',
    subtype: 'success',
    result: 'Work done.\n\n```json\n{"selectedTaskId":"T1","requestedStatus":"done"}\n```',
    num_turns: 16,
    session_id: 'abc'
  });
  const followUpResult = JSON.stringify({
    type: 'result',
    subtype: 'success',
    result: 'The completion report is above.',
    num_turns: 1,
    session_id: 'abc'
  });
  const stdout = [mainResult, followUpResult].join('\n');

  const text = await provider().extractResponseText(stdout, '', '');
  assert.equal(text, 'Work done.\n\n```json\n{"selectedTaskId":"T1","requestedStatus":"done"}\n```');
});

test('extractResponseText falls back to raw stdout when JSON is malformed', async () => {
  const text = await provider().extractResponseText('not valid json', '', '');
  assert.equal(text, 'not valid json');
});

test('extractResponseText returns empty string for empty stdout', async () => {
  const text = await provider().extractResponseText('', '', '');
  assert.equal(text, '');
});

test('extractResponseText falls back to raw stdout when result field is missing', async () => {
  const stdout = JSON.stringify({ type: 'result', cost_usd: 0.01 });
  const text = await provider().extractResponseText(stdout, '', '');
  assert.equal(text, stdout);
});

test('isIgnorableStderrLine filters Claude verbose output', () => {
  const p = provider();
  assert.ok(p.isIgnorableStderrLine('Session: abc123'));
  assert.ok(p.isIgnorableStderrLine('Model: claude-sonnet-4-20250514'));
  assert.ok(p.isIgnorableStderrLine('Cost: $0.05'));
  assert.ok(p.isIgnorableStderrLine('Duration: 12s'));
  assert.ok(p.isIgnorableStderrLine('Tokens: 1234'));
  assert.ok(p.isIgnorableStderrLine('╭──────────────────╮'));
  assert.ok(p.isIgnorableStderrLine('│ some box content │'));
  assert.ok(p.isIgnorableStderrLine('╰──────────────────╯'));
  assert.ok(p.isIgnorableStderrLine(''));
  assert.ok(p.isIgnorableStderrLine('   '));

  assert.ok(!p.isIgnorableStderrLine('error: something went wrong'));
  assert.ok(!p.isIgnorableStderrLine('Permission denied'));
});

test('summarizeResult returns success message from lastMessage', () => {
  const msg = provider().summarizeResult({
    exitCode: 0,
    stderr: '',
    lastMessage: 'Task T1 completed successfully.'
  });

  assert.equal(msg, 'Task T1 completed successfully.');
});

test('summarizeResult returns default success message when lastMessage is empty', () => {
  const msg = provider().summarizeResult({
    exitCode: 0,
    stderr: '',
    lastMessage: ''
  });

  assert.equal(msg, 'claude completed successfully.');
});

test('summarizeResult includes exit code and stderr detail on failure', () => {
  const msg = provider().summarizeResult({
    exitCode: 1,
    stderr: 'error: authentication failed',
    lastMessage: ''
  });

  assert.match(msg, /claude exited with code 1/);
  assert.match(msg, /authentication failed/);
});

test('describeLaunchError explains missing Claude CLI path', () => {
  const msg = provider().describeLaunchError('claude', { code: 'ENOENT', message: 'spawn claude ENOENT' });
  assert.match(msg, /Claude CLI was not found/);
  assert.match(msg, /ralphCodex\.claudeCommandPath/);
});

test('describeLaunchError handles non-ENOENT errors', () => {
  const msg = provider().describeLaunchError('/usr/bin/claude', { message: 'Permission denied' });
  assert.match(msg, /Failed to start claude/);
  assert.match(msg, /Permission denied/);
});

test('buildTranscript produces Claude-specific transcript format', () => {
  const p = provider();
  const req = request();
  const res: CodexExecResult = {
    strategy: 'cliExec',
    success: true,
    message: 'ok',
    warnings: [],
    exitCode: 0,
    stdout: '{"type":"result","result":"done"}',
    stderr: '',
    args: p.buildArgs(req, false),
    stdinHash: hashText('Ship it.'),
    transcriptPath: req.transcriptPath,
    lastMessagePath: req.lastMessagePath,
    lastMessage: 'done'
  };

  const transcript = p.buildTranscript(res, req);

  assert.match(transcript, /Claude CLI Transcript/);
  assert.match(transcript, /Model: claude-sonnet-4-20250514/);
  assert.match(transcript, /Max turns: 50/);
  assert.match(transcript, /Permission mode: dangerously-skip-permissions/);
  assert.match(transcript, /Payload matched prompt artifact: yes/);
  assert.match(transcript, /Extracted Response/);
  assert.match(transcript, /done/);
});

test('provider id is claude', () => {
  assert.equal(provider().id, 'claude');
});
