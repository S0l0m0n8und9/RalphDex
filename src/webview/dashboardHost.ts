import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { readConfig } from '../config/readConfig';
import type { IterationBroadcaster } from '../ui/iterationBroadcaster';
import type {
  RalphAgentLaneState,
  RalphBroadcastEvent,
  RalphDashboardIteration,
  RalphDashboardState,
  RalphIterationPhase,
  RalphWebviewCommand,
  RalphWebviewMessage
} from '../ui/uiTypes';
import type { RalphWatchedState } from '../ui/stateWatcher';
import {
  buildDashboardTasks,
  countTasks,
  defaultDashboardState,
  snapshotConfig
} from '../ui/sidebarViewProvider';
import { MessageBridge } from './MessageBridge';
import { WebviewConfigSync } from '../ui/webviewConfigSync';
import type { DashboardSnapshotLoader } from './dashboardDataLoader';

/**
 * Shared dashboard controller used by both the editor-panel and the sidebar.
 *
 * Owns the broadcast subscription, state assembly, MessageBridge wiring, and
 * debounced HTML render. Callers supply the webview and an HTML builder so
 * each surface can use its own layout without duplicating event-handling logic.
 */
export class DashboardHost implements vscode.Disposable {
  private latestState: RalphDashboardState;
  private agentLanesMap = new Map<string, { phase: RalphIterationPhase; iteration: number }>();
  private lastRenderTime = 0;
  private readonly configSync = new WebviewConfigSync();
  private readonly bridge: MessageBridge<RalphWebviewMessage, RalphWebviewCommand>;
  private readonly broadcastDisposable: vscode.Disposable;
  private snapshotLoadGeneration = 0;

  constructor(
    private readonly webview: vscode.Webview,
    broadcaster: IterationBroadcaster,
    private readonly renderFn: (state: RalphDashboardState, nonce: string) => string,
    private readonly loadSnapshot?: DashboardSnapshotLoader
  ) {
    this.latestState = defaultDashboardState();

    // Eagerly populate config so settings are visible on first render.
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      const initialConfig = readConfig(workspaceFolder);
      this.latestState = { ...this.latestState, config: snapshotConfig(initialConfig) };
    }

    this.bridge = new MessageBridge<RalphWebviewMessage, RalphWebviewCommand>(webview);

    this.bridge.onMessage(async (msg) => {
      if (msg.type === 'command' && msg.command) {
        this.bridge.send({ type: 'command-ack', command: msg.command, status: 'started' });
        try {
          await this.configSync.whenIdle();
          await vscode.commands.executeCommand(msg.command);
          this.bridge.send({ type: 'command-ack', command: msg.command, status: 'done' });
        } catch {
          this.bridge.send({ type: 'command-ack', command: msg.command, status: 'error' });
        }
      }
      if (msg.type === 'open-iteration-artifact') {
        await this.openIterationArtifact(msg.artifactDir);
      }
      if (msg.type === 'update-setting') {
        const wsFolder = vscode.workspace.workspaceFolders?.[0];
        await this.configSync.enqueueSettingUpdate(msg.key, msg.value);
        if (wsFolder) {
          const freshConfig = readConfig(wsFolder);
          this.latestState = { ...this.latestState, config: snapshotConfig(freshConfig) };
          // Do NOT fullRender() here — the user's input already shows the new
          // value; a full HTML replace would destroy focus and cursor position.
          // The updated latestState will be picked up by the next natural render.
        }
      }
    });

    this.broadcastDisposable = broadcaster.onEvent((event) => {
      this.handleBroadcast(event);
    });

    this.fullRender();
    void this.refreshDashboardSnapshot();
  }

  /** Updates state from file-watcher changes and triggers a full render. */
  updateFromWatchedState(watched: RalphWatchedState): void {
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
      config: config ? snapshotConfig(config) : null,
      dashboardSnapshot: this.latestState.dashboardSnapshot,
      snapshotStatus: this.latestState.snapshotStatus ?? { phase: 'idle', errorMessage: null }
    };

    this.fullRender();
    void this.refreshDashboardSnapshot();
  }

  /** Forces a fresh snapshot load and re-renders. Safe to call concurrently — uses a generation counter to drop stale results. */
  async refreshDashboardSnapshot(): Promise<void> {
    if (!this.loadSnapshot) {
      return;
    }

    const generation = ++this.snapshotLoadGeneration;
    const currentStatus = this.latestState.snapshotStatus ?? { phase: 'idle', errorMessage: null };
    const nextPhase = currentStatus.phase === 'idle' ? 'loading' : 'refreshing';

    this.latestState = {
      ...this.latestState,
      snapshotStatus: { phase: nextPhase, errorMessage: null }
    };
    this.fullRender();

    try {
      const snapshot = await this.loadSnapshot();
      if (generation !== this.snapshotLoadGeneration) {
        return;
      }
      this.latestState = {
        ...this.latestState,
        dashboardSnapshot: snapshot,
        snapshotStatus: { phase: 'ready', errorMessage: null }
      };
      this.fullRender();
    } catch (error) {
      if (generation !== this.snapshotLoadGeneration) {
        return;
      }
      this.latestState = {
        ...this.latestState,
        snapshotStatus: {
          phase: 'error',
          errorMessage: error instanceof Error ? error.message : String(error)
        }
      };
      this.fullRender();
    }
  }

  private async openIterationArtifact(artifactDir: string): Promise<void> {
    const summaryPath = path.join(artifactDir, 'summary.md');
    const preflightSummaryPath = path.join(artifactDir, 'preflight-summary.md');
    const target = (await this.pathExists(summaryPath)) ? summaryPath : (await this.pathExists(preflightSummaryPath) ? preflightSummaryPath : null);

    if (!target) {
      return;
    }

    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(target));
    await vscode.window.showTextDocument(document, { preview: false });
  }

  private async pathExists(candidate: string): Promise<boolean> {
    try {
      await fs.access(candidate);
      return true;
    } catch {
      return false;
    }
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
        this.bridge.send({ type: 'phase', phase: event.phase, iteration: event.iteration, agentId: event.agentId });
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
    // Debounce: skip renders within 100ms of last render.
    const now = Date.now();
    if (now - this.lastRenderTime < 100) {
      return;
    }
    this.lastRenderTime = now;

    const nonce = crypto.randomBytes(16).toString('hex');
    this.webview.html = this.renderFn(this.latestState, nonce);
  }

  dispose(): void {
    this.broadcastDisposable.dispose();
    this.bridge.dispose();
  }
}
