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
exports.buildPrdWizardConfigSelections = buildPrdWizardConfigSelections;
exports.normalizeWizardTasksForPersistence = normalizeWizardTasksForPersistence;
exports.replaceTasksFile = replaceTasksFile;
exports.writePrdWizardDraft = writePrdWizardDraft;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const taskFile_1 = require("../ralph/taskFile");
const fs_1 = require("../util/fs");
function buildPrdWizardConfigSelections(config) {
    const operatorMode = config.operatorMode ?? 'simple';
    return [
        {
            key: 'operatorMode',
            label: 'Operator mode',
            value: operatorMode,
            description: 'Persist the recommended operator preset into workspace settings at confirm time.',
            rationale: operatorMode === config.operatorMode
                ? 'Uses the current workspace preset so future runs stay aligned.'
                : 'Defaults to the supervised preset until the workspace opts into a broader autonomy mode.',
            selected: true
        },
        {
            key: 'cliProvider',
            label: 'CLI provider',
            value: config.cliProvider,
            description: 'Persist the recommended CLI provider into workspace settings at confirm time.',
            rationale: 'Matches the current workspace CLI provider so generation and execution stay on the same backend.',
            selected: true
        }
    ];
}
function normalizeWizardTasksForPersistence(newTasks) {
    if (newTasks.length === 0) {
        throw new Error('Review at least one task before writing tasks.json.');
    }
    const normalizedTasks = newTasks.map((task) => {
        const normalizedId = task.id.trim();
        const normalizedTitle = task.title.trim();
        if (!normalizedId) {
            throw new Error('Each reviewed task must keep a non-empty id before writing tasks.json.');
        }
        if (!normalizedTitle) {
            throw new Error(`Task ${task.id} must have a non-empty title before writing tasks.json.`);
        }
        return {
            id: normalizedId,
            title: normalizedTitle,
            status: task.status,
            ...(task.validation ? { validation: task.validation } : {}),
            ...(task.tier ? { tier: task.tier } : {})
        };
    });
    (0, taskFile_1.parseTaskFile)(JSON.stringify({
        version: 2,
        tasks: normalizedTasks
    }));
    return normalizedTasks;
}
async function replaceTasksFile(tasksPath, newTasks) {
    const locked = await (0, taskFile_1.withTaskFileLock)(tasksPath, undefined, async () => {
        let taskFile = { version: 2, tasks: [] };
        if (await (0, fs_1.pathExists)(tasksPath)) {
            taskFile = (0, taskFile_1.parseTaskFile)(await fs.readFile(tasksPath, 'utf8'));
        }
        const next = (0, taskFile_1.bumpMutationCount)({
            ...taskFile,
            tasks: normalizeWizardTasksForPersistence(newTasks)
        });
        await fs.writeFile(tasksPath, (0, taskFile_1.stringifyTaskFile)(next), 'utf8');
    });
    if (locked.outcome === 'lock_timeout') {
        throw new Error(`Timed out acquiring tasks.json lock at ${locked.lockPath} after ${locked.attempts} attempt(s).`);
    }
}
function selectionSettingKey(selection) {
    return selection.key;
}
function selectionSummary(selection) {
    return `ralphCodex.${selection.key} = ${selection.value}`;
}
async function writePrdWizardDraft(workspaceFolder, draft, paths) {
    await fs.mkdir(path.dirname(paths.prdPath), { recursive: true });
    await fs.writeFile(paths.prdPath, draft.prdText, 'utf8');
    await replaceTasksFile(paths.tasksPath, draft.tasks);
    const filesWritten = [paths.prdPath, paths.tasksPath];
    const settingsUpdated = [];
    const settingsSkipped = [];
    const selectedSkills = draft.recommendedSkills
        .filter((skill) => skill.selected)
        .map(({ selected: _selected, ...skill }) => skill);
    const skippedSkills = draft.recommendedSkills
        .filter((skill) => !skill.selected)
        .map((skill) => `${skill.name} (not selected)`);
    if (selectedSkills.length > 0) {
        await fs.writeFile(paths.recommendedSkillsPath, `${JSON.stringify(selectedSkills, null, 2)}\n`, 'utf8');
        filesWritten.push(paths.recommendedSkillsPath);
    }
    const config = vscode.workspace.getConfiguration('ralphCodex', workspaceFolder.uri);
    for (const selection of draft.configSelections) {
        if (!selection.selected) {
            settingsSkipped.push(`${selectionSummary(selection)} (not selected)`);
            continue;
        }
        await config.update(selectionSettingKey(selection), selection.value, vscode.ConfigurationTarget.Workspace);
        settingsUpdated.push(selectionSummary(selection));
    }
    settingsSkipped.push(...skippedSkills);
    return {
        filesWritten,
        settingsUpdated,
        settingsSkipped
    };
}
//# sourceMappingURL=prdWizardPersistence.js.map