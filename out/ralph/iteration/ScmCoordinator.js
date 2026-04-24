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
exports.ScmCoordinator = void 0;
const fs = __importStar(require("fs/promises"));
const iterationScm_1 = require("../iterationScm");
const taskFile_1 = require("../taskFile");
const error_1 = require("../../util/error");
class ScmCoordinator {
    logger;
    constructor(logger) {
        this.logger = logger;
    }
    async prepareExecutionWorkspace(prepared) {
        if (prepared.config.scmStrategy !== 'branch-per-task') {
            return;
        }
        await (0, iterationScm_1.prepareBranchPerTaskExecutionWorkspace)(prepared);
    }
    async reconcileBranchPerTask(input) {
        const warnings = [];
        let autoReviewContext;
        if (input.prepared.config.scmStrategy === 'branch-per-task'
            && input.completionReconciliation.selectedTask?.status === 'done'
            && input.prepared.selectedTask) {
            const taskFileAfterCompletion = (0, taskFile_1.parseTaskFile)(await fs.readFile(input.prepared.paths.taskFilePath, 'utf8'));
            let conflictResolver;
            if (input.prepared.config.autoScmOnConflict && input.runConflictResolverIteration) {
                const retryLimit = input.prepared.config.scmConflictRetryLimit;
                conflictResolver = async (ctx) => {
                    for (let attempt = 0; attempt < retryLimit; attempt++) {
                        const scmRun = await input.runConflictResolverIteration(ctx.taskId);
                        if (scmRun.executionStatus === 'failed') {
                            break;
                        }
                        const resolverHandledConflict = scmRun.selectedTaskId === ctx.taskId
                            && scmRun.completionReportStatus === 'applied';
                        if (!resolverHandledConflict) {
                            continue;
                        }
                        const remaining = await (0, iterationScm_1.listGitConflictPaths)(ctx.rootPath);
                        if (remaining.length === 0) {
                            return { resolved: true };
                        }
                    }
                    return { resolved: false };
                };
            }
            const branchScm = await (0, iterationScm_1.reconcileBranchPerTaskScm)({
                prepared: input.prepared,
                validationStatus: input.validationStatus,
                taskFileAfter: taskFileAfterCompletion,
                conflictResolver
            });
            warnings.push(...branchScm.warnings);
            if (branchScm.parentCompletedAndMerged && branchScm.parentTask) {
                autoReviewContext = {
                    parentTaskId: branchScm.parentTask.id,
                    parentTaskTitle: branchScm.parentTask.title
                };
            }
        }
        return {
            warnings,
            autoReviewContext
        };
    }
    async commitOnDoneIfNeeded(input) {
        const warnings = [];
        if (input.prepared.config.scmStrategy === 'commit-on-done'
            && input.selectedTaskCompleted
            && input.prepared.selectedTask) {
            try {
                warnings.push(await (0, iterationScm_1.commitOnDone)({
                    rootPath: input.prepared.rootPath,
                    taskId: input.prepared.selectedTask.id,
                    taskTitle: input.prepared.selectedTask.title,
                    agentId: input.prepared.config.agentId,
                    iteration: input.prepared.iteration,
                    validationStatus: input.validationStatus
                }));
            }
            catch (error) {
                warnings.push(`SCM commit-on-done failed for ${input.prepared.selectedTask.id}: ${(0, error_1.toErrorMessage)(error)}`);
                this.logger.warn('SCM commit-on-done failed.', {
                    taskId: input.prepared.selectedTask.id,
                    iteration: input.prepared.iteration,
                    error: (0, error_1.toErrorMessage)(error)
                });
            }
        }
        return warnings;
    }
}
exports.ScmCoordinator = ScmCoordinator;
//# sourceMappingURL=ScmCoordinator.js.map