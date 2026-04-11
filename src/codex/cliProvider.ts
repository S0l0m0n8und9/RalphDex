import { CodexExecRequest, CodexExecResult } from './types';

export type CliProviderId = 'codex' | 'claude' | 'copilot' | 'azure-foundry';

export interface CliLaunchSpec {
  args: string[];
  cwd: string;
  stdinText?: string;
  /** When true the command is executed inside a shell (required for .bat/.cmd on Windows). */
  shell?: boolean;
}

export interface CliProvider {
  readonly id: CliProviderId;
  buildLaunchSpec(request: CodexExecRequest, skipGitCheck: boolean): CliLaunchSpec;
  extractResponseText(stdout: string, stderr: string, lastMessagePath: string): Promise<string>;
  isIgnorableStderrLine(line: string): boolean;
  summarizeResult(input: { exitCode: number; stderr: string; lastMessage: string }): string;
  describeLaunchError(commandPath: string, error: { code?: string; message: string }): string;
  buildTranscript(result: CodexExecResult, request: CodexExecRequest): string;
  /** When present, the strategy calls this instead of spawning a child process. */
  executeDirectly?(request: CodexExecRequest): Promise<CodexExecResult>;
}
