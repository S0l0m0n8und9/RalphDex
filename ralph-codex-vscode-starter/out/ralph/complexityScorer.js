"use strict";
/**
 * Deterministic task-complexity scoring for model-tier selection.
 *
 * Adopted from Ruflo's smart task-routing pattern, which routes simple tasks to
 * cheaper/faster models and complex or repeatedly-failing tasks to more capable ones.
 *
 * The score is an integer built from observable, evidence-backed signals only —
 * no freeform AI inference.  Higher scores indicate higher complexity.
 *
 * Score → tier mapping (thresholds are configurable via RalphModelTieringConfig):
 *   score < simpleThreshold  → simple model  (e.g. claude-haiku)
 *   score < complexThreshold → medium model  (e.g. claude-sonnet)
 *   score >= complexThreshold → complex model (e.g. claude-opus)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.scoreTaskComplexity = scoreTaskComplexity;
exports.selectModelForTask = selectModelForTask;
function taskDepthInGraph(taskFile, task) {
    let depth = 0;
    let current = task;
    const seen = new Set();
    while (current.parentId && !seen.has(current.parentId)) {
        const parent = taskFile.tasks.find((t) => t.id === current.parentId);
        if (!parent)
            break;
        seen.add(current.parentId);
        depth += 1;
        current = parent;
    }
    return depth;
}
function dependencyCount(task) {
    return (task.dependsOn ?? []).length;
}
const COMPLEX_CLASSIFICATIONS = new Set([
    'blocked',
    'needs_human_review',
    'failed'
]);
function trailingComplexClassificationCount(history, taskId) {
    let count = 0;
    for (let i = history.length - 1; i >= 0; i -= 1) {
        const item = history[i];
        if (item.selectedTaskId !== taskId)
            break;
        if (COMPLEX_CLASSIFICATIONS.has(item.completionClassification)) {
            count += 1;
        }
        else {
            break;
        }
    }
    return count;
}
/**
 * Scores a task's complexity using deterministic, evidence-backed signals.
 *
 * @param task             - The task to score.
 * @param taskFile         - The full task file (for graph inspection).
 * @param iterationHistory - Recent iteration results for this agent.
 */
function scoreTaskComplexity(task, taskFile, iterationHistory) {
    const signals = [];
    // +1 if the task is currently blocked
    if (task.status === 'blocked' || task.blocker) {
        signals.push({ name: 'task_blocked', contribution: 2 });
    }
    // +1 per trailing iteration that ended in a complex classification for this task
    const trailingFails = trailingComplexClassificationCount(iterationHistory, task.id);
    if (trailingFails > 0) {
        const contribution = Math.min(trailingFails, 4); // cap at 4 to avoid runaway
        signals.push({ name: 'trailing_complex_classifications', contribution });
    }
    // +1 per dependency (capped at 3)
    const depCount = Math.min(dependencyCount(task), 3);
    if (depCount > 0) {
        signals.push({ name: 'dependency_count', contribution: depCount });
    }
    // +1 per level of nesting in the task graph (capped at 2)
    const depth = Math.min(taskDepthInGraph(taskFile, task), 2);
    if (depth > 0) {
        signals.push({ name: 'graph_depth', contribution: depth });
    }
    // +1 if the task has a non-trivially long title (proxy for broad scope)
    if (task.title.trim().split(/\s+/).length > 12) {
        signals.push({ name: 'broad_title', contribution: 1 });
    }
    const score = signals.reduce((acc, s) => acc + s.contribution, 0);
    return { score, signals };
}
/**
 * Selects a model ID and optional provider override based on the task's
 * complexity score and the operator's tiering configuration.  Falls back
 * to `fallbackModel` when tiering is disabled.
 */
function selectModelForTask(input) {
    if (!input.tiering.enabled) {
        return { model: input.fallbackModel, score: null };
    }
    const score = scoreTaskComplexity(input.task, input.taskFile, input.iterationHistory);
    let tier;
    if (score.score < input.tiering.simpleThreshold) {
        tier = input.tiering.simple;
    }
    else if (score.score >= input.tiering.complexThreshold) {
        tier = input.tiering.complex;
    }
    else {
        tier = input.tiering.medium;
    }
    return { model: tier.model, provider: tier.provider, score };
}
//# sourceMappingURL=complexityScorer.js.map