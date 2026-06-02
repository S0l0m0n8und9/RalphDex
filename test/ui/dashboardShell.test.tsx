import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { DashboardShell, reconcileDashboardTabIntent, resolveInitialDashboardTab } from '../../src/webview-ui/components/DashboardShell';
import type { RalphDashboardState, RalphWebviewMessage } from '../../src/ui/uiTypes';
import type { WebviewUiModel } from '../../src/webview-ui/viewModel';
import type { DashboardDoctrineSection, DashboardPrdReconciliationSection } from '../../src/webview/dashboardSnapshot';

function makeModel(): WebviewUiModel {
  return {
    readiness: { kind: 'ready', title: 'Ready', detail: 'Ready.' },
    primaryCommands: [],
    secondaryCommands: [],
    exposedCommandIds: new Set(),
    taskTotal: 0,
    doneCount: 0,
    currentTask: null
  };
}

function makeDoctrine(overrides: Partial<DashboardDoctrineSection> = {}): DashboardDoctrineSection {
  return {
    health: 'healthy',
    protectedFiles: ['invariants.md', 'boundaries.md', 'agents.md'],
    contextBudget: { usedChars: 120, budgetChars: 2000, usagePercent: 6 },
    contextTruncated: false,
    diagnostics: {
      missingFiles: [],
      missingHeadings: [],
      invalidEvidenceIndex: [],
      other: []
    },
    pendingProposalCountsByRisk: { low: 0, medium: 0, high: 0, total: 0 },
    actionTargets: {
      initializeOrRepairCommand: 'ralphCodex.initializeDoctrinePack',
      openFolderCommand: 'ralphCodex.openDoctrineFolder',
      openFileCommands: {
        'invariants.md': 'ralphCodex.openDoctrineInvariants',
        'boundaries.md': 'ralphCodex.openDoctrineBoundaries',
        'agents.md': 'ralphCodex.openDoctrineAgents'
      },
      reviewProposalsCommand: 'ralphCodex.openLatestDoctrineProposal',
      doctrineFolderPath: '.ralph/doctrine',
      latestProposalPath: '.ralph/artifacts/latest-doctrine-proposal.json',
      latestProposalMarkdownPath: '.ralph/artifacts/latest-doctrine-proposal.md'
    },
    proposalReview: {
      hasPendingProposals: false,
      proposals: [],
      details: []
    },
    ...overrides
  };
}

function makePrdReconciliation(overrides: Partial<DashboardPrdReconciliationSection> = {}): DashboardPrdReconciliationSection {
  return {
    status: 'clean',
    availability: 'available',
    findingCount: 0,
    severityCounts: { info: 0, warning: 0 },
    findings: [],
    proposalJsonPath: '.ralph/artifacts/prd-reconciliation.json',
    proposalMarkdownPath: '.ralph/artifacts/prd-reconciliation.md',
    generatedAt: '2026-06-02T00:00:00.000Z',
    message: 'No drift detected between PRD and backlog.',
    ...overrides
  };
}

function makeState(overrides: Partial<RalphDashboardState> = {}): RalphDashboardState {
  return {
    workspaceName: 'test-ws',
    loopState: 'idle',
    agentRole: 'implementer',
    nextIteration: 1,
    loopIteration: 1,
    iterationCap: 5,
    taskCounts: null,
    tasks: [],
    recentIterations: [],
    preflightReady: true,
    preflightSummary: 'ready',
    diagnostics: [],
    agentLanes: [],
    settingsSurface: null,
    dashboardSnapshot: {
      workspaceName: 'test-ws',
      taskBoard: { counts: null, deadLetterCount: 0, selectedTaskId: null, selectedTaskTitle: null, nextIteration: 1 },
      agentGrid: { rows: [] },
      diagnosis: null,
      failureFeed: { entries: [] },
      deadLetter: { entries: [] },
      quickActions: { hasDeadLetterEntries: false, hasBlockedTasks: false, canAttemptLoop: false },
      cost: { hasAnyCostData: false, executionCostUsd: null, diagnosticCostUsd: null, promptCacheStats: null },
      doctrine: makeDoctrine(),
      prdReconciliation: makePrdReconciliation()
    },
    snapshotStatus: { phase: 'idle', errorMessage: null },
    taskSeeding: { phase: 'idle', requestText: '', createdTaskCount: null, message: null, artifactPath: null },
    viewIntent: null,
    prdExists: true,
    ...overrides
  };
}

function renderDashboard(state: RalphDashboardState, lastDoctrineActionResult: Extract<RalphWebviewMessage, { type: 'doctrine-proposal-action-result' }> | null = null): string {
  return renderToStaticMarkup(
    <DashboardShell
      state={state}
      model={makeModel()}
      onCommand={() => {}}
      onSettingUpdate={() => {}}
      onOpenArtifact={() => {}}
      onSeedTasks={() => {}}
      onDoctrineAction={() => {}}
      lastDoctrineActionResult={lastDoctrineActionResult}
    />
  );
}

test('Overview renders compact doctrine status and not full doctrine proposal review panel by default', () => {
  const html = renderDashboard(makeState());
  assert.ok(html.includes('data-testid="doctrine-overview-status"'));
  assert.ok(!html.includes('data-testid="doctrine-proposal-review"'));
});

test('Overview compact doctrine status escalates when doctrine needs attention', () => {
  const state = makeState({
    dashboardSnapshot: {
      ...makeState().dashboardSnapshot!,
      doctrine: makeDoctrine({
        contextTruncated: true,
        pendingProposalCountsByRisk: { low: 0, medium: 0, high: 1, total: 1 }
      })
    }
  });
  const html = renderDashboard(state);
  assert.ok(html.includes('Attention required. Full proposal details are in Doctrine.'));
  assert.ok(html.includes('highest risk: high'));
});

test('Overview renders clean PRD/backlog reconciliation as non-warning operator status', () => {
  const html = renderDashboard(makeState());

  assert.ok(html.includes('data-testid="prd-reconciliation-card"'));
  assert.ok(html.includes('No drift detected between PRD and backlog.'));
  assert.ok(html.includes('findings: 0'));
});

test('Overview renders PRD/backlog reconciliation findings with severity, type, and summary', () => {
  const state = makeState({
    dashboardSnapshot: {
      ...makeState().dashboardSnapshot!,
      prdReconciliation: makePrdReconciliation({
        status: 'findings',
        findingCount: 2,
        severityCounts: { info: 1, warning: 1 },
        message: '2 reconciliation findings require review.',
        findings: [
          {
            type: 'stale_prd_task_reference',
            severity: 'warning',
            summary: 'PRD references task T404, which is absent from the backlog.',
            taskIds: ['T404']
          },
          {
            type: 'orphan_active_task',
            severity: 'info',
            summary: 'Active task T12 is not traceable to any PRD scope.',
            taskIds: ['T12']
          }
        ]
      })
    }
  });
  const html = renderDashboard(state);

  assert.ok(html.includes('2 reconciliation findings require review.'));
  assert.ok(html.includes('warning'));
  assert.ok(html.includes('stale_prd_task_reference'));
  assert.ok(html.includes('PRD references task T404, which is absent from the backlog.'));
  assert.ok(html.includes('orphan_active_task'));
  assert.ok(html.includes('Open Proposal'));
});

test('Overview renders missing, stale, and unreadable PRD/backlog reconciliation as actionable unavailable states', () => {
  const missing = renderDashboard(makeState({
    dashboardSnapshot: {
      ...makeState().dashboardSnapshot!,
      prdReconciliation: makePrdReconciliation({
        status: 'unavailable',
        availability: 'missing',
        proposalJsonPath: null,
        proposalMarkdownPath: null,
        generatedAt: null,
        message: 'PRD file is missing; create .ralph/prd.md or regenerate the PRD.'
      })
    }
  }));
  assert.ok(missing.includes('proposal unavailable: missing'));
  assert.ok(missing.includes('create .ralph/prd.md'));

  const stale = renderDashboard(makeState({
    dashboardSnapshot: {
      ...makeState().dashboardSnapshot!,
      prdReconciliation: makePrdReconciliation({
        status: 'unavailable',
        availability: 'stale',
        message: 'Latest reconciliation proposal is stale; refresh the dashboard or run Show Status.'
      })
    }
  }));
  assert.ok(stale.includes('proposal unavailable: stale'));
  assert.ok(stale.includes('refresh the dashboard'));

  const unreadable = renderDashboard(makeState({
    dashboardSnapshot: {
      ...makeState().dashboardSnapshot!,
      prdReconciliation: makePrdReconciliation({
        status: 'unavailable',
        availability: 'unreadable',
        message: 'Unable to write PRD/backlog reconciliation proposal: disk full'
      })
    }
  }));
  assert.ok(unreadable.includes('proposal unavailable: unreadable'));
  assert.ok(unreadable.includes('Unable to write PRD/backlog reconciliation proposal'));
  assert.ok(!unreadable.includes('Open Proposal'));
});

test('Doctrine tab renders full doctrine card and doctrine proposal review panel', () => {
  const state = makeState({
    viewIntent: { activeTab: 'doctrine' },
    dashboardSnapshot: {
      ...makeState().dashboardSnapshot!,
      doctrine: makeDoctrine({
        pendingProposalCountsByRisk: { low: 0, medium: 1, high: 0, total: 1 },
        proposalReview: {
          hasPendingProposals: true,
          proposals: [{
            proposalId: 'dp-1',
            path: '.ralph/artifacts/dp-1.json',
            createdAt: '2026-05-14T00:00:00.000Z',
            source: 'provider',
            risk: 'medium',
            status: 'pending',
            targetFile: 'boundaries.md',
            operation: 'append',
            protectedTarget: true,
            requiresApproval: true,
            updateCount: 1
          }],
          details: [{
            proposalId: 'dp-1',
            path: '.ralph/artifacts/dp-1.json',
            createdAt: '2026-05-14T00:00:00.000Z',
            source: 'provider',
            risk: 'medium',
            status: 'pending',
            summary: 'summary',
            warnings: [],
            updates: [{
              updateIndex: 0,
              targetFile: 'boundaries.md',
              operation: 'append',
              section: 'rules',
              protectedTarget: true,
              requiresApproval: true,
              risk: 'medium',
              proposedText: { text: 'text', truncated: false, fullLength: 4 },
              rationale: { text: 'because', truncated: false, fullLength: 7 },
              evidence: ['trace']
            }]
          }]
        }
      })
    }
  });
  const html = renderDashboard(state);
  assert.ok(html.includes('data-testid="doctrine-card"'));
  assert.ok(html.includes('data-testid="doctrine-proposal-review"'));
});

test('initial dashboard tab prefers explicit view intent over persisted tab', () => {
  assert.equal(resolveInitialDashboardTab({ activeTab: 'settings' }, () => 'tasks'), 'settings');
});

test('initial dashboard tab falls back to persisted tab when no explicit view intent exists', () => {
  assert.equal(resolveInitialDashboardTab(null, () => 'settings'), 'settings');
});

test('dashboard tab reconciliation ignores unchanged stale host intent after a local tab change', () => {
  const update = reconcileDashboardTabIntent('tasks', { activeTab: 'settings' }, 'settings');

  assert.equal(update.nextTab, 'tasks');
  assert.equal(update.appliedIntent, 'settings');
  assert.equal(update.shouldPersist, false);
});

test('dashboard tab reconciliation applies a newly observed host intent', () => {
  const update = reconcileDashboardTabIntent('overview', { activeTab: 'settings' }, null);

  assert.equal(update.nextTab, 'settings');
  assert.equal(update.appliedIntent, 'settings');
  assert.equal(update.shouldPersist, true);
});

test('Diagnostics omits doctrine surfaces when doctrine is healthy with no proposals and no action errors', () => {
  const html = renderDashboard(makeState({ viewIntent: { activeTab: 'diagnostics' } }));
  assert.ok(!html.includes('data-testid="doctrine-overview-status"'));
  assert.ok(!html.includes('data-testid="doctrine-card"'));
  assert.ok(!html.includes('data-testid="doctrine-proposal-review"'));
});

test('Diagnostics shows doctrine attention content when doctrine is unhealthy or proposal action fails', () => {
  const unhealthy = renderDashboard(makeState({
    viewIntent: { activeTab: 'diagnostics' },
    dashboardSnapshot: {
      ...makeState().dashboardSnapshot!,
      doctrine: makeDoctrine({ health: 'missing' })
    }
  }));
  assert.ok(unhealthy.includes('data-testid="doctrine-overview-status"'));
  assert.ok(unhealthy.includes('data-testid="doctrine-card"'));

  const actionFailed = renderDashboard(
    makeState({ viewIntent: { activeTab: 'diagnostics' } }),
    { type: 'doctrine-proposal-action-result', status: 'error', proposalId: 'dp-1', action: 'apply', message: 'failed' }
  );
  assert.ok(actionFailed.includes('data-testid="doctrine-overview-status"'));
});
