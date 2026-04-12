import * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// MessageBridge
// ---------------------------------------------------------------------------

/**
 * Typed message bridge between the VS Code extension host and a webview.
 *
 * - `TOut` — messages sent **to** the webview (`extension → webview`).
 * - `TIn`  — messages received **from** the webview (`webview → extension`).
 *
 * All subscriptions registered via {@link onMessage} are tracked and cleaned
 * up when the bridge is disposed. Disposing the bridge does **not** dispose
 * the underlying {@link vscode.Webview}; the caller owns the webview lifetime.
 *
 * @example
 * ```typescript
 * const bridge = new MessageBridge<RalphWebviewMessage, RalphWebviewCommand>(panel.webview);
 * const sub = bridge.onMessage((msg) => console.log(msg));
 * bridge.send({ type: 'state', state });
 * bridge.dispose(); // cleans up all listeners
 * ```
 */
export class MessageBridge<TOut, TIn> implements vscode.Disposable {
  private readonly subscriptions: vscode.Disposable[] = [];

  constructor(private readonly webview: vscode.Webview) {}

  /** Posts `message` to the webview. Fire-and-forget. */
  send(message: TOut): void {
    void this.webview.postMessage(message);
  }

  /**
   * Registers `handler` to be called for every message received from the
   * webview. Returns a disposable that removes only this handler when called.
   */
  onMessage(handler: (message: TIn) => void): vscode.Disposable {
    const sub = this.webview.onDidReceiveMessage(handler);
    this.subscriptions.push(sub);

    return {
      dispose: () => {
        const idx = this.subscriptions.indexOf(sub);
        if (idx >= 0) {
          this.subscriptions.splice(idx, 1);
        }
        sub.dispose();
      }
    };
  }

  /** Disposes all registered message subscriptions. */
  dispose(): void {
    for (const sub of this.subscriptions) {
      sub.dispose();
    }
    this.subscriptions.length = 0;
  }
}
