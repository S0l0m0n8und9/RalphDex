import assert from 'node:assert/strict';
import test from 'node:test';
import { MessageBridge } from '../../src/webview/MessageBridge';

// ---------------------------------------------------------------------------
// Minimal mock helpers
// ---------------------------------------------------------------------------

type MessageHandler = (msg: unknown) => void;

interface MockWebview {
  posted: unknown[];
  handlers: MessageHandler[];
  postMessage(msg: unknown): Promise<boolean>;
  onDidReceiveMessage(handler: MessageHandler): { dispose(): void };
}

function makeMockWebview(): MockWebview {
  const wv: MockWebview = {
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('MessageBridge: send posts message to webview', () => {
  const wv = makeMockWebview();
  const bridge = new MessageBridge<{ type: string }, never>(
    wv as unknown as import('vscode').Webview
  );

  bridge.send({ type: 'ping' });

  assert.equal(wv.posted.length, 1);
  assert.deepEqual(wv.posted[0], { type: 'ping' });
});

test('MessageBridge: onMessage handler receives inbound messages', () => {
  const wv = makeMockWebview();
  const bridge = new MessageBridge<never, { type: string }>(
    wv as unknown as import('vscode').Webview
  );

  const received: { type: string }[] = [];
  bridge.onMessage((msg) => received.push(msg));

  webviewSends(wv, { type: 'command', command: 'start' });
  webviewSends(wv, { type: 'command', command: 'stop' });

  assert.equal(received.length, 2);
  assert.equal((received[0] as { type: string; command: string }).command, 'start');
});

test('MessageBridge: individual subscription dispose removes only that handler', () => {
  const wv = makeMockWebview();
  const bridge = new MessageBridge<never, { type: string }>(
    wv as unknown as import('vscode').Webview
  );

  const aMessages: unknown[] = [];
  const bMessages: unknown[] = [];

  const subA = bridge.onMessage((msg) => aMessages.push(msg));
  bridge.onMessage((msg) => bMessages.push(msg));

  subA.dispose();

  webviewSends(wv, { type: 'x' });

  assert.equal(aMessages.length, 0, 'handler A should have been removed');
  assert.equal(bMessages.length, 1, 'handler B should still receive messages');
});

test('MessageBridge: dispose removes all subscriptions', () => {
  const wv = makeMockWebview();
  const bridge = new MessageBridge<never, { type: string }>(
    wv as unknown as import('vscode').Webview
  );

  const received: unknown[] = [];
  bridge.onMessage((msg) => received.push(msg));
  bridge.onMessage((msg) => received.push(msg));

  bridge.dispose();

  webviewSends(wv, { type: 'after-dispose' });

  assert.equal(received.length, 0, 'no handlers should fire after dispose');
  assert.equal(wv.handlers.length, 0, 'all subscriptions should be removed from webview');
});

test('MessageBridge: typed round-trip — send then receive different message shapes', () => {
  type Out = { type: 'state'; value: number };
  type In = { type: 'ack'; ok: boolean };

  const wv = makeMockWebview();
  const bridge = new MessageBridge<Out, In>(
    wv as unknown as import('vscode').Webview
  );

  bridge.send({ type: 'state', value: 42 });

  const acks: In[] = [];
  bridge.onMessage((msg) => acks.push(msg));
  webviewSends(wv, { type: 'ack', ok: true });

  assert.deepEqual(wv.posted[0], { type: 'state', value: 42 });
  assert.equal(acks.length, 1);
  assert.equal(acks[0].ok, true);
});

test('MessageBridge: dispose is idempotent', () => {
  const wv = makeMockWebview();
  const bridge = new MessageBridge<never, never>(
    wv as unknown as import('vscode').Webview
  );

  assert.doesNotThrow(() => {
    bridge.dispose();
    bridge.dispose();
  });
});
