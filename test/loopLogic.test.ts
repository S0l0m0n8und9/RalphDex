import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildTaskRemediation,
  buildValidationFailureSignature,
  classifyIterationOutcome,
  decideLoopContinuation
} from '../src/ralph/loopLogic';
import { DEFAULT_RALPH_AGENT_ID, RalphIterationResult, RalphPreflightDiagnostic } from '../src/ralph/types';

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

function stopDecisionInput(
  overrides: Partial<Parameters<typeof decideLoopContinuation>[0]> = {}
): Parameters<typeof decideLoopContinuation>[0] {
  return {
    currentResult: iterationResult(),
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
    previousIterations: [],
    ...overrides
  };
}

function diagnostic(overrides: Partial<RalphPreflightDiagnostic>): RalphPreflightDiagnostic {
  return {
    category: 'taskGraph',
    severity: 'info',
    code: 'info',
    message: 'info',
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
    remainingTaskCount: 0,
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

test('classifyIterationOutcome keeps task completion distinct when backlog remains', () => {
  const outcome = classifyIterationOutcome({
    selectedTaskId: 'T1',
    selectedTaskCompleted: true,
    selectedTaskBlocked: false,
    humanReviewNeeded: false,
    remainingSubtaskCount: 0,
    remainingTaskCount: 3,
    executionStatus: 'succeeded',
    verificationStatus: 'failed',
    validationFailureSignature: null,
    relevantFileChanges: ['.ralph/tasks.json'],
    progressChanged: true,
    taskFileChanged: true,
    previousIterations: []
  });

  assert.equal(outcome.classification, 'complete');
  assert.equal(outcome.followUpAction, 'continue_next_task');
});

test('classifyIterationOutcome detects conservative no-progress signals', () => {
  const previous = iterationResult();
  const outcome = classifyIterationOutcome({
    selectedTaskId: 'T1',
    selectedTaskCompleted: false,
    selectedTaskBlocked: false,
    humanReviewNeeded: false,
    remainingSubtaskCount: 0,
    remainingTaskCount: 1,
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
  const decision = decideLoopContinuation(stopDecisionInput({
    currentResult: current,
    previousIterations: [previous]
  }));

  assert.equal(decision.shouldContinue, false);
  assert.equal(decision.stopReason, 'repeated_no_progress');
});

test('decideLoopContinuation ignores no-progress streaks across different tasks', () => {
  const previous = iterationResult({ selectedTaskId: 'T0', selectedTaskTitle: 'Other task' });
  const current = iterationResult({ iteration: 2, selectedTaskId: 'T1' });
  const decision = decideLoopContinuation(stopDecisionInput({
    currentResult: current,
    previousIterations: [previous]
  }));

  assert.equal(decision.shouldContinue, true);
  assert.equal(decision.stopReason, null);
});

test('decideLoopContinuation ignores interleaved no-progress history from another agent on the same task', () => {
  const previous = iterationResult({ iteration: 1, agentId: 'agent-a' });
  const interleaved = iterationResult({ iteration: 2, agentId: 'agent-b' });
  const current = iterationResult({ iteration: 3, agentId: 'agent-a' });
  const decision = decideLoopContinuation(stopDecisionInput({
    currentResult: current,
    previousIterations: [previous, interleaved]
  }));

  assert.equal(decision.shouldContinue, true);
  assert.equal(decision.stopReason, null);
});

test('decideLoopContinuation keeps repeated-no-progress tracking isolated for each agent on the same task', () => {
  const agentAFirst = iterationResult({ iteration: 1, agentId: 'agent-a' });
  const agentBFirst = iterationResult({ iteration: 2, agentId: 'agent-b' });
  const agentASecond = iterationResult({ iteration: 3, agentId: 'agent-a' });
  const agentBSecond = iterationResult({ iteration: 4, agentId: 'agent-b' });

  const agentADecision = decideLoopContinuation(stopDecisionInput({
    currentResult: agentASecond,
    previousIterations: [agentAFirst, agentBFirst]
  }));
  const agentBDecision = decideLoopContinuation(stopDecisionInput({
    currentResult: agentBSecond,
    previousIterations: [agentAFirst, agentBFirst, agentASecond]
  }));

  assert.equal(agentADecision.shouldContinue, true);
  assert.equal(agentADecision.stopReason, null);
  assert.equal(agentBDecision.shouldContinue, true);
  assert.equal(agentBDecision.stopReason, null);
});

test('decideLoopContinuation still counts a default-agent no-progress streak on the same task', () => {
  const previous = iterationResult({ iteration: 1 });
  const current = iterationResult({ iteration: 2 });
  const decision = decideLoopContinuation(stopDecisionInput({
    currentResult: current,
    previousIterations: [previous]
  }));

  assert.equal(decision.shouldContinue, false);
  assert.equal(decision.stopReason, 'repeated_no_progress');
});

test('decideLoopContinuation stops when one agent alone reaches the no-progress threshold on the same task', () => {
  const previous = iterationResult({ iteration: 1, agentId: 'agent-a' });
  const current = iterationResult({ iteration: 2, agentId: 'agent-a' });
  const decision = decideLoopContinuation(stopDecisionInput({
    currentResult: current,
    previousIterations: [previous]
  }));

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
  const decision = decideLoopContinuation(stopDecisionInput({
    currentResult: current,
    remainingSubtaskCount: 1,
    noProgressThreshold: 5,
    repeatedFailureThreshold: 2,
    previousIterations: [previous]
  }));

  assert.equal(decision.shouldContinue, false);
  assert.equal(decision.stopReason, 'repeated_identical_failure');
});

test('decideLoopContinuation ignores interleaved identical failures from another agent on the same task', () => {
  const previous = iterationResult({
    iteration: 1,
    agentId: 'agent-a',
    completionClassification: 'failed',
    verificationStatus: 'failed'
  });
  const interleaved = iterationResult({
    iteration: 2,
    agentId: 'agent-b',
    completionClassification: 'failed',
    verificationStatus: 'failed'
  });
  const current = iterationResult({
    iteration: 3,
    agentId: 'agent-a',
    completionClassification: 'failed',
    verificationStatus: 'failed'
  });
  const decision = decideLoopContinuation(stopDecisionInput({
    currentResult: current,
    remainingSubtaskCount: 1,
    noProgressThreshold: 5,
    repeatedFailureThreshold: 2,
    previousIterations: [previous, interleaved]
  }));

  assert.equal(decision.shouldContinue, true);
  assert.equal(decision.stopReason, null);
});

test('buildTaskRemediation reframes repeated no-progress with the same validation signature', () => {
  const previous = iterationResult();
  const current = iterationResult({
    iteration: 2,
    stopReason: 'repeated_no_progress',
    noProgressSignals: ['same_task_selected_repeatedly', 'same_validation_failure_signature']
  });

  const remediation = buildTaskRemediation({
    currentResult: current,
    stopReason: 'repeated_no_progress',
    previousIterations: [previous]
  });

  assert.ok(remediation);
  assert.equal(remediation.taskId, 'T1');
  assert.equal(remediation.action, 'reframe_task');
  assert.equal(remediation.attemptCount, 2);
  assert.equal(remediation.humanReviewRecommended, false);
  assert.match(remediation.summary, /reframe the task/i);
  assert.ok(remediation.evidence.includes('same_validation_failure_signature'));
});

test('buildTaskRemediation marks repeated blocked outcomes as blocked', () => {
  const previous = iterationResult({
    completionClassification: 'blocked',
    verificationStatus: 'failed',
    verification: {
      ...iterationResult().verification,
      validationFailureSignature: 'npm test::exit:1::first blocker'
    }
  });
  const current = iterationResult({
    iteration: 2,
    completionClassification: 'blocked',
    verificationStatus: 'failed',
    stopReason: 'repeated_identical_failure',
    verification: {
      ...iterationResult().verification,
      validationFailureSignature: 'npm test::exit:1::second blocker'
    }
  });

  const remediation = buildTaskRemediation({
    currentResult: current,
    stopReason: 'repeated_identical_failure',
    previousIterations: [previous]
  });

  assert.ok(remediation);
  assert.equal(remediation.action, 'mark_blocked');
  assert.equal(remediation.attemptCount, 2);
  assert.equal(remediation.humanReviewRecommended, true);
  assert.match(remediation.summary, /mark it blocked/i);
  assert.ok(remediation.evidence.includes('same_task_blocked_repeatedly'));
});

test('buildTaskRemediation ignores interleaved blocked history from another agent on the same task', () => {
  const previous = iterationResult({
    iteration: 1,
    agentId: 'agent-a',
    completionClassification: 'blocked',
    verificationStatus: 'failed',
    verification: {
      ...iterationResult().verification,
      validationFailureSignature: 'npm test::exit:1::first blocker'
    }
  });
  const interleaved = iterationResult({
    iteration: 2,
    agentId: 'agent-b',
    completionClassification: 'blocked',
    verificationStatus: 'failed',
    verification: {
      ...iterationResult().verification,
      validationFailureSignature: 'npm test::exit:1::second blocker'
    }
  });
  const current = iterationResult({
    iteration: 3,
    agentId: 'agent-a',
    completionClassification: 'blocked',
    verificationStatus: 'failed',
    stopReason: 'repeated_identical_failure',
    verification: {
      ...iterationResult().verification,
      validationFailureSignature: 'npm test::exit:1::third blocker'
    }
  });

  const remediation = buildTaskRemediation({
    currentResult: current,
    stopReason: 'repeated_identical_failure',
    previousIterations: [previous, interleaved]
  });

  assert.equal(remediation, null);
});

test('buildTaskRemediation decomposes repeated no-progress with no durable changes', () => {
  const previous = iterationResult({
    noProgressSignals: ['same_task_selected_repeatedly', 'no_relevant_file_changes', 'task_and_progress_state_unchanged']
  });
  const current = iterationResult({
    iteration: 2,
    stopReason: 'repeated_no_progress',
    noProgressSignals: ['same_task_selected_repeatedly', 'no_relevant_file_changes', 'task_and_progress_state_unchanged'],
    verification: {
      ...iterationResult().verification,
      validationFailureSignature: null
    }
  });

  const remediation = buildTaskRemediation({
    currentResult: current,
    stopReason: 'repeated_no_progress',
    previousIterations: [previous]
  });

  assert.ok(remediation);
  assert.equal(remediation.action, 'decompose_task');
  assert.equal(remediation.humanReviewRecommended, false);
  assert.match(remediation.summary, /decompose the task/i);
});

test('buildTaskRemediation ignores interleaved no-progress history from another agent on the same task', () => {
  const previous = iterationResult({ iteration: 1, agentId: 'agent-a' });
  const interleaved = iterationResult({ iteration: 2, agentId: 'agent-b' });
  const current = iterationResult({
    iteration: 3,
    agentId: 'agent-a',
    stopReason: 'repeated_no_progress',
    noProgressSignals: ['same_task_selected_repeatedly', 'same_validation_failure_signature']
  });

  const remediation = buildTaskRemediation({
    currentResult: current,
    stopReason: 'repeated_no_progress',
    previousIterations: [previous, interleaved]
  });

  assert.equal(remediation, null);
});

test('buildTaskRemediation still counts a default-agent no-progress streak on the same task', () => {
  const previous = iterationResult({ iteration: 1 });
  const current = iterationResult({
    iteration: 2,
    stopReason: 'repeated_no_progress',
    noProgressSignals: ['same_task_selected_repeatedly', 'same_validation_failure_signature']
  });

  const remediation = buildTaskRemediation({
    currentResult: current,
    stopReason: 'repeated_no_progress',
    previousIterations: [previous]
  });

  assert.ok(remediation);
  assert.equal(remediation.attemptCount, 2);
  assert.equal(remediation.taskId, 'T1');
});

test('buildTaskRemediation ignores interleaved identical failures from another agent on the same task', () => {
  const previous = iterationResult({
    iteration: 1,
    agentId: 'agent-a',
    completionClassification: 'failed',
    verificationStatus: 'failed',
    noProgressSignals: [],
    verification: {
      ...iterationResult().verification,
      validationFailureSignature: 'npm test::exit:1::deterministic failure'
    }
  });
  const interleaved = iterationResult({
    iteration: 2,
    agentId: 'agent-b',
    completionClassification: 'failed',
    verificationStatus: 'failed',
    noProgressSignals: [],
    verification: {
      ...iterationResult().verification,
      validationFailureSignature: 'npm test::exit:1::deterministic failure'
    }
  });
  const current = iterationResult({
    iteration: 3,
    agentId: 'agent-a',
    completionClassification: 'failed',
    verificationStatus: 'failed',
    stopReason: 'repeated_identical_failure',
    noProgressSignals: [],
    verification: {
      ...iterationResult().verification,
      validationFailureSignature: 'npm test::exit:1::deterministic failure'
    }
  });

  const remediation = buildTaskRemediation({
    currentResult: current,
    stopReason: 'repeated_identical_failure',
    previousIterations: [previous, interleaved]
  });

  assert.equal(remediation, null);
});

test('buildTaskRemediation records no_action when repeated failures do not justify a narrower remediation', () => {
  const previous = iterationResult({
    completionClassification: 'needs_human_review',
    verificationStatus: 'failed',
    noProgressSignals: []
  });
  const current = iterationResult({
    iteration: 2,
    completionClassification: 'needs_human_review',
    verificationStatus: 'failed',
    stopReason: 'repeated_identical_failure',
    noProgressSignals: []
  });

  const remediation = buildTaskRemediation({
    currentResult: current,
    stopReason: 'repeated_identical_failure',
    previousIterations: [previous]
  });

  assert.ok(remediation);
  assert.equal(remediation.action, 'no_action');
  assert.equal(remediation.humanReviewRecommended, false);
  assert.match(remediation.summary, /does not justify an automatic remediation change/i);
});

test('buildTaskRemediation requests human review for repeated identical failed signatures', () => {
  const previous = iterationResult({
    completionClassification: 'failed',
    verificationStatus: 'failed',
    noProgressSignals: [],
    verification: {
      ...iterationResult().verification,
      validationFailureSignature: 'npm test::exit:1::deterministic failure'
    }
  });
  const current = iterationResult({
    iteration: 2,
    completionClassification: 'failed',
    verificationStatus: 'failed',
    stopReason: 'repeated_identical_failure',
    noProgressSignals: [],
    verification: {
      ...iterationResult().verification,
      validationFailureSignature: 'npm test::exit:1::deterministic failure'
    }
  });

  const remediation = buildTaskRemediation({
    currentResult: current,
    stopReason: 'repeated_identical_failure',
    previousIterations: [previous]
  });

  assert.ok(remediation);
  assert.equal(remediation.action, 'request_human_review');
  assert.equal(remediation.attemptCount, 2);
  assert.equal(remediation.humanReviewRecommended, true);
  assert.match(remediation.summary, /request a human review/i);
  assert.ok(remediation.evidence.includes('classification:failed'));
});

test('decideLoopContinuation continues after task completion when backlog remains', () => {
  const current = iterationResult({
    completionClassification: 'complete',
    followUpAction: 'continue_next_task',
    backlog: {
      remainingTaskCount: 2,
      actionableTaskAvailable: true
    }
  });
  const decision = decideLoopContinuation(stopDecisionInput({
    currentResult: current,
    selectedTaskCompleted: true,
    remainingTaskCount: 2,
    repeatedFailureThreshold: 2
  }));

  assert.equal(decision.shouldContinue, true);
  assert.equal(decision.stopReason, null);
});

test('decideLoopContinuation keeps iterating when source files changed and progress was reported', () => {
  const current = iterationResult({
    completionClassification: 'partial_progress',
    verificationStatus: 'passed',
    followUpAction: 'continue_same_task',
    summary: 'Updated src/feature.ts with in-progress changes.',
    diffSummary: {
      available: true,
      gitAvailable: true,
      summary: 'Updated src/feature.ts.',
      changedFileCount: 1,
      relevantChangedFileCount: 1,
      changedFiles: ['src/feature.ts'],
      relevantChangedFiles: ['src/feature.ts'],
      statusTransitions: []
    },
    noProgressSignals: []
  });

  const decision = decideLoopContinuation(stopDecisionInput({
    currentResult: current,
    previousIterations: [iterationResult({ iteration: 1, completionClassification: 'no_progress' })]
  }));

  assert.equal(decision.shouldContinue, true);
  assert.equal(decision.stopReason, null);
});

test('decideLoopContinuation stops when no actionable task remains even if blocked work is still recorded', () => {
  const current = iterationResult({
    selectedTaskId: null,
    selectedTaskTitle: null,
    completionClassification: 'blocked',
    followUpAction: 'request_human_review',
    backlog: {
      remainingTaskCount: 1,
      actionableTaskAvailable: false
    }
  });

  const decision = decideLoopContinuation(stopDecisionInput({
    currentResult: current,
    hasActionableTask: false,
    repeatedFailureThreshold: 2
  }));

  assert.equal(decision.shouldContinue, false);
  assert.equal(decision.stopReason, 'no_actionable_task');
  assert.match(decision.message, /No executable Ralph task remains/i);
});

test('decideLoopContinuation continues into backlog replenishment when enabled and no drift is present', () => {
  const current = iterationResult({
    backlog: {
      remainingTaskCount: 0,
      actionableTaskAvailable: false
    }
  });

  const decision = decideLoopContinuation(stopDecisionInput({
    currentResult: current,
    hasActionableTask: false,
    autoReplenishBacklog: true
  }));

  assert.equal(decision.shouldContinue, true);
  assert.equal(decision.stopReason, null);
  assert.match(decision.message, /continuing into backlog replenishment/i);
});

test('decideLoopContinuation does not auto-replenish when blocked work remains', () => {
  const current = iterationResult({
    selectedTaskId: null,
    selectedTaskTitle: null,
    backlog: {
      remainingTaskCount: 1,
      actionableTaskAvailable: false
    }
  });

  const decision = decideLoopContinuation(stopDecisionInput({
    currentResult: current,
    hasActionableTask: false,
    autoReplenishBacklog: true
  }));

  assert.equal(decision.shouldContinue, false);
  assert.equal(decision.stopReason, 'no_actionable_task');
});

test('decideLoopContinuation does not auto-replenish when the setting is disabled', () => {
  const current = iterationResult({
    selectedTaskId: null,
    selectedTaskTitle: null,
    stopReason: 'no_actionable_task',
    backlog: {
      remainingTaskCount: 1,
      actionableTaskAvailable: false
    }
  });

  const decision = decideLoopContinuation(stopDecisionInput({
    currentResult: current,
    hasActionableTask: false,
    autoReplenishBacklog: false
  }));

  assert.equal(decision.shouldContinue, false);
  assert.equal(decision.stopReason, 'no_actionable_task');
  assert.match(decision.message, /No executable Ralph task remains/i);
});

test('decideLoopContinuation does not auto-replenish when ledger drift is present', () => {
  const current = iterationResult({
    selectedTaskId: null,
    selectedTaskTitle: null,
    stopReason: 'no_actionable_task',
    backlog: {
      remainingTaskCount: 1,
      actionableTaskAvailable: false
    }
  });

  const decision = decideLoopContinuation(stopDecisionInput({
    currentResult: current,
    hasActionableTask: false,
    autoReplenishBacklog: true,
    preflightDiagnostics: [
      diagnostic({
        severity: 'error',
        code: 'ledger_drift',
        message: 'Ledger drift detected.'
      })
    ]
  }));

  assert.equal(decision.shouldContinue, false);
  assert.equal(decision.stopReason, 'no_actionable_task');
});

test('decideLoopContinuation stops on ledger drift even when auto-replenishment is enabled and no actionable task remains', () => {
  const current = iterationResult({
    selectedTaskId: null,
    selectedTaskTitle: null,
    stopReason: 'no_actionable_task',
    backlog: {
      remainingTaskCount: 0,
      actionableTaskAvailable: false
    }
  });

  const decision = decideLoopContinuation(stopDecisionInput({
    currentResult: current,
    hasActionableTask: false,
    autoReplenishBacklog: true,
    preflightDiagnostics: [
      diagnostic({
        category: 'taskGraph',
        severity: 'error',
        code: 'done_parent_unfinished_descendants',
        message: 'Done parent still has unfinished descendants.'
      })
    ]
  }));

  assert.equal(decision.shouldContinue, false);
  assert.equal(decision.stopReason, 'no_actionable_task');
  assert.match(decision.message, /No executable Ralph task remains/i);
});

test('decideLoopContinuation stops auto-replenishment on completed_parent_with_incomplete_descendants drift', () => {
  const current = iterationResult({
    selectedTaskId: null,
    selectedTaskTitle: null,
    backlog: { remainingTaskCount: 0, actionableTaskAvailable: false }
  });

  const decision = decideLoopContinuation(stopDecisionInput({
    currentResult: current,
    hasActionableTask: false,
    autoReplenishBacklog: true,
    preflightDiagnostics: [
      diagnostic({
        category: 'taskGraph',
        severity: 'error',
        code: 'completed_parent_with_incomplete_descendants',
        message: 'Task T1 is marked done but descendant tasks are still unfinished.'
      })
    ]
  }));

  assert.equal(decision.shouldContinue, false);
  assert.equal(decision.stopReason, 'no_actionable_task');
});

// -- Documentation mode tests --

test('classifyIterationOutcome does not demote partial_progress to no_progress for documentation-mode tasks', () => {
  const previous = iterationResult();
  const outcome = classifyIterationOutcome({
    selectedTaskId: 'T1',
    selectedTaskCompleted: false,
    selectedTaskBlocked: false,
    humanReviewNeeded: false,
    remainingSubtaskCount: 0,
    remainingTaskCount: 1,
    executionStatus: 'succeeded',
    verificationStatus: 'skipped',
    validationFailureSignature: null,
    relevantFileChanges: [],
    progressChanged: true,
    taskFileChanged: false,
    previousIterations: [previous],
    taskMode: 'documentation'
  });

  // progressChanged is true so baseClassification returns partial_progress.
  // Without documentation mode this would be demoted to no_progress due to
  // no_relevant_file_changes + same_task_selected_repeatedly, but documentation
  // mode prevents the demotion.
  assert.equal(outcome.classification, 'partial_progress');
  assert.equal(outcome.followUpAction, 'continue_same_task');
});

test('classifyIterationOutcome still reports no_progress for documentation-mode tasks with zero signals', () => {
  const previous = iterationResult();
  const outcome = classifyIterationOutcome({
    selectedTaskId: 'T1',
    selectedTaskCompleted: false,
    selectedTaskBlocked: false,
    humanReviewNeeded: false,
    remainingSubtaskCount: 0,
    remainingTaskCount: 1,
    executionStatus: 'succeeded',
    verificationStatus: 'skipped',
    validationFailureSignature: null,
    relevantFileChanges: [],
    progressChanged: false,
    taskFileChanged: false,
    previousIterations: [previous],
    taskMode: 'documentation'
  });

  // No progress signals at all — even documentation mode cannot manufacture progress.
  assert.equal(outcome.classification, 'no_progress');
  assert.equal(outcome.followUpAction, 'retry_same_task');
});

test('classifyIterationOutcome demotes partial_progress to no_progress for default-mode tasks (regression guard)', () => {
  const previous = iterationResult();
  const outcome = classifyIterationOutcome({
    selectedTaskId: 'T1',
    selectedTaskCompleted: false,
    selectedTaskBlocked: false,
    humanReviewNeeded: false,
    remainingSubtaskCount: 0,
    remainingTaskCount: 1,
    executionStatus: 'succeeded',
    // verificationStatus 'passed' triggers partial_progress in baseClassification
    verificationStatus: 'passed',
    validationFailureSignature: previous.verification.validationFailureSignature,
    relevantFileChanges: [],
    progressChanged: false,
    taskFileChanged: false,
    previousIterations: [previous],
    taskMode: 'default'
  });

  // verificationStatus 'passed' produces partial_progress, but the demotion
  // triggers because no_relevant_file_changes + task_and_progress_state_unchanged
  // + same_validation_failure_signature are all present.
  assert.equal(outcome.classification, 'no_progress');
  assert.equal(outcome.followUpAction, 'retry_same_task');
});

test('decideLoopContinuation stops on clean backlog exhaustion without drift diagnostics', () => {
  // All tasks done, no drift — loop must stop with no_actionable_task, not any
  // drift-related reason, so clean exhaustion is visually distinct (AC3).
  const current = iterationResult({
    selectedTaskId: null,
    selectedTaskTitle: null,
    backlog: { remainingTaskCount: 0, actionableTaskAvailable: false }
  });

  const decision = decideLoopContinuation(stopDecisionInput({
    currentResult: current,
    hasActionableTask: false,
    remainingTaskCount: 0,
    autoReplenishBacklog: false,
    preflightDiagnostics: []
  }));

  assert.equal(decision.shouldContinue, false);
  assert.equal(decision.stopReason, 'no_actionable_task');
  assert.match(decision.message, /No executable Ralph task remains/i);
});
