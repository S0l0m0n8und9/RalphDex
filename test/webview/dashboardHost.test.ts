import assert from 'node:assert/strict';
import test from 'node:test';
import { DashboardHost } from '../../src/webview/dashboardHost';
import { IterationBroadcaster } from '../../src/ui/iterationBroadcaster';

// ---------------------------------------------------------------------------
// Minimal mock helpers
// ---------------------------------------------------------------------------

type MessageHandler = (msg: unknown) => void;

interface MockWebview {
  html: string;
  options: { enableScripts?: boolean };
  posted: unknown[];
  handlers: MessageHandler[];
  postMessage(msg: unknown): Promise<boolean>;
  onDidReceiveMessage(handler: MessageHandler): { dispose(): void };
}

function makeMockWebview(): MockWebview {
  const wv: MockWebview = {
    html: '',
    options: {},
    posted: [],
    handlers: [],
    postMessage(msg) {
      wv.posted.push(msg);
      return Promise.resolve(true);
    },
    onDidReceiveMessage(handler) {
      wv.handlers.push(handler);
      return {
        dispose() {
          const idx = wv.handlers.indexOf(handler);
          if (idx >= 0) wv.handlers.splice(idx, 1);
        }
      };
    }
  };
  return wv;
}

/** Simulates the webview sending a message to the extension. */
function webviewSends(wv: MockWebview, msg: unknown): void {
  for (const handler of [...wv.handlers]) {
    handler(msg);
  }
}

function makeSimpleRenderFn(label: string) {
  return (state: { workspaceName: string }, _nonce: string) =>
    `<html>${label}:${state.workspaceName}</html>`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('DashboardHost: initial render writes html on construction', () => {
  const wv = makeMockWebview();
  const broadcaster = new IterationBroadcaster();

  const _host = new DashboardHost(
    wv as unknown as import('vscode').Webview,
    broadcaster,
    makeSimpleRenderFn('panel') as never
  );

  assert.ok(wv.html.includes('panel:'), 'html should be written on construction');

  broadcaster.dispose();
});

test('DashboardHost: updateFromWatchedState triggers fullRender', () => {
  const wv = makeMockWebview();
  const broadcaster = new IterationBroadcaster();
  const host = new DashboardHost(
    wv as unknown as import('vscode').Webview,
    broadcaster,
    makeSimpleRenderFn('sidebar') as never
  );

  const initialHtml = wv.html;
  // Advance time beyond debounce window (DashboardHost debounces at 100ms).
  // We reset lastRenderTime by waiting; for tests we instead rely on the fact
  // that construction and updateFromWatchedState happen in different event
  // loop ticks — but to be safe, read the timestamps directly via two renders
  // separated by a short sleep is not available in sync tests, so instead we
  // call after a forced delay via Date manipulation isn't available here.
  // Instead, just verify the html is set at all after a second update call
  // (debounce only skips if both happen within 100ms of the same wall-clock ms).

  // Wait >100ms by looping enough iterations to advance the clock naturally.
  const deadline = Date.now() + 110;
  while (Date.now() < deadline) { /* spin */ }

  host.updateFromWatchedState({
    taskFile: null,
    selectedTaskId: null,
    workspaceState: null
  } as never);

  assert.ok(wv.html.length > 0, 'html should still be set after updateFromWatchedState');
  // If debounce did not block us, the html is different (or at least truthy).
  assert.notEqual(wv.html, initialHtml, 'html should be re-rendered after update (debounce cleared)');

  broadcaster.dispose();
});

test('DashboardHost: inbound command triggers command-ack started then done', async () => {
  const wv = makeMockWebview();
  const broadcaster = new IterationBroadcaster();

  new DashboardHost(
    wv as unknown as import('vscode').Webview,
    broadcaster,
    makeSimpleRenderFn('p') as never
  );

  // Drain the initial posted messages (none) and simulate a command message.
  wv.posted.length = 0;
  webviewSends(wv, { type: 'command', command: 'ralphCodex.startLoop' });

  // Allow the async handler to settle.
  await new Promise((resolve) => setImmediate(resolve));

  const ackMessages = wv.posted as Array<{ type: string; command: string; status: string }>;
  assert.ok(ackMessages.length >= 1, 'at least one ack message should be posted');
  assert.equal(ackMessages[0].type, 'command-ack');
  assert.equal(ackMessages[0].command, 'ralphCodex.startLoop');
  assert.equal(ackMessages[0].status, 'started');

  // The command executed (registered in the vscode stub by registerCommands or
  // simply recorded in executedCommands), then a 'done' ack is sent.
  const doneAck = ackMessages.find((m) => m.status === 'done');
  assert.ok(doneAck, 'a done ack should be posted after command resolves');

  broadcaster.dispose();
});

test('DashboardHost: broadcast loop-start updates loopState and re-renders', () => {
  const wv = makeMockWebview();
  const broadcaster = new IterationBroadcaster();

  new DashboardHost(
    wv as unknown as import('vscode').Webview,
    broadcaster,
    (state, _nonce) => `<html>loop:${state.loopState}</html>` as never
  );

  // Spin past debounce window.
  const deadline = Date.now() + 110;
  while (Date.now() < deadline) { /* spin */ }

  broadcaster.emitLoopStart(10);

  assert.ok(wv.html.includes('loop:running'), 'html should reflect running state after loop-start broadcast');

  broadcaster.dispose();
});

test('DashboardHost: broadcast phase event posts phase message via bridge', () => {
  const wv = makeMockWebview();
  const broadcaster = new IterationBroadcaster();

  new DashboardHost(
    wv as unknown as import('vscode').Webview,
    broadcaster,
    makeSimpleRenderFn('p') as never
  );

  wv.posted.length = 0;
  broadcaster.emitPhase(3, 'execute', 'agent-1');

  const phaseMessages = wv.posted as Array<{ type: string; phase: string; iteration: number; agentId?: string }>;
  assert.equal(phaseMessages.length, 1, 'one phase message should be posted');
  assert.equal(phaseMessages[0].type, 'phase');
  assert.equal(phaseMessages[0].phase, 'execute');
  assert.equal(phaseMessages[0].iteration, 3);
  assert.equal(phaseMessages[0].agentId, 'agent-1');

  broadcaster.dispose();
});

test('DashboardHost: broadcast iteration-start sets loopState running', () => {
  const wv = makeMockWebview();
  const broadcaster = new IterationBroadcaster();

  new DashboardHost(
    wv as unknown as import('vscode').Webview,
    broadcaster,
    (state, _nonce) => `<html>${state.loopState}</html>` as never
  );

  const deadline = Date.now() + 110;
  while (Date.now() < deadline) { /* spin */ }

  broadcaster.emitIterationStart({
    iteration: 1,
    iterationCap: 5,
    selectedTaskId: 'T1',
    selectedTaskTitle: 'Test task'
  });

  assert.ok(wv.html.includes('running'), 'loopState should be running after iteration-start');

  broadcaster.dispose();
});

test('DashboardHost: broadcast loop-end updates loopState', () => {
  const wv = makeMockWebview();
  const broadcaster = new IterationBroadcaster();

  new DashboardHost(
    wv as unknown as import('vscode').Webview,
    broadcaster,
    (state, _nonce) => `<html>${state.loopState}</html>` as never
  );

  const deadline = Date.now() + 110;
  while (Date.now() < deadline) { /* spin */ }

  broadcaster.emitLoopEnd(1, 'iteration_cap_reached');

  assert.ok(wv.html.includes('stopped'), 'loopState should be stopped after loop-end with stopReason');

  broadcaster.dispose();
});

test('DashboardHost: dispose cleans up bridge and broadcaster subscription', () => {
  const wv = makeMockWebview();
  const broadcaster = new IterationBroadcaster();

  const host = new DashboardHost(
    wv as unknown as import('vscode').Webview,
    broadcaster,
    makeSimpleRenderFn('p') as never
  );

  host.dispose();

  // After dispose, inbound messages should not reach the handler.
  const handlerCountAfterDispose = wv.handlers.length;
  assert.equal(handlerCountAfterDispose, 0, 'all message handlers should be removed after dispose');

  // Emitting a broadcast after dispose should not render.
  const deadline = Date.now() + 110;
  while (Date.now() < deadline) { /* spin */ }
  const htmlBeforeBroadcast = wv.html;
  broadcaster.emitLoopStart(5);
  assert.equal(wv.html, htmlBeforeBroadcast, 'html should not change after dispose + broadcast');

  broadcaster.dispose();
});

test('DashboardHost: different renderFn produces different output', () => {
  const wvA = makeMockWebview();
  const wvB = makeMockWebview();
  const broadcaster = new IterationBroadcaster();

  new DashboardHost(
    wvA as unknown as import('vscode').Webview,
    broadcaster,
    makeSimpleRenderFn('panel') as never
  );
  new DashboardHost(
    wvB as unknown as import('vscode').Webview,
    broadcaster,
    makeSimpleRenderFn('sidebar') as never
  );

  assert.ok(wvA.html.includes('panel:'), 'panel webview should use panel renderFn');
  assert.ok(wvB.html.includes('sidebar:'), 'sidebar webview should use sidebar renderFn');
  assert.notEqual(wvA.html, wvB.html, 'panel and sidebar should produce different html');

  broadcaster.dispose();
});
