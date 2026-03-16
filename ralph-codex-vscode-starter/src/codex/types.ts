import { CodexApprovalMode, CodexReasoningEffort, CodexSandboxMode } from '../config/types';
import { RalphPromptKind } from '../ralph/types';

export type CodexStrategyId = 'ideCommand' | 'clipboard' | 'cliExec' | 'claudeCode';

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
  executionRoot: string;
  prompt: string;
  promptPath: string;
  promptHash: string;
  promptByteLength: number;
  transcriptPath: string;
  lastMessagePath: string;
  model: string;
  reasoningEffort: CodexReasoningEffort;
  sandboxMode: CodexSandboxMode;
  approvalMode: CodexApprovalMode;
  onStdoutChunk?: (chunk: string) => void;
  onStderrChunk?: (chunk: string) => void;
}

export interface CodexExecResult extends CodexActionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  args: string[];
  stdinHash: string;
  transcriptPath: string;
  lastMessagePath: string;
  lastMessage: string;
}

export interface CodexStrategy {
  readonly id: CodexStrategyId;
  handoffPrompt?(request: PromptHandoffRequest): Promise<CodexActionResult>;
  runExec?(request: CodexExecRequest): Promise<CodexExecResult>;
}
