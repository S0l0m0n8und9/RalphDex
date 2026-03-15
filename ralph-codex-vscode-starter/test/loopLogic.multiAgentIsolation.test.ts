import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTaskRemediation, decideLoopContinuation } from '../src/ralph/loopLogic';
import { DEFAULT_RALPH_AGENT_ID, RalphIterationResult } from '../src/ralph/types';

function iterationResult(overrides: Partial<RalphIterationResult> = {}): RalphIterationResult {
  return {
    schemaVersion: 1,
    agentId: DEFAULT_RALPH_AGENT_ID,
    iteration: 1,
    selectedTaskId: 'T1',
    selectedTaskTitle: 'Task one',
    promptKind: 'iteration',
    promptPath: '/workspace/.ralph/prompts/iteration-001.prompt.md',
    artifactDir: '/workspace/.ralph/artifacts/iteration-001',
    adapterUsed: 'cliExec',
    executionIntegrity: null,
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
      taskValidationHint: null,
      effectiveValidationCommand: 'npm test',
      normalizedValidationCommandFrom: null,
      primaryCommand: 'npm test',
      validationFailureSignature: 'npm test::exit:1::same failure',
      verifiers: []
    },
    backlog: {
      remainingTaskCount: 1,
      actionableTaskAvailable: true
    },
    diffSummary: {
      available: true,
      gitAvailable: true,
      summary: 'No relevant file changes were detected.',
      changedFileCount: 0,
      relevantChangedFileCount: 0,
      changedFiles: [],
      relevantChangedFiles: [],
      statusTransitions: []
    },
    noProgressSignals: ['same_task_selected_repeatedly'],
    remediation: null,
    completionReportStatus: 'missing',
    reconciliationWarnings: [],
    stopReason: null,
    ...overrides
  };
}

test('decideLoopContinuation does not mix default-agent no-progress history into an explicit agent streak', () => {
  const previous = iterationResult({ iteration: 1 });
  const current = iterationResult({ iteration: 2, agentId: 'agent-a' });
  const decision = decideLoopContinuation({
    currentResult: current,
    selectedTaskCompleted: false,
    remainingSubtaskCount: 0,
    remainingTaskCount: 1,
    hasActionableTask: true,
    preflightDiagnostics: [],
    noProgressThreshold: 2,
    repeatedFailureThreshold: 3,
    stopOnHumanReviewNeeded: true,
    autoReplenishBacklog: false,
    reachedIterationCap: false,
    previousIterations: [previous]
  });

  assert.equal(decision.shouldContinue, true);
  assert.equal(decision.stopReason, null);
});

test('buildTaskRemediation does not mix default-agent no-progress history into an explicit agent streak', () => {
  const previous = iterationResult({ iteration: 1 });
  const current = iterationResult({
    iteration: 2,
    agentId: 'agent-a',
    stopReason: 'repeated_no_progress',
    noProgressSignals: ['same_task_selected_repeatedly', 'same_validation_failure_signature']
  });

  const remediation = buildTaskRemediation({
    currentResult: current,
    stopReason: 'repeated_no_progress',
    previousIterations: [previous]
  });

  assert.equal(remediation, null);
});

test('buildTaskRemediation does not mix default-agent repeated failures into an explicit agent streak', () => {
  const previous = iterationResult({
    iteration: 1,
    completionClassification: 'failed',
    verificationStatus: 'failed',
    noProgressSignals: []
  });
  const current = iterationResult({
    iteration: 2,
    agentId: 'agent-a',
    completionClassification: 'failed',
    verificationStatus: 'failed',
    stopReason: 'repeated_identical_failure',
    noProgressSignals: []
  });

  const remediation = buildTaskRemediation({
    currentResult: current,
    stopReason: 'repeated_identical_failure',
    previousIterations: [previous]
  });

  assert.equal(remediation, null);
});
