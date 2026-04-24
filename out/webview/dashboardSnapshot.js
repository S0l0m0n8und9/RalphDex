"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDashboardSnapshot = buildDashboardSnapshot;
const multiAgentStatus_1 = require("../ralph/multiAgentStatus");
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
function buildDashboardSnapshot(snapshot, agentSummaries = null) {
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
function buildCostSection(snapshot) {
    const bundle = snapshot.latestProvenanceBundle;
    const executionCostUsd = bundle?.executionCostUsd ?? null;
    const diagnosticCostUsd = typeof bundle?.diagnosticCost === 'number' ? bundle.diagnosticCost : null;
    const promptCacheStats = bundle?.promptCacheStats ?? null;
    const hasAnyCostData = executionCostUsd !== null || diagnosticCostUsd !== null;
    return { executionCostUsd, diagnosticCostUsd, promptCacheStats, hasAnyCostData };
}
function buildTaskBoard(snapshot) {
    return {
        counts: snapshot.taskCounts,
        deadLetterCount: snapshot.deadLetterEntries?.length ?? 0,
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
    const entriesWithTimestamps = [];
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
function buildDiagnosis(snapshot) {
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
function compareIsoTimestampsDesc(left, right) {
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
//# sourceMappingURL=dashboardSnapshot.js.map