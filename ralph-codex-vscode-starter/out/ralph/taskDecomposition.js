"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeWhitespace = normalizeWhitespace;
exports.decomposePhrase = decomposePhrase;
exports.isClearlyCompoundTask = isClearlyCompoundTask;
exports.deriveCompoundSegments = deriveCompoundSegments;
exports.buildDecompositionProposal = buildDecompositionProposal;
exports.remediationSuggestedChildTasks = remediationSuggestedChildTasks;
exports.normalizeRemediationForTask = normalizeRemediationForTask;
exports.remediationMatchesStopReason = remediationMatchesStopReason;
exports.remediationHistoryEntries = remediationHistoryEntries;
exports.buildRemediationArtifact = buildRemediationArtifact;
exports.remediationRationale = remediationRationale;
exports.remediationSummary = remediationSummary;
const taskFile_1 = require("./taskFile");
const MAX_REMEDIATION_CHILD_TASKS = 3;
function normalizeWhitespace(value) {
    return value.replace(/\s+/g, ' ').trim();
}
function decomposePhrase(value) {
    return value
        .replace(/^(add|implement|build|create|fix|update|improve|refactor)\s+/i, '')
        .replace(/\s+for\s+/i, ' for ')
        .trim();
}
function isClearlyCompoundTask(task) {
    const title = normalizeWhitespace(task.title.toLowerCase());
    const notes = normalizeWhitespace(task.notes?.toLowerCase() ?? '');
    const combined = [title, notes].filter(Boolean).join(' ');
    return /\b(and|plus|along with|together with|then)\b/.test(combined)
        || title.includes(',')
        || /\bfrom\b.+\bthrough\b/.test(combined)
        || /\bsmall proposed child-task set with dependencies\b/.test(combined);
}
function deriveCompoundSegments(task) {
    const normalizedTitle = normalizeWhitespace(task.title);
    const segments = normalizedTitle
        .split(/\s+(?:and|plus|along with|together with|then)\s+/i)
        .map((segment) => decomposePhrase(segment))
        .filter((segment) => segment.length > 0);
    if (segments.length >= 2) {
        return segments.slice(0, MAX_REMEDIATION_CHILD_TASKS);
    }
    const notes = normalizeWhitespace(task.notes ?? '');
    if (notes) {
        const noteSegments = notes
            .split(/[.;]/)
            .map((segment) => normalizeWhitespace(segment))
            .filter((segment) => /\b(generate|keep|limit|propose|dependency|deterministic|verification)\b/i.test(segment))
            .slice(0, MAX_REMEDIATION_CHILD_TASKS);
        if (noteSegments.length >= 2) {
            return noteSegments.map((segment) => decomposePhrase(segment));
        }
    }
    return [];
}
function buildDecompositionProposal(task, result) {
    if (!isClearlyCompoundTask(task)) {
        return [];
    }
    const validation = result.verification.effectiveValidationCommand ?? task.validation ?? null;
    const inheritedDependencies = (task.dependsOn ?? []).map((taskId) => ({
        taskId,
        reason: 'inherits_parent_dependency'
    }));
    const taskPrefix = task.id;
    const segments = deriveCompoundSegments(task);
    const seedSegments = segments.length >= 2
        ? segments
        : [
            'reproduce the blocker with a deterministic verification target',
            'implement the smallest bounded fix for that reproduced blocker',
            'rerun verification and capture the bounded evidence'
        ];
    const limitedSegments = seedSegments.slice(0, MAX_REMEDIATION_CHILD_TASKS);
    return limitedSegments.map((segment, index) => ({
        id: `${taskPrefix}.${index + 1}`,
        title: segment.charAt(0).toUpperCase() + segment.slice(1),
        parentId: task.id,
        dependsOn: [
            ...inheritedDependencies,
            ...(index === 0 ? [] : [{ taskId: `${taskPrefix}.${index}`, reason: 'blocks_sequence' }])
        ],
        validation,
        rationale: index === 0
            ? `Narrow ${task.id} to a deterministic first step before retrying the parent task.`
            : `Keep the proposal one level deep by sequencing the next bounded step after ${taskPrefix}.${index}.`
    }));
}
function remediationSuggestedChildTasks(taskFile, result) {
    const selectedTask = (0, taskFile_1.findTaskById)(taskFile, result.selectedTaskId);
    const validationSignature = result.verification.validationFailureSignature;
    switch (result.remediation?.action) {
        case 'decompose_task':
            return selectedTask ? buildDecompositionProposal(selectedTask, result) : [];
        case 'reframe_task':
            return selectedTask
                ? [{
                        id: `${selectedTask.id}.1`,
                        title: `Reproduce and explain the validation failure for ${selectedTask.id}`,
                        parentId: selectedTask.id,
                        dependsOn: (selectedTask.dependsOn ?? []).map((taskId) => ({
                            taskId,
                            reason: 'inherits_parent_dependency'
                        })),
                        validation: result.verification.effectiveValidationCommand ?? selectedTask.validation ?? null,
                        rationale: validationSignature
                            ? `Focus the retry on the repeated validation signature ${validationSignature}.`
                            : `Focus the retry on a single deterministic failure for ${selectedTask.id}.`
                    }]
                : [];
        case 'mark_blocked':
            return selectedTask
                ? [{
                        id: `${selectedTask.id}.1`,
                        title: `Capture the missing unblocker for ${selectedTask.id}`,
                        parentId: selectedTask.id,
                        dependsOn: (selectedTask.dependsOn ?? []).map((taskId) => ({
                            taskId,
                            reason: 'inherits_parent_dependency'
                        })),
                        validation: null,
                        rationale: `Document the external dependency or precondition before retrying ${selectedTask.id}.`
                    }]
                : [];
        default:
            return [];
    }
}
function normalizeRemediationForTask(taskFile, result) {
    const remediation = result.remediation;
    if (!remediation) {
        return null;
    }
    if (remediation.action !== 'decompose_task') {
        return remediation;
    }
    const suggestedChildTasks = remediationSuggestedChildTasks(taskFile, result);
    if (suggestedChildTasks.length > 0) {
        return remediation;
    }
    return {
        ...remediation,
        action: 'no_action',
        humanReviewRecommended: false,
        summary: `Task ${result.selectedTaskId ?? 'none'} repeated the same stop condition ${remediation.attemptCount} times, but the recorded evidence does not justify an automatic remediation change.`
    };
}
function remediationMatchesStopReason(result, stopReason, currentSignature) {
    if (!stopReason || !result.selectedTaskId) {
        return false;
    }
    if (stopReason === 'repeated_no_progress') {
        return result.completionClassification === 'no_progress';
    }
    if (stopReason === 'repeated_identical_failure') {
        if (result.completionClassification === 'blocked') {
            return true;
        }
        return ['blocked', 'failed', 'needs_human_review'].includes(result.completionClassification)
            && result.verification.validationFailureSignature !== null
            && result.verification.validationFailureSignature === currentSignature;
    }
    return false;
}
function remediationHistoryEntries(currentResult, previousIterations) {
    const stopReason = currentResult.stopReason;
    const taskId = currentResult.selectedTaskId;
    if (!currentResult.remediation || !stopReason || !taskId) {
        return [];
    }
    const history = [...previousIterations, currentResult];
    const collected = [];
    const currentSignature = currentResult.verification.validationFailureSignature;
    for (let index = history.length - 1; index >= 0; index -= 1) {
        const entry = history[index];
        if (entry.selectedTaskId !== taskId || !remediationMatchesStopReason(entry, stopReason, currentSignature)) {
            break;
        }
        collected.push({
            iteration: entry.iteration,
            completionClassification: entry.completionClassification,
            executionStatus: entry.executionStatus,
            verificationStatus: entry.verificationStatus,
            stopReason: entry.stopReason,
            summary: entry.summary,
            validationFailureSignature: entry.verification.validationFailureSignature,
            noProgressSignals: entry.noProgressSignals
        });
    }
    return collected.reverse();
}
function buildRemediationArtifact(input) {
    if (!input.result.remediation || !input.result.stopReason) {
        return null;
    }
    return {
        schemaVersion: 1,
        kind: 'taskRemediation',
        provenanceId: input.result.provenanceId ?? null,
        iteration: input.result.iteration,
        selectedTaskId: input.result.selectedTaskId,
        selectedTaskTitle: input.result.selectedTaskTitle,
        trigger: input.result.remediation.trigger,
        attemptCount: input.result.remediation.attemptCount,
        action: input.result.remediation.action,
        humanReviewRecommended: input.result.remediation.humanReviewRecommended,
        summary: input.result.remediation.summary,
        rationale: remediationRationale(input.result),
        proposedAction: input.result.remediation.summary,
        evidence: input.result.remediation.evidence,
        triggeringHistory: remediationHistoryEntries(input.result, input.previousIterations),
        suggestedChildTasks: remediationSuggestedChildTasks(input.taskFile, input.result),
        artifactDir: input.artifactDir,
        iterationResultPath: input.iterationResultPath,
        createdAt: input.createdAt
    };
}
function remediationRationale(result) {
    if (!result.remediation) {
        return 'No remediation proposal was recorded.';
    }
    switch (result.remediation.action) {
        case 'decompose_task':
            return 'Ralph saw repeated same-task attempts with no relevant file changes and no durable task/progress movement.';
        case 'reframe_task':
            return 'Ralph saw the same validation-backed failure signature repeat on the same selected task.';
        case 'mark_blocked':
            return 'Ralph saw the selected task remain blocked across consecutive attempts.';
        case 'request_human_review':
            return 'Ralph saw the same selected task fail repeatedly without evidence for a safe automatic retry strategy.';
        case 'no_action':
        default:
            return 'Ralph saw repeated stop evidence, but the recorded signals did not justify a stronger automatic remediation.';
    }
}
function remediationSummary(result) {
    return result.remediation?.summary ?? null;
}
//# sourceMappingURL=taskDecomposition.js.map