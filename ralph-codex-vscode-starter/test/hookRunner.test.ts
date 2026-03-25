import assert from 'node:assert/strict';
import test from 'node:test';
import { runHook } from '../src/ralph/hookRunner';
import { setProcessRunnerOverride } from '../src/services/processRunner';
import { RalphHooksConfig } from '../src/config/types';

const CONTEXT = {
  agentId: 'test-agent',
  taskId: 'T1',
  outcome: 'succeeded',
  stopReason: null,
  cwd: '/tmp'
};

test('runHook returns skipped result when hook is not configured', async () => {
  const hooks: RalphHooksConfig = {};
  const result = await runHook('beforeIteration', hooks, CONTEXT);
  assert.equal(result.skipped, true);
  assert.equal(result.command, '');
  assert.equal(result.exitCode, 0);
});

test('runHook runs configured command and captures exit code', async () => {
  setProcessRunnerOverride(async (_cmd, args) => {
    const command = args.join(' ');
    if (command.includes('echo hello')) {
      return { code: 0, stdout: 'hello\n', stderr: '' };
    }
    return { code: 1, stdout: '', stderr: 'unexpected command' };
  });

  const hooks: RalphHooksConfig = { beforeIteration: 'echo hello' };
  const result = await runHook('beforeIteration', hooks, CONTEXT);

  setProcessRunnerOverride(null);

  assert.equal(result.skipped, false);
  assert.equal(result.exitCode, 0);
  assert.equal(result.stdout.trim(), 'hello');
});

test('runHook captures non-zero exit code without throwing', async () => {
  setProcessRunnerOverride(async () => ({ code: 42, stdout: '', stderr: 'something failed' }));

  const hooks: RalphHooksConfig = { onFailure: 'notify-failure' };
  const result = await runHook('onFailure', hooks, CONTEXT);

  setProcessRunnerOverride(null);

  assert.equal(result.skipped, false);
  assert.equal(result.exitCode, 42);
  assert.equal(result.stderr, 'something failed');
});

test('runHook captures process launch errors without throwing', async () => {
  setProcessRunnerOverride(async () => {
    throw new Error('spawn ENOENT');
  });

  const hooks: RalphHooksConfig = { onStop: 'nonexistent-command' };
  const result = await runHook('onStop', hooks, CONTEXT);

  setProcessRunnerOverride(null);

  assert.equal(result.skipped, false);
  assert.equal(result.exitCode, 1);
  assert.ok(result.stderr.includes('ENOENT') || result.stderr.length > 0);
});

test('runHook injects RALPH_* environment variables', async () => {
  let capturedEnv: NodeJS.ProcessEnv = {};

  setProcessRunnerOverride(async (_cmd, _args, opts) => {
    capturedEnv = opts.env ?? {};
    return { code: 0, stdout: '', stderr: '' };
  });

  const hooks: RalphHooksConfig = { afterIteration: 'echo $RALPH_AGENT_ID' };
  await runHook('afterIteration', hooks, { ...CONTEXT, taskId: 'T42', stopReason: 'task_marked_complete' });

  setProcessRunnerOverride(null);

  assert.equal(capturedEnv.RALPH_AGENT_ID, 'test-agent');
  assert.equal(capturedEnv.RALPH_TASK_ID, 'T42');
  assert.equal(capturedEnv.RALPH_OUTCOME, 'succeeded');
  assert.equal(capturedEnv.RALPH_STOP_REASON, 'task_marked_complete');
});

test('runHook records duration in milliseconds', async () => {
  setProcessRunnerOverride(async () => ({ code: 0, stdout: '', stderr: '' }));

  const hooks: RalphHooksConfig = { onTaskComplete: 'true' };
  const result = await runHook('onTaskComplete', hooks, CONTEXT);

  setProcessRunnerOverride(null);

  assert.ok(typeof result.durationMs === 'number', 'durationMs should be a number');
  assert.ok(result.durationMs >= 0, 'durationMs should be non-negative');
});
