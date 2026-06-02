"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildExecutionIntentPreview = buildExecutionIntentPreview;
exports.buildRunTrustTimeline = buildRunTrustTimeline;
exports.renderExecutionIntentPreviewMarkdown = renderExecutionIntentPreviewMarkdown;
exports.renderRunTrustTimelineMarkdown = renderRunTrustTimelineMarkdown;
/** Builds a pre-run intent preview from the effective config and selected task. */
function buildExecutionIntentPreview(input) {
    const { config } = input;
    const selectedTask = input.selectedTask ?? null;
    const notes = [];
    notes.push(`Provider: ${config.cliProvider} (${config.autonomyMode} autonomy, role ${config.agentRole}).`);
    notes.push(config.verifierModes.length > 0
        ? `Verifier stack: ${config.verifierModes.join(', ')}.`
        : 'Verifier stack: none configured.');
    notes.push(`Git checkpoint: ${config.gitCheckpointMode}; SCM: ${config.scmStrategy}.`);
    if (config.scmStrategy !== 'none') {
        notes.push(config.scmStrategy === 'branch-per-task'
            ? 'May create a branch per task and open a PR on completion.'
            : 'May commit on task completion.');
    }
    if (config.autoApplyRemediation.length > 0) {
        notes.push(`May auto-apply remediation: ${config.autoApplyRemediation.join(', ')}.`);
    }
    else {
        notes.push('Will not auto-apply task remediation (proposals only).');
    }
    notes.push(selectedTask
        ? `Selected task: ${selectedTask.id} — ${selectedTask.title}.`
        : 'No task selected yet; the next actionable task will be chosen at run time.');
    return {
        provider: config.cliProvider,
        autonomyMode: config.autonomyMode,
        agentRole: config.agentRole,
        verifierStack: [...config.verifierModes],
        gitCheckpointMode: config.gitCheckpointMode,
        scmStrategy: config.scmStrategy,
        autoAppliedRemediations: [...config.autoApplyRemediation],
        selectedTaskId: selectedTask?.id ?? null,
        selectedTaskTitle: selectedTask?.title ?? null,
        notes
    };
}
// Kinds that represent operator-meaningful timeline entries (others fold into totals only).
const TIMELINE_ENTRY_KINDS = new Set([
    'run_started',
    'task_selected',
    'task_state_changed',
    'provider_completed',
    'verifier_result',
    'remediation_applied',
    'review_result',
    'scm_action',
    'run_completed'
]);
function describeEvent(event) {
    switch (event.type) {
        case 'run_started':
            return { kind: 'run_started', summary: `Run started${event.mode ? ` (${event.mode})` : ''}.`, taskId: null };
        case 'run_completed':
            return { kind: 'run_completed', summary: `Run completed${event.stopReason ? ` — stop: ${event.stopReason}` : ''}.`, taskId: null };
        case 'task_selected':
            return { kind: 'task_selected', summary: `Selected task ${event.taskId}${event.title ? ` — ${event.title}` : ''}.`, taskId: event.taskId };
        case 'task_state_changed':
            return { kind: 'task_state_changed', summary: `Task ${event.taskId}: ${event.from ?? '?'} → ${event.to}${event.reason ? ` (${event.reason})` : ''}.`, taskId: event.taskId };
        case 'provider_completed':
            return { kind: 'provider_completed', summary: `Provider ${event.provider} completed: ${event.status}.`, taskId: event.taskId ?? null };
        case 'verifier_result':
            return { kind: 'verifier_result', summary: `Verifier ${event.verifier}: ${event.status}.`, taskId: event.taskId ?? null };
        case 'remediation_applied':
            return { kind: 'remediation_applied', summary: `Remediation ${event.action}: ${event.applied ? 'applied' : 'proposed (not applied)'}.`, taskId: event.taskId ?? null };
        case 'review_result':
            return { kind: 'review_result', summary: `Review ${event.status}${event.anomalies ? ` (${event.anomalies} anomalies)` : ''}.`, taskId: event.taskId ?? null };
        case 'scm_action':
            return { kind: 'scm_action', summary: `SCM ${event.action}: ${event.status}.`, taskId: event.taskId ?? null };
        default:
            return null;
    }
}
/** Folds an ordered event journal into a post-run trust timeline. Pure. */
function buildRunTrustTimeline(events) {
    const ordered = [...events].sort((a, b) => a.seq - b.seq);
    const entries = [];
    const remediationAudit = [];
    const artifactsWritten = [];
    const totals = {
        taskStateChanges: 0,
        providerInvocations: 0,
        remediationsApplied: 0,
        artifactsWritten: 0,
        scmActions: 0
    };
    let runId = ordered.length > 0 ? ordered[0].runId : null;
    let startedAt = null;
    let completedAt = null;
    let stopReason = null;
    for (const event of ordered) {
        runId = runId ?? event.runId;
        switch (event.type) {
            case 'run_started':
                startedAt = event.timestamp;
                break;
            case 'run_completed':
                completedAt = event.timestamp;
                stopReason = event.stopReason ?? null;
                break;
            case 'task_state_changed':
                totals.taskStateChanges += 1;
                break;
            case 'provider_invoked':
                totals.providerInvocations += 1;
                break;
            case 'remediation_applied':
                if (event.applied) {
                    totals.remediationsApplied += 1;
                }
                remediationAudit.push({
                    seq: event.seq,
                    timestamp: event.timestamp,
                    taskId: event.taskId ?? null,
                    action: event.action,
                    applied: event.applied
                });
                break;
            case 'scm_action':
                totals.scmActions += 1;
                break;
            case 'artifact_written':
                totals.artifactsWritten += 1;
                artifactsWritten.push(event.relativePath);
                break;
            default:
                break;
        }
        const described = describeEvent(event);
        if (described && TIMELINE_ENTRY_KINDS.has(described.kind)) {
            entries.push({ seq: event.seq, timestamp: event.timestamp, ...described });
        }
    }
    return { runId, startedAt, completedAt, stopReason, entries, remediationAudit, artifactsWritten, totals };
}
// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------
function renderExecutionIntentPreviewMarkdown(intent) {
    return ['# Execution intent preview', '', ...intent.notes.map((note) => `- ${note}`)].join('\n');
}
function renderRunTrustTimelineMarkdown(timeline) {
    const lines = [
        '# Run trust timeline',
        '',
        `- Run: ${timeline.runId ?? 'unknown'}`,
        `- Started: ${timeline.startedAt ?? 'n/a'}`,
        `- Completed: ${timeline.completedAt ?? 'in progress'}`,
        `- Stop reason: ${timeline.stopReason ?? 'n/a'}`,
        `- Task state changes: ${timeline.totals.taskStateChanges}; remediations applied: ${timeline.totals.remediationsApplied}; SCM actions: ${timeline.totals.scmActions}; artifacts written: ${timeline.totals.artifactsWritten}`,
        ''
    ];
    if (timeline.entries.length === 0) {
        lines.push('No timeline events recorded for this run.');
        return lines.join('\n');
    }
    lines.push('## Timeline');
    for (const entry of timeline.entries) {
        lines.push(`- [${entry.seq}] ${entry.summary}`);
    }
    if (timeline.remediationAudit.length > 0) {
        lines.push('', '## Auto-remediation audit');
        for (const audit of timeline.remediationAudit) {
            lines.push(`- ${audit.action} on ${audit.taskId ?? 'unknown task'}: ${audit.applied ? 'applied' : 'proposed (not applied)'}`);
        }
    }
    return lines.join('\n');
}
//# sourceMappingURL=runTimeline.js.map