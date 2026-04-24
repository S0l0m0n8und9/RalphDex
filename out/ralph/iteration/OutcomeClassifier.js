"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OutcomeClassifier = void 0;
const loopLogic_1 = require("../loopLogic");
const taskFile_1 = require("../taskFile");
function isBacklogExhausted(taskCounts) {
    return taskCounts.todo === 0 && taskCounts.in_progress === 0 && taskCounts.blocked === 0;
}
class OutcomeClassifier {
    classify(input) {
        const verifierResults = [
            input.validationVerification.result,
            input.effectiveFileChangeVerification.result,
            input.taskStateVerification.result
        ];
        const verificationStatus = (0, loopLogic_1.classifyVerificationStatus)(verifierResults.map((item) => item.status));
        const selectedTaskAfter = input.taskStateVerification.selectedTaskAfter
            ?? input.completionReconciliation.selectedTask
            ?? input.prepared.selectedTask;
        const remainingSubtaskList = (0, taskFile_1.remainingSubtasks)(input.afterCoreState.taskFile, input.prepared.selectedTask?.id ?? null);
        const afterTaskCounts = (0, taskFile_1.countTaskStatuses)(input.afterCoreState.taskFile);
        const remainingTaskCount = afterTaskCounts.todo + afterTaskCounts.in_progress + afterTaskCounts.blocked;
        const nextActionableTask = (0, taskFile_1.selectNextTask)(input.afterCoreState.taskFile);
        const outcome = (0, loopLogic_1.classifyIterationOutcome)({
            selectedTaskId: input.prepared.selectedTask?.id ?? null,
            selectedTaskCompleted: input.taskStateVerification.selectedTaskCompleted,
            selectedTaskBlocked: input.taskStateVerification.selectedTaskBlocked,
            humanReviewNeeded: input.taskStateVerification.humanReviewNeeded,
            remainingSubtaskCount: remainingSubtaskList.length,
            remainingTaskCount,
            executionStatus: input.execution.executionStatus,
            verificationStatus,
            validationFailureSignature: input.validationVerification.result.failureSignature ?? null,
            relevantFileChanges: input.relevantFileChangesForOutcome,
            progressChanged: input.taskStateVerification.progressChanged,
            taskFileChanged: input.taskStateVerification.taskFileChanged,
            previousIterations: input.prepared.state.iterationHistory,
            taskMode: input.prepared.selectedTask?.mode
        });
        let completionClassification = outcome.classification;
        let followUpAction = outcome.followUpAction;
        if (!input.prepared.selectedTask) {
            if (isBacklogExhausted(afterTaskCounts)) {
                completionClassification = 'complete';
                followUpAction = 'stop';
            }
            else if (afterTaskCounts.todo === 0 && afterTaskCounts.in_progress === 0 && afterTaskCounts.blocked > 0) {
                completionClassification = 'blocked';
                followUpAction = 'request_human_review';
            }
        }
        const classifiedAt = new Date().toISOString();
        const summary = [
            input.prepared.selectedTask
                ? `Selected ${input.prepared.selectedTask.id}: ${input.prepared.selectedTask.title}`
                : input.prepared.promptKind === 'replenish-backlog'
                    ? 'Replenishing exhausted Ralph backlog.'
                    : 'No actionable Ralph task selected.',
            `Execution: ${input.execution.executionStatus}`,
            `Verification: ${verificationStatus}`,
            `Outcome: ${completionClassification}`,
            `Backlog remaining: ${remainingTaskCount}`
        ].join(' | ');
        const warnings = [
            ...input.execution.executionWarnings,
            ...input.branchPerTaskWarnings,
            ...input.completionReconciliation.warnings,
            ...verifierResults.flatMap((item) => item.warnings)
        ];
        const errors = [
            ...input.execution.executionErrors,
            ...verifierResults.flatMap((item) => item.errors)
        ];
        const result = {
            schemaVersion: 1,
            agentId: input.prepared.config.agentId,
            provenanceId: input.prepared.provenanceId,
            iteration: input.prepared.iteration,
            selectedTaskId: input.prepared.selectedTask?.id ?? null,
            selectedTaskTitle: input.prepared.selectedTask?.title ?? null,
            promptKind: input.prepared.promptKind,
            promptPath: input.prepared.promptPath,
            artifactDir: input.artifactPaths.directory,
            adapterUsed: 'cliExec',
            executionIntegrity: {
                provenanceId: input.prepared.provenanceId,
                promptTarget: input.prepared.executionPlan.promptTarget,
                rootPolicy: input.prepared.rootPolicy,
                templatePath: input.prepared.executionPlan.templatePath,
                reasoningEffort: input.prepared.config.reasoningEffort,
                taskValidationHint: input.prepared.taskValidationHint,
                effectiveValidationCommand: input.prepared.effectiveValidationCommand,
                normalizedValidationCommandFrom: input.prepared.normalizedValidationCommandFrom,
                executionPlanPath: input.prepared.executionPlanPath,
                executionPlanHash: input.prepared.executionPlanHash,
                promptArtifactPath: input.prepared.executionPlan.promptArtifactPath,
                promptHash: input.prepared.executionPlan.promptHash,
                promptByteLength: input.prepared.executionPlan.promptByteLength,
                executionPayloadHash: input.execution.stdinHash,
                executionPayloadMatched: input.execution.stdinHash === null ? null : input.execution.stdinHash === input.prepared.executionPlan.promptHash,
                mismatchReason: input.execution.stdinHash === null
                    ? null
                    : input.execution.stdinHash === input.prepared.executionPlan.promptHash
                        ? null
                        : `Executed stdin hash ${input.execution.stdinHash} did not match planned prompt hash ${input.prepared.executionPlan.promptHash}.`,
                cliInvocationPath: input.execution.invocation ? input.artifactPaths.cliInvocationPath : null
            },
            executionStatus: input.execution.executionStatus,
            verificationStatus,
            completionClassification,
            followUpAction,
            startedAt: input.startedAt,
            finishedAt: new Date().toISOString(),
            phaseTimestamps: {
                ...input.phaseTimestamps,
                classifiedAt
            },
            summary,
            warnings,
            errors,
            execution: {
                exitCode: input.execution.exitCode,
                message: input.prepared.selectedTask ? input.execution.executionErrors[0] ?? undefined : undefined,
                transcriptPath: input.execution.transcriptPath,
                lastMessagePath: input.execution.lastMessagePath,
                stdoutPath: input.artifactPaths.stdoutPath,
                stderrPath: input.artifactPaths.stderrPath
            },
            verification: {
                taskValidationHint: input.prepared.taskValidationHint,
                effectiveValidationCommand: input.prepared.effectiveValidationCommand,
                normalizedValidationCommandFrom: input.prepared.normalizedValidationCommandFrom,
                primaryCommand: input.validationVerification.command ?? null,
                validationFailureSignature: input.validationVerification.result.failureSignature ?? null,
                verifiers: verifierResults
            },
            backlog: {
                remainingTaskCount,
                actionableTaskAvailable: Boolean(nextActionableTask)
            },
            diffSummary: input.fileChangeVerification.diffSummary,
            noProgressSignals: outcome.noProgressSignals,
            remediation: null,
            completionReportStatus: input.completionReconciliation.artifact.status,
            reconciliationWarnings: input.completionReconciliation.warnings,
            stopReason: null,
            selectedModel: input.selectedModel,
            effectiveTier: input.effectiveTier
        };
        return {
            result,
            verifierResults,
            selectedTaskAfter,
            remainingSubtaskList,
            remainingTaskCount,
            nextActionableTask
        };
    }
}
exports.OutcomeClassifier = OutcomeClassifier;
//# sourceMappingURL=OutcomeClassifier.js.map