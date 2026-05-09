import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { HeroNow } from '../../src/webview-ui/components/hero/HeroNow';
import type { RalphDashboardState } from '../../src/ui/uiTypes';
import type { WebviewUiModel } from '../../src/webview-ui/viewModel';

function makeState(overrides: Partial<RalphDashboardState> = {}): RalphDashboardState {
  return {
    workspaceName: 'test-ws', loopState: 'idle', agentRole: 'build',
    nextIteration: 3, iterationCap: 12,
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
    <HeroNow state={makeState({ loopState: 'idle' })} model={makeModel()} mode="standard"
      onStartLoop={() => {}} onStopLoop={() => {}} onRunIteration={() => {}} />
  );
  assert.ok(html.includes('Start loop'));
  assert.ok(!html.includes('Stop loop'));
});

test('HeroNow shows Stop button when loop is running', () => {
  const html = renderToStaticMarkup(
    <HeroNow state={makeState({ loopState: 'running' })} model={makeModel()} mode="standard"
      onStartLoop={() => {}} onStopLoop={() => {}} onRunIteration={() => {}} />
  );
  assert.ok(html.includes('Stop loop'));
  assert.ok(!html.includes('Start loop'));
});

test('HeroNow simple mode shows plain-English readiness text', () => {
  const html = renderToStaticMarkup(
    <HeroNow state={makeState()} model={makeModel({ readiness: { kind: 'ready', title: 'Ready', detail: 'Ralph is idle. 4 of 10 tasks done.' } })}
      mode="simple" onStartLoop={() => {}} onStopLoop={() => {}} onRunIteration={() => {}} />
  );
  assert.ok(html.includes('Ralph is idle. 4 of 10 tasks done.'));
});

test('HeroNow standard mode shows task ID when current task is set', () => {
  const html = renderToStaticMarkup(
    <HeroNow state={makeState({ loopState: 'running' })}
      model={makeModel({ currentTask: { id: 'T-42', title: 'Fix the thing', status: 'in_progress', isCurrent: true, priority: 'high', childIds: [], dependsOn: [] } })}
      mode="standard" onStartLoop={() => {}} onStopLoop={() => {}} onRunIteration={() => {}} />
  );
  assert.ok(html.includes('T-42'));
  assert.ok(html.includes('Fix the thing'));
});

test('HeroNow shows Run one iteration only in standard and advanced', () => {
  const htmlStd = renderToStaticMarkup(
    <HeroNow state={makeState()} model={makeModel()} mode="standard"
      onStartLoop={() => {}} onStopLoop={() => {}} onRunIteration={() => {}} />
  );
  assert.ok(htmlStd.includes('Run one iteration'));

  const htmlSimple = renderToStaticMarkup(
    <HeroNow state={makeState()} model={makeModel()} mode="simple"
      onStartLoop={() => {}} onStopLoop={() => {}} onRunIteration={() => {}} />
  );
  assert.ok(!htmlSimple.includes('Run one iteration'));
});

test('HeroNow renders health strip', () => {
  const html = renderToStaticMarkup(
    <HeroNow state={makeState()} model={makeModel()} mode="standard"
      onStartLoop={() => {}} onStopLoop={() => {}} onRunIteration={() => {}} />
  );
  assert.ok(html.includes('PROGRESS'));
  assert.ok(html.includes('ITERATION'));
  assert.ok(html.includes('ATTENTION'));
});
