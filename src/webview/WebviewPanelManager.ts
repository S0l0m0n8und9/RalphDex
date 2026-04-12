import * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PanelOptions {
  /** VS Code view-type identifier — unique string for the panel kind. */
  viewType: string;
  /** Human-readable title shown in the panel tab. */
  title: string;
  /** Column to open the panel in. Defaults to `ViewColumn.One`. */
  viewColumn?: vscode.ViewColumn;
  /** Webview panel and view options forwarded to VS Code. */
  options?: vscode.WebviewPanelOptions & vscode.WebviewOptions;
}

/**
 * Minimal factory interface so callers can inject a real or mock
 * `vscode.window` without depending on the global module.
 */
export interface WebviewPanelFactory {
  createWebviewPanel(
    viewType: string,
    title: string,
    showOptions: vscode.ViewColumn | { viewColumn: vscode.ViewColumn; preserveFocus?: boolean },
    options?: vscode.WebviewPanelOptions & vscode.WebviewOptions
  ): vscode.WebviewPanel;
}

// ---------------------------------------------------------------------------
// WebviewPanelManager
// ---------------------------------------------------------------------------

/**
 * Manages named {@link vscode.WebviewPanel} instances.
 *
 * Each panel is identified by a string `name`. Calling
 * {@link createOrReveal} with the same name reveals the existing panel
 * rather than creating a duplicate. Panels are automatically removed from
 * the registry when they are closed by the user or disposed programmatically.
 *
 * Dispose the manager to close all open panels at once.
 */
export class WebviewPanelManager implements vscode.Disposable {
  private readonly panels = new Map<string, vscode.WebviewPanel>();

  constructor(private readonly factory: WebviewPanelFactory) {}

  /**
   * Returns the existing panel for `name` (revealing it) or creates a new
   * one using `opts`.
   */
  createOrReveal(name: string, opts: PanelOptions): vscode.WebviewPanel {
    const existing = this.panels.get(name);
    if (existing) {
      existing.reveal(opts.viewColumn ?? vscode.ViewColumn.One);
      return existing;
    }

    const panel = this.factory.createWebviewPanel(
      opts.viewType,
      opts.title,
      opts.viewColumn ?? vscode.ViewColumn.One,
      opts.options
    );

    this.panels.set(name, panel);

    // Clean up the registry entry when VS Code closes the panel.
    panel.onDidDispose(() => {
      this.panels.delete(name);
    });

    return panel;
  }

  /** Returns the panel registered under `name`, or `undefined`. */
  get(name: string): vscode.WebviewPanel | undefined {
    return this.panels.get(name);
  }

  /** Disposes the panel registered under `name` and removes it from the registry. */
  disposePanel(name: string): void {
    const panel = this.panels.get(name);
    if (panel) {
      this.panels.delete(name);
      panel.dispose();
    }
  }

  /** Disposes all open panels and clears the registry. */
  dispose(): void {
    for (const panel of this.panels.values()) {
      panel.dispose();
    }
    this.panels.clear();
  }
}
