import * as vscode from 'vscode';
import * as crypto from 'crypto';
import type { IterationBroadcaster } from './iterationBroadcaster';
import type { RalphAgentLaneState, RalphBroadcastEvent, RalphIterationPhase, RalphWebviewCommand } from './uiTypes';
import type { RalphWatchedState } from './stateWatcher';
import { buildPanelDashboardHtml } from './panelHtml';
import { buildDashboardTasks, countTasks, defaultDashboardState, snapshotConfig } from './sidebarViewProvider';
import type { RalphDashboardState, RalphDashboardIteration } from './uiTypes';
import { readConfig } from '../config/readConfig';
import { WebviewConfigSync } from './webviewConfigSync';

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
  private agentLanesMap = new Map<string, { phase: RalphIterationPhase; iteration: number }>();
  private lastRenderTime = 0;
  private readonly configSync = new WebviewConfigSync();

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, broadcaster: IterationBroadcaster) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.broadcaster = broadcaster;
    this.latestState = defaultDashboardState();

    // Eagerly populate config so settings are visible on first render
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      const initialConfig = readConfig(workspaceFolder);
      this.latestState = { ...this.latestState, config: snapshotConfig(initialConfig) };
    }

    panel.webview.options = { enableScripts: true };

    // Listen for commands and settings updates from the webview
    panel.webview.onDidReceiveMessage(async (msg: RalphWebviewCommand) => {
      if (msg.type === 'command' && msg.command) {
        this.postMessage({ type: 'command-ack', command: msg.command, status: 'started' });
        try {
          await this.configSync.whenIdle();
          await vscode.commands.executeCommand(msg.command);
          this.postMessage({ type: 'command-ack', command: msg.command, status: 'done' });
        } catch {
          this.postMessage({ type: 'command-ack', command: msg.command, status: 'error' });
        }
      }
      if (msg.type === 'update-setting') {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        await this.configSync.enqueueSettingUpdate(msg.key, msg.value);
        if (workspaceFolder) {
          const freshConfig = readConfig(workspaceFolder);
          this.latestState = { ...this.latestState, config: snapshotConfig(freshConfig) };
          // Do NOT fullRender() here — the user's input already shows the new
          // value; a full HTML replace would destroy focus and cursor position.
          // The updated latestState will be picked up by the next natural render.
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
        artifactDir: iter.artifactDir,
        agentId: iter.agentId
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
      agentLanes: this.getLanes(),
      config: config ? snapshotConfig(config) : null
    };

    this.fullRender();
  }

  public updateFromBroadcast(event: RalphBroadcastEvent): void {
    this.handleBroadcast(event);
  }

  private getLanes(): RalphAgentLaneState[] {
    return Array.from(this.agentLanesMap.entries()).map(([agentId, lane]) => ({
      agentId,
      phase: lane.phase,
      iteration: lane.iteration
    }));
  }

  private handleBroadcast(event: RalphBroadcastEvent): void {
    switch (event.type) {
      case 'phase': {
        const laneKey = event.agentId ?? 'default';
        this.agentLanesMap.set(laneKey, { phase: event.phase, iteration: event.iteration });
        this.latestState = { ...this.latestState, agentLanes: this.getLanes() };
        this.postMessage({ type: 'phase', phase: event.phase, iteration: event.iteration, agentId: event.agentId });
        break;
      }
      case 'loop-start':
        this.latestState = { ...this.latestState, loopState: 'running', iterationCap: event.iterationCap };
        this.fullRender();
        break;
      case 'iteration-start': {
        const laneKey = event.agentId ?? 'default';
        this.agentLanesMap.set(laneKey, { phase: 'inspect', iteration: event.iteration });
        this.latestState = {
          ...this.latestState,
          loopState: 'running',
          agentLanes: this.getLanes()
        };
        this.fullRender();
        break;
      }
      case 'iteration-end': {
        const laneKey = event.agentId ?? 'default';
        this.agentLanesMap.delete(laneKey);
        this.latestState = {
          ...this.latestState,
          agentLanes: this.getLanes()
        };
        this.fullRender();
        break;
      }
      case 'loop-end':
        this.agentLanesMap.clear();
        this.latestState = {
          ...this.latestState,
          loopState: event.stopReason ? 'stopped' : 'idle',
          agentLanes: []
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
