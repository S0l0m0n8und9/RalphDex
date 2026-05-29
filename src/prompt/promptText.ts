import type { RalphAgentRole } from '../ralph/types';

/**
 * Small, pure text/formatting helpers shared between the prompt builder and the
 * role-aware context section builders (contextSections.ts). Kept in their own
 * module so both can import them without a cycle.
 */

/** Coarse role grouping used to pick which task-context section to render. */
export type RoleContextProfile = 'planner' | 'implementer' | 'reviewer' | 'scm';

export function formatOptional(value: string | null | undefined): string {
  return value && value.trim().length > 0 ? value.trim() : 'none';
}

export function compactList(values: string[], limit: number): string {
  if (values.length === 0) {
    return 'none';
  }

  const visible = values.slice(0, limit);
  const remaining = values.length - visible.length;
  return remaining > 0 ? `${visible.join(', ')} (+${remaining} more)` : visible.join(', ');
}

export function roleContextProfile(agentRole: RalphAgentRole): RoleContextProfile {
  switch (agentRole) {
    case 'planner':
      return 'planner';
    case 'review':
    case 'reviewer':
    case 'watchdog':
      return 'reviewer';
    case 'scm':
      return 'scm';
    default:
      return 'implementer';
  }
}
