"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertNever = assertNever;
exports.runGatePipeline = runGatePipeline;
exports.composeMutationPlan = composeMutationPlan;
function assertNever(x) {
    throw new Error(`Unhandled discriminant: ${JSON.stringify(x)}`);
}
// Fixed sequence — there is exactly one caller and one ordering.
// Gates are appended as they migrate over from reconciliation.ts.
const GATE_SEQUENCE = [];
function runGatePipeline(state) {
    const outputs = {};
    const accumulatedWarnings = [];
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
        outputs[gate.id] = outcome.output;
        if (outcome.kind === 'warn') {
            accumulatedWarnings.push(...outcome.warnings);
        }
        else if (outcome.warnings && outcome.warnings.length > 0) {
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
function composeMutationPlan(state, outputs, warnings) {
    // Stub — populated in step 10 once all gates are in place.
    void outputs;
    const report = state.report;
    const requestedStatus = report.requestedStatus;
    const validationToWrite = !state.selectedTask.validation && state.suggestedValidationFromPlan
        ? state.suggestedValidationFromPlan
        : null;
    const lastVerifierResult = state.verificationStatus === 'passed'
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
        blocker: requestedStatus === 'blocked'
            ? report.blocker ?? null
            : report.blocker ?? null,
        validationToWrite,
        lastVerifierResult,
        lastReconciliationWarning: conflictWarning,
        attemptAncestorCompletion: requestedStatus === 'done',
        needsHumanReview: false
    };
}
//# sourceMappingURL=reconciliationGates.js.map