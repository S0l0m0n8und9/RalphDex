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
exports.reconcileCompletionReport = reconcileCompletionReport;
const fs = __importStar(require("fs/promises"));
const completionReportParser_1 = require("./completionReportParser");
const taskFile_1 = require("./taskFile");
async function reconcileCompletionReport(input) {
    const parsed = (0, completionReportParser_1.parseCompletionReport)(input.lastMessage);
    const artifactBase = {
        schemaVersion: 1,
        kind: 'completionReport',
        status: parsed.status === 'parsed' ? 'rejected' : parsed.status,
        selectedTaskId: input.selectedTask?.id ?? null,
        report: parsed.report,
        rawBlock: parsed.rawBlock,
        parseError: parsed.parseError,
        warnings: []
    };
    if (!input.selectedTask || input.prepared.promptKind === 'replenish-backlog') {
        artifactBase.status = 'missing';
        return {
            artifact: artifactBase,
            selectedTask: input.selectedTask,
            progressChanged: false,
            taskFileChanged: false,
            warnings: []
        };
    }
    if (parsed.status !== 'parsed' || !parsed.report) {
        const warnings = parsed.status === 'invalid' && parsed.parseError
            ? [parsed.parseError]
            : parsed.status === 'missing'
                ? ['No completion report JSON block was found at the end of the Codex last message.']
                : [];
        artifactBase.warnings = warnings;
        return {
            artifact: {
                ...artifactBase,
                warnings
            },
            selectedTask: input.selectedTask,
            progressChanged: false,
            taskFileChanged: false,
            warnings
        };
    }
    const warnings = [];
    if (parsed.report.selectedTaskId !== input.selectedTask.id) {
        warnings.push(`Completion report selectedTaskId ${parsed.report.selectedTaskId} did not match the selected task ${input.selectedTask.id}.`);
        return {
            artifact: {
                ...artifactBase,
                warnings
            },
            selectedTask: input.selectedTask,
            progressChanged: false,
            taskFileChanged: false,
            warnings
        };
    }
    const requestedStatus = parsed.report.requestedStatus;
    if (requestedStatus === 'done') {
        if (input.verificationStatus !== 'passed') {
            warnings.push(`Completion report requested done, but verification status was ${input.verificationStatus}.`);
        }
        if (parsed.report.needsHumanReview) {
            warnings.push('Completion report requested done while also declaring needsHumanReview.');
        }
        if (warnings.length > 0) {
            return {
                artifact: {
                    ...artifactBase,
                    warnings
                },
                selectedTask: input.selectedTask,
                progressChanged: false,
                taskFileChanged: false,
                warnings
            };
        }
    }
    if (requestedStatus === 'blocked' && input.preliminaryClassification === 'complete') {
        warnings.push('Completion report requested blocked, but the preliminary outcome already classified the task as complete.');
        return {
            artifact: {
                ...artifactBase,
                warnings
            },
            selectedTask: input.selectedTask,
            progressChanged: false,
            taskFileChanged: false,
            warnings
        };
    }
    let taskFileChanged = false;
    let progressChanged = false;
    await updateTaskFile(input.taskFilePath, (taskFile) => {
        const selectedTaskUpdated = {
            ...taskFile,
            tasks: taskFile.tasks.map((task) => {
                if (task.id !== input.selectedTask.id) {
                    return task;
                }
                const nextTask = {
                    ...task,
                    status: requestedStatus,
                    notes: parsed.report.progressNote ?? task.notes,
                    blocker: requestedStatus === 'blocked'
                        ? parsed.report.blocker ?? task.blocker
                        : task.blocker
                };
                if (requestedStatus !== 'blocked' && parsed.report.blocker) {
                    nextTask.blocker = parsed.report.blocker;
                }
                taskFileChanged = nextTask.status !== task.status
                    || nextTask.notes !== task.notes
                    || nextTask.blocker !== task.blocker;
                return nextTask;
            })
        };
        if (requestedStatus !== 'done') {
            return selectedTaskUpdated;
        }
        const ancestorCompletion = (0, taskFile_1.autoCompleteSatisfiedAncestors)(selectedTaskUpdated, input.selectedTask.id);
        if (ancestorCompletion.completedAncestorIds.length > 0) {
            taskFileChanged = true;
        }
        return ancestorCompletion.taskFile;
    });
    if (parsed.report.progressNote) {
        await appendProgressBullet(input.prepared.paths.progressPath, parsed.report.progressNote);
        progressChanged = true;
    }
    const selectedTask = (0, taskFile_1.findTaskById)((0, taskFile_1.parseTaskFile)(await fs.readFile(input.taskFilePath, 'utf8')), input.selectedTask.id);
    if (warnings.length > 0) {
        input.logger.warn('Completion report reconciliation recorded warnings.', {
            selectedTaskId: input.selectedTask.id,
            warnings
        });
    }
    return {
        artifact: {
            ...artifactBase,
            status: 'applied',
            warnings
        },
        selectedTask,
        progressChanged,
        taskFileChanged,
        warnings
    };
}
async function updateTaskFile(taskFilePath, transform) {
    const nextTaskFile = transform((0, taskFile_1.parseTaskFile)(await fs.readFile(taskFilePath, 'utf8')));
    await fs.writeFile(taskFilePath, (0, taskFile_1.stringifyTaskFile)(nextTaskFile), 'utf8');
}
async function appendProgressBullet(progressPath, bullet) {
    const trimmed = bullet.trim();
    if (!trimmed) {
        return;
    }
    const current = await fs.readFile(progressPath, 'utf8');
    const nextText = `${current.trimEnd()}\n- ${trimmed}\n`;
    await fs.writeFile(progressPath, nextText, 'utf8');
}
//# sourceMappingURL=reconciliation.js.map