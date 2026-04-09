import * as vscode from 'vscode';
import type { RalphBroadcastEvent, RalphStatusBarState, RalphUiLoopState } from './uiTypes';
import type { RalphWatchedState } from './stateWatcher';

const STATUS_ICONS: Record<RalphUiLoopState, string> = {
  idle: '$(terminal)',
  running: '$(sync~spin)',
  stopped: '$(primitive-square)'
};

const STATE_GLYPHS: Record<RalphUiLoopState, string> = {
  idle: '●',
  running: '▸',
  stopped: '■'
};

/**
 * Persistent status bar item that shows Ralph's current loop state.
 * Click opens a quick-pick of common actions.
 */
export class RalphStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private state: RalphStatusBarState;

  public constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.command = 'ralphCodex.statusBarQuickPick';
    this.state = {
      loopState: 'idle',
      currentIteration: 0,
      iterationCap: 0,
      selectedTaskId: null,
      selectedTaskTitle: null,
      lastClassification: null,
      stopReason: null
    };
    this.render();
    this.item.show();
  }

  public updateFromWatchedState(watched: RalphWatchedState): void {
    if (this.state.loopState === 'running') {
      // Don't overwrite running state from file changes
      return;
    }
    const ws = watched.workspaceState;
    this.state = {
      ...this.state,
      selectedTaskId: watched.selectedTaskId,
      selectedTaskTitle: watched.taskFile?.tasks.find((t) => t.id === watched.selectedTaskId)?.title ?? null,
      currentIteration: ws?.nextIteration ? ws.nextIteration - 1 : 0,
      lastClassification: ws?.lastIteration?.completionClassification ?? null,
      stopReason: ws?.lastIteration?.stopReason ?? null,
      loopState: ws?.lastIteration?.stopReason ? 'stopped' : 'idle'
    };
    this.render();
  }

  public updateFromBroadcast(event: RalphBroadcastEvent): void {
    switch (event.type) {
      case 'loop-start':
        this.state = {
          ...this.state,
          loopState: 'running',
          iterationCap: event.iterationCap,
          stopReason: null
        };
        break;
      case 'iteration-start':
        this.state = {
          ...this.state,
          loopState: 'running',
          currentIteration: event.iteration,
          iterationCap: event.iterationCap,
          selectedTaskId: event.selectedTaskId,
          selectedTaskTitle: event.selectedTaskTitle
        };
        break;
      case 'iteration-end':
        this.state = {
          ...this.state,
          lastClassification: event.classification,
          stopReason: event.stopReason
        };
        break;
      case 'loop-end':
        this.state = {
          ...this.state,
          loopState: event.stopReason ? 'stopped' : 'idle',
          stopReason: event.stopReason
        };
        break;
    }
    this.render();
  }

  private render(): void {
    const icon = STATUS_ICONS[this.state.loopState];
    const glyph = STATE_GLYPHS[this.state.loopState];

    switch (this.state.loopState) {
      case 'running': {
        const taskLabel = this.state.selectedTaskId ? ` — ${this.state.selectedTaskId}` : '';
        this.item.text = `${icon} Ralph ${glyph} iter ${this.state.currentIteration}/${this.state.iterationCap}${taskLabel}`;
        break;
      }
      case 'stopped': {
        const reason = this.state.stopReason
          ? this.state.stopReason.replace(/_/g, ' ')
          : 'done';
        this.item.text = `${icon} Ralph ${glyph} ${reason}`;
        break;
      }
      default:
        this.item.text = `${icon} Ralph ${glyph} idle`;
    }

    const tooltipLines = ['Ralph Codex Workbench'];
    if (this.state.selectedTaskTitle) {
      tooltipLines.push(`Task: ${this.state.selectedTaskTitle}`);
    }
    if (this.state.lastClassification) {
      tooltipLines.push(`Last: ${this.state.lastClassification}`);
    }
    this.item.tooltip = tooltipLines.join('\n');
  }

  public dispose(): void {
    this.item.dispose();
  }
}

/** Quick-pick menu shown when clicking the status bar item. */
export async function showStatusBarQuickPick(): Promise<void> {
  const items: Array<vscode.QuickPickItem & { commandId: string }> = [
    { label: '$(play) Run Loop', description: 'Start the Ralph iteration loop', commandId: 'ralphCodex.runRalphLoop' },
    { label: '$(debug-step-into) Run Iteration', description: 'Run a single CLI iteration', commandId: 'ralphCodex.runRalphIteration' },
    { label: '$(info) Show Status', description: 'Full status report', commandId: 'ralphCodex.showRalphStatus' },
    { label: '$(edit) Prepare Prompt', description: 'Generate the next prompt', commandId: 'ralphCodex.generatePrompt' },
    { label: '$(terminal) Open Codex IDE', description: 'Hand off to Codex IDE', commandId: 'ralphCodex.openCodexAndCopyPrompt' },
    { label: '$(layout-sidebar-left) Dashboard', description: 'Open the Ralph dashboard', commandId: 'ralphCodex.openDashboard' }
  ];

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: 'Ralph Codex — pick an action'
  });

  if (picked) {
    await vscode.commands.executeCommand(picked.commandId);
  }
}
