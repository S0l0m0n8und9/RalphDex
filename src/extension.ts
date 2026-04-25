import * as vscode from 'vscode';
import { registerCommands } from './commands/registerCommands';
import { readConfig } from './config/readConfig';
import {
  collectNewSettingsNotice,
  getSettingsSurfaceMetadata,
  readSettingsDiscoveryState,
  writeSettingsDiscoveryState
} from './config/settingsSurface';
import { configureAzureSecretStorage } from './codex/azureAuthResolver';
import { Logger } from './services/logger';
import { RalphDashboardPanel } from './ui/dashboardPanel';
import { IterationBroadcaster } from './ui/iterationBroadcaster';
import { RalphSidebarViewProvider } from './ui/sidebarViewProvider';
import { RalphStateWatcher } from './ui/stateWatcher';
import { RalphStatusBar, showStatusBarQuickPick } from './ui/statusBarItem';
import { RalphTaskTreeDataProvider } from './ui/taskTreeView';
import { WebviewPanelManager } from './webview/WebviewPanelManager';
import { createDashboardSnapshotLoader } from './webview/dashboardDataLoader';
import { RalphStateManager } from './ralph/stateManager';
import { seedTasksFromFeatureRequest } from './commands/taskSeeding';

export function activate(context: vscode.ExtensionContext): void {
  const logger = new Logger(vscode.window.createOutputChannel('Ralphdex'));
  context.subscriptions.push(logger);
  configureAzureSecretStorage(('secrets' in context ? context.secrets : null) ?? null);

  // UI infrastructure
  const broadcaster = new IterationBroadcaster();
  context.subscriptions.push(broadcaster);

  const statusBar = new RalphStatusBar();
  context.subscriptions.push(statusBar);

  const panelManager = new WebviewPanelManager(vscode.window);
  context.subscriptions.push(panelManager);
  const dashboardStateManager = new RalphStateManager(context.workspaceState, logger);
  const dashboardSnapshotLoader = createDashboardSnapshotLoader(dashboardStateManager, logger);
  const dashboardHostActions = {
    seedTasks: async (requestText: string) => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        throw new Error('Open a workspace folder before seeding tasks.');
      }

      return seedTasksFromFeatureRequest(workspaceFolder, logger, {
        requestText,
        logContext: 'Task seeding via dashboard webview'
      });
    }
  };

  const sidebarProvider = new RalphSidebarViewProvider(context.extensionUri, broadcaster, dashboardSnapshotLoader, dashboardHostActions);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(RalphSidebarViewProvider.viewType, sidebarProvider)
  );

  // Status bar quick-pick command
  context.subscriptions.push(
    vscode.commands.registerCommand('ralphCodex.statusBarQuickPick', showStatusBarQuickPick)
  );

  // Primary dashboard command — opens the full dashboard in the editor area.
  context.subscriptions.push(
    vscode.commands.registerCommand('ralphCodex.showDashboard', (viewIntent) => {
      RalphDashboardPanel.createOrReveal(panelManager, broadcaster, dashboardSnapshotLoader, viewIntent ?? null, dashboardHostActions);
    })
  );

  // Legacy alias — keeps existing status bar items, sidebar buttons, and any
  // saved key bindings working without a breaking change.
  context.subscriptions.push(
    vscode.commands.registerCommand('ralphCodex.openDashboard', (viewIntent) => {
      RalphDashboardPanel.createOrReveal(panelManager, broadcaster, dashboardSnapshotLoader, viewIntent ?? null, dashboardHostActions);
    })
  );

  // Forces a fresh snapshot reload on the open panel, if any. Idempotent: no-op
  // when no panel is open. Show Status commands call this after revealing the
  // panel to guarantee the operator sees current data rather than a cached view.
  context.subscriptions.push(
    vscode.commands.registerCommand('ralphCodex.refreshDashboard', () => {
      RalphDashboardPanel.currentPanel?.refreshSnapshot();
    })
  );

  // Wire broadcaster events to the status bar.
  // DashboardHost owns its own broadcaster subscription, so the panel and
  // sidebar are updated internally without an extra listener here.
  context.subscriptions.push(
    broadcaster.onEvent((event) => {
      statusBar.updateFromBroadcast(event);
    })
  );

  // State watcher — responds to .ralph/ file changes
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (workspaceRoot) {
    const primaryWorkspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!primaryWorkspaceFolder) {
      return;
    }

    const taskTreeProvider = new RalphTaskTreeDataProvider(primaryWorkspaceFolder);
    context.subscriptions.push(
      vscode.window.registerTreeDataProvider('ralphCodex.tasks', taskTreeProvider)
    );

    const watcher = new RalphStateWatcher(workspaceRoot);
    context.subscriptions.push(watcher);

    watcher.onStateChange((state) => {
      statusBar.updateFromWatchedState(state);
      sidebarProvider.updateFromWatchedState(state);
      RalphDashboardPanel.currentPanel?.updateFromWatchedState(state);
      taskTreeProvider.refresh();
    });

    // Initial read
    void watcher.refresh();
  }

  registerCommands(context, logger, broadcaster, panelManager);

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
      autoApplyRemediation: config.autoApplyRemediation,
      autoReplenishBacklog: config.autoReplenishBacklog
    });
  }

  void (async () => {
    const persistedState = await readSettingsDiscoveryState(context.globalState ?? context.workspaceState);
    const metadata = getSettingsSurfaceMetadata();
    const notice = persistedState ? collectNewSettingsNotice(metadata, persistedState) : null;
    await writeSettingsDiscoveryState(context.globalState ?? context.workspaceState, metadata);

    if (!notice) {
      return;
    }

    const choice = await vscode.window.showInformationMessage(notice.message, 'Open Settings Panel');
    if (choice === 'Open Settings Panel') {
      await vscode.commands.executeCommand('ralphCodex.showDashboard', {
        activeTab: 'settings',
        focusSettingKey: notice.focusSettingKey
      });
    }
  })();
}

export function deactivate(): void {
  // no-op
}
