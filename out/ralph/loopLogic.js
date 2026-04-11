"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.containsHumanReviewMarker = containsHumanReviewMarker;
exports.normalizeFailureMessage = normalizeFailureMessage;
exports.buildValidationFailureSignature = buildValidationFailureSignature;
exports.classifyVerificationStatus = classifyVerificationStatus;
exports.detectNoProgressSignals = detectNoProgressSignals;
exports.classifyIterationOutcome = classifyIterationOutcome;
exports.buildTaskRemediation = buildTaskRemediation;
exports.decideLoopContinuation = decideLoopContinuation;
exports.shouldRunFailureDiagnostic = shouldRunFailureDiagnostic;
const types_1 = require("./types");
const BACKLOG_REPLENISHMENT_DRIFT_CODES = new Set([
    'ledger_drift',
    'done_parent_unfinished_descendants',
    // inspectTaskGraph emits this code when a parent is marked done while descendants
    // remain open; 'done_parent_unfinished_descendants' was the originally intended
    // name but was never emitted, so both are kept for forward-compatibility.
    'completed_parent_with_incomplete_descendants'
]);
function hasBacklogReplenishmentLedgerDrift(diagnostics) {
    return diagnostics.some((diagnostic) => diagnostic.severity === 'error' && BACKLOG_REPLENISHMENT_DRIFT_CODES.has(diagnostic.code));
}
function uniqueOrdered(values) {
    const seen = new Set();
    const ordered = [];
    for (const value of values) {
        if (!value || seen.has(value)) {
            continue;
        }
        seen.add(value);
        ordered.push(value);
    }
    return ordered;
}
function containsHumanReviewMarker(value) {
    if (!value) {
        return false;
    }
    const normalized = value.toLowerCase();
    return normalized.includes('[human-review-needed]')
        || normalized.includes('human review')
        || normalized.includes('manual review');
}
/**
 * Normalizes a raw validation failure message to a canonical form by stripping
 * surface-level variation (absolute paths, line/column numbers, timestamps,
 * content hashes) that differs across runs even when the underlying root cause
 * is identical.  The normalized form is used exclusively for repeated-failure
 * detection; the original raw text is always preserved in artifacts.
 *
 * Adopted from Ruflo's pattern-based failure routing approach.
 */
function normalizeFailureMessage(raw) {
    return raw
        // ISO timestamps first (must come before line:col so colons inside timestamps
        // are consumed here rather than matching the line:col pattern below)
        .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?/g, '<ts>')
        // Windows-style absolute paths → <path>
        .replace(/[A-Za-z]:\\[^\s]*/g, '<path>')
        // Absolute Unix file paths → <path>
        .replace(/(?:\/[^\s/:]+)+(?:\/[^\s/:]*)?/g, '<path>')
        // Parenthesised "line N" or "line N, col M" references → <loc>
        .replace(/\(\s*line\s+\d+[^)]*\)/gi, '<loc>')
        // Bare "line N" or "line N, col M" word-boundary references → <loc>
        .replace(/\bline\s+\d+(?:[,\s]+col(?:umn)?\s+\d+)?\b/gi, '<loc>')
        // Colon-prefixed line:col references like :42 or :42:10 → <loc>
        // Lookahead: not followed by another digit (handles :42:10: where colon follows)
        .replace(/:\d+(?::\d+)?(?=[^0-9]|$)/g, '<loc>')
        // Hex hashes (8+ chars) → <id>
        .replace(/\b[0-9a-f]{8,64}\b/gi, '<id>')
        // Collapse whitespace
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}
function buildValidationFailureSignature(command, exitCode, stdout, stderr) {
    if (exitCode === null || exitCode === 0) {
        return null;
    }
    const lines = `${stderr}\n${stdout}`
        .split('\n')
        .map((line) => line.trim().replace(/\s+/g, ' '))
        .filter((line) => line.length > 0)
        .slice(0, 3);
    const body = lines.join(' | ').slice(0, 240);
    return [command ?? 'validation', `exit:${exitCode}`, body || 'no output'].join('::');
}
function classifyVerificationStatus(statuses) {
    if (statuses.includes('failed')) {
        return 'failed';
    }
    if (statuses.includes('passed')) {
        return 'passed';
    }
    return 'skipped';
}
function baseClassification(input) {
    if (input.humanReviewNeeded) {
        return 'needs_human_review';
    }
    if (input.selectedTaskBlocked) {
        return 'blocked';
    }
    if (input.executionStatus === 'failed') {
        return 'failed';
    }
    if (input.selectedTaskCompleted) {
        return 'complete';
    }
    if (input.verificationStatus === 'passed'
        || input.relevantFileChanges.length > 0
        || input.progressChanged
        || input.taskFileChanged) {
        return 'partial_progress';
    }
    return 'no_progress';
}
function detectNoProgressSignals(input, currentClassification) {
    const signals = [];
    const previous = input.previousIterations[input.previousIterations.length - 1];
    if (previous?.selectedTaskId && input.selectedTaskId && previous.selectedTaskId === input.selectedTaskId) {
        signals.push('same_task_selected_repeatedly');
    }
    if (input.validationFailureSignature
        && previous?.verification.validationFailureSignature != null
        && normalizeFailureMessage(previous.verification.validationFailureSignature)
            === normalizeFailureMessage(input.validationFailureSignature)) {
        signals.push('same_validation_failure_signature');
    }
    if (input.relevantFileChanges.length === 0) {
        signals.push('no_relevant_file_changes');
    }
    if (!input.progressChanged && !input.taskFileChanged) {
        signals.push('task_and_progress_state_unchanged');
    }
    if (previous?.completionClassification === currentClassification
        && (currentClassification === 'failed' || currentClassification === 'no_progress' || currentClassification === 'blocked')) {
        signals.push('same_failure_classification');
    }
    return uniqueOrdered(signals);
}
function classifyIterationOutcome(input) {
    const classification = baseClassification(input);
    const noProgressSignals = detectNoProgressSignals(input, classification);
    const strongNoProgressSignals = new Set(noProgressSignals);
    // Documentation-mode tasks are never demoted from partial_progress to no_progress
    // because their deliverables (markdown, text) are not captured by code-centric
    // verification signals.  The base classification already gates on progressChanged
    // and taskFileChanged, so only genuine zero-signal iterations stay at no_progress.
    const isDocMode = input.taskMode === 'documentation';
    const shouldPromoteToNoProgress = classification === 'partial_progress'
        && !isDocMode
        && strongNoProgressSignals.has('no_relevant_file_changes')
        && strongNoProgressSignals.has('task_and_progress_state_unchanged')
        && (strongNoProgressSignals.has('same_task_selected_repeatedly')
            || strongNoProgressSignals.has('same_validation_failure_signature'));
    const finalClassification = shouldPromoteToNoProgress ? 'no_progress' : classification;
    if (finalClassification === 'complete') {
        return {
            classification: finalClassification,
            followUpAction: input.remainingSubtaskCount > 0
                ? 'continue_same_task'
                : input.remainingTaskCount > 0
                    ? 'continue_next_task'
                    : 'stop',
            noProgressSignals
        };
    }
    if (finalClassification === 'needs_human_review') {
        return {
            classification: finalClassification,
            followUpAction: 'request_human_review',
            noProgressSignals
        };
    }
    if (finalClassification === 'blocked') {
        return {
            classification: finalClassification,
            followUpAction: 'continue_next_task',
            noProgressSignals
        };
    }
    if (finalClassification === 'failed' || finalClassification === 'no_progress') {
        return {
            classification: finalClassification,
            followUpAction: 'retry_same_task',
            noProgressSignals
        };
    }
    return {
        classification: finalClassification,
        followUpAction: 'continue_same_task',
        noProgressSignals
    };
}
function countTrailingMatches(results, predicate) {
    let count = 0;
    for (let index = results.length - 1; index >= 0; index -= 1) {
        if (!predicate(results[index])) {
            break;
        }
        count += 1;
    }
    return count;
}
function failureSignature(result) {
    if (!['blocked', 'failed', 'needs_human_review'].includes(result.completionClassification)) {
        return null;
    }
    const rawSig = result.verification.validationFailureSignature ?? 'none';
    const normalizedSig = rawSig !== 'none' ? normalizeFailureMessage(rawSig) : 'none';
    return [
        result.completionClassification,
        result.selectedTaskId ?? 'none',
        normalizedSig
    ].join('::');
}
function countTrailingSameTaskClassifications(results, taskId, agentId, classifications) {
    if (!taskId) {
        return 0;
    }
    const allowed = new Set(classifications);
    return countTrailingMatches(results, (item) => item.selectedTaskId === taskId
        && (item.agentId ?? types_1.DEFAULT_RALPH_AGENT_ID) === agentId
        && allowed.has(item.completionClassification));
}
function countTrailingSameTaskFailures(results, taskId, agentId, signature) {
    if (!taskId) {
        return 0;
    }
    return countTrailingMatches(results, (item) => item.selectedTaskId === taskId
        && (item.agentId ?? types_1.DEFAULT_RALPH_AGENT_ID) === agentId
        && failureSignature(item) === signature);
}
function remediationActionForResult(result) {
    if (result.completionClassification === 'blocked') {
        return 'mark_blocked';
    }
    if (result.noProgressSignals.includes('same_validation_failure_signature')) {
        return 'reframe_task';
    }
    if (result.completionClassification === 'failed') {
        return 'request_human_review';
    }
    if (result.noProgressSignals.includes('same_task_selected_repeatedly')
        && result.noProgressSignals.includes('no_relevant_file_changes')) {
        return 'decompose_task';
    }
    return 'no_action';
}
function remediationSummary(action, result, attemptCount) {
    switch (action) {
        case 'reframe_task':
            return `Task ${result.selectedTaskId ?? 'none'} hit the same validation-backed failure pattern ${attemptCount} times; reframe the task around that deterministic failure before rerunning it.`;
        case 'mark_blocked':
            return `Task ${result.selectedTaskId ?? 'none'} remained blocked for ${attemptCount} consecutive iterations; mark it blocked and capture the dependency before retrying.`;
        case 'request_human_review':
            return `Task ${result.selectedTaskId ?? 'none'} failed in the same way ${attemptCount} times; request a human review before another retry.`;
        case 'decompose_task':
            return `Task ${result.selectedTaskId ?? 'none'} made no durable progress across ${attemptCount} consecutive attempts; decompose the task into a smaller deterministic unit before rerunning it.`;
        case 'no_action':
        default:
            return `Task ${result.selectedTaskId ?? 'none'} repeated the same stop condition ${attemptCount} times, but the recorded evidence does not justify an automatic remediation change.`;
    }
}
function buildTaskRemediation(input) {
    const { currentResult, stopReason, previousIterations } = input;
    if (!stopReason || !currentResult.selectedTaskId) {
        return null;
    }
    const history = [...previousIterations, currentResult];
    let attemptCount = 0;
    const agentId = currentResult.agentId ?? types_1.DEFAULT_RALPH_AGENT_ID;
    if (stopReason === 'repeated_no_progress') {
        attemptCount = countTrailingSameTaskClassifications(history, currentResult.selectedTaskId, agentId, ['no_progress']);
    }
    else if (stopReason === 'repeated_identical_failure') {
        if (currentResult.completionClassification === 'blocked') {
            attemptCount = countTrailingSameTaskClassifications(history, currentResult.selectedTaskId, agentId, ['blocked']);
        }
        else {
            const signature = failureSignature(currentResult);
            if (!signature) {
                return null;
            }
            attemptCount = countTrailingSameTaskFailures(history, currentResult.selectedTaskId, agentId, signature);
        }
    }
    else {
        return null;
    }
    if (attemptCount < 2) {
        return null;
    }
    const evidence = uniqueOrdered([
        ...currentResult.noProgressSignals,
        currentResult.completionClassification === 'blocked' ? 'same_task_blocked_repeatedly' : '',
        currentResult.verification.validationFailureSignature
            ? `validation_failure_signature:${currentResult.verification.validationFailureSignature}`
            : '',
        currentResult.stopReason ? `stop_reason:${currentResult.stopReason}` : '',
        `classification:${currentResult.completionClassification}`
    ]);
    const action = remediationActionForResult(currentResult);
    return {
        trigger: stopReason,
        taskId: currentResult.selectedTaskId,
        attemptCount,
        action,
        humanReviewRecommended: action === 'mark_blocked' || action === 'request_human_review',
        summary: remediationSummary(action, currentResult, attemptCount),
        evidence
    };
}
function decideLoopContinuation(input) {
    const history = [...input.previousIterations, input.currentResult];
    const agentId = input.currentResult.agentId ?? types_1.DEFAULT_RALPH_AGENT_ID;
    if (!input.hasActionableTask) {
        const canContinueIntoBacklogReplenishment = input.autoReplenishBacklog
            && input.currentResult.backlog.actionableTaskAvailable === false
            && input.currentResult.backlog.remainingTaskCount === 0
            && input.currentResult.executionStatus !== 'failed'
            && !hasBacklogReplenishmentLedgerDrift(input.preflightDiagnostics);
        if (canContinueIntoBacklogReplenishment) {
            return {
                shouldContinue: true,
                stopReason: null,
                message: 'No actionable Ralph task remains; continuing into backlog replenishment.'
            };
        }
        return {
            shouldContinue: false,
            stopReason: 'no_actionable_task',
            message: 'No executable Ralph task remains.'
        };
    }
    if (input.currentResult.executionStatus === 'failed') {
        return {
            shouldContinue: false,
            stopReason: 'execution_failed',
            message: 'Codex execution failed for the current iteration.'
        };
    }
    if (input.selectedTaskCompleted && input.remainingTaskCount === 0) {
        return {
            shouldContinue: false,
            stopReason: 'task_marked_complete',
            message: 'The selected Ralph task is marked done.'
        };
    }
    if (input.currentResult.completionClassification === 'needs_human_review' && input.stopOnHumanReviewNeeded) {
        return {
            shouldContinue: false,
            stopReason: 'human_review_needed',
            message: 'The current outcome requires explicit human review.'
        };
    }
    const noProgressCount = countTrailingSameTaskClassifications(history, input.currentResult.selectedTaskId, agentId, ['no_progress']);
    if (noProgressCount >= input.noProgressThreshold) {
        return {
            shouldContinue: false,
            stopReason: 'repeated_no_progress',
            message: `Detected ${noProgressCount} consecutive no-progress iterations.`
        };
    }
    const currentFailureSignature = failureSignature(input.currentResult);
    if (currentFailureSignature) {
        const repeatedFailureCount = countTrailingSameTaskFailures(history, input.currentResult.selectedTaskId, agentId, currentFailureSignature);
        if (repeatedFailureCount >= input.repeatedFailureThreshold) {
            return {
                shouldContinue: false,
                stopReason: 'repeated_identical_failure',
                message: `Detected ${repeatedFailureCount} consecutive identical failure classifications.`
            };
        }
    }
    if (input.reachedIterationCap) {
        return {
            shouldContinue: false,
            stopReason: 'iteration_cap_reached',
            message: 'Reached the configured Ralph iteration cap.'
        };
    }
    return {
        shouldContinue: true,
        stopReason: null,
        message: 'Continue to the next Ralph iteration.'
    };
}
/**
 * Returns true when Ralph should run a failure diagnostic pass.
 *
 * The diagnostic is warranted when the loop is stopping due to a blocked task
 * or a failed verifier, and diagnostics are not suppressed by config.
 */
function shouldRunFailureDiagnostic(completionClassification, verificationStatus, mode) {
    if (mode === 'off') {
        return false;
    }
    return completionClassification === 'blocked' || verificationStatus === 'failed';
}
//# sourceMappingURL=loopLogic.js.map