import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';

async function createWorkspace(taskFile: unknown, claimFile?: unknown) {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-ledger-'));
  const ralphRoot = path.join(workspaceRoot, '.ralph');
  await fs.mkdir(ralphRoot, { recursive: true });
  await fs.writeFile(path.join(ralphRoot, 'tasks.json'), `${JSON.stringify(taskFile, null, 2)}\n`, 'utf8');

  if (claimFile !== undefined) {
    await fs.writeFile(path.join(ralphRoot, 'claims.json'), `${JSON.stringify(claimFile, null, 2)}\n`, 'utf8');
  }

  return workspaceRoot;
}

function runLedgerCli(workspaceRoot: string) {
  const scriptPath = path.resolve(process.cwd(), 'scripts', 'check-ledger.js');
  return spawnSync(process.execPath, [scriptPath, workspaceRoot], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });
}

function skipIfSpawnUnavailable(
  result: ReturnType<typeof spawnSync>,
  t: test.TestContext
): boolean {
  const spawnError = result.error as (Error & { code?: string }) | undefined;

  if (spawnError?.code === 'EPERM') {
    t.skip('child_process.spawnSync is blocked in this environment');
    return true;
  }

  if (spawnError) {
    assert.fail(`spawnSync failed: ${spawnError.message}`);
  }

  return false;
}

test('check-ledger exits 0 for a clean tasks.json without claims.json', async (t) => {
  const workspaceRoot = await createWorkspace({
    version: 2,
    tasks: [
      { id: 'T1', title: 'Parent', status: 'todo' },
      { id: 'T1.1', title: 'Child', status: 'todo', parentId: 'T1' }
    ]
  });

  const result = runLedgerCli(workspaceRoot);
  if (skipIfSpawnUnavailable(result, t)) {
    return;
  }

  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});

test('check-ledger exits 1 and names the parent when a done parent still has a todo child', async (t) => {
  const workspaceRoot = await createWorkspace({
    version: 2,
    tasks: [
      { id: 'T1', title: 'Parent', status: 'done' },
      { id: 'T1.1', title: 'Child', status: 'todo', parentId: 'T1' }
    ]
  });

  const result = runLedgerCli(workspaceRoot);
  if (skipIfSpawnUnavailable(result, t)) {
    return;
  }

  assert.equal(result.status, 1);
  assert.match(result.stdout, /^T1: is marked done but has unfinished descendants: T1\.1 \(todo\)$/m);
  assert.equal(result.stderr, '');
});

test('check-ledger exits 1 for a missing dependsOn target', async (t) => {
  const workspaceRoot = await createWorkspace({
    version: 2,
    tasks: [
      { id: 'T1', title: 'Task', status: 'todo', dependsOn: ['T9'] }
    ]
  });

  const result = runLedgerCli(workspaceRoot);
  if (skipIfSpawnUnavailable(result, t)) {
    return;
  }

  assert.equal(result.status, 1);
  assert.match(result.stdout, /^T1: references missing dependency T9$/m);
  assert.equal(result.stderr, '');
});

test('check-ledger exits 1 for a missing parentId target', async (t) => {
  const workspaceRoot = await createWorkspace({
    version: 2,
    tasks: [
      { id: 'T1', title: 'Task', status: 'todo', parentId: 'T9' }
    ]
  });

  const result = runLedgerCli(workspaceRoot);
  if (skipIfSpawnUnavailable(result, t)) {
    return;
  }

  assert.equal(result.status, 1);
  assert.match(result.stdout, /^T1: references missing parentId T9$/m);
  assert.equal(result.stderr, '');
});

test('check-ledger exits 1 for a dependency cycle', async (t) => {
  const workspaceRoot = await createWorkspace({
    version: 2,
    tasks: [
      { id: 'T1', title: 'Cycle start', status: 'todo', dependsOn: ['T2'] },
      { id: 'T2', title: 'Cycle end', status: 'todo', dependsOn: ['T1'] }
    ]
  });

  const result = runLedgerCli(workspaceRoot);
  if (skipIfSpawnUnavailable(result, t)) {
    return;
  }

  assert.equal(result.status, 1);
  assert.match(result.stdout, /^T2: dependency cycle detected: T1 -> T2 -> T1$/m);
  assert.equal(result.stderr, '');
});

test('check-ledger exits 0 for an in_progress task with a matching active claims.json entry', async (t) => {
  const workspaceRoot = await createWorkspace(
    {
      version: 2,
      tasks: [
        { id: 'T1', title: 'Claimed task', status: 'in_progress' }
      ]
    },
    {
      version: 1,
      claims: [
        {
          taskId: 'T1',
          agentId: 'default',
          provenanceId: 'run-i001-cli-20260318T000000Z',
          claimedAt: '2026-03-18T00:00:00.000Z',
          status: 'active'
        }
      ]
    }
  );

  const result = runLedgerCli(workspaceRoot);
  if (skipIfSpawnUnavailable(result, t)) {
    return;
  }

  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});

test('check-ledger exits 0 for an in_progress task when claims.json is absent', async (t) => {
  const workspaceRoot = await createWorkspace({
    version: 2,
    tasks: [
      { id: 'T1', title: 'Claim released task', status: 'in_progress' }
    ]
  });

  const result = runLedgerCli(workspaceRoot);
  if (skipIfSpawnUnavailable(result, t)) {
    return;
  }

  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});
