import * as vscode from 'vscode';
import * as crypto from 'crypto';
import type { IterationBroadcaster } from './iterationBroadcaster';
import type { RalphBroadcastEvent, RalphIterationPhase, RalphWebviewCommand } from './uiTypes';
import type { RalphWatchedState } from './stateWatcher';
import { buildPanelDashboardHtml } from './panelHtml';
import { buildDashboardTasks, countTasks, defaultDashboardState, snapshotConfig } from './sidebarViewProvider';
import type { RalphDashboardState, RalphDashboardIteration } from './uiTypes';
import { readConfig } from '../config/readConfig';

/**
 * Manages a singleton WebviewPanel that shows the full Ralph Codex dashboard
 * in the editor area (centre stage).
 */
export class RalphDashboardPanel implements vscode.Disposable {
  public static readonly viewType = 'ralphCodex.dashboardPanel';
  public static currentPanel: RalphDashboardPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private readonly broadcaster: IterationBroadcaster;
  private broadcastDisposable: vscode.Disposable | undefined;
  private latestState: RalphDashboardState;
  private currentPhase: RalphIterationPhase | null = null;
  private currentIteration: number | null = null;
  private lastRenderTime = 0;

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, broadcaster: IterationBroadcaster) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.broadcaster = broadcaster;
    this.latestState = defaultDashboardState();

    panel.webview.options = { enableScripts: true };

    // Listen for commands and settings updates from the webview
    panel.webview.onDidReceiveMessage(async (msg: RalphWebviewCommand) => {
      if (msg.type === 'command' && msg.command) {
        this.postMessage({ type: 'command-ack', command: msg.command, status: 'started' });
        try {
          await vscode.commands.executeCommand(msg.command);
          this.postMessage({ type: 'command-ack', command: msg.command, status: 'done' });
        } catch {
          this.postMessage({ type: 'command-ack', command: msg.command, status: 'error' });
        }
      }
      if (msg.type === 'update-setting') {
        const wsConfig = vscode.workspace.getConfiguration('ralphCodex');
        await wsConfig.update(msg.key, msg.value, vscode.ConfigurationTarget.Workspace);
        // Re-read config and re-render to reflect the change
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
          const freshConfig = readConfig(workspaceFolder);
          this.latestState = { ...this.latestState, config: snapshotConfig(freshConfig) };
          this.lastRenderTime = 0; // force render
          this.fullRender();
        }
      }
    });

    // Listen for broadcast events
    this.broadcastDisposable = broadcaster.onEvent((event) => {
      this.handleBroadcast(event);
    });

    // Dispose when the panel is closed
    panel.onDidDispose(() => {
      this.dispose();
    });

    this.fullRender();
  }

  public static createOrShow(extensionUri: vscode.Uri, broadcaster: IterationBroadcaster): void {
    if (RalphDashboardPanel.currentPanel) {
      RalphDashboardPanel.currentPanel.panel.reveal(vscode.ViewColumn.One);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      RalphDashboardPanel.viewType,
      'Ralph Codex',
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    RalphDashboardPanel.currentPanel = new RalphDashboardPanel(panel, extensionUri, broadcaster);
  }

  public updateFromWatchedState(watched: RalphWatchedState): void {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const config = workspaceFolder ? readConfig(workspaceFolder) : null;
    const ws = watched.workspaceState;

    const tasks = buildDashboardTasks(watched.taskFile, watched.selectedTaskId);
    const taskCounts = watched.taskFile ? countTasks(watched.taskFile) : null;

    const recentIterations: RalphDashboardIteration[] = (ws?.iterationHistory ?? [])
      .slice(-5)
      .reverse()
      .map((iter) => ({
        iteration: iter.iteration,
        taskId: iter.selectedTaskId,
        taskTitle: iter.selectedTaskTitle,
        classification: iter.completionClassification,
        stopReason: iter.stopReason,
        artifactDir: iter.artifactDir
      }));

    this.latestState = {
      workspaceName: workspaceFolder?.name ?? 'unknown',
      loopState: this.latestState.loopState === 'running' ? 'running' : (ws?.lastIteration?.stopReason ? 'stopped' : 'idle'),
      agentRole: config?.agentRole ?? 'build',
      nextIteration: ws?.nextIteration ?? 1,
      iterationCap: config?.ralphIterationCap ?? 5,
      taskCounts,
      tasks,
      recentIterations,
      preflightReady: true,
      preflightSummary: 'ok',
      diagnostics: [],
      currentPhase: this.currentPhase,
      currentIteration: this.currentIteration,
      config: config ? snapshotConfig(config) : null
    };

    this.fullRender();
  }

  public updateFromBroadcast(event: RalphBroadcastEvent): void {
    this.handleBroadcast(event);
  }

  private handleBroadcast(event: RalphBroadcastEvent): void {
    switch (event.type) {
      case 'phase':
        this.currentPhase = event.phase;
        this.currentIteration = event.iteration;
        this.postMessage({ type: 'phase', phase: event.phase, iteration: event.iteration });
        break;
      case 'loop-start':
        this.latestState = { ...this.latestState, loopState: 'running', iterationCap: event.iterationCap };
        this.fullRender();
        break;
      case 'iteration-start':
        this.currentPhase = 'inspect';
        this.currentIteration = event.iteration;
        this.latestState = {
          ...this.latestState,
          loopState: 'running',
          currentPhase: 'inspect',
          currentIteration: event.iteration
        };
        this.fullRender();
        break;
      case 'iteration-end':
      case 'loop-end':
        this.currentPhase = null;
        this.currentIteration = null;
        this.latestState = {
          ...this.latestState,
          loopState: event.type === 'loop-end' ? (event.stopReason ? 'stopped' : 'idle') : this.latestState.loopState,
          currentPhase: null,
          currentIteration: null
        };
        this.fullRender();
        break;
    }
  }

  private fullRender(): void {
    // Debounce: skip renders within 100ms of last render
    const now = Date.now();
    if (now - this.lastRenderTime < 100) {
      return;
    }
    this.lastRenderTime = now;

    const nonce = crypto.randomBytes(16).toString('hex');
    this.panel.webview.html = buildPanelDashboardHtml(this.latestState, nonce);
  }

  private postMessage(message: import('./uiTypes').RalphWebviewMessage): void {
    void this.panel.webview.postMessage(message);
  }

  public dispose(): void {
    RalphDashboardPanel.currentPanel = undefined;
    this.broadcastDisposable?.dispose();
    this.panel.dispose();
  }
}
