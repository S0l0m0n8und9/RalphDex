import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import * as vscode from 'vscode';
import { DEFAULT_CONFIG } from '../src/config/defaults';
import { CodexExecRequest, CodexExecResult } from '../src/codex/types';
import { hashText } from '../src/ralph/integrity';
import { RalphIterationEngine, RalphIterationEngineHooks } from '../src/ralph/iterationEngine';
import { RalphStateManager } from '../src/ralph/stateManager';
import { resolveStaleClaim } from '../src/ralph/taskFile';
import { RalphTaskFile } from '../src/ralph/types';
import { Logger } from '../src/services/logger';
import {
  initializeFakeGitRepository
} from './support/processTestHarness';
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
  return fs.mkdtemp(path.join(os.tmpdir(), 'ralph-engine-'));
}

async function appendProgress(rootPath: string, line: string): Promise<void> {
  await fs.appendFile(path.join(rootPath, '.ralph', 'progress.md'), `\n- ${line}\n`, 'utf8');
}

async function updateTaskFile(rootPath: string, transform: (taskFile: RalphTaskFile) => RalphTaskFile): Promise<void> {
  const target = path.join(rootPath, '.ralph', 'tasks.json');
  const taskFile = JSON.parse(await fs.readFile(target, 'utf8')) as RalphTaskFile;
  await fs.writeFile(target, `${JSON.stringify(transform(taskFile), null, 2)}\n`, 'utf8');
}

function completionReport(report: Record<string, unknown>, preamble = 'Structured completion report follows.'): string {
  return `${preamble}\n\n\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\``;
}

async function seedWorkspace(rootPath: string, taskFile: RalphTaskFile): Promise<void> {
  await fs.mkdir(path.join(rootPath, 'src'), { recursive: true });
  await fs.writeFile(path.join(rootPath, 'package.json'), JSON.stringify({
    name: 'ralph-integration-fixture',
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

async function seedNestedWorkspace(rootPath: string, childDirectory: string, taskFile: RalphTaskFile): Promise<string> {
  const repoRoot = path.join(rootPath, childDirectory);
  await fs.mkdir(path.join(repoRoot, 'src'), { recursive: true });
  await fs.mkdir(path.join(repoRoot, 'test'), { recursive: true });
  await fs.writeFile(path.join(repoRoot, 'package.json'), JSON.stringify({
    name: 'nested-fixture',
    version: '1.0.0',
    scripts: {
      validate: 'node -e "require(\'node:fs\').writeFileSync(\'validate.cwd.txt\', process.cwd())"',
      test: 'node -e "process.exit(0)"'
    }
  }, null, 2), 'utf8');
  await fs.writeFile(path.join(repoRoot, 'src', 'feature.ts'), 'export const ready = true;\n', 'utf8');
  await fs.mkdir(path.join(rootPath, '.ralph'), { recursive: true });
  await fs.writeFile(path.join(rootPath, '.ralph', 'prd.md'), '# Product / project brief\n\nShip stable Ralph iterations.\n', 'utf8');
  await fs.writeFile(path.join(rootPath, '.ralph', 'progress.md'), '# Progress\n\n- Baseline created.\n', 'utf8');
  await fs.writeFile(path.join(rootPath, '.ralph', 'tasks.json'), `${JSON.stringify(taskFile, null, 2)}\n`, 'utf8');
  return repoRoot;
}

async function initGitRepo(rootPath: string): Promise<void> {
  await initializeFakeGitRepository(rootPath);
}

interface MockExecStep {
  run(request: CodexExecRequest): Promise<{
    exitCode?: number;
    stdout?: string;
    stderr?: string;
    lastMessage?: string;
  }>;
}

class MockStrategyRegistry {
  private index = 0;

  public constructor(private readonly steps: MockExecStep[]) {}

  public configureCliProvider(): void {
    // No-op for mock — provider selection is not relevant in tests.
  }

  public getCliExecStrategy(): { runExec: (request: CodexExecRequest) => Promise<CodexExecResult> } {
    return {
      runExec: async (request) => {
        const step = this.steps[this.index] ?? this.steps[this.steps.length - 1];
        this.index += 1;

        const outcome = await step.run(request);
        const stdout = outcome.stdout ?? '';
        const stderr = outcome.stderr ?? '';
        const lastMessage = outcome.lastMessage ?? 'Mock Codex execution completed.';

        await fs.mkdir(path.dirname(request.transcriptPath), { recursive: true });
        await fs.writeFile(request.transcriptPath, `# Transcript\n\n${lastMessage}\n`, 'utf8');
        await fs.writeFile(request.lastMessagePath, `${lastMessage}\n`, 'utf8');

        return {
          strategy: 'cliExec',
          success: (outcome.exitCode ?? 0) === 0,
          message: lastMessage,
          warnings: [],
          exitCode: outcome.exitCode ?? 0,
          stdout,
          stderr,
          args: ['exec', '-'],
          stdinHash: hashText(request.prompt),
          transcriptPath: request.transcriptPath,
          lastMessagePath: request.lastMessagePath,
          lastMessage
        };
      }
    };
  }
}

function createEngine(
  steps: MockExecStep[],
  workspaceState = new MemoryMemento(),
  hooks?: RalphIterationEngineHooks
): {
  engine: RalphIterationEngine;
  stateManager: RalphStateManager;
} {
  const logger = createLogger();
  const stateManager = new RalphStateManager(workspaceState, logger);
  const engine = new RalphIterationEngine(
    stateManager,
    new MockStrategyRegistry(steps) as never,
    logger,
    hooks
  );

  return { engine, stateManager };
}

test.beforeEach(() => {
  const harness = vscodeTestHarness();
  harness.reset();
});

test('runCliIteration records successful progress, artifacts, and state persistence across iterations', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath, {
    version: 2,
    tasks: [
      { id: 'T1', title: 'Implement parent task', status: 'todo' },
      { id: 'T2', title: 'Follow-up task', status: 'todo' }
    ]
  });
  await initGitRepo(rootPath);

  const harness = vscodeTestHarness();
  harness.setConfiguration({
    generatedArtifactRetentionCount: 1,
    verifierModes: ['gitDiff', 'taskState'],
    gitCheckpointMode: 'snapshotAndDiff'
  });
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  const sharedMemento = new MemoryMemento();
  const first = createEngine([
    {
      run: async () => {
        await fs.writeFile(path.join(rootPath, 'README.md'), '# iteration one\n', 'utf8');
        return {
          stdout: 'updated README.md',
          lastMessage: completionReport({
            selectedTaskId: 'T1',
            requestedStatus: 'in_progress',
            progressNote: 'Iteration one updated README.md.',
            validationRan: 'npm test'
          }, 'Iteration one made progress.')
        };
      }
    }
  ], sharedMemento);

  const firstRun = await first.engine.runCliIteration(workspaceFolder(rootPath), 'loop', progressReporter(), {
    reachedIterationCap: false
  });

  assert.equal(firstRun.result.completionClassification, 'partial_progress');
  assert.equal(firstRun.result.verificationStatus, 'passed');
  assert.equal(firstRun.loopDecision.shouldContinue, true);
  assert.equal(firstRun.loopDecision.stopReason, null);
  assert.equal(firstRun.result.stopReason, null);
  assert.equal(firstRun.result.completionReportStatus, 'applied');
  assert.equal(firstRun.result.selectedTaskId, 'T1');
  assert.equal(firstRun.result.selectedTaskTitle, 'Implement parent task');

  const iterationDir = path.join(rootPath, '.ralph', 'artifacts', 'iteration-001');
  await assert.doesNotReject(fs.access(path.join(iterationDir, 'summary.md')));
  await assert.doesNotReject(fs.access(path.join(iterationDir, 'preflight-report.json')));
  await assert.doesNotReject(fs.access(path.join(iterationDir, 'preflight-summary.md')));
  await assert.doesNotReject(fs.access(path.join(iterationDir, 'prompt.md')));
  await assert.doesNotReject(fs.access(path.join(iterationDir, 'prompt-evidence.json')));
  await assert.doesNotReject(fs.access(path.join(iterationDir, 'execution-plan.json')));
  await assert.doesNotReject(fs.access(path.join(iterationDir, 'cli-invocation.json')));
  await assert.doesNotReject(fs.access(path.join(rootPath, '.ralph', 'artifacts', 'latest-summary.md')));
  await assert.doesNotReject(fs.access(path.join(rootPath, '.ralph', 'artifacts', 'latest-result.json')));
  await assert.doesNotReject(fs.access(path.join(rootPath, '.ralph', 'artifacts', 'latest-preflight-report.json')));
  await assert.doesNotReject(fs.access(path.join(rootPath, '.ralph', 'artifacts', 'latest-preflight-summary.md')));
  await assert.doesNotReject(fs.access(path.join(rootPath, '.ralph', 'artifacts', 'latest-prompt.md')));
  await assert.doesNotReject(fs.access(path.join(rootPath, '.ralph', 'artifacts', 'latest-prompt-evidence.json')));
  await assert.doesNotReject(fs.access(path.join(rootPath, '.ralph', 'artifacts', 'latest-execution-plan.json')));
  await assert.doesNotReject(fs.access(path.join(rootPath, '.ralph', 'artifacts', 'latest-cli-invocation.json')));
  await assert.doesNotReject(fs.access(path.join(rootPath, '.ralph', 'artifacts', 'latest-provenance-bundle.json')));
  await assert.doesNotReject(fs.access(path.join(rootPath, '.ralph', 'artifacts', 'latest-provenance-summary.md')));

  const executionPlan = JSON.parse(await fs.readFile(path.join(iterationDir, 'execution-plan.json'), 'utf8')) as {
    provenanceId: string;
    promptKind: string;
    promptHash: string;
    promptArtifactPath: string;
  };
  const promptEvidence = JSON.parse(await fs.readFile(path.join(iterationDir, 'prompt-evidence.json'), 'utf8')) as {
    provenanceId: string;
    inputs: {
      repoContextSnapshot: {
        rootPath: string;
        manifests: string[];
      };
    };
  };
  const promptArtifact = await fs.readFile(path.join(iterationDir, 'prompt.md'), 'utf8');
  assert.equal(executionPlan.promptKind, 'bootstrap');
  assert.equal(executionPlan.promptHash, hashText(promptArtifact));
  assert.equal(executionPlan.promptArtifactPath, path.join(iterationDir, 'prompt.md'));
  assert.match(executionPlan.provenanceId, /^run-i001-cli-/);
  assert.equal(promptEvidence.provenanceId, executionPlan.provenanceId);
  assert.equal(promptEvidence.inputs.repoContextSnapshot.rootPath, rootPath);
  assert.ok(promptEvidence.inputs.repoContextSnapshot.manifests.includes('package.json'));

  const cliInvocation = JSON.parse(await fs.readFile(path.join(iterationDir, 'cli-invocation.json'), 'utf8')) as {
    provenanceId: string;
    stdinHash: string;
    promptHash: string;
    promptArtifactPath: string;
    transcriptPath: string;
    lastMessagePath: string;
  };
  assert.equal(cliInvocation.stdinHash, executionPlan.promptHash);
  assert.equal(cliInvocation.promptHash, executionPlan.promptHash);
  assert.equal(cliInvocation.promptArtifactPath, executionPlan.promptArtifactPath);
  assert.equal(cliInvocation.provenanceId, executionPlan.provenanceId);

  const latestResult = JSON.parse(await fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-result.json'), 'utf8')) as {
    promptPath: string;
    transcriptPath: string | null;
    lastMessagePath: string | null;
    artifactDir: string;
  };
  assert.equal(latestResult.artifactDir, iterationDir);
  assert.equal(latestResult.promptPath, path.join(iterationDir, 'prompt.md'));
  assert.equal(latestResult.transcriptPath, cliInvocation.transcriptPath);
  assert.equal(latestResult.lastMessagePath, cliInvocation.lastMessagePath);

  const bundle = JSON.parse(await fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-provenance-bundle.json'), 'utf8')) as {
    provenanceId: string;
    promptHash: string;
    executionPlanHash: string;
    promptArtifactPath: string;
    executionPlanPath: string;
    cliInvocationPath: string;
    iterationResultPath: string;
    status: string;
  };
  assert.equal(bundle.provenanceId, executionPlan.provenanceId);
  assert.equal(bundle.promptHash, executionPlan.promptHash);
  assert.equal(bundle.promptArtifactPath, path.join(rootPath, '.ralph', 'artifacts', 'runs', bundle.provenanceId, 'prompt.md'));
  assert.equal(bundle.executionPlanPath, path.join(rootPath, '.ralph', 'artifacts', 'runs', bundle.provenanceId, 'execution-plan.json'));
  assert.equal(bundle.cliInvocationPath, path.join(rootPath, '.ralph', 'artifacts', 'runs', bundle.provenanceId, 'cli-invocation.json'));
  assert.equal(bundle.iterationResultPath, path.join(rootPath, '.ralph', 'artifacts', 'runs', bundle.provenanceId, 'iteration-result.json'));
  assert.equal(bundle.status, 'executed');

  const reloadedState = await first.stateManager.loadState(rootPath, first.stateManager.resolvePaths(rootPath, DEFAULT_CONFIG));
  assert.equal(reloadedState.nextIteration, 2);
  assert.equal(reloadedState.iterationHistory.length, 1);
  assert.equal(reloadedState.lastIteration?.selectedTaskTitle, 'Implement parent task');
  assert.equal(reloadedState.lastIteration?.executionIntegrity?.executionPayloadMatched, true);
  assert.equal(reloadedState.lastIteration?.completionReportStatus, 'applied');

  const firstTaskFile = JSON.parse(await fs.readFile(path.join(rootPath, '.ralph', 'tasks.json'), 'utf8')) as RalphTaskFile;
  assert.equal(firstTaskFile.tasks.find((task) => task.id === 'T1')?.status, 'in_progress');
  const firstProgress = await fs.readFile(path.join(rootPath, '.ralph', 'progress.md'), 'utf8');
  assert.match(firstProgress, /Iteration one updated README\.md\./);

  const second = createEngine([
    {
      run: async () => {
        await fs.writeFile(path.join(rootPath, 'docs-notes.md'), 'Iteration two docs update.\n', 'utf8');
        return {
          stdout: 'completed parent task',
          lastMessage: completionReport({
            selectedTaskId: 'T1',
            requestedStatus: 'done',
            progressNote: 'Iteration two completed T1.',
            validationRan: 'npm test'
          }, 'Iteration two completed the selected task.')
        };
      }
    }
  ], sharedMemento);

  const secondRun = await second.engine.runCliIteration(workspaceFolder(rootPath), 'loop', progressReporter(), {
    reachedIterationCap: false
  });

  assert.equal(secondRun.result.iteration, 2);
  assert.equal(secondRun.result.completionClassification, 'complete');
  assert.equal(secondRun.result.followUpAction, 'continue_next_task');
  assert.equal(secondRun.result.stopReason, null);
  assert.equal(secondRun.result.backlog.remainingTaskCount, 1);
  assert.equal(secondRun.result.backlog.actionableTaskAvailable, true);
  assert.equal(secondRun.loopDecision.shouldContinue, true);
  assert.equal(secondRun.result.completionReportStatus, 'applied');

  await assert.doesNotReject(fs.access(firstRun.prepared.promptPath));
  await assert.doesNotReject(fs.access(firstRun.result.artifactDir));
  await assert.doesNotReject(fs.access(firstRun.result.execution.transcriptPath!));
  await assert.doesNotReject(fs.access(firstRun.result.execution.lastMessagePath!));
  await assert.doesNotReject(fs.access(secondRun.prepared.promptPath));
  await assert.doesNotReject(fs.access(secondRun.result.artifactDir));
  await assert.doesNotReject(fs.access(secondRun.result.execution.transcriptPath!));
  await assert.doesNotReject(fs.access(secondRun.result.execution.lastMessagePath!));

  const reloadedFinalState = await second.stateManager.loadState(rootPath, second.stateManager.resolvePaths(rootPath, DEFAULT_CONFIG));
  assert.equal(reloadedFinalState.runHistory.length, 2);
  assert.equal(reloadedFinalState.iterationHistory.length, 2);
  assert.equal(reloadedFinalState.runHistory[0]?.transcriptPath, firstRun.result.execution.transcriptPath);
  assert.equal(reloadedFinalState.runHistory[1]?.transcriptPath, secondRun.result.execution.transcriptPath);
  assert.equal(reloadedFinalState.iterationHistory[0]?.artifactDir, firstRun.result.artifactDir);
  assert.equal(reloadedFinalState.iterationHistory[1]?.artifactDir, secondRun.result.artifactDir);

  const latestSummary = await fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-summary.md'), 'utf8');
  assert.match(latestSummary, /Backlog remaining: 1/);
  assert.doesNotMatch(latestSummary, /Stop reason: task_marked_complete/);

  const finalTaskFile = JSON.parse(await fs.readFile(path.join(rootPath, '.ralph', 'tasks.json'), 'utf8')) as RalphTaskFile;
  assert.equal(finalTaskFile.tasks.find((task) => task.id === 'T1')?.status, 'done');
  const finalProgress = await fs.readFile(path.join(rootPath, '.ralph', 'progress.md'), 'utf8');
  assert.match(finalProgress, /Iteration one updated README\.md\./);
  assert.match(finalProgress, /Iteration two completed T1\./);
});

test('runCliIteration persists blocked preflight evidence before throwing', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath, {
    version: 2,
    tasks: [
      { id: 'T1', title: 'Broken dependency graph', status: 'todo', dependsOn: ['MISSING'] }
    ]
  });

  const harness = vscodeTestHarness();
  harness.setConfiguration({
    cliProvider: 'codex',
    codexCommandPath: '/tmp/ralph-codex-missing/bin/codex'
  });
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  const run = createEngine([{ run: async () => ({ lastMessage: 'Should not execute.' }) }]);

  await assert.rejects(
    () => run.engine.runCliIteration(workspaceFolder(rootPath), 'singleExec', progressReporter(), {
      reachedIterationCap: false
    }),
    /Ralph preflight blocked iteration start/
  );

  const iterationDir = path.join(rootPath, '.ralph', 'artifacts', 'iteration-001');
  const preflightReport = JSON.parse(await fs.readFile(path.join(iterationDir, 'preflight-report.json'), 'utf8')) as {
    provenanceId: string;
    blocked: boolean;
    ready: boolean;
    diagnostics: Array<{ code: string }>;
  };
  const latestSummary = await fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-summary.md'), 'utf8');
  const latestBundle = JSON.parse(await fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-provenance-bundle.json'), 'utf8')) as {
    provenanceId: string;
    status: string;
    promptArtifactPath: string | null;
  };

  assert.equal(preflightReport.ready, false);
  assert.equal(preflightReport.blocked, true);
  const diagnosticCodes = preflightReport.diagnostics.map((diagnostic) => diagnostic.code);
  assert.ok(diagnosticCodes.includes('codex_cli_missing'));
  assert.ok(diagnosticCodes.includes('invalid_dependency_reference'));
  assert.match(latestSummary, /Preflight blocked before Codex execution started/);
  assert.equal(latestBundle.provenanceId, preflightReport.provenanceId);
  assert.equal(latestBundle.status, 'blocked');
  assert.equal(latestBundle.promptArtifactPath, null);
  await assert.rejects(fs.access(path.join(iterationDir, 'task-remediation.json')));
  await assert.rejects(fs.access(path.join(rootPath, '.ralph', 'artifacts', 'latest-remediation.json')));
});

test('runCliIteration does not emit remediation artifacts when repeated preflight blocks prevent execution from starting', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath, {
    version: 2,
    tasks: [
      { id: 'T1', title: 'Broken dependency graph', status: 'todo', dependsOn: ['MISSING'] }
    ]
  });

  const sharedMemento = new MemoryMemento();
  const harness = vscodeTestHarness();
  harness.setConfiguration({
    cliProvider: 'codex',
    codexCommandPath: '/tmp/ralph-codex-missing/bin/codex'
  });
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  const first = createEngine([], sharedMemento);
  await assert.rejects(
    () => first.engine.runCliIteration(workspaceFolder(rootPath), 'loop', progressReporter(), {
      reachedIterationCap: false
    }),
    /Ralph preflight blocked iteration start/
  );

  const second = createEngine([], sharedMemento);
  await assert.rejects(
    () => second.engine.runCliIteration(workspaceFolder(rootPath), 'loop', progressReporter(), {
      reachedIterationCap: false
    }),
    /Ralph preflight blocked iteration start/
  );

  // Each blocked call allocates a unique iteration number, so two separate
  // preflight-report.json files are created (one per call). Neither iteration
  // should produce a task-remediation.json or latest-remediation.json because
  // execution never started.
  const iterationDir1 = path.join(rootPath, '.ralph', 'artifacts', 'iteration-001');
  const iterationDir2 = path.join(rootPath, '.ralph', 'artifacts', 'iteration-002');
  await assert.doesNotReject(fs.access(path.join(iterationDir1, 'preflight-report.json')));
  await assert.rejects(fs.access(path.join(iterationDir1, 'task-remediation.json')));
  await assert.doesNotReject(fs.access(path.join(iterationDir2, 'preflight-report.json')));
  await assert.rejects(fs.access(path.join(iterationDir2, 'task-remediation.json')));
  await assert.rejects(fs.access(path.join(rootPath, '.ralph', 'artifacts', 'latest-remediation.json')));
  const latestSummary = await fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-summary.md'), 'utf8');
  assert.match(latestSummary, /Preflight blocked before Codex execution started/);
});

test('runCliIteration keeps state-referenced generated artifacts when blocked preflight cleanup runs', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath, {
    version: 2,
    tasks: [
      { id: 'T1', title: 'Advance a task before a blocked retry', status: 'todo' }
    ]
  });

  const sharedMemento = new MemoryMemento();
  const harness = vscodeTestHarness();
  harness.setConfiguration({
    generatedArtifactRetentionCount: 1,
    verifierModes: ['taskState'],
    gitCheckpointMode: 'off'
  });
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  const first = createEngine([
    {
      run: async () => ({
        stdout: 'first iteration changed src/feature.ts',
        lastMessage: completionReport({
          selectedTaskId: 'T1',
          requestedStatus: 'in_progress',
          progressNote: 'Iteration one made durable progress.',
          validationRan: 'npm test'
        }, 'Iteration one made progress.')
      })
    }
  ], sharedMemento);

  const firstRun = await first.engine.runCliIteration(workspaceFolder(rootPath), 'loop', progressReporter(), {
    reachedIterationCap: false
  });

  assert.equal(firstRun.result.iteration, 1);
  assert.equal(firstRun.result.completionClassification, 'partial_progress');
  await assert.doesNotReject(fs.access(firstRun.prepared.promptPath));
  await assert.doesNotReject(fs.access(firstRun.result.artifactDir));
  await assert.doesNotReject(fs.access(firstRun.result.execution.transcriptPath!));
  await assert.doesNotReject(fs.access(firstRun.result.execution.lastMessagePath!));

  harness.setConfiguration({
    cliProvider: 'codex',
    generatedArtifactRetentionCount: 1,
    verifierModes: ['taskState'],
    gitCheckpointMode: 'off',
    codexCommandPath: '/tmp/ralph-codex-missing/bin/codex'
  });

  const second = createEngine([], sharedMemento);

  await assert.rejects(
    () => second.engine.runCliIteration(workspaceFolder(rootPath), 'loop', progressReporter(), {
      reachedIterationCap: false
    }),
    /Ralph preflight blocked iteration start/
  );

  const blockedIterationDir = path.join(rootPath, '.ralph', 'artifacts', 'iteration-002');
  await assert.doesNotReject(fs.access(blockedIterationDir));
  await assert.doesNotReject(fs.access(path.join(blockedIterationDir, 'preflight-report.json')));
  await assert.doesNotReject(fs.access(path.join(blockedIterationDir, 'preflight-summary.md')));

  await assert.doesNotReject(fs.access(firstRun.prepared.promptPath));
  await assert.doesNotReject(fs.access(firstRun.result.artifactDir));
  await assert.doesNotReject(fs.access(firstRun.result.execution.transcriptPath!));
  await assert.doesNotReject(fs.access(firstRun.result.execution.lastMessagePath!));

  const state = JSON.parse(await fs.readFile(path.join(rootPath, '.ralph', 'state.json'), 'utf8')) as {
    lastPromptPath: string;
    lastRun: { transcriptPath: string; lastMessagePath: string };
    lastIteration: { artifactDir: string };
  };
  assert.equal(state.lastPromptPath, firstRun.prepared.promptPath);
  assert.equal(state.lastRun.transcriptPath, firstRun.result.execution.transcriptPath);
  assert.equal(state.lastRun.lastMessagePath, firstRun.result.execution.lastMessagePath);
  assert.equal(state.lastIteration.artifactDir, firstRun.result.artifactDir);
});

test('runCliIteration keeps an older blocked integrity iteration when latest provenance failure still references it', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath, {
    version: 2,
    tasks: [
      { id: 'T1', title: 'Recover from launch-integrity failure', status: 'todo' }
    ]
  });

  const sharedMemento = new MemoryMemento();
  const harness = vscodeTestHarness();
  harness.setConfiguration({
    generatedArtifactRetentionCount: 1,
    verifierModes: ['taskState'],
    gitCheckpointMode: 'off'
  });
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  const failingRun = createEngine([
    { run: async () => ({ lastMessage: 'Should not execute.' }) }
  ], sharedMemento, {
    beforeCliExecutionIntegrityCheck: async (prepared) => {
      const executionPlan = JSON.parse(await fs.readFile(prepared.executionPlanPath, 'utf8')) as Record<string, unknown>;
      executionPlan.selectedTaskTitle = 'Tampered after planning';
      await fs.writeFile(prepared.executionPlanPath, `${JSON.stringify(executionPlan, null, 2)}\n`, 'utf8');
    }
  });

  await assert.rejects(
    () => failingRun.engine.runCliIteration(workspaceFolder(rootPath), 'loop', progressReporter(), {
      reachedIterationCap: false
    }),
    /execution plan hash/
  );

  const firstIterationDir = path.join(rootPath, '.ralph', 'artifacts', 'iteration-001');
  await assert.doesNotReject(fs.access(firstIterationDir));
  await fs.writeFile(path.join(rootPath, '.ralph', 'state.json'), `${JSON.stringify({
    version: 2,
    nextIteration: 2,
    runHistory: [],
    iterationHistory: []
  }, null, 2)}\n`, 'utf8');

  const recoveryRun = createEngine([
    {
      run: async () => ({
        stdout: 'recovered after integrity failure',
        lastMessage: completionReport({
          selectedTaskId: 'T1',
          requestedStatus: 'done',
          progressNote: 'Recovered after integrity failure.',
          validationRan: 'npm test'
        }, 'Recovery iteration completed the task.')
      })
    }
  ], sharedMemento);

  const recovered = await recoveryRun.engine.runCliIteration(workspaceFolder(rootPath), 'loop', progressReporter(), {
    reachedIterationCap: false
  });

  assert.equal(recovered.result.iteration, 2);
  assert.equal(recovered.result.executionStatus, 'succeeded');
  await assert.doesNotReject(fs.access(path.join(rootPath, '.ralph', 'artifacts', 'iteration-002')));
  await assert.doesNotReject(fs.access(firstIterationDir));

  const latestFailurePointer = JSON.parse(
    await fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-provenance-failure.json'), 'utf8')
  ) as {
    stage: string;
    artifactDir: string;
  };
  assert.equal(latestFailurePointer.stage, 'executionPlanHash');
  assert.equal(latestFailurePointer.artifactDir, firstIterationDir);
});

test('runCliIteration aligns nested execution and verifier roots while keeping Ralph artifacts at the workspace root', async () => {
  const rootPath = await makeTempRoot();
  const nestedRoot = await seedNestedWorkspace(rootPath, 'ralph-codex-vscode-starter', {
    version: 2,
    tasks: [
      { id: 'T1', title: 'Ship nested-root support', status: 'todo' }
    ]
  });
  await initGitRepo(rootPath);

  const harness = vscodeTestHarness();
  harness.setConfiguration({
    verifierModes: ['validationCommand', 'taskState'],
    gitCheckpointMode: 'off'
  });
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  const run = createEngine([
    {
      run: async (request) => {
        assert.equal(request.workspaceRoot, rootPath);
        assert.equal(request.executionRoot, nestedRoot);
        await fs.writeFile(path.join(nestedRoot, 'src', 'feature.ts'), 'export const ready = "nested";\n', 'utf8');
        return {
          stdout: 'updated nested feature',
          lastMessage: completionReport({
            selectedTaskId: 'T1',
            requestedStatus: 'done',
            progressNote: 'Nested execution root updated child repo files.',
            validationRan: 'npm run validate'
          }, 'Nested execution root completed the task.')
        };
      }
    }
  ]);

  const runSummary = await run.engine.runCliIteration(workspaceFolder(rootPath), 'singleExec', progressReporter(), {
    reachedIterationCap: false
  });

  assert.equal(runSummary.result.executionStatus, 'succeeded');
  assert.equal(runSummary.result.verificationStatus, 'passed');
  assert.equal(await fs.readFile(path.join(nestedRoot, 'validate.cwd.txt'), 'utf8'), nestedRoot);

  const iterationDir = path.join(rootPath, '.ralph', 'artifacts', 'iteration-001');
  const promptEvidence = JSON.parse(await fs.readFile(path.join(iterationDir, 'prompt-evidence.json'), 'utf8')) as {
    inputs: {
      rootPolicy: {
        workspaceRootPath: string;
        executionRootPath: string;
        verificationRootPath: string;
      };
    };
  };
  const executionPlan = JSON.parse(await fs.readFile(path.join(iterationDir, 'execution-plan.json'), 'utf8')) as {
    rootPolicy: {
      workspaceRootPath: string;
      inspectionRootPath: string;
      executionRootPath: string;
      verificationRootPath: string;
    };
  };
  const cliInvocation = JSON.parse(await fs.readFile(path.join(iterationDir, 'cli-invocation.json'), 'utf8')) as {
    workspaceRoot: string;
    rootPolicy: {
      executionRootPath: string;
      verificationRootPath: string;
    };
  };
  const bundle = JSON.parse(await fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-provenance-bundle.json'), 'utf8')) as {
    artifactDir: string;
    rootPolicy: {
      workspaceRootPath: string;
      executionRootPath: string;
      verificationRootPath: string;
    };
  };
  const completionArtifact = JSON.parse(await fs.readFile(path.join(iterationDir, 'completion-report.json'), 'utf8')) as {
    status: string;
    report: { selectedTaskId: string; requestedStatus: string } | null;
  };
  const taskFile = JSON.parse(await fs.readFile(path.join(rootPath, '.ralph', 'tasks.json'), 'utf8')) as RalphTaskFile;
  const progressText = await fs.readFile(path.join(rootPath, '.ralph', 'progress.md'), 'utf8');

  assert.equal(promptEvidence.inputs.rootPolicy.workspaceRootPath, rootPath);
  assert.equal(promptEvidence.inputs.rootPolicy.executionRootPath, nestedRoot);
  assert.equal(promptEvidence.inputs.rootPolicy.verificationRootPath, nestedRoot);
  assert.equal(executionPlan.rootPolicy.workspaceRootPath, rootPath);
  assert.equal(executionPlan.rootPolicy.inspectionRootPath, nestedRoot);
  assert.equal(executionPlan.rootPolicy.executionRootPath, nestedRoot);
  assert.equal(cliInvocation.workspaceRoot, rootPath);
  assert.equal(cliInvocation.rootPolicy.executionRootPath, nestedRoot);
  assert.equal(cliInvocation.rootPolicy.verificationRootPath, nestedRoot);
  assert.equal(bundle.artifactDir, path.join(rootPath, '.ralph', 'artifacts', 'iteration-001'));
  assert.equal(bundle.rootPolicy.workspaceRootPath, rootPath);
  assert.equal(bundle.rootPolicy.executionRootPath, nestedRoot);
  assert.equal(bundle.rootPolicy.verificationRootPath, nestedRoot);
  assert.equal(completionArtifact.status, 'applied');
  assert.equal(completionArtifact.report?.selectedTaskId, 'T1');
  assert.equal(completionArtifact.report?.requestedStatus, 'done');
  assert.equal(taskFile.tasks.find((task) => task.id === 'T1')?.status, 'done');
  assert.match(progressText, /Nested execution root updated child repo files\./);
});

test('runCliIteration normalizes a legacy task validation command that redundantly cds into the selected nested verifier root', async () => {
  const rootPath = await makeTempRoot();
  const nestedRoot = await seedNestedWorkspace(rootPath, 'ralph-codex-vscode-starter', {
    version: 2,
    tasks: [
      {
        id: 'T1',
        title: 'Keep legacy validation hints working',
        status: 'todo',
        validation: 'cd ralph-codex-vscode-starter && npm run validate'
      }
    ]
  });
  await initGitRepo(rootPath);

  const harness = vscodeTestHarness();
  harness.setConfiguration({
    verifierModes: ['validationCommand', 'taskState'],
    gitCheckpointMode: 'off'
  });
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  const run = createEngine([
    {
      run: async (request) => {
        assert.equal(request.executionRoot, nestedRoot);
        await fs.writeFile(path.join(nestedRoot, 'src', 'feature.ts'), 'export const ready = "legacy-validation";\n', 'utf8');
        await appendProgress(rootPath, 'Legacy nested validation hint stayed runnable.');
        await updateTaskFile(rootPath, (taskFile) => ({
          ...taskFile,
          tasks: taskFile.tasks.map((task) => task.id === 'T1' ? { ...task, status: 'done' } : task)
        }));
        return {
          stdout: 'updated nested feature',
          lastMessage: 'Legacy validation hint completed the task.'
        };
      }
    }
  ]);

  const runSummary = await run.engine.runCliIteration(workspaceFolder(rootPath), 'singleExec', progressReporter(), {
    reachedIterationCap: false
  });

  assert.equal(runSummary.result.executionStatus, 'succeeded');
  assert.equal(runSummary.result.verificationStatus, 'passed');
  assert.equal(runSummary.result.verification.primaryCommand, 'npm run validate');
  assert.equal(await fs.readFile(path.join(nestedRoot, 'validate.cwd.txt'), 'utf8'), nestedRoot);
});

test('runCliIteration normalizes a legacy task validation command when the opened workspace is already the repo root', async () => {
  const parentRoot = await makeTempRoot();
  const rootPath = path.join(parentRoot, 'ralph-codex-vscode-starter');
  await fs.mkdir(rootPath, { recursive: true });
  await seedWorkspace(rootPath, {
    version: 2,
    tasks: [
      {
        id: 'T1',
        title: 'Keep direct repo validation hints working',
        status: 'todo',
        validation: 'cd ralph-codex-vscode-starter && npm run validate'
      }
    ]
  });
  await fs.writeFile(path.join(rootPath, 'package.json'), JSON.stringify({
    name: 'direct-root-fixture',
    version: '1.0.0',
    scripts: {
      validate: 'node -e "require(\'node:fs\').writeFileSync(\'validate.cwd.txt\', process.cwd())"',
      test: 'node -e "process.exit(0)"'
    }
  }, null, 2), 'utf8');
  await initGitRepo(rootPath);

  const harness = vscodeTestHarness();
  harness.setConfiguration({
    verifierModes: ['validationCommand', 'taskState'],
    gitCheckpointMode: 'off'
  });
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  const run = createEngine([
    {
      run: async (request) => {
        assert.equal(request.workspaceRoot, rootPath);
        assert.equal(request.executionRoot, rootPath);
        await fs.writeFile(path.join(rootPath, 'src', 'feature.ts'), 'export const ready = "direct-root-validation";\n', 'utf8');
        await appendProgress(rootPath, 'Legacy direct-root validation hint stayed runnable.');
        await updateTaskFile(rootPath, (taskFile) => ({
          ...taskFile,
          tasks: taskFile.tasks.map((task) => task.id === 'T1' ? { ...task, status: 'done' } : task)
        }));
        return {
          stdout: 'updated direct-root feature',
          lastMessage: 'Legacy direct-root validation hint completed the task.'
        };
      }
    }
  ]);

  const runSummary = await run.engine.runCliIteration(workspaceFolder(rootPath), 'singleExec', progressReporter(), {
    reachedIterationCap: false
  });

  assert.equal(runSummary.result.executionStatus, 'succeeded');
  assert.equal(runSummary.result.verificationStatus, 'passed');
  assert.equal(runSummary.result.verification.primaryCommand, 'npm run validate');
  assert.equal(await fs.readFile(path.join(rootPath, 'validate.cwd.txt'), 'utf8'), rootPath);
});

test('runCliIteration skips tasks claimed by another provenance when selecting the next task', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath, {
    version: 2,
    tasks: [
      { id: 'T1', title: 'Already claimed elsewhere', status: 'todo' },
      { id: 'T2', title: 'Still claimable', status: 'todo' }
    ]
  });
  await fs.writeFile(path.join(rootPath, '.ralph', 'claims.json'), `${JSON.stringify({
    version: 1,
    claims: [
      {
        taskId: 'T1',
        agentId: 'other-agent',
        provenanceId: 'run-i999-cli-20260315T000000Z',
        claimedAt: '2026-03-15T00:00:00.000Z',
        status: 'active'
      }
    ]
  }, null, 2)}\n`, 'utf8');
  await initGitRepo(rootPath);

  const harness = vscodeTestHarness();
  harness.setConfiguration({
    verifierModes: ['taskState'],
    gitCheckpointMode: 'off'
  });
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  const run = createEngine([
    {
      run: async () => ({
        stdout: 'claimed second task',
        lastMessage: completionReport({
          selectedTaskId: 'T2',
          requestedStatus: 'in_progress',
          progressNote: 'Claimed the next available task.'
        }, 'Claimed the next available task.')
      })
    }
  ]);

  const summary = await run.engine.runCliIteration(workspaceFolder(rootPath), 'singleExec', progressReporter(), {
    reachedIterationCap: false
  });

  const claimsFile = JSON.parse(await fs.readFile(path.join(rootPath, '.ralph', 'claims.json'), 'utf8')) as {
    claims: Array<{ taskId: string; agentId: string; provenanceId: string; status: string }>;
  };

  assert.equal(summary.result.selectedTaskId, 'T2');
  assert.equal(summary.result.completionReportStatus, 'applied');
  assert.deepEqual(
    claimsFile.claims.map((claim) => ({
      taskId: claim.taskId,
      agentId: claim.agentId,
      provenanceId: claim.provenanceId,
      status: claim.status
    })),
    [
      {
        taskId: 'T1',
        agentId: 'other-agent',
        provenanceId: 'run-i999-cli-20260315T000000Z',
        status: 'active'
      },
      {
        taskId: 'T2',
        agentId: 'default',
        provenanceId: summary.result.provenanceId!,
        status: 'released'
      }
    ]
  );
});

test('preparePrompt leaves the next task unclaimed so a later CLI iteration can still select it', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath, {
    version: 2,
    tasks: [
      { id: 'T1', title: 'Prepared for manual review first', status: 'todo' },
      { id: 'T2', title: 'Later task', status: 'todo' }
    ]
  });

  const harness = vscodeTestHarness();
  harness.setConfiguration({
    verifierModes: ['taskState'],
    gitCheckpointMode: 'off'
  });
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  const sharedMemento = new MemoryMemento();
  const preparedEngine = createEngine([{ run: async () => ({ lastMessage: 'Should not execute during prepare.' }) }], sharedMemento);
  const prepared = await preparedEngine.engine.preparePrompt(workspaceFolder(rootPath), progressReporter());

  assert.equal(prepared.selectedTask?.id, 'T1');
  await assert.rejects(fs.access(path.join(rootPath, '.ralph', 'claims.json')));

  const runEngine = createEngine([
    {
      run: async () => ({
        stdout: 'claimed prepared task',
        lastMessage: completionReport({
          selectedTaskId: 'T1',
          requestedStatus: 'done',
          progressNote: 'CLI run completed the task after IDE preparation.',
          validationRan: 'npm test'
        }, 'CLI run claimed the same task after prompt preparation.')
      })
    }
  ], sharedMemento);
  const summary = await runEngine.engine.runCliIteration(workspaceFolder(rootPath), 'singleExec', progressReporter(), {
    reachedIterationCap: false
  });

  assert.equal(summary.result.selectedTaskId, 'T1');
  const claimsFile = JSON.parse(await fs.readFile(path.join(rootPath, '.ralph', 'claims.json'), 'utf8')) as {
    claims: Array<{ taskId: string; provenanceId: string; status: string }>;
  };
  assert.deepEqual(
    claimsFile.claims.map((claim) => ({
      taskId: claim.taskId,
      provenanceId: claim.provenanceId,
      status: claim.status
    })),
    [
      {
        taskId: 'T1',
        provenanceId: summary.result.provenanceId!,
        status: 'released'
      }
    ]
  );
});

test('runCliIteration reclaims a legacy IDE handoff claim from the same agent before selecting the task', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath, {
    version: 2,
    tasks: [
      { id: 'T1', title: 'Previously handed off in the IDE', status: 'todo' },
      { id: 'T2', title: 'Fallback task', status: 'todo' }
    ]
  });
  await fs.writeFile(path.join(rootPath, '.ralph', 'claims.json'), `${JSON.stringify({
    version: 1,
    claims: [
      {
        taskId: 'T1',
        agentId: 'default',
        provenanceId: 'run-i003-ide-20260315T010000Z',
        claimedAt: '2026-03-15T01:00:00.000Z',
        status: 'active'
      }
    ]
  }, null, 2)}\n`, 'utf8');

  const harness = vscodeTestHarness();
  harness.setConfiguration({
    verifierModes: ['taskState'],
    gitCheckpointMode: 'off'
  });
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  const run = createEngine([
    {
      run: async () => ({
        stdout: 'reclaimed prepared task',
        lastMessage: completionReport({
          selectedTaskId: 'T1',
          requestedStatus: 'in_progress',
          progressNote: 'CLI reclaimed the legacy IDE handoff claim.'
        }, 'CLI reclaimed the legacy IDE handoff claim.')
      })
    }
  ]);

  const summary = await run.engine.runCliIteration(workspaceFolder(rootPath), 'singleExec', progressReporter(), {
    reachedIterationCap: false
  });

  const claimsFile = JSON.parse(await fs.readFile(path.join(rootPath, '.ralph', 'claims.json'), 'utf8')) as {
    claims: Array<{ taskId: string; agentId: string; provenanceId: string; status: string }>;
  };

  assert.equal(summary.result.selectedTaskId, 'T1');
  assert.equal(summary.result.completionReportStatus, 'applied');
  assert.deepEqual(
    claimsFile.claims.map((claim) => ({
      taskId: claim.taskId,
      agentId: claim.agentId,
      provenanceId: claim.provenanceId,
      status: claim.status
    })),
    [
      {
        taskId: 'T1',
        agentId: 'default',
        provenanceId: 'run-i003-ide-20260315T010000Z',
        status: 'released'
      },
      {
        taskId: 'T1',
        agentId: 'default',
        provenanceId: summary.result.provenanceId!,
        status: 'released'
      }
    ]
  );
});

test('runCliIteration threads a configured agentId through claims, state, results, and durable agent history', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath, {
    version: 2,
    tasks: [
      { id: 'T1', title: 'Agent-owned task', status: 'todo' }
    ]
  });
  await initGitRepo(rootPath);

  const harness = vscodeTestHarness();
  harness.setConfiguration({
    agentId: 'builder-1',
    verifierModes: ['validationCommand', 'gitDiff', 'taskState'],
    gitCheckpointMode: 'snapshotAndDiff'
  });
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  const sharedMemento = new MemoryMemento();
  const run = createEngine([
    {
      run: async (request) => {
        await fs.writeFile(path.join(request.executionRoot, 'src', 'feature.ts'), 'export const ready = "agent-one";\n', 'utf8');
        return {
          stdout: 'completed task',
          lastMessage: completionReport({
            selectedTaskId: 'T1',
            requestedStatus: 'done',
            progressNote: 'Completed the task.',
            validationRan: 'npm test'
          }, 'Completed the task.')
        };
      }
    }
  ], sharedMemento);
  const summary = await run.engine.runCliIteration(workspaceFolder(rootPath), 'singleExec', progressReporter(), {
    reachedIterationCap: false
  });

  const claimsFile = JSON.parse(await fs.readFile(path.join(rootPath, '.ralph', 'claims.json'), 'utf8')) as {
    claims: Array<{ taskId: string; agentId: string; status: string }>;
  };
  const agentRecord = JSON.parse(await fs.readFile(path.join(rootPath, '.ralph', 'agents', 'builder-1.json'), 'utf8')) as {
    agentId: string;
    firstSeenAt: string;
    completedTaskIds: string[];
    touchedFiles: string[];
  };
  const reloadedState = await run.stateManager.loadState(rootPath, run.stateManager.resolvePaths(rootPath, DEFAULT_CONFIG));

  assert.equal(summary.result.agentId, 'builder-1');
  assert.deepEqual(
    claimsFile.claims.map((claim) => ({
      taskId: claim.taskId,
      agentId: claim.agentId,
      status: claim.status
    })),
    [
      { taskId: 'T1', agentId: 'builder-1', status: 'released' }
    ]
  );
  assert.equal(reloadedState.lastRun?.agentId, 'builder-1');
  assert.equal(reloadedState.lastIteration?.agentId, 'builder-1');
  assert.deepEqual(reloadedState.runHistory.map((record) => record.agentId), ['builder-1']);
  assert.deepEqual(reloadedState.iterationHistory.map((record) => record.agentId), ['builder-1']);
  assert.equal(agentRecord.agentId, 'builder-1');
  assert.equal(agentRecord.firstSeenAt, summary.result.startedAt);
  assert.deepEqual(agentRecord.completedTaskIds, ['T1']);
  assert.ok(agentRecord.touchedFiles.includes('src/feature.ts'));
});

test('runCliIteration can reselect a task after operator stale-claim recovery and still release its CLI claim', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath, {
    version: 2,
    tasks: [
      { id: 'T1', title: 'Recovered after stale claim resolution', status: 'todo' },
      { id: 'T2', title: 'Fallback task', status: 'todo' }
    ]
  });
  const claimFilePath = path.join(rootPath, '.ralph', 'claims.json');
  await fs.writeFile(claimFilePath, `${JSON.stringify({
    version: 1,
    claims: [
      {
        taskId: 'T1',
        agentId: 'other-agent',
        provenanceId: 'run-i003-cli-20260310T000000Z',
        claimedAt: '2026-03-10T00:00:00.000Z',
        status: 'active'
      }
    ]
  }, null, 2)}\n`, 'utf8');
  await initGitRepo(rootPath);

  const resolved = await resolveStaleClaim(claimFilePath, {
    expectedClaim: {
      taskId: 'T1',
      agentId: 'other-agent',
      provenanceId: 'run-i003-cli-20260310T000000Z',
      claimedAt: '2026-03-10T00:00:00.000Z',
      status: 'active'
    },
    now: new Date('2026-03-16T00:00:00.000Z'),
    ttlMs: 1000 * 60 * 60,
    resolvedBy: 'operator',
    resolutionReason: 'eligible for operator recovery because the canonical claim was stale and no codex exec process was detected',
    status: 'stale'
  });
  assert.equal(resolved.outcome, 'resolved');

  const harness = vscodeTestHarness();
  harness.setConfiguration({
    verifierModes: ['taskState'],
    gitCheckpointMode: 'off'
  });
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  const run = createEngine([
    {
      run: async () => ({
        stdout: 'recovered task executed',
        lastMessage: completionReport({
          selectedTaskId: 'T1',
          requestedStatus: 'in_progress',
          progressNote: 'CLI recovered and resumed the task after stale-claim resolution.'
        }, 'CLI recovered and resumed the task after stale-claim resolution.')
      })
    }
  ]);

  const summary = await run.engine.runCliIteration(workspaceFolder(rootPath), 'singleExec', progressReporter(), {
    reachedIterationCap: false
  });

  const taskFile = JSON.parse(await fs.readFile(path.join(rootPath, '.ralph', 'tasks.json'), 'utf8')) as RalphTaskFile;
  const claimsFile = JSON.parse(await fs.readFile(claimFilePath, 'utf8')) as {
    claims: Array<{
      taskId: string;
      agentId: string;
      provenanceId: string;
      status: string;
      resolvedBy?: string;
      resolutionReason?: string;
    }>;
  };

  assert.equal(summary.result.selectedTaskId, 'T1');
  assert.equal(taskFile.tasks.find((task) => task.id === 'T1')?.status, 'in_progress');
  assert.deepEqual(
    claimsFile.claims.map((claim) => ({
      taskId: claim.taskId,
      agentId: claim.agentId,
      provenanceId: claim.provenanceId,
      status: claim.status,
      resolvedBy: claim.resolvedBy ?? null,
      resolutionReason: claim.resolutionReason ?? null
    })),
    [
      {
        taskId: 'T1',
        agentId: 'other-agent',
        provenanceId: 'run-i003-cli-20260310T000000Z',
        status: 'stale',
        resolvedBy: 'operator',
        resolutionReason: 'eligible for operator recovery because the canonical claim was stale and no codex exec process was detected'
      },
      {
        taskId: 'T1',
        agentId: 'default',
        provenanceId: summary.result.provenanceId!,
        status: 'released',
        resolvedBy: null,
        resolutionReason: null
      }
    ]
  );
});

test('runCliIteration rejects a completion report for the wrong selected task id without mutating durable state', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath, {
    version: 2,
    tasks: [
      { id: 'T1', title: 'Ship durable reconciliation', status: 'todo' }
    ]
  });
  await initGitRepo(rootPath);

  const harness = vscodeTestHarness();
  harness.setConfiguration({
    verifierModes: ['validationCommand', 'taskState'],
    gitCheckpointMode: 'off'
  });
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  const run = createEngine([
    {
      run: async () => {
        await fs.writeFile(path.join(rootPath, 'README.md'), '# changed\n', 'utf8');
        return {
          stdout: 'updated README',
          lastMessage: completionReport({
            selectedTaskId: 'T999',
            requestedStatus: 'done',
            progressNote: 'This should be ignored.',
            validationRan: 'npm test'
          }, 'Attempted to complete the wrong task.')
        };
      }
    }
  ]);

  const summary = await run.engine.runCliIteration(workspaceFolder(rootPath), 'singleExec', progressReporter(), {
    reachedIterationCap: false
  });

  const taskFile = JSON.parse(await fs.readFile(path.join(rootPath, '.ralph', 'tasks.json'), 'utf8')) as RalphTaskFile;
  const progressText = await fs.readFile(path.join(rootPath, '.ralph', 'progress.md'), 'utf8');
  const completionArtifact = JSON.parse(await fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'iteration-001', 'completion-report.json'), 'utf8')) as {
    status: string;
    warnings: string[];
  };

  assert.equal(summary.result.verificationStatus, 'passed');
  assert.equal(summary.result.completionReportStatus, 'rejected');
  assert.match(summary.result.reconciliationWarnings?.join('\n') ?? '', /did not match the selected task T1/);
  assert.equal(taskFile.tasks.find((task) => task.id === 'T1')?.status, 'in_progress');
  assert.doesNotMatch(progressText, /This should be ignored\./);
  assert.equal(completionArtifact.status, 'rejected');
});

for (const scenario of [
  {
    name: 'missing',
    lastMessage: 'No structured completion report was emitted.',
    parsePattern: /No completion report JSON block was found/
  },
  {
    name: 'invalid',
    lastMessage: completionReport({
      selectedTaskId: 'T1',
      requestedStatus: 'ship-it'
    }, 'Malformed report.'),
    parsePattern: /requestedStatus must be one of done, blocked, or in_progress/
  }
] as const) {
  test(`runCliIteration records ${scenario.name} completion reports without mutating durable state`, async () => {
    const rootPath = await makeTempRoot();
    await seedWorkspace(rootPath, {
      version: 2,
      tasks: [
        { id: 'T1', title: 'Require a structured completion report', status: 'todo' }
      ]
    });
    await initGitRepo(rootPath);

    const harness = vscodeTestHarness();
    harness.setConfiguration({
      verifierModes: ['validationCommand', 'taskState'],
      gitCheckpointMode: 'off'
    });
    harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

    const run = createEngine([
      {
        run: async () => {
          await fs.writeFile(path.join(rootPath, 'README.md'), `# ${scenario.name}\n`, 'utf8');
          return {
            stdout: `updated ${scenario.name}`,
            lastMessage: scenario.lastMessage
          };
        }
      }
    ]);

    const summary = await run.engine.runCliIteration(workspaceFolder(rootPath), 'singleExec', progressReporter(), {
      reachedIterationCap: false
    });

    const taskFile = JSON.parse(await fs.readFile(path.join(rootPath, '.ralph', 'tasks.json'), 'utf8')) as RalphTaskFile;
    const progressText = await fs.readFile(path.join(rootPath, '.ralph', 'progress.md'), 'utf8');
    const completionArtifact = JSON.parse(await fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'iteration-001', 'completion-report.json'), 'utf8')) as {
      status: string;
      parseError: string | null;
      warnings: string[];
    };

    assert.equal(summary.result.verificationStatus, 'passed');
    assert.equal(summary.result.completionReportStatus, scenario.name);
    assert.equal(taskFile.tasks.find((task) => task.id === 'T1')?.status, 'in_progress');
    assert.doesNotMatch(progressText, /structured completion report/i);
    assert.equal(completionArtifact.status, scenario.name);
    assert.match((completionArtifact.parseError ?? '') || completionArtifact.warnings.join('\n'), scenario.parsePattern);
  });
}

test('runCliIteration does not mark a task done when the completion report requests done but verification fails', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath, {
    version: 2,
    tasks: [
      {
        id: 'T1',
        title: 'Only reconcile done after verification passes',
        status: 'todo',
        validation: 'node -e "process.exit(1)"'
      }
    ]
  });
  await initGitRepo(rootPath);

  const harness = vscodeTestHarness();
  harness.setConfiguration({
    verifierModes: ['validationCommand', 'taskState'],
    gitCheckpointMode: 'off'
  });
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  const run = createEngine([
    {
      run: async () => {
        await fs.writeFile(path.join(rootPath, 'README.md'), '# failed validation\n', 'utf8');
        return {
          stdout: 'updated README',
          lastMessage: completionReport({
            selectedTaskId: 'T1',
            requestedStatus: 'done',
            progressNote: 'This should not be persisted.',
            validationRan: 'node -e "process.exit(1)"'
          }, 'Reported done despite failing verification.')
        };
      }
    }
  ]);

  const summary = await run.engine.runCliIteration(workspaceFolder(rootPath), 'singleExec', progressReporter(), {
    reachedIterationCap: false
  });

  const taskFile = JSON.parse(await fs.readFile(path.join(rootPath, '.ralph', 'tasks.json'), 'utf8')) as RalphTaskFile;
  const progressText = await fs.readFile(path.join(rootPath, '.ralph', 'progress.md'), 'utf8');

  assert.equal(summary.result.verificationStatus, 'failed');
  assert.equal(summary.result.completionReportStatus, 'rejected');
  assert.match(summary.result.reconciliationWarnings?.join('\n') ?? '', /verification status was failed/);
  assert.equal(taskFile.tasks.find((task) => task.id === 'T1')?.status, 'in_progress');
  assert.doesNotMatch(progressText, /This should not be persisted\./);
});

test('runCliIteration stops with claim_contested when the selected task claim is lost before reconciliation', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath, {
    version: 2,
    tasks: [
      { id: 'T1', title: 'Require claim ownership at reconciliation', status: 'todo' }
    ]
  });
  await initGitRepo(rootPath);

  const harness = vscodeTestHarness();
  harness.setConfiguration({
    verifierModes: ['taskState'],
    gitCheckpointMode: 'off'
  });
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  const run = createEngine([
    {
      run: async () => {
        await fs.writeFile(path.join(rootPath, '.ralph', 'claims.json'), `${JSON.stringify({
          version: 1,
          claims: [
            {
              taskId: 'T1',
              agentId: 'other-agent',
              provenanceId: 'run-i999-cli-20260315T000100Z',
              claimedAt: '2026-03-15T00:01:00.000Z',
              status: 'active'
            }
          ]
        }, null, 2)}\n`, 'utf8');
        return {
          stdout: 'reported done after losing claim',
          lastMessage: completionReport({
            selectedTaskId: 'T1',
            requestedStatus: 'in_progress',
            progressNote: 'This should not be persisted.'
          }, 'Reported completion after claim ownership changed.')
        };
      }
    }
  ]);

  const summary = await run.engine.runCliIteration(workspaceFolder(rootPath), 'singleExec', progressReporter(), {
    reachedIterationCap: false
  });

  const taskFile = JSON.parse(await fs.readFile(path.join(rootPath, '.ralph', 'tasks.json'), 'utf8')) as RalphTaskFile;
  const progressText = await fs.readFile(path.join(rootPath, '.ralph', 'progress.md'), 'utf8');
  const completionArtifact = JSON.parse(await fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'iteration-001', 'completion-report.json'), 'utf8')) as {
    status: string;
    warnings: string[];
  };

  assert.equal(summary.result.completionReportStatus, 'rejected');
  assert.equal(summary.result.stopReason, 'claim_contested');
  assert.equal(summary.loopDecision.stopReason, 'claim_contested');
  assert.match(summary.result.reconciliationWarnings?.join('\n') ?? '', /claim ownership check failed/);
  assert.equal(taskFile.tasks.find((task) => task.id === 'T1')?.status, 'in_progress');
  assert.doesNotMatch(progressText, /This should not be persisted\./);
  assert.equal(completionArtifact.status, 'rejected');
});

test('runCliIteration applies blocked completion reports through control-plane reconciliation', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath, {
    version: 2,
    tasks: [
      { id: 'T1', title: 'Persist blockers safely', status: 'todo' }
    ]
  });
  await initGitRepo(rootPath);

  const harness = vscodeTestHarness();
  harness.setConfiguration({
    verifierModes: ['taskState'],
    gitCheckpointMode: 'off'
  });
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  const run = createEngine([
    {
      run: async () => ({
        stdout: 'blocked on dependency',
        lastMessage: completionReport({
          selectedTaskId: 'T1',
          requestedStatus: 'blocked',
          progressNote: 'Blocked while waiting for the upstream schema.',
          blocker: 'Waiting on API contract.'
        }, 'Blocked on an external dependency.')
      })
    }
  ]);

  const summary = await run.engine.runCliIteration(workspaceFolder(rootPath), 'singleExec', progressReporter(), {
    reachedIterationCap: false
  });

  const taskFile = JSON.parse(await fs.readFile(path.join(rootPath, '.ralph', 'tasks.json'), 'utf8')) as RalphTaskFile;
  const selectedTask = taskFile.tasks.find((task) => task.id === 'T1');
  const progressText = await fs.readFile(path.join(rootPath, '.ralph', 'progress.md'), 'utf8');

  assert.equal(summary.result.completionReportStatus, 'applied');
  assert.equal(summary.result.completionClassification, 'blocked');
  assert.equal(summary.result.verificationStatus, 'failed');
  assert.equal(selectedTask?.status, 'blocked');
  assert.equal(selectedTask?.blocker, 'Waiting on API contract.');
  assert.equal(selectedTask?.notes, 'Blocked while waiting for the upstream schema.');
  assert.match(progressText, /Blocked while waiting for the upstream schema\./);
});

test('runCliIteration auto-completes aggregate parents after the final child slice reports done', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath, {
    version: 2,
    tasks: [
      { id: 'T1', title: 'Aggregate parent', status: 'todo', dependsOn: ['T1.1', 'T1.2'] },
      { id: 'T1.1', title: 'Completed slice', status: 'done', parentId: 'T1' },
      { id: 'T1.2', title: 'Final slice', status: 'todo', parentId: 'T1', validation: 'npm test' }
    ]
  });
  await initGitRepo(rootPath);

  const harness = vscodeTestHarness();
  harness.setConfiguration({
    verifierModes: ['validationCommand', 'taskState'],
    gitCheckpointMode: 'off'
  });
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  const run = createEngine([
    {
      run: async () => {
        await fs.writeFile(path.join(rootPath, 'README.md'), '# aggregate parent completed via child slices\n', 'utf8');
        return {
          stdout: 'completed final slice',
          lastMessage: completionReport({
            selectedTaskId: 'T1.2',
            requestedStatus: 'done',
            progressNote: 'Completed the final T1 slice.',
            validationRan: 'npm test'
          }, 'Completed the final aggregate child slice.')
        };
      }
    }
  ]);

  const summary = await run.engine.runCliIteration(workspaceFolder(rootPath), 'singleExec', progressReporter(), {
    reachedIterationCap: false
  });

  const taskFile = JSON.parse(await fs.readFile(path.join(rootPath, '.ralph', 'tasks.json'), 'utf8')) as RalphTaskFile;

  assert.equal(summary.result.selectedTaskId, 'T1.2');
  assert.equal(summary.result.completionReportStatus, 'applied');
  assert.equal(summary.result.completionClassification, 'complete');
  assert.equal(summary.result.backlog.remainingTaskCount, 0);
  assert.equal(summary.result.backlog.actionableTaskAvailable, false);
  assert.equal(taskFile.tasks.find((task) => task.id === 'T1.2')?.status, 'done');
  assert.equal(taskFile.tasks.find((task) => task.id === 'T1')?.status, 'done');
});

test('runCliIteration stops loop continuation when control-plane runtime files change', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath, {
    version: 2,
    tasks: [
      { id: 'T1', title: 'Trigger the reload barrier', status: 'todo' },
      { id: 'T1.1', title: 'Keep iterating after progress', status: 'todo', parentId: 'T1' }
    ]
  });
  await initGitRepo(rootPath);

  const harness = vscodeTestHarness();
  harness.setConfiguration({
    verifierModes: ['gitDiff', 'taskState'],
    gitCheckpointMode: 'snapshotAndDiff'
  });
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  const run = createEngine([
    {
      run: async () => {
        await fs.writeFile(path.join(rootPath, 'src', 'feature.ts'), 'export const ready = "reload-barrier";\n', 'utf8');
        return {
          stdout: 'updated src/feature.ts',
          lastMessage: completionReport({
            selectedTaskId: 'T1',
            requestedStatus: 'in_progress',
            progressNote: 'Updated src/feature.ts.',
            validationRan: 'npm test'
          }, 'Changed control-plane runtime files.')
        };
      }
    }
  ]);

  const summary = await run.engine.runCliIteration(workspaceFolder(rootPath), 'loop', progressReporter(), {
    reachedIterationCap: false
  });

  assert.equal(summary.result.verificationStatus, 'passed');
  assert.equal(summary.result.completionReportStatus, 'applied');
  assert.equal(summary.loopDecision.shouldContinue, false);
  assert.equal(summary.loopDecision.stopReason, 'control_plane_reload_required');
  assert.equal(summary.result.stopReason, 'control_plane_reload_required');
  assert.match(summary.result.warnings.join('\n'), /src\/feature\.ts/);
});

test('runCliIteration keeps looping after test-only changes because they do not modify the control plane runtime', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath, {
    version: 2,
    tasks: [
      { id: 'T1', title: 'Allow safe non-runtime edits', status: 'todo' },
      { id: 'T1.1', title: 'Keep iterating after tests', status: 'todo', parentId: 'T1' }
    ]
  });
  await initGitRepo(rootPath);

  const harness = vscodeTestHarness();
  harness.setConfiguration({
    verifierModes: ['gitDiff', 'taskState'],
    gitCheckpointMode: 'snapshotAndDiff'
  });
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  const run = createEngine([
    {
      run: async () => {
        await fs.mkdir(path.join(rootPath, 'test'), { recursive: true });
        await fs.writeFile(path.join(rootPath, 'test', 'feature.test.ts'), 'export {};\n', 'utf8');
        return {
          stdout: 'updated test/feature.test.ts',
          lastMessage: completionReport({
            selectedTaskId: 'T1',
            requestedStatus: 'in_progress',
            progressNote: 'Added a test-only change.',
            validationRan: 'npm test'
          }, 'Changed only test files.')
        };
      }
    }
  ]);

  const summary = await run.engine.runCliIteration(workspaceFolder(rootPath), 'loop', progressReporter(), {
    reachedIterationCap: false
  });

  assert.equal(summary.result.verificationStatus, 'passed');
  assert.equal(summary.result.completionReportStatus, 'applied');
  assert.equal(summary.loopDecision.shouldContinue, true);
  assert.equal(summary.loopDecision.stopReason, null);
  assert.equal(summary.result.stopReason, null);
});

test('runCliIteration honors inspectionRootOverride for ambiguous multi-repo workspaces', async () => {
  const rootPath = await makeTempRoot();
  await seedNestedWorkspace(rootPath, 'alpha-repo', {
    version: 2,
    tasks: [
      { id: 'T1', title: 'Ship override support', status: 'todo' }
    ]
  });
  const betaRoot = await seedNestedWorkspace(rootPath, 'beta-repo', {
    version: 2,
    tasks: [
      { id: 'T1', title: 'Ship override support', status: 'todo' }
    ]
  });
  await initGitRepo(rootPath);

  const harness = vscodeTestHarness();
  harness.setConfiguration({
    inspectionRootOverride: 'beta-repo',
    verifierModes: ['validationCommand', 'taskState'],
    gitCheckpointMode: 'off'
  });
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  const run = createEngine([
    {
      run: async (request) => {
        assert.equal(request.workspaceRoot, rootPath);
        assert.equal(request.executionRoot, betaRoot);
        await fs.writeFile(path.join(betaRoot, 'src', 'feature.ts'), 'export const ready = "override";\n', 'utf8');
        await appendProgress(rootPath, 'Manual inspection-root override selected beta-repo.');
        await updateTaskFile(rootPath, (taskFile) => ({
          ...taskFile,
          tasks: taskFile.tasks.map((task) => task.id === 'T1' ? { ...task, status: 'done' } : task)
        }));
        return {
          stdout: 'updated override feature',
          lastMessage: 'Manual override completed the task.'
        };
      }
    }
  ]);

  const runSummary = await run.engine.runCliIteration(workspaceFolder(rootPath), 'singleExec', progressReporter(), {
    reachedIterationCap: false
  });

  assert.equal(runSummary.result.executionStatus, 'succeeded');
  assert.equal(runSummary.result.verificationStatus, 'passed');
  assert.equal(await fs.readFile(path.join(betaRoot, 'validate.cwd.txt'), 'utf8'), betaRoot);

  const promptEvidence = JSON.parse(await fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'iteration-001', 'prompt-evidence.json'), 'utf8')) as {
    inputs: {
      repoContextSnapshot: {
        rootSelection: {
          strategy: string;
          summary: string;
          override: {
            status: string;
            requestedPath: string;
          } | null;
        };
      };
      rootPolicy: {
        executionRootPath: string;
        verificationRootPath: string;
      };
    };
  };

  assert.equal(promptEvidence.inputs.repoContextSnapshot.rootSelection.strategy, 'manualOverride');
  assert.equal(promptEvidence.inputs.repoContextSnapshot.rootSelection.override?.status, 'applied');
  assert.equal(promptEvidence.inputs.repoContextSnapshot.rootSelection.override?.requestedPath, 'beta-repo');
  assert.match(promptEvidence.inputs.repoContextSnapshot.rootSelection.summary, /manual inspection-root override beta-repo/);
  assert.equal(promptEvidence.inputs.rootPolicy.executionRootPath, betaRoot);
  assert.equal(promptEvidence.inputs.rootPolicy.verificationRootPath, betaRoot);
});

test('runCliIteration persists blocked provenance artifacts when launch integrity fails', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath, {
    version: 2,
    tasks: [
      { id: 'T1', title: 'Ship it safely', status: 'todo' }
    ]
  });

  const harness = vscodeTestHarness();
  harness.setConfiguration({
    verifierModes: ['taskState'],
    gitCheckpointMode: 'off'
  });
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  const plannedPromptHash = hashText('placeholder');
  const run = createEngine([
    {
      run: async () => {
        throw new Error(
          `Execution integrity check failed before launch: stdin payload hash sha256:deadbeef did not match planned prompt hash ${plannedPromptHash}.`
        );
      }
    }
  ]);

  await assert.rejects(
    () => run.engine.runCliIteration(workspaceFolder(rootPath), 'singleExec', progressReporter(), {
      reachedIterationCap: false
    }),
    /Execution integrity check failed before launch/
  );

  const latestFailure = JSON.parse(await fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-result.json'), 'utf8')) as {
    kind: string;
    stage: string;
    provenanceId: string;
    blocked: boolean;
  };
  const latestBundle = JSON.parse(await fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-provenance-bundle.json'), 'utf8')) as {
    provenanceId: string;
    status: string;
    provenanceFailurePath: string;
    provenanceFailureSummaryPath: string;
  };
  const latestFailurePointer = JSON.parse(await fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-provenance-failure.json'), 'utf8')) as {
    stage: string;
    provenanceId: string;
  };
  const latestSummary = await fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-summary.md'), 'utf8');

  assert.equal(latestFailure.kind, 'integrityFailure');
  assert.equal(latestFailure.stage, 'stdinPayloadHash');
  assert.equal(latestFailure.blocked, true);
  assert.equal(latestBundle.provenanceId, latestFailure.provenanceId);
  assert.equal(latestBundle.status, 'blocked');
  assert.equal(latestFailurePointer.stage, 'stdinPayloadHash');
  assert.equal(latestFailurePointer.provenanceId, latestFailure.provenanceId);
  await assert.doesNotReject(fs.access(latestBundle.provenanceFailurePath));
  await assert.doesNotReject(fs.access(latestBundle.provenanceFailureSummaryPath));
  assert.match(latestSummary, /Ralph Provenance Failure/);
  assert.match(latestSummary, /stdinPayloadHash/);
});

test('runCliIteration persists blocked provenance artifacts for execution-plan hash mismatch', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath, {
    version: 2,
    tasks: [
      { id: 'T1', title: 'Ship it safely', status: 'todo' }
    ]
  });

  const harness = vscodeTestHarness();
  harness.setConfiguration({
    verifierModes: ['taskState'],
    gitCheckpointMode: 'off'
  });
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  const run = createEngine([
    { run: async () => ({ lastMessage: 'Should not execute.' }) }
  ], new MemoryMemento(), {
    beforeCliExecutionIntegrityCheck: async (prepared) => {
      const executionPlan = JSON.parse(await fs.readFile(prepared.executionPlanPath, 'utf8')) as Record<string, unknown>;
      executionPlan.selectedTaskTitle = 'Tampered after planning';
      await fs.writeFile(prepared.executionPlanPath, `${JSON.stringify(executionPlan, null, 2)}\n`, 'utf8');
    }
  });

  await assert.rejects(
    () => run.engine.runCliIteration(workspaceFolder(rootPath), 'singleExec', progressReporter(), {
      reachedIterationCap: false
    }),
    /execution plan hash/
  );

  const latestFailure = JSON.parse(await fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-result.json'), 'utf8')) as {
    kind: string;
    stage: string;
    blocked: boolean;
    expectedExecutionPlanHash: string | null;
    actualExecutionPlanHash: string | null;
  };
  const latestBundle = JSON.parse(await fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-provenance-bundle.json'), 'utf8')) as {
    status: string;
    provenanceFailurePath: string;
  };
  const latestFailurePointer = JSON.parse(await fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-provenance-failure.json'), 'utf8')) as {
    stage: string;
  };

  assert.equal(latestFailure.kind, 'integrityFailure');
  assert.equal(latestFailure.stage, 'executionPlanHash');
  assert.equal(latestFailure.blocked, true);
  assert.notEqual(latestFailure.expectedExecutionPlanHash, null);
  assert.notEqual(latestFailure.actualExecutionPlanHash, null);
  assert.notEqual(latestFailure.expectedExecutionPlanHash, latestFailure.actualExecutionPlanHash);
  assert.equal(latestFailurePointer.stage, 'executionPlanHash');
  assert.equal(latestBundle.status, 'blocked');
  await assert.doesNotReject(fs.access(latestBundle.provenanceFailurePath));
});

test('runCliIteration persists blocked provenance artifacts for prompt-artifact hash mismatch', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath, {
    version: 2,
    tasks: [
      { id: 'T1', title: 'Ship it safely', status: 'todo' }
    ]
  });

  const harness = vscodeTestHarness();
  harness.setConfiguration({
    verifierModes: ['taskState'],
    gitCheckpointMode: 'off'
  });
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  const run = createEngine([
    { run: async () => ({ lastMessage: 'Should not execute.' }) }
  ], new MemoryMemento(), {
    beforeCliExecutionIntegrityCheck: async (prepared) => {
      await fs.writeFile(prepared.executionPlan.promptArtifactPath, `${prepared.prompt}\n<!-- tampered -->\n`, 'utf8');
    }
  });

  await assert.rejects(
    () => run.engine.runCliIteration(workspaceFolder(rootPath), 'singleExec', progressReporter(), {
      reachedIterationCap: false
    }),
    /prompt artifact hash/
  );

  const latestFailure = JSON.parse(await fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-result.json'), 'utf8')) as {
    kind: string;
    stage: string;
    blocked: boolean;
    expectedPromptHash: string | null;
    actualPromptHash: string | null;
    promptArtifactPath: string | null;
  };
  const latestFailurePointer = JSON.parse(await fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-provenance-failure.json'), 'utf8')) as {
    stage: string;
  };
  const latestSummary = await fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-summary.md'), 'utf8');

  assert.equal(latestFailure.kind, 'integrityFailure');
  assert.equal(latestFailure.stage, 'promptArtifactHash');
  assert.equal(latestFailure.blocked, true);
  assert.notEqual(latestFailure.expectedPromptHash, null);
  assert.notEqual(latestFailure.actualPromptHash, null);
  assert.notEqual(latestFailure.expectedPromptHash, latestFailure.actualPromptHash);
  assert.equal(latestFailurePointer.stage, 'promptArtifactHash');
  assert.match(latestSummary, /promptArtifactHash/);
  await assert.doesNotReject(fs.access(latestFailure.promptArtifactPath!));
});

test('runCliIteration stops after repeated no-progress iterations', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath, {
    version: 2,
    tasks: [
      {
        id: 'T1',
        title: 'Implement prompt evidence and verifier reporting',
        status: 'todo',
        notes: 'Generate a small proposed child-task set with dependencies. Keep it one level deep.'
      }
    ]
  });

  const harness = vscodeTestHarness();
  harness.setConfiguration({
    verifierModes: ['taskState', 'gitDiff'],
    noProgressThreshold: 2,
    gitCheckpointMode: 'off'
  });

  const sharedMemento = new MemoryMemento();
  const runOne = createEngine([{ run: async () => ({ lastMessage: 'No durable changes.' }) }], sharedMemento);
  const firstRun = await runOne.engine.runCliIteration(workspaceFolder(rootPath), 'loop', progressReporter(), {
    reachedIterationCap: false
  });

  assert.equal(firstRun.result.completionClassification, 'no_progress');

  const runTwo = createEngine([{ run: async () => ({ lastMessage: 'Still no durable changes.' }) }], sharedMemento);
  const secondRun = await runTwo.engine.runCliIteration(workspaceFolder(rootPath), 'loop', progressReporter(), {
    reachedIterationCap: false
  });

  assert.equal(secondRun.result.stopReason, 'repeated_no_progress');
  assert.ok(secondRun.result.remediation);
  assert.equal(secondRun.result.remediation?.action, 'decompose_task');
  assert.match(secondRun.result.remediation?.summary ?? '', /decompose the task/i);
  const remediationPath = path.join(rootPath, '.ralph', 'artifacts', 'iteration-002', 'task-remediation.json');
  const latestRemediationPath = path.join(rootPath, '.ralph', 'artifacts', 'latest-remediation.json');
  const remediationArtifact = JSON.parse(await fs.readFile(remediationPath, 'utf8')) as {
    kind: string;
    action: string;
    rationale: string;
    proposedAction: string;
    triggeringHistory: Array<{ iteration: number }>;
    suggestedChildTasks: Array<{
      id: string;
      title: string;
      parentId: string;
      dependsOn: Array<{ taskId: string; reason: string }>;
    }>;
  };
  assert.equal(remediationArtifact.kind, 'taskRemediation');
  assert.equal(remediationArtifact.action, 'decompose_task');
  assert.match(remediationArtifact.rationale, /no relevant file changes/i);
  assert.match(remediationArtifact.proposedAction, /decompose the task/i);
  assert.deepEqual(remediationArtifact.triggeringHistory.map((entry) => entry.iteration), [1, 2]);
  assert.equal(remediationArtifact.suggestedChildTasks.length, 2);
  assert.deepEqual(remediationArtifact.suggestedChildTasks.map((task) => task.id), ['T1.1', 'T1.2']);
  assert.equal(remediationArtifact.suggestedChildTasks[0]?.parentId, 'T1');
  assert.deepEqual(remediationArtifact.suggestedChildTasks[1]?.dependsOn.map((dependency) => dependency.taskId), ['T1.1']);
  const latestRemediation = JSON.parse(await fs.readFile(latestRemediationPath, 'utf8')) as {
    action: string;
    attemptCount: number;
  };
  assert.equal(latestRemediation.action, 'decompose_task');
  assert.equal(latestRemediation.attemptCount, 2);
});

test('runCliIteration records no_action remediation for repeated no-progress on an already narrowed task', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath, {
    version: 2,
    tasks: [
      {
        id: 'T1',
        title: 'Parent task',
        status: 'done'
      },
      {
        id: 'T2',
        title: 'Implement the smallest bounded fix for that reproduced blocker',
        status: 'todo',
        dependsOn: ['T1'],
        notes: 'Keep the proposal one level deep by sequencing the next bounded step after T1.1.'
      }
    ]
  });

  const harness = vscodeTestHarness();
  harness.setConfiguration({
    verifierModes: ['taskState', 'gitDiff'],
    noProgressThreshold: 2,
    gitCheckpointMode: 'off'
  });

  const sharedMemento = new MemoryMemento();
  const runOne = createEngine([{ run: async () => ({ lastMessage: 'No durable changes.' }) }], sharedMemento);
  const firstRun = await runOne.engine.runCliIteration(workspaceFolder(rootPath), 'loop', progressReporter(), {
    reachedIterationCap: false
  });

  assert.equal(firstRun.result.selectedTaskId, 'T2');
  assert.equal(firstRun.result.completionClassification, 'no_progress');

  const runTwo = createEngine([{ run: async () => ({ lastMessage: 'Still no durable changes.' }) }], sharedMemento);
  const secondRun = await runTwo.engine.runCliIteration(workspaceFolder(rootPath), 'loop', progressReporter(), {
    reachedIterationCap: false
  });

  assert.equal(secondRun.result.selectedTaskId, 'T2');
  assert.equal(secondRun.result.stopReason, 'repeated_no_progress');
  assert.equal(secondRun.result.remediation?.action, 'no_action');
  assert.match(secondRun.result.remediation?.summary ?? '', /does not justify an automatic remediation change/i);

  const remediationArtifact = JSON.parse(
    await fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'iteration-002', 'task-remediation.json'), 'utf8')
  ) as {
    action: string;
    rationale: string;
    summary: string;
    suggestedChildTasks: Array<{ id: string }>;
  };
  assert.equal(remediationArtifact.action, 'no_action');
  assert.match(remediationArtifact.rationale, /did not justify a stronger automatic remediation/i);
  assert.match(remediationArtifact.summary, /does not justify an automatic remediation change/i);
  assert.deepEqual(remediationArtifact.suggestedChildTasks, []);
});

test('runCliIteration replenishes the durable backlog when no actionable task remains', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath, {
    version: 2,
    tasks: [
      { id: 'T1', title: 'Already complete', status: 'done' }
    ]
  });
  await initGitRepo(rootPath);

  const harness = vscodeTestHarness();
  harness.setConfiguration({
    verifierModes: ['validationCommand', 'taskState', 'gitDiff'],
    gitCheckpointMode: 'off'
  });
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  const run = createEngine([
    {
      run: async (request) => {
        assert.match(request.prompt, /replenish `\.ralph\/tasks\.json`/i);
        await updateTaskFile(rootPath, (taskFile) => ({
          ...taskFile,
          tasks: [
            ...taskFile.tasks,
            { id: 'T2', title: 'Plan the next Ralph enhancement', status: 'todo' }
          ]
        }));
        await appendProgress(rootPath, 'Replenished the Ralph backlog with T2.');
        return {
          lastMessage: 'Backlog replenished.'
        };
      }
    }
  ]);
  const summary = await run.engine.runCliIteration(workspaceFolder(rootPath), 'loop', progressReporter(), {
    reachedIterationCap: false
  });

  assert.equal(summary.result.selectedTaskId, null);
  assert.equal(summary.prepared.promptKind, 'replenish-backlog');
  assert.equal(summary.result.executionStatus, 'succeeded');
  assert.equal(summary.result.verificationStatus, 'passed');
  assert.equal(summary.result.completionClassification, 'partial_progress');
  assert.equal(summary.result.stopReason, null);
  assert.equal(summary.result.backlog.remainingTaskCount, 1);
  assert.equal(summary.result.backlog.actionableTaskAvailable, true);
  assert.equal(summary.loopDecision.shouldContinue, true);

  const gitDiffVerifier = summary.result.verification.verifiers.find((item) => item.verifier === 'gitDiff');
  assert.ok(gitDiffVerifier);
  assert.equal(gitDiffVerifier.status, 'skipped');
  assert.match(gitDiffVerifier.summary, /no Ralph task was selected/i);
});

test('runCliIteration blocks before execution when a done parent hides the remaining blocked work', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath, {
    version: 2,
    tasks: [
      { id: 'T1', title: 'Completed parent', status: 'done' },
      { id: 'T1.1', title: 'Blocked child', status: 'blocked', parentId: 'T1', blocker: 'Waiting on ledger repair.' }
    ]
  });

  const harness = vscodeTestHarness();
  harness.setConfiguration({
    cliProvider: 'codex',
    codexCommandPath: '/tmp/ralph-codex-missing/bin/codex',
    verifierModes: ['validationCommand', 'taskState', 'gitDiff'],
    gitCheckpointMode: 'off'
  });
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  const run = createEngine([
    {
      run: async () => ({ lastMessage: 'Should not execute.' })
    }
  ]);

  await assert.rejects(
    () => run.engine.runCliIteration(workspaceFolder(rootPath), 'loop', progressReporter(), {
      reachedIterationCap: false
    }),
    /Ralph preflight blocked iteration start/
  );

  const iterationDir = path.join(rootPath, '.ralph', 'artifacts', 'iteration-001');
  const preflightReport = JSON.parse(await fs.readFile(path.join(iterationDir, 'preflight-report.json'), 'utf8')) as {
    ready: boolean;
    blocked: boolean;
    summary: string;
    diagnostics: Array<{ code: string; message: string }>;
  };
  const latestSummary = await fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-summary.md'), 'utf8');

  assert.equal(preflightReport.ready, false);
  assert.equal(preflightReport.blocked, true);
  assert.match(preflightReport.summary, /task-ledger drift blocks safe selection/i);
  assert.ok(preflightReport.diagnostics.some((diagnostic) => diagnostic.code === 'completed_parent_with_incomplete_descendants'));
  assert.ok(preflightReport.diagnostics.some((diagnostic) => /descendant tasks are still unfinished: T1\.1 \(blocked\)\./.test(diagnostic.message)));
  assert.match(latestSummary, /Preflight blocked before Codex execution started/);
  await assert.rejects(fs.access(path.join(iterationDir, 'prompt.md')));
});

test('runCliIteration stops after repeated identical failure classifications', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath, {
    version: 2,
    tasks: [
      { id: 'T1', title: 'Needs review', status: 'todo' }
    ]
  });

  const harness = vscodeTestHarness();
  harness.setConfiguration({
    verifierModes: ['taskState'],
    repeatedFailureThreshold: 2,
    stopOnHumanReviewNeeded: false
  });

  const sharedMemento = new MemoryMemento();
  const first = createEngine([
    {
      run: async () => {
        await updateTaskFile(rootPath, (taskFile) => ({
          ...taskFile,
          tasks: taskFile.tasks.map((task) => task.id === 'T1'
            ? { ...task, notes: '[human-review-needed] waiting on a person' }
            : task)
        }));
        return { lastMessage: 'Human review is required.' };
      }
    }
  ], sharedMemento);
  await first.engine.runCliIteration(workspaceFolder(rootPath), 'loop', progressReporter(), {
    reachedIterationCap: false
  });

  const second = createEngine([
    {
      run: async () => ({
        lastMessage: 'Still waiting on human review.'
      })
    }
  ], sharedMemento);
  const secondRun = await second.engine.runCliIteration(workspaceFolder(rootPath), 'loop', progressReporter(), {
    reachedIterationCap: false
  });

  assert.equal(secondRun.result.completionClassification, 'needs_human_review');
  assert.equal(secondRun.result.stopReason, 'repeated_identical_failure');
});

test('runCliIteration records a non-proposal remediation artifact for repeated identical human-review failures', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath, {
    version: 2,
    tasks: [
      {
        id: 'T1',
        title: 'Escalate a repeated human-review requirement',
        status: 'todo'
      }
    ]
  });

  const harness = vscodeTestHarness();
  harness.setConfiguration({
    verifierModes: ['taskState'],
    repeatedFailureThreshold: 2,
    stopOnHumanReviewNeeded: false,
    gitCheckpointMode: 'off'
  });

  const sharedMemento = new MemoryMemento();
  const first = createEngine([
    {
      run: async () => {
        await updateTaskFile(rootPath, (taskFile) => ({
          ...taskFile,
          tasks: taskFile.tasks.map((task) => task.id === 'T1'
            ? { ...task, notes: '[human-review-needed] waiting on a person' }
            : task)
        }));
        return { lastMessage: 'A person needs to review the result.' };
      }
    }
  ], sharedMemento);
  const firstRun = await first.engine.runCliIteration(workspaceFolder(rootPath), 'loop', progressReporter(), {
    reachedIterationCap: false
  });
  assert.equal(firstRun.result.completionClassification, 'needs_human_review');

  const second = createEngine([{ run: async () => ({ lastMessage: 'Still waiting on human review.' }) }], sharedMemento);
  const secondRun = await second.engine.runCliIteration(workspaceFolder(rootPath), 'loop', progressReporter(), {
    reachedIterationCap: false
  });

  assert.equal(secondRun.result.stopReason, 'repeated_identical_failure');
  assert.equal(secondRun.result.remediation?.action, 'no_action');
  const remediationArtifact = JSON.parse(
    await fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'iteration-002', 'task-remediation.json'), 'utf8')
  ) as {
    action: string;
    trigger: string;
    humanReviewRecommended: boolean;
    summary: string;
    rationale: string;
    triggeringHistory: Array<{ iteration: number; completionClassification: string; validationFailureSignature: string | null }>;
    suggestedChildTasks: Array<{ id: string }>;
  };
  assert.equal(remediationArtifact.action, 'no_action');
  assert.equal(remediationArtifact.trigger, 'repeated_identical_failure');
  assert.equal(remediationArtifact.humanReviewRecommended, false);
  assert.match(remediationArtifact.summary, /does not justify an automatic remediation change/i);
  assert.match(remediationArtifact.rationale, /did not justify a stronger automatic remediation/i);
  assert.deepEqual(remediationArtifact.triggeringHistory, []);
  assert.deepEqual(remediationArtifact.suggestedChildTasks, []);
  const latestRemediation = JSON.parse(
    await fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-remediation.json'), 'utf8')
  ) as {
    action: string;
    suggestedChildTasks: Array<{ id: string }>;
  };
  assert.equal(latestRemediation.action, 'no_action');
  assert.deepEqual(latestRemediation.suggestedChildTasks, []);
});

test('runCliIteration records a no-action remediation artifact for repeated identical human-review failures with durable state changes', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath, {
    version: 2,
    tasks: [
      {
        id: 'T1',
        title: 'Escalate a repeated human-review requirement',
        status: 'todo'
      }
    ]
  });

  const harness = vscodeTestHarness();
  harness.setConfiguration({
    verifierModes: ['taskState'],
    repeatedFailureThreshold: 2,
    stopOnHumanReviewNeeded: false,
    gitCheckpointMode: 'off'
  });

  const sharedMemento = new MemoryMemento();
  const first = createEngine([
    {
      run: async () => {
        await updateTaskFile(rootPath, (taskFile) => ({
          ...taskFile,
          tasks: taskFile.tasks.map((task) => task.id === 'T1'
            ? { ...task, notes: '[human-review-needed] waiting on a person' }
            : task)
        }));
        await appendProgress(rootPath, 'Iteration one still needs a person to review the result.');
        return { lastMessage: 'A person needs to review the first attempt.' };
      }
    }
  ], sharedMemento);
  const firstRun = await first.engine.runCliIteration(workspaceFolder(rootPath), 'loop', progressReporter(), {
    reachedIterationCap: false
  });
  assert.equal(firstRun.result.completionClassification, 'needs_human_review');

  const second = createEngine([
    {
      run: async () => {
        await appendProgress(rootPath, 'Iteration two still needs a person to review the result.');
        return { lastMessage: 'A person still needs to review the second attempt.' };
      }
    }
  ], sharedMemento);
  const secondRun = await second.engine.runCliIteration(workspaceFolder(rootPath), 'loop', progressReporter(), {
    reachedIterationCap: false
  });

  assert.equal(secondRun.result.stopReason, 'repeated_identical_failure');
  assert.equal(secondRun.result.remediation?.action, 'no_action');
  const remediationArtifact = JSON.parse(
    await fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'iteration-002', 'task-remediation.json'), 'utf8')
  ) as {
    action: string;
    trigger: string;
    humanReviewRecommended: boolean;
    summary: string;
    rationale: string;
    evidence: string[];
    triggeringHistory: Array<{ iteration: number; completionClassification: string; validationFailureSignature: string | null }>;
    suggestedChildTasks: Array<{ id: string }>;
  };
  assert.equal(remediationArtifact.action, 'no_action');
  assert.equal(remediationArtifact.trigger, 'repeated_identical_failure');
  assert.equal(remediationArtifact.humanReviewRecommended, false);
  assert.match(remediationArtifact.summary, /does not justify an automatic remediation change/i);
  assert.match(remediationArtifact.rationale, /did not justify a stronger automatic remediation/i);
  assert.ok(remediationArtifact.evidence.includes('classification:needs_human_review'));
  assert.deepEqual(remediationArtifact.triggeringHistory, []);
  assert.deepEqual(remediationArtifact.suggestedChildTasks, []);
  const latestRemediation = JSON.parse(
    await fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-remediation.json'), 'utf8')
  ) as {
    action: string;
    suggestedChildTasks: Array<{ id: string }>;
  };
  assert.equal(latestRemediation.action, 'no_action');
  assert.deepEqual(latestRemediation.suggestedChildTasks, []);
});

test('runCliIteration records a reframe remediation artifact for repeated validation-backed no-progress', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath, {
    version: 2,
    tasks: [
      {
        id: 'T1',
        title: 'Stabilize the deterministic validation failure',
        status: 'todo',
        validation: 'node -e "console.error(\'deterministic failure\'); process.exit(1)"'
      }
    ]
  });

  const harness = vscodeTestHarness();
  harness.setConfiguration({
    verifierModes: ['validationCommand', 'taskState'],
    noProgressThreshold: 2,
    repeatedFailureThreshold: 2,
    gitCheckpointMode: 'off',
    stopOnHumanReviewNeeded: false
  });

  const sharedMemento = new MemoryMemento();
  const first = createEngine([{ run: async () => ({ lastMessage: 'First retry preserved the failure.' }) }], sharedMemento);
  const firstRun = await first.engine.runCliIteration(workspaceFolder(rootPath), 'loop', progressReporter(), {
    reachedIterationCap: false
  });
  assert.equal(firstRun.result.completionClassification, 'no_progress');

  const second = createEngine([{ run: async () => ({ lastMessage: 'Second retry hit the same validation failure.' }) }], sharedMemento);
  const secondRun = await second.engine.runCliIteration(workspaceFolder(rootPath), 'loop', progressReporter(), {
    reachedIterationCap: false
  });

  assert.equal(secondRun.result.stopReason, 'repeated_no_progress');
  assert.equal(secondRun.result.remediation?.action, 'reframe_task');
  const remediationArtifact = JSON.parse(
    await fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'iteration-002', 'task-remediation.json'), 'utf8')
  ) as {
    action: string;
    trigger: string;
    humanReviewRecommended: boolean;
    triggeringHistory: Array<{ iteration: number; validationFailureSignature: string | null }>;
    suggestedChildTasks: Array<{ id: string; parentId: string; validation: string | null }>;
  };
  assert.equal(remediationArtifact.action, 'reframe_task');
  assert.equal(remediationArtifact.trigger, 'repeated_no_progress');
  assert.equal(remediationArtifact.humanReviewRecommended, false);
  assert.deepEqual(remediationArtifact.triggeringHistory.map((entry) => entry.iteration), [1, 2]);
  assert.ok(remediationArtifact.triggeringHistory.every((entry) => entry.validationFailureSignature));
  assert.equal(remediationArtifact.suggestedChildTasks.length, 1);
  assert.equal(remediationArtifact.suggestedChildTasks[0]?.id, 'T1.1');
  assert.equal(remediationArtifact.suggestedChildTasks[0]?.parentId, 'T1');
  assert.equal(remediationArtifact.suggestedChildTasks[0]?.validation, 'node -e "console.error(\'deterministic failure\'); process.exit(1)"');
});

test('two concurrent runCliIteration calls produce distinct iteration numbers and non-overlapping artifact directories', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath, {
    version: 2,
    tasks: [
      { id: 'T1', title: 'Concurrent task one', status: 'todo' },
      { id: 'T2', title: 'Concurrent task two', status: 'todo' }
    ]
  });

  const harness = vscodeTestHarness();
  harness.setConfiguration({
    verifierModes: ['taskState']
  });
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  const sharedMemento = new MemoryMemento();

  // Two independent engines sharing the same workspace and memento.
  const engineA = createEngine([
    {
      run: async () => ({
        lastMessage: completionReport({
          selectedTaskId: 'T1',
          requestedStatus: 'in_progress',
          progressNote: 'Engine A made progress.'
        })
      })
    }
  ], sharedMemento);

  const engineB = createEngine([
    {
      run: async () => ({
        lastMessage: completionReport({
          selectedTaskId: 'T2',
          requestedStatus: 'in_progress',
          progressNote: 'Engine B made progress.'
        })
      })
    }
  ], sharedMemento);

  const [runA, runB] = await Promise.all([
    engineA.engine.runCliIteration(workspaceFolder(rootPath), 'loop', progressReporter(), { reachedIterationCap: false }),
    engineB.engine.runCliIteration(workspaceFolder(rootPath), 'loop', progressReporter(), { reachedIterationCap: false })
  ]);

  // Each run must receive a distinct iteration number (allocateIteration serialises under state.lock).
  assert.notEqual(
    runA.result.iteration,
    runB.result.iteration,
    `Concurrent runs must produce distinct iteration numbers, both got ${runA.result.iteration}`
  );

  // Each run must write to a distinct artifact directory so they cannot overwrite each other's output.
  assert.notEqual(
    runA.result.artifactDir,
    runB.result.artifactDir,
    `Concurrent runs must use non-overlapping artifact directories`
  );

  // Both artifact directories must exist on disk — neither run overwrote the other.
  await assert.doesNotReject(fs.access(runA.result.artifactDir));
  await assert.doesNotReject(fs.access(runB.result.artifactDir));
});

test('runCliIteration stops immediately when human review is required and configured', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath, {
    version: 2,
    tasks: [
      { id: 'T1', title: 'Escalate result', status: 'todo' }
    ]
  });

  const harness = vscodeTestHarness();
  harness.setConfiguration({
    verifierModes: ['taskState'],
    stopOnHumanReviewNeeded: true
  });

  const run = createEngine([
    {
      run: async () => {
        await updateTaskFile(rootPath, (taskFile) => ({
          ...taskFile,
          tasks: taskFile.tasks.map((task) => task.id === 'T1'
            ? { ...task, blocker: '[human-review-needed] legal sign-off pending' }
            : task)
        }));
        return { lastMessage: 'Escalation recorded.' };
      }
    }
  ]);

  const summary = await run.engine.runCliIteration(workspaceFolder(rootPath), 'loop', progressReporter(), {
    reachedIterationCap: false
  });

  assert.equal(summary.result.completionClassification, 'needs_human_review');
  assert.equal(summary.result.stopReason, 'human_review_needed');
});
