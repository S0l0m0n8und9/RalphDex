"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HEATMAP_WINDOW = exports.STUCK_SCORE_THRESHOLD = void 0;
exports.computeStuckScore = computeStuckScore;
exports.buildNoProgressHeatmap = buildNoProgressHeatmap;
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
//# sourceMappingURL=multiAgentStatus.js.map