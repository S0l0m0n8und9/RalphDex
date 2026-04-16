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

export type FailureCategoryId = 'transient' | 'implementation_error' | 'task_ambiguity' | 'validation_mismatch' | 'dependency_missing' | 'environment_issue';

/**
 * Canonical normalized task shape.
 *
 * Every task entering the in-memory graph — whether parsed from `tasks.json`,
 * converted from a {@link RalphSuggestedChildTask}, or built by pipeline
 * construction — passes through `normalizeTask` (src/ralph/taskFile.ts).
 * Producers creating new tasks should use `normalizeNewTask`
 * (src/ralph/taskNormalization.ts) which adds alias mapping, dependency
 * flattening, parent augmentation, and default status before delegating
 * to `normalizeTask`.
 *
 * Each optional field follows one of three presence categories:
 * - **preserve-source** — kept as the producer supplied it; never synthesized.
 * - **derive-if-possible** — parent/context may derive it during decomposition
 *   or pipeline construction, but source-parsing never invents a value.
 * - **leave-absent** — omitted unless the producer explicitly sets it.
 *
 * Full field-presence rules, coercion invariants, and producer entry points:
 * see docs/invariants.md § Normalized Task Contract.
 */
export interface RalphTask {
  /** Required. Non-empty, trimmed. Uniquely identifies the task in the graph. */
  id: string;
  /** Required. Non-empty, trimmed. Human-readable summary of the task. */
  title: string;
  /** Required. One of 'todo', 'in_progress', 'blocked', 'done'. */
  status: RalphTaskStatus;
  /** preserve-source. Links this task to its parent in the task graph. */
  parentId?: string;
  /** derive-if-possible. Prerequisite task IDs. Deduplicated via Set after trim; empty array becomes undefined. */
  dependsOn?: string[];
  /** derive-if-possible. Free-form notes. Decomposition maps `rationale` → `notes`. */
  notes?: string;
  /** derive-if-possible. Verification command or instruction. Decomposition inherits from parent. `null` from suggestions becomes `undefined`. */
  validation?: string;
  /** leave-absent. Describes why the task is blocked. Only set when status is 'blocked'. */
  blocker?: string;
  /** leave-absent. Higher-priority tasks are selected first when multiple tasks are actionable. Absent treated as 'normal' for ordering. */
  priority?: RalphTaskPriority;
  /** derive-if-possible. 'documentation' relaxes code-centric verification gates. Absent treated as 'default'. Decomposition inherits from parent. */
  mode?: RalphTaskMode;
  /** derive-if-possible. When set, selectModelForTask uses this directly instead of heuristic scoring. Decomposition inherits from parent. */
  tier?: RalphTaskTier;
  /** derive-if-possible. Concrete done-criteria: the task is complete when every item is satisfied. Empty array becomes undefined. */
  acceptance?: string[];
  /** leave-absent. Per-task guardrails: things the agent must not do while working on this task. */
  constraints?: string[];
  /** leave-absent. Pointers to relevant files or modules so the agent knows where to look first. */
  context?: string[];
  /** leave-absent. Write-risk labels for fan-out wave safety validation. Tasks sharing a label cannot run in the same wave. */
  writeRiskLabels?: string[];
  /** leave-absent. Last verifier outcome recorded during reconciliation. */
  lastVerifierResult?: 'passed' | 'failed' | 'skipped';
  /** leave-absent. Last reconciliation warning snippet when a conflict was detected. */
  lastReconciliationWarning?: string;
  /** preserve-source. Parser-injected diagnostic location. Not persisted to disk; stripped during serialization. */
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
  | 'policy_violation'
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

/**
 * Dependency reference within a {@link RalphSuggestedChildTask} proposal.
 *
 * Only `taskId` is persisted to the resulting `RalphTask.dependsOn` array.
 * The `reason` field is diagnostic-only — used in proposal reporting but
 * not stored in the task graph.
 *
 * See docs/invariants.md § Normalized Task Contract — Producer-Facing Type.
 */
export interface RalphSuggestedTaskDependency {
  /** Task ID of the dependency target. Persisted to `RalphTask.dependsOn`. */
  taskId: string;
  /** Diagnostic classification. Not persisted. */
  reason: 'blocks_sequence' | 'inherits_parent_dependency';
}

/**
 * Producer-facing shape for proposing new child tasks during decomposition or remediation.
 *
 * When applied via `applySuggestedChildTasks`, these suggestions are converted to persisted
 * `RalphTask` entries with the following mapping:
 * - `status` is forced to `'todo'`
 * - `rationale` maps to `notes`
 * - `validation: null` becomes `undefined`
 * - `mode` is inherited from the parent task, not from the suggestion
 * - `dependsOn` entries are flattened to `taskId` strings
 *
 * See docs/invariants.md § Normalized Task Contract for the full field-presence contract.
 */
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

export type RalphSummarizationMode = 'provider_exec' | 'fallback_summary';

export interface RalphMemoryObservability {
  memoryStrategy: string;
  historyDepth: number;
  windowedEntryCount: number;
  summaryGenerationCost: boolean;
  /** Indicates whether summarization was performed by the active provider or fell back to a static summary. */
  summarizationMode?: RalphSummarizationMode | null;
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
    taskPlanContext?: string[];
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

export type RalphReviewOutcome = 'approved' | 'changes_required';

export interface RalphCompletionReport {
  selectedTaskId: string;
  requestedStatus: RalphCompletionReportRequestedStatus;
  progressNote?: string;
  blocker?: string;
  validationRan?: string;
  needsHumanReview?: boolean;
  suggestedChildTasks?: RalphSuggestedChildTask[];
  watchdog_actions?: RalphWatchdogAction[];
  /** Planning-layer: plan text produced by a planner agent. */
  proposedPlan?: string;
  /** Planning-layer: outcome reported by a reviewer agent. */
  reviewOutcome?: RalphReviewOutcome;
  /** Planning-layer: reviewer notes accompanying reviewOutcome. */
  reviewNotes?: string;
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
  selectedModel?: string;
  effectiveTier?: string;
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
  /** Provider-reported execution cost in USD for the main agent invocation; null when the provider did not report it. */
  executionCostUsd?: number | null;
  /** Token count for the failure-diagnostic invocation that preceded this bundle, if one ran. */
  diagnosticCost?: number | null;
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

// ---------------------------------------------------------------------------
// Orchestration graph + supervisor ledger (PRD item 20, Phase 1)
// ---------------------------------------------------------------------------

export type OrchestrationNodeKind =
  | 'task_exec'
  | 'review'
  | 'verify_gate'
  | 'human_gate'
  | 'handoff'
  | 'fanout'
  | 'fanin'
  | 'replan'
  | 'scm_submit';

export type OrchestrationEvidenceKind =
  | 'verifier_outcome'
  | 'claim_status'
  | 'operator_action';

export interface OrchestrationEvidenceRef {
  kind: OrchestrationEvidenceKind;
  /** Path or identifier pointing to the evidence artifact. */
  ref: string;
  /** Short human-readable summary of the evidence. */
  summary: string;
}

export interface OrchestrationEdge {
  from: string;
  to: string;
  /** Guards that must be satisfied to traverse this edge. Empty array is invalid. */
  evidenceRequired: OrchestrationEvidenceRef[];
}

export interface OrchestrationNode {
  id: string;
  kind: OrchestrationNodeKind;
  /** Human-readable label for display surfaces. */
  label: string;
  /** Optional agent role assigned to execute this node. */
  assignedRole?: RalphAgentRole;
  /** Optional pointer to a task ID in the task graph. */
  taskId?: string;
}

export interface OrchestrationGraph {
  schemaVersion: 1;
  runId: string;
  entryNodeId: string;
  /** Persisted to `.ralph/orchestration/<runId>/graph.json`. */
  nodes: OrchestrationNode[];
  /** Persisted edge list with evidence references required for each transition. */
  edges: OrchestrationEdge[];
  createdAt: string;
}

export type OrchestrationNodeOutcome = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface OrchestrationNodeState {
  nodeId: string;
  outcome: OrchestrationNodeOutcome;
  /** Evidence collected when the node completed (or failed). Empty when pending/running. */
  evidence: OrchestrationEvidenceRef[];
  startedAt: string | null;
  finishedAt: string | null;
}

export interface OrchestrationState {
  schemaVersion: 1;
  runId: string;
  /** The node ID the supervisor will evaluate next. Null when the graph is complete or has no remaining transitions. */
  cursor: string | null;
  /** Per-node outcomes and timestamps persisted to `.ralph/orchestration/<runId>/state.json`. */
  nodeStates: OrchestrationNodeState[];
  updatedAt: string;
}

/**
 * Durable execution span for a single orchestration node.
 * Persisted to `.ralph/orchestration/<runId>/node-<nodeId>-span.json`.
 * Each span records timing, agent assignment, artifact references, and stop
 * classification so every node execution is individually inspectable and
 * resumable without reading the full state file.
 */
export interface OrchestrationNodeSpan {
  nodeId: string;
  runId: string;
  startedAt: string;
  finishedAt: string;
  /** Optional agent identifier assigned to execute this node. */
  agentId?: string;
  /** Optional agent role (e.g. 'implementer', 'reviewer') for this node. */
  agentRole?: string;
  /** Paths or identifiers for artifacts consumed as input by this node. */
  inputRefs: string[];
  /** Paths or identifiers for artifacts produced as output by this node. */
  outputRefs: string[];
  /** Optional classification of why this node stopped (e.g. 'completed', 'failed', 'blocked'). */
  stopClassification?: string;
}

// ---------------------------------------------------------------------------
// Handoff contract (PRD item 21, Phase 1)
// ---------------------------------------------------------------------------

export type RalphHandoffStatus =
  | 'proposed'
  | 'accepted'
  | 'rejected'
  | 'expired'
  | 'superseded'
  | 'contested';

export interface RalphHandoffHistoryEntry {
  at: string;
  from: RalphHandoffStatus;
  to: RalphHandoffStatus;
  reason: string;
}

/**
 * Durable handoff contract for role-to-role delegation.
 *
 * A handoff record turns implicit prompt carryover into evidence-backed state.
 * Each handoff is persisted to `.ralph/handoffs/<handoffId>.json` with atomic
 * write semantics so interrupted sessions can resume without hidden runtime
 * memory.
 */
export interface RalphHandoff {
  handoffId: string;
  fromAgentId: string;
  toRole: RalphAgentRole;
  taskId: string;
  objective: string;
  constraints: string[];
  acceptedEvidence: OrchestrationEvidenceRef[];
  expectedOutputContract: string;
  stopConditions: string[];
  createdAt: string;
  expiresAt: string;
  provenanceLinks: string[];
  status: RalphHandoffStatus;
  /** Append-only status transition history. */
  history: RalphHandoffHistoryEntry[];
}

// ---------------------------------------------------------------------------
// Role policy map (PRD item 22, Phase 1)
// ---------------------------------------------------------------------------

/**
 * Capabilities and constraints for a single agent role within the orchestration
 * control plane. Governs which node kinds the role may execute, which task
 * state transitions it may request, and whether a human gate is required before
 * execution proceeds.
 */
export interface RolePolicy {
  role: RalphAgentRole;
  /** Node kinds this role is permitted to produce. */
  allowedNodeKinds: OrchestrationNodeKind[];
  /** Allowed task-state mutation strings (e.g. 'todo→in_progress'). */
  allowedTaskStateMutations: string[];
  /** Verifier gate identifiers that must pass before the role's output is accepted. */
  requiredVerifierGates: string[];
  /** When true, a human_gate node is required before the role's output is committed. */
  humanGateRequired: boolean;
}

/** Complete policy map covering every {@link RalphAgentRole}. */
export type RolePolicyMap = Record<RalphAgentRole, RolePolicy>;

// ---------------------------------------------------------------------------
// Context envelope (PRD item 22, Phase 1)
// ---------------------------------------------------------------------------

/**
 * Snapshot of which artifacts were exposed or withheld from a specific agent
 * role during an iteration, together with the source of the applied policy.
 */
export interface ContextEnvelope {
  iterationId: string;
  agentRole: RalphAgentRole;
  /** Paths of artifacts included in the context window for this iteration. */
  exposedArtifacts: string[];
  /** Artifacts withheld, with a machine-readable reason for each omission. */
  omittedArtifacts: { path: string; reason: string }[];
  /** How the active policy was determined. */
  policySource: 'preset' | 'crew' | 'explicit';
}

// ---------------------------------------------------------------------------
// Plan graph (PRD item 23)
// ---------------------------------------------------------------------------

export type ExecutionWaveStatus = 'pending' | 'launched' | 'completed' | 'blocked';

export interface ExecutionWave {
  waveIndex: number;
  memberTaskIds: string[];
  launchGuards: string[];
  fanInCriteria: string[];
  status: ExecutionWaveStatus;
}

export type FanInMemberOutcome = 'done' | 'blocked' | 'failed';

export interface FanInRecord {
  waveIndex: number;
  memberOutcomes: Record<string, FanInMemberOutcome>;
  fanInResult: 'passed' | 'failed';
  fanInErrors: string[];
  evaluatedAt: string;
}

export interface PlanGraph {
  parentTaskId: string;
  waves: ExecutionWave[];
  createdAt: string;
  fanInRecord?: FanInRecord;
  /** Number of adaptive re-plan passes executed for this parent. Defaults to 0. */
  replanCount?: number;
}

// ---------------------------------------------------------------------------
// Human gate artifacts
// ---------------------------------------------------------------------------

export type HumanGateType = 'scope_expansion' | 'dependency_rewiring' | 'contested_fan_in_scm';

/**
 * Written to `<artifactRootDir>/<parentTaskId>/human-gate-<type>.json` whenever
 * a human choke point fires. The `approveHumanReview` command deletes this file
 * to signal approval and allow the supervisor to resume.
 */
export interface HumanGateArtifact {
  gateType: HumanGateType;
  triggerReason: string;
  affectedTaskIds: string[];
  requiredApprovalCommand: 'ralphCodex.approveHumanReview';
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Re-plan decision artifact
// ---------------------------------------------------------------------------

export type ReplanTriggerKind =
  | 'consecutive_verifier_mismatches'
  | 'systemic_failure_alert'
  | 'unresolved_merge_conflict';

/**
 * Durable record of one adaptive re-plan decision written alongside plan-graph.json.
 *
 * Written to `<artifactRootDir>/<parentTaskId>/replan-<replanIndex>.json` whenever
 * executeReplanNode applies new waves. Survives generated-artifact retention cleanup
 * because it lives in a `<parentTaskId>/` directory, not an `iteration-NNN/` directory.
 */
export interface ReplanDecisionArtifact {
  schemaVersion: 1;
  kind: 'replanDecision';
  parentTaskId: string;
  replanIndex: number;
  triggerEvidenceClass: ReplanTriggerKind[];
  triggerDetails: string;
  rejectedAlternatives: string[];
  chosenMutation: string;
  taskGraphDiff: {
    addedTaskIds: string[];
    removedTaskIds: string[];
    modifiedTaskIds: string[];
  };
  createdAt: string;
}
