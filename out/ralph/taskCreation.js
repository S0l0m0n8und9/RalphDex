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
exports.normalizeTaskInputsForPersistence = normalizeTaskInputsForPersistence;
exports.appendNormalizedTasksToFile = appendNormalizedTasksToFile;
exports.applySuggestedChildTasksToFile = applySuggestedChildTasksToFile;
exports.replaceTasksFileWithNormalizedTasks = replaceTasksFileWithNormalizedTasks;
const fs = __importStar(require("fs/promises"));
const fs_1 = require("../util/fs");
const taskFile_1 = require("./taskFile");
const taskNormalization_1 = require("./taskNormalization");
function normalizeTaskInputsForPersistence(newTasks) {
    if (newTasks.length === 0) {
        throw new Error('Review at least one task before writing tasks.json.');
    }
    const normalizedTasks = newTasks.map((task) => {
        if (!task.id.trim()) {
            throw new Error('Each reviewed task must keep a non-empty id before writing tasks.json.');
        }
        if (!task.title.trim()) {
            throw new Error(`Task ${task.id} must have a non-empty title before writing tasks.json.`);
        }
        return (0, taskNormalization_1.normalizeNewTask)(task);
    });
    (0, taskFile_1.parseTaskFile)(JSON.stringify({
        version: 2,
        tasks: normalizedTasks
    }));
    return normalizedTasks;
}
async function appendNormalizedTasksToFile(tasksPath, newTasks) {
    if (newTasks.length === 0) {
        return;
    }
    const locked = await (0, taskFile_1.withTaskFileLock)(tasksPath, undefined, async () => {
        const raw = await fs.readFile(tasksPath, 'utf8');
        const taskFile = (0, taskFile_1.parseTaskFile)(raw);
        const next = (0, taskFile_1.bumpMutationCount)({
            ...taskFile,
            tasks: [...taskFile.tasks, ...normalizeTaskInputsForPersistence(newTasks)]
        });
        const nextText = (0, taskFile_1.stringifyTaskFile)(next);
        (0, taskFile_1.parseTaskFile)(nextText);
        await fs.writeFile(tasksPath, nextText, 'utf8');
    });
    if (locked.outcome === 'lock_timeout') {
        throw new Error(`Timed out acquiring tasks.json lock at ${locked.lockPath} after ${locked.attempts} attempt(s).`);
    }
}
/**
 * Producer-facing persistence entry point for task decomposition, remediation,
 * and any future child-task producers. Keeps child creation on the same
 * lock/parse/normalize/write pipeline used by append and replace flows while
 * reusing `applySuggestedChildTasks` for the pure task-graph transform.
 */
async function applySuggestedChildTasksToFile(taskFilePath, parentTaskId, suggestedChildTasks) {
    const locked = await (0, taskFile_1.withTaskFileLock)(taskFilePath, undefined, async () => {
        const currentTaskFile = (0, taskFile_1.parseTaskFile)(await fs.readFile(taskFilePath, 'utf8'));
        const nextTaskFile = (0, taskFile_1.bumpMutationCount)((0, taskFile_1.applySuggestedChildTasks)(currentTaskFile, parentTaskId, suggestedChildTasks));
        await fs.writeFile(taskFilePath, (0, taskFile_1.stringifyTaskFile)(nextTaskFile), 'utf8');
        return (0, taskFile_1.parseTaskFile)(await fs.readFile(taskFilePath, 'utf8'));
    });
    if (locked.outcome === 'lock_timeout') {
        throw new Error(`Timed out acquiring tasks.json lock at ${locked.lockPath} after ${locked.attempts} attempt(s).`);
    }
    return locked.value;
}
async function replaceTasksFileWithNormalizedTasks(tasksPath, newTasks) {
    const locked = await (0, taskFile_1.withTaskFileLock)(tasksPath, undefined, async () => {
        let taskFile = { version: 2, tasks: [] };
        if (await (0, fs_1.pathExists)(tasksPath)) {
            taskFile = (0, taskFile_1.parseTaskFile)(await fs.readFile(tasksPath, 'utf8'));
        }
        const next = (0, taskFile_1.bumpMutationCount)({
            ...taskFile,
            tasks: normalizeTaskInputsForPersistence(newTasks)
        });
        await fs.writeFile(tasksPath, (0, taskFile_1.stringifyTaskFile)(next), 'utf8');
    });
    if (locked.outcome === 'lock_timeout') {
        throw new Error(`Timed out acquiring tasks.json lock at ${locked.lockPath} after ${locked.attempts} attempt(s).`);
    }
}
//# sourceMappingURL=taskCreation.js.map