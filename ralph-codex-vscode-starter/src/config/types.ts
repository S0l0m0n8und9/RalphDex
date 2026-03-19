export type CliProviderId = 'codex' | 'claude';

export type CodexHandoffMode = 'ideCommand' | 'clipboard' | 'cliExec';

export type CodexApprovalMode = 'never' | 'on-request' | 'untrusted';

export type CodexSandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access';

export type CodexReasoningEffort = 'medium' | 'high';

export type ClaudePermissionMode = 'dangerously-skip-permissions' | 'default';

export type RalphVerifierMode = 'validationCommand' | 'gitDiff' | 'taskState';

export type RalphGitCheckpointMode = 'off' | 'snapshot' | 'snapshotAndDiff';

export type PromptBudgetProfile = 'codex' | 'claude' | 'custom';

export type CustomPromptBudget = Partial<Record<string, number>>;

export type AutoApplyRemediationAction = 'decompose_task' | 'mark_blocked';

export type RalphAutonomyMode = 'supervised' | 'autonomous';

export interface RalphCodexConfig {
  cliProvider: CliProviderId;
  codexCommandPath: string;
  claudeCommandPath: string;
  claudeMaxTurns: number;
  claudePermissionMode: ClaudePermissionMode;
  agentId: string;
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
  validationCommandOverride: string;
  stopOnHumanReviewNeeded: boolean;
  autonomyMode: RalphAutonomyMode;
  autoReplenishBacklog: boolean;
  autoReloadOnControlPlaneChange: boolean;
  autoApplyRemediation: AutoApplyRemediationAction[];
  ralphTaskFilePath: string;
  prdPath: string;
  progressPath: string;
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
}
