export type CodexHandoffMode = 'ideCommand' | 'clipboard' | 'cliExec';

export type CodexApprovalMode = 'never' | 'on-request' | 'untrusted';

export type CodexSandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access';

export interface RalphCodexConfig {
  codexCommandPath: string;
  preferredHandoffMode: CodexHandoffMode;
  ralphIterationCap: number;
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
