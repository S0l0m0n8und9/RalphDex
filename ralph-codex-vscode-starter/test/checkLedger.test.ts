import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';

const { runLedgerCheck } = require(path.resolve(process.cwd(), 'scripts', 'check-ledger.js')) as {
  runLedgerCheck: (workspaceRoot: string) => Array<{ taskId: string; message: string }>;
};

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

test('check-ledger exits cleanly for a consistent ledger without claims.json', async () => {
  const workspaceRoot = await createWorkspace({
    version: 2,
    tasks: [
      { id: 'T1', title: 'Parent', status: 'todo' },
      { id: 'T1.1', title: 'Child', status: 'todo', parentId: 'T1', dependsOn: ['T0'] },
      { id: 'T0', title: 'Dependency', status: 'done' }
    ]
  });

  assert.deepEqual(runLedgerCheck(workspaceRoot), []);
});

test('check-ledger reports drift, missing references, cycles, and missing claims', async () => {
  const workspaceRoot = await createWorkspace(
    {
      version: 2,
      tasks: [
        { id: 'T1', title: 'Done parent', status: 'done' },
        { id: 'T1.1', title: 'Child still active', status: 'in_progress', parentId: 'T1', dependsOn: ['MISSING'] },
        { id: 'T2', title: 'Orphan', status: 'todo', parentId: 'T9' },
        { id: 'T3', title: 'Cycle start', status: 'todo', dependsOn: ['T4'] },
        { id: 'T4', title: 'Cycle end', status: 'todo', dependsOn: ['T3'] }
      ]
    },
    {
      version: 1,
      claims: [
        {
          taskId: 'T8',
          agentId: 'agent-a',
          provenanceId: 'run-001',
          claimedAt: '2026-03-14T00:00:00.000Z',
          status: 'active'
        }
      ]
    }
  );

  const findings = runLedgerCheck(workspaceRoot).map((finding) => `${finding.taskId}: ${finding.message}`).join('\n');

  assert.match(findings, /^T1: is marked done but has unfinished descendants: T1\.1 \(in_progress\)$/m);
  assert.match(findings, /^T1\.1: references missing dependency MISSING$/m);
  assert.match(findings, /^T2: references missing parentId T9$/m);
  assert.match(findings, /^T4: dependency cycle detected: T3 -> T4 -> T3$/m);
  assert.match(findings, /^T1\.1: is in_progress but has no active claim in \.ralph\/claims\.json$/m);
});

test('check-ledger accepts in-progress tasks when claims.json contains an active claim', async () => {
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
          agentId: 'agent-a',
          provenanceId: 'run-001',
          claimedAt: '2026-03-14T00:00:00.000Z',
          status: 'active'
        }
      ]
    }
  );

  assert.deepEqual(runLedgerCheck(workspaceRoot), []);
});
