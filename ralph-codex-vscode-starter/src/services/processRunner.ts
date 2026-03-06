import { spawn } from 'child_process';

export interface ProcessRunOptions {
  cwd: string;
  stdinText?: string;
  onStdoutChunk?: (chunk: string) => void;
  onStderrChunk?: (chunk: string) => void;
}

export interface ProcessRunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export async function runProcess(command: string, args: string[], options: ProcessRunOptions): Promise<ProcessRunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      shell: process.platform === 'win32'
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

    child.on('error', reject);
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
