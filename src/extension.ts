import * as vscode from 'vscode';
import { registerCommands } from './commands/registerCommands';
import { readConfig } from './config/readConfig';
import { Logger } from './services/logger';
import { RalphDashboardPanel } from './ui/dashboardPanel';
import { IterationBroadcaster } from './ui/iterationBroadcaster';
import { RalphSidebarViewProvider } from './ui/sidebarViewProvider';
import { RalphStateWatcher } from './ui/stateWatcher';
import { RalphStatusBar, showStatusBarQuickPick } from './ui/statusBarItem';

export function activate(context: vscode.ExtensionContext): void {
  const logger = new Logger(vscode.window.createOutputChannel('Ralphdex'));
  context.subscriptions.push(logger);

  // UI infrastructure
  const broadcaster = new IterationBroadcaster();
  context.subscriptions.push(broadcaster);

  const statusBar = new RalphStatusBar();
  context.subscriptions.push(statusBar);

  const sidebarProvider = new RalphSidebarViewProvider(context.extensionUri, broadcaster);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(RalphSidebarViewProvider.viewType, sidebarProvider)
  );

  // Status bar quick-pick command
  context.subscriptions.push(
    vscode.commands.registerCommand('ralphCodex.statusBarQuickPick', showStatusBarQuickPick)
  );

  // Dashboard panel command — opens full dashboard in editor area
  context.subscriptions.push(
    vscode.commands.registerCommand('ralphCodex.openDashboard', () => {
      RalphDashboardPanel.createOrShow(context.extensionUri, broadcaster);
    })
  );

  // Wire broadcaster events to status bar and panel
  context.subscriptions.push(
    broadcaster.onEvent((event) => {
      statusBar.updateFromBroadcast(event);
      RalphDashboardPanel.currentPanel?.updateFromBroadcast(event);
    })
  );

  // State watcher — responds to .ralph/ file changes
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (workspaceRoot) {
    const watcher = new RalphStateWatcher(workspaceRoot);
    context.subscriptions.push(watcher);

    watcher.onStateChange((state) => {
      statusBar.updateFromWatchedState(state);
      sidebarProvider.updateFromWatchedState(state);
      RalphDashboardPanel.currentPanel?.updateFromWatchedState(state);
    });

    // Initial read
    void watcher.refresh();
  }

  registerCommands(context, logger, broadcaster);

  logger.info('Activated Ralphdex extension.', {
    workspaceTrusted: vscode.workspace.isTrusted,
    activationMode: vscode.workspace.isTrusted ? 'full' : 'limited'
  });

  if (!vscode.workspace.workspaceFolders?.length) {
    logger.info('Effective Ralph autonomy configuration unavailable at activation because no workspace folder is open.');
    return;
  }

  for (const workspaceFolder of vscode.workspace.workspaceFolders) {
    const config = readConfig(workspaceFolder);
    logger.info('Effective Ralph autonomy configuration.', {
      workspaceFolder: workspaceFolder.name,
      autonomyMode: config.autonomyMode,
      autoReloadOnControlPlaneChange: config.autoReloadOnControlPlaneChange,
      autoApplyRemediation: config.autoApplyRemediation,
      autoReplenishBacklog: config.autoReplenishBacklog
    });
  }
}

export function deactivate(): void {
  // no-op
}
