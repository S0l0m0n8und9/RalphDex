import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { HeroNow } from '../../src/webview-ui/components/hero/HeroNow';
import type { RalphDashboardState } from '../../src/ui/uiTypes';
import type { WebviewUiModel } from '../../src/webview-ui/viewModel';

function makeState(overrides: Partial<RalphDashboardState> = {}): RalphDashboardState {
  return {
    workspaceName: 'test-ws', loopState: 'idle', agentRole: 'build',
    nextIteration: 3, loopIteration: 3, iterationCap: 12,
    taskCounts: { todo: 5, in_progress: 1, blocked: 0, done: 4 },
    tasks: [], recentIterations: [], preflightReady: true, preflightSummary: 'ok',
    diagnostics: [], agentLanes: [], settingsSurface: null, dashboardSnapshot: null,
    snapshotStatus: { phase: 'idle', errorMessage: null },
    taskSeeding: { phase: 'idle', requestText: '', createdTaskCount: null, message: null, artifactPath: null },
    viewIntent: null, prdExists: true, ...overrides,
  };
}

function makeModel(overrides: Partial<WebviewUiModel> = {}): WebviewUiModel {
  return {
    readiness: { kind: 'ready', title: 'Ready', detail: 'Ralph is ready to run.' },
    primaryCommands: [], secondaryCommands: [], exposedCommandIds: new Set(),
    taskTotal: 10, doneCount: 4, currentTask: null, ...overrides,
  };
}

test('HeroNow shows Start button when loop is idle', () => {
  const html = renderToStaticMarkup(
    <HeroNow state={makeState({ loopState: 'idle' })} model={makeModel()}
      onStartLoop={() => {}} onStopLoop={() => {}} onRunIteration={() => {}} />
  );
  assert.ok(html.includes('Start loop'));
  assert.ok(!html.includes('Stop loop'));
});

test('HeroNow shows Stop button when loop is running', () => {
  const html = renderToStaticMarkup(
    <HeroNow state={makeState({ loopState: 'running' })} model={makeModel()}
      onStartLoop={() => {}} onStopLoop={() => {}} onRunIteration={() => {}} />
  );
  assert.ok(html.includes('Stop loop'));
  assert.ok(!html.includes('Start loop'));
});

test('HeroNow shows readiness detail when no current task', () => {
  const html = renderToStaticMarkup(
    <HeroNow state={makeState()} model={makeModel({ readiness: { kind: 'ready', title: 'Ready', detail: 'Ralph is idle. 4 of 10 tasks done.' } })}
      onStartLoop={() => {}} onStopLoop={() => {}} onRunIteration={() => {}} />
  );
  assert.ok(html.includes('Ralph is idle. 4 of 10 tasks done.'));
});

test('HeroNow shows task ID when current task is set', () => {
  const html = renderToStaticMarkup(
    <HeroNow state={makeState({ loopState: 'running' })}
      model={makeModel({ currentTask: { id: 'T-42', title: 'Fix the thing', status: 'in_progress', isCurrent: true, priority: 'high', childIds: [], dependsOn: [] } })}
      onStartLoop={() => {}} onStopLoop={() => {}} onRunIteration={() => {}} />
  );
  assert.ok(html.includes('T-42'));
  assert.ok(html.includes('Fix the thing'));
});

test('HeroNow always shows Run one iteration button', () => {
  const html = renderToStaticMarkup(
    <HeroNow state={makeState()} model={makeModel()}
      onStartLoop={() => {}} onStopLoop={() => {}} onRunIteration={() => {}} />
  );
  assert.ok(html.includes('Run one iteration'));
});

test('HeroNow renders health strip', () => {
  const html = renderToStaticMarkup(
    <HeroNow state={makeState()} model={makeModel()}
      onStartLoop={() => {}} onStopLoop={() => {}} onRunIteration={() => {}} />
  );
  assert.ok(html.includes('PROGRESS'));
  assert.ok(html.includes('ITERATION'));
  assert.ok(html.includes('ATTENTION'));
});

test('HeroNow iteration counter uses loop-local iteration instead of global nextIteration', () => {
  const html = renderToStaticMarkup(
    <HeroNow
      state={makeState({ loopState: 'running', nextIteration: 22, loopIteration: 2, iterationCap: 5 })}
      model={makeModel()}
      onStartLoop={() => {}}
      onStopLoop={() => {}}
      onRunIteration={() => {}}
    />
  );

  assert.ok(html.includes('2/5'));
  assert.ok(!html.includes('22/5'));
});
