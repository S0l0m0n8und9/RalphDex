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
function childTaskCount(taskFile, taskId) {
    return taskFile.tasks.filter((candidate) => candidate.parentId === taskId).length;
}
function titleWordCountContribution(title) {
    const wordCount = title.trim() ? title.trim().split(/\s+/).length : 0;
    if (wordCount >= 13) {
        return 1;
    }
    if (wordCount > 0 && wordCount <= 2) {
        return -1;
    }
    return 0;
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
    // +2 if the task declares a validation command
    if (task.validation?.trim()) {
        signals.push({ name: 'has_validation_field', contribution: 2 });
    }
    // +1 per child task (capped at 3)
    const childCount = Math.min(childTaskCount(taskFile, task.id), 3);
    if (childCount > 0) {
        signals.push({ name: 'child_task_count', contribution: childCount });
    }
    // +1 if the task includes a blocker note
    if (task.blocker?.trim()) {
        signals.push({ name: 'has_blocker_note', contribution: 1 });
    }
    // +1 per trailing iteration that ended in a complex classification for this task
    const trailingFails = trailingComplexClassificationCount(iterationHistory, task.id);
    if (trailingFails > 0) {
        const contribution = Math.min(trailingFails, 4); // cap at 4 to avoid runaway
        signals.push({ name: 'trailing_complex_classifications', contribution });
    }
    // Retain title breadth as a weak signal, capped to ±1 contribution.
    const titleContribution = titleWordCountContribution(task.title);
    if (titleContribution !== 0) {
        signals.push({ name: 'title_word_count', contribution: titleContribution });
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
    if (input.task.tier) {
        const tierConfig = input.task.tier === 'simple' ? input.tiering.simple
            : input.task.tier === 'complex' ? input.tiering.complex
                : input.tiering.medium;
        const score = { score: 0, signals: [{ name: 'explicit', contribution: 0 }] };
        return { model: tierConfig.model, provider: tierConfig.provider, score };
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