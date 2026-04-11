import type { WorkspaceScan } from '../services/workspaceInspection';

export type RalphTaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done';

export interface RalphTaskSourceLocation {
  arrayIndex: number;
  line: number;
  column: number;
}

export type RalphTaskPriority = 'low' | 'normal' | 'high';

export type RalphTaskMode = 'default' | 'documentation';

export type RalphTaskTier = 'simple' | 'medium' | 'complex';

export interface RalphTask {
  id: string;
  title: string;
  status: RalphTaskStatus;
  parentId?: string;
  dependsOn?: string[];
  notes?: string;
  validation?: string;
  blocker?: string;
  /** Optional priority hint. Higher-priority tasks are selected first when multiple tasks are actionable. Defaults to 'normal'. */
  priority?: RalphTaskPriority;
  /** Task execution mode. 'documentation' relaxes code-centric verification gates. Defaults to 'default'. */
  mode?: RalphTaskMode;
  /** Static complexity tier override. When set, selectModelForTask uses this directly instead of heuristic scoring. */
  tier?: RalphTaskTier;
  /** Concrete done-criteria: the task is complete when every item in this list is satisfied. */
  acceptance?: string[];
  /** Per-task guardrails: things the agent must not do while working on this task. */
  constraints?: string[];
  /** Pointers to relevant files or modules so the agent knows where to look first. */
  context?: string[];
  source?: RalphTaskSourceLocation;
}

export interface RalphTaskFile {
  version: 2;
  tasks: RalphTask[];
  /**
   * Monotonically increasing write counter.  Each locked mutation increments
   * this value so concurrent-write conflicts are distinguishable in git history
   * and post-hoc debugging does not need to rely solely on log files.
   */
  mutationCount?: number;
}

export type RalphTaskClaimStatus = 'active' | 'released' | 'stale';

export interface RalphTaskClaim {
  agentId: string;
  taskId: string;
  claimedAt: string;
  provenanceId: string;
  status: RalphTaskClaimStatus;
  baseBranch?: string;
  integrationBranch?: string;
  featureBranch?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionReason?: string;
}

export interface RalphTaskClaimFile {
  version: 1;
  claims: RalphTaskClaim[];
}

export interface RalphTaskCounts {
  todo: number;
  in_progress: number;
  blocked: number;
  done: number;
}

export type RalphPreflightCategory =
  | 'taskGraph'
  | 'claimGraph'
  | 'workspaceRuntime'
  | 'codexAdapter'
  | 'validationVerifier'
  | 'agentHealth';

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
  activeClaimSummary?: string;
  diagnostics: RalphPreflightDiagnostic[];
}

export interface RalphPersistedPreflightReport {
  schemaVersion: 1;
  kind: 'preflight';
  agentId?: string;
  provenanceId: string;
  iteration: number;
  promptKind: RalphPromptKind;
  promptTarget: RalphPromptTarget;
  trustLevel: RalphProvenanceTrustLevel;
  ready: boolean;
  summary: string;
  activeClaimSummary?: string;
  selectedTaskId: string | null;
  selectedTaskTitle: string | null;
  taskValidationHint: string | null;
  effectiveValidationCommand: string | null;
  normalizedValidationCommandFrom: string | null;
  validationCommand: string | null;
  artifactDir: string;
  reportPath: string;
  summaryPath: string | null;
  blocked: boolean;
  createdAt: string;
  diagnostics: RalphPreflightDiagnostic[];
  sessionHandoff?: RalphPromptSessionHandoff | null;
}

export type RalphPromptKind =
  | 'bootstrap'
  | 'iteration'
  | 'replenish-backlog'
  | 'fix-failure'
  | 'continue-progress'
  | 'human-review-handoff';
export type RalphAgentRole = 'build' | 'review' | 'watchdog' | 'scm' | 'planner' | 'implementer' | 'reviewer';
export type RalphPromptTarget = 'cliExec' | 'ideHandoff';
export type RalphRunMode = 'handoff' | 'singleExec' | 'loop';
export type RalphRunStatus = 'succeeded' | 'failed';
export type RalphExecutionStatus = 'succeeded' | 'failed' | 'skipped';
export type RalphVerificationStatus = 'passed' | 'failed' | 'skipped';
export type RalphProvenanceTrustLevel = 'verifiedCliExecution' | 'preparedPromptOnly';
export type RalphProvenanceBundleStatus = 'prepared' | 'executed' | 'blocked';
export type RalphIntegrityFailureStage = 'executionPlanHash' | 'promptArtifactHash' | 'stdinPayloadHash';
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
  | 'control_plane_reload_required'
  | 'claim_contested'
  | 'repeated_no_progress'
  | 'repeated_identical_failure'
  | 'human_review_needed'
  | 'execution_failed'
  | 'no_actionable_task'
  | 'cancelled';
export type RalphVerifierId = 'validationCommand' | 'gitDiff' | 'taskState';
export type RalphTaskRemediationAction =
  | 'decompose_task'
  | 'reframe_task'
  | 'mark_blocked'
  | 'request_human_review'
  | 'no_action';

export const DEFAULT_RALPH_AGENT_ID = 'default';

export interface RalphTaskRemediation {
  trigger: RalphStopReason;
  taskId: string | null;
  attemptCount: number;
  action: RalphTaskRemediationAction;
  humanReviewRecommended: boolean;
  summary: string;
  evidence: string[];
}

export interface RalphTaskRemediationHistoryEntry {
  iteration: number;
  completionClassification: RalphCompletionClassification;
  executionStatus: RalphExecutionStatus;
  verificationStatus: RalphVerificationStatus;
  stopReason: RalphStopReason | null;
  summary: string;
  validationFailureSignature: string | null;
  noProgressSignals: string[];
}

export interface RalphSuggestedTaskDependency {
  taskId: string;
  reason: 'blocks_sequence' | 'inherits_parent_dependency';
}

export interface RalphSuggestedChildTask {
  id: string;
  title: string;
  parentId: string;
  dependsOn: RalphSuggestedTaskDependency[];
  validation: string | null;
  rationale: string;
  acceptance?: string[];
  constraints?: string[];
  context?: string[];
  tier?: RalphTaskTier;
}

export interface RalphTaskRemediationArtifact {
  schemaVersion: 1;
  kind: 'taskRemediation';
  provenanceId: string | null;
  iteration: number;
  selectedTaskId: string | null;
  selectedTaskTitle: string | null;
  trigger: RalphStopReason;
  attemptCount: number;
  action: RalphTaskRemediationAction;
  humanReviewRecommended: boolean;
  summary: string;
  rationale: string;
  proposedAction: string;
  evidence: string[];
  triggeringHistory: RalphTaskRemediationHistoryEntry[];
  suggestedChildTasks: RalphSuggestedChildTask[];
  artifactDir: string;
  iterationResultPath: string;
  createdAt: string;
}

export interface RalphRunRecord {
  agentId?: string;
  provenanceId?: string;
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

export interface PromptCacheStats {
  /** Byte length of the static prefix sent with cache_control to the provider. */
  staticPrefixBytes: number;
  /** Whether the provider reported a cache hit; null if the provider did not report cache usage. */
  cacheHit: boolean | null;
}

export interface RalphMemoryObservability {
  memoryStrategy: string;
  historyDepth: number;
  windowedEntryCount: number;
  summaryGenerationCost: boolean;
}

export interface RalphPromptEvidence {
  schemaVersion: 1;
  provenanceId?: string;
  iteration: number;
  kind: RalphPromptKind;
  target: RalphPromptTarget;
  templatePath: string;
  selectionReason: string;
  selectedTaskId: string | null;
  taskValidationHint: string | null;
  effectiveValidationCommand: string | null;
  normalizedValidationCommandFrom: string | null;
  validationCommand: string | null;
  promptByteLength?: number;
  promptCacheStats?: PromptCacheStats;
  memoryObservability?: RalphMemoryObservability;
  promptBudget?: {
    policyName: string;
    budgetMode: 'within_budget' | 'trimmed';
    targetTokens: number;
    minimumContextBias: string;
    estimatedTokens: number;
    withinTarget: boolean;
    budgetDeltaTokens: number;
    estimatedTokenRange: {
      min: number;
      max: number;
    };
    requiredSections: string[];
    optionalSections: string[];
    omissionOrder: string[];
    selectedSections: string[];
    omittedSections: string[];
  };
  inputs: {
    rootPolicy: RalphRootPolicy;
    strategyContext: string[];
    preflightContext: string[];
    objectiveContext: string;
    repoContext: string[];
    repoContextSnapshot: WorkspaceScan;
    runtimeContext: string[];
    taskContext: string[];
    progressContext: string[];
    priorIterationContext: string[];
    operatingRules: string[];
    executionContract: string[];
    finalResponseContract: string[];
  };
}

export interface RalphRootPolicy {
  workspaceRootPath: string;
  inspectionRootPath: string;
  executionRootPath: string;
  verificationRootPath: string;
  selectionStrategy: WorkspaceScan['rootSelection']['strategy'];
  selectionSummary: string;
  policySummary: string;
}

export interface RalphExecutionPlan {
  schemaVersion: 1;
  kind: 'executionPlan';
  agentId?: string;
  provenanceId: string;
  iteration: number;
  selectedTaskId: string | null;
  selectedTaskTitle: string | null;
  taskValidationHint: string | null;
  effectiveValidationCommand: string | null;
  normalizedValidationCommandFrom: string | null;
  promptKind: RalphPromptKind;
  promptTarget: RalphPromptTarget;
  selectionReason: string;
  rootPolicy: RalphRootPolicy;
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
  agentId?: string;
  provenanceId: string;
  iteration: number;
  commandPath: string;
  args: string[];
  reasoningEffort?: string | null;
  workspaceRoot: string;
  rootPolicy: RalphRootPolicy;
  promptArtifactPath: string;
  promptHash: string;
  promptByteLength: number;
  stdinHash: string;
  transcriptPath: string;
  lastMessagePath: string;
  createdAt: string;
}

export interface RalphExecutionIntegritySummary {
  provenanceId?: string;
  promptTarget: RalphPromptTarget;
  rootPolicy: RalphRootPolicy | null;
  templatePath: string;
  reasoningEffort?: string | null;
  taskValidationHint: string | null;
  effectiveValidationCommand: string | null;
  normalizedValidationCommandFrom: string | null;
  executionPlanPath: string;
  executionPlanHash?: string;
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
  taskValidationHint: string | null;
  effectiveValidationCommand: string | null;
  normalizedValidationCommandFrom: string | null;
  primaryCommand: string | null;
  validationFailureSignature: string | null;
  verifiers: RalphVerificationResult[];
}

export interface RalphIterationExecutionSummary {
  exitCode: number | null;
  message?: string;
  transcriptPath?: string;
  lastMessagePath?: string;
  stdoutPath?: string;
  stderrPath?: string;
}

export interface RalphIterationBacklogSummary {
  remainingTaskCount: number;
  actionableTaskAvailable: boolean;
}

export type RalphCompletionReportRequestedStatus = 'done' | 'blocked' | 'in_progress';

export type RalphWatchdogActionType = 'resolve_stale_claim' | 'decompose_task' | 'escalate_to_human';
export type RalphWatchdogActionSeverity = 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface RalphWatchdogAction {
  taskId: string;
  agentId: string;
  action: RalphWatchdogActionType;
  severity: RalphWatchdogActionSeverity;
  reason: string;
  evidence: string;
  trailingNoProgressCount: number;
  trailingRepeatedFailureCount: number;
  suggestedChildTasks?: RalphSuggestedChildTask[];
}

export interface RalphCompletionReport {
  selectedTaskId: string;
  requestedStatus: RalphCompletionReportRequestedStatus;
  progressNote?: string;
  blocker?: string;
  validationRan?: string;
  needsHumanReview?: boolean;
  suggestedChildTasks?: RalphSuggestedChildTask[];
  watchdog_actions?: RalphWatchdogAction[];
}

export type RalphCompletionReportStatus = 'applied' | 'rejected' | 'missing' | 'invalid';

export interface RalphHandoffNote {
  agentId: string;
  iteration: number;
  selectedTaskId: string | null;
  selectedTaskTitle: string | null;
  stopReason: RalphStopReason | 'verification_passed_no_remaining_subtasks';
  completionClassification: RalphCompletionClassification;
  progressNote?: string;
  pendingBlocker?: string;
  validationFailureSignature?: string;
  backlog?: RalphIterationBacklogSummary;
  humanSummary: string;
}

export interface RalphPromptSessionHandoff {
  agentId: string;
  iteration: number;
  selectedTaskId: string | null;
  selectedTaskTitle: string | null;
  stopReason: RalphStopReason | 'verification_passed_no_remaining_subtasks';
  completionClassification: RalphCompletionClassification;
  humanSummary: string;
  pendingBlocker: string | null;
  validationFailureSignature: string | null;
  remainingTaskCount: number | null;
}

export interface RalphIterationResult {
  schemaVersion: 1;
  agentId?: string;
  provenanceId?: string;
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
  remediation: RalphTaskRemediation | null;
  completionReportStatus?: RalphCompletionReportStatus;
  reconciliationWarnings?: string[];
  stopReason: RalphStopReason | null;
}

export interface RalphIntegrityFailure {
  schemaVersion: 1;
  kind: 'integrityFailure';
  provenanceId: string;
  iteration: number;
  promptKind: RalphPromptKind;
  promptTarget: RalphPromptTarget;
  trustLevel: RalphProvenanceTrustLevel;
  stage: RalphIntegrityFailureStage;
  blocked: true;
  summary: string;
  message: string;
  artifactDir: string;
  executionPlanPath: string | null;
  promptArtifactPath: string | null;
  cliInvocationPath: string | null;
  expectedExecutionPlanHash: string | null;
  actualExecutionPlanHash: string | null;
  expectedPromptHash: string | null;
  actualPromptHash: string | null;
  expectedPayloadHash: string | null;
  actualPayloadHash: string | null;
  createdAt: string;
}

export interface RalphProvenanceBundle {
  schemaVersion: 1;
  kind: 'provenanceBundle';
  agentId?: string;
  provenanceId: string;
  iteration: number;
  promptKind: RalphPromptKind;
  promptTarget: RalphPromptTarget;
  trustLevel: RalphProvenanceTrustLevel;
  status: RalphProvenanceBundleStatus;
  summary: string;
  rootPolicy: RalphRootPolicy;
  selectedTaskId: string | null;
  selectedTaskTitle: string | null;
  artifactDir: string;
  bundleDir: string;
  preflightReportPath: string;
  preflightSummaryPath: string;
  promptArtifactPath: string | null;
  promptEvidencePath: string | null;
  executionPlanPath: string | null;
  executionPlanHash: string | null;
  cliInvocationPath: string | null;
  iterationResultPath: string | null;
  executionSummaryPath?: string | null;
  verifierSummaryPath?: string | null;
  completionReportStatus?: RalphCompletionReportStatus | null;
  reconciliationWarnings?: string[] | null;
  completionReportPath?: string | null;
  epistemicGap?: RalphProvenanceEpistemicGap;
  provenanceFailurePath: string | null;
  provenanceFailureSummaryPath: string | null;
  promptHash: string | null;
  promptByteLength: number | null;
  executionPayloadHash: string | null;
  executionPayloadMatched: boolean | null;
  mismatchReason: string | null;
  promptCacheStats?: PromptCacheStats | null;
  memoryObservability?: RalphMemoryObservability | null;
  createdAt: string;
  updatedAt: string;
}

export interface RalphProvenanceEpistemicGap {
  trustBoundary: string;
  bundleProves: string;
  bundleDoesNotProve: string;
  modelClaimsPath: string | null;
  modelClaimsStatus: RalphCompletionReportStatus | null;
  modelClaimsAreUnverified: boolean;
  verifierEvidencePaths: string[];
  verifierEvidenceIsAuthoritative: boolean;
  reconciliationWarnings: string[];
  noWarningsMeans: string;
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
