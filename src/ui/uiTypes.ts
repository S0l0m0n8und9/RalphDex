import type {
  RalphCompletionClassification,
  RalphStopReason,
  RalphTaskCounts,
  RalphTaskStatus,
} from '../ralph/types';
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
}

export interface RalphPhaseEvent {
  type: 'phase';
  iteration: number;
  phase: RalphIterationPhase;
  timestamp: string;
  agentId?: string;
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
}

export interface RalphDashboardConfigSnapshot {
  cliProvider: string;
  model: string;
  agentRole: string;
  agentId: string;
  agentCount: number;
  autonomyMode: string;
  ralphIterationCap: number;
  preferredHandoffMode: string;
  claudeMaxTurns: number;
  claudePermissionMode: string;
  copilotApprovalMode: string;
  copilotMaxAutopilotContinues: number;
  reasoningEffort: string;
  approvalMode: string;
  sandboxMode: string;
  scmStrategy: string;
  gitCheckpointMode: string;
  noProgressThreshold: number;
  repeatedFailureThreshold: number;
  stopOnHumanReviewNeeded: boolean;
  clipboardAutoCopy: boolean;
  autoReplenishBacklog: boolean;
  autoReloadOnControlPlaneChange: boolean;
  promptBudgetProfile: string;

  // Paths
  codexCommandPath: string;
  claudeCommandPath: string;
  copilotCommandPath: string;
  inspectionRootOverride: string;
  artifactRetentionPath: string;
  ralphTaskFilePath: string;
  prdPath: string;
  progressPath: string;
  promptTemplateDirectory: string;

  // Numbers
  generatedArtifactRetentionCount: number;
  provenanceBundleRetentionCount: number;
  watchdogStaleTtlMs: number;
  claimTtlHours: number;
  staleLockThresholdMinutes: number;
  promptPriorContextBudget: number;

  // Booleans
  scmPrOnParentDone: boolean;
  promptIncludeVerifierFeedback: boolean;

  // String
  validationCommandOverride: string;

  // Multi-select arrays
  verifierModes: string[];
  autoApplyRemediation: string[];

  // Complex objects
  customPromptBudget: Partial<Record<string, number>>;
  modelTiering: {
    enabled: boolean;
    simple: { provider?: string; model: string };
    medium: { provider?: string; model: string };
    complex: { provider?: string; model: string };
    simpleThreshold: number;
    complexThreshold: number;
  };
  hooks: {
    beforeIteration?: string;
    afterIteration?: string;
    onTaskComplete?: string;
    onStop?: string;
    onFailure?: string;
  };

  // Internal/Advanced
  openSidebarCommandId: string;
  newChatCommandId: string;
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
  config: RalphDashboardConfigSnapshot | null;
  dashboardSnapshot: DashboardSnapshot | null;
}

/** Messages sent from extension to webview. */
export type RalphWebviewMessage =
  | { type: 'state'; state: RalphDashboardState }
  | { type: 'phase'; phase: RalphIterationPhase; iteration: number; agentId?: string }
  | { type: 'command-ack'; command: string; status: 'started' | 'done' | 'error' };

/** Messages sent from webview to extension. */
export type RalphWebviewCommand =
  | { type: 'command'; command: string }
  | { type: 'expand-task'; taskId: string }
  | { type: 'update-setting'; key: string; value: unknown };
