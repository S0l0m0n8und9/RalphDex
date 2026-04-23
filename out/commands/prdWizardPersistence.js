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
const taskCreation_1 = require("../ralph/taskCreation");
function buildPrdWizardConfigSelections(config) {
    return [
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
    return (0, taskCreation_1.normalizeTaskInputsForPersistence)(newTasks);
}
async function replaceTasksFile(tasksPath, newTasks) {
    await (0, taskCreation_1.replaceTasksFileWithNormalizedTasks)(tasksPath, newTasks);
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
    const config = vscode.workspace.getConfiguration('ralphCodex', workspaceFolder.uri);
    for (const selection of draft.configSelections) {
        if (!selection.selected) {
            settingsSkipped.push(`${selectionSummary(selection)} (not selected)`);
            continue;
        }
        await config.update(selectionSettingKey(selection), selection.value, vscode.ConfigurationTarget.Workspace);
        settingsUpdated.push(selectionSummary(selection));
    }
    return {
        filesWritten,
        settingsUpdated,
        settingsSkipped
    };
}
//# sourceMappingURL=prdWizardPersistence.js.map