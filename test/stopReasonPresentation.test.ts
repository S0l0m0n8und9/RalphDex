import assert from 'node:assert/strict';
import test from 'node:test';
import { describeStopReason } from '../src/ralph/stopReasonPresentation';
import type { RalphStopReason } from '../src/ralph/types';

// Exhaustiveness here is enforced at compile time by the Record in the module;
// this array lets the test assert content quality for every known reason.
const ALL_STOP_REASONS: RalphStopReason[] = [
  'iteration_cap_reached',
  'task_marked_complete',
  'claim_contested',
  'policy_violation',
  'planning_gate_decomposed',
  'planning_gate_blocked',
  'planning_gate_human_review',
  'repeated_no_progress',
  'repeated_identical_failure',
  'human_review_needed',
  'execution_failed',
  'non_retryable_provider_error',
  'no_actionable_task',
  'cancelled',
  'verifier_suspect'
];

test('describeStopReason returns non-empty label, explanation, and nextAction for every reason', () => {
  for (const reason of ALL_STOP_REASONS) {
    const presentation = describeStopReason(reason);
    assert.ok(presentation.label.length > 0, `label for ${reason}`);
    assert.ok(presentation.explanation.length > 0, `explanation for ${reason}`);
    assert.ok(presentation.nextAction.length > 0, `nextAction for ${reason}`);
    // Label must be human-readable, not the raw enum.
    assert.notEqual(presentation.label, reason, `label for ${reason} should not be the raw enum`);
    assert.ok(!presentation.label.includes('_'), `label for ${reason} should not contain underscores`);
  }
});

test('describeStopReason maps specific reasons to expected operator labels', () => {
  assert.equal(describeStopReason('repeated_no_progress').label, 'No progress');
  assert.equal(describeStopReason('execution_failed').label, 'Execution failed');
  assert.equal(describeStopReason('no_actionable_task').label, 'No actionable task');
});

test('describeStopReason falls back gracefully for an unknown reason', () => {
  const presentation = describeStopReason('some_future_reason' as RalphStopReason);
  assert.equal(presentation.label, 'some_future_reason');
  assert.ok(presentation.nextAction.length > 0);
});
