import { spawn } from 'child_process';

export const PROCESS_RUN_STDOUT_MAX_BYTES = 2 * 1024 * 1024; // 2 MiB
export const PROCESS_RUN_STDERR_MAX_BYTES = 512 * 1024; // 512 KiB

const PROCESS_FORCE_KILL_GRACE_MS = 5_000;
const PROCESS_STRICT_ENV_ALLOWLIST = false;
const SENSITIVE_ENV_KEY_PATTERN = /(?:^|_)(?:KEY|TOKEN|SECRET|PASSWORD|PRIVATE_KEY|ACCESS_KEY|API_KEY)$/i;
const DEFAULT_ALLOWED_ENV_KEYS = new Set([
  'PATH',
  'PATHEXT',
  'SystemRoot',
  'COMSPEC',
  'HOME',
  'USERPROFILE',
  'TMP',
  'TEMP',
  'TERM',
  'SHELL',
  'LANG',
  'LC_ALL',
  'PWD'
]);
const DEFAULT_ALLOWED_ENV_PREFIXES = [
  'RALPH_',
  'COPILOT_',
  'AZURE_',
  'OPENAI_',
  'ANTHROPIC_',
  'GEMINI_',
  'CLAUDE_',
  'CODEX_',
  'GITHUB_'
];

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
  public readonly stdout: string;
  public readonly stderr: string;
  public readonly exitCode: number | null;
  public readonly signal: NodeJS.Signals | null;

  public constructor(
    command: string,
    args: string[],
    timeoutMs: number,
    details: { stdout: string; stderr: string; exitCode: number | null; signal: NodeJS.Signals | null }
  ) {
    super(`Process timed out after ${timeoutMs}ms: ${command}`);
    this.name = 'ProcessTimeoutError';
    this.command = command;
    this.args = args;
    this.timeoutMs = timeoutMs;
    this.stdout = details.stdout;
    this.stderr = details.stderr;
    this.exitCode = details.exitCode;
    this.signal = details.signal;
  }
}

let processRunnerOverride: ProcessRunnerOverride | null = null;
let warnedSensitiveEnvPassThrough = false;

export function setProcessRunnerOverride(override: ProcessRunnerOverride | null): void {
  processRunnerOverride = override;
}

class RollingUtf8Buffer {
  private chunks: string[] = [];
  private totalBytes = 0;

  public constructor(private readonly maxBytes: number) {}

  public append(text: string): void {
    if (!text) {
      return;
    }

    let chunk = text;
    let chunkBytes = Buffer.byteLength(chunk, 'utf8');
    if (chunkBytes >= this.maxBytes) {
      chunk = sliceUtf8Tail(chunk, this.maxBytes);
      chunkBytes = Buffer.byteLength(chunk, 'utf8');
      this.chunks = [chunk];
      this.totalBytes = chunkBytes;
      return;
    }

    this.chunks.push(chunk);
    this.totalBytes += chunkBytes;
    this.trimFrontToLimit();
  }

  public toString(): string {
    return this.chunks.join('');
  }

  private trimFrontToLimit(): void {
    while (this.totalBytes > this.maxBytes && this.chunks.length > 0) {
      const first = this.chunks[0];
      const firstBytes = Buffer.byteLength(first, 'utf8');
      const overflowBytes = this.totalBytes - this.maxBytes;

      if (firstBytes <= overflowBytes) {
        this.chunks.shift();
        this.totalBytes -= firstBytes;
        continue;
      }

      const trimmed = sliceUtf8Tail(first, firstBytes - overflowBytes);
      this.chunks[0] = trimmed;
      this.totalBytes -= overflowBytes;
    }
  }
}

function sliceUtf8Tail(text: string, maxBytes: number): string {
  if (maxBytes <= 0) {
    return '';
  }

  const bytes = Buffer.from(text, 'utf8');
  if (bytes.length <= maxBytes) {
    return text;
  }

  return bytes.subarray(bytes.length - maxBytes).toString('utf8');
}

function looksSensitiveEnvKey(key: string): boolean {
  return SENSITIVE_ENV_KEY_PATTERN.test(key);
}

function isExplicitlyAllowedEnvKey(key: string): boolean {
  if (DEFAULT_ALLOWED_ENV_KEYS.has(key)) {
    return true;
  }

  return DEFAULT_ALLOWED_ENV_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function buildProcessEnv(envOverride?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (!PROCESS_STRICT_ENV_ALLOWLIST) {
    return envOverride ? { ...process.env, ...envOverride } : process.env;
  }

  const nextEnv: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) {
      continue;
    }
    if (isExplicitlyAllowedEnvKey(key)) {
      nextEnv[key] = value;
    }
  }

  if (envOverride) {
    for (const [key, value] of Object.entries(envOverride)) {
      nextEnv[key] = value;
    }
  }

  return nextEnv;
}

function maybeWarnSensitiveEnvPassThrough(command: string, envOverride?: NodeJS.ProcessEnv): void {
  if (warnedSensitiveEnvPassThrough || !envOverride || PROCESS_STRICT_ENV_ALLOWLIST) {
    return;
  }

  const sensitiveKeys = Object.keys(envOverride).filter(looksSensitiveEnvKey);
  if (sensitiveKeys.length === 0) {
    return;
  }

  warnedSensitiveEnvPassThrough = true;
  process.emitWarning(
    `runProcess("${command}") received sensitive environment override keys (${sensitiveKeys.join(', ')}). ` +
    'Values are forwarded to the child process but never logged by processRunner.'
  );
}

export async function runProcess(command: string, args: string[], options: ProcessRunOptions): Promise<ProcessRunResult> {
  if (processRunnerOverride) {
    return processRunnerOverride(command, args, options);
  }

  return new Promise((resolve, reject) => {
    maybeWarnSensitiveEnvPassThrough(command, options.env);
    const env = buildProcessEnv(options.env);
    const child = spawn(command, args, {
      cwd: options.cwd,
      shell: options.shell ?? false,
      env
    });

    const stdoutBuffer = new RollingUtf8Buffer(PROCESS_RUN_STDOUT_MAX_BYTES);
    const stderrBuffer = new RollingUtf8Buffer(PROCESS_RUN_STDERR_MAX_BYTES);
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let forceKillTimer: ReturnType<typeof setTimeout> | undefined;

    let exited = false;
    let settled = false;
    let closeCode: number | null = null;
    let closeSignal: NodeJS.Signals | null = null;

    const clearTimers = (): void => {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      if (forceKillTimer) {
        clearTimeout(forceKillTimer);
        forceKillTimer = undefined;
      }
    };

    const settle = (action: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimers();
      action();
    };

    if (options.timeoutMs !== undefined && options.timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        forceKillTimer = setTimeout(() => {
          if (!exited) {
            child.kill('SIGKILL');
          }
        }, PROCESS_FORCE_KILL_GRACE_MS);
      }, options.timeoutMs);
    }

    child.stdout?.on('data', (chunk) => {
      const text = chunk.toString();
      stdoutBuffer.append(text);
      options.onStdoutChunk?.(text);
    });

    child.stderr?.on('data', (chunk) => {
      const text = chunk.toString();
      stderrBuffer.append(text);
      options.onStderrChunk?.(text);
    });

    child.on('error', (error) => {
      settle(() => {
        reject(new ProcessLaunchError(command, args, error));
      });
    });

    child.on('close', (code, signal) => {
      exited = true;
      closeCode = code ?? null;
      closeSignal = signal ?? null;

      settle(() => {
        if (timedOut) {
          reject(new ProcessTimeoutError(command, args, options.timeoutMs!, {
            stdout: stdoutBuffer.toString(),
            stderr: stderrBuffer.toString(),
            exitCode: closeCode,
            signal: closeSignal
          }));
          return;
        }

        resolve({
          code: code ?? 1,
          stdout: stdoutBuffer.toString(),
          stderr: stderrBuffer.toString()
        });
      });
    });

    if (options.stdinText !== undefined && child.stdin) {
      child.stdin.write(options.stdinText);
      child.stdin.end();
    }
  });
}
