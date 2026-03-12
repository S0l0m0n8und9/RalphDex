export type CodexHandoffMode = 'ideCommand' | 'clipboard' | 'cliExec';

export type CodexApprovalMode = 'never' | 'on-request' | 'untrusted';

export type CodexSandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access';

export type CodexReasoningEffort = 'medium' | 'high';

export type RalphVerifierMode = 'validationCommand' | 'gitDiff' | 'taskState';

export type RalphGitCheckpointMode = 'off' | 'snapshot' | 'snapshotAndDiff';

export interface RalphCodexConfig {
  codexCommandPath: string;
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
  ralphTaskFilePath: string;
  prdPath: string;
  progressPath: string;
  promptTemplateDirectory: string;
  promptIncludeVerifierFeedback: boolean;
  promptPriorContextBudget: number;
  clipboardAutoCopy: boolean;
  model: string;
  reasoningEffort: CodexReasoningEffort;
  approvalMode: CodexApprovalMode;
  sandboxMode: CodexSandboxMode;
  openSidebarCommandId: string;
  newChatCommandId: string;
}
