import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { readConfig } from '../config/readConfig';
import type { RalphTaskFile } from '../ralph/types';
import type { IterationBroadcaster } from './iterationBroadcaster';
import { buildDashboardHtml } from './sidebarHtml';
import type { RalphWatchedState } from './stateWatcher';
import type {
  RalphDashboardIteration,
  RalphDashboardState,
  RalphDashboardTask,
  RalphIterationPhase,
  RalphWebviewCommand,
  RalphWebviewMessage
} from './uiTypes';

/**
 * Provides the sidebar webview dashboard for Ralph Codex.
 * Registered as a WebviewViewProvider for the `ralphCodex.dashboard` view.
 */
export class RalphSidebarViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'ralphCodex.dashboard';

  private view: vscode.WebviewView | undefined;
  private latestState: RalphDashboardState;
  private currentPhase: RalphIterationPhase | null = null;
  private currentIteration: number | null = null;
  private broadcastDisposable: vscode.Disposable | undefined;

  public constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly broadcaster: IterationBroadcaster
  ) {
    this.latestState = defaultDashboardState();
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };

    // Listen for commands from the webview
    webviewView.webview.onDidReceiveMessage((msg: RalphWebviewCommand) => {
      if (msg.type === 'command' && msg.command) {
        void vscode.commands.executeCommand(msg.command);
      }
    });

    // Listen for broadcast events
    this.broadcastDisposable?.dispose();
    this.broadcastDisposable = this.broadcaster.onEvent((event) => {
      switch (event.type) {
        case 'phase':
          this.currentPhase = event.phase;
          this.currentIteration = event.iteration;
          // Send lightweight phase update (no full re-render)
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
    });

    this.fullRender();

    webviewView.onDidDispose(() => {
      this.broadcastDisposable?.dispose();
      this.broadcastDisposable = undefined;
      this.view = undefined;
    });
  }

  public updateFromWatchedState(watched: RalphWatchedState): void {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const config = workspaceFolder ? readConfig(workspaceFolder) : null;
    const ws = watched.workspaceState;

    const tasks = buildDashboardTasks(watched.taskFile, watched.selectedTaskId);
    const taskCounts = watched.taskFile
      ? countTasks(watched.taskFile)
      : null;

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
      currentIteration: this.currentIteration
    };

    this.fullRender();
  }

  private fullRender(): void {
    if (!this.view) {
      return;
    }
    const nonce = crypto.randomBytes(16).toString('hex');
    this.view.webview.html = buildDashboardHtml(this.latestState, nonce);
  }

  private postMessage(message: RalphWebviewMessage): void {
    void this.view?.webview.postMessage(message);
  }

  public dispose(): void {
    this.broadcastDisposable?.dispose();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultDashboardState(): RalphDashboardState {
  return {
    workspaceName: 'workspace',
    loopState: 'idle',
    agentRole: 'build',
    nextIteration: 1,
    iterationCap: 5,
    taskCounts: null,
    tasks: [],
    recentIterations: [],
    preflightReady: true,
    preflightSummary: 'ok',
    diagnostics: [],
    currentPhase: null,
    currentIteration: null
  };
}

function buildDashboardTasks(taskFile: RalphTaskFile | null, selectedTaskId: string | null): RalphDashboardTask[] {
  if (!taskFile) {
    return [];
  }

  const childMap = new Map<string, string[]>();
  for (const task of taskFile.tasks) {
    if (task.parentId) {
      const siblings = childMap.get(task.parentId) ?? [];
      siblings.push(task.id);
      childMap.set(task.parentId, siblings);
    }
  }

  return taskFile.tasks.map((task) => ({
    id: task.id,
    title: task.title,
    status: task.status,
    isCurrent: task.id === selectedTaskId,
    priority: task.priority ?? 'normal',
    parentId: task.parentId,
    notes: task.notes,
    blocker: task.blocker,
    validation: task.validation,
    childIds: childMap.get(task.id) ?? [],
    dependsOn: task.dependsOn ?? []
  }));
}

function countTasks(taskFile: RalphTaskFile): { todo: number; in_progress: number; blocked: number; done: number } {
  const counts = { todo: 0, in_progress: 0, blocked: 0, done: 0 };
  for (const task of taskFile.tasks) {
    if (task.status in counts) {
      counts[task.status as keyof typeof counts]++;
    }
  }
  return counts;
}
