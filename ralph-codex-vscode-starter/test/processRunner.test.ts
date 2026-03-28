import assert from 'node:assert/strict';
import test from 'node:test';
import { setProcessRunnerOverride, runProcess, ProcessTimeoutError } from '../src/services/processRunner';
import os from 'node:os';

// These tests exercise the real spawn path, so temporarily clear the test harness override.
test('runProcess resolves normally when no timeout is set', async () => {
  setProcessRunnerOverride(null);
  try {
    const result = await runProcess('node', ['-e', 'console.log("ok")'], {
      cwd: os.tmpdir()
    });
    assert.equal(result.code, 0);
    assert.match(result.stdout, /ok/);
  } finally {
    setProcessRunnerOverride(null);
  }
});

test('runProcess rejects with ProcessTimeoutError when the process exceeds timeoutMs', async () => {
  setProcessRunnerOverride(null);
  try {
    await assert.rejects(
      () => runProcess('node', ['-e', 'setTimeout(() => {}, 30000)'], {
        cwd: os.tmpdir(),
        timeoutMs: 200
      }),
      (err: unknown) => {
        assert.ok(err instanceof ProcessTimeoutError);
        assert.equal(err.name, 'ProcessTimeoutError');
        assert.equal(err.timeoutMs, 200);
        return true;
      }
    );
  } finally {
    setProcessRunnerOverride(null);
  }
});

test('runProcess completes without timeout when process finishes before deadline', async () => {
  setProcessRunnerOverride(null);
  try {
    const result = await runProcess('node', ['-e', 'console.log("fast")'], {
      cwd: os.tmpdir(),
      timeoutMs: 10000
    });
    assert.equal(result.code, 0);
    assert.match(result.stdout, /fast/);
  } finally {
    setProcessRunnerOverride(null);
  }
});
