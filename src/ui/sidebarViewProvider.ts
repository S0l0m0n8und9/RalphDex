import * as vscode from 'vscode';
import { readConfig } from '../config/readConfig';
import type { RalphCodexConfig } from '../config/types';
import type { RalphTaskFile } from '../ralph/types';
import type { IterationBroadcaster } from './iterationBroadcaster';
import { buildDashboardHtml } from './sidebarHtml';
import type { RalphWatchedState } from './stateWatcher';
import type {
  RalphDashboardConfigSnapshot,
  RalphDashboardTask,
} from './uiTypes';
import { DashboardHost } from '../webview/dashboardHost';

/**
 * Provides the sidebar webview launcher for Ralphdex.
 * Registered as a WebviewViewProvider for the `ralphCodex.dashboard` view.
 *
 * State assembly, broadcast handling, and message wiring are delegated to
 * {@link DashboardHost} so the sidebar and the editor-panel share one
 * implementation.
 */
export class RalphSidebarViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'ralphCodex.dashboard';

  private host: DashboardHost | undefined;

  public constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly broadcaster: IterationBroadcaster
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    webviewView.webview.options = { enableScripts: true };

    // Dispose any previous host before creating a new one (VS Code may call
    // resolveWebviewView again if the view is hidden and re-shown).
    this.host?.dispose();
    this.host = new DashboardHost(webviewView.webview, this.broadcaster, buildDashboardHtml);

    webviewView.onDidDispose(() => {
      this.host?.dispose();
      this.host = undefined;
    });
  }

  public updateFromWatchedState(watched: RalphWatchedState): void {
    this.host?.updateFromWatchedState(watched);
  }

  public dispose(): void {
    this.host?.dispose();
  }
}

// ---------------------------------------------------------------------------
// Helpers (exported for reuse by DashboardHost and tests)
// ---------------------------------------------------------------------------

export function defaultDashboardState(): import('./uiTypes').RalphDashboardState {
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
