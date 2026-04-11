"use strict";
/**
 * Pure multi-agent status types and logic.
 *
 * This module is intentionally free of vscode and fs dependencies so it can be
 * unit-tested without stubs.  IO (reading agent/handoff files) stays in
 * artifactCommands.ts; only computation and rendering live here.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HEATMAP_WINDOW = exports.STUCK_SCORE_THRESHOLD = void 0;
exports.computeStuckScore = computeStuckScore;
exports.buildNoProgressHeatmap = buildNoProgressHeatmap;
exports.buildMultiAgentStatusReport = buildMultiAgentStatusReport;
/** Agents at or above this consecutive-no-progress count are flagged as stuck. */
exports.STUCK_SCORE_THRESHOLD = 3;
/** Maximum number of iterations shown in a single heatmap strip. */
exports.HEATMAP_WINDOW = 10;
/**
 * Compute the stuck score for an agent from its full handoff history.
 *
 * The score is the count of trailing handoff entries (sorted ascending by
 * iteration) that share the same selectedTaskId and have
 * completionClassification === 'no_progress'.  Any break in task id or
 * classification resets the streak.
 */
function computeStuckScore(handoffs) {
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
        if (entry.completionClassification === 'no_progress'
            && entry.selectedTaskId === last.selectedTaskId) {
            score += 1;
        }
        else {
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
function buildNoProgressHeatmap(handoffs, maxLen = exports.HEATMAP_WINDOW) {
    if (handoffs.length === 0) {
        return '';
    }
    const sorted = [...handoffs].sort((a, b) => a.iteration - b.iteration);
    const window = sorted.slice(-maxLen);
    const cells = window.map((h) => (h.completionClassification === 'no_progress' ? 'X' : '.'));
    return `[${cells.join('')}]`;
}
/**
 * Render the multi-agent status report for the output channel.
 *
 * Agents with stuckScore >= STUCK_SCORE_THRESHOLD are rendered with a
 * WARNING prefix so operators can spot stuck agents quickly.
 *
 * Dead-letter entries are surfaced in a distinct section after the per-agent rows.
 */
function buildMultiAgentStatusReport(summaries, deadLetterEntries = []) {
    const lines = ['=== Multi-Agent Status ===', ''];
    if (summaries.length === 0) {
        lines.push('No agent identity records found under .ralph/agents/.');
        lines.push('Run at least one CLI iteration to populate agent state.');
        return lines.join('\n');
    }
    for (const summary of summaries) {
        const isStuck = summary.stuckScore >= exports.STUCK_SCORE_THRESHOLD;
        const agentPrefix = isStuck ? 'WARNING Agent' : 'Agent';
        lines.push(`${agentPrefix}: ${summary.agentId}${summary.firstSeenAt ? ` (first seen: ${summary.firstSeenAt})` : ''}`);
        lines.push(`  Tasks completed: ${summary.completedTaskCount}`);
        const claimTierSuffix = summary.activeClaimTaskTierSource === null
            ? ''
            : summary.activeClaimTaskTierSource === 'explicit'
                ? ` [tier: ${summary.activeClaimTaskTier} (explicit)]`
                : ' [tier: dynamic]';
        lines.push(`  Current claim: ${summary.activeClaimTaskId ?? 'none'}${claimTierSuffix}`);
        if (isStuck) {
            lines.push(`  STUCK: ${summary.stuckScore} consecutive no-progress stop(s) on task ${summary.latestHandoff?.selectedTaskId ?? 'unknown'} — investigate or resolve stale claim`);
        }
        if (summary.handoffHistory.length > 0) {
            const heatmap = buildNoProgressHeatmap(summary.handoffHistory);
            lines.push(`  No-progress heatmap (last ${exports.HEATMAP_WINDOW}): ${heatmap}  (X = no_progress, . = other)`);
        }
        if (summary.latestHandoff) {
            const handoff = summary.latestHandoff;
            const taskLabel = handoff.selectedTaskId
                ? handoff.selectedTaskTitle
                    ? `${handoff.selectedTaskId}: ${handoff.selectedTaskTitle}`
                    : handoff.selectedTaskId
                : 'none';
            lines.push(`  Last iteration: ${handoff.iteration} | task: ${taskLabel}`);
            lines.push(`  Last outcome: ${handoff.completionClassification ?? 'unknown'} | stopped: ${handoff.stopReason ?? 'unknown'}`);
            if (handoff.progressNote) {
                lines.push(`  Progress: ${handoff.progressNote}`);
            }
        }
        else {
            lines.push('  Last iteration: none');
        }
        lines.push('');
    }
    if (deadLetterEntries.length > 0) {
        lines.push('=== Dead-Letter Queue ===');
        lines.push('');
        for (const entry of deadLetterEntries) {
            const lastCategory = entry.diagnosticHistory[entry.diagnosticHistory.length - 1]?.rootCauseCategory ?? 'unknown';
            lines.push(`Dead-Letter: ${entry.taskId}: ${entry.taskTitle}`);
            lines.push(`  Dead-lettered: ${entry.deadLetteredAt}`);
            lines.push(`  Recovery attempts: ${entry.recoveryAttemptCount}`);
            lines.push(`  Last failure category: ${lastCategory}`);
            lines.push('');
        }
        lines.push('Run "Ralphdex: Requeue Dead-Letter Task" to reset a task to todo and remove it from the dead-letter queue.');
    }
    return lines.join('\n').trimEnd();
}
//# sourceMappingURL=multiAgentStatus.js.map