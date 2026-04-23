import type { RalphTaskTier } from './types';

export interface AgentHandoffSummary {
  iteration: number;
  selectedTaskId: string | null;
  selectedTaskTitle: string | null;
  stopReason: string | null;
  completionClassification: string | null;
  progressNote: string | null;
}

export interface AgentStatusSummary {
  agentId: string;
  firstSeenAt: string;
  completedTaskCount: number;
  activeClaimTaskId: string | null;
  /** All handoff notes for this agent, sorted ascending by iteration. */
  handoffHistory: AgentHandoffSummary[];
  /** Latest handoff note (last entry of handoffHistory), or null if empty. */
  latestHandoff: AgentHandoffSummary | null;
  /**
   * Number of consecutive trailing iterations where the same task was recorded
   * as no_progress.  A score >= STUCK_SCORE_THRESHOLD is surfaced as a warning.
   */
  stuckScore: number;
  /**
   * Explicit static tier set on the active claim task, or null when the task
   * has no explicit tier or there is no active claim.
   */
  activeClaimTaskTier: RalphTaskTier | null;
  /**
   * 'explicit' when activeClaimTaskTier comes from the task's tier field;
   * 'dynamic' when no explicit tier is set (heuristic scoring will apply at runtime);
   * null when there is no active claim.
   */
  activeClaimTaskTierSource: 'explicit' | 'dynamic' | null;
}

/** Agents at or above this consecutive-no-progress count are flagged as stuck. */
export const STUCK_SCORE_THRESHOLD = 3;

/** Maximum number of iterations shown in a single heatmap strip. */
export const HEATMAP_WINDOW = 10;

/**
 * Compute the stuck score for an agent from its full handoff history.
 *
 * The score is the count of trailing handoff entries (sorted ascending by
 * iteration) that share the same selectedTaskId and have
 * completionClassification === 'no_progress'.  Any break in task id or
 * classification resets the streak.
 */
export function computeStuckScore(handoffs: AgentHandoffSummary[]): number {
  if (handoffs.length === 0) {
    return 0;
  }

  const sorted = [...handoffs].sort((a, b) => a.iteration - b.iteration);
  const last = sorted[sorted.length - 1];

  if (last.completionClassification !== 'no_progress' || !last.selectedTaskId) {
    return 0;
  }

  let score = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const entry = sorted[i];
    if (
      entry.completionClassification === 'no_progress'
      && entry.selectedTaskId === last.selectedTaskId
    ) {
      score += 1;
    } else {
      break;
    }
  }

  return score;
}

/**
 * Render a compact no-progress heatmap strip for a single agent's handoff history.
 *
 * Each cell represents one iteration (up to maxLen most-recent ones) rendered
 * in ascending chronological order.  'X' = no_progress; '.' = any other
 * classification.  Returns an empty string when there are no handoffs.
 */
export function buildNoProgressHeatmap(
  handoffs: AgentHandoffSummary[],
  maxLen: number = HEATMAP_WINDOW
): string {
  if (handoffs.length === 0) {
    return '';
  }

  const sorted = [...handoffs].sort((a, b) => a.iteration - b.iteration);
  const window = sorted.slice(-maxLen);
  const cells = window.map((h) => (h.completionClassification === 'no_progress' ? 'X' : '.'));
  return `[${cells.join('')}]`;
}

