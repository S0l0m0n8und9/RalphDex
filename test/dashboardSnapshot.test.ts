import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDashboardSnapshot,
  type DashboardSnapshot,
} from '../src/webview/dashboardSnapshot';
import type { RalphStatusSnapshot } from '../src/ralph/statusReport';
import type { AgentStatusSummary, AgentHandoffSummary } from '../src/ralph/multiAgentStatus';
import type { DeadLetterEntry } from '../src/ralph/deadLetter';
import type { FailureAnalysis } from '../src/ralph/failureDiagnostics';
import type { PipelineRunArtifact } from '../src/ralph/pipeline';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/**
 * Returns the minimal fields that `buildDashboardSnapshot` actually reads,
 * cast to `RalphStatusSnapshot` so callers don't need to supply the full type.
 * Fields not relevant to the dashboard are omitted via the cast.
 */
function minimalSnapshot(
  overrides: Partial<
    Pick<
      RalphStatusSnapshot,
      | 'workspaceName'
      | 'workspaceTrusted'
      | 'nextIteration'
      | 'taskCounts'
      | 'selectedTask'
      | 'latestPipelineRun'
      | 'latestRemediation'
      | 'deadLetterEntries'
      | 'lastFailureCategory'
      | 'recoveryAttemptCount'
      | 'latestFailureAnalysis'
    >
  > = {}
): RalphStatusSnapshot {
  return {
    workspaceName: 'test-workspace',
    workspaceTrusted: true,
    nextIteration: 1,
    taskCounts: null,
    selectedTask: null,
    latestPipelineRun: null,
    latestRemediation: null,
    deadLetterEntries: undefined,
    lastFailureCategory: undefined,
    recoveryAttemptCount: undefined,
    latestFailureAnalysis: null,
    ...overrides,
  } as unknown as RalphStatusSnapshot;
}

function makeDeadLetterEntry(taskId: string): DeadLetterEntry {
  return {
    schemaVersion: 1,
    kind: 'deadLetterEntry',
    taskId,
    taskTitle: `Task ${taskId}`,
    deadLetteredAt: '2026-01-01T00:00:00.000Z',
    diagnosticHistory: [],
    recoveryAttemptCount: 3,
  };
}

function makeFailureAnalysis(
  taskId: string,
  createdAt: string,
  category: FailureAnalysis['rootCauseCategory'],
  confidence: FailureAnalysis['confidence']
): FailureAnalysis {
  return {
    schemaVersion: 1,
    kind: 'failureAnalysis',
    taskId,
    createdAt,
    rootCauseCategory: category,
    confidence,
    summary: `Failure summary for ${taskId}`,
    suggestedAction: `Suggested action for ${taskId}`,
  };
}

function makeAgentSummary(
  agentId: string,
  handoffs: AgentHandoffSummary[] = [],
  stuckScore = 0,
  activeClaimTaskId: string | null = null
): AgentStatusSummary {
  return {
    agentId,
    firstSeenAt: '2026-01-01T00:00:00.000Z',
    completedTaskCount: handoffs.filter((h) => h.completionClassification === 'task_complete').length,
    activeClaimTaskId,
    handoffHistory: handoffs,
    latestHandoff: handoffs.length > 0 ? handoffs[handoffs.length - 1] : null,
    stuckScore,
    activeClaimTaskTier: null,
    activeClaimTaskTierSource: null,
  };
}

function makeHandoff(
  iteration: number,
  taskId: string,
  classification: string
): AgentHandoffSummary {
  return {
    iteration,
    selectedTaskId: taskId,
    selectedTaskTitle: `Task ${taskId}`,
    stopReason: null,
    completionClassification: classification,
    progressNote: null,
  };
}

function makePipelineRun(overrides: Partial<PipelineRunArtifact> = {}): PipelineRunArtifact {
  return {
    schemaVersion: 1,
    kind: 'pipelineRun',
    runId: 'pipeline-run-001',
    prdHash: 'abc123',
    prdPath: '.ralph/prd.md',
    rootTaskId: 'T1',
    decomposedTaskIds: ['T2', 'T3', 'T4'],
    loopStartTime: '2026-01-01T00:00:00.000Z',
    status: 'running',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Empty workspace
// ---------------------------------------------------------------------------

test('buildDashboardSnapshot: empty Ralph workspace returns null/empty sections', () => {
  const snapshot = minimalSnapshot();
  const result: DashboardSnapshot = buildDashboardSnapshot(snapshot);

  assert.strictEqual(result.workspaceName, 'test-workspace');
  assert.strictEqual(result.pipeline, null);
  assert.strictEqual(result.taskBoard.counts, null);
  assert.strictEqual(result.taskBoard.deadLetterCount, 0);
  assert.strictEqual(result.taskBoard.selectedTaskId, null);
  assert.strictEqual(result.taskBoard.selectedTaskTitle, null);
  assert.strictEqual(result.taskBoard.nextIteration, 1);
  assert.deepEqual(result.agentGrid, { rows: [] });
  assert.deepEqual(result.failureFeed.entries, []);
  assert.deepEqual(result.deadLetter.entries, []);
  assert.strictEqual(result.quickActions.hasDeadLetterEntries, false);
  assert.strictEqual(result.quickActions.hasBlockedTasks, false);
  assert.strictEqual(result.quickActions.canAttemptLoop, false); // no selected task
});

// ---------------------------------------------------------------------------
// Populated workspace
// ---------------------------------------------------------------------------

test('buildDashboardSnapshot: populated workspace surfaces pipeline, tasks, failures, and dead-letter', () => {
  const snapshot = minimalSnapshot({
    workspaceName: 'my-repo',
    workspaceTrusted: true,
    nextIteration: 42,
    taskCounts: { todo: 5, in_progress: 1, blocked: 2, done: 234 },
    selectedTask: {
      id: 'T108',
      title: 'Webview UI Phase 2.1',
      status: 'in_progress',
    } as RalphStatusSnapshot['selectedTask'],
    latestPipelineRun: makePipelineRun({
      status: 'running',
      phase: 'loop',
      decomposedTaskIds: ['T2', 'T3'],
      prUrl: undefined,
    }),
    latestRemediation: {
      trigger: 'repeated_no_progress',
      attemptCount: 2,
      action: 'reframe_task',
      humanReviewRecommended: true,
      summary: 'Validation mismatch — adjusted prompt',
      evidence: ['npm run validate failed'],
    } as RalphStatusSnapshot['latestRemediation'],
    latestFailureAnalysis: {
      schemaVersion: 1,
      kind: 'failureAnalysis',
      taskId: 'T108',
      createdAt: '2026-01-01T00:00:00.000Z',
      rootCauseCategory: 'validation_mismatch',
      confidence: 'high',
      summary: 'Output shape does not match the verifier contract.',
      suggestedAction: 'Align the emitted payload to the validator schema.',
    },
    deadLetterEntries: [makeDeadLetterEntry('T99'), makeDeadLetterEntry('T100')],
    lastFailureCategory: 'validation_mismatch',
    recoveryAttemptCount: 2,
  });

  const result = buildDashboardSnapshot(snapshot);

  // Pipeline strip
  assert.ok(result.pipeline !== null);
  assert.strictEqual(result.pipeline!.runId, 'pipeline-run-001');
  assert.strictEqual(result.pipeline!.status, 'running');
  assert.strictEqual(result.pipeline!.phase, 'loop');
  assert.strictEqual(result.pipeline!.decomposedTaskCount, 2);
  assert.strictEqual(result.pipeline!.prUrl, null);

  // Task board
  assert.deepEqual(result.taskBoard.counts, { todo: 5, in_progress: 1, blocked: 2, done: 234 });
  assert.strictEqual(result.taskBoard.deadLetterCount, 2);
  assert.strictEqual(result.taskBoard.selectedTaskId, 'T108');
  assert.strictEqual(result.taskBoard.selectedTaskTitle, 'Webview UI Phase 2.1');
  assert.strictEqual(result.taskBoard.nextIteration, 42);

  // Failure feed
  assert.strictEqual(result.failureFeed.entries.length, 1);
  assert.strictEqual(result.failureFeed.entries[0].category, 'validation_mismatch');
  assert.strictEqual(result.failureFeed.entries[0].confidence, 'high');
  assert.strictEqual(result.failureFeed.entries[0].recoveryAttemptCount, 2);
  assert.strictEqual(result.failureFeed.entries[0].remediationSummary, 'Validation mismatch — adjusted prompt');
  assert.strictEqual(result.failureFeed.entries[0].humanReviewRecommended, true);

  // Dead-letter
  assert.strictEqual(result.deadLetter.entries.length, 2);
  assert.strictEqual(result.deadLetter.entries[0].taskId, 'T99');
  assert.strictEqual(result.deadLetter.entries[1].taskId, 'T100');

  // Quick actions
  assert.strictEqual(result.quickActions.hasDeadLetterEntries, true);
  assert.strictEqual(result.quickActions.hasBlockedTasks, true);
  assert.strictEqual(result.quickActions.canAttemptLoop, true);
});

// ---------------------------------------------------------------------------
// Agent grid
// ---------------------------------------------------------------------------

test('buildDashboardSnapshot: agent grid rows are populated from summaries', () => {
  const handoffs = [
    makeHandoff(1, 'T1', 'task_complete'),
    makeHandoff(2, 'T2', 'no_progress'),
    makeHandoff(3, 'T2', 'no_progress'),
    makeHandoff(4, 'T2', 'no_progress'),
  ];
  const agentSummaries: AgentStatusSummary[] = [
    makeAgentSummary('agent-alpha', handoffs, 3, 'T2'),
    makeAgentSummary('agent-beta', [], 0, null),
  ];
  const snapshot = minimalSnapshot();
  const result = buildDashboardSnapshot(snapshot, agentSummaries);

  assert.strictEqual(result.agentGrid.rows.length, 2);

  const alpha = result.agentGrid.rows[0];
  assert.strictEqual(alpha.agentId, 'agent-alpha');
  assert.strictEqual(alpha.stuckScore, 3);
  assert.strictEqual(alpha.isStuck, true); // stuckScore >= STUCK_SCORE_THRESHOLD (3)
  assert.strictEqual(alpha.latestHandoffClassification, 'no_progress');
  assert.strictEqual(alpha.latestHandoffIteration, 4);
  assert.strictEqual(alpha.activeClaimTaskId, 'T2');
  assert.ok(alpha.noProgressHeatmap.includes('X'), 'heatmap should include X for no_progress entries');

  const beta = result.agentGrid.rows[1];
  assert.strictEqual(beta.agentId, 'agent-beta');
  assert.strictEqual(beta.isStuck, false);
  assert.strictEqual(beta.latestHandoffClassification, null);
  assert.strictEqual(beta.noProgressHeatmap, '');
});

test('buildDashboardSnapshot: null agentSummaries yields empty agent grid', () => {
  const snapshot = minimalSnapshot();
  const result = buildDashboardSnapshot(snapshot, null);
  assert.deepEqual(result.agentGrid, { rows: [] });
});

// ---------------------------------------------------------------------------
// Quick-action inputs
// ---------------------------------------------------------------------------

test('buildDashboardSnapshot: canAttemptLoop is false when workspace is untrusted', () => {
  const snapshot = minimalSnapshot({
    workspaceTrusted: false,
    selectedTask: { id: 'T1', title: 'Some task', status: 'todo' } as RalphStatusSnapshot['selectedTask'],
  });
  const result = buildDashboardSnapshot(snapshot);
  assert.strictEqual(result.quickActions.canAttemptLoop, false);
});

test('buildDashboardSnapshot: canAttemptLoop is false when no selected task', () => {
  const snapshot = minimalSnapshot({ workspaceTrusted: true, selectedTask: null });
  const result = buildDashboardSnapshot(snapshot);
  assert.strictEqual(result.quickActions.canAttemptLoop, false);
});

test('buildDashboardSnapshot: canAttemptLoop is true when trusted and task selected', () => {
  const snapshot = minimalSnapshot({
    workspaceTrusted: true,
    selectedTask: { id: 'T1', title: 'Some task', status: 'todo' } as RalphStatusSnapshot['selectedTask'],
  });
  const result = buildDashboardSnapshot(snapshot);
  assert.strictEqual(result.quickActions.canAttemptLoop, true);
});

// ---------------------------------------------------------------------------
// Pipeline strip edge cases
// ---------------------------------------------------------------------------

test('buildDashboardSnapshot: pipeline strip includes prUrl when present', () => {
  const snapshot = minimalSnapshot({
    latestPipelineRun: makePipelineRun({
      status: 'complete',
      phase: 'done',
      loopEndTime: '2026-01-02T00:00:00.000Z',
      prUrl: 'https://github.com/org/repo/pull/42',
    }),
  });
  const result = buildDashboardSnapshot(snapshot);

  assert.ok(result.pipeline !== null);
  assert.strictEqual(result.pipeline!.status, 'complete');
  assert.strictEqual(result.pipeline!.phase, 'done');
  assert.strictEqual(result.pipeline!.loopEndTime, '2026-01-02T00:00:00.000Z');
  assert.strictEqual(result.pipeline!.prUrl, 'https://github.com/org/repo/pull/42');
  assert.strictEqual(result.pipeline!.lastStopReason, null);
});

test('buildDashboardSnapshot: deadLetterEntries undefined treated as empty', () => {
  const snapshot = minimalSnapshot({ deadLetterEntries: undefined });
  const result = buildDashboardSnapshot(snapshot);
  assert.deepEqual(result.deadLetter.entries, []);
  assert.strictEqual(result.quickActions.hasDeadLetterEntries, false);
});

test('buildDashboardSnapshot: failure feed includes recent selected-task and dead-letter diagnostic events', () => {
  const selectedTaskAnalysis = makeFailureAnalysis(
    'T110',
    '2026-01-06T00:00:00.000Z',
    'validation_mismatch',
    'high'
  );
  const deadLetterEntries: DeadLetterEntry[] = [
    {
      ...makeDeadLetterEntry('T200'),
      taskTitle: 'Recover agent watchdog',
      recoveryAttemptCount: 4,
      diagnosticHistory: [
        makeFailureAnalysis('T200', '2026-01-05T00:00:00.000Z', 'environment_issue', 'medium'),
        makeFailureAnalysis('T200', '2026-01-02T00:00:00.000Z', 'dependency_missing', 'low'),
      ],
    },
    {
      ...makeDeadLetterEntry('T201'),
      taskTitle: 'Repair pipeline resume',
      diagnosticHistory: [
        makeFailureAnalysis('T201', '2026-01-04T00:00:00.000Z', 'implementation_error', 'high'),
        makeFailureAnalysis('T201', '2026-01-03T00:00:00.000Z', 'task_ambiguity', 'medium'),
        makeFailureAnalysis('T201', '2026-01-01T00:00:00.000Z', 'transient', 'low'),
      ],
    },
  ];

  const snapshot = minimalSnapshot({
    selectedTask: {
      id: 'T110',
      title: 'Surface dashboard sections',
      status: 'in_progress',
    } as RalphStatusSnapshot['selectedTask'],
    latestFailureAnalysis: selectedTaskAnalysis,
    latestRemediation: {
      trigger: 'repeated_no_progress',
      attemptCount: 2,
      action: 'reframe_task',
      humanReviewRecommended: true,
      summary: 'Validation mismatch — adjusted prompt',
      evidence: ['npm run validate failed'],
    } as RalphStatusSnapshot['latestRemediation'],
    recoveryAttemptCount: 2,
    deadLetterEntries,
  });

  const result = buildDashboardSnapshot(snapshot);

  assert.equal(result.failureFeed.entries.length, 5, 'failure feed should cap to the 5 most recent events');
  assert.deepEqual(
    result.failureFeed.entries.map((entry) => entry.taskId),
    ['T110', 'T200', 'T201', 'T201', 'T200']
  );
  assert.deepEqual(
    result.failureFeed.entries.map((entry) => entry.category),
    ['validation_mismatch', 'environment_issue', 'implementation_error', 'task_ambiguity', 'dependency_missing']
  );
  assert.equal(result.failureFeed.entries[0].taskTitle, 'Surface dashboard sections');
  assert.equal(result.failureFeed.entries[0].remediationSummary, 'Validation mismatch — adjusted prompt');
  assert.equal(result.failureFeed.entries[0].humanReviewRecommended, true);
  assert.equal(result.failureFeed.entries[1].taskTitle, 'Recover agent watchdog');
  assert.equal(result.failureFeed.entries[1].recoveryAttemptCount, 4);
  assert.equal(result.failureFeed.entries[1].remediationSummary, null);
  assert.equal(result.failureFeed.entries[1].humanReviewRecommended, false);
});
