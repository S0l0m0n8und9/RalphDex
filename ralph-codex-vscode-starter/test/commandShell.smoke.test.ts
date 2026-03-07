import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import * as vscode from 'vscode';
import { activate } from '../src/extension';
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

function createExtensionContext(): vscode.ExtensionContext {
  return {
    subscriptions: [],
    workspaceState: new MemoryMemento()
  } as unknown as vscode.ExtensionContext;
}

function workspaceFolder(rootPath: string): vscode.WorkspaceFolder {
  return {
    uri: vscode.Uri.file(rootPath),
    name: path.basename(rootPath),
    index: 0
  };
}

async function makeTempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ralph-command-shell-'));
}

async function seedWorkspace(rootPath: string): Promise<void> {
  await fs.mkdir(path.join(rootPath, '.ralph', 'artifacts'), { recursive: true });
  await fs.writeFile(path.join(rootPath, '.ralph', 'prd.md'), '# Product / project brief\n\nKeep the extension safe.\n', 'utf8');
  await fs.writeFile(path.join(rootPath, '.ralph', 'progress.md'), '# Progress\n\n- Ready.\n', 'utf8');
  await fs.writeFile(path.join(rootPath, '.ralph', 'tasks.json'), JSON.stringify({
    version: 2,
    tasks: [
      { id: 'T1', title: 'Inspect guardrails', status: 'todo' }
    ]
  }, null, 2), 'utf8');
}

test.beforeEach(() => {
  const harness = vscodeTestHarness();
  harness.reset();
});

test('activate registers the key Ralph commands', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  activate(createExtensionContext());
  const commands = await vscode.commands.getCommands(true);

  assert.ok(commands.includes('ralphCodex.generatePrompt'));
  assert.ok(commands.includes('ralphCodex.runRalphIteration'));
  assert.ok(commands.includes('ralphCodex.runRalphLoop'));
  assert.ok(commands.includes('ralphCodex.showRalphStatus'));
  assert.ok(commands.includes('ralphCodex.openLatestRalphSummary'));
});

test('Show Ralph Status reports preflight details and can open the latest summary artifact', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);
  const latestSummaryPath = path.join(rootPath, '.ralph', 'artifacts', 'latest-summary.md');
  await fs.writeFile(latestSummaryPath, '# Ralph Iteration 3\n\nSummary body.\n', 'utf8');

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
  harness.setMessageChoice('Open Latest Summary');

  activate(createExtensionContext());
  await vscode.commands.executeCommand('ralphCodex.showRalphStatus');

  assert.deepEqual(harness.state.shownDocuments, [latestSummaryPath]);
  assert.equal(harness.state.infoMessages.at(-1)?.items.includes('Open Latest Summary'), true);
  const output = harness.getOutputLines('Ralph Codex').join('\n');
  assert.match(output, /# Ralph Status:/);
  assert.match(output, /## Preflight/);
  assert.match(output, /## Artifacts/);
});

test('Open Latest Ralph Summary explains when no summary artifact exists yet', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  activate(createExtensionContext());
  await vscode.commands.executeCommand('ralphCodex.openLatestRalphSummary');

  assert.equal(harness.state.shownDocuments.length, 0);
  assert.match(
    harness.state.infoMessages.at(-1)?.message ?? '',
    /No Ralph summary exists yet because no CLI iteration has completed and no preflight has been persisted/
  );
});

test('Open Latest Ralph Summary falls back to the latest preflight summary artifact', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);
  const latestPreflightSummaryPath = path.join(rootPath, '.ralph', 'artifacts', 'latest-preflight-summary.md');
  await fs.writeFile(latestPreflightSummaryPath, '# Ralph Preflight 1\n\nBlocked before execution.\n', 'utf8');

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  activate(createExtensionContext());
  await vscode.commands.executeCommand('ralphCodex.openLatestRalphSummary');

  assert.deepEqual(harness.state.shownDocuments, [latestPreflightSummaryPath]);
});
