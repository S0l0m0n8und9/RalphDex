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
    '--config', `model_reasoning_effort="${request.reasoningEffort}"`,
    '--sandbox', request.sandboxMode,
    '--config', `approval_policy="${request.approvalMode}"`,
    '--cd', request.executionRoot,
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
    `- Workspace root: ${request.workspaceRoot}`,
    `- Execution root: ${request.executionRoot}`,
    `- Prompt path: ${request.promptPath}`,
    `- Prompt hash: ${request.promptHash}`,
    `- Prompt bytes: ${request.promptByteLength}`,
    `- Reasoning effort: ${request.reasoningEffort}`,
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

function firstNonEmptyLine(text: string): string | null {
  return text
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0)
    ?? null;
}

function truncateSummary(value: string, maxLength = 240): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

function isIgnorableStderrLine(line: string): boolean {
  return /^WARNING:/i.test(line)
    || /^Reconnecting\.\.\./.test(line)
    || /^mcp:/i.test(line)
    || /^mcp startup:/i.test(line)
    || /^OpenAI Codex\b/.test(line)
    || /^-+$/.test(line)
    || /^(workdir|model|provider|approval|sandbox|reasoning effort|reasoning summaries|session id):/i.test(line)
    || /^user$/i.test(line)
    || /^# Ralph Prompt:/.test(line)
    || /^## /.test(line)
    || /^- /.test(line);
}

function extractCodexExecFailureDetail(stderr: string, lastMessage: string): string | null {
  const stderrLines = stderr
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (const line of [...stderrLines].reverse()) {
    if (/^ERROR:/i.test(line)
      && !/failed to shutdown rollout recorder/i.test(line)
      && !/no last agent message/i.test(line)) {
      return truncateSummary(line.replace(/^ERROR:\s*/i, ''));
    }
  }

  const lastMessageLine = firstNonEmptyLine(lastMessage);
  if (lastMessageLine) {
    return truncateSummary(lastMessageLine);
  }

  for (const line of [...stderrLines].reverse()) {
    if (!isIgnorableStderrLine(line)) {
      return truncateSummary(line.replace(/^ERROR:\s*/i, ''));
    }
  }

  return null;
}

export function summarizeCodexExecResultMessage(input: {
  exitCode: number;
  stderr: string;
  lastMessage: string;
}): string {
  if (input.exitCode === 0) {
    return truncateSummary(firstNonEmptyLine(input.lastMessage) ?? 'codex exec completed successfully.');
  }

  const detail = extractCodexExecFailureDetail(input.stderr, input.lastMessage);
  return detail
    ? `codex exec exited with code ${input.exitCode}: ${detail}`
    : `codex exec exited with code ${input.exitCode}.`;
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
    const args = buildCodexExecArgs(request, !(await hasGitMetadata(request.executionRoot)));
    const stdinHash = hashText(request.prompt);

    if (stdinHash !== request.promptHash) {
      throw new Error(
        `Execution integrity check failed before launch: stdin payload hash ${stdinHash} did not match planned prompt hash ${request.promptHash}.`
      );
    }

    this.logger.info('Starting codex exec.', {
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
        throw new Error(describeCodexExecLaunchError(request, error), { cause: error });
      }

      throw error;
    }

    const lastMessage = await fs.readFile(request.lastMessagePath, 'utf8').catch(() => '');
    const result: CodexExecResult = {
      strategy: this.id,
      success: processResult.code === 0,
      message: summarizeCodexExecResultMessage({
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

    await fs.writeFile(request.transcriptPath, `${buildCodexExecTranscript(result, request).trimEnd()}\n`, 'utf8');

    return result;
  }
}
