import assert from 'node:assert/strict';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import test from 'node:test';
import * as vscode from 'vscode';
import { DEFAULT_CONFIG } from '../src/config/defaults';
import { RalphStateManager } from '../src/ralph/stateManager';
import { Logger } from '../src/services/logger';

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
    show: () => undefined,
    dispose: () => undefined
  } as unknown as vscode.OutputChannel);
}

async function makeTempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ralph-codex-'));
}

test('inspectWorkspace reports missing Ralph files without creating them', async () => {
  const rootPath = await makeTempRoot();
  const stateManager = new RalphStateManager(new MemoryMemento(), createLogger());

  const snapshot = await stateManager.inspectWorkspace(rootPath, DEFAULT_CONFIG);

  assert.equal(snapshot.fileStatus.prdPath, false);
  assert.equal(snapshot.fileStatus.taskFilePath, false);
  assert.deepEqual(snapshot.createdPaths, []);
  await assert.rejects(fs.access(path.join(rootPath, '.ralph')));
});

test('ensureWorkspace seeds missing Ralph files and reports created paths', async () => {
  const rootPath = await makeTempRoot();
  const stateManager = new RalphStateManager(new MemoryMemento(), createLogger());

  const snapshot = await stateManager.ensureWorkspace(rootPath, DEFAULT_CONFIG);

  assert.equal(snapshot.fileStatus.prdPath, true);
  assert.equal(snapshot.fileStatus.progressPath, true);
  assert.equal(snapshot.fileStatus.taskFilePath, true);
  assert.equal(snapshot.fileStatus.stateFilePath, true);
  assert.ok(snapshot.createdPaths.includes(path.join(rootPath, '.ralph', 'state.json')));
  assert.ok(snapshot.createdPaths.includes(path.join(rootPath, '.ralph', 'prd.md')));
});

test('readTaskFileText wraps parse errors with the task file path', async () => {
  const rootPath = await makeTempRoot();
  const stateManager = new RalphStateManager(new MemoryMemento(), createLogger());
  const snapshot = await stateManager.ensureWorkspace(rootPath, DEFAULT_CONFIG);

  await fs.writeFile(snapshot.paths.taskFilePath, '{ invalid json\n', 'utf8');

  await assert.rejects(
    () => stateManager.readTaskFileText(snapshot.paths),
    /Failed to parse Ralph task file/
  );
});
