import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPanelDashboardHtml } from '../../src/ui/panelHtml';
import type { RalphDashboardState } from '../../src/ui/uiTypes';

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

function readyState(): RalphDashboardState {
  return defaultState({
    prdExists: true,
    preflightReady: true,
    preflightSummary: 'ok',
    taskCounts: { todo: 1, in_progress: 0, blocked: 0, done: 0 },
    tasks: [{
      id: 'T1',
      title: 'Implement readiness dashboard state',
      status: 'todo',
      isCurrent: true,
      priority: 'normal',
      childIds: [],
      dependsOn: []
    }]
  });
}

test('panel dashboard renders no-PRD readiness state instead of run controls', () => {
  const html = buildPanelDashboardHtml(defaultState({
    prdExists: false,
    taskCounts: null,
    tasks: [],
    preflightReady: true,
    preflightSummary: 'ok'
  }), 'panel-no-prd');

  assert.ok(html.includes('Setup Required'));
  assert.ok(html.includes('Create a PRD before running RalphDex.'));
  assert.ok(html.includes('data-command="ralphCodex.openPrdWizard"'));
  assert.ok(html.includes('Open PRD Wizard'));
  assert.ok(!html.includes('data-command="ralphCodex.runRalphLoop"'));
  assert.ok(!html.includes('data-command="ralphCodex.runPipeline"'));
});

test('panel dashboard renders PRD-ready but empty-backlog state with task seeding guidance', () => {
  const html = buildPanelDashboardHtml(defaultState({
    prdExists: true,
    taskCounts: { todo: 0, in_progress: 0, blocked: 0, done: 0 },
    tasks: [],
    preflightReady: true,
    preflightSummary: 'ok'
  }), 'panel-empty-backlog');

  assert.ok(html.includes('Backlog Required'));
  assert.ok(html.includes('PRD found, but no actionable tasks are available.'));
  assert.ok(html.includes('Seed Backlog from Feature') || html.includes('Generate tasks from PRD'));
  assert.ok(!html.includes('data-command="ralphCodex.runRalphLoop"'));
  assert.ok(!html.includes('data-command="ralphCodex.runPipeline"'));
});

test('panel dashboard renders provider/preflight blocked state with settings guidance', () => {
  const html = buildPanelDashboardHtml(defaultState({
    prdExists: true,
    taskCounts: { todo: 1, in_progress: 0, blocked: 0, done: 0 },
    tasks: [{
      id: 'T1',
      title: 'Fix provider setup',
      status: 'todo',
      isCurrent: true,
      priority: 'normal',
      childIds: [],
      dependsOn: []
    }],
    preflightReady: false,
    preflightSummary: 'Provider command not found.',
    diagnostics: [{ severity: 'error', message: 'Provider command not found.' }]
  }), 'panel-preflight-blocked');

  assert.ok(html.includes('Readiness Blocked'));
  assert.ok(html.includes('Provider command not found.'));
  assert.ok(html.includes('data-command="ralphCodex.openSettings"'));
  assert.ok(html.includes('Open Settings'));
  assert.ok(!html.includes('data-command="ralphCodex.runRalphLoop"'));
  assert.ok(!html.includes('data-command="ralphCodex.runPipeline"'));
});

test('panel dashboard preserves run controls for a ready workspace', () => {
  const html = buildPanelDashboardHtml(readyState(), 'panel-ready');

  assert.ok(html.includes('Ready to run'));
  assert.ok(html.includes('data-command="ralphCodex.runRalphLoop"'));
  assert.ok(html.includes('Run Loop'));
  assert.ok(html.includes('data-command="ralphCodex.runPipeline"'));
});
