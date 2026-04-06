import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { readConfig } from '../config/readConfig';
import type { RalphCodexConfig } from '../config/types';
import type { RalphTaskFile } from '../ralph/types';
import type { IterationBroadcaster } from './iterationBroadcaster';
import { buildDashboardHtml } from './sidebarHtml';
import type { RalphWatchedState } from './stateWatcher';
import type {
  RalphAgentLaneState,
  RalphDashboardConfigSnapshot,
  RalphDashboardIteration,
  RalphDashboardState,
  RalphDashboardTask,
  RalphIterationPhase,
  RalphWebviewCommand,
  RalphWebviewMessage
} from './uiTypes';

/**
 * Provides the sidebar webview launcher for Ralph Codex.
 * Registered as a WebviewViewProvider for the `ralphCodex.dashboard` view.
 */
export class RalphSidebarViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'ralphCodex.dashboard';

  private view: vscode.WebviewView | undefined;
  private latestState: RalphDashboardState;
  private agentLanesMap = new Map<string, { phase: RalphIterationPhase; iteration: number }>();
  private broadcastDisposable: vscode.Disposable | undefined;
  private lastRenderTime = 0;

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

    // Listen for commands from the webview — with ack feedback
    webviewView.webview.onDidReceiveMessage(async (msg: RalphWebviewCommand) => {
      if (msg.type === 'command' && msg.command) {
        this.postMessage({ type: 'command-ack', command: msg.command, status: 'started' });
        try {
          await vscode.commands.executeCommand(msg.command);
          this.postMessage({ type: 'command-ack', command: msg.command, status: 'done' });
        } catch {
          this.postMessage({ type: 'command-ack', command: msg.command, status: 'error' });
        }
      }
    });

    // Listen for broadcast events
    this.broadcastDisposable?.dispose();
    this.broadcastDisposable = this.broadcaster.onEvent((event) => {
      switch (event.type) {
        case 'phase': {
          const laneKey = event.agentId ?? 'default';
          this.agentLanesMap.set(laneKey, { phase: event.phase, iteration: event.iteration });
          // Send lightweight phase update (no full re-render)
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
          this.latestState = { ...this.latestState, agentLanes: this.getLanes() };
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

  private getLanes(): RalphAgentLaneState[] {
    return Array.from(this.agentLanesMap.entries()).map(([agentId, lane]) => ({
      agentId,
      phase: lane.phase,
      iteration: lane.iteration
    }));
  }

  private fullRender(): void {
    if (!this.view) {
      return;
    }
    // Debounce: skip renders within 100ms of last render
    const now = Date.now();
    if (now - this.lastRenderTime < 100) {
      return;
    }
    this.lastRenderTime = now;

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
// Helpers (exported for reuse by dashboard panel)
// ---------------------------------------------------------------------------

export function defaultDashboardState(): RalphDashboardState {
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
    agentLanes: [],
    config: null
  };
}

export function buildDashboardTasks(taskFile: RalphTaskFile | null, selectedTaskId: string | null): RalphDashboardTask[] {
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

export function countTasks(taskFile: RalphTaskFile): { todo: number; in_progress: number; blocked: number; done: number } {
  const counts = { todo: 0, in_progress: 0, blocked: 0, done: 0 };
  for (const task of taskFile.tasks) {
    if (task.status in counts) {
      counts[task.status as keyof typeof counts]++;
    }
  }
  return counts;
}

export function snapshotConfig(config: RalphCodexConfig): RalphDashboardConfigSnapshot {
  return {
    cliProvider: config.cliProvider,
    model: config.model,
    agentRole: config.agentRole,
    agentId: config.agentId,
    agentCount: config.agentCount,
    autonomyMode: config.autonomyMode,
    ralphIterationCap: config.ralphIterationCap,
    preferredHandoffMode: config.preferredHandoffMode,
    claudeMaxTurns: config.claudeMaxTurns,
    claudePermissionMode: config.claudePermissionMode,
    copilotApprovalMode: config.copilotApprovalMode,
    copilotMaxAutopilotContinues: config.copilotMaxAutopilotContinues,
    reasoningEffort: config.reasoningEffort,
    approvalMode: config.approvalMode,
    sandboxMode: config.sandboxMode,
    scmStrategy: config.scmStrategy,
    gitCheckpointMode: config.gitCheckpointMode,
    noProgressThreshold: config.noProgressThreshold,
    repeatedFailureThreshold: config.repeatedFailureThreshold,
    stopOnHumanReviewNeeded: config.stopOnHumanReviewNeeded,
    clipboardAutoCopy: config.clipboardAutoCopy,
    autoReplenishBacklog: config.autoReplenishBacklog,
    autoReloadOnControlPlaneChange: config.autoReloadOnControlPlaneChange,
    promptBudgetProfile: config.promptBudgetProfile,
    codexCommandPath: config.codexCommandPath,
    claudeCommandPath: config.claudeCommandPath,
    copilotCommandPath: config.copilotCommandPath,
    inspectionRootOverride: config.inspectionRootOverride,
    artifactRetentionPath: config.artifactRetentionPath,
    ralphTaskFilePath: config.ralphTaskFilePath,
    prdPath: config.prdPath,
    progressPath: config.progressPath,
    promptTemplateDirectory: config.promptTemplateDirectory,
    generatedArtifactRetentionCount: config.generatedArtifactRetentionCount,
    provenanceBundleRetentionCount: config.provenanceBundleRetentionCount,
    watchdogStaleTtlMs: config.watchdogStaleTtlMs,
    claimTtlHours: config.claimTtlHours,
    staleLockThresholdMinutes: config.staleLockThresholdMinutes,
    promptPriorContextBudget: config.promptPriorContextBudget,
    scmPrOnParentDone: config.scmPrOnParentDone,
    promptIncludeVerifierFeedback: config.promptIncludeVerifierFeedback,
    validationCommandOverride: config.validationCommandOverride,
    verifierModes: [...config.verifierModes],
    autoApplyRemediation: [...config.autoApplyRemediation],
    customPromptBudget: { ...config.customPromptBudget },
    modelTiering: {
      enabled: config.modelTiering.enabled,
      simple: { ...config.modelTiering.simple },
      medium: { ...config.modelTiering.medium },
      complex: { ...config.modelTiering.complex },
      simpleThreshold: config.modelTiering.simpleThreshold,
      complexThreshold: config.modelTiering.complexThreshold
    },
    hooks: { ...config.hooks },
    openSidebarCommandId: config.openSidebarCommandId,
    newChatCommandId: config.newChatCommandId
  };
}
