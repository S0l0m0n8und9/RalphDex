import * as fs from 'fs/promises';
import { CodexApprovalMode, CodexReasoningEffort, CodexSandboxMode } from '../config/types';
import { CliProvider } from './cliProvider';
import { CodexExecRequest, CodexExecResult } from './types';

export interface CodexCliProviderOptions {
  reasoningEffort: CodexReasoningEffort;
  sandboxMode: CodexSandboxMode;
  approvalMode: CodexApprovalMode;
}

function firstNonEmptyLine(text: string): string | null {
  return text
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0)
    ?? null;
}

function truncateSummary(value: string, maxLength = 240): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

export class CodexCliProvider implements CliProvider {
  public readonly id = 'codex' as const;

  public constructor(private readonly options: CodexCliProviderOptions) {}

  public buildArgs(request: CodexExecRequest, skipGitCheck: boolean): string[] {
    const args = [
      'exec',
      '--model', request.model,
      '--config', `model_reasoning_effort="${request.reasoningEffort}"`,
      '--sandbox', request.sandboxMode,
      '--config', `approval_policy="${request.approvalMode}"`,
      '--cd', request.executionRoot,
      '--output-last-message', request.lastMessagePath
    ];

    if (skipGitCheck) {
      args.push('--skip-git-repo-check');
    }

    args.push('-');
    return args;
  }

  public async extractResponseText(_stdout: string, _stderr: string, lastMessagePath: string): Promise<string> {
    return fs.readFile(lastMessagePath, 'utf8').catch(() => '');
  }

  public isIgnorableStderrLine(line: string): boolean {
    return /^WARNING:/i.test(line)
      || /^Reconnecting\.\.\./.test(line)
      || /^mcp:/i.test(line)
      || /^mcp startup:/i.test(line)
      || /^OpenAI Codex\b/.test(line)
      || /^-+$/.test(line)
      || /^(workdir|model|provider|approval|sandbox|reasoning effort|reasoning summaries|session id):/i.test(line)
      || /^user$/i.test(line)
      || /^# Ralph Prompt:/.test(line)
      || /^## /.test(line)
      || /^- /.test(line);
  }

  public summarizeResult(input: { exitCode: number; stderr: string; lastMessage: string }): string {
    if (input.exitCode === 0) {
      return truncateSummary(firstNonEmptyLine(input.lastMessage) ?? 'codex exec completed successfully.');
    }

    const detail = this.extractFailureDetail(input.stderr, input.lastMessage);
    return detail
      ? `codex exec exited with code ${input.exitCode}: ${detail}`
      : `codex exec exited with code ${input.exitCode}.`;
  }

  public describeLaunchError(commandPath: string, error: { code?: string; message: string }): string {
    if (error.code === 'ENOENT') {
      return `Codex CLI was not found at "${commandPath}". Install Codex CLI or update ralphCodex.codexCommandPath.`;
    }

    return `Failed to start codex exec with "${commandPath}": ${error.message}`;
  }

  public buildTranscript(result: CodexExecResult, request: CodexExecRequest): string {
    const payloadMatched = result.stdinHash === request.promptHash ? 'yes' : 'no';

    return [
      '# Codex Exec Transcript',
      '',
      `- Command: ${request.commandPath} ${result.args.join(' ')}`,
      `- Workspace root: ${request.workspaceRoot}`,
      `- Execution root: ${request.executionRoot}`,
      `- Prompt path: ${request.promptPath}`,
      `- Prompt hash: ${request.promptHash}`,
      `- Prompt bytes: ${request.promptByteLength}`,
      `- Reasoning effort: ${request.reasoningEffort}`,
      `- Stdin hash: ${result.stdinHash}`,
      `- Payload matched prompt artifact: ${payloadMatched}`,
      `- Last message path: ${request.lastMessagePath}`,
      `- Exit code: ${result.exitCode}`,
      '',
      '## Stdout',
      '',
      result.stdout || '(empty)',
      '',
      '## Stderr',
      '',
      result.stderr || '(empty)',
      '',
      '## Last Message',
      '',
      result.lastMessage || '(empty)'
    ].join('\n');
  }

  private extractFailureDetail(stderr: string, lastMessage: string): string | null {
    const stderrLines = stderr
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    for (const line of [...stderrLines].reverse()) {
      if (/^ERROR:/i.test(line)
        && !/failed to shutdown rollout recorder/i.test(line)
        && !/no last agent message/i.test(line)) {
        return truncateSummary(line.replace(/^ERROR:\s*/i, ''));
      }
    }

    const lastMessageLine = firstNonEmptyLine(lastMessage);
    if (lastMessageLine) {
      return truncateSummary(lastMessageLine);
    }

    for (const line of [...stderrLines].reverse()) {
      if (!this.isIgnorableStderrLine(line)) {
        return truncateSummary(line.replace(/^ERROR:\s*/i, ''));
      }
    }

    return null;
  }
}
