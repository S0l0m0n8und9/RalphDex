import * as fs from 'fs/promises';
import { firstNonEmptyLine, truncateSummary } from '../util/text';
import { CliLaunchSpec, CliProvider } from './cliProvider';
import { CodexExecRequest, CodexExecResult } from './types';

export interface AzureFoundryProviderOptions {
  endpointUrl: string;
}

/**
 * Azure AI Foundry response shape (OpenAI-compatible chat completions format).
 * The CLI tool is expected to call the endpoint and return JSON to stdout.
 */
interface AzureFoundryResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string; code?: string };
}

export class AzureFoundryProvider implements CliProvider {
  public readonly id = 'azure-foundry' as const;

  public constructor(private readonly options: AzureFoundryProviderOptions) {}

  public buildLaunchSpec(request: CodexExecRequest, _skipGitCheck: boolean): CliLaunchSpec {
    const args = [
      '--endpoint', this.options.endpointUrl,
      '--model', request.model,
      '--output-format', 'json'
    ];

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

    try {
      const parsed = JSON.parse(trimmed) as AzureFoundryResponse;
      const content = parsed.choices?.[0]?.message?.content;
      if (typeof content === 'string' && content.trim()) {
        await fs.writeFile(lastMessagePath, content, 'utf8').catch(() => {});
        return content;
      }
    } catch {
      // fall through to raw text
    }

    await fs.writeFile(lastMessagePath, trimmed, 'utf8').catch(() => {});
    return trimmed;
  }

  public isIgnorableStderrLine(line: string): boolean {
    return /^\s*$/.test(line)
      || /^Azure AI Foundry\b/i.test(line)
      || /^Connecting to/i.test(line)
      || /^Endpoint:/i.test(line)
      || /^warning:/i.test(line);
  }

  public summarizeResult(input: { exitCode: number; stderr: string; lastMessage: string }): string {
    if (input.exitCode === 0) {
      return truncateSummary(firstNonEmptyLine(input.lastMessage) ?? 'azure-foundry completed successfully.');
    }

    const detail = this.extractFailureDetail(input.stderr, input.lastMessage);
    return detail
      ? `azure-foundry exited with code ${input.exitCode}: ${detail}`
      : `azure-foundry exited with code ${input.exitCode}.`;
  }

  public describeLaunchError(commandPath: string, error: { code?: string; message: string }): string {
    if (error.code === 'ENOENT') {
      return `Azure AI Foundry CLI was not found at "${commandPath}". Install the Azure AI Foundry CLI or update ralphCodex.azureFoundryCommandPath.`;
    }

    if (error.code === 'HTTP_ERROR' || /\b(4\d\d|5\d\d)\b/.test(error.message)) {
      return `Azure AI Foundry endpoint returned an error: ${error.message}`;
    }

    return `Failed to start Azure AI Foundry CLI with "${commandPath}": ${error.message}`;
  }

  public buildTranscript(result: CodexExecResult, request: CodexExecRequest): string {
    const payloadMatched = result.stdinHash === request.promptHash ? 'yes' : 'no';

    return [
      '# Azure AI Foundry Transcript',
      '',
      `- Command: ${request.commandPath} ${result.args.join(' ')}`,
      `- Workspace root: ${request.workspaceRoot}`,
      `- Execution root: ${request.executionRoot}`,
      `- Prompt path: ${request.promptPath}`,
      `- Prompt hash: ${request.promptHash}`,
      `- Prompt bytes: ${request.promptByteLength}`,
      `- Model: ${request.model}`,
      `- Endpoint: ${this.options.endpointUrl}`,
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
