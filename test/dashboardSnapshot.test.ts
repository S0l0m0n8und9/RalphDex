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
import type { FanInRecord, OrchestrationNodeSpan, RalphProvenanceBundle, ReplanDecisionArtifact } from '../src/ralph/types';

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
      | 'latestRemediation'
      | 'deadLetterEntries'
      | 'lastFailureCategory'
      | 'recoveryAttemptCount'
      | 'latestFailureAnalysis'
      | 'latestFailureAnalysisPath'
      | 'recoveryStatePath'
      | 'latestProvenanceBundle'
      | 'doctrineInspection'
      | 'doctrineContext'
      | 'pendingDoctrineProposalCountsByRisk'
      | 'pendingDoctrineProposals'
      | 'latestDoctrineProposalPath'
      | 'latestDoctrineProposalMdPath'
      | 'latestPipelineRun'
      | 'preflightReport'
      | 'orchestration'
      | 'replanArtifacts'
      | 'fanInRecord'
      | 'nodeSpans'
    >
  > = {}
): RalphStatusSnapshot {
  return {
    workspaceName: 'test-workspace',
    workspaceTrusted: true,
    nextIteration: 1,
    taskCounts: null,
    selectedTask: null,
    latestRemediation: null,
    deadLetterEntries: undefined,
    lastFailureCategory: undefined,
    recoveryAttemptCount: undefined,
    latestFailureAnalysis: null,
    latestFailureAnalysisPath: null,
    recoveryStatePath: null,
    latestProvenanceBundle: null,
    latestDoctrineProposalPath: null,
    latestDoctrineProposalMdPath: null,
    doctrineInspection: {
      doctrineDir: '.ralph/doctrine',
      health: 'missing',
      protectedFiles: ['invariants.md', 'boundaries.md', 'agents.md'],
      diagnostics: []
    },
    doctrineContext: {
      entries: [],
      totalChars: 0,
      budgetChars: 8000,
      budgetExceeded: false
    },
    pendingDoctrineProposalCountsByRisk: { low: 0, medium: 0, high: 0 },
    pendingDoctrineProposals: [],
    preflightReport: {
      ready: true,
      summary: 'Preflight ready: no blocking diagnostics.',
      diagnostics: []
    },
    orchestration: undefined,
    replanArtifacts: undefined,
    fanInRecord: undefined,
    nodeSpans: undefined,
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

// ---------------------------------------------------------------------------
// Empty workspace
// ---------------------------------------------------------------------------

test('buildDashboardSnapshot: empty Ralph workspace returns null/empty sections', () => {
  const snapshot = minimalSnapshot();
  const result: DashboardSnapshot = buildDashboardSnapshot(snapshot);

  assert.strictEqual(result.workspaceName, 'test-workspace');
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
  assert.strictEqual(result.preflight?.ready, true);
  assert.strictEqual(result.preflight?.summary, 'Preflight ready: no blocking diagnostics.');
  assert.deepEqual(result.preflight?.diagnostics, []);
});

// ---------------------------------------------------------------------------
// Populated workspace
// ---------------------------------------------------------------------------

test('buildDashboardSnapshot: populated workspace surfaces tasks, failures, and dead-letter', () => {
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

  // Task board
  assert.deepEqual(result.taskBoard.counts, { todo: 5, in_progress: 1, blocked: 2, done: 234 });
  assert.strictEqual(result.taskBoard.deadLetterCount, 2);
  assert.strictEqual(result.taskBoard.selectedTaskId, 'T108');
  assert.strictEqual(result.taskBoard.selectedTaskTitle, 'Webview UI Phase 2.1');
  assert.strictEqual(result.taskBoard.nextIteration, 42);

  // Focused diagnosis
  assert.ok(result.diagnosis !== null);
  assert.strictEqual(result.diagnosis!.taskId, 'T108');
  assert.strictEqual(result.diagnosis!.taskTitle, 'Webview UI Phase 2.1');
  assert.strictEqual(result.diagnosis!.confidence, 'high');
  assert.strictEqual(result.diagnosis!.recoveryAttemptCount, 2);
  assert.strictEqual(result.diagnosis!.suggestedAction, 'Align the emitted payload to the validator schema.');

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

test('buildDashboardSnapshot: preflight diagnostics carry doctrine repair guidance', () => {
  const snapshot = minimalSnapshot({
    preflightReport: {
      ready: true,
      summary: 'Preflight ready with warnings.',
      diagnostics: [{
        category: 'workspaceRuntime',
        severity: 'warning',
        code: 'doctrine_directory_missing',
        message: 'Doctrine health: missing. .ralph/doctrine has not been created for this workspace. Run "Ralphdex: Initialize Doctrine Pack" to scaffold or repair doctrine files.'
      }]
    }
  });
  const result = buildDashboardSnapshot(snapshot);

  assert.strictEqual(result.preflight?.ready, true);
  assert.strictEqual(result.preflight?.summary, 'Preflight ready with warnings.');
  assert.equal(result.preflight?.diagnostics.length, 1);
  assert.ok(result.preflight?.diagnostics[0]?.message.includes('Ralphdex: Initialize Doctrine Pack'));
});

test('buildDashboardSnapshot: first-run readiness checklist marks blockers and warnings from preflight/task signals', () => {
  const snapshot = minimalSnapshot({
    taskCounts: { todo: 0, in_progress: 0, blocked: 0, done: 0 },
    selectedTask: null,
    preflightReport: {
      ready: false,
      summary: 'Preflight blocked.',
      diagnostics: [
        {
          category: 'workspaceRuntime',
          severity: 'warning',
          code: 'ralph_files_missing',
          message: 'Missing Ralph workspace files: PRD, progress log, task file.'
        },
        {
          category: 'codexAdapter',
          severity: 'error',
          code: 'codex_cli_missing',
          message: 'Codex CLI command could not be resolved from PATH.'
        },
        {
          category: 'validationVerifier',
          severity: 'warning',
          code: 'validation_command_missing',
          message: 'Validation-command verifier is enabled but no validation command was selected.'
        },
        {
          category: 'workspaceRuntime',
          severity: 'warning',
          code: 'doctrine_directory_missing',
          message: 'Doctrine health: missing.'
        }
      ]
    }
  });

  const result = buildDashboardSnapshot(snapshot);
  assert.ok(result.preflight, 'preflight section should exist');
  const checklist = result.preflight!.firstRunChecklist;

  assert.equal(checklist.length, 5);
  assert.equal(checklist.find((item) => item.id === 'workspace_initialized')?.status, 'blocker');
  assert.equal(checklist.find((item) => item.id === 'tasks_present')?.status, 'warning');
  assert.equal(checklist.find((item) => item.id === 'provider_ready')?.status, 'blocker');
  assert.equal(checklist.find((item) => item.id === 'doctrine_optional_healthy')?.status, 'warning');
  assert.equal(checklist.find((item) => item.id === 'validation_command_detected')?.status, 'warning');
});

test('buildDashboardSnapshot: first-run readiness checklist marks complete states when prerequisites are healthy', () => {
  const snapshot = minimalSnapshot({
    taskCounts: { todo: 1, in_progress: 0, blocked: 0, done: 0 },
    selectedTask: { id: 'T1', title: 'Implement feature', status: 'todo' } as RalphStatusSnapshot['selectedTask'],
    preflightReport: {
      ready: true,
      summary: 'Preflight ready.',
      diagnostics: [
        {
          category: 'codexAdapter',
          severity: 'info',
          code: 'codex_cli_path_verified',
          message: 'CLI path verified.'
        },
        {
          category: 'validationVerifier',
          severity: 'info',
          code: 'validation_command_executable_confirmed',
          message: 'Validation command executable token was confirmed.'
        }
      ]
    }
  });

  const result = buildDashboardSnapshot(snapshot);
  assert.ok(result.preflight, 'preflight section should exist');
  const checklist = result.preflight!.firstRunChecklist;

  assert.equal(checklist.length, 5);
  assert.equal(checklist.every((item) => item.status === 'complete'), true);
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
    latestFailureAnalysisPath: '.ralph/artifacts/T110/failure-analysis.json' as unknown as RalphStatusSnapshot['latestFailureAnalysisPath'],
    recoveryStatePath: '.ralph/artifacts/T110/recovery-state.json' as unknown as RalphStatusSnapshot['recoveryStatePath'],
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
  assert.equal(result.diagnosis?.failureAnalysisPath, '.ralph/artifacts/T110/failure-analysis.json');
  assert.equal(result.diagnosis?.recoveryStatePath, '.ralph/artifacts/T110/recovery-state.json');
});

// ---------------------------------------------------------------------------
// Cost ticker section
// ---------------------------------------------------------------------------

function makeProvenanceBundle(
  overrides: Partial<Pick<RalphProvenanceBundle, 'executionCostUsd' | 'diagnosticCost' | 'promptCacheStats'>> = {}
): RalphProvenanceBundle {
  return {
    schemaVersion: 1,
    kind: 'provenanceBundle',
    provenanceId: 'prov-test-001',
    iteration: 1,
    promptKind: 'iteration',
    promptTarget: 'cliExec',
    trustLevel: 'verifiedCliExecution',
    status: 'executed',
    summary: 'Test provenance bundle',
    rootPolicy: {} as RalphProvenanceBundle['rootPolicy'],
    selectedTaskId: 'T111',
    selectedTaskTitle: 'Test task',
    artifactDir: '.ralph/artifacts/iteration-001',
    bundleDir: '.ralph/artifacts/provenance/prov-test-001',
    preflightReportPath: '.ralph/artifacts/provenance/prov-test-001/preflight.json',
    preflightSummaryPath: '.ralph/artifacts/provenance/prov-test-001/preflight-summary.md',
    promptArtifactPath: null,
    promptEvidencePath: null,
    executionPlanPath: null,
    executionPlanHash: null,
    cliInvocationPath: null,
    iterationResultPath: null,
    provenanceFailurePath: null,
    provenanceFailureSummaryPath: null,
    promptHash: null,
    promptByteLength: null,
    executionPayloadHash: null,
    executionPayloadMatched: null,
    mismatchReason: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:01:00.000Z',
    ...overrides,
  };
}

test('buildDashboardSnapshot: cost section is unavailable when no provenance bundle', () => {
  const snapshot = minimalSnapshot({ latestProvenanceBundle: null });
  const result = buildDashboardSnapshot(snapshot);
  assert.strictEqual(result.cost.executionCostUsd, null);
  assert.strictEqual(result.cost.diagnosticCostUsd, null);
  assert.strictEqual(result.cost.promptCacheStats, null);
  assert.strictEqual(result.cost.hasAnyCostData, false);
});

test('buildDashboardSnapshot: cost section surfaces executionCostUsd and diagnosticCost from bundle', () => {
  const bundle = makeProvenanceBundle({
    executionCostUsd: 0.0142,
    diagnosticCost: 0.0031,
    promptCacheStats: { staticPrefixBytes: 8192, cacheHit: true },
  });
  const snapshot = minimalSnapshot({ latestProvenanceBundle: bundle });
  const result = buildDashboardSnapshot(snapshot);
  assert.strictEqual(result.cost.executionCostUsd, 0.0142);
  assert.strictEqual(result.cost.diagnosticCostUsd, 0.0031);
  assert.ok(result.cost.promptCacheStats !== null);
  assert.strictEqual(result.cost.promptCacheStats!.cacheHit, true);
  assert.strictEqual(result.cost.promptCacheStats!.staticPrefixBytes, 8192);
  assert.strictEqual(result.cost.hasAnyCostData, true);
});

test('buildDashboardSnapshot: cost section marks hasAnyCostData false when both costs are null', () => {
  const bundle = makeProvenanceBundle({
    executionCostUsd: null,
    diagnosticCost: null,
    promptCacheStats: { staticPrefixBytes: 4096, cacheHit: null },
  });
  const snapshot = minimalSnapshot({ latestProvenanceBundle: bundle });
  const result = buildDashboardSnapshot(snapshot);
  assert.strictEqual(result.cost.hasAnyCostData, false);
  assert.ok(result.cost.promptCacheStats !== null, 'cache stats still surfaced');
});

test('buildDashboardSnapshot: cost section exposes only executionCostUsd when diagnosticCost absent', () => {
  const bundle = makeProvenanceBundle({ executionCostUsd: 0.0055 });
  const snapshot = minimalSnapshot({ latestProvenanceBundle: bundle });
  const result = buildDashboardSnapshot(snapshot);
  assert.strictEqual(result.cost.executionCostUsd, 0.0055);
  assert.strictEqual(result.cost.diagnosticCostUsd, null);
  assert.strictEqual(result.cost.hasAnyCostData, true);
});

test('buildDashboardSnapshot: pipeline section projects latest run and orchestration evidence', () => {
  const snapshot = minimalSnapshot({
    latestPipelineRun: {
      schemaVersion: 1,
      kind: 'pipelineRun',
      runId: 'pipeline-20260509T010000Z-abcd',
      prdHash: 'hash-1',
      prdPath: '.ralph/prd.md',
      rootTaskId: 'T100',
      decomposedTaskIds: ['T101', 'T102'],
      loopStartTime: '2026-05-09T01:00:00.000Z',
      status: 'running',
      phase: 'loop',
      orchestrationGraphPath: '.ralph/orchestration/pipeline-20260509T010000Z-abcd/graph.json',
      taskGraphSource: 'approved-plan'
    },
    orchestration: makeOrchestrationState({
      activeNodeId: 'node-exec-1',
      activeNodeLabel: 'Execute T101',
      completedNodes: [{ nodeId: 'node-plan', label: 'Plan work', outcome: 'completed', finishedAt: '2026-05-09T01:02:00.000Z' }],
      pendingBranchNodes: [{ nodeId: 'node-review', label: 'Review output' }]
    }),
    replanArtifacts: [makeReplanArtifact(1)],
    fanInRecord: makeFanInRecord('failed'),
    nodeSpans: [makeNodeSpan('node-exec-1', {
      agentId: 'impl-1',
      agentRole: 'implementer',
      outputRefs: ['out-a', 'out-b'],
      stopClassification: 'partial_progress'
    })]
  });

  const result = buildDashboardSnapshot(snapshot);
  assert.ok(result.pipeline, 'pipeline section should be populated by buildDashboardSnapshot');

  assert.equal(result.pipeline.latestRun?.runId, 'pipeline-20260509T010000Z-abcd');
  assert.equal(result.pipeline.latestRun?.phase, 'loop');
  assert.equal(result.pipeline.latestRun?.taskGraphSource, 'approved-plan');
  assert.equal(result.pipeline.orchestration?.activeNodeLabel, 'Execute T101');
  assert.equal(result.pipeline.orchestration?.completedNodes[0]?.label, 'Plan work');
  assert.equal(result.pipeline.replan[0]?.chosenMutation, '2 waves written');
  assert.equal(result.pipeline.fanIn?.result, 'failed');
  assert.deepEqual(result.pipeline.fanIn?.errors, ['Merge conflict in src/util.ts']);
  assert.equal(result.pipeline.nodeSpans[0]?.agentId, 'impl-1');
  assert.equal(result.pipeline.nodeSpans[0]?.outputCount, 2);
});

// ---------------------------------------------------------------------------
// Orchestration panel
// ---------------------------------------------------------------------------

function makeOrchestrationState(overrides: Partial<RalphStatusSnapshot['orchestration']> = {}): NonNullable<RalphStatusSnapshot['orchestration']> {
  return {
    activeNodeId: 'node-exec-1',
    activeNodeLabel: 'Execute Task T1',
    completedNodes: [],
    pendingBranchNodes: [],
    ...overrides,
  };
}

function makeReplanArtifact(replanIndex: number): ReplanDecisionArtifact {
  return {
    schemaVersion: 1,
    kind: 'replanDecision',
    parentTaskId: 'T1',
    replanIndex,
    triggerEvidenceClass: ['consecutive_verifier_mismatches'],
    triggerDetails: `Replan ${replanIndex} triggered by verifier failures`,
    rejectedAlternatives: [],
    chosenMutation: '2 waves written',
    taskGraphDiff: { addedTaskIds: ['T10', 'T11'], removedTaskIds: ['T9'], modifiedTaskIds: [] },
    createdAt: `2026-01-0${replanIndex}T00:00:00.000Z`,
  };
}

function makeFanInRecord(result: FanInRecord['fanInResult']): FanInRecord {
  return {
    waveIndex: 0,
    memberOutcomes: { T2: 'done', T3: 'done' },
    fanInResult: result,
    fanInErrors: result === 'failed' ? ['Merge conflict in src/util.ts'] : [],
    evaluatedAt: '2026-01-01T10:00:00.000Z',
  };
}

function makeNodeSpan(nodeId: string, overrides: Partial<OrchestrationNodeSpan> = {}): OrchestrationNodeSpan {
  return {
    nodeId,
    runId: 'run-001',
    startedAt: '2026-01-01T09:00:00.000Z',
    finishedAt: '2026-01-01T09:30:00.000Z',
    inputRefs: [],
    outputRefs: [],
    agentRole: 'implementer',
    stopClassification: 'completed',
    ...overrides,
  };
}


// ---------------------------------------------------------------------------
// Doctrine observability
// ---------------------------------------------------------------------------

test('buildDashboardSnapshot: doctrine missing state exposes initialize and open commands', () => {
  const result = buildDashboardSnapshot(minimalSnapshot({
    doctrineInspection: {
      doctrineDir: '/repo/.ralph/doctrine',
      health: 'missing',
      protectedFiles: ['invariants.md', 'boundaries.md', 'agents.md'],
      diagnostics: [{
        severity: 'warning',
        code: 'doctrine_directory_missing',
        message: 'Doctrine health: missing.',
      }]
    }
  }));

  assert.equal(result.doctrine?.health, 'missing');
  assert.equal(result.doctrine?.diagnostics.missingFiles.length, 1);
  assert.equal(result.doctrine?.actionTargets.initializeOrRepairCommand, 'ralphCodex.initializeDoctrinePack');
  assert.equal(result.doctrine?.actionTargets.openFolderCommand, 'ralphCodex.openDoctrineFolder');
});

test('buildDashboardSnapshot: doctrine incomplete diagnostics are categorized', () => {
  const result = buildDashboardSnapshot(minimalSnapshot({
    doctrineInspection: {
      doctrineDir: '/repo/.ralph/doctrine',
      health: 'incomplete',
      protectedFiles: ['invariants.md', 'boundaries.md', 'agents.md'],
      diagnostics: [
        { severity: 'warning', code: 'doctrine_required_file_missing', file: '.ralph/doctrine/risks.md', message: 'Missing file.' },
        { severity: 'warning', code: 'doctrine_required_heading_missing', file: '.ralph/doctrine/agents.md', message: 'Missing heading.' }
      ]
    }
  }));

  assert.equal(result.doctrine?.health, 'incomplete');
  assert.equal(result.doctrine?.diagnostics.missingFiles.length, 1);
  assert.equal(result.doctrine?.diagnostics.missingHeadings.length, 1);
});

test('buildDashboardSnapshot: healthy doctrine renders protected files and budget usage', () => {
  const result = buildDashboardSnapshot(minimalSnapshot({
    doctrineInspection: {
      doctrineDir: '/repo/.ralph/doctrine',
      health: 'healthy',
      protectedFiles: ['invariants.md', 'boundaries.md', 'agents.md'],
      diagnostics: []
    },
    doctrineContext: { entries: [], totalChars: 4000, budgetChars: 8000, budgetExceeded: false }
  }));

  assert.equal(result.doctrine?.health, 'healthy');
  assert.deepEqual(result.doctrine?.protectedFiles, ['invariants.md', 'boundaries.md', 'agents.md']);
  assert.equal(result.doctrine?.contextBudget.usedChars, 4000);
  assert.equal(result.doctrine?.contextBudget.budgetChars, 8000);
  assert.equal(result.doctrine?.contextBudget.usagePercent, 50);
});

test('buildDashboardSnapshot: invalid evidence index and truncation state are visible', () => {
  const result = buildDashboardSnapshot(minimalSnapshot({
    doctrineInspection: {
      doctrineDir: '/repo/.ralph/doctrine',
      health: 'invalid evidence index',
      protectedFiles: ['invariants.md', 'boundaries.md', 'agents.md'],
      diagnostics: [{ severity: 'warning', code: 'doctrine_evidence_index_invalid', file: '.ralph/doctrine/evidence-index.json', message: 'Invalid JSON.' }]
    },
    doctrineContext: {
      entries: [{ fileName: 'agents.md', relativePath: '.ralph/doctrine/agents.md', content: 'x', isProtected: true, truncated: true }],
      totalChars: 8000,
      budgetChars: 8000,
      budgetExceeded: true
    }
  }));

  assert.equal(result.doctrine?.health, 'invalid_evidence_index');
  assert.equal(result.doctrine?.contextTruncated, true);
  assert.equal(result.doctrine?.diagnostics.invalidEvidenceIndex.length, 1);
});


test('buildDashboardSnapshot: healthy doctrine info diagnostic is not bucketed as other diagnostics', () => {
  const result = buildDashboardSnapshot(minimalSnapshot({
    doctrineInspection: {
      doctrineDir: '/repo/.ralph/doctrine',
      health: 'healthy',
      protectedFiles: ['invariants.md', 'boundaries.md', 'agents.md'],
      diagnostics: [{ severity: 'info', code: 'doctrine_pack_healthy', message: 'Doctrine health: healthy.' }]
    }
  }));

  assert.equal(result.doctrine?.health, 'healthy');
  assert.equal(result.doctrine?.diagnostics.other.length, 0);
  assert.equal(result.doctrine?.diagnostics.missingFiles.length, 0);
  assert.equal(result.doctrine?.diagnostics.missingHeadings.length, 0);
  assert.equal(result.doctrine?.diagnostics.invalidEvidenceIndex.length, 0);
});

test('buildDashboardSnapshot: unknown warning doctrine diagnostics remain visible as other diagnostics', () => {
  const result = buildDashboardSnapshot(minimalSnapshot({
    doctrineInspection: {
      doctrineDir: '/repo/.ralph/doctrine',
      health: 'healthy',
      protectedFiles: ['invariants.md', 'boundaries.md', 'agents.md'],
      diagnostics: [{ severity: 'warning', code: 'doctrine_custom_warning', message: 'Doctrine warning.' }]
    }
  }));

  assert.equal(result.doctrine?.diagnostics.other.length, 1);
  assert.equal(result.doctrine?.diagnostics.other[0]?.code, 'doctrine_custom_warning');
});

test('buildDashboardSnapshot: pending doctrine proposal counts render from fixture data', () => {
  const result = buildDashboardSnapshot(minimalSnapshot({
    pendingDoctrineProposalCountsByRisk: { low: 2, medium: 1, high: 3 },
    latestDoctrineProposalPath: '/repo/.ralph/artifacts/latest-doctrine-proposal.json',
    latestDoctrineProposalMdPath: '/repo/.ralph/artifacts/latest-doctrine-proposal.md'
  }));

  assert.deepEqual(result.doctrine?.pendingProposalCountsByRisk, { low: 2, medium: 1, high: 3, total: 6 });
  assert.equal(result.doctrine?.actionTargets.reviewProposalsCommand, 'ralphCodex.openLatestDoctrineProposal');
});

test('buildDashboardSnapshot: doctrine proposal review data is stable and bounded', () => {
  const result = buildDashboardSnapshot(minimalSnapshot({
    pendingDoctrineProposalCountsByRisk: { low: 1, medium: 1, high: 0 },
    pendingDoctrineProposals: [
      {
        path: '/repo/.ralph/artifacts/doctrine-proposals/prop-b.json',
        proposal: {
          schemaVersion: 1,
          kind: 'doctrineUpdateProposal',
          proposalId: 'prop-b',
          createdAt: '2026-05-01T00:00:00.000Z',
          provenanceId: 'prov-b',
          iteration: 2,
          selectedTaskId: 'T2',
          selectedTaskTitle: 'Task two',
          source: 'completionReport',
          status: 'proposed',
          risk: 'medium',
          summary: 'Replace protected section.',
          warnings: [],
          updates: [{
            targetFile: '.ralph/doctrine/invariants.md',
            operation: 'replaceSection',
            section: 'Core Invariants',
            proposedText: 'x'.repeat(2100),
            rationale: 'Protected invariant update.',
            evidence: ['src/a.ts'],
            requiresApproval: true,
            protectedTarget: true,
            risk: 'high'
          }]
        }
      },
      {
        path: '/repo/.ralph/artifacts/doctrine-proposals/prop-a.json',
        proposal: {
          schemaVersion: 1,
          kind: 'doctrineUpdateProposal',
          proposalId: 'prop-a',
          createdAt: '2026-05-02T00:00:00.000Z',
          provenanceId: 'prov-a',
          iteration: 1,
          selectedTaskId: 'T1',
          selectedTaskTitle: 'Task one',
          source: 'manual',
          status: 'proposed',
          risk: 'low',
          summary: 'Append workflow note.',
          warnings: [],
          updates: [{
            targetFile: '.ralph/doctrine/workflows.md',
            operation: 'append',
            section: null,
            proposedText: '- Run npm run validate.',
            rationale: 'Observed validation command.',
            evidence: ['package.json'],
            requiresApproval: false,
            protectedTarget: false,
            risk: 'low'
          }]
        }
      }
    ]
  }));

  assert.deepEqual(
    result.doctrine?.proposalReview.proposals.map((proposal) => proposal.proposalId),
    ['prop-a', 'prop-b'],
    'proposal list should sort deterministically by proposal id'
  );
  assert.equal(result.doctrine?.proposalReview.hasPendingProposals, true);
  assert.equal(result.doctrine?.proposalReview.proposals[0]?.targetFile, '.ralph/doctrine/workflows.md');
  assert.equal(result.doctrine?.proposalReview.proposals[1]?.protectedTarget, true);
  assert.equal(result.doctrine?.proposalReview.proposals[1]?.requiresApproval, true);
  const protectedDetail = result.doctrine?.proposalReview.details.find((detail) => detail.proposalId === 'prop-b');
  assert.ok(protectedDetail);
  assert.equal(protectedDetail.updates[0]?.proposedText.truncated, true);
  assert.equal(protectedDetail.updates[0]?.proposedText.fullLength, 2100);
  assert.ok(protectedDetail.updates[0]?.proposedText.text.length < 2100);
});

test('buildDashboardSnapshot: doctrine proposal review no-proposals state is explicit', () => {
  const result = buildDashboardSnapshot(minimalSnapshot({
    pendingDoctrineProposalCountsByRisk: { low: 0, medium: 0, high: 0 },
    pendingDoctrineProposals: []
  }));

  assert.equal(result.doctrine?.proposalReview.hasPendingProposals, false);
  assert.deepEqual(result.doctrine?.proposalReview.proposals, []);
  assert.deepEqual(result.doctrine?.proposalReview.details, []);
});
