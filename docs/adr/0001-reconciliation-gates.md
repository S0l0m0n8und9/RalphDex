# Reconciliation Gate Pipeline

## Context

`src/ralph/reconciliation.ts` had grown to ~660 lines that interleaved completion-report parsing, role-policy enforcement, handoff-scope checks, verification gating, task-file mutation under lock, watchdog action processing, fan-in revert, and post-write drift detection. Each branch could emit a `rejectionReason` as an ad-hoc string literal; advisory warnings and hard rejections were emitted from the same conditional branches with no shared shape; and the test surface forced fixtures that exercised the whole procedure even when only one rule was under test.

## Decision

Reconciliation is now a four-stage pipeline:

1. **Prelude** — I/O-allowed loader that parses the report, scans accepted handoffs, reads `task-plan.json`, resolves role policy, then freezes a `ReconciliationState`.
2. **Gates** — a sequence of pure functions `(state) => GateOutcome`, where `GateOutcome = pass | warn(warnings[]) | reject(reason, warnings[])`. Rejection reasons are an enumerated `RejectionReason` type at the top of the file. The first reject short-circuits; warnings accumulate.
3. **Composer** — a pure `composeMutationPlan(state, gateOutputs) => TaskMutationPlan` that takes the typed outputs gates produce (not just state) and emits the full plan: status/notes/blocker/validation/lastVerifierResult/lastReconciliationWarning plus optional ancestor auto-completion.
4. **Persistence + post-write phases** — one critical section under `withTaskFileLock` performs claim re-verification, applies the plan, and appends to `progress.md`. The claim re-check stays *inside* the lock (preserving the TOCTOU fix) and can return a `claim_contested` rejection. Watchdog action processing, fan-in revert, and drift detection follow as sequential post-write stages that can append warnings or further mutate.

Code layout: orchestrator and types stay in `src/ralph/reconciliation.ts`; gates and composer move to `src/ralph/reconciliationGates.ts`. Migration is strangler-style — enum first, then gates one at a time, then composer, then persistence — so every step ships green.

## Why pure gates instead of named methods on a class

Named-method extraction would have cleaned up the file but kept I/O, state mutation, and rejection decisions interleaved in every branch. Pure gates over a frozen state make the rejection catalog enumerable (one `RejectionReason` enum, one gate per reason), make each gate independently testable without orchestrating I/O, and put the claim-lock critical section at one named seam instead of buried in the middle of a long procedure. The cost is a stricter prelude/composer/persistence split, which is the point.

## Why the composer reads gate outputs, not just state

Several gates compute derived facts the composer needs (e.g. documentation-mode flag, task-state-only-gate, suggested-validation-superset detection). Recomputing these in the composer would duplicate logic and risk drift. Passing typed gate outputs forward keeps the information flow one-way and makes the composer's inputs explicit.

## Concrete interface

The seam lives in `src/ralph/reconciliationGates.ts`. Selected after a parallel three-way design pass that compared minimised, maximally-pluggable, and type-safety-first variants. The chosen shape welds gate id to gate-output type so the composer reads outputs with full inference; it keeps a fixed driver because there is exactly one caller and one sequence.

```ts
// Closed union. Adding a member forces every switch (via assertNever) to update.
export type RejectionReason =
  | 'task_id_mismatch'
  | 'policy_violation'
  | 'verification_failed'
  | 'needs_human_review_with_done'
  | 'blocked_overrides_complete'
  | 'claim_contested';

export function assertNever(x: never): never;

// Frozen state, built once by the prelude in reconciliation.ts. Gates do no I/O.
export interface ReconciliationState {
  readonly prepared: PreparedIterationContext;
  readonly selectedTask: RalphTask;
  readonly report: RalphCompletionReport;            // non-null; missing/invalid short-circuit before gates
  readonly verificationStatus: RalphIterationResult['verificationStatus'];
  readonly validationCommandStatus: RalphIterationResult['verificationStatus'];
  readonly preliminaryClassification: RalphCompletionClassification;
  readonly acceptedHandoffs: readonly RalphHandoff[];
  readonly suggestedValidationFromPlan: string | null;
  readonly policy: RolePolicy;
}

// Three-state outcome with typed per-gate payload.
export type GateOutcome<Out> =
  | { readonly kind: 'pass';   readonly output: Out; readonly warnings?: readonly string[] }
  | { readonly kind: 'warn';   readonly output: Out; readonly warnings: readonly string[] }
  | { readonly kind: 'reject'; readonly reason: RejectionReason; readonly warnings: readonly string[];
      readonly needsHumanReview?: boolean };

// Typed registry: gate id -> gate-output type. The load-bearing trick.
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

// `Id extends keyof GateOutputs` welds the gate's id to its payload type.
export interface Gate<Id extends keyof GateOutputs> {
  readonly id: Id;
  readonly appliesTo: (state: ReconciliationState) => boolean;
  readonly run: (state: ReconciliationState) => GateOutcome<GateOutputs[Id]>;
}

export type PipelineResult =
  | { readonly kind: 'rejected'; readonly reason: RejectionReason;
      readonly warnings: readonly string[]; readonly needsHumanReview: boolean }
  | { readonly kind: 'proceed'; readonly outputs: AccumulatedOutputs;
      readonly warnings: readonly string[]; readonly needsHumanReview: boolean };

export function runGatePipeline(state: ReconciliationState): PipelineResult;

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
): TaskMutationPlan;
```

The fixed sequence lives in the same file as `as const`:

```ts
const GATE_SEQUENCE = [
  taskIdMatchGate, policyGate, handoffScopeGate,
  verificationGate, blockedOverrideGate, planValidationGate, heartbeatGate
] as const;
```

`reconciliation.ts` after refactor:

```ts
const prelude = await buildReconciliationPrelude(input);          // I/O
if (prelude.kind === 'shortcircuit') return prelude.outcome;
const result = runGatePipeline(prelude.state);                    // pure
if (result.kind === 'rejected') return buildRejectedOutcome(...);
const plan = composeMutationPlan(prelude.state, result.outputs, result.warnings);  // pure
const verify = await applyMutationUnderLock(input, prelude.state, plan);           // I/O, lock
if (verify.claimContested) return buildRejectedOutcome(/* claim_contested */);
const post = await runPostWriteStages(input, prelude.state, plan, verify);         // I/O, sequential
return buildAppliedOutcome(...);
```

### Rejected design alternatives

- **Single-entry-point facade** (one `evaluateReconciliation(input)` call returning `ReconciliationDecision`). Highest caller leverage, but hides the gate seam and forces tests to construct full inputs. Caller readability is recovered cheaply by extracting `buildReconciliationPrelude`; we keep the gate/composer split observable.
- **Plug-in registry** (gates as registered objects in per-file modules, pluggable composer, registered post-write phases, branded-string `RejectionReason` via `defineRejectionReason()`). Speculative flexibility for a problem with one caller and one sequence. Branded-open `RejectionReason` loses exhaustive switching — the highest-leverage correctness win of the refactor. Same shallow-split failure mode the `src/ralph/iteration/` services exhibit.

### Trade-offs accepted

- The driver does one `(outputs as any)[gate.id] = o.output` write because TS cannot preserve per-element id↔output binding while iterating a heterogeneous tuple. Local, justified, surrounded by a fully-typed external API.
- Conditional gates make `AccumulatedOutputs` `Partial`; composer reads use `outputs.verification?.docMode`. Accurate — a `done`-only output really is absent for `blocked`.
- No `tsd`-style compile-time dead-output check. The interesting direction (composer reads a key that doesn't exist) is already caught by the compiler; the other direction (output exists but nothing reads it) is dead weight, not a correctness bug.

## Boundary note

This is a control-plane refactor of a file central to task-state correctness. Per `docs/boundaries.md` § Self-Dogfooding Boundary, the implementation should be done with direct Codex; Ralph loops may validate follow-on work afterwards.
