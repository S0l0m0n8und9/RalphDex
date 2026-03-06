import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildValidationFailureSignature,
  classifyIterationOutcome,
  decideLoopContinuation
} from '../src/ralph/loopLogic';
import { RalphIterationResult } from '../src/ralph/types';

function iterationResult(overrides: Partial<RalphIterationResult> = {}): RalphIterationResult {
  return {
    schemaVersion: 1,
    iteration: 1,
    selectedTaskId: 'T1',
    promptKind: 'iteration',
    promptPath: '/workspace/.ralph/prompts/iteration-001.prompt.md',
    artifactDir: '/workspace/.ralph/artifacts/iteration-001',
    adapterUsed: 'cliExec',
    executionStatus: 'succeeded',
    verificationStatus: 'failed',
    completionClassification: 'no_progress',
    followUpAction: 'retry_same_task',
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
    summary: 'No progress',
    warnings: [],
    errors: [],
    execution: {
      exitCode: 0
    },
    verification: {
      primaryCommand: 'npm test',
      validationFailureSignature: 'npm test::exit:1::same failure',
      verifiers: []
    },
    diffSummary: {
      available: true,
      summary: 'No relevant file changes were detected.',
      changedFiles: [],
      relevantChangedFiles: [],
      statusTransitions: []
    },
    noProgressSignals: ['same_task_selected_repeatedly'],
    stopReason: null,
    ...overrides
  };
}

test('buildValidationFailureSignature normalizes deterministic output', () => {
  const signature = buildValidationFailureSignature('npm test', 1, 'stdout line', 'stderr line');

  assert.equal(signature, 'npm test::exit:1::stderr line | stdout line');
});

test('classifyIterationOutcome reports complete when the selected task is done', () => {
  const outcome = classifyIterationOutcome({
    selectedTaskId: 'T1',
    selectedTaskCompleted: true,
    selectedTaskBlocked: false,
    humanReviewNeeded: false,
    remainingSubtaskCount: 0,
    executionStatus: 'succeeded',
    verificationStatus: 'passed',
    validationFailureSignature: null,
    relevantFileChanges: ['src/loop.ts'],
    progressChanged: true,
    taskFileChanged: true,
    previousIterations: []
  });

  assert.equal(outcome.classification, 'complete');
  assert.equal(outcome.followUpAction, 'stop');
});

test('classifyIterationOutcome detects conservative no-progress signals', () => {
  const previous = iterationResult();
  const outcome = classifyIterationOutcome({
    selectedTaskId: 'T1',
    selectedTaskCompleted: false,
    selectedTaskBlocked: false,
    humanReviewNeeded: false,
    remainingSubtaskCount: 0,
    executionStatus: 'succeeded',
    verificationStatus: 'failed',
    validationFailureSignature: previous.verification.validationFailureSignature,
    relevantFileChanges: [],
    progressChanged: false,
    taskFileChanged: false,
    previousIterations: [previous]
  });

  assert.equal(outcome.classification, 'no_progress');
  assert.ok(outcome.noProgressSignals.includes('same_task_selected_repeatedly'));
  assert.ok(outcome.noProgressSignals.includes('same_validation_failure_signature'));
});

test('decideLoopContinuation stops on repeated no-progress iterations', () => {
  const previous = iterationResult();
  const current = iterationResult({ iteration: 2 });
  const decision = decideLoopContinuation({
    currentResult: current,
    selectedTaskCompleted: false,
    remainingSubtaskCount: 0,
    hasActionableTask: true,
    noProgressThreshold: 2,
    repeatedFailureThreshold: 3,
    stopOnHumanReviewNeeded: true,
    reachedIterationCap: false,
    previousIterations: [previous]
  });

  assert.equal(decision.shouldContinue, false);
  assert.equal(decision.stopReason, 'repeated_no_progress');
});

test('decideLoopContinuation stops on repeated identical failure classifications', () => {
  const previous = iterationResult({
    completionClassification: 'failed',
    verificationStatus: 'failed'
  });
  const current = iterationResult({
    iteration: 2,
    completionClassification: 'failed',
    verificationStatus: 'failed'
  });
  const decision = decideLoopContinuation({
    currentResult: current,
    selectedTaskCompleted: false,
    remainingSubtaskCount: 1,
    hasActionableTask: true,
    noProgressThreshold: 5,
    repeatedFailureThreshold: 2,
    stopOnHumanReviewNeeded: true,
    reachedIterationCap: false,
    previousIterations: [previous]
  });

  assert.equal(decision.shouldContinue, false);
  assert.equal(decision.stopReason, 'repeated_identical_failure');
});
