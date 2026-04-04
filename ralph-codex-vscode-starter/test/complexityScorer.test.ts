import assert from 'node:assert/strict';
import test from 'node:test';
import { scoreTaskComplexity, selectModelForTask } from '../src/ralph/complexityScorer';
import { RalphIterationResult, RalphTask, RalphTaskFile } from '../src/ralph/types';
import { RalphModelTieringConfig } from '../src/config/types';

function makeTaskFile(tasks: RalphTaskFile['tasks']): RalphTaskFile {
  return { version: 2, tasks };
}

function makeTask(overrides: Partial<RalphTask> = {}): RalphTask {
  return { id: 'T1', title: 'Do something useful', status: 'todo', ...overrides };
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
  simple: { model: 'claude-haiku' },
  medium: { model: 'claude-sonnet' },
  complex: { model: 'claude-opus' },
  simpleThreshold: 2,
  complexThreshold: 6
};

// ---------------------------------------------------------------------------
// scoreTaskComplexity
// ---------------------------------------------------------------------------

test('scoreTaskComplexity returns score 0 for simple, unblocked task with no history', () => {
  const task = makeTask({ id: 'T1', title: 'Fix typo in README', status: 'todo' });
  const taskFile = makeTaskFile([task]);
  const { score, signals } = scoreTaskComplexity(task, taskFile, []);
  assert.equal(score, 0);
  assert.deepEqual(signals, []);
});

test('scoreTaskComplexity adds +2 for validation field', () => {
  const task = makeTask({ validation: 'npm test' });
  const taskFile = makeTaskFile([task]);
  const { score, signals } = scoreTaskComplexity(task, taskFile, []);
  assert.equal(score, 2);
  assert.deepEqual(signals, [{ name: 'has_validation_field', contribution: 2 }]);
});

test('scoreTaskComplexity adds +1 per child task capped at 3', () => {
  const parent = makeTask({ id: 'T1' });
  const child1 = makeTask({ id: 'T1.1', parentId: 'T1' });
  const child2 = makeTask({ id: 'T1.2', parentId: 'T1' });
  const child3 = makeTask({ id: 'T1.3', parentId: 'T1' });
  const child4 = makeTask({ id: 'T1.4', parentId: 'T1' });
  const taskFile = makeTaskFile([parent, child1, child2, child3, child4]);

  const { score, signals } = scoreTaskComplexity(parent, taskFile, []);
  assert.equal(score, 3);
  assert.deepEqual(signals, [{ name: 'child_task_count', contribution: 3 }]);
});

test('scoreTaskComplexity adds +1 for blocker note', () => {
  const task = makeTask({ blocker: 'Waiting for review' });
  const taskFile = makeTaskFile([task]);
  const { score, signals } = scoreTaskComplexity(task, taskFile, []);
  assert.equal(score, 1);
  assert.deepEqual(signals, [{ name: 'has_blocker_note', contribution: 1 }]);
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

test('scoreTaskComplexity caps title word count contribution to ±1', () => {
  const shortTask = makeTask({ id: 'T1', title: 'Rename button' });
  const longTask = makeTask({
    id: 'T2',
    title: 'Split workflow execution into stable phases with durable task evidence and verification handoff'
  });
  const taskFile = makeTaskFile([shortTask, longTask]);

  const { signals: shortSignals } = scoreTaskComplexity(shortTask, taskFile, []);
  const { signals: longSignals } = scoreTaskComplexity(longTask, taskFile, []);

  assert.deepEqual(shortSignals, [{ name: 'title_word_count', contribution: -1 }]);
  assert.deepEqual(longSignals, [{ name: 'title_word_count', contribution: 1 }]);
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
  assert.equal(model, DEFAULT_TIERING.simple.model);
});

test('selectModelForTask selects complex model for high-complexity task', () => {
  const task = makeTask({
    id: 'T1',
    blocker: 'Needs architecture decision',
    validation: 'npm run validate'
  });
  const taskFile = makeTaskFile([
    task,
    makeTask({ id: 'T1.1', parentId: 'T1' }),
    makeTask({ id: 'T1.2', parentId: 'T1' }),
    makeTask({ id: 'T1.3', parentId: 'T1' })
  ]);
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
  assert.equal(model, DEFAULT_TIERING.complex.model);
});

test('selectModelForTask returns per-tier provider when specified', () => {
  const task = makeTask({ title: 'Fix typo' });
  const taskFile = makeTaskFile([task]);
  const tiering: RalphModelTieringConfig = {
    enabled: true,
    simple: { provider: 'copilot', model: 'gpt-5.4-mini' },
    medium: { model: 'claude-sonnet' },
    complex: { provider: 'copilot', model: 'gpt-5.4' },
    simpleThreshold: 2,
    complexThreshold: 6
  };
  const { model, provider } = selectModelForTask({
    task,
    taskFile,
    iterationHistory: [],
    tiering,
    fallbackModel: 'claude-sonnet'
  });
  assert.equal(model, 'gpt-5.4-mini');
  assert.equal(provider, 'copilot');
});

test('selectModelForTask returns undefined provider when tier has no override', () => {
  const task = makeTask({ title: 'Medium complexity work here that is fine' });
  const taskFile = makeTaskFile([task]);
  // Score for this task will be 0 (no validation, children, blocker note, failures, or title adjustment) → simple tier
  const tiering: RalphModelTieringConfig = {
    enabled: true,
    simple: { model: 'claude-haiku' },
    medium: { provider: 'copilot', model: 'gpt-5.4' },
    complex: { model: 'claude-opus' },
    simpleThreshold: 2,
    complexThreshold: 6
  };
  const { provider } = selectModelForTask({
    task,
    taskFile,
    iterationHistory: [],
    tiering,
    fallbackModel: 'claude-sonnet'
  });
  assert.equal(provider, undefined);
});
