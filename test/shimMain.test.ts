import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);

async function createWorkspaceRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ralph-shim-main-'));
}

async function seedShimWorkspace(workspaceRoot: string, codexCommandPath: string): Promise<void> {
  await fs.mkdir(path.join(workspaceRoot, 'src'), { recursive: true });
  await fs.mkdir(path.join(workspaceRoot, '.ralph'), { recursive: true });

  await fs.writeFile(path.join(workspaceRoot, 'package.json'), JSON.stringify({
    name: 'ralph-shim-main-fixture',
    version: '1.0.0'
  }, null, 2), 'utf8');
  await fs.writeFile(path.join(workspaceRoot, 'src', 'feature.ts'), 'export const ready = true;\n', 'utf8');
  await fs.writeFile(path.join(workspaceRoot, '.ralph', 'prd.md'), '# Product / project brief\n\nExercise the Ralph shim.\n', 'utf8');
  await fs.writeFile(path.join(workspaceRoot, '.ralph', 'progress.md'), '# Progress\n\n- Workspace seeded for shim boot.\n', 'utf8');
  await fs.writeFile(path.join(workspaceRoot, '.ralph', 'tasks.json'), `${JSON.stringify({
    version: 2,
    tasks: [
      {
        id: 'T1',
        title: 'Run one shim iteration',
        status: 'todo',
        // Use the POSIX `true` builtin: a deterministic exit-0 validation that
        // survives /bin/sh (dash) without shell-quoting hazards.
        validation: 'true'
      }
    ]
  }, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(workspaceRoot, '.ralph-config.json'), `${JSON.stringify({
    preferredHandoffMode: 'cliExec',
    cliProvider: 'codex',
    codexCommandPath,
    approvalMode: 'never',
    sandboxMode: 'workspace-write',
    // Keep the e2e contract deterministic by exercising the validation-command
    // verifier only; git/task-state outcomes depend on repo/reconciliation state
    // that is out of scope for the shim's exit-code contract.
    verifierModes: ['validationCommand'],
    modelTiering: { enabled: false }
  }, null, 2)}\n`, 'utf8');
}

/**
 * Creates a fake codex CLI as a Node.js script named `exec` (no extension).
 * The codex provider spawns `<commandPath> exec --model ... -`, so `exec` is
 * the first positional argument passed to node, which treats it as a script path.
 * Using node + a JS file avoids any platform-specific shell dependency.
 */
async function createFakeCodexExecScript(workspaceRoot: string): Promise<void> {
  const fakeExecPath = path.join(workspaceRoot, 'exec');
  await fs.writeFile(fakeExecPath, `const fs = require('fs');
const path = require('path');

let lastMessagePath = '';
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--output-last-message' && i + 1 < args.length) {
    lastMessagePath = args[++i];
  }
}

let prompt = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { prompt += chunk; });
process.stdin.on('end', () => {
  if (!prompt.includes('# Ralph Prompt:')) {
    process.stderr.write('Expected Ralph prompt on stdin.\\n');
    process.exit(1);
  }

  const progressPath = path.join(process.cwd(), '.ralph', 'progress.md');
  fs.appendFileSync(progressPath, '\\n- Fake codex advanced the shim workspace.\\n');
  if (lastMessagePath) {
    fs.writeFileSync(lastMessagePath, 'Fake codex completed the shim iteration.\\n');
  }
  process.stdout.write('Fake codex completed the shim iteration.\\n');
});
`, 'utf8');
}

const PACKAGE_ROOT = path.resolve(__dirname, '..', '..');
const SHIM_ENTRY = path.join(PACKAGE_ROOT, 'out', 'shim', 'main.js');

interface ShimRun {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Runs the compiled shim and captures stdout/stderr/exit code without throwing on non-zero. */
async function runShim(args: string[]): Promise<ShimRun> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [SHIM_ENTRY, ...args], {
      cwd: PACKAGE_ROOT,
      timeout: 60_000,
      maxBuffer: 10 * 1024 * 1024
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; code?: number };
    return { stdout: err.stdout ?? '', stderr: err.stderr ?? '', exitCode: err.code ?? 1 };
  }
}

test('shim main boots a seeded workspace, prints preflight output, and exits zero', async (t) => {
  const workspaceRoot = await createWorkspaceRoot();
  t.after(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  await createFakeCodexExecScript(workspaceRoot);
  // Use the node binary as codexCommandPath. The codex provider spawns
  // `<commandPath> exec --model ...`, so node will run the `exec` JS file
  // we created in workspaceRoot (set as cwd by the provider).
  await seedShimWorkspace(workspaceRoot, process.execPath);

  const { stdout, stderr, exitCode } = await runShim([workspaceRoot]);

  assert.equal(exitCode, 0);
  assert.equal(stderr, '');
  assert.match(stdout, /# Ralph Preflight/);
  assert.match(stdout, /- Ready: yes/);
  assert.match(stdout, /Ralph shim iteration 1 finished:/);

  const progressText = await fs.readFile(path.join(workspaceRoot, '.ralph', 'progress.md'), 'utf8');
  assert.match(progressText, /Fake codex advanced the shim workspace/);
});

test('shim --json emits a single machine-readable success report on stdout and exits zero', async (t) => {
  const workspaceRoot = await createWorkspaceRoot();
  t.after(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  await createFakeCodexExecScript(workspaceRoot);
  await seedShimWorkspace(workspaceRoot, process.execPath);

  const { stdout, stderr, exitCode } = await runShim(['--json', workspaceRoot]);

  // stdout is exactly one line of JSON; all human/log output went to stderr.
  const lines = stdout.trimEnd().split('\n');
  assert.equal(lines.length, 1, `expected one JSON line on stdout, got:\n${stdout}`);
  const report = JSON.parse(lines[0]);
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.ok, true);
  assert.equal(report.category, 'success');
  assert.equal(report.exitCode, 0);
  assert.equal(report.iteration, 1);
  assert.equal(report.selectedTaskId, 'T1');
  assert.equal(report.executionStatus, 'succeeded');
  assert.equal(exitCode, 0);
  // Preflight/log noise is on stderr, never polluting the JSON channel.
  assert.match(stderr, /# Ralph Preflight/);
});

test('shim --json reports a validation-category failure with exit code 5', async (t) => {
  const workspaceRoot = await createWorkspaceRoot();
  t.after(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  await createFakeCodexExecScript(workspaceRoot);
  await seedShimWorkspace(workspaceRoot, process.execPath);
  // Force the validation command to fail deterministically.
  const tasksPath = path.join(workspaceRoot, '.ralph', 'tasks.json');
  const tasks = JSON.parse(await fs.readFile(tasksPath, 'utf8'));
  tasks.tasks[0].validation = 'false';
  await fs.writeFile(tasksPath, `${JSON.stringify(tasks, null, 2)}\n`, 'utf8');

  const { stdout, exitCode } = await runShim(['--json', workspaceRoot]);
  const report = JSON.parse(stdout.trim());
  assert.equal(report.ok, false);
  assert.equal(report.category, 'validation');
  assert.equal(report.exitCode, 5);
  assert.equal(report.verificationStatus, 'failed');
  assert.equal(exitCode, 5);
});

test('shim --json reports a config-category failure (exit 2) for a missing workspace', async () => {
  const { stdout, exitCode } = await runShim(['--json', path.join(os.tmpdir(), 'ralph-shim-does-not-exist-xyz')]);
  const report = JSON.parse(stdout.trim());
  assert.equal(report.ok, false);
  assert.equal(report.category, 'config');
  assert.equal(report.exitCode, 2);
  assert.equal(exitCode, 2);
});

test('shim with no arguments exits with the config exit code (2)', async () => {
  const { exitCode } = await runShim([]);
  assert.equal(exitCode, 2);
});

test('shim rejects an unknown option with the config exit code (2)', async () => {
  const { exitCode } = await runShim(['--nope', os.tmpdir()]);
  assert.equal(exitCode, 2);
});
