import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_CONFIG } from '../src/config/defaults';
import { recoverUnexpectedUnclaimedSelection } from '../src/ralph/iterationPreparation';
import { parseTaskFile, stringifyTaskFile } from '../src/ralph/taskFile';
import { RalphTaskFile } from '../src/ralph/types';
import { initializeFakeGitRepository } from './support/processTestHarness';

async function makeTempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ralph-iteration-prep-'));
}

async function seedWorkspace(rootPath: string, taskFile: RalphTaskFile): Promise<{ taskFilePath: string; claimFilePath: string }> {
  const ralphDir = path.join(rootPath, '.ralph');
  await fs.mkdir(path.join(ralphDir, 'artifacts'), { recursive: true });
  const taskFilePath = path.join(ralphDir, 'tasks.json');
  const claimFilePath = path.join(ralphDir, 'claims.json');
  await fs.writeFile(taskFilePath, stringifyTaskFile(taskFile), 'utf8');
  return { taskFilePath, claimFilePath };
}

async function readFakeGitState(rootPath: string): Promise<{
  currentBranch: string;
  branches: Record<string, { files: Record<string, string>; baseFiles: Record<string, string> }>;
}> {
  return JSON.parse(await fs.readFile(path.join(rootPath, '.git', 'ralph-test-index.json'), 'utf8')) as {
    currentBranch: string;
    branches: Record<string, { files: Record<string, string>; baseFiles: Record<string, string> }>;
  };
}

test('recoverUnexpectedUnclaimedSelection reclaims an eligible unclaimed task', async () => {
  const rootPath = await makeTempRoot();
  const { taskFilePath, claimFilePath } = await seedWorkspace(rootPath, {
    version: 2,
    tasks: [{ id: 'T1', title: 'Recover me', status: 'todo' }]
  });

  const taskFile = parseTaskFile(await fs.readFile(taskFilePath, 'utf8'));
  const recovered = await recoverUnexpectedUnclaimedSelection({
    rootPath,
    config: DEFAULT_CONFIG,
    taskFile,
    taskFilePath,
    claimFilePath,
    provenanceId: 'run-i001-cli-20260414T000000Z',
    agentId: 'default'
  });

  const persistedTaskFile = parseTaskFile(await fs.readFile(taskFilePath, 'utf8'));
  const persistedClaims = JSON.parse(await fs.readFile(claimFilePath, 'utf8')) as {
    claims: Array<{ taskId: string; status: string; agentId: string; provenanceId: string }>;
  };

  assert.equal(recovered.recovered, true);
  assert.equal(recovered.task?.id, 'T1');
  assert.equal(recovered.claim?.claim.taskId, 'T1');
  assert.equal(persistedTaskFile.tasks.find((task) => task.id === 'T1')?.status, 'in_progress');
  assert.deepEqual(persistedClaims.claims.map((claim) => ({
    taskId: claim.taskId,
    status: claim.status,
    agentId: claim.agentId,
    provenanceId: claim.provenanceId
  })), [{
    taskId: 'T1',
    status: 'active',
    agentId: 'default',
    provenanceId: 'run-i001-cli-20260414T000000Z'
  }]);
});

test('recoverUnexpectedUnclaimedSelection does not bypass dedicated planning waits', async () => {
  const rootPath = await makeTempRoot();
  const { taskFilePath, claimFilePath } = await seedWorkspace(rootPath, {
    version: 2,
    tasks: [{ id: 'T1', title: 'Wait for planner', status: 'todo' }]
  });

  const taskFile = parseTaskFile(await fs.readFile(taskFilePath, 'utf8'));
  const recovered = await recoverUnexpectedUnclaimedSelection({
    rootPath,
    config: {
      ...DEFAULT_CONFIG,
      agentCount: 2,
      agentRole: 'implementer',
      planningPass: { enabled: true, mode: 'dedicated' }
    },
    taskFile,
    taskFilePath,
    claimFilePath,
    provenanceId: 'run-i002-cli-20260414T000000Z',
    agentId: 'default'
  });

  assert.equal(recovered.recovered, false);
  await assert.rejects(fs.readFile(claimFilePath, 'utf8'), /ENOENT/);
});

test('recoverUnexpectedUnclaimedSelection falls back when dedicated planning has no planner capacity', async () => {
  const rootPath = await makeTempRoot();
  const { taskFilePath, claimFilePath } = await seedWorkspace(rootPath, {
    version: 2,
    tasks: [{ id: 'T1', title: 'Fallback to inline planning', status: 'todo' }]
  });

  const taskFile = parseTaskFile(await fs.readFile(taskFilePath, 'utf8'));
  const recovered = await recoverUnexpectedUnclaimedSelection({
    rootPath,
    config: {
      ...DEFAULT_CONFIG,
      agentCount: 1,
      agentRole: 'implementer',
      planningPass: { enabled: true, mode: 'dedicated' }
    },
    taskFile,
    taskFilePath,
    claimFilePath,
    provenanceId: 'run-i002b-cli-20260414T000000Z',
    agentId: 'default'
  });

  const persistedTaskFile = parseTaskFile(await fs.readFile(taskFilePath, 'utf8'));
  assert.equal(recovered.recovered, true);
  assert.equal(recovered.task?.id, 'T1');
  assert.equal(persistedTaskFile.tasks.find((task) => task.id === 'T1')?.status, 'in_progress');
});

test('recoverUnexpectedUnclaimedSelection does not steal an actively claimed task', async () => {
  const rootPath = await makeTempRoot();
  const { taskFilePath, claimFilePath } = await seedWorkspace(rootPath, {
    version: 2,
    tasks: [{ id: 'T1', title: 'Held elsewhere', status: 'todo' }]
  });
  await fs.writeFile(claimFilePath, `${JSON.stringify({
    version: 1,
    claims: [{
      taskId: 'T1',
      agentId: 'other-agent',
      provenanceId: 'run-i999-cli-20260414T000000Z',
      claimedAt: '2026-04-14T00:00:00.000Z',
      status: 'active'
    }]
  }, null, 2)}\n`, 'utf8');

  const taskFile = parseTaskFile(await fs.readFile(taskFilePath, 'utf8'));
  const recovered = await recoverUnexpectedUnclaimedSelection({
    rootPath,
    config: DEFAULT_CONFIG,
    taskFile,
    taskFilePath,
    claimFilePath,
    provenanceId: 'run-i003-cli-20260414T000000Z',
    agentId: 'default'
  });

  const persistedClaims = JSON.parse(await fs.readFile(claimFilePath, 'utf8')) as {
    claims: Array<{ taskId: string; status: string; agentId: string }>;
  };

  assert.equal(recovered.recovered, false);
  assert.equal(recovered.task, null);
  assert.deepEqual(persistedClaims.claims.map((claim) => ({
    taskId: claim.taskId,
    status: claim.status,
    agentId: claim.agentId
  })), [{
    taskId: 'T1',
    status: 'active',
    agentId: 'other-agent'
  }]);
});

test('recoverUnexpectedUnclaimedSelection in branch-per-task records branch metadata without mutating git branches', async () => {
  const rootPath = await makeTempRoot();
  const { taskFilePath, claimFilePath } = await seedWorkspace(rootPath, {
    version: 2,
    tasks: [
      { id: 'T90', title: 'Parent', status: 'todo', dependsOn: ['T90.1'] },
      { id: 'T90.1', title: 'Child', status: 'todo', parentId: 'T90' }
    ]
  });
  await initializeFakeGitRepository(rootPath);

  const taskFile = parseTaskFile(await fs.readFile(taskFilePath, 'utf8'));
  const recovered = await recoverUnexpectedUnclaimedSelection({
    rootPath,
    config: {
      ...DEFAULT_CONFIG,
      scmStrategy: 'branch-per-task'
    },
    taskFile,
    taskFilePath,
    claimFilePath,
    provenanceId: 'run-i004-cli-20260414T000000Z',
    agentId: 'default'
  });

  const gitState = await readFakeGitState(rootPath);
  const persistedClaims = JSON.parse(await fs.readFile(claimFilePath, 'utf8')) as {
    claims: Array<{
      taskId: string;
      status: string;
      baseBranch?: string;
      integrationBranch?: string;
      featureBranch?: string;
    }>;
  };

  assert.equal(recovered.recovered, true);
  assert.equal(recovered.task?.id, 'T90.1');
  assert.equal(gitState.currentBranch, 'main');
  assert.deepEqual(Object.keys(gitState.branches).sort(), ['main']);
  assert.equal(persistedClaims.claims[0]?.taskId, 'T90.1');
  assert.equal(persistedClaims.claims[0]?.status, 'active');
  assert.equal(persistedClaims.claims[0]?.baseBranch, 'main');
  assert.equal(persistedClaims.claims[0]?.integrationBranch, 'ralph/integration/T90');
  assert.equal(persistedClaims.claims[0]?.featureBranch, 'ralph/T90.1');
});
