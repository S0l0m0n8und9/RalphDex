"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertNever = assertNever;
exports.runGatePipeline = runGatePipeline;
exports.composeMutationPlan = composeMutationPlan;
function assertNever(x) {
    throw new Error(`Unhandled discriminant: ${JSON.stringify(x)}`);
}
// ---------------------------------------------------------------------------
// Gate implementations
// ---------------------------------------------------------------------------
const taskIdMatchGate = {
    id: 'taskIdMatch',
    appliesTo: () => true,
    run: (state) => {
        if (state.report.selectedTaskId === state.selectedTask.id) {
            return { kind: 'pass', output: undefined };
        }
        return {
            kind: 'reject',
            reason: 'task_id_mismatch',
            warnings: [
                `Completion report selectedTaskId ${state.report.selectedTaskId} did not match the selected task ${state.selectedTask.id}.`
            ]
        };
    }
};
const policyGate = {
    id: 'policy',
    appliesTo: () => true,
    run: (state) => {
        const { policy, report, selectedTask, prepared } = state;
        const reqStatus = report.requestedStatus;
        // Claim acquisition promotes todo→in_progress as a side effect and returns
        // the original task object (status still 'todo').  Use in_progress as the
        // effective from-status so mutation comparisons are correct.
        const effectiveFromStatus = selectedTask.status === 'todo' ? 'in_progress' : selectedTask.status;
        // requestedStatus === 'in_progress' is a heartbeat (no-op self-assignment).
        // The structural todo→in_progress transition is handled by claim acquisition,
        // so any role may emit a progress-only report without being policy-gated.
        const isHeartbeat = reqStatus === 'in_progress';
        const mutation = `${effectiveFromStatus}→${reqStatus}`;
        const mutationAllowed = isHeartbeat || policy.allowedTaskStateMutations.includes(mutation);
        const childTasksProposed = (report.suggestedChildTasks?.length ?? 0) > 0;
        const sourceEditAllowed = policy.allowedNodeKinds.includes('task_exec');
        if (mutationAllowed && !(childTasksProposed && !sourceEditAllowed)) {
            return { kind: 'pass', output: undefined };
        }
        const role = prepared.config.agentRole ?? 'implementer';
        const disallowedAction = !mutationAllowed
            ? `task-state mutation ${mutation}`
            : `suggestedChildTasks (source-edit proposal) by role '${role}'`;
        return {
            kind: 'reject',
            reason: 'policy_violation',
            warnings: [
                `Policy violation (source: preset): disallowed ${disallowedAction} for role '${role}'.`
            ],
            needsHumanReview: true
        };
    }
};
const handoffScopeGate = {
    id: 'handoffScope',
    appliesTo: () => true,
    run: (state) => {
        const violation = state.acceptedHandoffs.some((h) => h.taskId !== state.report.selectedTaskId);
        if (!violation) {
            return { kind: 'pass', output: { violation: false } };
        }
        return {
            kind: 'warn',
            output: { violation: true },
            warnings: [
                'Completion report task does not match accepted handoff scope; downgrading to review required'
            ]
        };
    }
};
// Fixed sequence — there is exactly one caller and one ordering.
// Gates are appended as they migrate over from reconciliation.ts.
const GATE_SEQUENCE = [
    taskIdMatchGate,
    policyGate,
    handoffScopeGate
];
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