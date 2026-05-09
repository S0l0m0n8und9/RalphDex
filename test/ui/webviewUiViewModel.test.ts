import assert from 'node:assert/strict';
import test from 'node:test';
import { getWebviewUiModel } from '../../src/webview-ui/viewModel';
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

test('webview UI model routes missing PRD to wizard without run commands', () => {
  const model = getWebviewUiModel(defaultState({ prdExists: false, taskCounts: null, tasks: [] }));

  assert.equal(model.readiness.kind, 'missing-prd');
  assert.deepEqual(model.primaryCommands.map((command) => command.command), ['ralphCodex.openPrdWizard']);
  assert.ok(!model.exposedCommandIds.has('ralphCodex.runRalphLoop'));
  assert.ok(!model.exposedCommandIds.has('ralphCodex.runPipeline'));
});

test('webview UI model routes empty backlog through PRD readiness without run commands', () => {
  const model = getWebviewUiModel(defaultState({
    prdExists: true,
    taskCounts: { todo: 0, in_progress: 0, blocked: 0, done: 0 },
    tasks: []
  }));

  assert.equal(model.readiness.kind, 'empty-backlog');
  assert.deepEqual(model.primaryCommands.map((command) => command.command), ['ralphCodex.openPrdWizard']);
  assert.ok(!model.exposedCommandIds.has('ralphCodex.runRalphLoop'));
  assert.ok(!model.exposedCommandIds.has('ralphCodex.runPipeline'));
});

test('webview UI model hides run commands when readiness is blocked', () => {
  const model = getWebviewUiModel(defaultState({
    prdExists: true,
    preflightReady: false,
    preflightSummary: 'Provider command not found.',
    taskCounts: { todo: 1, in_progress: 0, blocked: 0, done: 0 },
    tasks: [{
      id: 'T1',
      title: 'Fix provider setup',
      status: 'todo',
      isCurrent: true,
      priority: 'normal',
      childIds: [],
      dependsOn: []
    }]
  }));

  assert.equal(model.readiness.kind, 'blocked');
  assert.deepEqual(model.primaryCommands.map((command) => command.command), ['ralphCodex.openSettings']);
  assert.ok(!model.exposedCommandIds.has('ralphCodex.runRalphLoop'));
  assert.ok(!model.exposedCommandIds.has('ralphCodex.runPipeline'));
});

test('webview UI model exposes expected run controls when ready', () => {
  const model = getWebviewUiModel(defaultState({
    prdExists: true,
    preflightReady: true,
    taskCounts: { todo: 1, in_progress: 0, blocked: 0, done: 0 },
    tasks: [{
      id: 'T1',
      title: 'Implement React shell',
      status: 'todo',
      isCurrent: true,
      priority: 'normal',
      childIds: [],
      dependsOn: []
    }]
  }));

  assert.equal(model.readiness.kind, 'ready');
  assert.ok(model.exposedCommandIds.has('ralphCodex.runRalphLoop'));
  assert.ok(model.exposedCommandIds.has('ralphCodex.runPipeline'));
  assert.ok(model.exposedCommandIds.has('ralphCodex.runRalphIteration'));
});
