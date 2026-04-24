"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VerificationRunner = void 0;
const reviewPolicy_1 = require("../reviewPolicy");
const verifier_1 = require("../verifier");
const loopLogic_1 = require("../loopLogic");
const taskFile_1 = require("../taskFile");
const EMPTY_GIT_STATUS = {
    available: false,
    raw: '',
    entries: []
};
class VerificationRunner {
    async runPreliminaryVerification(input) {
        const afterCoreStateBeforeReconciliation = await (0, verifier_1.captureCoreState)(input.prepared.paths);
        const shouldCaptureGit = input.prepared.config.verifierModes.includes('gitDiff') || input.prepared.config.gitCheckpointMode !== 'off';
        const afterGit = shouldCaptureGit ? await (0, verifier_1.captureGitStatus)(input.prepared.rootPolicy.verificationRootPath) : EMPTY_GIT_STATUS;
        const skipValidationForDocMode = (0, taskFile_1.isDocumentationMode)(input.prepared.selectedTask);
        const validationVerification = input.prepared.config.verifierModes.includes('validationCommand')
            && input.executionStatus === 'succeeded'
            && !skipValidationForDocMode
            ? await (0, verifier_1.runValidationCommandVerifier)({
                command: input.prepared.validationCommand,
                taskValidationHint: input.prepared.taskValidationHint,
                normalizedValidationCommandFrom: input.prepared.normalizedValidationCommandFrom,
                rootPath: input.prepared.rootPolicy.verificationRootPath,
                artifactDir: input.artifactPaths.directory
            })
            : {
                command: input.prepared.validationCommand,
                stdout: '',
                stderr: '',
                exitCode: null,
                result: {
                    verifier: 'validationCommand',
                    status: 'skipped',
                    summary: skipValidationForDocMode
                        ? 'Validation-command verifier skipped for documentation-mode task.'
                        : input.executionStatus === 'succeeded'
                            ? 'Validation-command verifier disabled for this iteration.'
                            : 'Validation-command verifier skipped because Codex execution did not succeed.',
                    warnings: [],
                    errors: [],
                    command: input.prepared.validationCommand ?? undefined
                }
            };
        const shouldRunFileChangeVerifier = input.prepared.selectedTask !== null
            && (input.prepared.config.verifierModes.includes('gitDiff')
                || input.prepared.config.gitCheckpointMode === 'snapshotAndDiff');
        const fileChangeVerification = shouldRunFileChangeVerifier
            ? await (0, verifier_1.runFileChangeVerifier)({
                rootPath: input.prepared.rootPolicy.verificationRootPath,
                artifactDir: input.artifactPaths.directory,
                beforeGit: input.prepared.beforeGit,
                afterGit,
                before: input.prepared.beforeCoreState,
                after: afterCoreStateBeforeReconciliation
            })
            : {
                diffSummary: null,
                result: {
                    verifier: 'gitDiff',
                    status: 'skipped',
                    summary: input.prepared.selectedTask
                        ? 'Git-diff/file-change verifier disabled for this iteration.'
                        : 'Git-diff/file-change verifier skipped because no Ralph task was selected.',
                    warnings: [],
                    errors: []
                }
            };
        const roleAdjustedFileChange = (0, reviewPolicy_1.applyReviewAgentFileChangePolicy)({
            agentRole: input.prepared.config.agentRole,
            fileChangeVerification
        });
        const effectiveFileChangeVerification = roleAdjustedFileChange.fileChangeVerification;
        const relevantFileChangesForOutcome = roleAdjustedFileChange.relevantFileChangesForOutcome;
        const preliminaryVerificationStatus = (0, loopLogic_1.classifyVerificationStatus)([
            validationVerification.result.status,
            effectiveFileChangeVerification.result.status
        ]);
        const preliminaryOutcome = (0, loopLogic_1.classifyIterationOutcome)({
            selectedTaskId: input.prepared.selectedTask?.id ?? null,
            selectedTaskCompleted: false,
            selectedTaskBlocked: false,
            humanReviewNeeded: false,
            remainingSubtaskCount: (0, taskFile_1.remainingSubtasks)(afterCoreStateBeforeReconciliation.taskFile, input.prepared.selectedTask?.id ?? null).length,
            remainingTaskCount: (0, taskFile_1.countTaskStatuses)(afterCoreStateBeforeReconciliation.taskFile).todo
                + (0, taskFile_1.countTaskStatuses)(afterCoreStateBeforeReconciliation.taskFile).in_progress
                + (0, taskFile_1.countTaskStatuses)(afterCoreStateBeforeReconciliation.taskFile).blocked,
            executionStatus: input.executionStatus,
            verificationStatus: preliminaryVerificationStatus,
            validationFailureSignature: validationVerification.result.failureSignature ?? null,
            relevantFileChanges: relevantFileChangesForOutcome,
            progressChanged: input.prepared.beforeCoreState.hashes.progress !== afterCoreStateBeforeReconciliation.hashes.progress,
            taskFileChanged: input.prepared.beforeCoreState.hashes.tasks !== afterCoreStateBeforeReconciliation.hashes.tasks,
            previousIterations: input.prepared.state.iterationHistory,
            taskMode: input.prepared.selectedTask?.mode
        });
        return {
            afterCoreStateBeforeReconciliation,
            afterGit,
            validationVerification,
            fileChangeVerification,
            effectiveFileChangeVerification,
            relevantFileChangesForOutcome,
            preliminaryVerificationStatus,
            preliminaryOutcome
        };
    }
    async runTaskStateVerification(input) {
        return input.prepared.config.verifierModes.includes('taskState')
            ? await (0, verifier_1.runTaskStateVerifier)({
                selectedTaskId: input.prepared.selectedTask?.id ?? null,
                before: input.prepared.beforeCoreState,
                after: input.afterCoreState,
                artifactDir: input.artifactPaths.directory
            })
            : {
                selectedTaskAfter: input.completionReconciliation.selectedTask ?? input.prepared.selectedTask,
                selectedTaskCompleted: false,
                selectedTaskBlocked: false,
                humanReviewNeeded: false,
                progressChanged: input.completionReconciliation.progressChanged,
                taskFileChanged: input.completionReconciliation.taskFileChanged,
                result: {
                    verifier: 'taskState',
                    status: 'skipped',
                    summary: 'Task-state verifier disabled for this iteration.',
                    warnings: [],
                    errors: []
                }
            };
    }
}
exports.VerificationRunner = VerificationRunner;
//# sourceMappingURL=VerificationRunner.js.map