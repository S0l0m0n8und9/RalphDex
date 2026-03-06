import { CodexApprovalMode, CodexSandboxMode } from '../config/types';
import { RalphPromptKind } from '../ralph/types';

export type CodexStrategyId = 'ideCommand' | 'clipboard' | 'cliExec';

export interface CodexActionResult {
  strategy: CodexStrategyId;
  success: boolean;
  message: string;
  warnings: string[];
}

export interface PromptHandoffRequest {
  prompt: string;
  promptPath: string;
  promptKind: RalphPromptKind;
  iteration: number;
  copyToClipboard: boolean;
  openSidebarCommandId: string;
  newChatCommandId: string;
}

export interface CodexExecRequest {
  commandPath: string;
  workspaceRoot: string;
  prompt: string;
  promptPath: string;
  transcriptPath: string;
  lastMessagePath: string;
  model: string;
  sandboxMode: CodexSandboxMode;
  approvalMode: CodexApprovalMode;
  onStdoutChunk?: (chunk: string) => void;
  onStderrChunk?: (chunk: string) => void;
}

export interface CodexExecResult extends CodexActionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  transcriptPath: string;
  lastMessagePath: string;
  lastMessage: string;
}

export interface CodexStrategy {
  readonly id: CodexStrategyId;
  handoffPrompt?(request: PromptHandoffRequest): Promise<CodexActionResult>;
  runExec?(request: CodexExecRequest): Promise<CodexExecResult>;
}
