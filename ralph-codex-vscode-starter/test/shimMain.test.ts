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
        validation: 'node -e "process.exit(0)"'
      }
    ]
  }, null, 2)}\n`, 'utf8');
  await fs.writeFile(path.join(workspaceRoot, '.ralph-config.json'), `${JSON.stringify({
    preferredHandoffMode: 'cliExec',
    cliProvider: 'codex',
    codexCommandPath,
    approvalMode: 'never',
    sandboxMode: 'workspace-write',
    verifierModes: ['validationCommand', 'gitDiff', 'taskState']
  }, null, 2)}\n`, 'utf8');
}

async function createFakeCodexExecScript(workspaceRoot: string): Promise<void> {
  const fakeExecPath = path.join(workspaceRoot, 'exec');
  await fs.writeFile(fakeExecPath, `#!/usr/bin/env bash
set -euo pipefail

last_message_path=""
while (($# > 0)); do
  if [[ "$1" == "--output-last-message" ]]; then
    shift
    last_message_path="\${1:-}"
  fi
  shift || true
done

prompt="$(cat)"
if [[ "$prompt" != *"# Ralph Prompt:"* ]]; then
  echo "Expected Ralph prompt on stdin." >&2
  exit 1
fi

printf '\n- Fake codex advanced the shim workspace.\n' >> .ralph/progress.md
if [[ -n "$last_message_path" ]]; then
  printf 'Fake codex completed the shim iteration.\n' > "$last_message_path"
fi

printf 'Fake codex completed the shim iteration.\n'
`, 'utf8');
}

test('shim main boots a seeded workspace, prints preflight output, and exits zero', async (t) => {
  const workspaceRoot = await createWorkspaceRoot();
  t.after(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  await createFakeCodexExecScript(workspaceRoot);
  await seedShimWorkspace(workspaceRoot, process.env.SHELL || '/bin/bash');

  const packageRoot = path.resolve(__dirname, '..', '..');
  const shimEntry = path.join(packageRoot, 'out', 'shim', 'main.js');
  await execFileAsync('bash', ['-lc', 'node "$SHIM_ENTRY" "$WORKSPACE_ROOT" > "$WORKSPACE_ROOT/stdout.txt" 2> "$WORKSPACE_ROOT/stderr.txt"'], {
    cwd: packageRoot,
    env: {
      ...process.env,
      SHIM_ENTRY: shimEntry,
      WORKSPACE_ROOT: workspaceRoot
    },
    timeout: 60_000,
    maxBuffer: 10 * 1024 * 1024
  });

  const stdout = await fs.readFile(path.join(workspaceRoot, 'stdout.txt'), 'utf8');
  const stderr = await fs.readFile(path.join(workspaceRoot, 'stderr.txt'), 'utf8');

  assert.equal(stderr, '');
  assert.match(stdout, /# Ralph Preflight/);
  assert.match(stdout, /- Ready: yes/);
  assert.match(stdout, /Ralph shim iteration 1 finished:/);

  const progressText = await fs.readFile(path.join(workspaceRoot, '.ralph', 'progress.md'), 'utf8');
  assert.match(progressText, /Fake codex advanced the shim workspace/);
});
