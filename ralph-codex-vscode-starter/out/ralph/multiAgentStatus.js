"use strict";
/**
 * Pure multi-agent status types and logic.
 *
 * This module is intentionally free of vscode and fs dependencies so it can be
 * unit-tested without stubs.  IO (reading agent/handoff files) stays in
 * artifactCommands.ts; only computation and rendering live here.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.STUCK_SCORE_THRESHOLD = void 0;
exports.computeStuckScore = computeStuckScore;
exports.buildMultiAgentStatusReport = buildMultiAgentStatusReport;
/** Agents at or above this consecutive-no-progress count are flagged as stuck. */
exports.STUCK_SCORE_THRESHOLD = 3;
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
 * Render the multi-agent status report for the output channel.
 *
 * Agents with stuckScore >= STUCK_SCORE_THRESHOLD are rendered with a
 * WARNING prefix so operators can spot stuck agents quickly.
 */
function buildMultiAgentStatusReport(summaries) {
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
        lines.push(`  Current claim: ${summary.activeClaimTaskId ?? 'none'}`);
        if (isStuck) {
            lines.push(`  STUCK: ${summary.stuckScore} consecutive no-progress stop(s) on task ${summary.latestHandoff?.selectedTaskId ?? 'unknown'} — investigate or resolve stale claim`);
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
    return lines.join('\n').trimEnd();
}
//# sourceMappingURL=multiAgentStatus.js.map