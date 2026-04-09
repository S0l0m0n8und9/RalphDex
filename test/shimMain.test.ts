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

  const packageRoot = path.resolve(__dirname, '..', '..');
  const shimEntry = path.join(packageRoot, 'out', 'shim', 'main.js');
  const { stdout, stderr } = await execFileAsync(process.execPath, [shimEntry, workspaceRoot], {
    cwd: packageRoot,
    timeout: 60_000,
    maxBuffer: 10 * 1024 * 1024
  });

  assert.equal(stderr, '');
  assert.match(stdout, /# Ralph Preflight/);
  assert.match(stdout, /- Ready: yes/);
  assert.match(stdout, /Ralph shim iteration 1 finished:/);

  const progressText = await fs.readFile(path.join(workspaceRoot, '.ralph', 'progress.md'), 'utf8');
  assert.match(progressText, /Fake codex advanced the shim workspace/);
});
