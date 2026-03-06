import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger } from '../services/logger';
import { runProcess } from '../services/processRunner';
import { CodexExecRequest, CodexExecResult, CodexStrategy } from './types';

async function hasGitMetadata(rootPath: string): Promise<boolean> {
  try {
    await fs.access(path.join(rootPath, '.git'));
    return true;
  } catch {
    return false;
  }
}

function buildTranscript(result: CodexExecResult, request: CodexExecRequest): string {
  return [
    '# Codex Exec Transcript',
    '',
    `- Command: ${request.commandPath} exec --model ${request.model} --sandbox ${request.sandboxMode} --ask-for-approval ${request.approvalMode}`,
    `- Prompt path: ${request.promptPath}`,
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

export class CliExecCodexStrategy implements CodexStrategy {
  public readonly id = 'cliExec' as const;

  public constructor(private readonly logger: Logger) {}

  public async runExec(request: CodexExecRequest): Promise<CodexExecResult> {
    const args = [
      'exec',
      '--model', request.model,
      '--sandbox', request.sandboxMode,
      '--ask-for-approval', request.approvalMode,
      '--cd', request.workspaceRoot,
      '--output-last-message', request.lastMessagePath
    ];

    if (!(await hasGitMetadata(request.workspaceRoot))) {
      args.push('--skip-git-repo-check');
    }

    args.push('-');

    this.logger.info('Starting codex exec.', {
      commandPath: request.commandPath,
      workspaceRoot: request.workspaceRoot,
      promptPath: request.promptPath,
      args
    });

    const processResult = await runProcess(request.commandPath, args, {
      cwd: request.workspaceRoot,
      stdinText: request.prompt,
      onStdoutChunk: request.onStdoutChunk,
      onStderrChunk: request.onStderrChunk
    });

    const lastMessage = await fs.readFile(request.lastMessagePath, 'utf8').catch(() => '');
    const result: CodexExecResult = {
      strategy: this.id,
      success: processResult.code === 0,
      message: `codex exec exited with code ${processResult.code}.`,
      warnings: [],
      exitCode: processResult.code,
      stdout: processResult.stdout,
      stderr: processResult.stderr,
      transcriptPath: request.transcriptPath,
      lastMessagePath: request.lastMessagePath,
      lastMessage
    };

    await fs.writeFile(request.transcriptPath, `${buildTranscript(result, request).trimEnd()}\n`, 'utf8');

    return result;
  }
}
