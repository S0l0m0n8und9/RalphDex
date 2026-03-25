import assert from 'node:assert/strict';
import test from 'node:test';
import { scoreTaskComplexity, selectModelForTask } from '../src/ralph/complexityScorer';
import { RalphIterationResult, RalphTask, RalphTaskFile } from '../src/ralph/types';
import { RalphModelTieringConfig } from '../src/config/types';

function makeTaskFile(tasks: RalphTaskFile['tasks']): RalphTaskFile {
  return { version: 2, tasks };
}

function makeTask(overrides: Partial<RalphTask> = {}): RalphTask {
  return { id: 'T1', title: 'Do something', status: 'todo', ...overrides };
}

function makeIterationResult(overrides: Partial<RalphIterationResult> = {}): RalphIterationResult {
  return {
    schemaVersion: 1,
    agentId: 'default',
    iteration: 1,
    selectedTaskId: 'T1',
    selectedTaskTitle: 'Do something',
    promptKind: 'iteration',
    promptPath: '/w/.ralph/prompts/p.md',
    artifactDir: '/w/.ralph/artifacts/i',
    adapterUsed: 'cliExec',
    executionIntegrity: null,
    executionStatus: 'succeeded',
    verificationStatus: 'failed',
    completionClassification: 'failed',
    followUpAction: 'retry_same_task',
    startedAt: '2026-03-07T00:00:00.000Z',
    finishedAt: '2026-03-07T00:10:00.000Z',
    phaseTimestamps: {
      inspectStartedAt: '2026-03-07T00:00:00.000Z',
      inspectFinishedAt: '2026-03-07T00:01:00.000Z',
      taskSelectedAt: '2026-03-07T00:01:00.000Z',
      promptGeneratedAt: '2026-03-07T00:02:00.000Z',
      resultCollectedAt: '2026-03-07T00:07:30.000Z',
      verificationFinishedAt: '2026-03-07T00:09:00.000Z',
      classifiedAt: '2026-03-07T00:09:30.000Z'
    },
    summary: 'Failed',
    warnings: [],
    errors: [],
    execution: { exitCode: 1 },
    verification: {
      taskValidationHint: null,
      effectiveValidationCommand: null,
      normalizedValidationCommandFrom: null,
      primaryCommand: null,
      validationFailureSignature: null,
      verifiers: []
    },
    backlog: { remainingTaskCount: 1, actionableTaskAvailable: true },
    diffSummary: null,
    noProgressSignals: [],
    remediation: null,
    stopReason: null,
    ...overrides
  };
}

const DEFAULT_TIERING: RalphModelTieringConfig = {
  enabled: true,
  simpleModel: 'claude-haiku',
  mediumModel: 'claude-sonnet',
  complexModel: 'claude-opus',
  simpleThreshold: 2,
  complexThreshold: 6
};

// ---------------------------------------------------------------------------
// scoreTaskComplexity
// ---------------------------------------------------------------------------

test('scoreTaskComplexity returns score 0 for simple, unblocked task with no history', () => {
  const task = makeTask({ id: 'T1', title: 'Fix typo in README', status: 'todo' });
  const taskFile = makeTaskFile([task]);
  const { score } = scoreTaskComplexity(task, taskFile, []);
  assert.equal(score, 0);
});

test('scoreTaskComplexity adds contribution for blocked task', () => {
  const task = makeTask({ status: 'blocked', blocker: 'Waiting for review' });
  const taskFile = makeTaskFile([task]);
  const { score, signals } = scoreTaskComplexity(task, taskFile, []);
  assert.ok(score > 0, 'blocked task should have non-zero score');
  assert.ok(signals.some((s) => s.name === 'task_blocked'));
});

test('scoreTaskComplexity increases score for trailing failed iterations', () => {
  const task = makeTask();
  const taskFile = makeTaskFile([task]);
  const history = [
    makeIterationResult({ completionClassification: 'failed' }),
    makeIterationResult({ completionClassification: 'failed', iteration: 2 })
  ];
  const { score } = scoreTaskComplexity(task, taskFile, history);
  assert.ok(score >= 2, 'two trailing failures should contribute at least 2 to score');
});

test('scoreTaskComplexity scores increase with dependency count', () => {
  const task1 = makeTask({ id: 'T1' });
  const task2 = makeTask({ id: 'T2', dependsOn: ['A', 'B', 'C'] });
  const taskFile = makeTaskFile([task1, task2]);

  const { score: score1 } = scoreTaskComplexity(task1, taskFile, []);
  const { score: score2 } = scoreTaskComplexity(task2, taskFile, []);
  assert.ok(score2 > score1, 'task with more dependencies should score higher');
});

test('scoreTaskComplexity caps trailing failures at 4', () => {
  const task = makeTask();
  const taskFile = makeTaskFile([task]);
  const history = Array.from({ length: 10 }, (_, i) =>
    makeIterationResult({ completionClassification: 'failed', iteration: i + 1 })
  );
  const { signals } = scoreTaskComplexity(task, taskFile, history);
  const failSignal = signals.find((s) => s.name === 'trailing_complex_classifications');
  assert.ok(failSignal !== undefined);
  assert.ok(failSignal.contribution <= 4, 'trailing failure contribution should be capped at 4');
});

// ---------------------------------------------------------------------------
// selectModelForTask
// ---------------------------------------------------------------------------

test('selectModelForTask returns fallback model when tiering is disabled', () => {
  const task = makeTask();
  const taskFile = makeTaskFile([task]);
  const { model, score } = selectModelForTask({
    task,
    taskFile,
    iterationHistory: [],
    tiering: { ...DEFAULT_TIERING, enabled: false },
    fallbackModel: 'claude-sonnet-default'
  });
  assert.equal(model, 'claude-sonnet-default');
  assert.equal(score, null);
});

test('selectModelForTask selects simple model for low-complexity task', () => {
  const task = makeTask({ title: 'Fix typo' });
  const taskFile = makeTaskFile([task]);
  const { model } = selectModelForTask({
    task,
    taskFile,
    iterationHistory: [],
    tiering: DEFAULT_TIERING,
    fallbackModel: 'claude-sonnet'
  });
  assert.equal(model, DEFAULT_TIERING.simpleModel);
});

test('selectModelForTask selects complex model for high-complexity task', () => {
  const task = makeTask({ status: 'blocked', blocker: 'Needs architecture decision', dependsOn: ['T2', 'T3', 'T4'] });
  const taskFile = makeTaskFile([task]);
  const history = Array.from({ length: 4 }, (_, i) =>
    makeIterationResult({ completionClassification: 'failed', iteration: i + 1 })
  );
  const { model, score } = selectModelForTask({
    task,
    taskFile,
    iterationHistory: history,
    tiering: DEFAULT_TIERING,
    fallbackModel: 'claude-sonnet'
  });
  assert.ok(score !== null && score.score >= DEFAULT_TIERING.complexThreshold,
    `score ${score?.score} should be >= complexThreshold ${DEFAULT_TIERING.complexThreshold}`
  );
  assert.equal(model, DEFAULT_TIERING.complexModel);
});
