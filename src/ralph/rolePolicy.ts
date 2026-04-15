import type { RalphAgentRole, RolePolicy, RolePolicyMap } from './types';

/**
 * Default role policy map covering all seven {@link RalphAgentRole} values.
 *
 * Planner and reviewer require a human gate and have restricted mutation rights.
 * Implementer has the broadest task-state mutation authority and requires the
 * validationCommand verifier gate to pass.  Build, scm, watchdog, and the
 * secondary 'review' role receive conservative defaults derived from their
 * nearest semantic equivalent.
 */
export const DEFAULT_ROLE_POLICY_MAP: RolePolicyMap = {
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
} as const satisfies RolePolicyMap;

/**
 * Returns the policy for `role` from `map` (defaulting to
 * {@link DEFAULT_ROLE_POLICY_MAP}).  When the role is not present in the map
 * the implementer entry is returned as a safe fallback.
 */
export function getEffectivePolicy(role: string, map: RolePolicyMap = DEFAULT_ROLE_POLICY_MAP): RolePolicy {
  if (role in map) {
    return map[role as RalphAgentRole];
  }
  return map['implementer'];
}
