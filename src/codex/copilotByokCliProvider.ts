import * as fs from 'fs/promises';
import { runProcess } from '../services/processRunner';
import { CopilotByokConfig } from '../config/types';
import { firstNonEmptyLine, truncateSummary } from '../util/text';
import { CliLaunchSpec, CliProvider, CliProviderId } from './cliProvider';
import { CodexExecRequest, CodexExecResult } from './types';

interface CopilotJsonlEvent {
  type?: string;
  result?: string;
  data?: { content?: string; summary?: string };
}

export class CopilotByokCliProvider implements CliProvider {
  public readonly id: CliProviderId;

  public constructor(
    private readonly options: CopilotByokConfig,
    private readonly mode: 'byok' | 'foundry-preset'
  ) {
    this.id = mode === 'foundry-preset' ? 'copilot-foundry' : 'copilot-byok';
  }

  public buildLaunchSpec(request: CodexExecRequest, _skipGitCheck: boolean): CliLaunchSpec {
    const effectiveProviderType = this.mode === 'foundry-preset' ? 'azure' : this.options.providerType;
    const baseUrl = this.resolveBaseUrl(effectiveProviderType);
    const model = request.model.trim() || this.options.model.trim();

    const env: NodeJS.ProcessEnv = {
      COPILOT_PROVIDER_TYPE: effectiveProviderType,
      COPILOT_PROVIDER_BASE_URL: baseUrl
    };

    if (model) {
      env.COPILOT_MODEL = model;
    }

    if (this.options.offline) {
      env.COPILOT_OFFLINE = 'true';
    }

    return {
      args: this.buildArgs(request),
      cwd: request.executionRoot,
      stdinText: request.prompt,
      shell: process.platform === 'win32',
      env
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
      return truncateSummary(firstNonEmptyLine(input.lastMessage) ?? `${this.id} completed successfully.`);
    }

    const detail = this.extractFailureDetail(input.stderr, input.lastMessage);
    return detail
      ? `${this.id} exited with code ${input.exitCode}: ${detail}`
      : `${this.id} exited with code ${input.exitCode}.`;
  }

  public describeLaunchError(commandPath: string, error: { code?: string; message: string }): string {
    if (error.code === 'ENOENT') {
      return `GitHub Copilot CLI was not found at "${commandPath}". Install Copilot CLI or update ralphCodex.copilotFoundry.commandPath.`;
    }

    return `Failed to start Copilot BYOK CLI with "${commandPath}": ${error.message}`;
  }

  public buildTranscript(result: CodexExecResult, request: CodexExecRequest): string {
    const effectiveProviderType = this.mode === 'foundry-preset' ? 'azure' : this.options.providerType;
    const payloadMatched = result.stdinHash === request.promptHash ? 'yes' : 'no';

    return [
      '# Copilot BYOK CLI Transcript',
      '',
      `- Command: ${request.commandPath} ${result.args.join(' ')}`,
      `- Workspace root: ${request.workspaceRoot}`,
      `- Execution root: ${request.executionRoot}`,
      `- Prompt path: ${request.promptPath}`,
      `- Prompt hash: ${request.promptHash}`,
      `- Prompt bytes: ${request.promptByteLength}`,
      `- Model: ${request.model || this.options.model}`,
      `- Provider type: ${effectiveProviderType}`,
      `- Approval mode: ${this.options.approvalMode}`,
      `- Offline: ${this.options.offline}`,
      `- API key env var: ${this.options.requiredApiKeyEnvVar} (value not logged)`,
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
    const effectiveProviderType = this.mode === 'foundry-preset' ? 'azure' : this.options.providerType;
    const baseUrl = this.resolveBaseUrl(effectiveProviderType);
    const modelId = this.options.model.trim();

    const env: NodeJS.ProcessEnv = {
      COPILOT_PROVIDER_TYPE: effectiveProviderType,
      COPILOT_PROVIDER_BASE_URL: baseUrl
    };

    if (modelId) {
      env.COPILOT_MODEL = modelId;
    }

    if (this.options.offline) {
      env.COPILOT_OFFLINE = 'true';
    }

    const result = await runProcess(this.options.commandPath, ['-s', '--no-ask-user', '--output-format=json'], {
      cwd,
      stdinText: prompt,
      shell: process.platform === 'win32',
      env
    });

    if (result.code !== 0) {
      throw new Error(`${this.id} summarization exited with code ${result.code}`);
    }

    const lines = result.stdout.trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line) { continue; }
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
      throw new Error(`${this.id} summarization returned empty output`);
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

  private resolveBaseUrl(effectiveProviderType: string): string {
    const override = this.options.baseUrlOverride.trim();
    if (override) {
      return override;
    }

    if (effectiveProviderType === 'azure') {
      const { resourceName, deployment } = this.options.azure;
      if (!resourceName.trim() || !deployment.trim()) {
        throw new Error(
          'copilot-byok with providerType "azure" requires both azure.resourceName and azure.deployment, or baseUrlOverride.'
        );
      }
      return `https://${resourceName.trim()}.openai.azure.com/openai/deployments/${deployment.trim()}`;
    }

    throw new Error(
      'copilot-byok requires baseUrlOverride when providerType is not "azure".'
    );
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
