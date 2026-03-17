import { CliProvider } from './cliProvider';
import { CodexExecRequest, CodexExecResult } from './types';

export type ClaudePermissionMode = 'dangerously-skip-permissions' | 'default';

export interface ClaudeCliProviderOptions {
  maxTurns: number;
  permissionMode: ClaudePermissionMode;
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

export interface ClaudeJsonOutput {
  type?: string;
  subtype?: string;
  result?: string;
  is_error?: boolean;
  cost_usd?: number;
  duration_ms?: number;
  num_turns?: number;
  session_id?: string;
}

export class ClaudeCliProvider implements CliProvider {
  public readonly id = 'claude' as const;

  public constructor(private readonly options: ClaudeCliProviderOptions) {}

  public buildArgs(request: CodexExecRequest, _skipGitCheck: boolean): string[] {
    const args = [
      '-p', '-',
      '--model', request.model,
      '--output-format', 'stream-json',
      '--max-turns', String(this.options.maxTurns),
      '--verbose',
      '--allowedTools', 'Read,Write,Edit,MultiEdit,Bash,Glob,Grep,LS',
      '--no-session-persistence'
    ];

    if (this.options.permissionMode === 'dangerously-skip-permissions') {
      args.push('--dangerously-skip-permissions');
    }

    return args;
  }

  public async extractResponseText(stdout: string, _stderr: string, _lastMessagePath: string): Promise<string> {
    const trimmed = stdout.trim();
    if (!trimmed) {
      return '';
    }

    // With --output-format stream-json, stdout is NDJSON. Scan in reverse for
    // the result event, which carries the final assistant response text.
    const lines = trimmed.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line) {
        continue;
      }
      try {
        const parsed = JSON.parse(line) as ClaudeJsonOutput;
        if (parsed.type === 'result' && typeof parsed.result === 'string') {
          return parsed.result;
        }
      } catch {
        // skip unparseable lines
      }
    }

    // Fallback: try parsing the whole stdout as a single JSON object in case
    // --output-format json was used or the process wrote a single blob.
    try {
      const parsed = JSON.parse(trimmed) as ClaudeJsonOutput;
      if (typeof parsed.result === 'string') {
        return parsed.result;
      }
    } catch {
      // fall through to raw stdout
    }

    return trimmed;
  }

  public isIgnorableStderrLine(line: string): boolean {
    return /^╭|^│|^╰/.test(line)
      || /^Session:/.test(line)
      || /^Model:/.test(line)
      || /^Tools:/.test(line)
      || /^Cost:/.test(line)
      || /^Duration:/.test(line)
      || /^Tokens:/.test(line)
      || /^\s*$/.test(line)
      || /^claude\.ai/i.test(line)
      || /^Anthropic/i.test(line);
  }

  public summarizeResult(input: { exitCode: number; stderr: string; lastMessage: string }): string {
    if (input.exitCode === 0) {
      return truncateSummary(firstNonEmptyLine(input.lastMessage) ?? 'claude completed successfully.');
    }

    const detail = this.extractFailureDetail(input.stderr, input.lastMessage);
    return detail
      ? `claude exited with code ${input.exitCode}: ${detail}`
      : `claude exited with code ${input.exitCode}.`;
  }

  public describeLaunchError(commandPath: string, error: { code?: string; message: string }): string {
    if (error.code === 'ENOENT') {
      return `Claude CLI was not found at "${commandPath}". Install Claude CLI or update ralphCodex.claudeCommandPath.`;
    }

    return `Failed to start claude with "${commandPath}": ${error.message}`;
  }

  public buildTranscript(result: CodexExecResult, request: CodexExecRequest): string {
    const payloadMatched = result.stdinHash === request.promptHash ? 'yes' : 'no';

    return [
      '# Claude CLI Transcript',
      '',
      `- Command: ${request.commandPath} ${result.args.join(' ')}`,
      `- Workspace root: ${request.workspaceRoot}`,
      `- Execution root: ${request.executionRoot}`,
      `- Prompt path: ${request.promptPath}`,
      `- Prompt hash: ${request.promptHash}`,
      `- Prompt bytes: ${request.promptByteLength}`,
      `- Model: ${request.model}`,
      `- Max turns: ${this.options.maxTurns}`,
      `- Permission mode: ${this.options.permissionMode}`,
      `- Stdin hash: ${result.stdinHash}`,
      `- Payload matched prompt artifact: ${payloadMatched}`,
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
      '## Extracted Response',
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
      if (/^error:/i.test(line)) {
        return truncateSummary(line.replace(/^error:\s*/i, ''));
      }
    }

    const lastMessageLine = firstNonEmptyLine(lastMessage);
    if (lastMessageLine) {
      return truncateSummary(lastMessageLine);
    }

    for (const line of [...stderrLines].reverse()) {
      if (!this.isIgnorableStderrLine(line)) {
        return truncateSummary(line);
      }
    }

    return null;
  }
}
