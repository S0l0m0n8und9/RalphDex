import * as vscode from 'vscode';
import { readConfig } from '../config/readConfig';
import { buildSettingsSurfaceSnapshot } from '../config/settingsSurface';
import type { RalphCodexConfig } from '../config/types';
import type { RalphTaskFile } from '../ralph/types';
import type { IterationBroadcaster } from './iterationBroadcaster';
import { buildDashboardHtml } from './sidebarHtml';
import type { RalphWatchedState } from './stateWatcher';
import type {
  RalphDashboardTask,
} from './uiTypes';
import { DashboardHost } from '../webview/dashboardHost';
import type { DashboardSnapshotLoader } from '../webview/dashboardDataLoader';

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
    private readonly broadcaster: IterationBroadcaster,
    private readonly loadSnapshot?: DashboardSnapshotLoader
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
    this.host = new DashboardHost(webviewView.webview, this.broadcaster, buildDashboardHtml, this.loadSnapshot);

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
    settingsSurface: null,
    dashboardSnapshot: null,
    snapshotStatus: { phase: 'idle', errorMessage: null },
    viewIntent: null
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

export function snapshotConfig(
  config: RalphCodexConfig,
  options?: {
    newSettingKeys?: string[];
  }
) {
  return buildSettingsSurfaceSnapshot(config, options);
}
