import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDashboardHtml } from '../../src/ui/sidebarHtml';
import type { RalphDashboardState } from '../../src/ui/uiTypes';
import type { DashboardSnapshot } from '../../src/webview/dashboardSnapshot';

function defaultState(overrides: Partial<RalphDashboardState> = {}): RalphDashboardState {
  return {
    workspaceName: 'test-ws',
    loopState: 'idle',
    agentRole: 'build',
    nextIteration: 1,
    iterationCap: 5,
    taskCounts: null,
    tasks: [],
    recentIterations: [],
    preflightReady: true,
    preflightSummary: 'ok',
    diagnostics: [],
    agentLanes: [],
    settingsSurface: null,
    dashboardSnapshot: null,
    snapshotStatus: { phase: 'idle', errorMessage: null },
    taskSeeding: { phase: 'idle', requestText: '', createdTaskCount: null, message: null, artifactPath: null },
    viewIntent: null,
    prdExists: false,
    ...overrides
  };
}

function populatedDashboardSnapshot(): DashboardSnapshot {
  return {
    workspaceName: 'test-ws',
    taskBoard: {
      counts: { todo: 2, in_progress: 1, blocked: 1, done: 4 },
      deadLetterCount: 1,
      selectedTaskId: 'T110',
      selectedTaskTitle: 'Surface dashboard sections',
      nextIteration: 9
    },
    agentGrid: {
      rows: [{
        agentId: 'agent-alpha',
        firstSeenAt: '2026-01-01T00:00:00.000Z',
        completedTaskCount: 4,
        activeClaimTaskId: 'T110',
        stuckScore: 3,
        isStuck: true,
        latestHandoffClassification: 'no_progress',
        latestHandoffIteration: 8,
        noProgressHeatmap: '[..XXX]'
      }]
    },
    failureFeed: {
      entries: [{
        taskId: 'T110',
        taskTitle: 'Surface dashboard sections',
        category: 'validation_mismatch',
        confidence: 'high',
        summary: 'Verifier contract mismatch.',
        suggestedAction: 'Align emitted dashboard payload.',
        recoveryAttemptCount: 2,
        remediationSummary: 'Validation mismatch - adjusted prompt',
        humanReviewRecommended: true
      }]
    },
    diagnosis: {
      taskId: 'T110',
      taskTitle: 'Surface dashboard sections',
      category: 'validation_mismatch',
      confidence: 'high',
      summary: 'Verifier contract mismatch.',
      suggestedAction: 'Align emitted dashboard payload.',
      retryPromptAddendum: 'Re-run with the durable dashboard snapshot shape locked.',
      recoveryAttemptCount: 2,
      remediationSummary: 'Validation mismatch - adjusted prompt',
      failureAnalysisPath: '.ralph/artifacts/T110/failure-analysis.json',
      recoveryStatePath: '.ralph/artifacts/T110/recovery-state.json'
    },
    deadLetter: {
      entries: [{
        schemaVersion: 1,
        kind: 'deadLetterEntry',
        taskId: 'T99',
        taskTitle: 'Recover failed task',
        deadLetteredAt: '2026-01-01T00:00:00.000Z',
        diagnosticHistory: [],
        recoveryAttemptCount: 3
      }]
    },
    quickActions: {
      hasDeadLetterEntries: true,
      hasBlockedTasks: true,
      canAttemptLoop: true
    },
    cost: {
      executionCostUsd: 0.0142,
      diagnosticCostUsd: null,
      promptCacheStats: { staticPrefixBytes: 8192, cacheHit: true },
      hasAnyCostData: true
    }
  };
}

// ---------------------------------------------------------------------------
// Basic structure
// ---------------------------------------------------------------------------

test('buildDashboardHtml returns valid HTML with nonce-gated script and style', () => {
  const html = buildDashboardHtml(defaultState(), 'abc123');
  assert.ok(html.includes('nonce-abc123'));
  assert.ok(html.includes('<style nonce="abc123">'));
  assert.ok(html.includes('<script nonce="abc123">'));
  assert.ok(html.includes('<!DOCTYPE html>'));
});

test('buildDashboardHtml renders header with workspace name and state', () => {
  const html = buildDashboardHtml(defaultState({ workspaceName: 'my-project' }), 'n8');
  assert.ok(html.includes('my-project'));
  assert.ok(html.includes('Ralphdex'));
  assert.ok(html.includes('idle'));
});

test('buildDashboardHtml shows progress bar with block characters', () => {
  const html = buildDashboardHtml(defaultState({
    taskCounts: { todo: 1, in_progress: 1, blocked: 0, done: 2 }
  }), 'n3');

  assert.ok(html.includes('█'));
  assert.ok(html.includes('2/4 done'));
  assert.ok(html.includes('50%'));
});

test('buildDashboardHtml shows phase indicator when running', () => {
  const html = buildDashboardHtml(defaultState({
    loopState: 'running',
    agentLanes: [{ agentId: 'default', phase: 'execute', iteration: 3 }]
  }), 'n4');

  assert.ok(html.includes('phase-indicator'));
  assert.ok(html.includes('iter 3'));
  assert.ok(html.includes('execute'));
});

test('buildDashboardHtml includes command-ack message handler', () => {
  const html = buildDashboardHtml(defaultState(), 'n9');
  assert.ok(html.includes('command-ack'));
  assert.ok(html.includes('resetButton'));
});

// ---------------------------------------------------------------------------
// Primary action: Run Loop / Stop Loop
// ---------------------------------------------------------------------------

test('buildDashboardHtml shows Run Loop when idle', () => {
  const html = buildDashboardHtml(defaultState({ loopState: 'idle' }), 'idle');
  assert.ok(html.includes('ralphCodex.runRalphLoop'), 'Run Loop command present');
  assert.ok(html.includes('Run Loop'), 'Run Loop label');
  assert.ok(!html.includes('ralphCodex.stopLoop'), 'Stop Loop absent when idle');
});

test('buildDashboardHtml shows Stop Loop when running', () => {
  const html = buildDashboardHtml(defaultState({ loopState: 'running' }), 'running');
  assert.ok(html.includes('ralphCodex.stopLoop'), 'Stop Loop command present');
  assert.ok(html.includes('Stop Loop'), 'Stop Loop label');
});

test('buildDashboardHtml includes Open Dashboard button', () => {
  const html = buildDashboardHtml(defaultState(), 'n7');
  assert.ok(html.includes('ralphCodex.openDashboard'));
  assert.ok(html.includes('Open Dashboard'));
});

// ---------------------------------------------------------------------------
// Current task card
// ---------------------------------------------------------------------------

test('buildDashboardHtml renders current task card with task info', () => {
  const html = buildDashboardHtml(defaultState({
    tasks: [
      { id: 'T5', title: 'Implement caching', status: 'in_progress', isCurrent: true, priority: 'high', childIds: [], dependsOn: [] }
    ],
    taskCounts: { todo: 2, in_progress: 1, blocked: 0, done: 3 }
  }), 'task-card');

  assert.ok(html.includes('Current Task'), 'card kicker');
  assert.ok(html.includes('T5'), 'task ID');
  assert.ok(html.includes('Implement caching'), 'task title');
  assert.ok(html.includes('in progress'), 'task status');
  assert.ok(html.includes('3/6 done'), 'count line');
});

test('buildDashboardHtml current task card shows blocker when blocked', () => {
  const html = buildDashboardHtml(defaultState({
    tasks: [
      { id: 'T1', title: 'Blocked task', status: 'blocked', isCurrent: true, priority: 'medium', blocker: 'API key missing', childIds: [], dependsOn: [] }
    ]
  }), 'blocker-card');

  assert.ok(html.includes('blocked'), 'blocked class or status');
  assert.ok(html.includes('API key missing'), 'blocker text');
});

test('buildDashboardHtml current task card shows empty state when no task', () => {
  const html = buildDashboardHtml(defaultState(), 'empty-card');
  assert.ok(html.includes('No task selected'), 'empty message');
});

test('buildDashboardHtml current task card uses snapshot when no tasks array', () => {
  const html = buildDashboardHtml(defaultState({
    dashboardSnapshot: populatedDashboardSnapshot()
  }), 'snapshot-card');

  assert.ok(html.includes('T110'), 'selected task from snapshot');
  assert.ok(html.includes('Surface dashboard sections'), 'task title from snapshot');
});

// ---------------------------------------------------------------------------
// Alerts banner
// ---------------------------------------------------------------------------

test('alerts banner is prominent when blocked/dead-letter tasks exist', () => {
  const html = buildDashboardHtml(defaultState({
    taskCounts: { todo: 2, in_progress: 1, blocked: 3, done: 0 },
    dashboardSnapshot: populatedDashboardSnapshot()
  }), 'alerts');

  assert.ok(html.includes('alerts-banner'), 'alerts banner present');
  assert.ok(html.includes('3 blocked'), 'blocked count in banner');
  assert.ok(html.includes('1 dead-letter'), 'dead-letter count in banner');
  assert.ok(html.includes('needs attention'), 'attention message');
  assert.ok(html.includes('role="alert"'), 'alert role');
});

test('alerts banner absent when no blocked/dead-letter tasks', () => {
  const html = buildDashboardHtml(defaultState({
    taskCounts: { todo: 2, in_progress: 1, blocked: 0, done: 3 }
  }), 'no-alerts');

  assert.ok(!html.includes('class="alerts-banner'), 'no alerts banner element');
  assert.ok(!html.includes('needs attention'), 'no attention message');
});

// ---------------------------------------------------------------------------
// Sidebar does NOT contain complex dashboard features
// ---------------------------------------------------------------------------

test('sidebar does not contain mode switcher, tabs, or task list', () => {
  const html = buildDashboardHtml(defaultState({
    tasks: [
      { id: 'T1', title: 'Test', status: 'todo', isCurrent: false, priority: 'medium', childIds: [], dependsOn: [] }
    ]
  }), 'no-complex');

  assert.ok(!html.includes('mode-switcher'), 'no mode switcher');
  assert.ok(!html.includes('data-sidebar-tab'), 'no sidebar tabs');
  assert.ok(!html.includes('sidebar-tab-panel'), 'no tab panels');
  assert.ok(!html.includes('sb-task-row'), 'no task rows');
  assert.ok(!html.includes('filter-tabs'), 'no filter tabs');
  assert.ok(!html.includes('data-task-search'), 'no search input');
  assert.ok(!html.includes('overview-counts'), 'no overview count chips');
});

test('sidebar does not contain dead-letter section', () => {
  const html = buildDashboardHtml(defaultState({
    dashboardSnapshot: populatedDashboardSnapshot()
  }), 'no-dl');

  assert.ok(!html.includes('Dead-Letter ('), 'no dead-letter section label');
  assert.ok(!html.includes('dl-entry'), 'no dead-letter entries');
  assert.ok(!html.includes('dl-positive-empty'), 'no dead-letter positive empty');
});

test('sidebar does not contain seed form', () => {
  const html = buildDashboardHtml(defaultState(), 'no-seed');

  assert.ok(!html.includes('data-seed-request'), 'no seed textarea');
  assert.ok(!html.includes('data-seed-submit'), 'no seed submit button');
  assert.ok(!html.includes('seed-block'), 'no seed block');
});

test('sidebar does not contain recent outputs or iteration rows', () => {
  const html = buildDashboardHtml(defaultState({
    recentIterations: [
      { iteration: 3, taskId: 'T1', taskTitle: 'Test', classification: 'complete', stopReason: null, artifactDir: '/tmp/a' }
    ]
  }), 'no-recent');

  assert.ok(!html.includes('Recent Outputs'), 'no recent outputs section');
  assert.ok(!html.includes('class="iter-row"'), 'no iteration row elements');
});

test('sidebar does not contain Prepare Prompt or pipeline references', () => {
  const html = buildDashboardHtml(defaultState(), 'no-pipeline');

  assert.ok(!html.includes('Prepare Prompt'), 'no Prepare Prompt');
  assert.ok(!html.includes('generatePrompt'), 'no generatePrompt command');
  assert.ok(!html.includes('Latest Run'), 'no Latest Run label');
  assert.ok(!html.includes('openLatestPipelineRun'), 'no pipeline run command');
});

// ---------------------------------------------------------------------------
// Style and accessibility
// ---------------------------------------------------------------------------

test('reduced-motion CSS exists in sidebar styles', () => {
  const html = buildDashboardHtml(defaultState(), 'reduced-motion');

  assert.ok(html.includes('prefers-reduced-motion: reduce'), 'media query present');
  assert.ok(html.includes('.state-dot.running { animation: none'), 'running dot animation disabled');
});

test('no external @import or CDN font URLs in sidebar output', () => {
  const html = buildDashboardHtml(defaultState(), 'no-cdn');

  assert.ok(!html.includes('@import url'), 'no @import url');
  assert.ok(!html.includes('cdn.jsdelivr.net'), 'no jsdelivr CDN');
  assert.ok(!html.includes('fonts.googleapis.com'), 'no Google Fonts CDN');
});
