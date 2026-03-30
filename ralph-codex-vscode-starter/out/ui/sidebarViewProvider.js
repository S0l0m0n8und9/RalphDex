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
exports.RalphSidebarViewProvider = void 0;
exports.defaultDashboardState = defaultDashboardState;
exports.buildDashboardTasks = buildDashboardTasks;
exports.countTasks = countTasks;
exports.snapshotConfig = snapshotConfig;
const vscode = __importStar(require("vscode"));
const crypto = __importStar(require("crypto"));
const readConfig_1 = require("../config/readConfig");
const sidebarHtml_1 = require("./sidebarHtml");
/**
 * Provides the sidebar webview launcher for Ralph Codex.
 * Registered as a WebviewViewProvider for the `ralphCodex.dashboard` view.
 */
class RalphSidebarViewProvider {
    extensionUri;
    broadcaster;
    static viewType = 'ralphCodex.dashboard';
    view;
    latestState;
    currentPhase = null;
    currentIteration = null;
    broadcastDisposable;
    lastRenderTime = 0;
    constructor(extensionUri, broadcaster) {
        this.extensionUri = extensionUri;
        this.broadcaster = broadcaster;
        this.latestState = defaultDashboardState();
    }
    resolveWebviewView(webviewView, _context, _token) {
        this.view = webviewView;
        webviewView.webview.options = { enableScripts: true };
        // Listen for commands from the webview — with ack feedback
        webviewView.webview.onDidReceiveMessage(async (msg) => {
            if (msg.type === 'command' && msg.command) {
                this.postMessage({ type: 'command-ack', command: msg.command, status: 'started' });
                try {
                    await vscode.commands.executeCommand(msg.command);
                    this.postMessage({ type: 'command-ack', command: msg.command, status: 'done' });
                }
                catch {
                    this.postMessage({ type: 'command-ack', command: msg.command, status: 'error' });
                }
            }
        });
        // Listen for broadcast events
        this.broadcastDisposable?.dispose();
        this.broadcastDisposable = this.broadcaster.onEvent((event) => {
            switch (event.type) {
                case 'phase':
                    this.currentPhase = event.phase;
                    this.currentIteration = event.iteration;
                    // Send lightweight phase update (no full re-render)
                    this.postMessage({ type: 'phase', phase: event.phase, iteration: event.iteration });
                    break;
                case 'loop-start':
                    this.latestState = { ...this.latestState, loopState: 'running', iterationCap: event.iterationCap };
                    this.fullRender();
                    break;
                case 'iteration-start':
                    this.currentPhase = 'inspect';
                    this.currentIteration = event.iteration;
                    this.latestState = {
                        ...this.latestState,
                        loopState: 'running',
                        currentPhase: 'inspect',
                        currentIteration: event.iteration
                    };
                    this.fullRender();
                    break;
                case 'iteration-end':
                case 'loop-end':
                    this.currentPhase = null;
                    this.currentIteration = null;
                    this.latestState = {
                        ...this.latestState,
                        loopState: event.type === 'loop-end' ? (event.stopReason ? 'stopped' : 'idle') : this.latestState.loopState,
                        currentPhase: null,
                        currentIteration: null
                    };
                    this.fullRender();
                    break;
            }
        });
        this.fullRender();
        webviewView.onDidDispose(() => {
            this.broadcastDisposable?.dispose();
            this.broadcastDisposable = undefined;
            this.view = undefined;
        });
    }
    updateFromWatchedState(watched) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        const config = workspaceFolder ? (0, readConfig_1.readConfig)(workspaceFolder) : null;
        const ws = watched.workspaceState;
        const tasks = buildDashboardTasks(watched.taskFile, watched.selectedTaskId);
        const taskCounts = watched.taskFile
            ? countTasks(watched.taskFile)
            : null;
        const recentIterations = (ws?.iterationHistory ?? [])
            .slice(-5)
            .reverse()
            .map((iter) => ({
            iteration: iter.iteration,
            taskId: iter.selectedTaskId,
            taskTitle: iter.selectedTaskTitle,
            classification: iter.completionClassification,
            stopReason: iter.stopReason,
            artifactDir: iter.artifactDir
        }));
        this.latestState = {
            workspaceName: workspaceFolder?.name ?? 'unknown',
            loopState: this.latestState.loopState === 'running' ? 'running' : (ws?.lastIteration?.stopReason ? 'stopped' : 'idle'),
            agentRole: config?.agentRole ?? 'build',
            nextIteration: ws?.nextIteration ?? 1,
            iterationCap: config?.ralphIterationCap ?? 5,
            taskCounts,
            tasks,
            recentIterations,
            preflightReady: true,
            preflightSummary: 'ok',
            diagnostics: [],
            currentPhase: this.currentPhase,
            currentIteration: this.currentIteration,
            config: config ? snapshotConfig(config) : null
        };
        this.fullRender();
    }
    fullRender() {
        if (!this.view) {
            return;
        }
        // Debounce: skip renders within 100ms of last render
        const now = Date.now();
        if (now - this.lastRenderTime < 100) {
            return;
        }
        this.lastRenderTime = now;
        const nonce = crypto.randomBytes(16).toString('hex');
        this.view.webview.html = (0, sidebarHtml_1.buildDashboardHtml)(this.latestState, nonce);
    }
    postMessage(message) {
        void this.view?.webview.postMessage(message);
    }
    dispose() {
        this.broadcastDisposable?.dispose();
    }
}
exports.RalphSidebarViewProvider = RalphSidebarViewProvider;
// ---------------------------------------------------------------------------
// Helpers (exported for reuse by dashboard panel)
// ---------------------------------------------------------------------------
function defaultDashboardState() {
    return {
        workspaceName: 'workspace',
        loopState: 'idle',
        agentRole: 'build',
        nextIteration: 1,
        iterationCap: 5,
        taskCounts: null,
        tasks: [],
        recentIterations: [],
        preflightReady: true,
        preflightSummary: 'ok',
        diagnostics: [],
        currentPhase: null,
        currentIteration: null,
        config: null
    };
}
function buildDashboardTasks(taskFile, selectedTaskId) {
    if (!taskFile) {
        return [];
    }
    const childMap = new Map();
    for (const task of taskFile.tasks) {
        if (task.parentId) {
            const siblings = childMap.get(task.parentId) ?? [];
            siblings.push(task.id);
            childMap.set(task.parentId, siblings);
        }
    }
    return taskFile.tasks.map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        isCurrent: task.id === selectedTaskId,
        priority: task.priority ?? 'normal',
        parentId: task.parentId,
        notes: task.notes,
        blocker: task.blocker,
        validation: task.validation,
        childIds: childMap.get(task.id) ?? [],
        dependsOn: task.dependsOn ?? []
    }));
}
function countTasks(taskFile) {
    const counts = { todo: 0, in_progress: 0, blocked: 0, done: 0 };
    for (const task of taskFile.tasks) {
        if (task.status in counts) {
            counts[task.status]++;
        }
    }
    return counts;
}
function snapshotConfig(config) {
    return {
        cliProvider: config.cliProvider,
        model: config.model,
        agentRole: config.agentRole,
        agentId: config.agentId,
        agentCount: config.agentCount,
        autonomyMode: config.autonomyMode,
        ralphIterationCap: config.ralphIterationCap,
        preferredHandoffMode: config.preferredHandoffMode,
        claudeMaxTurns: config.claudeMaxTurns,
        claudePermissionMode: config.claudePermissionMode,
        copilotApprovalMode: config.copilotApprovalMode,
        reasoningEffort: config.reasoningEffort,
        approvalMode: config.approvalMode,
        sandboxMode: config.sandboxMode,
        scmStrategy: config.scmStrategy,
        gitCheckpointMode: config.gitCheckpointMode,
        noProgressThreshold: config.noProgressThreshold,
        repeatedFailureThreshold: config.repeatedFailureThreshold,
        stopOnHumanReviewNeeded: config.stopOnHumanReviewNeeded,
        clipboardAutoCopy: config.clipboardAutoCopy,
        autoReplenishBacklog: config.autoReplenishBacklog,
        autoReloadOnControlPlaneChange: config.autoReloadOnControlPlaneChange,
        promptBudgetProfile: config.promptBudgetProfile,
        codexCommandPath: config.codexCommandPath,
        claudeCommandPath: config.claudeCommandPath,
        copilotCommandPath: config.copilotCommandPath,
        inspectionRootOverride: config.inspectionRootOverride,
        artifactRetentionPath: config.artifactRetentionPath,
        ralphTaskFilePath: config.ralphTaskFilePath,
        prdPath: config.prdPath,
        progressPath: config.progressPath,
        promptTemplateDirectory: config.promptTemplateDirectory,
        generatedArtifactRetentionCount: config.generatedArtifactRetentionCount,
        provenanceBundleRetentionCount: config.provenanceBundleRetentionCount,
        watchdogStaleTtlMs: config.watchdogStaleTtlMs,
        claimTtlHours: config.claimTtlHours,
        staleLockThresholdMinutes: config.staleLockThresholdMinutes,
        promptPriorContextBudget: config.promptPriorContextBudget,
        scmPrOnParentDone: config.scmPrOnParentDone,
        promptIncludeVerifierFeedback: config.promptIncludeVerifierFeedback,
        validationCommandOverride: config.validationCommandOverride,
        verifierModes: [...config.verifierModes],
        autoApplyRemediation: [...config.autoApplyRemediation],
        customPromptBudget: { ...config.customPromptBudget },
        modelTiering: { ...config.modelTiering },
        hooks: { ...config.hooks },
        openSidebarCommandId: config.openSidebarCommandId,
        newChatCommandId: config.newChatCommandId
    };
}
//# sourceMappingURL=sidebarViewProvider.js.map