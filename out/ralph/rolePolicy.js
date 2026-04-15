"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_ROLE_POLICY_MAP = void 0;
exports.getEffectivePolicy = getEffectivePolicy;
/**
 * Default role policy map covering all seven {@link RalphAgentRole} values.
 *
 * Planner and reviewer require a human gate and have restricted mutation rights.
 * Implementer has the broadest task-state mutation authority and requires the
 * validationCommand verifier gate to pass.  Build, scm, watchdog, and the
 * secondary 'review' role receive conservative defaults derived from their
 * nearest semantic equivalent.
 */
exports.DEFAULT_ROLE_POLICY_MAP = {
    planner: {
        role: 'planner',
        allowedNodeKinds: ['task_exec', 'replan'],
        allowedTaskStateMutations: [],
        requiredVerifierGates: [],
        humanGateRequired: true
    },
    implementer: {
        role: 'implementer',
        allowedNodeKinds: ['task_exec'],
        allowedTaskStateMutations: ['todo→in_progress', 'in_progress→done', 'in_progress→blocked'],
        requiredVerifierGates: ['validationCommand'],
        humanGateRequired: false
    },
    reviewer: {
        role: 'reviewer',
        allowedNodeKinds: ['review'],
        allowedTaskStateMutations: ['changes_required'],
        requiredVerifierGates: [],
        humanGateRequired: true
    },
    build: {
        role: 'build',
        allowedNodeKinds: ['task_exec', 'verify_gate'],
        allowedTaskStateMutations: ['in_progress→done', 'in_progress→blocked'],
        requiredVerifierGates: ['validationCommand'],
        humanGateRequired: false
    },
    review: {
        role: 'review',
        allowedNodeKinds: ['review'],
        allowedTaskStateMutations: ['changes_required'],
        requiredVerifierGates: [],
        humanGateRequired: true
    },
    watchdog: {
        role: 'watchdog',
        allowedNodeKinds: ['verify_gate'],
        allowedTaskStateMutations: [],
        requiredVerifierGates: [],
        humanGateRequired: false
    },
    scm: {
        role: 'scm',
        allowedNodeKinds: ['scm_submit'],
        allowedTaskStateMutations: [],
        requiredVerifierGates: [],
        humanGateRequired: false
    }
};
/**
 * Returns the policy for `role` from `map` (defaulting to
 * {@link DEFAULT_ROLE_POLICY_MAP}).  When the role is not present in the map
 * the implementer entry is returned as a safe fallback.
 */
function getEffectivePolicy(role, map = exports.DEFAULT_ROLE_POLICY_MAP) {
    if (role in map) {
        return map[role];
    }
    return map['implementer'];
}
//# sourceMappingURL=rolePolicy.js.map