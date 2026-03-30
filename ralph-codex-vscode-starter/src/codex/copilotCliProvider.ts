import * as fs from 'fs/promises';
import { firstNonEmptyLine, truncateSummary } from '../util/text';
import { CliLaunchSpec, CliProvider } from './cliProvider';
import { CodexExecRequest, CodexExecResult } from './types';

export type CopilotApprovalMode = 'allow-all' | 'allow-tools-only' | 'interactive';

export interface CopilotCliProviderOptions {
  approvalMode: CopilotApprovalMode;
}

export class CopilotCliProvider implements CliProvider {
  public readonly id = 'copilot' as const;

  public constructor(private readonly options: CopilotCliProviderOptions) {}

  public buildLaunchSpec(request: CodexExecRequest, _skipGitCheck: boolean): CliLaunchSpec {
    const args = ['-s'];

    if (request.model.trim()) {
      args.push('--model', request.model);
    }

    if (this.options.approvalMode === 'allow-all') {
      args.push('--allow-all');
    } else if (this.options.approvalMode === 'allow-tools-only') {
      args.push('--allow-tool', 'shell');
    }

    args.push('-p', request.prompt);

    return {
      args,
      cwd: request.executionRoot
    };
  }

  public async extractResponseText(stdout: string, _stderr: string, lastMessagePath: string): Promise<string> {
    const text = stdout.trim();
    if (text) {
      await fs.writeFile(lastMessagePath, text, 'utf8').catch(() => {});
    }
    return text;
  }

  public isIgnorableStderrLine(line: string): boolean {
    return /^\s*$/.test(line)
      || /^GitHub Copilot CLI\b/i.test(line)
      || /^Using model:/i.test(line)
      || /^Authenticated as/i.test(line)
      || /^Session ID:/i.test(line)
      || /^warning:/i.test(line);
  }

  public summarizeResult(input: { exitCode: number; stderr: string; lastMessage: string }): string {
    if (input.exitCode === 0) {
      return truncateSummary(firstNonEmptyLine(input.lastMessage) ?? 'copilot completed successfully.');
    }

    const detail = this.extractFailureDetail(input.stderr, input.lastMessage);
    return detail
      ? `copilot exited with code ${input.exitCode}: ${detail}`
      : `copilot exited with code ${input.exitCode}.`;
  }

  public describeLaunchError(commandPath: string, error: { code?: string; message: string }): string {
    if (error.code === 'ENOENT') {
      return `GitHub Copilot CLI was not found at "${commandPath}". Install Copilot CLI or update ralphCodex.copilotCommandPath.`;
    }

    return `Failed to start GitHub Copilot CLI with "${commandPath}": ${error.message}`;
  }

  public buildTranscript(result: CodexExecResult, request: CodexExecRequest): string {
    const payloadMatched = result.stdinHash === request.promptHash ? 'yes' : 'no';

    return [
      '# GitHub Copilot CLI Transcript',
      '',
      `- Command: ${request.commandPath} ${result.args.join(' ')}`,
      `- Workspace root: ${request.workspaceRoot}`,
      `- Execution root: ${request.executionRoot}`,
      `- Prompt path: ${request.promptPath}`,
      `- Prompt hash: ${request.promptHash}`,
      `- Prompt bytes: ${request.promptByteLength}`,
      `- Model: ${request.model}`,
      `- Approval mode: ${this.options.approvalMode}`,
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

    const lastMessageLine = firstNonEmptyLine(lastMessage);
    if (lastMessageLine) {
      return truncateSummary(lastMessageLine);
    }

    for (const line of [...stderrLines].reverse()) {
      if (!this.isIgnorableStderrLine(line)) {
        return truncateSummary(line.replace(/^error:\s*/i, ''));
      }
    }

    return null;
  }
}
