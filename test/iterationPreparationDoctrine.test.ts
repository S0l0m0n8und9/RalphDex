import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import * as vscode from 'vscode';
import { createDoctrinePack } from '../src/ralph/doctrine';
import { prepareIterationContext } from '../src/ralph/iterationPreparation';
import { RalphStateManager } from '../src/ralph/stateManager';
import { RalphPersistedPreflightReport, RalphTaskFile } from '../src/ralph/types';
import { Logger } from '../src/services/logger';
import { vscodeTestHarness } from './support/vscodeTestHarness';

class MemoryMemento implements vscode.Memento {
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

function createLogger(): Logger {
  return new Logger({
    appendLine: () => undefined,
    append: () => undefined,
    show: () => undefined,
    dispose: () => undefined
  } as unknown as vscode.OutputChannel);
}

function workspaceFolder(rootPath: string): vscode.WorkspaceFolder {
  return {
    uri: vscode.Uri.file(rootPath),
    name: path.basename(rootPath),
    index: 0
  };
}

function progressReporter(): vscode.Progress<{ message?: string; increment?: number }> {
  return {
    report: () => undefined
  };
}

async function makeTempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ralph-iteration-prep-doctrine-'));
}

async function seedWorkspace(rootPath: string, taskFile: RalphTaskFile): Promise<void> {
  await fs.mkdir(path.join(rootPath, 'src'), { recursive: true });
  await fs.writeFile(path.join(rootPath, 'package.json'), JSON.stringify({
    name: 'ralph-iteration-prep-fixture',
    version: '1.0.0',
    scripts: {
      test: 'node -e "process.exit(0)"'
    }
  }, null, 2), 'utf8');
  await fs.writeFile(path.join(rootPath, 'src', 'feature.ts'), 'export const ready = true;\n', 'utf8');
  await fs.mkdir(path.join(rootPath, '.ralph'), { recursive: true });
  await fs.writeFile(path.join(rootPath, '.ralph', 'prd.md'), '# Product / project brief\n\nShip stable Ralph iterations.\n', 'utf8');
  await fs.writeFile(path.join(rootPath, '.ralph', 'progress.md'), '# Progress\n\n- Baseline created.\n', 'utf8');
  await fs.writeFile(path.join(rootPath, '.ralph', 'tasks.json'), `${JSON.stringify(taskFile, null, 2)}\n`, 'utf8');
}

async function prepare(rootPath: string, includeVerifierContext: boolean) {
  const logger = createLogger();
  const stateManager = new RalphStateManager(new MemoryMemento(), logger);

  return prepareIterationContext({
    workspaceFolder: workspaceFolder(rootPath),
    progress: progressReporter(),
    includeVerifierContext,
    configOverrides: { agentId: 'prep-test-agent' },
    stateManager,
    logger,
    persistBlockedPreflightBundle: async () => undefined,
    persistPreparedProvenanceBundle: async () => undefined
  });
}

test.beforeEach(() => {
  const harness = vscodeTestHarness();
  harness.reset();
  harness.setConfiguration({
    cliProvider: 'codex',
    codexCommandPath: process.execPath
  });
});

test('prepareIterationContext includes missing doctrine warning in prepare-prompt preflight artifacts without blocking readiness', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath, {
    version: 2,
    tasks: [
      { id: 'T1', title: 'Implement task', status: 'todo' }
    ]
  });

  const prepared = await prepare(rootPath, false);

  assert.equal(prepared.promptTarget, 'ideHandoff');
  assert.equal(prepared.preflightReport.ready, true);
  assert.ok(prepared.preflightReport.diagnostics.some((diagnostic) =>
    diagnostic.category === 'workspaceRuntime'
    && diagnostic.severity === 'warning'
    && diagnostic.code === 'doctrine_directory_missing'
  ));
  assert.match(prepared.preflightSummaryText, /- warning: Doctrine health: missing\. \.ralph\/doctrine has not been created for this workspace\./);

  const persisted = JSON.parse(
    await fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'iteration-001', 'preflight-report.json'), 'utf8')
  ) as RalphPersistedPreflightReport;
  assert.equal(persisted.ready, true);
  assert.ok(persisted.diagnostics.some((diagnostic) => diagnostic.code === 'doctrine_directory_missing'));
});

test('prepareIterationContext includes missing doctrine warning in CLI preflight artifacts without blocking execution readiness', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath, {
    version: 2,
    tasks: [
      { id: 'T1', title: 'Implement task', status: 'todo' }
    ]
  });

  const prepared = await prepare(rootPath, true);

  assert.equal(prepared.promptTarget, 'cliExec');
  assert.equal(prepared.preflightReport.ready, true);
  assert.ok(prepared.preflightReport.diagnostics.some((diagnostic) =>
    diagnostic.category === 'workspaceRuntime'
    && diagnostic.severity === 'warning'
    && diagnostic.code === 'doctrine_directory_missing'
  ));
  assert.match(prepared.preflightSummaryText, /- warning: Doctrine health: missing\. \.ralph\/doctrine has not been created for this workspace\./);
});

test('prepareIterationContext reports healthy doctrine as info and does not create a warning', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath, {
    version: 2,
    tasks: [
      { id: 'T1', title: 'Implement task', status: 'todo' }
    ]
  });
  await createDoctrinePack(rootPath, { generatedAt: '2026-04-29T00:00:00.000Z' });

  const prepared = await prepare(rootPath, false);

  const doctrineDiagnostics = prepared.preflightReport.diagnostics.filter((diagnostic) =>
    diagnostic.code.startsWith('doctrine_')
  );
  assert.ok(doctrineDiagnostics.some((diagnostic) =>
    diagnostic.category === 'workspaceRuntime'
    && diagnostic.severity === 'info'
    && diagnostic.code === 'doctrine_pack_healthy'
  ));
  assert.ok(!doctrineDiagnostics.some((diagnostic) => diagnostic.severity === 'warning'));
  assert.equal(prepared.preflightReport.ready, true);
});
