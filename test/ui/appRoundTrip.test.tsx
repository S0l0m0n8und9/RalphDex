import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../src/webview-ui/App';
import type { RalphDashboardState } from '../../src/ui/uiTypes';

// Exercises the full webview <-> host message contract end to end with a real DOM:
//   mount        -> App posts `webview-ready` through acquireVsCodeApi().postMessage
//   user click   -> App posts a `command` message
//   inbound msg  -> a window 'message' event drives setState and a re-render
// The host side of this contract (MessageBridge dispatch/dispose) is covered by
// test/webview/messageBridge.test.ts; this test proves the webview half.

interface WebviewApiProbe {
  posted: Array<{ type?: string;[key: string]: unknown }>;
  lastPosted(type: string): { type?: string;[key: string]: unknown } | undefined;
  reset(): void;
}
const api = (): WebviewApiProbe => {
  const probe = (globalThis as unknown as { __RALPH_WEBVIEW_API__?: WebviewApiProbe }).__RALPH_WEBVIEW_API__;
  if (!probe) {
    throw new Error('register-dom.cjs harness not loaded: __RALPH_WEBVIEW_API__ is undefined. Run this suite via the `test` / `test:ui` npm script.');
  }
  return probe;
};

function makeState(overrides: Partial<RalphDashboardState> = {}): RalphDashboardState {
  return {
    workspaceName: 'ws-initial', loopState: 'idle', agentRole: 'build',
    nextIteration: 1, loopIteration: 1, iterationCap: 5,
    taskCounts: null, tasks: [], recentIterations: [], preflightReady: true, preflightSummary: 'ok',
    diagnostics: [], agentLanes: [], settingsSurface: null, dashboardSnapshot: null,
    snapshotStatus: { phase: 'idle', errorMessage: null },
    taskSeeding: { phase: 'idle', requestText: '', createdTaskCount: null, message: null, artifactPath: null },
    viewIntent: null, prdExists: true, ...overrides,
  };
}

beforeEach(() => { api().reset(); });
afterEach(() => { cleanup(); });

test('App posts a webview-ready message to the host on mount', () => {
  render(<App mode="sidebar" initialState={makeState()} />);
  const ready = api().lastPosted('webview-ready');
  assert.ok(ready, 'expected a webview-ready message on mount');
  assert.equal(ready?.mode, 'sidebar');
});

test('App forwards a sidebar button click to the host as a command message', async () => {
  const user = userEvent.setup();
  render(<App mode="sidebar" initialState={makeState({ loopState: 'idle' })} />);

  await user.click(screen.getByRole('button', { name: /open dashboard/i }));
  assert.equal(api().lastPosted('command')?.command, 'ralphCodex.showDashboard');

  await user.click(screen.getByRole('button', { name: /start loop/i }));
  assert.equal(api().lastPosted('command')?.command, 'ralphCodex.runRalphLoop');
});

test('App re-renders when the host pushes a new state message', async () => {
  render(<App mode="sidebar" initialState={makeState({ workspaceName: 'ws-initial', loopState: 'idle' })} />);
  assert.ok(screen.getByText('ws-initial'));
  assert.ok(screen.getByRole('button', { name: /start loop/i }));

  await act(async () => {
    window.dispatchEvent(new window.MessageEvent('message', {
      data: { type: 'state', state: makeState({ workspaceName: 'ws-updated', loopState: 'running' }) },
    }));
  });

  assert.ok(screen.getByText('ws-updated'), 'workspace name should reflect the pushed state');
  assert.ok(screen.getByRole('button', { name: /stop loop/i }), 'running state should swap Start for Stop');
  assert.equal(screen.queryByRole('button', { name: /start loop/i }), null);
});
