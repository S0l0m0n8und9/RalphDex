"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeWhitespace = normalizeWhitespace;
exports.decomposePhrase = decomposePhrase;
exports.isClearlyCompoundTask = isClearlyCompoundTask;
exports.deriveCompoundSegments = deriveCompoundSegments;
exports.deriveChildAcceptance = deriveChildAcceptance;
exports.buildDecompositionProposal = buildDecompositionProposal;
exports.remediationSuggestedChildTasks = remediationSuggestedChildTasks;
exports.normalizeRemediationForTask = normalizeRemediationForTask;
exports.remediationMatchesStopReason = remediationMatchesStopReason;
exports.remediationHistoryEntries = remediationHistoryEntries;
exports.buildRemediationArtifact = buildRemediationArtifact;
exports.resolveApplicableTaskDecompositionProposal = resolveApplicableTaskDecompositionProposal;
exports.applyTaskDecompositionProposalArtifact = applyTaskDecompositionProposalArtifact;
exports.remediationRationale = remediationRationale;
exports.remediationSummary = remediationSummary;
exports.autoApplyMarkBlockedRemediation = autoApplyMarkBlockedRemediation;
exports.autoApplyDecomposeTaskRemediation = autoApplyDecomposeTaskRemediation;
const fs = __importStar(require("fs/promises"));
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
        || /\b(broad task|needs decomposition|requires decomposition|decompose)\b/.test(combined)
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
/**
 * Derive acceptance criteria for a child task from its title and
 * the parent task's acceptance list. Words from the child title are
 * matched against each parent criterion (case-insensitive). Matching
 * criteria are carried forward; a fallback criterion is appended so
 * the child always has at least one.
 */
function deriveChildAcceptance(childTitle, parentAcceptance) {
    const words = childTitle
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3);
    const matched = parentAcceptance.filter((criterion) => {
        const lower = criterion.toLowerCase();
        return words.some((w) => lower.includes(w));
    });
    const fallback = `${childTitle} is complete and passes validation`;
    return matched.length > 0
        ? [...matched, fallback]
        : [fallback];
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
            'implement the smallest bounded fix for that reproduced blocker'
        ];
    const limitedSegments = seedSegments.slice(0, MAX_REMEDIATION_CHILD_TASKS);
    const parentAcceptance = task.acceptance ?? [];
    return limitedSegments.map((segment, index) => {
        const childTitle = segment.charAt(0).toUpperCase() + segment.slice(1);
        const childAcceptance = deriveChildAcceptance(childTitle, parentAcceptance);
        return {
            id: `${taskPrefix}.${index + 1}`,
            title: childTitle,
            parentId: task.id,
            dependsOn: [
                ...inheritedDependencies,
                ...(index === 0 ? [] : [{ taskId: `${taskPrefix}.${index}`, reason: 'blocks_sequence' }])
            ],
            validation,
            rationale: index === 0
                ? `Narrow ${task.id} to a deterministic first step before retrying the parent task.`
                : `Keep the proposal one level deep by sequencing the next bounded step after ${taskPrefix}.${index}.`,
            acceptance: childAcceptance.length > 0 ? childAcceptance : undefined
        };
    });
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
function resolveApplicableTaskDecompositionProposal(remediationArtifact) {
    if (!remediationArtifact
        || remediationArtifact.action !== 'decompose_task'
        || !remediationArtifact.selectedTaskId
        || remediationArtifact.suggestedChildTasks.length === 0) {
        return null;
    }
    return {
        parentTaskId: remediationArtifact.selectedTaskId,
        suggestedChildTasks: remediationArtifact.suggestedChildTasks
    };
}
async function applyTaskDecompositionProposalArtifact(taskFilePath, remediationArtifact) {
    const proposal = resolveApplicableTaskDecompositionProposal(remediationArtifact);
    if (!proposal) {
        throw new Error('The provided remediation artifact does not contain an applicable task-decomposition proposal.');
    }
    return {
        taskFile: await (0, taskFile_1.applySuggestedChildTasksToFile)(taskFilePath, proposal.parentTaskId, proposal.suggestedChildTasks),
        parentTaskId: proposal.parentTaskId,
        childTaskIds: proposal.suggestedChildTasks.map((task) => task.id)
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
async function autoApplyMarkBlockedRemediation(input) {
    const locked = await (0, taskFile_1.withTaskFileLock)(input.taskFilePath, undefined, async () => {
        const taskFile = (0, taskFile_1.parseTaskFile)(await fs.readFile(input.taskFilePath, 'utf8'));
        const nextTaskFile = {
            ...taskFile,
            tasks: taskFile.tasks.map((task) => (task.id === input.taskId
                ? {
                    ...task,
                    status: 'blocked',
                    blocker: input.blocker
                }
                : task))
        };
        await fs.writeFile(input.taskFilePath, (0, taskFile_1.stringifyTaskFile)(nextTaskFile), 'utf8');
        return nextTaskFile;
    });
    if (locked.outcome === 'lock_timeout') {
        throw new Error(`Timed out acquiring tasks.json lock at ${locked.lockPath} after ${locked.attempts} attempt(s).`);
    }
    const updatedTask = locked.value.tasks.find((task) => task.id === input.taskId);
    if (!updatedTask) {
        throw new Error(`Task ${input.taskId} was not found in tasks.json while auto-applying mark_blocked remediation.`);
    }
    return locked.value;
}
async function autoApplyDecomposeTaskRemediation(input) {
    const applied = await applyTaskDecompositionProposalArtifact(input.taskFilePath, input.remediationArtifact);
    return applied.taskFile;
}
//# sourceMappingURL=taskDecomposition.js.map