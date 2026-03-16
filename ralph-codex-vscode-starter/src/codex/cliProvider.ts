import { CodexExecRequest, CodexExecResult } from './types';

export type CliProviderId = 'codex' | 'claude';

export interface CliProvider {
  readonly id: CliProviderId;
  buildArgs(request: CodexExecRequest, skipGitCheck: boolean): string[];
  extractResponseText(stdout: string, stderr: string, lastMessagePath: string): Promise<string>;
  isIgnorableStderrLine(line: string): boolean;
  summarizeResult(input: { exitCode: number; stderr: string; lastMessage: string }): string;
  describeLaunchError(commandPath: string, error: { code?: string; message: string }): string;
  buildTranscript(result: CodexExecResult, request: CodexExecRequest): string;
}
