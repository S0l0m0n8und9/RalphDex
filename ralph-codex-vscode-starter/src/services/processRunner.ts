import { spawn } from 'child_process';

export interface ProcessRunOptions {
  cwd: string;
  stdinText?: string;
  onStdoutChunk?: (chunk: string) => void;
  onStderrChunk?: (chunk: string) => void;
  shell?: boolean;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}

export interface ProcessRunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type ProcessRunnerOverride = (
  command: string,
  args: string[],
  options: ProcessRunOptions
) => Promise<ProcessRunResult> | ProcessRunResult;

export class ProcessLaunchError extends Error {
  public readonly command: string;
  public readonly args: string[];
  public readonly code?: string;

  public constructor(command: string, args: string[], error: unknown) {
    const details = error as NodeJS.ErrnoException;
    super(details.message || `Failed to start process: ${command}`);
    this.name = 'ProcessLaunchError';
    this.command = command;
    this.args = args;
    this.code = details.code;
  }
}

export class ProcessTimeoutError extends Error {
  public readonly command: string;
  public readonly args: string[];
  public readonly timeoutMs: number;

  public constructor(command: string, args: string[], timeoutMs: number) {
    super(`Process timed out after ${timeoutMs}ms: ${command}`);
    this.name = 'ProcessTimeoutError';
    this.command = command;
    this.args = args;
    this.timeoutMs = timeoutMs;
  }
}

let processRunnerOverride: ProcessRunnerOverride | null = null;

export function setProcessRunnerOverride(override: ProcessRunnerOverride | null): void {
  processRunnerOverride = override;
}

export async function runProcess(command: string, args: string[], options: ProcessRunOptions): Promise<ProcessRunResult> {
  if (processRunnerOverride) {
    return processRunnerOverride(command, args, options);
  }

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      shell: options.shell ?? false,
      env: options.env ? { ...process.env, ...options.env } : process.env
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    if (options.timeoutMs !== undefined && options.timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        }, 5000);
      }, options.timeoutMs);
    }

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      options.onStdoutChunk?.(text);
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      options.onStderrChunk?.(text);
    });

    child.on('error', (error) => {
      if (timer) { clearTimeout(timer); }
      reject(new ProcessLaunchError(command, args, error));
    });
    child.on('close', (code) => {
      if (timer) { clearTimeout(timer); }
      if (timedOut) {
        reject(new ProcessTimeoutError(command, args, options.timeoutMs!));
        return;
      }
      resolve({
        code: code ?? 1,
        stdout,
        stderr
      });
    });

    if (options.stdinText !== undefined) {
      child.stdin.write(options.stdinText);
      child.stdin.end();
    }
  });
}
