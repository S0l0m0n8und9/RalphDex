/**
 * Typed dashboard snapshot for the webview dashboard.
 *
 * `buildDashboardSnapshot` projects from a durable `RalphStatusSnapshot`
 * (plus optional multi-agent summaries) into a `DashboardSnapshot` covering
 * five sections: task board, agent grid, failure feed, dead-letter,
 * and quick-action inputs.
 *
 * All sections use null or empty states when source data is unavailable,
 * so callers can always render a valid (possibly empty) dashboard.
 */

import type { RalphStatusSnapshot } from '../ralph/statusReport';
import {
  buildNoProgressHeatmap,
  STUCK_SCORE_THRESHOLD,
  type AgentStatusSummary,
} from '../ralph/multiAgentStatus';
import type { DeadLetterEntry } from '../ralph/deadLetter';
import type { FailureCategoryId, PromptCacheStats, RalphTaskCounts } from '../ralph/types';

// ---------------------------------------------------------------------------
// Task board
// ---------------------------------------------------------------------------

export interface TaskBoardSection {
  counts: RalphTaskCounts | null;
  deadLetterCount: number;
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

export interface FailureFeedEntry {
  taskId: string;
  taskTitle: string;
  category: FailureCategoryId;
  confidence: 'high' | 'medium' | 'low';
  summary: string;
  suggestedAction: string;
  recoveryAttemptCount: number | null;
  remediationSummary: string | null;
  humanReviewRecommended: boolean;
}

export interface FailureFeedSection {
  entries: FailureFeedEntry[];
}

export interface DiagnosisSection {
  taskId: string;
  taskTitle: string;
  category: FailureCategoryId;
  confidence: 'high' | 'medium' | 'low';
  summary: string;
  suggestedAction: string;
  retryPromptAddendum: string | null;
  recoveryAttemptCount: number | null;
  remediationSummary: string | null;
  failureAnalysisPath: string | null;
  recoveryStatePath: string | null;
}

// ---------------------------------------------------------------------------
// Dead-letter
// ---------------------------------------------------------------------------

export interface DeadLetterSection {
  entries: DeadLetterEntry[];
}

// ---------------------------------------------------------------------------
// Cost ticker
// ---------------------------------------------------------------------------

/**
 * Normalized cost signals from the latest provenance bundle.
 *
 * Each field uses an explicit null to signal "provider did not report this value"
 * so the UI can distinguish between zero-cost and unknown-cost states.
 */
export interface DashboardCostSection {
  /** Provider-reported execution cost (USD) for the main agent invocation; null = not reported. */
  executionCostUsd: number | null;
  /** Cost of the failure-diagnostic pass that preceded this bundle; null = no diagnostic ran. */
  diagnosticCostUsd: number | null;
  /** Prompt cache stats; null = provider did not report cache usage. */
  promptCacheStats: PromptCacheStats | null;
  /** True when at least one numeric cost signal is available from the latest bundle. */
  hasAnyCostData: boolean;
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
  taskBoard: TaskBoardSection;
  agentGrid: AgentGridSection;
  diagnosis: DiagnosisSection | null;
  failureFeed: FailureFeedSection;
  deadLetter: DeadLetterSection;
  quickActions: QuickActionsSection;
  cost: DashboardCostSection;
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

/**
 * Project from a durable `RalphStatusSnapshot` into a typed `DashboardSnapshot`.
 *
 * All dashboard sections are populated from canonical durable sources
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
    taskBoard: buildTaskBoard(snapshot),
    agentGrid: buildAgentGrid(agentSummaries),
    diagnosis: buildDiagnosis(snapshot),
    failureFeed: buildFailureFeed(snapshot),
    deadLetter: buildDeadLetter(snapshot),
    quickActions: buildQuickActions(snapshot),
    cost: buildCostSection(snapshot),
  };
}

function buildCostSection(snapshot: RalphStatusSnapshot): DashboardCostSection {
  const bundle = snapshot.latestProvenanceBundle;
  const executionCostUsd = bundle?.executionCostUsd ?? null;
  const diagnosticCostUsd = typeof bundle?.diagnosticCost === 'number' ? bundle.diagnosticCost : null;
  const promptCacheStats = bundle?.promptCacheStats ?? null;
  const hasAnyCostData = executionCostUsd !== null || diagnosticCostUsd !== null;
  return { executionCostUsd, diagnosticCostUsd, promptCacheStats, hasAnyCostData };
}

function buildTaskBoard(snapshot: RalphStatusSnapshot): TaskBoardSection {
  return {
    counts: snapshot.taskCounts,
    deadLetterCount: snapshot.deadLetterEntries?.length ?? 0,
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
  const entriesWithTimestamps: Array<FailureFeedEntry & { createdAt: string }> = [];

  if (snapshot.latestFailureAnalysis && snapshot.selectedTask) {
    entriesWithTimestamps.push({
      taskId: snapshot.selectedTask.id,
      taskTitle: snapshot.selectedTask.title,
      category: snapshot.latestFailureAnalysis.rootCauseCategory,
      confidence: snapshot.latestFailureAnalysis.confidence,
      summary: snapshot.latestFailureAnalysis.summary,
      suggestedAction: snapshot.latestFailureAnalysis.suggestedAction,
      recoveryAttemptCount: snapshot.recoveryAttemptCount ?? null,
      remediationSummary: snapshot.latestRemediation?.summary ?? null,
      humanReviewRecommended: snapshot.latestRemediation?.humanReviewRecommended ?? false,
      createdAt: snapshot.latestFailureAnalysis.createdAt,
    });
  }

  for (const deadLetterEntry of snapshot.deadLetterEntries ?? []) {
    for (const analysis of deadLetterEntry.diagnosticHistory) {
      entriesWithTimestamps.push({
        taskId: deadLetterEntry.taskId,
        taskTitle: deadLetterEntry.taskTitle,
        category: analysis.rootCauseCategory,
        confidence: analysis.confidence,
        summary: analysis.summary,
        suggestedAction: analysis.suggestedAction,
        recoveryAttemptCount: deadLetterEntry.recoveryAttemptCount,
        remediationSummary: null,
        humanReviewRecommended: false,
        createdAt: analysis.createdAt,
      });
    }
  }

  entriesWithTimestamps.sort((left, right) => compareIsoTimestampsDesc(left.createdAt, right.createdAt));

  return {
    entries: entriesWithTimestamps.slice(0, 5).map(({ createdAt: _createdAt, ...entry }) => entry),
  };
}

function buildDiagnosis(snapshot: RalphStatusSnapshot): DiagnosisSection | null {
  if (!snapshot.selectedTask || !snapshot.latestFailureAnalysis) {
    return null;
  }

  return {
    taskId: snapshot.selectedTask.id,
    taskTitle: snapshot.selectedTask.title,
    category: snapshot.latestFailureAnalysis.rootCauseCategory,
    confidence: snapshot.latestFailureAnalysis.confidence,
    summary: snapshot.latestFailureAnalysis.summary,
    suggestedAction: snapshot.latestFailureAnalysis.suggestedAction,
    retryPromptAddendum: snapshot.latestFailureAnalysis.retryPromptAddendum ?? null,
    recoveryAttemptCount: snapshot.recoveryAttemptCount ?? null,
    remediationSummary: snapshot.latestRemediation?.summary ?? null,
    failureAnalysisPath: snapshot.latestFailureAnalysisPath ?? null,
    recoveryStatePath: snapshot.recoveryStatePath ?? null,
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

function compareIsoTimestampsDesc(left: string, right: string): number {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);

  if (Number.isNaN(leftTime) && Number.isNaN(rightTime)) {
    return 0;
  }
  if (Number.isNaN(leftTime)) {
    return 1;
  }
  if (Number.isNaN(rightTime)) {
    return -1;
  }

  return rightTime - leftTime;
}
