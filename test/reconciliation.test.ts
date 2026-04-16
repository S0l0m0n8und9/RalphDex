import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import * as vscode from 'vscode';
import { Logger } from '../src/services/logger';
import { reconcileCompletionReport } from '../src/ralph/reconciliation';
import type { ReconcileCompletionReportInput } from '../src/ralph/reconciliation';
import type { PreparedIterationContext } from '../src/ralph/iterationPreparation';
import type { RalphHandoff } from '../src/ralph/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLogger(): Logger {
  return new Logger({
    appendLine: () => undefined,
    append: () => undefined,
    show: () => undefined,
    dispose: () => undefined
  } as unknown as vscode.OutputChannel);
}

const AGENT_ID = 'test-agent';
const PROVENANCE_ID = 'prov-001';
const TASK_ID = 'T100';

interface TestWorkspace {
  ralphDir: string;
  handoffsDir: string;
  taskFilePath: string;
  claimFilePath: string;
  progressPath: string;
  artifactDir: string;
}

async function makeTestWorkspace(): Promise<TestWorkspace> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-reconcil-'));
  const ralphDir = path.join(tmpDir, '.ralph');
  const handoffsDir = path.join(ralphDir, 'handoffs');
  const artifactDir = path.join(ralphDir, 'artifacts');
  const taskFilePath = path.join(ralphDir, 'tasks.json');
  const claimFilePath = path.join(ralphDir, 'claims.json');
  const progressPath = path.join(ralphDir, 'progress.md');

  await fs.mkdir(ralphDir, { recursive: true });
  await fs.mkdir(artifactDir, { recursive: true });

  await fs.writeFile(taskFilePath, JSON.stringify({
    version: 2,
    tasks: [{ id: TASK_ID, title: 'Test task', status: 'in_progress', dependencies: [] }]
  }, null, 2));

  await fs.writeFile(claimFilePath, JSON.stringify({
    version: 1,
    claims: [{
      agentId: AGENT_ID,
      taskId: TASK_ID,
      claimedAt: new Date().toISOString(),
      provenanceId: PROVENANCE_ID,
      status: 'active'
    }]
  }));

  await fs.writeFile(progressPath, '');

  return { ralphDir, handoffsDir, taskFilePath, claimFilePath, progressPath, artifactDir };
}

function makeInput(ws: TestWorkspace): ReconcileCompletionReportInput {
  const reportJson = JSON.stringify({
    selectedTaskId: TASK_ID,
    requestedStatus: 'in_progress',
    progressNote: 'Still working'
  });
  const lastMessage = `Work in progress.\n\n\`\`\`json\n${reportJson}\n\`\`\``;

  return {
    prepared: {
      config: {
        agentId: AGENT_ID,
        agentRole: 'implementer',
        verifierModes: ['taskState'],
        gitCheckpointMode: 'none'
      },
      paths: {
        ralphDir: ws.ralphDir,
        claimFilePath: ws.claimFilePath,
        progressPath: ws.progressPath,
        artifactDir: ws.artifactDir
      },
      provenanceId: PROVENANCE_ID,
      promptKind: 'iteration',
      validationCommand: null
    } as unknown as PreparedIterationContext,
    selectedTask: {
      id: TASK_ID,
      title: 'Test task',
      status: 'in_progress',
      dependencies: []
    } as unknown as ReconcileCompletionReportInput['selectedTask'],
    verificationStatus: 'passed',
    validationCommandStatus: 'passed',
    preliminaryClassification: 'no_progress',
    lastMessage,
    taskFilePath: ws.taskFilePath,
    logger: makeLogger()
  };
}

async function writeHandoff(handoffsDir: string, handoffId: string, handoff: Partial<RalphHandoff>): Promise<void> {
  await fs.mkdir(handoffsDir, { recursive: true });
  await fs.writeFile(path.join(handoffsDir, `${handoffId}.json`), JSON.stringify(handoff));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('reconcileCompletionReport emits no warning when handoffs directory does not exist', async () => {
  const ws = await makeTestWorkspace();
  const result = await reconcileCompletionReport(makeInput(ws));

  const scopeWarning = result.warnings.find((w) => w.includes('handoff scope'));
  assert.equal(scopeWarning, undefined);
  assert.equal(result.artifact.needsHumanReview, undefined);
  assert.equal(result.artifact.status, 'applied');
});

test('reconcileCompletionReport emits no warning when accepted handoff taskId matches completion report', async () => {
  const ws = await makeTestWorkspace();
  await writeHandoff(ws.handoffsDir, 'h-001', {
    handoffId: 'h-001',
    taskId: TASK_ID,
    status: 'accepted',
    fromAgentId: 'agent-planner',
    toRole: 'implementer',
    objective: 'Implement feature',
    constraints: [],
    acceptedEvidence: [],
    expectedOutputContract: '',
    stopConditions: [],
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    provenanceLinks: [],
    history: []
  });

  const result = await reconcileCompletionReport(makeInput(ws));

  const scopeWarning = result.warnings.find((w) => w.includes('handoff scope'));
  assert.equal(scopeWarning, undefined);
  assert.equal(result.artifact.needsHumanReview, undefined);
  assert.equal(result.artifact.status, 'applied');
});

test('reconcileCompletionReport emits scope-violation warning when accepted handoff taskId differs from completion report', async () => {
  const ws = await makeTestWorkspace();
  await writeHandoff(ws.handoffsDir, 'h-001', {
    handoffId: 'h-001',
    taskId: 'T200',
    status: 'accepted',
    fromAgentId: 'agent-planner',
    toRole: 'implementer',
    objective: 'Implement feature',
    constraints: [],
    acceptedEvidence: [],
    expectedOutputContract: '',
    stopConditions: [],
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    provenanceLinks: [],
    history: []
  });

  const result = await reconcileCompletionReport(makeInput(ws));

  assert.ok(
    result.warnings.some((w) => w.includes('handoff scope')),
    `Expected scope-violation warning; got: ${JSON.stringify(result.warnings)}`
  );
  assert.equal(result.artifact.needsHumanReview, true);
  assert.equal(result.artifact.status, 'applied');
});

test('reconcileCompletionReport gracefully skips malformed handoff files without crashing', async () => {
  const ws = await makeTestWorkspace();
  await fs.mkdir(ws.handoffsDir, { recursive: true });
  await fs.writeFile(path.join(ws.handoffsDir, 'bad.json'), 'not valid json {{{');

  const result = await reconcileCompletionReport(makeInput(ws));

  const scopeWarning = result.warnings.find((w) => w.includes('handoff scope'));
  assert.equal(scopeWarning, undefined);
  assert.equal(result.artifact.needsHumanReview, undefined);
  assert.equal(result.artifact.status, 'applied');
});

// ---------------------------------------------------------------------------
// Policy enforcement tests
// ---------------------------------------------------------------------------

test('reconcileCompletionReport rejects planner requesting done (no allowed mutations)', async () => {
  const ws = await makeTestWorkspace();
  const reportJson = JSON.stringify({
    selectedTaskId: TASK_ID,
    requestedStatus: 'done',
    progressNote: 'Plan complete'
  });
  const lastMessage = `Done.\n\n\`\`\`json\n${reportJson}\n\`\`\``;

  const input: ReconcileCompletionReportInput = {
    ...makeInput(ws),
    lastMessage,
    prepared: {
      ...makeInput(ws).prepared,
      config: {
        ...makeInput(ws).prepared.config,
        agentRole: 'planner'
      }
    } as unknown as ReconcileCompletionReportInput['prepared']
  };

  const result = await reconcileCompletionReport(input);

  assert.equal(result.artifact.status, 'rejected');
  assert.equal(result.artifact.rejectionReason, 'policy_violation');
  assert.equal(result.artifact.needsHumanReview, true);
  assert.ok(
    result.warnings.some((w) => w.includes('policy_violation') || w.includes('Policy violation')),
    `Expected policy_violation warning; got: ${JSON.stringify(result.warnings)}`
  );
  assert.equal(result.taskFileChanged, false);
});

test('reconcileCompletionReport rejects reviewer requesting in_progress→done directly', async () => {
  const ws = await makeTestWorkspace();
  const reportJson = JSON.stringify({
    selectedTaskId: TASK_ID,
    requestedStatus: 'done',
    progressNote: 'Review approved'
  });
  const lastMessage = `Done.\n\n\`\`\`json\n${reportJson}\n\`\`\``;

  const input: ReconcileCompletionReportInput = {
    ...makeInput(ws),
    lastMessage,
    prepared: {
      ...makeInput(ws).prepared,
      config: {
        ...makeInput(ws).prepared.config,
        agentRole: 'reviewer'
      }
    } as unknown as ReconcileCompletionReportInput['prepared']
  };

  const result = await reconcileCompletionReport(input);

  assert.equal(result.artifact.status, 'rejected');
  assert.equal(result.artifact.rejectionReason, 'policy_violation');
  assert.equal(result.artifact.needsHumanReview, true);
  assert.equal(result.taskFileChanged, false);
});

test('reconcileCompletionReport rejects watchdog requesting any task-state mutation', async () => {
  const ws = await makeTestWorkspace();
  const reportJson = JSON.stringify({
    selectedTaskId: TASK_ID,
    requestedStatus: 'blocked',
    blocker: 'stale claim detected'
  });
  const lastMessage = `Blocked.\n\n\`\`\`json\n${reportJson}\n\`\`\``;

  const input: ReconcileCompletionReportInput = {
    ...makeInput(ws),
    lastMessage,
    prepared: {
      ...makeInput(ws).prepared,
      config: {
        ...makeInput(ws).prepared.config,
        agentRole: 'watchdog'
      }
    } as unknown as ReconcileCompletionReportInput['prepared']
  };

  const result = await reconcileCompletionReport(input);

  assert.equal(result.artifact.status, 'rejected');
  assert.equal(result.artifact.rejectionReason, 'policy_violation');
  assert.equal(result.artifact.needsHumanReview, true);
  assert.equal(result.taskFileChanged, false);
});

test('reconcileCompletionReport allows implementer in_progress→done mutation', async () => {
  const ws = await makeTestWorkspace();
  const reportJson = JSON.stringify({
    selectedTaskId: TASK_ID,
    requestedStatus: 'done',
    validationRan: 'npm run validate - passed'
  });
  const lastMessage = `Done.\n\n\`\`\`json\n${reportJson}\n\`\`\``;

  const input: ReconcileCompletionReportInput = {
    ...makeInput(ws),
    lastMessage,
    verificationStatus: 'passed',
    validationCommandStatus: 'passed',
    prepared: {
      ...makeInput(ws).prepared,
      config: {
        ...makeInput(ws).prepared.config,
        agentRole: 'implementer'
      }
    } as unknown as ReconcileCompletionReportInput['prepared']
  };

  const result = await reconcileCompletionReport(input);

  assert.notEqual(result.artifact.rejectionReason, 'policy_violation');
  assert.equal(result.artifact.status, 'applied');
});

test('reconcileCompletionReport allows in_progress→in_progress heartbeat for any role', async () => {
  const ws = await makeTestWorkspace();
  // Task status is 'in_progress' (set in makeTestWorkspace); report also requests 'in_progress'
  const reportJson = JSON.stringify({
    selectedTaskId: TASK_ID,
    requestedStatus: 'in_progress',
    progressNote: 'Still working'
  });
  const lastMessage = `Progress.\n\n\`\`\`json\n${reportJson}\n\`\`\``;

  for (const agentRole of ['planner', 'reviewer', 'watchdog'] as const) {
    const input: ReconcileCompletionReportInput = {
      ...makeInput(ws),
      lastMessage,
      prepared: {
        ...makeInput(ws).prepared,
        config: {
          ...makeInput(ws).prepared.config,
          agentRole
        }
      } as unknown as ReconcileCompletionReportInput['prepared']
    };

    const result = await reconcileCompletionReport(input);

    assert.notEqual(
      result.artifact.rejectionReason, 'policy_violation',
      `in_progress→in_progress heartbeat must not be blocked for role '${agentRole}'`
    );
  }
});

test('reconcileCompletionReport rejects reviewer proposing suggestedChildTasks (source-edit blocked)', async () => {
  const ws = await makeTestWorkspace();
  const reportJson = JSON.stringify({
    selectedTaskId: TASK_ID,
    requestedStatus: 'in_progress',
    progressNote: 'Suggesting decomposition',
    suggestedChildTasks: [
      {
        id: 'T101',
        title: 'Child task',
        parentId: TASK_ID,
        dependsOn: [],
        validation: null,
        rationale: 'Split the work'
      }
    ]
  });
  const lastMessage = `In progress.\n\n\`\`\`json\n${reportJson}\n\`\`\``;

  const input: ReconcileCompletionReportInput = {
    ...makeInput(ws),
    lastMessage,
    prepared: {
      ...makeInput(ws).prepared,
      config: {
        ...makeInput(ws).prepared.config,
        agentRole: 'reviewer'
      }
    } as unknown as ReconcileCompletionReportInput['prepared']
  };

  const result = await reconcileCompletionReport(input);

  assert.equal(result.artifact.status, 'rejected');
  assert.equal(result.artifact.rejectionReason, 'policy_violation');
  assert.equal(result.artifact.needsHumanReview, true);
});
