import * as fs from 'fs/promises';
import { runProcess } from '../services/processRunner';
import { firstNonEmptyLine, truncateSummary } from '../util/text';
import { CliLaunchSpec, CliProvider } from './cliProvider';
import { CodexExecRequest, CodexExecResult } from './types';

export type CopilotApprovalMode = 'allow-all' | 'allow-tools-only' | 'interactive';

export interface CopilotCliProviderOptions {
  commandPath?: string;
  approvalMode: CopilotApprovalMode;
  maxAutopilotContinues: number;
}

export class CopilotCliProvider implements CliProvider {
  public readonly id = 'copilot' as const;

  public constructor(private readonly options: CopilotCliProviderOptions) {}

  public buildLaunchSpec(request: CodexExecRequest, _skipGitCheck: boolean): CliLaunchSpec {
    const args = ['-s', '--no-ask-user', '--autopilot'];

    args.push('--max-autopilot-continues', String(this.options.maxAutopilotContinues));

    if (request.model.trim()) {
      args.push('--model', request.model);
    }

    args.push('--reasoning-effort', request.reasoningEffort);

    args.push('--output-format=json');

    if (this.options.approvalMode === 'allow-all') {
      args.push('--allow-all');
    } else if (this.options.approvalMode === 'allow-tools-only') {
      args.push('--allow-tool', 'shell');
    }

    // The Copilot CLI supports two programmatic prompt-delivery modes:
    //   1. `copilot -p "inline prompt"` — limited by argv length
    //   2. `echo "prompt" | copilot`   — piped via stdin, no `-p` flag
    //
    // NOTE: "Piped input is ignored if you also provide a prompt with
    // the -p or --prompt option."  (GitHub docs)
    //
    // We always pipe via stdin because Ralph prompts are multi-line
    // markdown that can easily exceed argv limits on Windows (~32 KB).
    return {
      args,
      cwd: request.executionRoot,
      stdinText: request.prompt,
      shell: process.platform === 'win32'
    };
  }

  public async extractResponseText(stdout: string, _stderr: string, lastMessagePath: string): Promise<string> {
    const trimmed = stdout.trim();
    if (!trimmed) {
      return '';
    }

    // Scan JSONL output (--output-format=json) for the last assistant message,
    // scanning from the end so the final message is found first.
    //
    // The Copilot CLI emits JSONL with several event types:
    //   - assistant.message       → { data: { content: "..." } }
    //   - session.task_complete   → { data: { summary: "..." } }
    //   - result                  → { exitCode, usage, ... } (no response text)
    //
    // The completion report JSON block lives inside the last assistant.message
    // content. The result event only carries metadata (exitCode, usage) and
    // does NOT contain the agent's response text.
    const lines = trimmed.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line) continue;
      try {
        const parsed = JSON.parse(line) as {
          type?: string;
          result?: string;
          data?: { content?: string; summary?: string };
        };

        // Primary: extract the last assistant.message with content — this is
        // where the agent's final response (including the completion report
        // JSON block) lives.
        if (parsed.type === 'assistant.message'
          && typeof parsed.data?.content === 'string'
          && parsed.data.content.trim()) {
          const content = parsed.data.content;
          await fs.writeFile(lastMessagePath, content, 'utf8').catch(() => {});
          return content;
        }

        // Legacy fallback: some older Copilot CLI builds may emit a result
        // event with an inline result string.
        if (parsed.type === 'result' && typeof parsed.result === 'string') {
          await fs.writeFile(lastMessagePath, parsed.result, 'utf8').catch(() => {});
          return parsed.result;
        }
      } catch {
        // Not JSON — fall through to raw text.
        break;
      }
    }

    // Fallback: return the stdout text as-is (e.g. older CLI builds without
    // --output-format=json support, or unexpected non-JSONL output).
    await fs.writeFile(lastMessagePath, trimmed, 'utf8').catch(() => {});
    return trimmed;
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

  public async summarizeText(prompt: string, cwd: string): Promise<string> {
    const commandPath = this.options.commandPath?.trim() || 'copilot';
    const result = await runProcess(commandPath, ['-s', '--no-ask-user', '--output-format=json'], {
      cwd,
      stdinText: prompt,
      shell: process.platform === 'win32'
    });
    if (result.code !== 0) {
      throw new Error(`copilot summarization exited with code ${result.code}`);
    }
    // Parse JSONL output for the last assistant.message content
    const lines = result.stdout.trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line) { continue; }
      try {
        const parsed = JSON.parse(line) as { type?: string; data?: { content?: string } };
        if (parsed.type === 'assistant.message' && typeof parsed.data?.content === 'string' && parsed.data.content.trim()) {
          return parsed.data.content.trim();
        }
      } catch {
        break;
      }
    }
    const text = result.stdout.trim();
    if (!text) {
      throw new Error('copilot summarization returned empty output');
    }
    return text;
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
