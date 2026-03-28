import type {
  RalphCompletionClassification,
  RalphIterationResult,
  RalphStopReason,
  RalphTask,
  RalphTaskCounts,
  RalphTaskStatus,
  RalphWorkspaceState
} from '../ralph/types';

// ---------------------------------------------------------------------------
// Status bar
// ---------------------------------------------------------------------------

export type RalphUiLoopState = 'idle' | 'running' | 'stopped';

export interface RalphStatusBarState {
  loopState: RalphUiLoopState;
  currentIteration: number;
  iterationCap: number;
  selectedTaskId: string | null;
  selectedTaskTitle: string | null;
  lastClassification: RalphCompletionClassification | null;
  stopReason: RalphStopReason | null;
}

// ---------------------------------------------------------------------------
// Iteration broadcaster (phase-by-phase feedback)
// ---------------------------------------------------------------------------

export type RalphIterationPhase =
  | 'inspect'
  | 'select'
  | 'prompt'
  | 'execute'
  | 'verify'
  | 'classify'
  | 'persist';

export interface RalphPhaseEvent {
  type: 'phase';
  iteration: number;
  phase: RalphIterationPhase;
  timestamp: string;
}

export interface RalphIterationStartEvent {
  type: 'iteration-start';
  iteration: number;
  iterationCap: number;
  selectedTaskId: string | null;
  selectedTaskTitle: string | null;
}

export interface RalphIterationEndEvent {
  type: 'iteration-end';
  iteration: number;
  classification: RalphCompletionClassification;
  stopReason: RalphStopReason | null;
}

export interface RalphLoopStartEvent {
  type: 'loop-start';
  iterationCap: number;
}

export interface RalphLoopEndEvent {
  type: 'loop-end';
  totalIterations: number;
  stopReason: RalphStopReason | null;
}

export type RalphBroadcastEvent =
  | RalphPhaseEvent
  | RalphIterationStartEvent
  | RalphIterationEndEvent
  | RalphLoopStartEvent
  | RalphLoopEndEvent;

// ---------------------------------------------------------------------------
// Sidebar webview messages (extension → webview)
// ---------------------------------------------------------------------------

export interface RalphDashboardTask {
  id: string;
  title: string;
  status: RalphTaskStatus;
  isCurrent: boolean;
  priority: string;
  parentId?: string;
  notes?: string;
  blocker?: string;
  validation?: string;
  childIds: string[];
  dependsOn: string[];
}

export interface RalphDashboardIteration {
  iteration: number;
  taskId: string | null;
  taskTitle: string | null;
  classification: RalphCompletionClassification;
  stopReason: RalphStopReason | null;
  artifactDir: string;
}

export interface RalphDashboardState {
  workspaceName: string;
  loopState: RalphUiLoopState;
  agentRole: string;
  nextIteration: number;
  iterationCap: number;
  taskCounts: RalphTaskCounts | null;
  tasks: RalphDashboardTask[];
  recentIterations: RalphDashboardIteration[];
  preflightReady: boolean;
  preflightSummary: string;
  diagnostics: Array<{ severity: string; message: string }>;
  currentPhase: RalphIterationPhase | null;
  currentIteration: number | null;
}

/** Messages sent from extension to webview. */
export type RalphWebviewMessage =
  | { type: 'state'; state: RalphDashboardState }
  | { type: 'phase'; phase: RalphIterationPhase; iteration: number };

/** Messages sent from webview to extension. */
export type RalphWebviewCommand =
  | { type: 'command'; command: string }
  | { type: 'expand-task'; taskId: string };
