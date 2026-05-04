import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import * as vscode from 'vscode';
import { RalphTaskTreeDataProvider } from '../src/ui/taskTreeView';
import { vscodeTestHarness } from './support/vscodeTestHarness';

type TreeItemLike = vscode.TreeItem & {
  label?: string | vscode.TreeItemLabel;
  description?: string | boolean;
  command?: vscode.Command;
};

function workspaceFolder(rootPath: string): vscode.WorkspaceFolder {
  return {
    uri: vscode.Uri.file(rootPath),
    name: path.basename(rootPath),
    index: 0
  };
}

async function makeTempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ralph-task-tree-'));
}

test.beforeEach(() => {
  vscodeTestHarness().reset();
});

test('task tree provider separates active and recovery-queue tasks and surfaces artifact-backed details', async () => {
  const rootPath = await makeTempRoot();
  const ralphDir = path.join(rootPath, '.ralph');
  const artifactsDir = path.join(ralphDir, 'artifacts');
  await fs.mkdir(path.join(artifactsDir, 'T1'), { recursive: true });
  await fs.mkdir(path.join(artifactsDir, 'T2'), { recursive: true });

  await fs.writeFile(path.join(ralphDir, 'tasks.json'), JSON.stringify({
    version: 2,
    tasks: [
      {
        id: 'T0',
        title: 'Existing prerequisite',
        status: 'done'
      },
      {
        id: 'T1',
        title: 'Build task tree provider',
        status: 'todo',
        validation: 'npm run validate',
        dependsOn: ['T0']
      },
      {
        id: 'T2',
        title: 'Recover parked task',
        status: 'blocked',
        blocker: 'Needs operator requeue'
      }
    ]
  }, null, 2), 'utf8');
  await fs.writeFile(path.join(ralphDir, 'claims.json'), JSON.stringify({
    version: 1,
    claims: [
      {
        taskId: 'T1',
        agentId: 'builder-1',
        provenanceId: 'prov-123',
        claimedAt: '2026-04-10T00:00:00.000Z',
        status: 'active'
      }
    ]
  }, null, 2), 'utf8');
  await fs.writeFile(path.join(ralphDir, 'dead-letter.json'), JSON.stringify({
    schemaVersion: 1,
    kind: 'deadLetterQueue',
    entries: [
      {
        schemaVersion: 1,
        kind: 'deadLetterEntry',
        taskId: 'T2',
        taskTitle: 'Recover parked task',
        deadLetteredAt: '2026-04-12T10:00:00.000Z',
        recoveryAttemptCount: 3,
        diagnosticHistory: [
          {
            schemaVersion: 1,
            kind: 'failureAnalysis',
            taskId: 'T2',
            createdAt: '2026-04-12T09:59:00.000Z',
            rootCauseCategory: 'validation_mismatch',
            confidence: 'high',
            summary: 'Validator and task expectation diverged.',
            suggestedAction: 'Requeue after clarifying expected output.'
          }
        ]
      }
    ]
  }, null, 2), 'utf8');
  await fs.writeFile(path.join(ralphDir, 'state.json'), JSON.stringify({
    version: 2,
    objectivePreview: null,
    nextIteration: 3,
    lastPromptKind: null,
    lastPromptPath: null,
    lastRun: null,
    runHistory: [],
    lastIteration: null,
    iterationHistory: [],
    updatedAt: '2026-04-13T00:00:00.000Z'
  }, null, 2), 'utf8');
  await fs.writeFile(path.join(artifactsDir, 'T1', 'task-plan.json'), JSON.stringify({
    reasoning: 'Need a durable projection layer.',
    approach: 'Read tasks, claims, and artifacts directly from disk.',
    steps: ['Read task file', 'Render groups'],
    risks: ['Refresh drift'],
    suggestedValidationCommand: 'npm run validate'
  }, null, 2), 'utf8');
  await fs.writeFile(path.join(artifactsDir, 'T1', 'failure-analysis.json'), JSON.stringify({
    schemaVersion: 1,
    kind: 'failureAnalysis',
    taskId: 'T1',
    createdAt: '2026-04-12T11:00:00.000Z',
    rootCauseCategory: 'implementation_error',
    confidence: 'medium',
    summary: 'Tree provider not yet wired into activation.',
    suggestedAction: 'Register the provider during activate.'
  }, null, 2), 'utf8');

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  const provider = new RalphTaskTreeDataProvider(workspaceFolder(rootPath));
  const rootItems = await provider.getChildren();
  assert.equal(rootItems.length, 5);

  const todoGroup = rootItems.find((item: TreeItemLike) => item.label === 'To Do');
  const recoveryGroup = rootItems.find((item: TreeItemLike) => item.label === 'Recovery Queue');
  assert.ok(todoGroup);
  assert.ok(recoveryGroup);

  const activeTasks = await provider.getChildren(todoGroup);
  assert.equal(activeTasks.length, 1);
  assert.equal(activeTasks[0]?.label, 'T1');
  assert.match(String(activeTasks[0]?.description ?? ''), /todo/);
  assert.match(String(activeTasks[0]?.description ?? ''), /tier: simple/);
  assert.match(String(activeTasks[0]?.description ?? ''), /depends: T0/);
  assert.match(String(activeTasks[0]?.description ?? ''), /claim: builder-1/);

  const activeDetails = await provider.getChildren(activeTasks[0]);
  assert.ok(activeDetails.some((item: TreeItemLike) => item.label === 'Task plan'));
  assert.ok(activeDetails.some((item: TreeItemLike) => item.label === 'Diagnostic'));
  const staleClaimAction = activeDetails.find((item: TreeItemLike) => item.label === 'Resolve stale claim');
  assert.ok(staleClaimAction);
  assert.equal(staleClaimAction?.command?.command, 'ralphCodex.resolveStaleTaskClaim');

  const recoveryTasks = await provider.getChildren(recoveryGroup);
  assert.equal(recoveryTasks.length, 1);
  assert.equal(recoveryTasks[0]?.label, 'T2');
  assert.match(String(recoveryTasks[0]?.description ?? ''), /recovery queue/);

  const recoveryDetails = await provider.getChildren(recoveryTasks[0]);
  assert.ok(recoveryDetails.some((item: TreeItemLike) => item.label === 'Recovery summary'));
  const requeueAction = recoveryDetails.find((item: TreeItemLike) => item.label === 'Requeue recovery task');
  assert.ok(requeueAction);
  assert.equal(requeueAction?.command?.command, 'ralphCodex.requeueDeadLetterTask');
  assert.equal(requeueAction?.command?.title, 'Requeue Recovery Task');

  const renderedCopy = [
    ...rootItems,
    ...activeTasks,
    ...activeDetails,
    ...recoveryTasks,
    ...recoveryDetails
  ].map((item: TreeItemLike) => `${String(item.label ?? '')} ${String(item.description ?? '')} ${item.command?.title ?? ''}`).join('\n');
  assert.ok(!renderedCopy.includes('Dead-Letter'));
  assert.ok(!renderedCopy.includes('Dead-letter'));
  assert.ok(!renderedCopy.includes('dead-letter'));
});
