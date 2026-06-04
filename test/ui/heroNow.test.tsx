import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

const noop = () => {};

beforeEach(() => { (globalThis as { __RALPH_WEBVIEW_API__?: { reset(): void } }).__RALPH_WEBVIEW_API__?.reset(); });
afterEach(() => { cleanup(); });

test('HeroNow shows Start button when loop is idle', () => {
  render(<HeroNow state={makeState({ loopState: 'idle' })} model={makeModel()}
    onStartLoop={noop} onStopLoop={noop} onRunIteration={noop} />);
  assert.ok(screen.getByRole('button', { name: /start loop/i }));
  assert.equal(screen.queryByRole('button', { name: /stop loop/i }), null);
});

test('HeroNow shows Stop button when loop is running', () => {
  render(<HeroNow state={makeState({ loopState: 'running' })} model={makeModel()}
    onStartLoop={noop} onStopLoop={noop} onRunIteration={noop} />);
  assert.ok(screen.getByRole('button', { name: /stop loop/i }));
  assert.equal(screen.queryByRole('button', { name: /start loop/i }), null);
});

test('HeroNow shows readiness detail when no current task', () => {
  render(<HeroNow state={makeState()}
    model={makeModel({ readiness: { kind: 'ready', title: 'Ready', detail: 'Ralph is idle. 4 of 10 tasks done.' } })}
    onStartLoop={noop} onStopLoop={noop} onRunIteration={noop} />);
  assert.ok(screen.getByText('Ralph is idle. 4 of 10 tasks done.'));
});

test('HeroNow shows task ID when current task is set', () => {
  render(<HeroNow state={makeState({ loopState: 'running' })}
    model={makeModel({ currentTask: { id: 'T-42', title: 'Fix the thing', status: 'in_progress', isCurrent: true, priority: 'high', childIds: [], dependsOn: [] } })}
    onStartLoop={noop} onStopLoop={noop} onRunIteration={noop} />);
  assert.ok(screen.getByText(/T-42/));
  assert.ok(screen.getByText(/Fix the thing/));
});

test('HeroNow always shows Run one iteration button', () => {
  render(<HeroNow state={makeState()} model={makeModel()}
    onStartLoop={noop} onStopLoop={noop} onRunIteration={noop} />);
  assert.ok(screen.getByRole('button', { name: /run one iteration/i }));
});

test('HeroNow renders health strip', () => {
  render(<HeroNow state={makeState()} model={makeModel()}
    onStartLoop={noop} onStopLoop={noop} onRunIteration={noop} />);
  assert.ok(screen.getByText('PROGRESS'));
  assert.ok(screen.getByText('ITERATION'));
  assert.ok(screen.getByText('ATTENTION'));
});

test('HeroNow iteration counter uses loop-local iteration instead of global nextIteration', () => {
  render(<HeroNow
    state={makeState({ loopState: 'running', nextIteration: 22, loopIteration: 2, iterationCap: 5 })}
    model={makeModel()} onStartLoop={noop} onStopLoop={noop} onRunIteration={noop} />);
  assert.ok(screen.getByText('2/5'));
  assert.equal(screen.queryByText('22/5'), null);
});

// --- Interaction coverage (only reachable with a real DOM + event dispatch) ---

test('HeroNow Start button invokes onStartLoop when clicked', async () => {
  const user = userEvent.setup();
  let started = 0;
  render(<HeroNow state={makeState({ loopState: 'idle' })} model={makeModel()}
    onStartLoop={() => { started++; }} onStopLoop={noop} onRunIteration={noop} />);
  await user.click(screen.getByRole('button', { name: /start loop/i }));
  assert.equal(started, 1);
});

test('HeroNow Stop button invokes onStopLoop when clicked', async () => {
  const user = userEvent.setup();
  let stopped = 0;
  render(<HeroNow state={makeState({ loopState: 'running' })} model={makeModel()}
    onStartLoop={noop} onStopLoop={() => { stopped++; }} onRunIteration={noop} />);
  await user.click(screen.getByRole('button', { name: /stop loop/i }));
  assert.equal(stopped, 1);
});

test('HeroNow Run one iteration button invokes onRunIteration when clicked', async () => {
  const user = userEvent.setup();
  let ran = 0;
  render(<HeroNow state={makeState()} model={makeModel()}
    onStartLoop={noop} onStopLoop={noop} onRunIteration={() => { ran++; }} />);
  await user.click(screen.getByRole('button', { name: /run one iteration/i }));
  assert.equal(ran, 1);
});
