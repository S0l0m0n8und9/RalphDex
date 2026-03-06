export type RalphTaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done';

export interface RalphTask {
  id: string;
  title: string;
  status: RalphTaskStatus;
  notes?: string;
  validation?: string;
  blocker?: string;
}

export interface RalphTaskFile {
  version: 1;
  tasks: RalphTask[];
}

export interface RalphTaskCounts {
  todo: number;
  in_progress: number;
  blocked: number;
  done: number;
}

export type RalphPromptKind = 'bootstrap' | 'iteration';
export type RalphRunMode = 'handoff' | 'singleExec' | 'loop';
export type RalphRunStatus = 'succeeded' | 'failed';
export type RalphExecutionStatus = 'succeeded' | 'failed' | 'skipped';
export type RalphVerificationStatus = 'passed' | 'failed' | 'skipped';
export type RalphCompletionClassification =
  | 'complete'
  | 'partial_progress'
  | 'no_progress'
  | 'blocked'
  | 'failed'
  | 'needs_human_review';
export type RalphFollowUpAction =
  | 'stop'
  | 'continue_same_task'
  | 'continue_next_task'
  | 'retry_same_task'
  | 'request_human_review';
export type RalphStopReason =
  | 'iteration_cap_reached'
  | 'task_marked_complete'
  | 'verification_passed_no_remaining_subtasks'
  | 'repeated_no_progress'
  | 'repeated_identical_failure'
  | 'human_review_needed'
  | 'execution_failed'
  | 'no_actionable_task';
export type RalphVerifierId = 'validationCommand' | 'gitDiff' | 'taskState';

export interface RalphRunRecord {
  iteration: number;
  mode: RalphRunMode;
  promptKind: RalphPromptKind;
  startedAt: string;
  finishedAt: string;
  status: RalphRunStatus;
  exitCode: number | null;
  promptPath: string;
  transcriptPath?: string;
  lastMessagePath?: string;
  summary: string;
}

export interface RalphVerificationResult {
  verifier: RalphVerifierId;
  status: RalphVerificationStatus;
  summary: string;
  warnings: string[];
  errors: string[];
  command?: string;
  artifactPath?: string;
  failureSignature?: string | null;
  metadata?: Record<string, unknown>;
}

export interface RalphDiffSummary {
  available: boolean;
  summary: string;
  changedFiles: string[];
  relevantChangedFiles: string[];
  statusTransitions: string[];
  suggestedCheckpointRef?: string;
  beforeStatusPath?: string;
  afterStatusPath?: string;
}

export interface RalphIterationPhaseTimestamps {
  inspectStartedAt: string;
  inspectFinishedAt: string;
  taskSelectedAt: string;
  promptGeneratedAt: string;
  executionStartedAt?: string;
  executionFinishedAt?: string;
  resultCollectedAt: string;
  verificationFinishedAt: string;
  classifiedAt: string;
  persistedAt?: string;
}

export interface RalphIterationVerificationSummary {
  primaryCommand: string | null;
  validationFailureSignature: string | null;
  verifiers: RalphVerificationResult[];
}

export interface RalphIterationExecutionSummary {
  exitCode: number | null;
  transcriptPath?: string;
  lastMessagePath?: string;
  stdoutPath?: string;
  stderrPath?: string;
}

export interface RalphIterationResult {
  schemaVersion: 1;
  iteration: number;
  selectedTaskId: string | null;
  promptKind: RalphPromptKind;
  promptPath: string;
  artifactDir: string;
  adapterUsed: string;
  executionStatus: RalphExecutionStatus;
  verificationStatus: RalphVerificationStatus;
  completionClassification: RalphCompletionClassification;
  followUpAction: RalphFollowUpAction;
  startedAt: string;
  finishedAt: string;
  phaseTimestamps: RalphIterationPhaseTimestamps;
  summary: string;
  warnings: string[];
  errors: string[];
  execution: RalphIterationExecutionSummary;
  verification: RalphIterationVerificationSummary;
  diffSummary: RalphDiffSummary | null;
  noProgressSignals: string[];
  stopReason: RalphStopReason | null;
}

export interface RalphLoopDecision {
  shouldContinue: boolean;
  stopReason: RalphStopReason | null;
  message: string;
}

export interface RalphWorkspaceState {
  version: 2;
  objectivePreview: string | null;
  nextIteration: number;
  lastPromptKind: RalphPromptKind | null;
  lastPromptPath: string | null;
  lastRun: RalphRunRecord | null;
  runHistory: RalphRunRecord[];
  lastIteration: RalphIterationResult | null;
  iterationHistory: RalphIterationResult[];
  updatedAt: string;
}
