import * as fs from 'node:fs/promises';
import path from 'node:path';
import { createStdoutHost } from './stdoutHost';
import { installVscodeShim } from './installVscodeShim';

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
  return 'Usage: node out/shim/main.js <workspace-path>';
}

async function main(): Promise<void> {
  const workspaceArg = process.argv[2];
  if (!workspaceArg) {
    throw new Error(usage());
  }

  const workspaceRoot = path.resolve(workspaceArg);
  const stat = await fs.stat(workspaceRoot).catch(() => null);
  if (!stat?.isDirectory()) {
    throw new Error(`Workspace path does not exist or is not a directory: ${workspaceRoot}`);
  }

  const host = createStdoutHost(workspaceRoot, process.env);
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
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
