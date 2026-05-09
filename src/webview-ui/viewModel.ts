import type { RalphDashboardState, RalphDashboardTask } from '../ui/uiTypes';

export type WebviewReadinessKind = 'missing-prd' | 'empty-backlog' | 'blocked' | 'ready' | 'running';

export interface WebviewUiCommand {
  command: string;
  label: string;
  variant?: 'primary' | 'danger';
  disabled?: boolean;
}

export interface WebviewReadinessModel {
  kind: WebviewReadinessKind;
  title: string;
  detail: string;
}

export interface WebviewUiModel {
  readiness: WebviewReadinessModel;
  primaryCommands: WebviewUiCommand[];
  secondaryCommands: WebviewUiCommand[];
  exposedCommandIds: Set<string>;
  taskTotal: number;
  doneCount: number;
  currentTask: RalphDashboardTask | null;
}

function taskTotal(state: RalphDashboardState): number {
  if (state.taskCounts) {
    return state.taskCounts.todo + state.taskCounts.in_progress + state.taskCounts.blocked + state.taskCounts.done;
  }
  return state.tasks.length;
}

function currentTask(state: RalphDashboardState): RalphDashboardTask | null {
  return state.tasks.find((task) => task.isCurrent) ?? state.tasks.find((task) => task.status !== 'done') ?? state.tasks[0] ?? null;
}

export type DashboardMode = 'simple' | 'standard' | 'advanced';

export function getWebviewUiModel(state: RalphDashboardState): WebviewUiModel {
  const total = taskTotal(state);
  const doneCount = state.taskCounts?.done ?? state.tasks.filter((task) => task.status === 'done').length;
  let readiness: WebviewReadinessModel;
  let primaryCommands: WebviewUiCommand[];

  if (state.loopState === 'running') {
    readiness = {
      kind: 'running',
      title: 'Loop running',
      detail: `Iteration ${state.nextIteration} of ${state.iterationCap}`
    };
    primaryCommands = [{ command: 'ralphCodex.stopLoop', label: 'Stop Loop', variant: 'danger' }];
  } else if (!state.prdExists) {
    readiness = {
      kind: 'missing-prd',
      title: 'Setup Required',
      detail: 'Create a PRD before running RalphDex.'
    };
    primaryCommands = [{ command: 'ralphCodex.openPrdWizard', label: 'Open PRD Wizard', variant: 'primary' }];
  } else if (total === 0) {
    readiness = {
      kind: 'empty-backlog',
      title: 'Backlog Required',
      detail: 'Open the PRD wizard to complete readiness and generate tasks.'
    };
    primaryCommands = [{ command: 'ralphCodex.openPrdWizard', label: 'Review PRD Readiness', variant: 'primary' }];
  } else if (!state.preflightReady) {
    readiness = {
      kind: 'blocked',
      title: 'Readiness Blocked',
      detail: state.preflightSummary || 'Resolve readiness blockers before starting a run.'
    };
    primaryCommands = [{ command: 'ralphCodex.openSettings', label: 'Open Settings', variant: 'primary' }];
  } else {
    readiness = {
      kind: 'ready',
      title: 'Ready to run',
      detail: `${doneCount}/${total} tasks complete`
    };
    primaryCommands = [
      { command: 'ralphCodex.runRalphLoop', label: 'Run Loop', variant: 'primary' },
      { command: 'ralphCodex.runPipeline', label: 'Run Full Workflow' },
      { command: 'ralphCodex.runRalphIteration', label: 'Run Iteration' }
    ];
  }

  const secondaryCommands: WebviewUiCommand[] = [
    { command: 'ralphCodex.openDashboard', label: 'Open Dashboard' },
    { command: 'ralphCodex.showRalphStatus', label: 'Show Status' },
    { command: 'ralphCodex.openLatestPipelineRun', label: 'Latest Run Report' }
  ];
  const exposedCommandIds = new Set([...primaryCommands, ...secondaryCommands].map((command) => command.command));

  return {
    readiness,
    primaryCommands,
    secondaryCommands,
    exposedCommandIds,
    taskTotal: total,
    doneCount,
    currentTask: currentTask(state)
  };
}
