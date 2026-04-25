import { RalphAgentRole } from '../ralph/types';

export type CliProviderId = 'codex' | 'claude' | 'copilot' | 'copilot-byok' | 'copilot-foundry' | 'azure-foundry' | 'gemini';

export type CodexHandoffMode = 'ideCommand' | 'clipboard' | 'cliExec';

export type CodexApprovalMode = 'never' | 'on-request' | 'untrusted';

export type CodexSandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access';

export type CodexReasoningEffort = 'medium' | 'high';

export type ClaudePermissionMode = 'dangerously-skip-permissions' | 'default';
export type GeminiPermissionMode = 'yolo' | 'default';
export type CopilotApprovalMode = 'allow-all' | 'allow-tools-only' | 'interactive';

export type RalphVerifierMode = 'validationCommand' | 'gitDiff' | 'taskState';

export type RalphGitCheckpointMode = 'off' | 'snapshot' | 'snapshotAndDiff';
export type RalphScmStrategy = 'none' | 'commit-on-done' | 'branch-per-task';

export type PromptBudgetProfile = 'codex' | 'claude' | 'custom';

export type CustomPromptBudget = Partial<Record<string, number>>;

export type AutoApplyRemediationAction = 'decompose_task' | 'mark_blocked';

export type RalphAutonomyMode = 'supervised' | 'autonomous';

export type PromptCachingMode = 'auto' | 'force' | 'off';

export type MemoryStrategy = 'verbatim' | 'sliding-window' | 'summary';

export type FailureDiagnosticsMode = 'auto' | 'off';

export type PlanningPassMode = 'dedicated' | 'inline';

export interface RalphPlanningPassConfig {
  /** Enable the pre-execution planning pass. Default: false. */
  enabled: boolean;
  /** Planning pass mode. 'inline': implementer runs planning turn itself; 'dedicated': separate planner agent writes task-plan.json. Default: 'inline'. */
  mode: PlanningPassMode;
}

/**
 * Per-tier model + optional provider override.
 * When `provider` is omitted the workspace's default `cliProvider` is used.
 */
export interface RalphModelTierConfig {
  /** CLI provider for this tier. Omit to use the workspace default. */
  provider?: CliProviderId;
  /** Model identifier passed to the CLI via --model. */
  model: string;
}

/**
 * Maps task-complexity tiers to model + provider pairs.
 * Adopted from Ruflo's smart task-routing pattern: simple tasks use cheaper/faster
 * models while complex or repeatedly-failing tasks escalate to more capable models.
 * Only active when `modelTiering.enabled` is true.
 *
 * Each tier can optionally specify a different CLI provider, enabling cross-provider
 * routing (e.g. copilot for simple tasks, claude for medium/complex).
 */
export interface RalphModelTieringConfig {
  /** Enable complexity-based model selection. Default: true. */
  enabled: boolean;
  /** Tier config for low-complexity tasks (score < simpleThreshold). */
  simple: RalphModelTierConfig;
  /** Tier config for medium-complexity tasks (score between thresholds). */
  medium: RalphModelTierConfig;
  /** Tier config for high-complexity tasks (score >= complexThreshold). */
  complex: RalphModelTierConfig;
  /** Complexity score below which the simple tier is selected. Default: 3. */
  simpleThreshold: number;
  /** Complexity score at or above which the complex tier is selected. Default: 6. */
  complexThreshold: number;
}

/**
 * Shell commands run at key iteration lifecycle points.
 * Adopted from Ruflo's hook system. Each value is a shell command string.
 * Hook failures are logged but never stop the loop.
 * Available env vars: RALPH_TASK_ID, RALPH_OUTCOME, RALPH_STOP_REASON, RALPH_AGENT_ID.
 */
export interface RalphHooksConfig {
  /** Run before a CLI iteration executes. */
  beforeIteration?: string;
  /** Run after a CLI iteration completes (regardless of outcome). */
  afterIteration?: string;
  /** Run when a task transitions to done. */
  onTaskComplete?: string;
  /** Run when the loop stops for any reason. */
  onStop?: string;
  /** Run when an iteration fails (executionStatus === 'failed'). */
  onFailure?: string;
}

export type AzureAuthMode = 'az-bearer' | 'env-api-key' | 'vscode-secret';

export interface AzureAuthConfig {
  mode: AzureAuthMode;
  tenantId: string;
  subscriptionId: string;
  apiKeyEnvVar: string;
  secretStorageKey: string;
}

export type CopilotByokProviderType = 'azure' | 'openai' | 'anthropic';

export interface CopilotByokConfig {
  commandPath: string;
  providerType: CopilotByokProviderType;
  baseUrlOverride: string;
  model: string;
  azure: {
    resourceName: string;
    deployment: string;
  };
  offline: boolean;
  requiredApiKeyEnvVar: string;
  approvalMode: CopilotApprovalMode;
  maxAutopilotContinues: number;
}

export interface AzureFoundryConfig {
  commandPath: string;
  endpointUrl: string;
  modelDeployment: string;
  apiVersion: string;
  auth: AzureAuthConfig;
}

export interface RalphCodexConfig {
  cliProvider: CliProviderId;
  codexCommandPath: string;
  claudeCommandPath: string;
  copilotCommandPath: string;
  geminiCommandPath: string;
  copilotFoundry: CopilotByokConfig;
  azureFoundry: AzureFoundryConfig;
  claudeMaxTurns: number;
  copilotMaxAutopilotContinues: number;
  claudePermissionMode: ClaudePermissionMode;
  copilotApprovalMode: CopilotApprovalMode;
  agentId: string;
  agentRole: RalphAgentRole;
  preferredHandoffMode: CodexHandoffMode;
  inspectionRootOverride: string;
  ralphIterationCap: number;
  verifierModes: RalphVerifierMode[];
  noProgressThreshold: number;
  repeatedFailureThreshold: number;
  artifactRetentionPath: string;
  generatedArtifactRetentionCount: number;
  provenanceBundleRetentionCount: number;
  gitCheckpointMode: RalphGitCheckpointMode;
  scmStrategy: RalphScmStrategy;
  scmPrOnParentDone: boolean;
  watchdogStaleTtlMs: number;
  validationCommandOverride: string;
  stopOnHumanReviewNeeded: boolean;
  autonomyMode: RalphAutonomyMode;
  autoReplenishBacklog: boolean;
  autoApplyRemediation: AutoApplyRemediationAction[];
  ralphTaskFilePath: string;
  prdPath: string;
  progressPath: string;
  structureDefinitionPath: string;
  promptTemplateDirectory: string;
  promptIncludeVerifierFeedback: boolean;
  promptPriorContextBudget: number;
  promptBudgetProfile: PromptBudgetProfile;
  customPromptBudget: CustomPromptBudget;
  clipboardAutoCopy: boolean;
  model: string;
  reasoningEffort: CodexReasoningEffort;
  approvalMode: CodexApprovalMode;
  sandboxMode: CodexSandboxMode;
  openSidebarCommandId: string;
  newChatCommandId: string;
  claimTtlHours: number;
  staleLockThresholdMinutes: number;
  agentCount: number;
  modelTiering: RalphModelTieringConfig;
  hooks: RalphHooksConfig;
  autoWatchdogOnStall: boolean;
  autoReviewOnParentDone: boolean;
  autoReviewOnLoopComplete: boolean;
  autoScmOnConflict: boolean;
  scmConflictRetryLimit: number;
  cliExecutionTimeoutMs: number;
  promptCaching: PromptCachingMode;
  memoryStrategy: MemoryStrategy;
  memoryWindowSize: number;
  memorySummaryThreshold: number;
  prdGenerationTemplate: string;
  planningPass: RalphPlanningPassConfig;
  failureDiagnostics: FailureDiagnosticsMode;
  maxRecoveryAttempts: number;
  maxReplansPerParent: number;
  maxGeneratedChildren: number;
}
