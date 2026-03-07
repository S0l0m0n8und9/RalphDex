"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.containsHumanReviewMarker = containsHumanReviewMarker;
exports.buildValidationFailureSignature = buildValidationFailureSignature;
exports.classifyVerificationStatus = classifyVerificationStatus;
exports.detectNoProgressSignals = detectNoProgressSignals;
exports.classifyIterationOutcome = classifyIterationOutcome;
exports.decideLoopContinuation = decideLoopContinuation;
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
        && previous?.verification.validationFailureSignature === input.validationFailureSignature) {
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
    const shouldPromoteToNoProgress = classification === 'partial_progress'
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
    return [
        result.completionClassification,
        result.selectedTaskId ?? 'none',
        result.verification.validationFailureSignature ?? 'none'
    ].join('::');
}
function decideLoopContinuation(input) {
    const history = [...input.previousIterations, input.currentResult];
    if (!input.hasActionableTask) {
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
    if (input.currentResult.verificationStatus === 'passed'
        && input.currentResult.selectedTaskId
        && input.currentResult.completionClassification === 'partial_progress'
        && input.remainingSubtaskCount === 0) {
        return {
            shouldContinue: false,
            stopReason: 'verification_passed_no_remaining_subtasks',
            message: 'Verification passed and no remaining subtasks were detected for the selected task.'
        };
    }
    if (input.currentResult.completionClassification === 'needs_human_review' && input.stopOnHumanReviewNeeded) {
        return {
            shouldContinue: false,
            stopReason: 'human_review_needed',
            message: 'The current outcome requires explicit human review.'
        };
    }
    const noProgressCount = countTrailingMatches(history, (item) => item.completionClassification === 'no_progress');
    if (noProgressCount >= input.noProgressThreshold) {
        return {
            shouldContinue: false,
            stopReason: 'repeated_no_progress',
            message: `Detected ${noProgressCount} consecutive no-progress iterations.`
        };
    }
    const currentFailureSignature = failureSignature(input.currentResult);
    if (currentFailureSignature) {
        const repeatedFailureCount = countTrailingMatches(history, (item) => failureSignature(item) === currentFailureSignature);
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
//# sourceMappingURL=loopLogic.js.map