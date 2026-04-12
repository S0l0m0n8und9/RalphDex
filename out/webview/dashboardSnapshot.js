"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDashboardSnapshot = buildDashboardSnapshot;
const multiAgentStatus_1 = require("../ralph/multiAgentStatus");
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
function buildDashboardSnapshot(snapshot, agentSummaries = null) {
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
function buildPipelineStrip(run) {
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
function buildTaskBoard(snapshot) {
    return {
        counts: snapshot.taskCounts,
        selectedTaskId: snapshot.selectedTask?.id ?? null,
        selectedTaskTitle: snapshot.selectedTask?.title ?? null,
        nextIteration: snapshot.nextIteration,
    };
}
function buildAgentGrid(summaries) {
    if (!summaries || summaries.length === 0) {
        return { rows: [] };
    }
    const rows = summaries.map((s) => ({
        agentId: s.agentId,
        firstSeenAt: s.firstSeenAt,
        completedTaskCount: s.completedTaskCount,
        activeClaimTaskId: s.activeClaimTaskId,
        stuckScore: s.stuckScore,
        isStuck: s.stuckScore >= multiAgentStatus_1.STUCK_SCORE_THRESHOLD,
        latestHandoffClassification: s.latestHandoff?.completionClassification ?? null,
        latestHandoffIteration: s.latestHandoff?.iteration ?? null,
        noProgressHeatmap: (0, multiAgentStatus_1.buildNoProgressHeatmap)(s.handoffHistory),
    }));
    return { rows };
}
function buildFailureFeed(snapshot) {
    return {
        lastFailureCategory: snapshot.lastFailureCategory ?? null,
        recoveryAttemptCount: snapshot.recoveryAttemptCount ?? null,
        remediationSummary: snapshot.latestRemediation?.summary ?? null,
        humanReviewRecommended: snapshot.latestRemediation?.humanReviewRecommended ?? false,
    };
}
function buildDeadLetter(snapshot) {
    return {
        entries: snapshot.deadLetterEntries ?? [],
    };
}
function buildQuickActions(snapshot) {
    return {
        hasDeadLetterEntries: (snapshot.deadLetterEntries?.length ?? 0) > 0,
        hasBlockedTasks: (snapshot.taskCounts?.blocked ?? 0) > 0,
        canAttemptLoop: snapshot.workspaceTrusted && snapshot.selectedTask !== null,
    };
}
//# sourceMappingURL=dashboardSnapshot.js.map