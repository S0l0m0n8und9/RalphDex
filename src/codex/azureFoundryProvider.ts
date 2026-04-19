import * as fs from 'fs/promises';
import { hashText } from '../ralph/integrity';
import { PromptCacheStats } from '../ralph/types';
import { httpsPost } from '../services/httpsClient';
import { extractStaticPrefix } from '../prompt/promptBuilder';
import { firstNonEmptyLine, truncateSummary } from '../util/text';
import { AzureAuthConfig, PromptCachingMode } from '../config/types';
import { CliLaunchSpec, CliProvider } from './cliProvider';
import { resolveAzureAuth } from './azureAuthResolver';
import { CodexExecRequest, CodexExecResult } from './types';

export interface AzureFoundryProviderOptions {
  endpointUrl: string;
  auth: AzureAuthConfig;
  modelDeployment?: string;
  apiVersion?: string;
  promptCaching?: PromptCachingMode;
}

/**
 * Azure AI Foundry response shape (OpenAI-compatible chat completions format).
 * The CLI tool is expected to call the endpoint and return JSON to stdout.
 */
interface AzureFoundryResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string; code?: string };
  /** Anthropic-style cache usage fields, present when the model supports prompt caching. */
  usage?: {
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
  };
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
      return `Azure AI Foundry CLI was not found at "${commandPath}". Install the Azure AI Foundry CLI or update ralphCodex.azureFoundry.commandPath.`;
    }

    if (error.code === 'HTTP_ERROR' || /\b(4\d\d|5\d\d)\b/.test(error.message)) {
      return `Azure AI Foundry endpoint returned an error: ${error.message}`;
    }

    return `Failed to start Azure AI Foundry CLI with "${commandPath}": ${error.message}`;
  }

  public async executeDirectly(request: CodexExecRequest): Promise<CodexExecResult> {
    const stdinHash = hashText(request.prompt);

    // Collect warnings before making the request so they appear on all return paths.
    const warnings: string[] = [];

    // Split the prompt at STATIC_PREFIX_BOUNDARY so the stable prefix can be
    // sent with a cache_control marker, enabling prompt caching on Anthropic-
    // compatible Azure deployments. When promptCaching is 'off', the marker is
    // omitted and the full prompt is sent as a single text block.
    const staticPrefix = extractStaticPrefix(request.prompt);
    const staticPrefixBytes = Buffer.byteLength(staticPrefix, 'utf8');
    const dynamicRemainder = request.prompt.slice(staticPrefix.length);
    const cachingDisabled = this.options.promptCaching === 'off';

    const messageContent: Array<{ type: string; text: string; cache_control?: { type: string } }> =
      cachingDisabled
        ? [{ type: 'text', text: request.prompt }]
        : dynamicRemainder
          ? [
              { type: 'text', text: staticPrefix, cache_control: { type: 'ephemeral' } },
              { type: 'text', text: dynamicRemainder }
            ]
          : [{ type: 'text', text: staticPrefix, cache_control: { type: 'ephemeral' } }];

    const requestBody = JSON.stringify({
      messages: [{ role: 'user', content: messageContent }],
      model: this.options.modelDeployment || request.model
    });

    let endpointUrl = this.options.endpointUrl;
    if (this.options.apiVersion) {
      const separator = endpointUrl.includes('?') ? '&' : '?';
      endpointUrl += `${separator}api-version=${encodeURIComponent(this.options.apiVersion)}`;
    }

    // Auth headers are intentionally excluded from transcripts and provenance artifacts.
    const headers: Record<string, string> = {};
    try {
      const auth = await resolveAzureAuth(this.options.auth);
      headers[auth.headerName] = auth.headerValue;
      if (auth.kind === 'bearer') {
        warnings.push(`Using Azure bearer-token authentication (${auth.redactedSource}).`);
      } else {
        warnings.push(`Using secure Azure API key authentication via ${auth.redactedSource}.`);
      }
    } catch (authError) {
      const authMessage = authError instanceof Error ? authError.message : String(authError);
      return {
        strategy: 'cliExec',
        success: false,
        message: `Azure authentication failed: ${authMessage}`,
        warnings,
        exitCode: 1,
        stdout: '',
        stderr: authMessage,
        args: [],
        stdinHash,
        transcriptPath: request.transcriptPath,
        lastMessagePath: request.lastMessagePath,
        lastMessage: ''
      };
    }

    let responseBody: string;
    let statusCode: number;

    try {
      ({ responseBody, statusCode } = await httpsPost({
        url: endpointUrl,
        body: requestBody,
        headers,
        timeoutMs: request.timeoutMs
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        strategy: 'cliExec',
        success: false,
        message: `Azure AI Foundry HTTPS request failed: ${message}`,
        warnings,
        exitCode: 1,
        stdout: '',
        stderr: message,
        args: [],
        stdinHash,
        transcriptPath: request.transcriptPath,
        lastMessagePath: request.lastMessagePath,
        lastMessage: ''
      };
    }

    const success = statusCode >= 200 && statusCode < 300;

    if (!success) {
      const errorDetail = this.extractHttpErrorDetail(responseBody, statusCode);
      await fs.writeFile(request.lastMessagePath, '', 'utf8').catch(() => {});
      return {
        strategy: 'cliExec',
        success: false,
        message: errorDetail,
        warnings,
        exitCode: 1,
        stdout: responseBody,
        stderr: errorDetail,
        args: [],
        stdinHash,
        transcriptPath: request.transcriptPath,
        lastMessagePath: request.lastMessagePath,
        lastMessage: ''
      };
    }

    const lastMessage = await this.extractResponseText(responseBody, '', request.lastMessagePath);

    // Parse cache usage from the response to populate promptCacheStats.
    const promptCacheStats: PromptCacheStats = {
      staticPrefixBytes,
      cacheHit: this.extractCacheHit(responseBody)
    };

    return {
      strategy: 'cliExec',
      success: true,
      message: this.summarizeResult({ exitCode: 0, stderr: '', lastMessage }),
      warnings,
      exitCode: 0,
      stdout: responseBody,
      stderr: '',
      args: [],
      stdinHash,
      transcriptPath: request.transcriptPath,
      lastMessagePath: request.lastMessagePath,
      lastMessage,
      promptCacheStats
    };
  }

  public async summarizeText(prompt: string, _cwd: string): Promise<string> {
    const requestBody = JSON.stringify({
      messages: [{ role: 'user', content: prompt }],
      model: this.options.modelDeployment || undefined
    });

    let endpointUrl = this.options.endpointUrl;
    if (this.options.apiVersion) {
      const separator = endpointUrl.includes('?') ? '&' : '?';
      endpointUrl += `${separator}api-version=${encodeURIComponent(this.options.apiVersion)}`;
    }

    const auth = await resolveAzureAuth(this.options.auth);
    const headers: Record<string, string> = {
      [auth.headerName]: auth.headerValue
    };

    const { responseBody, statusCode } = await httpsPost({
      url: endpointUrl,
      body: requestBody,
      headers
    });

    if (statusCode < 200 || statusCode >= 300) {
      throw new Error(`Azure AI Foundry summarization failed with HTTP ${statusCode}`);
    }

    const parsed = JSON.parse(responseBody) as AzureFoundryResponse;
    const content = parsed.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error('Azure AI Foundry summarization returned empty content');
    }
    return content;
  }

  public buildTranscript(result: CodexExecResult, request: CodexExecRequest): string {
    const payloadMatched = result.stdinHash === request.promptHash ? 'yes' : 'no';
    const commandLine = result.args.length === 0
      ? `Direct HTTPS POST to ${this.options.endpointUrl}`
      : `${request.commandPath} ${result.args.join(' ')}`;

    return [
      '# Azure AI Foundry Transcript',
      '',
      `- Command: ${commandLine}`,
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

  private extractCacheHit(responseBody: string): boolean | null {
    try {
      const parsed = JSON.parse(responseBody) as AzureFoundryResponse;
      const { cache_read_input_tokens, cache_creation_input_tokens } = parsed.usage ?? {};
      if (cache_read_input_tokens !== undefined || cache_creation_input_tokens !== undefined) {
        return (cache_read_input_tokens ?? 0) > 0;
      }
    } catch {
      // Not valid JSON or no usage field — cache status unknown.
    }
    return null;
  }

  private extractHttpErrorDetail(responseBody: string, statusCode: number): string {
    try {
      const parsed = JSON.parse(responseBody) as AzureFoundryResponse;
      if (parsed.error?.message) {
        return `Azure AI Foundry request failed with HTTP ${statusCode}: ${parsed.error.message}`;
      }
    } catch {
      // fall through
    }
    return `Azure AI Foundry request failed with HTTP ${statusCode}`;
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
