import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { parseTaskFile, selectNextTask } from '../ralph/taskFile';
import type { RalphTaskFile, RalphWorkspaceState } from '../ralph/types';

export interface RalphWatchedState {
  taskFile: RalphTaskFile | null;
  workspaceState: RalphWorkspaceState | null;
  selectedTaskId: string | null;
}

/**
 * Watches `.ralph/tasks.json`, claim/dead-letter state, and compact per-task
 * artifacts for changes, reads the core state files, and fires a typed event
 * with the combined state.
 * Debounces at 300ms to avoid thrashing during rapid writes.
 */
export class RalphStateWatcher implements vscode.Disposable {
  private readonly _onStateChange = new vscode.EventEmitter<RalphWatchedState>();
  public readonly onStateChange: vscode.Event<RalphWatchedState> = this._onStateChange.event;

  private readonly watchers: vscode.FileSystemWatcher[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly ralphDir: string;

  public constructor(private readonly workspaceRoot: string) {
    this.ralphDir = path.join(workspaceRoot, '.ralph');

    const statePattern = new vscode.RelativePattern(this.ralphDir, '{tasks.json,state.json,claims.json,dead-letter.json}');
    const artifactPattern = new vscode.RelativePattern(this.ralphDir, 'artifacts/**/{task-plan.json,failure-analysis.json,recovery-state.json}');
    const orchestrationPattern = new vscode.RelativePattern(this.ralphDir, '{orchestration/**/*.json,artifacts/**/{human-gate-*.json,replan-*.json,plan-graph.json}}');

    for (const pattern of [statePattern, artifactPattern, orchestrationPattern]) {
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);
      watcher.onDidChange(() => this.scheduleRefresh());
      watcher.onDidCreate(() => this.scheduleRefresh());
      watcher.onDidDelete(() => this.scheduleRefresh());
      this.watchers.push(watcher);
    }
  }

  private scheduleRefresh(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.refresh();
    }, 300);
  }

  public async refresh(): Promise<RalphWatchedState> {
    const state = await readWatchedState(this.ralphDir);
    this._onStateChange.fire(state);
    return state;
  }

  public dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    for (const watcher of this.watchers) {
      watcher.dispose();
    }
    this._onStateChange.dispose();
  }
}

async function readWatchedState(ralphDir: string): Promise<RalphWatchedState> {
  let taskFile: RalphTaskFile | null = null;
  let workspaceState: RalphWorkspaceState | null = null;
  let selectedTaskId: string | null = null;

  try {
    const taskText = await fs.readFile(path.join(ralphDir, 'tasks.json'), 'utf8');
    taskFile = parseTaskFile(taskText);
    const selected = selectNextTask(taskFile);
    selectedTaskId = selected?.id ?? null;
  } catch {
    // tasks.json missing or invalid — leave null
  }

  try {
    const stateText = await fs.readFile(path.join(ralphDir, 'state.json'), 'utf8');
    const parsed = JSON.parse(stateText);
    if (parsed && typeof parsed === 'object' && parsed.version === 2) {
      workspaceState = parsed as RalphWorkspaceState;
    }
  } catch {
    // state.json missing or invalid — leave null
  }

  return { taskFile, workspaceState, selectedTaskId };
}
