import * as fs from 'node:fs/promises';
import path from 'node:path';
import { createStdoutHost, type ShimLogSink } from './stdoutHost';
import { installVscodeShim } from './installVscodeShim';
import type { IVSCodeHost } from './types';
import {
  buildErrorReport,
  buildIterationReport,
  redactShimText,
  ShimError,
  type ShimReport
} from './contract';

class MemoryMemento {
  private readonly values = new Map<string, unknown>();

  public keys(): readonly string[] {
    return Array.from(this.values.keys());
  }

  public get<T>(key: string): T | undefined;
  public get<T>(key: string, defaultValue: T): T;
  public get<T>(key: string, defaultValue?: T): T | undefined {
    return this.values.has(key) ? this.values.get(key) as T : defaultValue;
  }

  public async update(key: string, value: unknown): Promise<void> {
    if (value === undefined) {
      this.values.delete(key);
      return;
    }

    this.values.set(key, value);
  }
}

function usage(): string {
  return 'Usage: node out/shim/main.js [--json] <workspace-path>';
}

interface ShimArgs {
  workspacePath: string;
  json: boolean;
}

/**
 * Pre-scans argv for `--json` so the output mode is known even when `parseArgs`
 * throws (e.g. `--json` with no workspace path). Without this, a parse-time
 * failure would leave the automation consumer with an exit code but nothing on
 * stdout, breaking the machine-readable contract for the callers who rely on it
 * most. Respects the bare `--` end-of-options separator, matching `parseArgs`:
 * a `--json` after `--` is a positional, not the flag.
 */
function wantsJson(argv: string[]): boolean {
  for (const arg of argv) {
    if (arg === '--') {
      break;
    }
    if (arg === '--json') {
      return true;
    }
  }
  return false;
}

function parseArgs(argv: string[]): ShimArgs {
  let json = false;
  // After a bare `--`, every remaining token is a positional regardless of its
  // spelling (the conventional end-of-options contract).
  let argsDone = false;
  const positionals: string[] = [];
  for (const arg of argv) {
    if (argsDone) {
      positionals.push(arg);
    } else if (arg === '--json') {
      json = true;
    } else if (arg === '--') {
      argsDone = true;
    } else if (arg.startsWith('--')) {
      throw new ShimError(`Unknown option: ${arg}\n${usage()}`, 'config');
    } else {
      positionals.push(arg);
    }
  }

  if (positionals.length === 0) {
    throw new ShimError(usage(), 'config');
  }
  if (positionals.length > 1) {
    throw new ShimError(`Expected a single workspace path.\n${usage()}`, 'config');
  }

  return { workspacePath: positionals[0], json };
}

async function runIteration(args: ShimArgs): Promise<ShimReport> {
  const workspaceRoot = path.resolve(args.workspacePath);
  const stat = await fs.stat(workspaceRoot).catch(() => null);
  if (!stat?.isDirectory()) {
    throw new ShimError(
      `Workspace path does not exist or is not a directory: ${workspaceRoot}`,
      'config'
    );
  }

  // In --json mode stdout must contain only the JSON report, so route human/log
  // output to stderr. Redact that stderr stream too, so the README's "free-text
  // fields are redacted" guarantee also holds for log output an automation
  // consumer might capture (e.g. into a CI log).
  const logSink: ShimLogSink = args.json
    ? (text) => process.stderr.write(redactShimText(text))
    : (text) => process.stdout.write(text);

  let host: IVSCodeHost;
  try {
    host = createStdoutHost(workspaceRoot, process.env, logSink);
  } catch (error) {
    // A malformed .ralph-config.json surfaces here as a config-category failure.
    throw new ShimError(error instanceof Error ? error.message : String(error), 'config');
  }
  installVscodeShim(workspaceRoot, host);

  const vscode = await import('vscode');
  const [{ Logger }, { RalphStateManager }, { CodexStrategyRegistry }, { RalphIterationEngine }] = await Promise.all([
    import('../services/logger'),
    import('../ralph/stateManager'),
    import('../codex/providerFactory'),
    import('../ralph/iterationEngine')
  ]);

  const logger = new Logger(host.outputChannel as never);
  const stateManager = new RalphStateManager(new MemoryMemento() as never, logger);
  const strategies = new CodexStrategyRegistry(logger);
  const engine = new RalphIterationEngine(stateManager, strategies, logger);

  const workspaceFolder = {
    uri: vscode.Uri.file(workspaceRoot),
    name: path.basename(workspaceRoot),
    index: 0
  };

  const run = await engine.runCliIteration(
    workspaceFolder as never,
    'singleExec',
    host.progress as never,
    { reachedIterationCap: false }
  );

  host.outputChannel.appendLine(`Ralph shim iteration ${run.result.iteration} finished: ${run.result.summary}`);
  return buildIterationReport(run.result);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  // Resolve the output mode before parsing, so a parse-time failure still emits
  // the JSON report on stdout rather than leaving a `--json` consumer empty-handed.
  const json = wantsJson(argv);
  let report: ShimReport;
  try {
    report = await runIteration(parseArgs(argv));
  } catch (error) {
    report = buildErrorReport(error);
  }

  if (json) {
    // Exactly one line of JSON on stdout: the machine-readable contract.
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } else if (!report.ok && report.error) {
    process.stderr.write(`${report.error.message}\n`);
  }

  process.exitCode = report.exitCode;
}

void main();
