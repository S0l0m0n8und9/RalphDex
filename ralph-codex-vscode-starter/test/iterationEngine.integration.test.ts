import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import * as vscode from 'vscode';
import { DEFAULT_CONFIG } from '../src/config/defaults';
import { CodexExecRequest, CodexExecResult } from '../src/codex/types';
import { hashText } from '../src/ralph/integrity';
import { RalphIterationEngine } from '../src/ralph/iterationEngine';
import { RalphStateManager } from '../src/ralph/stateManager';
import { RalphTaskFile } from '../src/ralph/types';
import { Logger } from '../src/services/logger';
import { vscodeTestHarness } from './support/vscodeTestHarness';

const execFileAsync = promisify(execFile);

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

async function initGitRepo(rootPath: string): Promise<void> {
  await execFileAsync('git', ['init', '--initial-branch=main'], { cwd: rootPath });
  await execFileAsync('git', ['config', 'user.email', 'tests@example.com'], { cwd: rootPath });
  await execFileAsync('git', ['config', 'user.name', 'Ralph Tests'], { cwd: rootPath });
  await execFileAsync('git', ['add', '.'], { cwd: rootPath });
  await execFileAsync('git', ['commit', '-m', 'initial'], { cwd: rootPath });
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

function createEngine(steps: MockExecStep[], workspaceState = new MemoryMemento()): {
  engine: RalphIterationEngine;
  stateManager: RalphStateManager;
} {
  const logger = createLogger();
  const stateManager = new RalphStateManager(workspaceState, logger);
  const engine = new RalphIterationEngine(
    stateManager,
    new MockStrategyRegistry(steps) as never,
    logger
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
      { id: 'T1.1', title: 'Follow-up child task', status: 'todo', parentId: 'T1' }
    ]
  });
  await initGitRepo(rootPath);

  const harness = vscodeTestHarness();
  harness.setConfiguration({
    verifierModes: ['gitDiff', 'taskState'],
    gitCheckpointMode: 'snapshotAndDiff'
  });
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  const sharedMemento = new MemoryMemento();
  const first = createEngine([
    {
      run: async () => {
        await fs.writeFile(path.join(rootPath, 'src', 'feature.ts'), 'export const ready = "iteration-one";\n', 'utf8');
        await appendProgress(rootPath, 'Iteration one changed src/feature.ts.');
        return {
          stdout: 'changed feature.ts',
          lastMessage: 'Iteration one made progress.'
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

  const executionPlan = JSON.parse(await fs.readFile(path.join(iterationDir, 'execution-plan.json'), 'utf8')) as {
    promptKind: string;
    promptHash: string;
    promptArtifactPath: string;
  };
  const promptArtifact = await fs.readFile(path.join(iterationDir, 'prompt.md'), 'utf8');
  assert.equal(executionPlan.promptKind, 'bootstrap');
  assert.equal(executionPlan.promptHash, hashText(promptArtifact));
  assert.equal(executionPlan.promptArtifactPath, path.join(iterationDir, 'prompt.md'));

  const cliInvocation = JSON.parse(await fs.readFile(path.join(iterationDir, 'cli-invocation.json'), 'utf8')) as {
    stdinHash: string;
    promptHash: string;
    promptArtifactPath: string;
  };
  assert.equal(cliInvocation.stdinHash, executionPlan.promptHash);
  assert.equal(cliInvocation.promptHash, executionPlan.promptHash);
  assert.equal(cliInvocation.promptArtifactPath, executionPlan.promptArtifactPath);

  const reloadedState = await first.stateManager.loadState(rootPath, first.stateManager.resolvePaths(rootPath, DEFAULT_CONFIG));
  assert.equal(reloadedState.nextIteration, 2);
  assert.equal(reloadedState.iterationHistory.length, 1);
  assert.equal(reloadedState.lastIteration?.selectedTaskTitle, 'Implement parent task');
  assert.equal(reloadedState.lastIteration?.executionIntegrity?.executionPayloadMatched, true);

  const second = createEngine([
    {
      run: async () => {
        await updateTaskFile(rootPath, (taskFile) => ({
          ...taskFile,
          tasks: taskFile.tasks.map((task) => task.id === 'T1' ? { ...task, status: 'done' } : task)
        }));
        await appendProgress(rootPath, 'Iteration two completed T1.');
        return {
          stdout: 'completed parent task',
          lastMessage: 'Iteration two completed the selected task.'
        };
      }
    }
  ], sharedMemento);

  const secondRun = await second.engine.runCliIteration(workspaceFolder(rootPath), 'loop', progressReporter(), {
    reachedIterationCap: false
  });

  assert.equal(secondRun.result.iteration, 2);
  assert.equal(secondRun.result.completionClassification, 'complete');
  assert.equal(secondRun.result.followUpAction, 'continue_same_task');
  assert.equal(secondRun.result.stopReason, null);
  assert.equal(secondRun.result.backlog.remainingTaskCount, 1);
  assert.equal(secondRun.result.backlog.actionableTaskAvailable, true);
  assert.equal(secondRun.loopDecision.shouldContinue, true);

  const latestSummary = await fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-summary.md'), 'utf8');
  assert.match(latestSummary, /Backlog remaining: 1/);
  assert.doesNotMatch(latestSummary, /Stop reason: task_marked_complete/);
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
    blocked: boolean;
    ready: boolean;
    diagnostics: Array<{ code: string }>;
  };
  const latestSummary = await fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-summary.md'), 'utf8');

  assert.equal(preflightReport.ready, false);
  assert.equal(preflightReport.blocked, true);
  const diagnosticCodes = preflightReport.diagnostics.map((diagnostic) => diagnostic.code);
  assert.ok(diagnosticCodes.includes('codex_cli_missing'));
  assert.ok(diagnosticCodes.includes('invalid_dependency_reference'));
  assert.match(latestSummary, /Preflight blocked before Codex execution started/);
});

test('runCliIteration stops after repeated no-progress iterations', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath, {
    version: 2,
    tasks: [
      { id: 'T1', title: 'Do the thing', status: 'todo' }
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

test('runCliIteration can stop on verifier-driven completion without an explicit done state', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath, {
    version: 2,
    tasks: [
      { id: 'T1', title: 'Document result', status: 'todo' }
    ]
  });

  const harness = vscodeTestHarness();
  harness.setConfiguration({
    verifierModes: ['taskState'],
    gitCheckpointMode: 'off'
  });

  const run = createEngine([
    {
      run: async () => {
        await appendProgress(rootPath, 'Verifier saw concrete progress.');
        return { lastMessage: 'Updated progress log only.' };
      }
    }
  ]);

  const summary = await run.engine.runCliIteration(workspaceFolder(rootPath), 'loop', progressReporter(), {
    reachedIterationCap: false
  });

  assert.equal(summary.result.verificationStatus, 'passed');
  assert.equal(summary.result.stopReason, 'verification_passed_no_remaining_subtasks');
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
