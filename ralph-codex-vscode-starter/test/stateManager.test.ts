import assert from 'node:assert/strict';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import test from 'node:test';
import * as vscode from 'vscode';
import { DEFAULT_CONFIG } from '../src/config/defaults';
import { deriveRootPolicy } from '../src/ralph/rootPolicy';
import { RalphStateManager } from '../src/ralph/stateManager';
import { stringifyTaskFile } from '../src/ralph/taskFile';
import { RalphIterationResult, RalphTaskFile } from '../src/ralph/types';
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

function rootPolicy(rootPath: string) {
  return deriveRootPolicy({
    workspaceName: path.basename(rootPath),
    workspaceRootPath: rootPath,
    rootPath,
    rootSelection: {
      workspaceRootPath: rootPath,
      selectedRootPath: rootPath,
      strategy: 'workspaceRoot',
      summary: 'Using the workspace root because it already exposes shallow repo markers.',
      override: null,
      candidates: [
        {
          path: rootPath,
          relativePath: '.',
          markerCount: 1,
          markers: ['package.json']
        }
      ]
    },
    manifests: ['package.json'],
    projectMarkers: ['package.json'],
    packageManagers: ['npm'],
    packageManagerIndicators: ['package.json'],
    ciFiles: [],
    ciCommands: [],
    docs: [],
    sourceRoots: ['src'],
    tests: ['test'],
    lifecycleCommands: ['npm test'],
    validationCommands: ['npm test'],
    testSignals: [],
    notes: [],
    evidence: {
      rootEntries: ['package.json', 'src', 'test'],
      manifests: {
        checked: ['package.json'],
        matches: ['package.json'],
        emptyReason: null
      },
      sourceRoots: {
        checked: ['src'],
        matches: ['src'],
        emptyReason: null
      },
      tests: {
        checked: ['test'],
        matches: ['test'],
        emptyReason: null
      },
      docs: {
        checked: ['README.md'],
        matches: [],
        emptyReason: 'No docs matched among 1 shallow root checks.'
      },
      ciFiles: {
        checked: ['.github/workflows/*.yml'],
        matches: [],
        emptyReason: 'No CI files matched among 1 shallow root checks.'
      },
      packageManagers: {
        indicators: ['package.json'],
        detected: ['npm'],
        packageJsonPackageManager: 'npm',
        emptyReason: null
      },
      validationCommands: {
        selected: ['npm test'],
        packageJsonScripts: ['npm test'],
        makeTargets: [],
        justTargets: [],
        ciCommands: [],
        manifestSignals: [],
        emptyReason: null
      },
      lifecycleCommands: {
        selected: ['npm test'],
        packageJsonScripts: ['npm test'],
        makeTargets: [],
        justTargets: [],
        ciCommands: [],
        manifestSignals: [],
        emptyReason: null
      }
    },
    packageJson: {
      name: 'demo',
      packageManager: 'npm',
      hasWorkspaces: false,
      scriptNames: ['test'],
      lifecycleCommands: ['npm test'],
      validationCommands: ['npm test'],
      testSignals: []
    }
  });
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
    agentId: 'default',
    iteration: 1,
    selectedTaskId: 'T1',
    selectedTaskTitle: 'Seed task',
    promptKind: 'bootstrap',
    promptPath: path.join(rootPath, '.ralph', 'prompts', 'bootstrap-001.prompt.md'),
    artifactDir: path.join(rootPath, '.ralph', 'artifacts', 'iteration-001'),
    adapterUsed: 'cliExec',
    executionIntegrity: {
      promptTarget: 'cliExec',
      rootPolicy: rootPolicy(rootPath),
      templatePath: path.join(rootPath, 'prompt-templates', 'bootstrap.md'),
      taskValidationHint: null,
      effectiveValidationCommand: 'npm test',
      normalizedValidationCommandFrom: null,
      executionPlanPath: path.join(rootPath, '.ralph', 'artifacts', 'iteration-001', 'execution-plan.json'),
      promptArtifactPath: path.join(rootPath, '.ralph', 'artifacts', 'iteration-001', 'prompt.md'),
      promptHash: 'sha256:bootstrap001',
      promptByteLength: 512,
      executionPayloadHash: 'sha256:bootstrap001',
      executionPayloadMatched: true,
      mismatchReason: null,
      cliInvocationPath: path.join(rootPath, '.ralph', 'artifacts', 'iteration-001', 'cli-invocation.json')
    },
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
      message: 'codex exec completed successfully.',
      stdoutPath: path.join(rootPath, '.ralph', 'artifacts', 'iteration-001', 'stdout.log'),
      stderrPath: path.join(rootPath, '.ralph', 'artifacts', 'iteration-001', 'stderr.log')
    },
    verification: {
      taskValidationHint: null,
      effectiveValidationCommand: 'npm test',
      normalizedValidationCommandFrom: null,
      primaryCommand: 'npm test',
      validationFailureSignature: null,
      verifiers: []
    },
    backlog: {
      remainingTaskCount: 1,
      actionableTaskAvailable: true
    },
    diffSummary: null,
    noProgressSignals: [],
    remediation: null,
    stopReason: null
  };

  await stateManager.recordIteration(rootPath, snapshot.paths, snapshot.state, result, objectiveText);
  const reloaded = await stateManager.loadState(rootPath, snapshot.paths);

  assert.equal(reloaded.version, 2);
  assert.equal(reloaded.lastIteration?.selectedTaskId, 'T1');
  assert.equal(reloaded.lastIteration?.selectedTaskTitle, 'Seed task');
  assert.equal(reloaded.lastIteration?.agentId, 'default');
  assert.equal(reloaded.lastIteration?.executionIntegrity?.executionPayloadMatched, true);
  assert.equal(reloaded.lastIteration?.execution.message, 'codex exec completed successfully.');
  assert.equal(reloaded.lastIteration?.verification.primaryCommand, 'npm test');
  assert.equal(reloaded.lastIteration?.backlog.remainingTaskCount, 1);
  assert.equal(reloaded.iterationHistory.length, 1);
  assert.equal(reloaded.nextIteration, 2);
});

test('cleanupRuntimeArtifacts prunes historical generated artifacts while preserving durable state and latest evidence', async () => {
  const rootPath = await makeTempRoot();
  const stateManager = new RalphStateManager(new MemoryMemento(), createLogger());
  const snapshot = await stateManager.ensureWorkspace(rootPath, DEFAULT_CONFIG);
  const latestSummaryPath = path.join(snapshot.paths.artifactDir, 'latest-summary.md');
  const latestPromptEvidencePath = path.join(snapshot.paths.artifactDir, 'latest-prompt-evidence.json');
  const latestCliInvocationPath = path.join(snapshot.paths.artifactDir, 'latest-cli-invocation.json');
  const latestProvenanceSummaryPath = path.join(snapshot.paths.artifactDir, 'latest-provenance-summary.md');

  await fs.mkdir(path.join(snapshot.paths.artifactDir, 'iteration-001'), { recursive: true });
  await fs.mkdir(path.join(snapshot.paths.artifactDir, 'iteration-002'), { recursive: true });
  await fs.writeFile(path.join(snapshot.paths.artifactDir, 'iteration-001', 'summary.md'), 'old\n', 'utf8');
  await fs.writeFile(path.join(snapshot.paths.artifactDir, 'iteration-002', 'summary.md'), 'current\n', 'utf8');
  await fs.writeFile(path.join(snapshot.paths.promptDir, 'iteration-001.prompt.md'), 'old prompt\n', 'utf8');
  await fs.writeFile(path.join(snapshot.paths.promptDir, 'iteration-002.prompt.md'), 'current prompt\n', 'utf8');
  await fs.writeFile(path.join(snapshot.paths.runDir, 'iteration-001.transcript.md'), 'old transcript\n', 'utf8');
  await fs.writeFile(path.join(snapshot.paths.runDir, 'iteration-002.transcript.md'), 'current transcript\n', 'utf8');
  await fs.writeFile(path.join(snapshot.paths.logDir, 'old.log'), 'old log\n', 'utf8');
  await fs.mkdir(path.join(snapshot.paths.artifactDir, 'runs', 'run-i001-cli-20260307T000000Z'), { recursive: true });
  await fs.mkdir(path.join(snapshot.paths.artifactDir, 'runs', 'run-i002-cli-20260307T000500Z'), { recursive: true });
  await fs.writeFile(latestSummaryPath, '# Ralph Iteration 2\n\ncurrent\n', 'utf8');
  await fs.writeFile(latestPromptEvidencePath, JSON.stringify({
    kind: 'promptEvidence',
    iteration: 2,
    promptKind: 'iteration'
  }, null, 2), 'utf8');
  await fs.writeFile(latestCliInvocationPath, JSON.stringify({
    kind: 'cliInvocation',
    iteration: 2,
    transcriptPath: path.join(snapshot.paths.runDir, 'iteration-002.transcript.md')
  }, null, 2), 'utf8');
  await fs.writeFile(path.join(snapshot.paths.artifactDir, 'latest-provenance-bundle.json'), JSON.stringify({
    kind: 'provenanceBundle',
    provenanceId: 'run-i002-cli-20260307T000500Z',
    iteration: 2,
    promptKind: 'iteration',
    promptTarget: 'cliExec',
    trustLevel: 'verifiedCliExecution',
    status: 'executed',
    summary: 'current bundle',
    bundleDir: path.join(snapshot.paths.artifactDir, 'runs', 'run-i002-cli-20260307T000500Z')
  }, null, 2), 'utf8');
  await fs.writeFile(latestProvenanceSummaryPath, '# Ralph Provenance run-i002-cli-20260307T000500Z\n\ncurrent\n', 'utf8');
  await fs.writeFile(snapshot.paths.stateFilePath, `${JSON.stringify({
    version: 2,
    objectivePreview: 'Keep current Ralph evidence only.',
    nextIteration: 3,
    lastPromptKind: 'iteration',
    lastPromptPath: path.join(snapshot.paths.promptDir, 'iteration-002.prompt.md'),
    lastRun: {
      agentId: 'default',
      iteration: 2,
      mode: 'singleExec',
      promptKind: 'iteration',
      startedAt: '2026-03-07T00:00:00.000Z',
      finishedAt: '2026-03-07T00:05:00.000Z',
      status: 'succeeded',
      exitCode: 0,
      promptPath: path.join(snapshot.paths.promptDir, 'iteration-002.prompt.md'),
      transcriptPath: path.join(snapshot.paths.runDir, 'iteration-002.transcript.md'),
      summary: 'current'
    },
    runHistory: [
      {
        agentId: 'default',
        iteration: 1,
        mode: 'singleExec',
        promptKind: 'iteration',
        startedAt: '2026-03-07T00:00:00.000Z',
        finishedAt: '2026-03-07T00:01:00.000Z',
        status: 'succeeded',
        exitCode: 0,
        promptPath: path.join(snapshot.paths.promptDir, 'iteration-001.prompt.md'),
        transcriptPath: path.join(snapshot.paths.runDir, 'iteration-001.transcript.md'),
        summary: 'old'
      },
      {
        agentId: 'default',
        iteration: 2,
        mode: 'singleExec',
        promptKind: 'iteration',
        startedAt: '2026-03-07T00:02:00.000Z',
        finishedAt: '2026-03-07T00:05:00.000Z',
        status: 'succeeded',
        exitCode: 0,
        promptPath: path.join(snapshot.paths.promptDir, 'iteration-002.prompt.md'),
        transcriptPath: path.join(snapshot.paths.runDir, 'iteration-002.transcript.md'),
        summary: 'current'
      }
    ],
    lastIteration: {
      schemaVersion: 1,
      agentId: 'default',
      iteration: 2,
      selectedTaskId: 'T2',
      selectedTaskTitle: 'Current task',
      promptKind: 'iteration',
      promptPath: path.join(snapshot.paths.promptDir, 'iteration-002.prompt.md'),
      artifactDir: path.join(snapshot.paths.artifactDir, 'iteration-002'),
      adapterUsed: 'cliExec',
      executionStatus: 'succeeded',
      verificationStatus: 'passed',
      completionClassification: 'partial_progress',
      followUpAction: 'continue_same_task',
      startedAt: '2026-03-07T00:02:00.000Z',
      finishedAt: '2026-03-07T00:05:00.000Z',
      phaseTimestamps: {},
      summary: 'current',
      warnings: [],
      errors: [],
      execution: {
        exitCode: 0,
        message: 'ok',
        stdoutPath: path.join(snapshot.paths.artifactDir, 'iteration-002', 'stdout.log'),
        stderrPath: path.join(snapshot.paths.artifactDir, 'iteration-002', 'stderr.log'),
        transcriptPath: path.join(snapshot.paths.runDir, 'iteration-002.transcript.md')
      },
      verification: {
        taskValidationHint: null,
        effectiveValidationCommand: 'npm test',
        normalizedValidationCommandFrom: null,
        primaryCommand: 'npm test',
        validationFailureSignature: null,
        verifiers: []
      },
      backlog: {
        remainingTaskCount: 1,
        actionableTaskAvailable: true
      },
      diffSummary: null,
      noProgressSignals: [],
      remediation: null,
      stopReason: null
    },
    iterationHistory: [
      {
        schemaVersion: 1,
        agentId: 'default',
        iteration: 1,
        selectedTaskId: 'T1',
        selectedTaskTitle: 'Old task',
        promptKind: 'iteration',
        promptPath: path.join(snapshot.paths.promptDir, 'iteration-001.prompt.md'),
        artifactDir: path.join(snapshot.paths.artifactDir, 'iteration-001'),
        adapterUsed: 'cliExec',
        executionStatus: 'succeeded',
        verificationStatus: 'passed',
        completionClassification: 'partial_progress',
        followUpAction: 'continue_same_task',
        startedAt: '2026-03-07T00:00:00.000Z',
        finishedAt: '2026-03-07T00:01:00.000Z',
        phaseTimestamps: {},
        summary: 'old',
        warnings: [],
        errors: [],
        execution: {
          exitCode: 0,
          message: 'old',
          stdoutPath: path.join(snapshot.paths.artifactDir, 'iteration-001', 'stdout.log'),
          stderrPath: path.join(snapshot.paths.artifactDir, 'iteration-001', 'stderr.log'),
          transcriptPath: path.join(snapshot.paths.runDir, 'iteration-001.transcript.md')
        },
        verification: {
          taskValidationHint: null,
          effectiveValidationCommand: 'npm test',
          normalizedValidationCommandFrom: null,
          primaryCommand: 'npm test',
          validationFailureSignature: null,
          verifiers: []
        },
        backlog: {
          remainingTaskCount: 2,
          actionableTaskAvailable: true
        },
        diffSummary: null,
        noProgressSignals: [],
        remediation: null,
        stopReason: null
      }
    ],
    updatedAt: '2026-03-07T00:05:00.000Z'
  }, null, 2)}\n`, 'utf8');

  const result = await stateManager.cleanupRuntimeArtifacts(rootPath, DEFAULT_CONFIG);

  assert.equal(result.snapshot.state.nextIteration, 3);
  assert.equal(result.snapshot.state.lastIteration?.iteration, 2);
  assert.deepEqual(result.cleanup.generatedArtifacts.deletedIterationDirectories, ['iteration-001']);
  assert.deepEqual(result.cleanup.generatedArtifacts.deletedPromptFiles, ['iteration-001.prompt.md']);
  assert.deepEqual(result.cleanup.generatedArtifacts.deletedRunArtifactBaseNames, ['iteration-001']);
  assert.deepEqual(result.cleanup.provenanceBundles.deletedBundleIds, ['run-i001-cli-20260307T000000Z']);
  assert.deepEqual(result.cleanup.deletedLogFiles, ['old.log']);
  await assert.rejects(fs.access(path.join(snapshot.paths.artifactDir, 'iteration-001')));
  await assert.rejects(fs.access(path.join(snapshot.paths.promptDir, 'iteration-001.prompt.md')));
  await assert.rejects(fs.access(path.join(snapshot.paths.runDir, 'iteration-001.transcript.md')));
  await assert.rejects(fs.access(path.join(snapshot.paths.artifactDir, 'runs', 'run-i001-cli-20260307T000000Z')));
  await fs.access(path.join(snapshot.paths.artifactDir, 'iteration-002'));
  await fs.access(path.join(snapshot.paths.promptDir, 'iteration-002.prompt.md'));
  await fs.access(path.join(snapshot.paths.runDir, 'iteration-002.transcript.md'));
  await fs.access(path.join(snapshot.paths.artifactDir, 'runs', 'run-i002-cli-20260307T000500Z'));
  await fs.access(latestSummaryPath);
  await fs.access(latestPromptEvidencePath);
  await fs.access(latestCliInvocationPath);
  await fs.access(path.join(snapshot.paths.artifactDir, 'latest-provenance-bundle.json'));
  await fs.access(latestProvenanceSummaryPath);
  await fs.access(snapshot.paths.stateFilePath);
});

test('inspectTaskFile seeds an empty tasks.json through withTaskFileLock and returns the default structure', async () => {
  const rootPath = await makeTempRoot();
  const stateManager = new RalphStateManager(new MemoryMemento(), createLogger());
  const snapshot = await stateManager.ensureWorkspace(rootPath, DEFAULT_CONFIG);

  // Overwrite with empty content to trigger the seed path.
  await fs.writeFile(snapshot.paths.taskFilePath, '', 'utf8');

  const inspection = await stateManager.inspectTaskFile(snapshot.paths);

  assert.ok(inspection.taskFile, 'Should return a valid task file after seeding');

  const persisted = JSON.parse(await fs.readFile(snapshot.paths.taskFilePath, 'utf8')) as RalphTaskFile;
  assert.equal(persisted.version, 2);
  // The seeded file must contain the default seed tasks (T1, T2).
  assert.ok(persisted.tasks.length >= 1, 'Seeded file should contain at least one seed task');
  assert.equal(persisted.tasks[0]?.id, 'T1');
});

test('inspectTaskFile serializes concurrent seed calls so only one write wins', async () => {
  const rootPath = await makeTempRoot();
  const stateManager = new RalphStateManager(new MemoryMemento(), createLogger());
  const snapshot = await stateManager.ensureWorkspace(rootPath, DEFAULT_CONFIG);

  // Start with empty file so all concurrent callers hit the seed path.
  await fs.writeFile(snapshot.paths.taskFilePath, '', 'utf8');

  // Fire three concurrent inspects; all must resolve without error and
  // the file must remain valid JSON afterwards.
  const results = await Promise.all([
    stateManager.inspectTaskFile(snapshot.paths),
    stateManager.inspectTaskFile(snapshot.paths),
    stateManager.inspectTaskFile(snapshot.paths)
  ]);

  for (const result of results) {
    assert.ok(result.taskFile, 'Each concurrent inspect must return a valid task file');
  }

  const raw = await fs.readFile(snapshot.paths.taskFilePath, 'utf8');
  const persisted = JSON.parse(raw) as RalphTaskFile;
  assert.equal(persisted.version, 2);
  assert.ok(persisted.tasks.length >= 1, 'Seeded file should contain seed tasks');
});

test('inspectTaskFile migrates a v1 tasks.json through withTaskFileLock and persists the normalised form', async () => {
  const rootPath = await makeTempRoot();
  const stateManager = new RalphStateManager(new MemoryMemento(), createLogger());
  const snapshot = await stateManager.ensureWorkspace(rootPath, DEFAULT_CONFIG);

  // Write a minimal v1-style file (no version field, triggers migration).
  const v1Content = stringifyTaskFile({ version: 1 as 2, tasks: [{ id: 'T1', title: 'Old task', status: 'todo' }] });
  await fs.writeFile(snapshot.paths.taskFilePath, v1Content, 'utf8');

  const inspection = await stateManager.inspectTaskFile(snapshot.paths);

  assert.ok(inspection.taskFile, 'Should return a valid task file after migration');
  assert.equal(inspection.taskFile?.tasks[0]?.id, 'T1');
  assert.equal(inspection.migrated, true);

  const persisted = JSON.parse(await fs.readFile(snapshot.paths.taskFilePath, 'utf8')) as RalphTaskFile;
  assert.equal(persisted.version, 2);
});
