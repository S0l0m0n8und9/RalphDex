import * as vscode from 'vscode';
import type { IterationBroadcaster } from './iterationBroadcaster';
import type { RalphWatchedState } from './stateWatcher';
import { buildPanelDashboardHtml } from './panelHtml';
import { DashboardHost } from '../webview/dashboardHost';
import type { WebviewPanelManager } from '../webview/WebviewPanelManager';
import type { DashboardSnapshotLoader } from '../webview/dashboardDataLoader';

/**
 * Editor-area dashboard panel.
 *
 * Lifecycle is managed by {@link WebviewPanelManager} under the name
 * `'dashboard'`. Message handling and state assembly are delegated to
 * {@link DashboardHost} so the sidebar and the panel share one implementation.
 */
export class RalphDashboardPanel implements vscode.Disposable {
  public static readonly viewType = 'ralphCodex.dashboardPanel';
  public static currentPanel: RalphDashboardPanel | undefined;

  private readonly host: DashboardHost;

  private constructor(panel: vscode.WebviewPanel, broadcaster: IterationBroadcaster, loadSnapshot?: DashboardSnapshotLoader) {
    this.host = new DashboardHost(panel.webview, broadcaster, buildPanelDashboardHtml, loadSnapshot);
    panel.onDidDispose(() => this.dispose());
  }

  /**
   * Creates the dashboard panel via `manager` or reveals the existing one.
   * The `manager` must be the same instance across calls so `createOrReveal`
   * can detect and reveal an already-open panel.
   */
  public static createOrReveal(
    manager: WebviewPanelManager,
    broadcaster: IterationBroadcaster,
    loadSnapshot?: DashboardSnapshotLoader
  ): void {
    const panel = manager.createOrReveal('dashboard', {
      viewType: RalphDashboardPanel.viewType,
      title: 'Ralphdex',
      viewColumn: vscode.ViewColumn.One,
      options: { enableScripts: true, retainContextWhenHidden: true }
    });

    if (RalphDashboardPanel.currentPanel) {
      // Existing panel was just revealed by createOrReveal — nothing more to do.
      return;
    }

    RalphDashboardPanel.currentPanel = new RalphDashboardPanel(panel, broadcaster, loadSnapshot);
  }

  public updateFromWatchedState(watched: RalphWatchedState): void {
    this.host.updateFromWatchedState(watched);
  }

  public dispose(): void {
    RalphDashboardPanel.currentPanel = undefined;
    this.host.dispose();
  }
}
