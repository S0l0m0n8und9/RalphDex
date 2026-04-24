"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RemediationCoordinator = void 0;
const error_1 = require("../../util/error");
const loopLogic_1 = require("../loopLogic");
const taskDecomposition_1 = require("../taskDecomposition");
class RemediationCoordinator {
    logger;
    constructor(logger) {
        this.logger = logger;
    }
    attachStopRemediation(input) {
        const result = {
            ...input.result,
            warnings: [...input.result.warnings]
        };
        result.remediation = (0, loopLogic_1.buildTaskRemediation)({
            currentResult: result,
            stopReason: input.stopReason,
            previousIterations: input.previousIterations
        });
        result.remediation = (0, taskDecomposition_1.normalizeRemediationForTask)(input.taskFile, result);
        return result;
    }
    async buildAndAutoApply(input) {
        const result = {
            ...input.result,
            warnings: [...input.result.warnings]
        };
        let effectiveTaskFile = input.taskFile;
        const remediationArtifact = (0, taskDecomposition_1.buildRemediationArtifact)({
            result,
            taskFile: input.taskFile,
            previousIterations: input.previousIterations,
            artifactDir: input.artifactPaths.directory,
            iterationResultPath: input.artifactPaths.iterationResultPath,
            createdAt: input.createdAt
        });
        if (result.stopReason === 'repeated_identical_failure'
            && result.remediation?.action === 'mark_blocked'
            && result.selectedTaskId
            && input.autoApplyRemediation.includes('mark_blocked')) {
            try {
                effectiveTaskFile = await (0, taskDecomposition_1.autoApplyMarkBlockedRemediation)({
                    taskFilePath: input.taskFilePath,
                    taskId: result.selectedTaskId,
                    blocker: result.remediation.summary
                });
                result.warnings.push(`Remediation auto-applied: mark_blocked on task ${result.selectedTaskId}`);
                this.logger.info('Auto-applied remediation: mark_blocked.', {
                    taskId: result.selectedTaskId,
                    blocker: result.remediation.summary
                });
            }
            catch (error) {
                result.warnings.push(`Failed to auto-apply remediation mark_blocked on task ${result.selectedTaskId}: ${(0, error_1.toErrorMessage)(error)}`);
                this.logger.warn('Failed to auto-apply remediation: mark_blocked.', {
                    taskId: result.selectedTaskId,
                    blocker: result.remediation.summary,
                    error: (0, error_1.toErrorMessage)(error)
                });
            }
        }
        if (result.remediation?.action === 'decompose_task'
            && result.selectedTaskId
            && input.autoApplyRemediation.includes('decompose_task')) {
            const suggestedChildTasks = remediationArtifact?.suggestedChildTasks ?? [];
            if (suggestedChildTasks.length === 0) {
                result.warnings.push(`Skipped remediation auto-apply for decompose_task on task ${result.selectedTaskId}: no suggested child tasks were available.`);
            }
            else {
                try {
                    effectiveTaskFile = await (0, taskDecomposition_1.autoApplyDecomposeTaskRemediation)({
                        taskFilePath: input.taskFilePath,
                        remediationArtifact: remediationArtifact
                    });
                    result.warnings.push(`Remediation auto-applied: decompose_task on task ${result.selectedTaskId}, added ${suggestedChildTasks.length} child tasks`);
                    this.logger.info('Auto-applied remediation: decompose_task.', {
                        taskId: result.selectedTaskId,
                        childTaskIds: suggestedChildTasks.map((task) => task.id)
                    });
                }
                catch (error) {
                    result.warnings.push(`Failed to auto-apply remediation decompose_task on task ${result.selectedTaskId}: ${(0, error_1.toErrorMessage)(error)}`);
                    this.logger.warn('Failed to auto-apply remediation: decompose_task.', {
                        taskId: result.selectedTaskId,
                        childTaskIds: suggestedChildTasks.map((task) => task.id),
                        error: (0, error_1.toErrorMessage)(error)
                    });
                }
            }
        }
        return {
            result,
            effectiveTaskFile,
            remediationArtifact
        };
    }
}
exports.RemediationCoordinator = RemediationCoordinator;
//# sourceMappingURL=RemediationCoordinator.js.map