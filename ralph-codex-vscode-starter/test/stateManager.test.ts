import assert from 'node:assert/strict';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import test from 'node:test';
import * as vscode from 'vscode';
import { DEFAULT_CONFIG } from '../src/config/defaults';
import { RalphStateManager } from '../src/ralph/stateManager';
import { RalphIterationResult } from '../src/ralph/types';
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
  assert.equal(snapshot.fileStatus.artifactDir, true);
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

test('recordIteration serializes and reloads the machine-readable iteration result schema', async () => {
  const rootPath = await makeTempRoot();
  const stateManager = new RalphStateManager(new MemoryMemento(), createLogger());
  const snapshot = await stateManager.ensureWorkspace(rootPath, DEFAULT_CONFIG);
  const objectiveText = await stateManager.readObjectiveText(snapshot.paths);
  const result: RalphIterationResult = {
    schemaVersion: 1,
    iteration: 1,
    selectedTaskId: 'T1',
    promptKind: 'bootstrap',
    promptPath: path.join(rootPath, '.ralph', 'prompts', 'bootstrap-001.prompt.md'),
    artifactDir: path.join(rootPath, '.ralph', 'artifacts', 'iteration-001'),
    adapterUsed: 'cliExec',
    executionStatus: 'succeeded',
    verificationStatus: 'passed',
    completionClassification: 'partial_progress',
    followUpAction: 'continue_same_task',
    startedAt: '2026-03-07T00:00:00.000Z',
    finishedAt: '2026-03-07T00:10:00.000Z',
    phaseTimestamps: {
      inspectStartedAt: '2026-03-07T00:00:00.000Z',
      inspectFinishedAt: '2026-03-07T00:01:00.000Z',
      taskSelectedAt: '2026-03-07T00:01:00.000Z',
      promptGeneratedAt: '2026-03-07T00:02:00.000Z',
      executionStartedAt: '2026-03-07T00:03:00.000Z',
      executionFinishedAt: '2026-03-07T00:07:00.000Z',
      resultCollectedAt: '2026-03-07T00:07:30.000Z',
      verificationFinishedAt: '2026-03-07T00:09:00.000Z',
      classifiedAt: '2026-03-07T00:09:30.000Z',
      persistedAt: '2026-03-07T00:10:00.000Z'
    },
    summary: 'Selected T1 and made progress.',
    warnings: [],
    errors: [],
    execution: {
      exitCode: 0,
      stdoutPath: path.join(rootPath, '.ralph', 'artifacts', 'iteration-001', 'stdout.log'),
      stderrPath: path.join(rootPath, '.ralph', 'artifacts', 'iteration-001', 'stderr.log')
    },
    verification: {
      primaryCommand: 'npm test',
      validationFailureSignature: null,
      verifiers: []
    },
    diffSummary: null,
    noProgressSignals: [],
    stopReason: null
  };

  await stateManager.recordIteration(rootPath, snapshot.paths, snapshot.state, result, objectiveText);
  const reloaded = await stateManager.loadState(rootPath, snapshot.paths);

  assert.equal(reloaded.version, 2);
  assert.equal(reloaded.lastIteration?.selectedTaskId, 'T1');
  assert.equal(reloaded.lastIteration?.verification.primaryCommand, 'npm test');
  assert.equal(reloaded.iterationHistory.length, 1);
  assert.equal(reloaded.nextIteration, 2);
});
