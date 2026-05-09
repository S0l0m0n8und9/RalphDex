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
        preflight: buildPreflightSection(snapshot),
        pipeline: buildPipelineSection(snapshot),
    };
}
function buildPipelineSection(snapshot) {
    const latestRun = snapshot.latestPipelineRun
        ? {
            runId: snapshot.latestPipelineRun.runId,
            status: snapshot.latestPipelineRun.status,
            phase: snapshot.latestPipelineRun.phase ?? null,
            rootTaskId: snapshot.latestPipelineRun.rootTaskId,
            decomposedTaskIds: snapshot.latestPipelineRun.decomposedTaskIds,
            startedAt: snapshot.latestPipelineRun.loopStartTime,
            finishedAt: snapshot.latestPipelineRun.loopEndTime ?? null,
            prUrl: snapshot.latestPipelineRun.prUrl ?? null,
            taskGraphSource: snapshot.latestPipelineRun.taskGraphSource ?? null,
            orchestrationGraphPath: snapshot.latestPipelineRun.orchestrationGraphPath ?? null,
        }
        : null;
    return {
        latestRun,
        orchestration: snapshot.orchestration ?? null,
        replan: (snapshot.replanArtifacts ?? []).map((artifact) => ({
            parentTaskId: artifact.parentTaskId,
            replanIndex: artifact.replanIndex,
            triggerDetails: artifact.triggerDetails,
            chosenMutation: artifact.chosenMutation,
            addedTaskIds: artifact.taskGraphDiff.addedTaskIds,
            removedTaskIds: artifact.taskGraphDiff.removedTaskIds,
            modifiedTaskIds: artifact.taskGraphDiff.modifiedTaskIds,
            createdAt: artifact.createdAt,
        })),
        fanIn: snapshot.fanInRecord
            ? {
                waveIndex: snapshot.fanInRecord.waveIndex,
                result: snapshot.fanInRecord.fanInResult,
                memberOutcomes: snapshot.fanInRecord.memberOutcomes,
                errors: snapshot.fanInRecord.fanInErrors,
                evaluatedAt: snapshot.fanInRecord.evaluatedAt,
            }
            : null,
        nodeSpans: (snapshot.nodeSpans ?? []).map((span) => ({
            nodeId: span.nodeId,
            runId: span.runId,
            agentId: span.agentId ?? null,
            agentRole: span.agentRole ?? null,
            stopClassification: span.stopClassification ?? null,
            outputCount: span.outputRefs.length,
            startedAt: span.startedAt,
            finishedAt: span.finishedAt,
        })),
    };
}
function buildPreflightSection(snapshot) {
    const diagnostics = snapshot.preflightReport.diagnostics;
    return {
        ready: snapshot.preflightReport.ready,
        summary: snapshot.preflightReport.summary,
        diagnostics: diagnostics.map((diagnostic) => ({
            severity: diagnostic.severity,
            message: diagnostic.message
        })),
        firstRunChecklist: buildFirstRunChecklist(snapshot)
    };
}
const DOCTRINE_HEALTH_CODES = new Set([
    'doctrine_directory_missing',
    'doctrine_required_file_missing',
    'doctrine_required_heading_missing',
    'doctrine_evidence_index_invalid'
]);
const CHECKLIST_STATUS_BY_SEVERITY = {
    error: 'blocker',
    warning: 'warning',
    info: 'complete'
};
function buildFirstRunChecklist(snapshot) {
    const diagnostics = snapshot.preflightReport.diagnostics;
    const workspaceMissing = diagnostics.find((diagnostic) => diagnostic.code === 'ralph_files_missing') ?? null;
    const providerDiagnostics = diagnostics.filter((diagnostic) => diagnostic.category === 'codexAdapter');
    const doctrineDiagnostics = diagnostics.filter((diagnostic) => DOCTRINE_HEALTH_CODES.has(diagnostic.code));
    const validationDiagnostics = diagnostics.filter((diagnostic) => diagnostic.category === 'validationVerifier');
    const totalTasks = snapshot.taskCounts
        ? snapshot.taskCounts.todo + snapshot.taskCounts.in_progress + snapshot.taskCounts.blocked + snapshot.taskCounts.done
        : 0;
    const tasksPresent = snapshot.selectedTask !== null || totalTasks > 0;
    const highestProviderSeverity = highestSeverity(providerDiagnostics);
    const highestDoctrineSeverity = highestSeverity(doctrineDiagnostics);
    const highestValidationSeverity = highestSeverity(validationDiagnostics);
    return [
        {
            id: 'workspace_initialized',
            label: 'Workspace initialized',
            status: workspaceMissing ? 'blocker' : 'complete',
            detail: workspaceMissing
                ? workspaceMissing.message
                : 'Required Ralph workspace files were detected.'
        },
        {
            id: 'tasks_present',
            label: 'Tasks present',
            status: tasksPresent ? 'complete' : 'warning',
            detail: tasksPresent
                ? `Task graph loaded (${totalTasks} task${totalTasks === 1 ? '' : 's'}).`
                : 'No tasks are available yet; create or seed tasks before iterating.'
        },
        {
            id: 'provider_ready',
            label: 'Provider ready',
            status: highestProviderSeverity ? CHECKLIST_STATUS_BY_SEVERITY[highestProviderSeverity] : 'complete',
            detail: providerDiagnostics[0]?.message ?? 'No provider readiness blockers were detected.'
        },
        {
            id: 'doctrine_optional_healthy',
            label: 'Doctrine optional/healthy',
            status: highestDoctrineSeverity ? CHECKLIST_STATUS_BY_SEVERITY[highestDoctrineSeverity] : 'complete',
            detail: doctrineDiagnostics[0]?.message ?? 'No doctrine health issues were detected.'
        },
        {
            id: 'validation_command_detected',
            label: 'Validation command detected',
            status: determineValidationChecklistStatus(validationDiagnostics, highestValidationSeverity),
            detail: validationDiagnostics[0]?.message ?? 'Validation command readiness has not been reported yet.'
        }
    ];
}
function determineValidationChecklistStatus(validationDiagnostics, highestValidationSeverity) {
    if (validationDiagnostics.some((diagnostic) => diagnostic.code === 'validation_command_missing')) {
        return 'warning';
    }
    if (!highestValidationSeverity) {
        return 'warning';
    }
    return CHECKLIST_STATUS_BY_SEVERITY[highestValidationSeverity];
}
function highestSeverity(diagnostics) {
    if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
        return 'error';
    }
    if (diagnostics.some((diagnostic) => diagnostic.severity === 'warning')) {
        return 'warning';
    }
    if (diagnostics.some((diagnostic) => diagnostic.severity === 'info')) {
        return 'info';
    }
    return null;
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