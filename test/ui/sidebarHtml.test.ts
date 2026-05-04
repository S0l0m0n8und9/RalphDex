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
    prdExists: true,
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

test('buildDashboardHtml returns valid HTML with nonce-gated script and style', () => {
  const html = buildDashboardHtml(defaultState(), 'abc123');
  assert.ok(html.includes('nonce-abc123'));
  assert.ok(html.includes('<style nonce="abc123">'));
  assert.ok(html.includes('<script nonce="abc123">'));
  assert.ok(html.includes('<!DOCTYPE html>'));
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

test('buildDashboardHtml keeps compact sidebar buttons enabled during running state', () => {
  const html = buildDashboardHtml(defaultState({ loopState: 'running' }), 'n5');
  const disabledButtons = (html.match(/<button[^>]*disabled[^>]*>/g) ?? []).length;
  assert.equal(disabledButtons, 0, `Expected 0 disabled buttons, got ${disabledButtons}`);
});

test('buildDashboardHtml keeps sidebar focused on compact run and dashboard navigation when ready', () => {
  const html = buildDashboardHtml(defaultState(), 'sidebar-actions');

  assert.ok(html.includes('data-command="ralphCodex.runRalphLoop"'));
  assert.ok(html.includes('data-command="ralphCodex.openDashboard"'));
  assert.ok(html.includes('Run Loop'));
  assert.ok(html.includes('Open Dashboard'));

  assert.ok(!html.includes('ralphCodex.runMultiAgentLoop'));
  assert.ok(!html.includes('ralphCodex.runRalphIteration'));
  assert.ok(!html.includes('ralphCodex.runReviewAgent'));
  assert.ok(!html.includes('ralphCodex.runWatchdogAgent'));
  assert.ok(!html.includes('ralphCodex.runScmAgent'));
  assert.ok(!html.includes('ralphCodex.generatePrompt'));
  assert.ok(!html.includes('ralphCodex.showTasks'));
  assert.ok(!html.includes('ralphCodex.openLatestPipelineRun'));
  assert.ok(!html.includes('ralphCodex.openSettings'));
});

test('buildDashboardHtml routes no-PRD sidebar start to the PRD wizard instead of loop execution', () => {
  const html = buildDashboardHtml(defaultState({ prdExists: false }), 'no-prd-sidebar');

  assert.ok(html.includes('PRD required before running'));
  assert.ok(html.includes('Setup Required'));
  assert.ok(html.includes('Create a PRD before running RalphDex.'));
  assert.ok(html.includes('data-command="ralphCodex.openPrdWizard"'));
  assert.ok(html.includes('Open PRD Wizard'));
  assert.ok(!html.includes('data-command="ralphCodex.runRalphLoop"'));
});

test('buildDashboardHtml shows preflight readiness block without replacing PRD-ready run command', () => {
  const html = buildDashboardHtml(defaultState({
    prdExists: true,
    preflightReady: false,
    preflightSummary: 'Provider command not found.'
  }), 'preflight-sidebar');

  assert.ok(html.includes('Readiness blocked — Provider command not found.'));
  assert.ok(html.includes('data-command="ralphCodex.runRalphLoop"'));
});

test('buildDashboardHtml renders stop control when loop is running', () => {
  const html = buildDashboardHtml(defaultState({ loopState: 'running' }), 'running-actions');

  assert.ok(html.includes('data-command="ralphCodex.stopLoop"'));
  assert.ok(html.includes('Stop Loop'));
  assert.ok(!html.includes('data-command="ralphCodex.runRalphLoop"'));
});

test('buildDashboardHtml renders header with workspace name and state', () => {
  const html = buildDashboardHtml(defaultState({ workspaceName: 'my-project' }), 'n8');
  assert.ok(html.includes('my-project'));
  assert.ok(html.includes('Ralphdex'));
  assert.ok(html.includes('idle'));
});

test('buildDashboardHtml includes command-ack message handler', () => {
  const html = buildDashboardHtml(defaultState(), 'n9');
  assert.ok(html.includes('command-ack'));
  assert.ok(html.includes('resetButton'));
  assert.ok(html.includes('ackTimeouts.set(el, t)'));
});

test('buildDashboardHtml omits sidebar task-seeding hooks because seeding belongs in dashboard/tasks flow', () => {
  const html = buildDashboardHtml(defaultState(), 'seed-sidebar');

  assert.ok(!html.includes('Seed Tasks'));
  assert.ok(!html.includes('data-seed-request'));
  assert.ok(!html.includes("type: 'seed-tasks'"));
  assert.ok(!html.includes('data-seed-submit'));
});

test('buildDashboardHtml omits sidebar tab navigation and advanced orchestration controls', () => {
  const html = buildDashboardHtml(defaultState(), 'sidebar-tabs');

  assert.ok(!html.includes('data-sidebar-tab="run"'));
  assert.ok(!html.includes('data-sidebar-tab="agents"'));
  assert.ok(!html.includes('data-sidebar-tab="seed"'));
  assert.ok(!html.includes('data-sidebar-panel="orchestration"'));
  assert.ok(!html.includes('>Orchestration<'));
  assert.ok(!html.includes('Agent Roles'));
  assert.ok(!html.includes('Prepare &amp; Inspect'));
});

test('buildDashboardHtml surfaces live durable snapshot summary signals with recovery queue language', () => {
  const html = buildDashboardHtml(defaultState({
    dashboardSnapshot: populatedDashboardSnapshot()
  }), 'sidebar-snapshot');

  assert.ok(html.includes('Current Work'));
  assert.ok(html.includes('Selected T110'));
  assert.ok(html.includes('Surface dashboard sections'));
  assert.ok(html.includes('Blocked 1'));
  assert.ok(html.includes('Recovery Queue 1'));
  assert.ok(html.includes('validation_mismatch'));
  assert.ok(html.includes('Recovery: Recover failed task'));
  assert.ok(html.includes('agent-alpha'));
  assert.ok(!html.includes('Dead-Letter'));
  assert.ok(!html.includes('Dead-letter'));
});
