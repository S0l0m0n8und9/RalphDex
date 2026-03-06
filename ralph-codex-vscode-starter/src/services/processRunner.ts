import { spawn } from 'child_process';

export interface ProcessRunOptions {
  cwd: string;
  stdinText?: string;
  onStdoutChunk?: (chunk: string) => void;
  onStderrChunk?: (chunk: string) => void;
  shell?: boolean;
}

export interface ProcessRunResult {
  code: number;
  stdout: string;
  stderr: string;
}

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

export async function runProcess(command: string, args: string[], options: ProcessRunOptions): Promise<ProcessRunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      shell: options.shell ?? process.platform === 'win32'
    });

    let stdout = '';
    let stderr = '';

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

    child.on('error', (error) => reject(new ProcessLaunchError(command, args, error)));
    child.on('close', (code) => {
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
