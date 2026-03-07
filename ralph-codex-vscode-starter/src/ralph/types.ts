export type RalphTaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done';

export interface RalphTaskSourceLocation {
  arrayIndex: number;
  line: number;
  column: number;
}

export interface RalphTask {
  id: string;
  title: string;
  status: RalphTaskStatus;
  parentId?: string;
  dependsOn?: string[];
  notes?: string;
  validation?: string;
  blocker?: string;
  source?: RalphTaskSourceLocation;
}

export interface RalphTaskFile {
  version: 2;
  tasks: RalphTask[];
}

export interface RalphTaskCounts {
  todo: number;
  in_progress: number;
  blocked: number;
  done: number;
}

export type RalphPreflightCategory =
  | 'taskGraph'
  | 'workspaceRuntime'
  | 'codexAdapter'
  | 'validationVerifier';

export type RalphPreflightSeverity = 'error' | 'warning' | 'info';

export interface RalphPreflightDiagnostic {
  category: RalphPreflightCategory;
  severity: RalphPreflightSeverity;
  code: string;
  message: string;
  taskId?: string;
  relatedTaskIds?: string[];
  location?: RalphTaskSourceLocation;
  relatedLocations?: RalphTaskSourceLocation[];
}

export type RalphValidationCommandReadinessStatus =
  | 'missing'
  | 'selected'
  | 'executableConfirmed'
  | 'executableNotConfirmed';

export interface RalphValidationCommandReadiness {
  command: string | null;
  status: RalphValidationCommandReadinessStatus;
  executable: string | null;
}

export interface RalphPreflightReport {
  ready: boolean;
  summary: string;
  diagnostics: RalphPreflightDiagnostic[];
}

export interface RalphPersistedPreflightReport {
  schemaVersion: 1;
  kind: 'preflight';
  iteration: number;
  promptKind: RalphPromptKind;
  ready: boolean;
  summary: string;
  selectedTaskId: string | null;
  selectedTaskTitle: string | null;
  validationCommand: string | null;
  artifactDir: string;
  reportPath: string;
  summaryPath: string | null;
  blocked: boolean;
  createdAt: string;
  diagnostics: RalphPreflightDiagnostic[];
}

export type RalphPromptKind =
  | 'bootstrap'
  | 'iteration'
  | 'fix-failure'
  | 'continue-progress'
  | 'human-review-handoff';
export type RalphPromptTarget = 'cliExec' | 'ideHandoff';
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

export interface RalphPromptEvidence {
  schemaVersion: 1;
  iteration: number;
  kind: RalphPromptKind;
  target: RalphPromptTarget;
  templatePath: string;
  selectionReason: string;
  selectedTaskId: string | null;
  validationCommand: string | null;
  inputs: {
    strategyContext: string[];
    preflightContext: string[];
    objectiveContext: string;
    repoContext: string[];
    runtimeContext: string[];
    taskContext: string[];
    progressContext: string[];
    priorIterationContext: string[];
    operatingRules: string[];
    executionContract: string[];
    finalResponseContract: string[];
  };
}

export interface RalphExecutionPlan {
  schemaVersion: 1;
  kind: 'executionPlan';
  iteration: number;
  selectedTaskId: string | null;
  selectedTaskTitle: string | null;
  promptKind: RalphPromptKind;
  promptTarget: RalphPromptTarget;
  selectionReason: string;
  templatePath: string;
  promptPath: string;
  promptArtifactPath: string;
  promptEvidencePath: string;
  promptHash: string;
  promptByteLength: number;
  artifactDir: string;
  createdAt: string;
}

export interface RalphCliInvocation {
  schemaVersion: 1;
  kind: 'cliInvocation';
  iteration: number;
  commandPath: string;
  args: string[];
  workspaceRoot: string;
  promptArtifactPath: string;
  promptHash: string;
  promptByteLength: number;
  stdinHash: string;
  transcriptPath: string;
  lastMessagePath: string;
  createdAt: string;
}

export interface RalphExecutionIntegritySummary {
  promptTarget: RalphPromptTarget;
  templatePath: string;
  executionPlanPath: string;
  promptArtifactPath: string;
  promptHash: string;
  promptByteLength: number;
  executionPayloadHash: string | null;
  executionPayloadMatched: boolean | null;
  mismatchReason: string | null;
  cliInvocationPath: string | null;
}

export interface RalphDiffSummary {
  available: boolean;
  gitAvailable: boolean;
  summary: string;
  changedFileCount: number;
  relevantChangedFileCount: number;
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

export interface RalphIterationBacklogSummary {
  remainingTaskCount: number;
  actionableTaskAvailable: boolean;
}

export interface RalphIterationResult {
  schemaVersion: 1;
  iteration: number;
  selectedTaskId: string | null;
  selectedTaskTitle: string | null;
  promptKind: RalphPromptKind;
  promptPath: string;
  artifactDir: string;
  adapterUsed: string;
  executionIntegrity: RalphExecutionIntegritySummary | null;
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
  backlog: RalphIterationBacklogSummary;
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
