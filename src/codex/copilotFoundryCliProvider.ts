import * as fs from 'fs/promises';
import { runProcess } from '../services/processRunner';
import { CopilotFoundryConfig } from '../config/types';
import { firstNonEmptyLine, truncateSummary } from '../util/text';
import { CliLaunchSpec, CliProvider } from './cliProvider';
import { resolveAzureAuth } from './azureAuthResolver';
import { CodexExecRequest, CodexExecResult } from './types';

interface CopilotJsonlEvent {
  type?: string;
  result?: string;
  data?: { content?: string; summary?: string };
}

export class CopilotFoundryCliProvider implements CliProvider {
  public readonly id = 'copilot-foundry' as const;

  public constructor(private readonly options: CopilotFoundryConfig) {}

  public buildLaunchSpec(request: CodexExecRequest, _skipGitCheck: boolean): CliLaunchSpec {
    return {
      args: this.buildArgs(request),
      cwd: request.executionRoot,
      stdinText: request.prompt,
      shell: process.platform === 'win32'
    };
  }

  public async prepareLaunchSpec(request: CodexExecRequest, _skipGitCheck: boolean): Promise<CliLaunchSpec> {
    const auth = await resolveAzureAuth(this.options.auth);
    const baseUrl = this.resolveBaseUrl();
    const modelId = request.model.trim() || this.options.model.deployment.trim();
    const wireModel = this.options.model.deployment.trim() || modelId;

    if (!wireModel) {
      throw new Error('copilot-foundry requires a configured model deployment before launch.');
    }

    return {
      args: this.buildArgs(request),
      cwd: request.executionRoot,
      stdinText: request.prompt,
      shell: process.platform === 'win32',
      env: {
        COPILOT_PROVIDER_TYPE: 'azure',
        COPILOT_PROVIDER_BASE_URL: baseUrl,
        COPILOT_PROVIDER_WIRE_API: this.options.model.wireApi,
        COPILOT_PROVIDER_MODEL_ID: modelId || wireModel,
        COPILOT_PROVIDER_WIRE_MODEL: wireModel,
        ...(auth.copilotEnv ?? {})
      }
    };
  }

  public async extractResponseText(stdout: string, _stderr: string, lastMessagePath: string): Promise<string> {
    const trimmed = stdout.trim();
    if (!trimmed) {
      return '';
    }

    const lines = trimmed.split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line) {
        continue;
      }

      try {
        const parsed = JSON.parse(line) as CopilotJsonlEvent;
        if (parsed.type === 'assistant.message'
          && typeof parsed.data?.content === 'string'
          && parsed.data.content.trim()) {
          await fs.writeFile(lastMessagePath, parsed.data.content, 'utf8').catch(() => {});
          return parsed.data.content;
        }

        if (parsed.type === 'result' && typeof parsed.result === 'string') {
          await fs.writeFile(lastMessagePath, parsed.result, 'utf8').catch(() => {});
          return parsed.result;
        }
      } catch {
        break;
      }
    }

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
      return truncateSummary(firstNonEmptyLine(input.lastMessage) ?? 'copilot-foundry completed successfully.');
    }

    const detail = this.extractFailureDetail(input.stderr, input.lastMessage);
    return detail
      ? `copilot-foundry exited with code ${input.exitCode}: ${detail}`
      : `copilot-foundry exited with code ${input.exitCode}.`;
  }

  public describeLaunchError(commandPath: string, error: { code?: string; message: string }): string {
    if (error.code === 'ENOENT') {
      return `GitHub Copilot CLI was not found at "${commandPath}". Install Copilot CLI or update ralphCodex.copilotFoundry.commandPath.`;
    }

    return `Failed to start Copilot Foundry CLI with "${commandPath}": ${error.message}`;
  }

  public buildTranscript(result: CodexExecResult, request: CodexExecRequest): string {
    const payloadMatched = result.stdinHash === request.promptHash ? 'yes' : 'no';

    return [
      '# Copilot Foundry CLI Transcript',
      '',
      `- Command: ${request.commandPath} ${result.args.join(' ')}`,
      `- Workspace root: ${request.workspaceRoot}`,
      `- Execution root: ${request.executionRoot}`,
      `- Prompt path: ${request.promptPath}`,
      `- Prompt hash: ${request.promptHash}`,
      `- Prompt bytes: ${request.promptByteLength}`,
      `- Model: ${request.model || this.options.model.deployment}`,
      `- Azure resource: ${this.options.azure.resourceName || '(override only)'}`,
      `- Approval mode: ${this.options.approvalMode}`,
      `- Wire API: ${this.options.model.wireApi}`,
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
    const auth = await resolveAzureAuth(this.options.auth);
    const baseUrl = this.resolveBaseUrl();
    const modelId = this.options.model.deployment.trim();

    const result = await runProcess(this.options.commandPath, ['-s', '--no-ask-user', '--output-format=json'], {
      cwd,
      stdinText: prompt,
      shell: process.platform === 'win32',
      env: {
        COPILOT_PROVIDER_TYPE: 'azure',
        COPILOT_PROVIDER_BASE_URL: baseUrl,
        COPILOT_PROVIDER_WIRE_API: this.options.model.wireApi,
        ...(modelId ? {
          COPILOT_PROVIDER_MODEL_ID: modelId,
          COPILOT_PROVIDER_WIRE_MODEL: modelId
        } : {}),
        ...(auth.copilotEnv ?? {})
      }
    });
    if (result.code !== 0) {
      throw new Error(`copilot-foundry summarization exited with code ${result.code}`);
    }

    const lines = result.stdout.trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line) {
        continue;
      }

      try {
        const parsed = JSON.parse(line) as CopilotJsonlEvent;
        if (parsed.type === 'assistant.message' && typeof parsed.data?.content === 'string' && parsed.data.content.trim()) {
          return parsed.data.content.trim();
        }
      } catch {
        break;
      }
    }

    const text = result.stdout.trim();
    if (!text) {
      throw new Error('copilot-foundry summarization returned empty output');
    }

    return text;
  }

  private buildArgs(request: CodexExecRequest): string[] {
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

    return args;
  }

  private resolveBaseUrl(): string {
    const override = this.options.azure.baseUrlOverride.trim();
    if (override) {
      return override;
    }

    const resourceName = this.options.azure.resourceName.trim();
    if (!resourceName) {
      throw new Error('copilot-foundry requires either azure.baseUrlOverride or azure.resourceName.');
    }

    return `https://${resourceName}.openai.azure.com`;
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
