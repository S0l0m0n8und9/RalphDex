import type { PreparedIterationContext } from './iterationPreparation';
import type {
  RalphCompletionClassification,
  RalphCompletionReport,
  RalphHandoff,
  RalphIterationResult,
  RalphTask,
  RolePolicy
} from './types';

// ---------------------------------------------------------------------------
// Rejection catalog
// ---------------------------------------------------------------------------

// Closed union. Adding a member forces every switch (via assertNever) to update.
export type RejectionReason =
  | 'task_id_mismatch'
  | 'policy_violation'
  | 'verification_failed'
  | 'needs_human_review_with_done'
  | 'blocked_overrides_complete'
  | 'claim_contested';

export function assertNever(x: never): never {
  throw new Error(`Unhandled discriminant: ${JSON.stringify(x)}`);
}

// ---------------------------------------------------------------------------
// Frozen reconciliation state
// ---------------------------------------------------------------------------

// Built once by the prelude in reconciliation.ts. Gates do no I/O.
export interface ReconciliationState {
  readonly prepared: PreparedIterationContext;
  readonly selectedTask: RalphTask;
  readonly report: RalphCompletionReport; // non-null; missing/invalid short-circuit before gates
  readonly verificationStatus: RalphIterationResult['verificationStatus'];
  readonly validationCommandStatus: RalphIterationResult['verificationStatus'];
  readonly preliminaryClassification: RalphCompletionClassification;
  readonly acceptedHandoffs: readonly RalphHandoff[];
  readonly suggestedValidationFromPlan: string | null;
  readonly policy: RolePolicy;
}

// ---------------------------------------------------------------------------
// Gate outcome and typed registry
// ---------------------------------------------------------------------------

export type GateOutcome<Out> =
  | { readonly kind: 'pass'; readonly output: Out; readonly warnings?: readonly string[] }
  | { readonly kind: 'warn'; readonly output: Out; readonly warnings: readonly string[] }
  | {
      readonly kind: 'reject';
      readonly reason: RejectionReason;
      readonly warnings: readonly string[];
      readonly needsHumanReview?: boolean;
    };

// Typed registry: gate id -> gate-output type. Welding ids to payload types
// lets the composer read accumulated outputs with full inference.
export interface GateOutputs {
  readonly taskIdMatch: void;
  readonly policy: void;
  readonly handoffScope: { readonly violation: boolean };
  readonly verification: { readonly docMode: boolean; readonly taskStateOnlyGate: boolean };
  readonly blockedOverride: void;
  readonly planValidation: { readonly suggestedValidationFromPlan: string | null };
  readonly heartbeat: void;
}

export type AccumulatedOutputs = { readonly [K in keyof GateOutputs]?: GateOutputs[K] };

export interface Gate<Id extends keyof GateOutputs> {
  readonly id: Id;
  readonly appliesTo: (state: ReconciliationState) => boolean;
  readonly run: (state: ReconciliationState) => GateOutcome<GateOutputs[Id]>;
}

// ---------------------------------------------------------------------------
// Pipeline driver
// ---------------------------------------------------------------------------

export type PipelineResult =
  | {
      readonly kind: 'rejected';
      readonly reason: RejectionReason;
      readonly warnings: readonly string[];
      readonly needsHumanReview: boolean;
    }
  | {
      readonly kind: 'proceed';
      readonly outputs: AccumulatedOutputs;
      readonly warnings: readonly string[];
      readonly needsHumanReview: boolean;
    };

// Fixed sequence — there is exactly one caller and one ordering.
// Gates are appended as they migrate over from reconciliation.ts.
const GATE_SEQUENCE: readonly Gate<keyof GateOutputs>[] = [] as const;

export function runGatePipeline(state: ReconciliationState): PipelineResult {
  const outputs: { [K in keyof GateOutputs]?: GateOutputs[K] } = {};
  const accumulatedWarnings: string[] = [];

  for (const gate of GATE_SEQUENCE) {
    if (!gate.appliesTo(state)) {
      continue;
    }
    const outcome = gate.run(state);
    if (outcome.kind === 'reject') {
      return {
        kind: 'rejected',
        reason: outcome.reason,
        warnings: [...accumulatedWarnings, ...outcome.warnings],
        needsHumanReview: outcome.needsHumanReview ?? false
      };
    }
    // The driver does one structural write because TS cannot preserve the
    // per-element id↔output binding while iterating a heterogeneous tuple.
    // Local, justified, surrounded by a fully-typed external API.
    (outputs as Record<string, unknown>)[gate.id] = outcome.output;
    if (outcome.kind === 'warn') {
      accumulatedWarnings.push(...outcome.warnings);
    } else if (outcome.warnings && outcome.warnings.length > 0) {
      accumulatedWarnings.push(...outcome.warnings);
    }
  }

  return {
    kind: 'proceed',
    outputs,
    warnings: accumulatedWarnings,
    needsHumanReview: false
  };
}

// ---------------------------------------------------------------------------
// Mutation plan + composer
// ---------------------------------------------------------------------------

export interface TaskMutationPlan {
  readonly nextStatus: RalphCompletionReport['requestedStatus'];
  readonly progressNote: string | null;
  readonly blocker: string | null;
  readonly validationToWrite: string | null;
  readonly lastVerifierResult: RalphTask['lastVerifierResult'];
  readonly lastReconciliationWarning: string | null;
  readonly attemptAncestorCompletion: boolean;
  readonly needsHumanReview: boolean;
}

export function composeMutationPlan(
  state: ReconciliationState,
  outputs: AccumulatedOutputs,
  warnings: readonly string[]
): TaskMutationPlan {
  // Stub — populated in step 10 once all gates are in place.
  void outputs;
  const report = state.report;
  const requestedStatus = report.requestedStatus;
  const validationToWrite =
    !state.selectedTask.validation && state.suggestedValidationFromPlan
      ? state.suggestedValidationFromPlan
      : null;
  const lastVerifierResult: RalphTask['lastVerifierResult'] =
    state.verificationStatus === 'passed'
      ? 'passed'
      : state.verificationStatus === 'skipped'
        ? 'skipped'
        : state.verificationStatus
          ? 'failed'
          : undefined;
  const conflictWarning = warnings.find((w) => w.toLowerCase().includes('conflict')) ?? null;
  return {
    nextStatus: requestedStatus,
    progressNote: report.progressNote ?? null,
    blocker:
      requestedStatus === 'blocked'
        ? report.blocker ?? null
        : report.blocker ?? null,
    validationToWrite,
    lastVerifierResult,
    lastReconciliationWarning: conflictWarning,
    attemptAncestorCompletion: requestedStatus === 'done',
    needsHumanReview: false
  };
}
