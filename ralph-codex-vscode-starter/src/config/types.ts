export type CodexHandoffMode = 'ideCommand' | 'clipboard' | 'cliExec';

export type CodexApprovalMode = 'never' | 'on-request' | 'untrusted';

export type CodexSandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access';

export type RalphVerifierMode = 'validationCommand' | 'gitDiff' | 'taskState';

export type RalphGitCheckpointMode = 'off' | 'snapshot' | 'snapshotAndDiff';

export interface RalphCodexConfig {
  codexCommandPath: string;
  preferredHandoffMode: CodexHandoffMode;
  ralphIterationCap: number;
  verifierModes: RalphVerifierMode[];
  noProgressThreshold: number;
  repeatedFailureThreshold: number;
  artifactRetentionPath: string;
  gitCheckpointMode: RalphGitCheckpointMode;
  validationCommandOverride: string;
  stopOnHumanReviewNeeded: boolean;
  ralphTaskFilePath: string;
  prdPath: string;
  progressPath: string;
  clipboardAutoCopy: boolean;
  model: string;
  approvalMode: CodexApprovalMode;
  sandboxMode: CodexSandboxMode;
  openSidebarCommandId: string;
  newChatCommandId: string;
}
