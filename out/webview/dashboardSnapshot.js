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
exports.DASHBOARD_TIMELINE_ENTRY_CAP = void 0;
exports.buildRunTimelineSection = buildRunTimelineSection;
exports.buildDashboardSnapshot = buildDashboardSnapshot;
const multiAgentStatus_1 = require("../ralph/multiAgentStatus");
const doctrine_1 = require("../ralph/doctrine");
/** Max timeline entries surfaced in the dashboard (most recent first). */
exports.DASHBOARD_TIMELINE_ENTRY_CAP = 40;
/**
 * Projects the pre-run intent + post-run trust timeline (issue #73) into a
 * dashboard section. Returns null when neither is available.
 */
function buildRunTimelineSection(input) {
    const { intent, timeline } = input;
    if (!intent && !timeline) {
        return null;
    }
    const entries = (timeline?.entries ?? [])
        .slice()
        .sort((a, b) => b.seq - a.seq)
        .slice(0, exports.DASHBOARD_TIMELINE_ENTRY_CAP)
        .map((entry) => ({ seq: entry.seq, timestamp: entry.timestamp, kind: entry.kind, summary: entry.summary, taskId: entry.taskId }));
    return {
        intent: intent
            ? {
                provider: intent.provider,
                autonomyMode: intent.autonomyMode,
                agentRole: intent.agentRole,
                verifierStack: intent.verifierStack,
                gitCheckpointMode: intent.gitCheckpointMode,
                scmStrategy: intent.scmStrategy,
                autoAppliedRemediations: intent.autoAppliedRemediations,
                selectedTaskId: intent.selectedTaskId,
                selectedTaskTitle: intent.selectedTaskTitle,
                notes: intent.notes
            }
            : null,
        runId: timeline?.runId ?? null,
        startedAt: timeline?.startedAt ?? null,
        completedAt: timeline?.completedAt ?? null,
        stopReason: timeline?.stopReason ?? null,
        totals: timeline?.totals ?? {
            taskStateChanges: 0,
            providerInvocations: 0,
            remediationsApplied: 0,
            recoveryActionsApplied: 0,
            artifactsWritten: 0,
            scmActions: 0
        },
        entries,
        // Cap like `entries` so a long run with many remediations can't produce an
        // unbounded dashboard payload; keep the most recent.
        remediationAudit: (timeline?.remediationAudit ?? []).slice(-exports.DASHBOARD_TIMELINE_ENTRY_CAP)
    };
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
function buildDashboardSnapshot(snapshot, agentSummaries = null, runTimelineInput = null) {
    const runTimeline = runTimelineInput ? buildRunTimelineSection(runTimelineInput) : null;
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
        doctrine: buildDoctrineSection(snapshot),
        prdReconciliation: buildPrdReconciliationSection(snapshot),
        ...(runTimeline ? { runTimeline } : {}),
    };
}
function summarizeReconciliationMessage(message) {
    const firstSentence = message.match(/^.*?(?:\.|$)/)?.[0]?.trim();
    return firstSentence || message;
}
function buildPrdReconciliationSection(snapshot) {
    const source = snapshot.prdReconciliation ?? {
        status: 'missing',
        proposal: null,
        jsonPath: null,
        markdownPath: null,
        message: 'PRD/backlog reconciliation has not been generated yet.'
    };
    const proposal = source.proposal;
    const findings = (proposal?.findings ?? []).map((finding) => ({
        severity: finding.severity,
        type: finding.type,
        summary: summarizeReconciliationMessage(finding.message),
        taskIds: finding.taskIds ?? []
    }));
    const severityCounts = findings.reduce((counts, finding) => {
        counts[finding.severity] += 1;
        return counts;
    }, { info: 0, warning: 0 });
    const findingCount = proposal?.findingCount ?? findings.length;
    const available = source.status === 'available' && proposal !== null;
    const hasOpenableProposal = available || source.status === 'stale';
    if (!available) {
        return {
            status: 'unavailable',
            availability: source.status,
            findingCount: 0,
            severityCounts: { info: 0, warning: 0 },
            findings: [],
            proposalJsonPath: hasOpenableProposal ? source.jsonPath : null,
            proposalMarkdownPath: hasOpenableProposal ? source.markdownPath : null,
            generatedAt: null,
            message: source.message ?? 'PRD/backlog reconciliation proposal is unavailable.'
        };
    }
    return {
        status: findingCount > 0 ? 'findings' : 'clean',
        availability: 'available',
        findingCount,
        severityCounts,
        findings,
        proposalJsonPath: source.jsonPath,
        proposalMarkdownPath: source.markdownPath,
        generatedAt: proposal.generatedAt,
        message: findingCount > 0
            ? `${findingCount} reconciliation finding${findingCount === 1 ? '' : 's'} require review.`
            : 'No drift detected between PRD and backlog.'
    };
}
function buildDoctrineSection(snapshot) {
    const inspection = snapshot.doctrineInspection ?? {
        doctrineDir: doctrine_1.DOCTRINE_ROOT_RELATIVE,
        health: 'missing',
        protectedFiles: ['invariants.md', 'boundaries.md', 'agents.md'],
        diagnostics: []
    };
    const context = snapshot.doctrineContext ?? {
        entries: [],
        totalChars: 0,
        budgetChars: 0,
        budgetExceeded: false
    };
    const health = inspection.health === 'invalid evidence index'
        ? 'invalid_evidence_index'
        : inspection.health;
    const diagnostics = inspection.diagnostics.map((diagnostic) => ({
        severity: diagnostic.severity,
        code: diagnostic.code,
        message: diagnostic.message,
        file: diagnostic.file ?? null
    }));
    const pending = snapshot.pendingDoctrineProposalCountsByRisk ?? { low: 0, medium: 0, high: 0 };
    const usedChars = context.totalChars;
    const budgetChars = context.budgetChars;
    return {
        health,
        protectedFiles: inspection.protectedFiles,
        contextBudget: {
            usedChars,
            budgetChars,
            usagePercent: budgetChars > 0 ? Math.min(100, Math.round((usedChars / budgetChars) * 100)) : 0
        },
        contextTruncated: context.budgetExceeded || context.entries.some((entry) => entry.truncated),
        diagnostics: {
            missingFiles: diagnostics.filter((diagnostic) => diagnostic.code === 'doctrine_directory_missing' || diagnostic.code === 'doctrine_required_file_missing'),
            missingHeadings: diagnostics.filter((diagnostic) => diagnostic.code === 'doctrine_required_heading_missing'),
            invalidEvidenceIndex: diagnostics.filter((diagnostic) => diagnostic.code === 'doctrine_evidence_index_invalid'),
            other: diagnostics.filter((diagnostic) => !new Set([
                'doctrine_directory_missing',
                'doctrine_required_file_missing',
                'doctrine_required_heading_missing',
                'doctrine_evidence_index_invalid',
                'doctrine_pack_healthy'
            ]).has(diagnostic.code))
        },
        pendingProposalCountsByRisk: {
            low: pending.low,
            medium: pending.medium,
            high: pending.high,
            total: pending.low + pending.medium + pending.high
        },
        actionTargets: {
            initializeOrRepairCommand: 'ralphCodex.initializeDoctrinePack',
            openFolderCommand: 'ralphCodex.openDoctrineFolder',
            openFileCommands: {
                'invariants.md': 'ralphCodex.openDoctrineInvariants',
                'boundaries.md': 'ralphCodex.openDoctrineBoundaries',
                'agents.md': 'ralphCodex.openDoctrineAgents'
            },
            reviewProposalsCommand: snapshot.latestDoctrineProposalPath || snapshot.latestDoctrineProposalMdPath
                ? 'ralphCodex.openLatestDoctrineProposal'
                : null,
            doctrineFolderPath: doctrine_1.DOCTRINE_ROOT_RELATIVE,
            latestProposalPath: snapshot.latestDoctrineProposalPath,
            latestProposalMarkdownPath: snapshot.latestDoctrineProposalMdPath
        },
        proposalReview: buildDoctrineProposalReviewSection(snapshot)
    };
}
const DOCTRINE_DETAIL_TEXT_LIMIT = 1800;
function boundedText(value, limit = DOCTRINE_DETAIL_TEXT_LIMIT) {
    if (value.length <= limit) {
        return { text: value, truncated: false, fullLength: value.length };
    }
    return {
        text: `${value.slice(0, limit)}\n\n[Truncated: ${value.length - limit} more character(s)]`,
        truncated: true,
        fullLength: value.length
    };
}
function compactUnique(values) {
    const unique = Array.from(new Set(values));
    return unique.length === 1 ? unique[0] : `${unique[0]} (+${unique.length - 1} more)`;
}
function buildDoctrineProposalReviewSection(snapshot) {
    const entries = [...(snapshot.pendingDoctrineProposals ?? [])].sort((left, right) => {
        const byId = left.proposal.proposalId.localeCompare(right.proposal.proposalId);
        return byId !== 0 ? byId : left.path.localeCompare(right.path);
    });
    return {
        hasPendingProposals: entries.length > 0,
        proposals: entries.map(({ path: proposalPath, proposal }) => ({
            proposalId: proposal.proposalId,
            path: proposalPath,
            createdAt: proposal.createdAt,
            source: proposal.source,
            risk: proposal.risk,
            status: proposal.status,
            targetFile: compactUnique(proposal.updates.map((update) => update.targetFile)),
            operation: compactUnique(proposal.updates.map((update) => update.operation)),
            protectedTarget: proposal.updates.some((update) => update.protectedTarget),
            requiresApproval: proposal.updates.some((update) => update.requiresApproval),
            updateCount: proposal.updates.length
        })),
        details: entries.map(({ path: proposalPath, proposal }) => ({
            proposalId: proposal.proposalId,
            path: proposalPath,
            createdAt: proposal.createdAt,
            source: proposal.source,
            risk: proposal.risk,
            status: proposal.status,
            summary: proposal.summary,
            warnings: proposal.warnings,
            updates: proposal.updates.map((update, updateIndex) => ({
                updateIndex,
                targetFile: update.targetFile,
                operation: update.operation,
                section: update.section,
                protectedTarget: update.protectedTarget,
                requiresApproval: update.requiresApproval,
                risk: update.risk,
                proposedText: boundedText(update.proposedText),
                rationale: boundedText(update.rationale, 800),
                evidence: update.evidence
            }))
        }))
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