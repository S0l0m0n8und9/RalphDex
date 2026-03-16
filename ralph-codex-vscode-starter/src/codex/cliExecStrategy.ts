import * as fs from 'fs/promises';
import * as path from 'path';
import { hashText } from '../ralph/integrity';
import { Logger } from '../services/logger';
import { ProcessLaunchError, runProcess } from '../services/processRunner';
import { CliProvider } from './cliProvider';
import { CodexCliProvider } from './codexCliProvider';
import { CodexExecRequest, CodexExecResult, CodexStrategy } from './types';

async function hasGitMetadata(rootPath: string): Promise<boolean> {
  try {
    await fs.access(path.join(rootPath, '.git'));
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Legacy exported functions — thin wrappers over CodexCliProvider for
// backwards compatibility with existing tests and call sites.
// ---------------------------------------------------------------------------

const defaultCodexProvider = new CodexCliProvider({
  reasoningEffort: 'medium',
  sandboxMode: 'workspace-write',
  approvalMode: 'never'
});

export function buildCodexExecArgs(request: CodexExecRequest, includeSkipGitRepoCheck: boolean): string[] {
  return defaultCodexProvider.buildArgs(request, includeSkipGitRepoCheck);
}

export function buildCodexExecTranscript(result: CodexExecResult, request: CodexExecRequest): string {
  return defaultCodexProvider.buildTranscript(result, request);
}

export function summarizeCodexExecResultMessage(input: {
  exitCode: number;
  stderr: string;
  lastMessage: string;
}): string {
  return defaultCodexProvider.summarizeResult(input);
}

export function describeCodexExecLaunchError(request: CodexExecRequest, error: ProcessLaunchError): string {
  return defaultCodexProvider.describeLaunchError(request.commandPath, error);
}

// ---------------------------------------------------------------------------
// Strategy implementation — delegates to the injected CliProvider.
// ---------------------------------------------------------------------------

export class CliExecCodexStrategy implements CodexStrategy {
  public readonly id = 'cliExec' as const;
  private readonly provider: CliProvider;

  public constructor(private readonly logger: Logger, provider?: CliProvider) {
    this.provider = provider ?? defaultCodexProvider;
  }

  public async runExec(request: CodexExecRequest): Promise<CodexExecResult> {
    await fs.mkdir(path.dirname(request.lastMessagePath), { recursive: true });
    await fs.mkdir(path.dirname(request.transcriptPath), { recursive: true });
    const args = this.provider.buildArgs(request, !(await hasGitMetadata(request.executionRoot)));
    const stdinHash = hashText(request.prompt);

    if (stdinHash !== request.promptHash) {
      throw new Error(
        `Execution integrity check failed before launch: stdin payload hash ${stdinHash} did not match planned prompt hash ${request.promptHash}.`
      );
    }

    this.logger.info(`Starting ${this.provider.id} CLI exec.`, {
      commandPath: request.commandPath,
      workspaceRoot: request.workspaceRoot,
      executionRoot: request.executionRoot,
      promptPath: request.promptPath,
      args
    });

    let processResult;
    try {
      processResult = await runProcess(request.commandPath, args, {
        cwd: request.executionRoot,
        stdinText: request.prompt,
        onStdoutChunk: request.onStdoutChunk,
        onStderrChunk: request.onStderrChunk
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

    const result: CodexExecResult = {
      strategy: this.id,
      success: processResult.code === 0,
      message: this.provider.summarizeResult({
        exitCode: processResult.code,
        stderr: processResult.stderr,
        lastMessage
      }),
      warnings: [],
      exitCode: processResult.code,
      stdout: processResult.stdout,
      stderr: processResult.stderr,
      args,
      stdinHash,
      transcriptPath: request.transcriptPath,
      lastMessagePath: request.lastMessagePath,
      lastMessage
    };

    await fs.writeFile(
      request.transcriptPath,
      `${this.provider.buildTranscript(result, request).trimEnd()}\n`,
      'utf8'
    );

    return result;
  }
}
