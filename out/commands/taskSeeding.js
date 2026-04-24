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
exports.TaskSeedingCommandError = void 0;
exports.seedTasksFromFeatureRequest = seedTasksFromFeatureRequest;
const fs = __importStar(require("node:fs/promises"));
const readConfig_1 = require("../config/readConfig");
const pathResolver_1 = require("../ralph/pathResolver");
const taskSeeder_1 = require("../ralph/taskSeeder");
const taskCreation_1 = require("../ralph/taskCreation");
const taskFile_1 = require("../ralph/taskFile");
const error_1 = require("../util/error");
const fs_1 = require("../util/fs");
const workspaceSupport_1 = require("./workspaceSupport");
class TaskSeedingCommandError extends Error {
}
exports.TaskSeedingCommandError = TaskSeedingCommandError;
async function seedTasksFromFeatureRequest(workspaceFolder, logger, options) {
    (0, workspaceSupport_1.requireTrustedWorkspace)('Task seeding');
    const config = (0, readConfig_1.readConfig)(workspaceFolder);
    const paths = (0, pathResolver_1.resolveRalphPaths)(workspaceFolder.uri.fsPath, config);
    const tasksPath = paths.taskFilePath;
    if (!(await (0, fs_1.pathExists)(tasksPath))) {
        throw new TaskSeedingCommandError('No .ralph/tasks.json found. Run "Ralphdex: Bootstrap Ralph Workspace" first.');
    }
    const raw = await fs.readFile(tasksPath, 'utf8');
    const taskFile = (0, taskFile_1.parseTaskFile)(raw);
    try {
        const seeded = await (0, taskSeeder_1.seedTasksFromRequest)({
            requestText: options.requestText,
            config,
            cwd: workspaceFolder.uri.fsPath,
            artifactRootDir: paths.artifactDir,
            existingTaskIds: taskFile.tasks.map((task) => task.id)
        });
        await (0, taskCreation_1.appendNormalizedTasksToFile)(tasksPath, seeded.tasks);
        logger.info(`${options.logContext} succeeded.`, {
            taskCount: seeded.tasks.length,
            artifactPath: seeded.artifactPath,
            warnings: seeded.warnings
        });
        return {
            createdTaskCount: seeded.tasks.length,
            tasksPath,
            artifactPath: seeded.artifactPath,
            warnings: seeded.warnings
        };
    }
    catch (error) {
        const message = error instanceof taskSeeder_1.TaskSeedingError
            ? error.message
            : (0, error_1.toErrorMessage)(error);
        logger.info(`${options.logContext} failed. Reason: ${message}`);
        throw new TaskSeedingCommandError(message);
    }
}
//# sourceMappingURL=taskSeeding.js.map