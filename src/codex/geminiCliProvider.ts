import * as fs from 'fs/promises';
import { runProcess } from '../services/processRunner';
import { firstNonEmptyLine, truncateSummary } from '../util/text';
import { CliLaunchSpec, CliProvider } from './cliProvider';
import { CodexExecRequest, CodexExecResult } from './types';

export type GeminiPermissionMode = 'yolo' | 'default';

export interface GeminiCliProviderOptions {
  maxTurns: number;
  permissionMode: GeminiPermissionMode;
}

interface GeminiJsonOutput {
  type?: string;
  result?: string;
  is_error?: boolean;
  cost_usd?: number;
  num_turns?: number;
}

export class GeminiCliProvider implements CliProvider {
  public readonly id = 'gemini' as const;

  public constructor(private readonly options: GeminiCliProviderOptions) {}

  public buildLaunchSpec(request: CodexExecRequest, _skipGitCheck: boolean): CliLaunchSpec {
    const args = [
      '-p', '-',
      '--model', request.model,
      '--output-format', 'stream-json',
      '--allowed-tools', 'Read,Write,Edit,MultiEdit,Bash,Glob,Grep,LS'
    ];

    if (this.options.permissionMode === 'yolo') {
      args.push('--yolo');
    }

    return {
      args,
      cwd: request.executionRoot,
      stdinText: request.prompt
    };
  }

  public async extractResponseText(stdout: string, _stderr: string, lastMessagePath: string): Promise<string> {
    const trimmed = stdout.trim();
    if (!trimmed) {
      return '';
    }

    // With --output-format stream-json, stdout is NDJSON. Collect all result
    // events and return the one with the most turns — that is always the main
    // interaction.
    const lines = trimmed.split('\n');
    let bestResult: string | null = null;
    let bestTurns = -1;

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) {
        continue;
      }
      try {
        const parsed = JSON.parse(trimmedLine) as GeminiJsonOutput;
        if (parsed.type === 'result' && typeof parsed.result === 'string') {
          const turns = typeof parsed.num_turns === 'number' ? parsed.num_turns : 0;
          if (turns > bestTurns) {
            bestTurns = turns;
            bestResult = parsed.result;
          }
        }
      } catch {
        // skip unparseable lines
      }
    }

    if (bestResult !== null) {
      await fs.writeFile(lastMessagePath, bestResult, 'utf8').catch(() => {});
      return bestResult;
    }

    // Fallback: try parsing the whole stdout as a single JSON object.
    try {
      const parsed = JSON.parse(trimmed) as GeminiJsonOutput;
      if (typeof parsed.result === 'string') {
        return parsed.result;
      }
    } catch {
      // fall through to raw stdout
    }

    return trimmed;
  }

  public extractExecutionCostUsd(stdout: string): number | null {
    const trimmed = stdout.trim();
    if (!trimmed) {
      return null;
    }

    for (const line of trimmed.split('\n')) {
      const trimmedLine = line.trim();
      if (!trimmedLine) {
        continue;
      }
      try {
        const parsed = JSON.parse(trimmedLine) as GeminiJsonOutput;
        if (parsed.type === 'result' && typeof parsed.cost_usd === 'number') {
          return parsed.cost_usd;
        }
      } catch {
        // skip unparseable lines
      }
    }

    return null;
  }

  public isIgnorableStderrLine(line: string): boolean {
    return /^╭|^│|^╰/.test(line)
      || /^Session:/.test(line)
      || /^Model:/.test(line)
      || /^Cost:/.test(line)
      || /^Duration:/.test(line)
      || /^Tokens:/.test(line)
      || /^\s*$/.test(line)
      || /^Google/i.test(line)
      || /^Gemini/i.test(line);
  }

  public summarizeResult(input: { exitCode: number; stderr: string; lastMessage: string }): string {
    if (input.exitCode === 0) {
      return truncateSummary(firstNonEmptyLine(input.lastMessage) ?? 'gemini completed successfully.');
    }

    const detail = this.extractFailureDetail(input.stderr, input.lastMessage);
    return detail
      ? `gemini exited with code ${input.exitCode}: ${detail}`
      : `gemini exited with code ${input.exitCode}.`;
  }

  public describeLaunchError(commandPath: string, error: { code?: string; message: string }): string {
    if (error.code === 'ENOENT') {
      return `Gemini CLI was not found at "${commandPath}". Install the Gemini CLI or update ralphCodex.geminiCommandPath.`;
    }

    return `Failed to start gemini with "${commandPath}": ${error.message}`;
  }

  public buildTranscript(result: CodexExecResult, request: CodexExecRequest): string {
    const payloadMatched = result.stdinHash === request.promptHash ? 'yes' : 'no';

    return [
      '# Gemini CLI Transcript',
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

  public async summarizeText(prompt: string, cwd: string): Promise<string> {
    const result = await runProcess('gemini', ['-p', '-'], {
      cwd,
      stdinText: prompt
    });
    if (result.code !== 0) {
      throw new Error(`gemini summarization exited with code ${result.code}`);
    }
    const text = result.stdout.trim();
    if (!text) {
      throw new Error('gemini summarization returned empty output');
    }
    return text;
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
