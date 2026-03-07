import * as fs from 'fs/promises';
import * as path from 'path';
import { hashText } from '../ralph/integrity';
import { Logger } from '../services/logger';
import { ProcessLaunchError, runProcess } from '../services/processRunner';
import { CodexExecRequest, CodexExecResult, CodexStrategy } from './types';

async function hasGitMetadata(rootPath: string): Promise<boolean> {
  try {
    await fs.access(path.join(rootPath, '.git'));
    return true;
  } catch {
    return false;
  }
}

export function buildCodexExecArgs(request: CodexExecRequest, includeSkipGitRepoCheck: boolean): string[] {
  const args = [
    'exec',
    '--model', request.model,
    '--sandbox', request.sandboxMode,
    '--config', `approval_policy="${request.approvalMode}"`,
    '--cd', request.workspaceRoot,
    '--output-last-message', request.lastMessagePath
  ];

  if (includeSkipGitRepoCheck) {
    args.push('--skip-git-repo-check');
  }

  args.push('-');
  return args;
}

export function buildCodexExecTranscript(result: CodexExecResult, request: CodexExecRequest): string {
  const payloadMatched = result.stdinHash === request.promptHash ? 'yes' : 'no';

  return [
    '# Codex Exec Transcript',
    '',
    `- Command: ${request.commandPath} ${result.args.join(' ')}`,
    `- Prompt path: ${request.promptPath}`,
    `- Prompt hash: ${request.promptHash}`,
    `- Prompt bytes: ${request.promptByteLength}`,
    `- Stdin hash: ${result.stdinHash}`,
    `- Payload matched prompt artifact: ${payloadMatched}`,
    `- Last message path: ${request.lastMessagePath}`,
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
    '## Last Message',
    '',
    result.lastMessage || '(empty)'
  ].join('\n');
}

export function describeCodexExecLaunchError(request: CodexExecRequest, error: ProcessLaunchError): string {
  if (error.code === 'ENOENT') {
    return `Codex CLI was not found at "${request.commandPath}". Install Codex CLI or update ralphCodex.codexCommandPath.`;
  }

  return `Failed to start codex exec with "${request.commandPath}": ${error.message}`;
}

export class CliExecCodexStrategy implements CodexStrategy {
  public readonly id = 'cliExec' as const;

  public constructor(private readonly logger: Logger) {}

  public async runExec(request: CodexExecRequest): Promise<CodexExecResult> {
    await fs.mkdir(path.dirname(request.lastMessagePath), { recursive: true });
    await fs.mkdir(path.dirname(request.transcriptPath), { recursive: true });
    const args = buildCodexExecArgs(request, !(await hasGitMetadata(request.workspaceRoot)));
    const stdinHash = hashText(request.prompt);

    if (stdinHash !== request.promptHash) {
      throw new Error(
        `Execution integrity check failed before launch: stdin payload hash ${stdinHash} did not match planned prompt hash ${request.promptHash}.`
      );
    }

    this.logger.info('Starting codex exec.', {
      commandPath: request.commandPath,
      workspaceRoot: request.workspaceRoot,
      promptPath: request.promptPath,
      args
    });

    let processResult;
    try {
      processResult = await runProcess(request.commandPath, args, {
        cwd: request.workspaceRoot,
        stdinText: request.prompt,
        onStdoutChunk: request.onStdoutChunk,
        onStderrChunk: request.onStderrChunk
      });
    } catch (error) {
      if (error instanceof ProcessLaunchError) {
        throw new Error(describeCodexExecLaunchError(request, error), { cause: error });
      }

      throw error;
    }

    const lastMessage = await fs.readFile(request.lastMessagePath, 'utf8').catch(() => '');
    const result: CodexExecResult = {
      strategy: this.id,
      success: processResult.code === 0,
      message: `codex exec exited with code ${processResult.code}.`,
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

    await fs.writeFile(request.transcriptPath, `${buildCodexExecTranscript(result, request).trimEnd()}\n`, 'utf8');

    return result;
  }
}
