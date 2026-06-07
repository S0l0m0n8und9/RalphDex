import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import test from 'node:test';
import {
  PROCESS_RUN_STDERR_MAX_BYTES,
  PROCESS_RUN_STDOUT_MAX_BYTES,
  ProcessTimeoutError,
  resolveProcessLaunch,
  runProcess,
  setProcessRunnerOverride
} from '../src/services/processRunner';
import os from 'node:os';

// ---------------------------------------------------------------------------
// T224 regression: on Windows, `runProcess('npm run validate', [], { shell:true })`
// (args===0) was handed straight to Node's shell:true path. That path's cmd
// command-building is version-fragile — VS Code's extension-host (Electron) Node
// delivered the multi-word command to cmd.exe as a single quoted token
// (`"npm run validate"`), which cmd reported as an unknown program, so the
// validation verifier failed identically every iteration. resolveProcessLaunch
// must emit a deterministic `cmd /d /s /c "<command>"` invocation (shell:false,
// windowsVerbatimArguments) instead of relying on Node's shell:true.
// ---------------------------------------------------------------------------

test('resolveProcessLaunch routes a win32 shell command with no args through cmd.exe verbatim', () => {
  const launch = resolveProcessLaunch('npm run validate', [], true, 'win32', 'C:\\WINDOWS\\system32\\cmd.exe');
  assert.equal(launch.shell, false);
  assert.equal(launch.windowsVerbatimArguments, true);
  assert.equal(launch.command, 'C:\\WINDOWS\\system32\\cmd.exe');
  assert.deepEqual(launch.args, ['/d', '/s', '/c', '"npm run validate"']);
});

test('resolveProcessLaunch never hands a bare multi-word command to a win32 shell:true spawn', () => {
  const launch = resolveProcessLaunch('npm run validate', [], true, 'win32', 'cmd.exe');
  assert.notEqual(launch.shell, true);
  assert.notEqual(launch.command, 'npm run validate');
});

test('resolveProcessLaunch leaves posix shell commands to Node shell handling', () => {
  assert.deepEqual(
    resolveProcessLaunch('npm run validate', [], true, 'linux', '/bin/sh'),
    { command: 'npm run validate', args: [], shell: true }
  );
});

test('resolveProcessLaunch leaves non-shell invocations unchanged on win32', () => {
  assert.deepEqual(
    resolveProcessLaunch('git', ['status'], false, 'win32', 'cmd.exe'),
    { command: 'git', args: ['status'], shell: false }
  );
});

test('resolveProcessLaunch keeps the quoted buildWindowsShellCommand path for win32 shell commands with args', () => {
  const launch = resolveProcessLaunch('npm', ['run', 'validate'], true, 'win32', 'cmd.exe');
  assert.equal(launch.shell, true);
  assert.deepEqual(launch.args, []);
  assert.equal(launch.command, '"npm" "run" "validate"');
});

function successfulEchoCommand(text: string): { command: string; args: string[] } {
  if (process.platform === 'win32') {
    return {
      command: 'cmd',
      args: ['/d', '/s', '/c', `echo ${text}`]
    };
  }

  return {
    command: process.execPath,
    args: ['-e', `process.stdout.write(${JSON.stringify(`${text}\n`)})`]
  };
}

// These tests exercise the real spawn path, so temporarily clear the test harness override.
test('runProcess resolves normally when no timeout is set', async () => {
  setProcessRunnerOverride(null);
  try {
    const { command, args } = successfulEchoCommand('ok');
    const result = await runProcess(command, args, {
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
        assert.equal(err.exitCode, null);
        assert.equal(typeof err.stdout, 'string');
        assert.equal(typeof err.stderr, 'string');
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
    const { command, args } = successfulEchoCommand('fast');
    const result = await runProcess(command, args, {
      cwd: os.tmpdir(),
      timeoutMs: 10000
    });
    assert.equal(result.code, 0);
    assert.match(result.stdout, /fast/);
  } finally {
    setProcessRunnerOverride(null);
  }
});

test('runProcess executes shell command strings when shell is true and no argv are supplied', async () => {
  setProcessRunnerOverride(null);
  try {
    const quotedExecPath = `"${process.execPath.replace(/"/g, '\\"')}"`;
    const shellCommand = `${quotedExecPath} -e "process.stdout.write('shell-ok')"`;
    const result = await runProcess(shellCommand, [], {
      cwd: os.tmpdir(),
      shell: true,
      timeoutMs: 5000
    });
    assert.equal(result.code, 0);
    assert.equal(result.stdout, 'shell-ok');
  } finally {
    setProcessRunnerOverride(null);
  }
});

test('runProcess runs a bare multi-word shell command end-to-end (validation-verifier shape)', async () => {
  setProcessRunnerOverride(null);
  try {
    // Mirrors the validation verifier exactly: a whole command string, no argv,
    // shell:true. On Windows this must reach the program (not be misparsed as a
    // single quoted token), which was the T224 failure.
    const result = await runProcess('git --version', [], {
      cwd: os.tmpdir(),
      shell: true,
      timeoutMs: 10000
    });
    assert.equal(result.code, 0);
    assert.match(result.stdout, /git version/);
  } finally {
    setProcessRunnerOverride(null);
  }
});

test('runProcess preserves spaced Windows shell arguments as single argv values', async () => {
  if (process.platform !== 'win32') {
    return;
  }

  setProcessRunnerOverride(null);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-run-process-shell-'));
  const scriptPath = path.join(root, 'argv.js');
  const commandPath = path.join(root, 'argdump.cmd');
  const spacedPath = 'C:\\Users\\ben.jones\\OneDrive - FUSION5\\3.Knowledge\\Dual-write\\plugins_recovered\\decompiled';
  await fs.writeFile(scriptPath, 'process.stdout.write(JSON.stringify(process.argv.slice(2)));', 'utf8');
  await fs.writeFile(commandPath, '@ECHO off\r\nnode "%~dp0\\argv.js" %*\r\n', 'utf8');

  try {
    const result = await runProcess(commandPath, [
      'exec',
      '--config', 'approval_policy="never"',
      '--cd', spacedPath,
      '--output-last-message', path.join(spacedPath, '.ralph', 'runs', 'last message.txt'),
      '-'
    ], {
      cwd: root,
      shell: true,
      stdinText: 'prompt'
    });

    assert.equal(result.code, 0);
    const argv = JSON.parse(result.stdout) as string[];
    assert.equal(argv[argv.indexOf('--cd') + 1], spacedPath);
    assert.equal(argv[argv.indexOf('--config') + 1], 'approval_policy="never"');
    assert.equal(argv.at(-1), '-');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
    setProcessRunnerOverride(null);
  }
});

test('runProcess bounds stdout in memory and keeps the latest output', async () => {
  setProcessRunnerOverride(null);
  try {
    const marker = 'TAIL-STDOUT-MARKER';
    const result = await runProcess('node', ['-e', `
      const chunk = 'x'.repeat(16384);
      const target = ${PROCESS_RUN_STDOUT_MAX_BYTES + 131072};
      let written = 0;
      while (written < target) {
        const remaining = target - written;
        const next = remaining >= chunk.length ? chunk : chunk.slice(0, remaining);
        process.stdout.write(next);
        written += next.length;
      }
      process.stdout.write('${marker}');
    `], {
      cwd: os.tmpdir()
    });

    assert.equal(result.code, 0);
    assert.ok(Buffer.byteLength(result.stdout, 'utf8') <= PROCESS_RUN_STDOUT_MAX_BYTES);
    assert.ok(result.stdout.includes(marker));
  } finally {
    setProcessRunnerOverride(null);
  }
});

test('runProcess bounds stderr in memory and keeps the latest output', async () => {
  setProcessRunnerOverride(null);
  try {
    const marker = 'TAIL-STDERR-MARKER';
    const result = await runProcess('node', ['-e', `
      const chunk = 'e'.repeat(16384);
      const target = ${PROCESS_RUN_STDERR_MAX_BYTES + 131072};
      let written = 0;
      while (written < target) {
        const remaining = target - written;
        const next = remaining >= chunk.length ? chunk : chunk.slice(0, remaining);
        process.stderr.write(next);
        written += next.length;
      }
      process.stderr.write('${marker}');
    `], {
      cwd: os.tmpdir()
    });

    assert.equal(result.code, 0);
    assert.ok(Buffer.byteLength(result.stderr, 'utf8') <= PROCESS_RUN_STDERR_MAX_BYTES);
    assert.ok(result.stderr.includes(marker));
  } finally {
    setProcessRunnerOverride(null);
  }
});

test('runProcess preserves child exit code when output was truncated', async () => {
  setProcessRunnerOverride(null);
  try {
    const marker = 'EXIT-CODE-MARKER';
    const result = await runProcess('node', ['-e', `
      const chunk = 'z'.repeat(16384);
      const target = ${PROCESS_RUN_STDOUT_MAX_BYTES + 65536};
      let written = 0;
      while (written < target) {
        const remaining = target - written;
        const next = remaining >= chunk.length ? chunk : chunk.slice(0, remaining);
        process.stdout.write(next);
        written += next.length;
      }
      process.stdout.write('${marker}');
      process.exitCode = 7;
    `], {
      cwd: os.tmpdir()
    });

    assert.equal(result.code, 7);
    assert.ok(Buffer.byteLength(result.stdout, 'utf8') <= PROCESS_RUN_STDOUT_MAX_BYTES);
    assert.ok(result.stdout.includes(marker));
  } finally {
    setProcessRunnerOverride(null);
  }
});

test('runProcess timeout includes buffered output captured before termination', async () => {
  setProcessRunnerOverride(null);
  try {
    await assert.rejects(
      () => runProcess('node', ['-e', `
        process.stdout.write('before-timeout\\n');
        setInterval(() => {}, 1000);
      `], {
        cwd: os.tmpdir(),
        timeoutMs: 200
      }),
      (err: unknown) => {
        assert.ok(err instanceof ProcessTimeoutError);
        assert.equal(err.timeoutMs, 200);
        assert.match(err.stdout, /before-timeout/);
        return true;
      }
    );
  } finally {
    setProcessRunnerOverride(null);
  }
});
