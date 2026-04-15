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
exports.RalphTaskTreeDataProvider = void 0;
const fs = __importStar(require("node:fs/promises"));
const vscode = __importStar(require("vscode"));
const readConfig_1 = require("../config/readConfig");
const pathResolver_1 = require("../ralph/pathResolver");
const planningPass_1 = require("../ralph/planningPass");
const complexityScorer_1 = require("../ralph/complexityScorer");
const deadLetter_1 = require("../ralph/deadLetter");
const failureDiagnostics_1 = require("../ralph/failureDiagnostics");
const taskFile_1 = require("../ralph/taskFile");
class TaskTreeNode extends vscode.TreeItem {
    constructor(label, collapsibleState) {
        super(label, collapsibleState);
    }
}
class TaskGroupItem extends TaskTreeNode {
    groupKind;
    constructor(groupKind, count) {
        let label = '';
        let state = vscode.TreeItemCollapsibleState.Expanded;
        switch (groupKind) {
            case 'todo':
                label = 'To Do';
                break;
            case 'in_progress':
                label = 'In Progress';
                break;
            case 'blocked':
                label = 'Blocked';
                break;
            case 'done':
                label = 'Done';
                state = vscode.TreeItemCollapsibleState.Collapsed;
                break;
            case 'dead-letter':
                label = 'Dead-Letter Queue';
                break;
        }
        super(label, state);
        this.groupKind = groupKind;
        this.description = String(count);
        this.contextValue = `ralph-task-group:${groupKind}`;
    }
}
class TaskRowItem extends TaskTreeNode {
    groupKind;
    taskId;
    constructor(groupKind, taskId, title) {
        super(taskId, vscode.TreeItemCollapsibleState.Collapsed);
        this.groupKind = groupKind;
        this.taskId = taskId;
        this.tooltip = `${taskId}: ${title}`;
        this.contextValue = `ralph-task:${groupKind}`;
    }
}
class DetailItem extends TaskTreeNode {
    constructor(label, description, command) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.description = description;
        this.command = command;
        this.contextValue = 'ralph-task-detail';
    }
}
class MessageItem extends TaskTreeNode {
    constructor(label) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'ralph-task-message';
    }
}
async function readWorkspaceState(stateFilePath) {
    try {
        const parsed = JSON.parse(await fs.readFile(stateFilePath, 'utf8'));
        return parsed && parsed.version === 2 ? parsed : null;
    }
    catch {
        return null;
    }
}
function describeTask(input) {
    const parts = [];
    if (input.groupKind === 'dead-letter') {
        parts.push('dead-letter');
    }
    if (input.task) {
        parts.push(input.task.status);
    }
    if (input.tierLabel) {
        parts.push(`tier: ${input.tierLabel}`);
    }
    if (input.task?.dependsOn?.length) {
        parts.push(`depends: ${input.task.dependsOn.join(', ')}`);
    }
    const claim = input.claimEntry?.canonicalClaim;
    if (claim?.claim) {
        parts.push(`claim: ${claim.claim.agentId}${claim.stale ? ' (stale)' : ''}`);
    }
    if (input.deadLetterEntry) {
        parts.push(`attempts: ${input.deadLetterEntry.recoveryAttemptCount}`);
    }
    if (input.task?.id && input.selectedTaskId === input.task.id) {
        parts.push('selected');
    }
    return parts.join(' | ');
}
class RalphTaskTreeDataProvider {
    workspaceFolder;
    onDidChangeTreeDataEmitter = new vscode.EventEmitter();
    onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
    constructor(workspaceFolder) {
        this.workspaceFolder = workspaceFolder;
    }
    refresh() {
        this.onDidChangeTreeDataEmitter.fire();
    }
    getTreeItem(element) {
        return element;
    }
    async getChildren(element) {
        const snapshot = await this.loadSnapshot();
        if (!element) {
            const activeTasks = snapshot.taskFile
                ? snapshot.taskFile.tasks.filter((task) => !snapshot.deadLetterEntries.has(task.id))
                : [];
            const counts = { todo: 0, in_progress: 0, blocked: 0, done: 0 };
            for (const t of activeTasks) {
                if (t.status === 'todo' || t.status === 'in_progress' || t.status === 'blocked' || t.status === 'done') {
                    counts[t.status]++;
                }
            }
            return [
                new TaskGroupItem('in_progress', counts.in_progress),
                new TaskGroupItem('blocked', counts.blocked),
                new TaskGroupItem('todo', counts.todo),
                new TaskGroupItem('done', counts.done),
                new TaskGroupItem('dead-letter', snapshot.deadLetterOrder.length)
            ];
        }
        if (element instanceof TaskGroupItem) {
            return element.groupKind === 'dead-letter'
                ? this.buildDeadLetterRows(snapshot)
                : this.buildStatusRows(snapshot, element.groupKind);
        }
        if (element instanceof TaskRowItem) {
            return this.buildTaskDetailRows(snapshot, element);
        }
        return [];
    }
    async loadSnapshot() {
        const config = (0, readConfig_1.readConfig)(this.workspaceFolder);
        const paths = (0, pathResolver_1.resolveRalphPaths)(this.workspaceFolder.uri.fsPath, config);
        let taskFile = null;
        try {
            taskFile = (0, taskFile_1.parseTaskFile)(await fs.readFile(paths.taskFilePath, 'utf8'));
        }
        catch {
            taskFile = null;
        }
        const workspaceState = await readWorkspaceState(paths.stateFilePath);
        const selectedTaskId = taskFile
            ? (workspaceState?.lastIteration?.selectedTaskId ?? (0, taskFile_1.selectNextTask)(taskFile)?.id ?? null)
            : null;
        const claimGraph = await (0, taskFile_1.inspectTaskClaimGraph)(paths.claimFilePath).catch(() => null);
        const deadLetterQueue = await (0, deadLetter_1.readDeadLetterQueue)(paths.deadLetterPath).catch(() => null);
        return {
            taskFile,
            selectedTaskId,
            iterationHistory: workspaceState?.iterationHistory ?? [],
            claimEntries: new Map((claimGraph?.tasks ?? []).map((entry) => [entry.taskId, entry])),
            deadLetterEntries: new Map((deadLetterQueue?.entries ?? []).map((entry) => [entry.taskId, entry])),
            deadLetterOrder: (deadLetterQueue?.entries ?? []).map((entry) => entry.taskId),
            simpleThreshold: config.modelTiering.simpleThreshold,
            complexThreshold: config.modelTiering.complexThreshold,
            artifactDir: paths.artifactDir
        };
    }
    buildStatusRows(snapshot, status) {
        if (!snapshot.taskFile) {
            return [new MessageItem('No task file available.')];
        }
        const rows = snapshot.taskFile.tasks
            .filter((task) => task.status === status && !snapshot.deadLetterEntries.has(task.id))
            .map((task) => this.buildTaskRow(snapshot, task, status));
        return rows.length > 0 ? rows : [new MessageItem(`No ${status.replace('_', ' ')} tasks.`)];
    }
    buildDeadLetterRows(snapshot) {
        if (snapshot.deadLetterOrder.length === 0) {
            return [new MessageItem('No tasks are parked in dead-letter.')];
        }
        return snapshot.deadLetterOrder.map((taskId) => {
            const task = snapshot.taskFile?.tasks.find((candidate) => candidate.id === taskId) ?? null;
            const title = task?.title ?? snapshot.deadLetterEntries.get(taskId)?.taskTitle ?? taskId;
            return this.buildTaskRow(snapshot, task ?? {
                id: taskId,
                title,
                status: 'blocked'
            }, 'dead-letter');
        });
    }
    buildTaskRow(snapshot, task, groupKind) {
        const row = new TaskRowItem(groupKind, task.id, task.title);
        const tierInfo = snapshot.taskFile
            ? (0, complexityScorer_1.deriveEffectiveTier)({
                task,
                taskFile: snapshot.taskFile,
                iterationHistory: snapshot.iterationHistory,
                simpleThreshold: snapshot.simpleThreshold,
                complexThreshold: snapshot.complexThreshold
            })
            : null;
        row.description = describeTask({
            task,
            deadLetterEntry: snapshot.deadLetterEntries.get(task.id),
            claimEntry: snapshot.claimEntries.get(task.id),
            selectedTaskId: snapshot.selectedTaskId,
            tierLabel: tierInfo?.tier ?? null,
            groupKind
        });
        row.tooltip = `${task.id}: ${task.title}`;
        return row;
    }
    async buildTaskDetailRows(snapshot, row) {
        const task = snapshot.taskFile?.tasks.find((candidate) => candidate.id === row.taskId) ?? null;
        const deadLetterEntry = snapshot.deadLetterEntries.get(row.taskId);
        const claimEntry = snapshot.claimEntries.get(row.taskId);
        const details = [];
        if (task) {
            const tierInfo = snapshot.taskFile
                ? (0, complexityScorer_1.deriveEffectiveTier)({
                    task,
                    taskFile: snapshot.taskFile,
                    iterationHistory: snapshot.iterationHistory,
                    simpleThreshold: snapshot.simpleThreshold,
                    complexThreshold: snapshot.complexThreshold
                })
                : null;
            details.push(new DetailItem('Task', `${task.title} | status: ${task.status}${tierInfo ? ` | tier: ${tierInfo.tier}` : ''}`));
        }
        if (claimEntry?.canonicalClaim?.claim) {
            const claim = claimEntry.canonicalClaim;
            details.push(new DetailItem('Claim', `${claim.claim.agentId}/${claim.claim.provenanceId} | ${claim.claim.claimedAt}${claim.stale ? ' | stale' : ''}`));
            if (claim.stale) {
                details.push(new DetailItem('Resolve stale claim', 'Run the supported stale-claim recovery command.', {
                    command: 'ralphCodex.resolveStaleTaskClaim',
                    title: 'Resolve Stale Task Claim'
                }));
            }
        }
        const taskPlan = await (0, planningPass_1.readTaskPlan)(snapshot.artifactDir, row.taskId);
        if (taskPlan) {
            const summary = [
                taskPlan.approach || taskPlan.reasoning,
                taskPlan.steps.length > 0 ? `steps: ${taskPlan.steps.slice(0, 2).join(' -> ')}` : null
            ].filter((entry) => Boolean(entry)).join(' | ');
            details.push(new DetailItem('Task plan', summary || 'Task plan artifact present.'));
        }
        const diagnosticPath = (0, failureDiagnostics_1.getFailureAnalysisPath)(snapshot.artifactDir, row.taskId);
        const diagnostic = await fs.readFile(diagnosticPath, 'utf8')
            .then((text) => (0, failureDiagnostics_1.parseFailureDiagnosticResponse)(text))
            .catch(() => null);
        if (diagnostic) {
            details.push(new DetailItem('Diagnostic', `${diagnostic.rootCauseCategory} | ${diagnostic.summary}`));
        }
        if (deadLetterEntry) {
            const lastDiagnostic = deadLetterEntry.diagnosticHistory[deadLetterEntry.diagnosticHistory.length - 1];
            details.push(new DetailItem('Dead-letter summary', `${deadLetterEntry.deadLetteredAt} | attempts: ${deadLetterEntry.recoveryAttemptCount}${lastDiagnostic ? ` | last: ${lastDiagnostic.rootCauseCategory}` : ''}`));
            details.push(new DetailItem('Requeue dead-letter task', 'Run the supported requeue command.', {
                command: 'ralphCodex.requeueDeadLetterTask',
                title: 'Requeue Dead-Letter Task'
            }));
        }
        return details.length > 0 ? details : [new MessageItem('No durable task details recorded yet.')];
    }
}
exports.RalphTaskTreeDataProvider = RalphTaskTreeDataProvider;
//# sourceMappingURL=taskTreeView.js.map