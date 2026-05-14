import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { DashboardShell } from '../../src/webview-ui/components/DashboardShell';
import type { RalphDashboardState, RalphWebviewMessage } from '../../src/ui/uiTypes';
import type { WebviewUiModel } from '../../src/webview-ui/viewModel';
import type { DashboardDoctrineSection } from '../../src/webview/dashboardSnapshot';

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
      doctrine: makeDoctrine()
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
