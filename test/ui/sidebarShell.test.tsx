import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { SidebarShell } from '../../src/webview-ui/components/SidebarShell';
import type { RalphDashboardState } from '../../src/ui/uiTypes';
import type { WebviewUiModel } from '../../src/webview-ui/viewModel';

function makeState(overrides: Partial<RalphDashboardState> = {}): RalphDashboardState {
  return {
    workspaceName: 'test-ws',
    loopState: 'idle',
    agentRole: 'build',
    nextIteration: 1,
    loopIteration: 1,
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

function makeModel(overrides: Partial<WebviewUiModel> = {}): WebviewUiModel {
  return {
    readiness: { kind: 'ready', title: 'Ready', detail: 'Ready.' },
    primaryCommands: [],
    secondaryCommands: [],
    exposedCommandIds: new Set(),
    taskTotal: 0,
    doneCount: 0,
    currentTask: null,
    ...overrides
  };
}

test('SidebarShell running counter uses loop-local iteration instead of global nextIteration', () => {
  const html = renderToStaticMarkup(
    <SidebarShell
      state={makeState({ loopState: 'running', nextIteration: 22, loopIteration: 2, iterationCap: 5 })}
      model={makeModel()}
      onCommand={() => {}}
    />
  );

  assert.ok(html.includes('2</b> / 5'));
  assert.ok(!html.includes('22</b> / 5'));
});
