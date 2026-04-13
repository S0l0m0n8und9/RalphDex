import { CodexExecRequest, CodexExecResult } from './types';

export type CliProviderId = 'codex' | 'claude' | 'copilot' | 'copilot-foundry' | 'azure-foundry';

export interface CliLaunchSpec {
  args: string[];
  cwd: string;
  stdinText?: string;
  /** When true the command is executed inside a shell (required for .bat/.cmd on Windows). */
  shell?: boolean;
  /** Optional environment overrides for the launched process. */
  env?: NodeJS.ProcessEnv;
}

export interface CliProvider {
  readonly id: CliProviderId;
  buildLaunchSpec(request: CodexExecRequest, skipGitCheck: boolean): CliLaunchSpec;
  prepareLaunchSpec?(request: CodexExecRequest, skipGitCheck: boolean): Promise<CliLaunchSpec>;
  extractResponseText(stdout: string, stderr: string, lastMessagePath: string): Promise<string>;
  isIgnorableStderrLine(line: string): boolean;
  summarizeResult(input: { exitCode: number; stderr: string; lastMessage: string }): string;
  describeLaunchError(commandPath: string, error: { code?: string; message: string }): string;
  buildTranscript(result: CodexExecResult, request: CodexExecRequest): string;
  /** When present, extract the provider-reported execution cost in USD from raw stdout. */
  extractExecutionCostUsd?(stdout: string): number | null;
  /** When present, the strategy calls this instead of spawning a child process. */
  executeDirectly?(request: CodexExecRequest): Promise<CodexExecResult>;
  /**
   * Run a lightweight text-in / text-out summarization call through this provider.
   * Used by memory summarization so the call routes through the active provider
   * rather than a hardcoded CLI binary.  Implementations should throw on failure
   * so the caller can distinguish provider_exec from fallback_summary.
   */
  summarizeText?(prompt: string, cwd: string): Promise<string>;
}
