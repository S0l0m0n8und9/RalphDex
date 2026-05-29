import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_CONFIG } from '../src/config/defaults';
import { getEffectivePolicy } from '../src/ralph/rolePolicy';
import {
  assertNever,
  composeMutationPlan,
  runGatePipeline
} from '../src/ralph/reconciliationGates';
import type { ReconciliationState } from '../src/ralph/reconciliationGates';
import type { RalphCodexConfig } from '../src/config/types';
import type { PreparedIterationContext } from '../src/ralph/iterationPreparation';
import type {
  RalphCompletionClassification,
  RalphCompletionReport,
  RalphHandoff,
  RalphIterationResult,
  RalphTask
} from '../src/ralph/types';

// ---------------------------------------------------------------------------
// State builder
//
// The gates are pure functions over ReconciliationState and read only a small
// slice of PreparedIterationContext (config + validationCommand). We construct
// a minimal, valid state and let each test override exactly the fields under
// test. getEffectivePolicy gives a real RolePolicy so policy assertions match
// shipped behaviour.
// ---------------------------------------------------------------------------

interface StateOverrides {
  task?: Partial<RalphTask>;
  report?: Partial<RalphCompletionReport>;
  configOverrides?: Partial<RalphCodexConfig>;
  validationCommand?: string;
  verificationStatus?: RalphIterationResult['verificationStatus'];
  validationCommandStatus?: RalphIterationResult['verificationStatus'];
  preliminaryClassification?: RalphCompletionClassification;
  acceptedHandoffs?: readonly RalphHandoff[];
  suggestedValidationFromPlan?: string | null;
  role?: string;
}

function makeState(overrides: StateOverrides = {}): ReconciliationState {
  const role = overrides.role ?? 'implementer';
  const config: RalphCodexConfig = {
    ...DEFAULT_CONFIG,
    agentRole: role as RalphCodexConfig['agentRole'],
    ...overrides.configOverrides
  };
  const prepared = {
    config,
    validationCommand: overrides.validationCommand
  } as unknown as PreparedIterationContext;

  const selectedTask: RalphTask = {
    id: 'T1',
    title: 'Example task',
    status: 'in_progress',
    ...overrides.task
  };

  const report: RalphCompletionReport = {
    selectedTaskId: 'T1',
    requestedStatus: 'done',
    ...overrides.report
  };

  return {
    prepared,
    selectedTask,
    report,
    verificationStatus: overrides.verificationStatus ?? 'passed',
    validationCommandStatus: overrides.validationCommandStatus ?? 'passed',
    preliminaryClassification: overrides.preliminaryClassification ?? 'complete',
    acceptedHandoffs: overrides.acceptedHandoffs ?? [],
    suggestedValidationFromPlan: overrides.suggestedValidationFromPlan ?? null,
    policy: getEffectivePolicy(role)
  };
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

test('runGatePipeline proceeds for an implementer completing a verified task', () => {
  const result = runGatePipeline(makeState());

  assert.equal(result.kind, 'proceed');
  if (result.kind === 'proceed') {
    assert.equal(result.needsHumanReview, false);
  }
});

// ---------------------------------------------------------------------------
// Rejection reasons — one test per RejectionReason member
// ---------------------------------------------------------------------------

test('runGatePipeline rejects with task_id_mismatch when the report targets another task', () => {
  const result = runGatePipeline(makeState({ report: { selectedTaskId: 'T999' } }));

  assert.equal(result.kind, 'rejected');
  if (result.kind === 'rejected') {
    assert.equal(result.reason, 'task_id_mismatch');
  }
});

test('runGatePipeline rejects with policy_violation for a disallowed role mutation', () => {
  // A reviewer may only emit 'changes_required', never in_progress→done.
  const result = runGatePipeline(makeState({ role: 'reviewer', report: { requestedStatus: 'done' } }));

  assert.equal(result.kind, 'rejected');
  if (result.kind === 'rejected') {
    assert.equal(result.reason, 'policy_violation');
    assert.equal(result.needsHumanReview, true);
  }
});

test('runGatePipeline rejects with verification_failed when done is requested but verification did not pass', () => {
  const result = runGatePipeline(
    makeState({
      report: { requestedStatus: 'done' },
      verificationStatus: 'failed',
      validationCommandStatus: 'failed'
    })
  );

  assert.equal(result.kind, 'rejected');
  if (result.kind === 'rejected') {
    assert.equal(result.reason, 'verification_failed');
  }
});

test('runGatePipeline rejects with needs_human_review_with_done when a done report also flags human review', () => {
  const result = runGatePipeline(
    makeState({ report: { requestedStatus: 'done', needsHumanReview: true } })
  );

  assert.equal(result.kind, 'rejected');
  if (result.kind === 'rejected') {
    assert.equal(result.reason, 'needs_human_review_with_done');
  }
});

test('runGatePipeline rejects with blocked_overrides_complete when blocked is requested for an already-complete outcome', () => {
  const result = runGatePipeline(
    makeState({
      report: { requestedStatus: 'blocked' },
      preliminaryClassification: 'complete'
    })
  );

  assert.equal(result.kind, 'rejected');
  if (result.kind === 'rejected') {
    assert.equal(result.reason, 'blocked_overrides_complete');
  }
});

// ---------------------------------------------------------------------------
// Gate ordering and non-blocking warnings
// ---------------------------------------------------------------------------

test('runGatePipeline applies gates in order: task-id mismatch wins over a policy violation', () => {
  // Both a task-id mismatch and a disallowed reviewer mutation are present;
  // taskIdMatchGate runs first in GATE_SEQUENCE, so its reason must win.
  const result = runGatePipeline(
    makeState({ role: 'reviewer', report: { selectedTaskId: 'T999', requestedStatus: 'done' } })
  );

  assert.equal(result.kind, 'rejected');
  if (result.kind === 'rejected') {
    assert.equal(result.reason, 'task_id_mismatch');
  }
});

test('runGatePipeline proceeds with a non-blocking warning when done is reported without validationRan', () => {
  const result = runGatePipeline(
    makeState({ validationCommand: 'npm test', report: { requestedStatus: 'done' } })
  );

  assert.equal(result.kind, 'proceed');
  if (result.kind === 'proceed') {
    assert.equal(
      result.warnings.some((w) => w.includes('without reporting validationRan')),
      true
    );
  }
});

test('runGatePipeline surfaces a handoff-scope warning without rejecting a matched-task report', () => {
  const handoff = { taskId: 'T-other' } as unknown as RalphHandoff;
  const result = runGatePipeline(
    makeState({
      report: { requestedStatus: 'in_progress' },
      acceptedHandoffs: [handoff]
    })
  );

  assert.equal(result.kind, 'proceed');
  if (result.kind === 'proceed') {
    assert.equal(
      result.warnings.some((w) => w.toLowerCase().includes('handoff scope')),
      true
    );
  }
});

// ---------------------------------------------------------------------------
// composeMutationPlan
// ---------------------------------------------------------------------------

test('composeMutationPlan maps a done report to a completion mutation', () => {
  const state = makeState({ report: { requestedStatus: 'done', progressNote: 'finished' } });
  const pipeline = runGatePipeline(state);
  assert.equal(pipeline.kind, 'proceed');
  if (pipeline.kind !== 'proceed') {
    return;
  }

  const plan = composeMutationPlan(state, pipeline.outputs, pipeline.warnings);

  assert.equal(plan.nextStatus, 'done');
  assert.equal(plan.progressNote, 'finished');
  assert.equal(plan.attemptAncestorCompletion, true);
  assert.equal(plan.lastVerifierResult, 'passed');
});

test('composeMutationPlan writes a planner-suggested validation command when the task has none', () => {
  const state = makeState({
    task: { validation: undefined },
    suggestedValidationFromPlan: 'npm run validate'
  });
  const pipeline = runGatePipeline(state);
  assert.equal(pipeline.kind, 'proceed');
  if (pipeline.kind !== 'proceed') {
    return;
  }

  const plan = composeMutationPlan(state, pipeline.outputs, pipeline.warnings);

  assert.equal(plan.validationToWrite, 'npm run validate');
});

test('composeMutationPlan does not overwrite an existing task validation command', () => {
  const state = makeState({
    task: { validation: 'npm test' },
    suggestedValidationFromPlan: 'npm run validate'
  });
  const pipeline = runGatePipeline(state);
  assert.equal(pipeline.kind, 'proceed');
  if (pipeline.kind !== 'proceed') {
    return;
  }

  const plan = composeMutationPlan(state, pipeline.outputs, pipeline.warnings);

  assert.equal(plan.validationToWrite, null);
});

test('composeMutationPlan flags needsHumanReview when an accepted handoff scope is violated', () => {
  const handoff = { taskId: 'T-other' } as unknown as RalphHandoff;
  const state = makeState({
    report: { requestedStatus: 'in_progress' },
    acceptedHandoffs: [handoff]
  });
  const pipeline = runGatePipeline(state);
  assert.equal(pipeline.kind, 'proceed');
  if (pipeline.kind !== 'proceed') {
    return;
  }

  const plan = composeMutationPlan(state, pipeline.outputs, pipeline.warnings);

  assert.equal(plan.needsHumanReview, true);
});

// ---------------------------------------------------------------------------
// Exhaustiveness guard
// ---------------------------------------------------------------------------

test('assertNever throws when reached with an unexpected discriminant', () => {
  assert.throws(
    () => assertNever('unexpected' as never),
    /Unhandled discriminant/
  );
});
