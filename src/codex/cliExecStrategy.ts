import * as fs from 'fs/promises';
import * as path from 'path';
import { hashText } from '../ralph/integrity';
import { Logger } from '../services/logger';
import { ProcessLaunchError, runProcess } from '../services/processRunner';
import { CliProvider } from './cliProvider';
import { CodexCliProvider } from './codexCliProvider';
import { sanitizeTranscriptForStorage } from './transcriptSafety';
import { CodexExecRequest, CodexExecResult, CodexStrategy } from './types';

async function hasGitMetadata(rootPath: string): Promise<boolean> {
  try {
    await fs.access(path.join(rootPath, '.git'));
    return true;
  } catch {
    return false;
  }
}

export class CliExecCodexStrategy implements CodexStrategy {
  public readonly id = 'cliExec' as const;
  private readonly provider: CliProvider;

  public constructor(private readonly logger: Logger, provider?: CliProvider) {
    this.provider = provider ?? new CodexCliProvider({
      reasoningEffort: 'medium',
      sandboxMode: 'workspace-write',
      approvalMode: 'never'
    });
  }

  public async runExec(request: CodexExecRequest): Promise<CodexExecResult> {
    await fs.mkdir(path.dirname(request.lastMessagePath), { recursive: true });
    await fs.mkdir(path.dirname(request.transcriptPath), { recursive: true });

    const stdinHash = hashText(request.prompt);
    if (stdinHash !== request.promptHash) {
      throw new Error(
        `Execution integrity check failed before launch: stdin payload hash ${stdinHash} did not match planned prompt hash ${request.promptHash}.`
      );
    }

    let result: CodexExecResult;

    if (this.provider.executeDirectly) {
      this.logger.info(`Starting ${this.provider.id} direct HTTPS exec.`, {
        workspaceRoot: request.workspaceRoot,
        executionRoot: request.executionRoot,
        promptPath: request.promptPath
      });
      result = await this.provider.executeDirectly(request);
    } else {
      const skipGitCheck = !(await hasGitMetadata(request.executionRoot));
      const launchSpec = this.provider.prepareLaunchSpec
        ? await this.provider.prepareLaunchSpec(request, skipGitCheck)
        : this.provider.buildLaunchSpec(request, skipGitCheck);
      const args = launchSpec.args;

      this.logger.info(`Starting ${this.provider.id} CLI exec.`, {
        commandPath: request.commandPath,
        workspaceRoot: request.workspaceRoot,
        executionRoot: request.executionRoot,
        promptPath: request.promptPath,
        launchCwd: launchSpec.cwd,
        args
      });

      let processResult;
      try {
        processResult = await runProcess(request.commandPath, args, {
          cwd: launchSpec.cwd,
          stdinText: launchSpec.stdinText,
          shell: launchSpec.shell,
          env: launchSpec.env,
          onStdoutChunk: request.onStdoutChunk,
          onStderrChunk: request.onStderrChunk,
          timeoutMs: request.timeoutMs
        });
      } catch (error) {
        if (error instanceof ProcessLaunchError) {
          throw new Error(
            this.provider.describeLaunchError(request.commandPath, error),
            { cause: error }
          );
        }

        throw error;
      }

      const lastMessage = await this.provider.extractResponseText(
        processResult.stdout,
        processResult.stderr,
        request.lastMessagePath
      );

      const cliWarnings: string[] = [];
      if (request.promptCaching === 'force') {
        cliWarnings.push(
          `Prompt caching is set to "force" but the active provider "${this.provider.id}" does not support explicit cache_control markers. ` +
          'Caching will not be applied. Use provider "azure-foundry" (direct-HTTPS) to enable prompt caching.'
        );
      }

      result = {
        strategy: this.id,
        success: processResult.code === 0,
        message: this.provider.summarizeResult({
          exitCode: processResult.code,
          stderr: processResult.stderr,
          lastMessage
        }),
        warnings: cliWarnings,
        exitCode: processResult.code,
        stdout: processResult.stdout,
        stderr: processResult.stderr,
        args,
        stdinHash,
        transcriptPath: request.transcriptPath,
        lastMessagePath: request.lastMessagePath,
        lastMessage,
        executionCostUsd: this.provider.extractExecutionCostUsd
          ? this.provider.extractExecutionCostUsd(processResult.stdout)
          : null
      };
    }

    const sanitizedTranscript = sanitizeTranscriptForStorage(this.provider.buildTranscript(result, request));
    await fs.writeFile(
      request.transcriptPath,
      `${sanitizedTranscript.trimEnd()}\n`,
      'utf8'
    );

    return result;
  }
}
