/**
 * Typed dashboard snapshot for the webview dashboard.
 *
 * `buildDashboardSnapshot` projects from a durable `RalphStatusSnapshot`
 * (plus optional multi-agent summaries) into a `DashboardSnapshot` covering
 * six sections: pipeline strip, task board, agent grid, failure feed,
 * dead-letter, and quick-action inputs.
 *
 * All sections use null or empty states when source data is unavailable,
 * so callers can always render a valid (possibly empty) dashboard.
 */

import type { PipelineRunArtifact, PipelineRunStatus, PipelinePhase } from '../ralph/pipeline';
import type { RalphStatusSnapshot } from '../ralph/statusReport';
import {
  buildNoProgressHeatmap,
  STUCK_SCORE_THRESHOLD,
  type AgentStatusSummary,
} from '../ralph/multiAgentStatus';
import type { DeadLetterEntry } from '../ralph/deadLetter';
import type { FailureCategoryId, RalphTaskCounts } from '../ralph/types';

// ---------------------------------------------------------------------------
// Pipeline strip
// ---------------------------------------------------------------------------

export interface PipelineStrip {
  runId: string;
  status: PipelineRunStatus;
  phase: PipelinePhase | null;
  rootTaskId: string;
  decomposedTaskCount: number;
  loopStartTime: string;
  loopEndTime: string | null;
  prUrl: string | null;
}

// ---------------------------------------------------------------------------
// Task board
// ---------------------------------------------------------------------------

export interface TaskBoardSection {
  counts: RalphTaskCounts | null;
  selectedTaskId: string | null;
  selectedTaskTitle: string | null;
  nextIteration: number;
}

// ---------------------------------------------------------------------------
// Agent grid
// ---------------------------------------------------------------------------

export interface AgentGridRow {
  agentId: string;
  firstSeenAt: string;
  completedTaskCount: number;
  activeClaimTaskId: string | null;
  stuckScore: number;
  isStuck: boolean;
  latestHandoffClassification: string | null;
  latestHandoffIteration: number | null;
  noProgressHeatmap: string;
}

export interface AgentGridSection {
  rows: AgentGridRow[];
}

// ---------------------------------------------------------------------------
// Failure feed
// ---------------------------------------------------------------------------

export interface FailureFeedSection {
  lastFailureCategory: FailureCategoryId | null;
  recoveryAttemptCount: number | null;
  remediationSummary: string | null;
  humanReviewRecommended: boolean;
}

// ---------------------------------------------------------------------------
// Dead-letter
// ---------------------------------------------------------------------------

export interface DeadLetterSection {
  entries: DeadLetterEntry[];
}

// ---------------------------------------------------------------------------
// Quick-action inputs
// ---------------------------------------------------------------------------

export interface QuickActionsSection {
  /** True when the workspace has at least one dead-letter entry (requeue action). */
  hasDeadLetterEntries: boolean;
  /** True when the workspace has at least one blocked task. */
  hasBlockedTasks: boolean;
  /** True when a task is selected and the workspace is trusted. */
  canAttemptLoop: boolean;
}

// ---------------------------------------------------------------------------
// Top-level dashboard snapshot
// ---------------------------------------------------------------------------

export interface DashboardSnapshot {
  workspaceName: string;
  pipeline: PipelineStrip | null;
  taskBoard: TaskBoardSection;
  agentGrid: AgentGridSection;
  failureFeed: FailureFeedSection;
  deadLetter: DeadLetterSection;
  quickActions: QuickActionsSection;
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

/**
 * Project from a durable `RalphStatusSnapshot` into a typed `DashboardSnapshot`.
 *
 * All six dashboard sections are populated from canonical durable sources
 * (`collectStatusSnapshot` output and optional multi-agent summaries) rather
 * than a separate watcher-local model.  Sections with no available data
 * return null or empty defaults.
 *
 * @param snapshot       Full status snapshot from `collectStatusSnapshot()`.
 * @param agentSummaries Agent summaries from `readMultiAgentStatusSummaries()`,
 *                       or null when multi-agent data is not yet loaded.
 */
export function buildDashboardSnapshot(
  snapshot: RalphStatusSnapshot,
  agentSummaries: AgentStatusSummary[] | null = null
): DashboardSnapshot {
  return {
    workspaceName: snapshot.workspaceName,
    pipeline: buildPipelineStrip(snapshot.latestPipelineRun),
    taskBoard: buildTaskBoard(snapshot),
    agentGrid: buildAgentGrid(agentSummaries),
    failureFeed: buildFailureFeed(snapshot),
    deadLetter: buildDeadLetter(snapshot),
    quickActions: buildQuickActions(snapshot),
  };
}

function buildPipelineStrip(run: PipelineRunArtifact | null): PipelineStrip | null {
  if (!run) {
    return null;
  }
  return {
    runId: run.runId,
    status: run.status,
    phase: run.phase ?? null,
    rootTaskId: run.rootTaskId,
    decomposedTaskCount: run.decomposedTaskIds.length,
    loopStartTime: run.loopStartTime,
    loopEndTime: run.loopEndTime ?? null,
    prUrl: run.prUrl ?? null,
  };
}

function buildTaskBoard(snapshot: RalphStatusSnapshot): TaskBoardSection {
  return {
    counts: snapshot.taskCounts,
    selectedTaskId: snapshot.selectedTask?.id ?? null,
    selectedTaskTitle: snapshot.selectedTask?.title ?? null,
    nextIteration: snapshot.nextIteration,
  };
}

function buildAgentGrid(summaries: AgentStatusSummary[] | null): AgentGridSection {
  if (!summaries || summaries.length === 0) {
    return { rows: [] };
  }
  const rows: AgentGridRow[] = summaries.map((s) => ({
    agentId: s.agentId,
    firstSeenAt: s.firstSeenAt,
    completedTaskCount: s.completedTaskCount,
    activeClaimTaskId: s.activeClaimTaskId,
    stuckScore: s.stuckScore,
    isStuck: s.stuckScore >= STUCK_SCORE_THRESHOLD,
    latestHandoffClassification: s.latestHandoff?.completionClassification ?? null,
    latestHandoffIteration: s.latestHandoff?.iteration ?? null,
    noProgressHeatmap: buildNoProgressHeatmap(s.handoffHistory),
  }));
  return { rows };
}

function buildFailureFeed(snapshot: RalphStatusSnapshot): FailureFeedSection {
  return {
    lastFailureCategory: snapshot.lastFailureCategory ?? null,
    recoveryAttemptCount: snapshot.recoveryAttemptCount ?? null,
    remediationSummary: snapshot.latestRemediation?.summary ?? null,
    humanReviewRecommended: snapshot.latestRemediation?.humanReviewRecommended ?? false,
  };
}

function buildDeadLetter(snapshot: RalphStatusSnapshot): DeadLetterSection {
  return {
    entries: snapshot.deadLetterEntries ?? [],
  };
}

function buildQuickActions(snapshot: RalphStatusSnapshot): QuickActionsSection {
  return {
    hasDeadLetterEntries: (snapshot.deadLetterEntries?.length ?? 0) > 0,
    hasBlockedTasks: (snapshot.taskCounts?.blocked ?? 0) > 0,
    canAttemptLoop: snapshot.workspaceTrusted && snapshot.selectedTask !== null,
  };
}
