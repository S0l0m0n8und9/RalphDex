import type {
  RalphCompletionClassification,
  RalphStopReason,
  RalphTaskCounts,
  RalphTaskStatus,
} from '../ralph/types';
import type { SettingsSurfaceSnapshot } from '../config/settingsSurface';
import type { DashboardSnapshot } from '../webview/dashboardSnapshot';

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

export interface RalphAgentLaneState {
  agentId: string;
  phase: RalphIterationPhase | null;
  iteration: number | null;
  message?: string;
}

export interface RalphPhaseEvent {
  type: 'phase';
  iteration: number;
  phase: RalphIterationPhase;
  timestamp: string;
  agentId?: string;
  message?: string;
}

export interface RalphIterationStartEvent {
  type: 'iteration-start';
  iteration: number;
  iterationCap: number;
  selectedTaskId: string | null;
  selectedTaskTitle: string | null;
  agentId?: string;
}

export interface RalphIterationEndEvent {
  type: 'iteration-end';
  iteration: number;
  classification: RalphCompletionClassification;
  stopReason: RalphStopReason | null;
  agentId?: string;
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
  agentId?: string;
  selectedModel?: string;
  effectiveTier?: string;
}

export interface RalphDashboardViewIntent {
  activeTab?: 'overview' | 'work' | 'diagnostics' | 'orchestration' | 'settings';
  focusSettingKey?: string;
  newSettingKeys?: string[];
}

export type RalphDashboardSnapshotPhase = 'idle' | 'loading' | 'refreshing' | 'ready' | 'error';

export interface RalphDashboardSnapshotStatus {
  phase: RalphDashboardSnapshotPhase;
  errorMessage: string | null;
}

export type RalphDashboardTaskSeedingPhase = 'idle' | 'submitting' | 'success' | 'error';

export interface RalphDashboardTaskSeedingState {
  phase: RalphDashboardTaskSeedingPhase;
  requestText: string;
  createdTaskCount: number | null;
  message: string | null;
  artifactPath: string | null;
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
  agentLanes: RalphAgentLaneState[];
  settingsSurface: SettingsSurfaceSnapshot | null;
  dashboardSnapshot: DashboardSnapshot | null;
  snapshotStatus: RalphDashboardSnapshotStatus;
  taskSeeding: RalphDashboardTaskSeedingState;
  viewIntent: RalphDashboardViewIntent | null;
  prdExists: boolean;
}

/** Messages sent from extension to webview. */
export type RalphWebviewMessage =
  | { type: 'state'; state: RalphDashboardState }
  | { type: 'phase'; phase: RalphIterationPhase; iteration: number; agentId?: string; message?: string }
  | { type: 'command-ack'; command: string; status: 'started' | 'done' | 'error' }
  | {
      type: 'seed-tasks-result';
      status: 'started' | 'done' | 'error';
      source: 'panel' | 'sidebar';
      createdTaskCount?: number;
      artifactPath?: string;
      message?: string;
    };

/** Messages sent from webview to extension. */
export type RalphWebviewCommand =
  | { type: 'command'; command: string }
  | { type: 'expand-task'; taskId: string }
  | { type: 'update-setting'; key: string; value: unknown }
  | { type: 'open-iteration-artifact'; artifactDir: string }
  | { type: 'seed-tasks'; requestText: string; source: 'panel' | 'sidebar' };
