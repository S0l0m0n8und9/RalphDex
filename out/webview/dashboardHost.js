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
exports.DashboardHost = void 0;
const vscode = __importStar(require("vscode"));
const crypto = __importStar(require("crypto"));
const fs = __importStar(require("node:fs/promises"));
const path = __importStar(require("node:path"));
const readConfig_1 = require("../config/readConfig");
const sidebarViewProvider_1 = require("../ui/sidebarViewProvider");
const MessageBridge_1 = require("./MessageBridge");
const webviewConfigSync_1 = require("../ui/webviewConfigSync");
/**
 * Shared dashboard controller used by both the editor-panel and the sidebar.
 *
 * Owns the broadcast subscription, state assembly, MessageBridge wiring, and
 * debounced HTML render. Callers supply the webview and an HTML builder so
 * each surface can use its own layout without duplicating event-handling logic.
 */
class DashboardHost {
    webview;
    renderFn;
    loadSnapshot;
    actions;
    latestState;
    agentLanesMap = new Map();
    lastRenderTime = 0;
    configSync = new webviewConfigSync_1.WebviewConfigSync();
    bridge;
    broadcastDisposable;
    snapshotLoadGeneration = 0;
    newSettingKeys;
    constructor(webview, broadcaster, renderFn, loadSnapshot, initialViewIntent = null, actions = {}) {
        this.webview = webview;
        this.renderFn = renderFn;
        this.loadSnapshot = loadSnapshot;
        this.actions = actions;
        this.latestState = (0, sidebarViewProvider_1.defaultDashboardState)();
        this.newSettingKeys = [...(initialViewIntent?.newSettingKeys ?? [])];
        // Eagerly populate config so settings are visible on first render.
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
            const initialConfig = (0, readConfig_1.readConfig)(workspaceFolder);
            this.latestState = {
                ...this.latestState,
                settingsSurface: (0, sidebarViewProvider_1.snapshotConfig)(initialConfig, { newSettingKeys: this.newSettingKeys }),
                viewIntent: initialViewIntent
            };
        }
        this.bridge = new MessageBridge_1.MessageBridge(webview);
        this.bridge.onMessage(async (msg) => {
            if (msg.type === 'command' && msg.command) {
                this.bridge.send({ type: 'command-ack', command: msg.command, status: 'started' });
                try {
                    await this.configSync.whenIdle();
                    await vscode.commands.executeCommand(msg.command);
                    this.bridge.send({ type: 'command-ack', command: msg.command, status: 'done' });
                }
                catch {
                    this.bridge.send({ type: 'command-ack', command: msg.command, status: 'error' });
                }
            }
            if (msg.type === 'open-iteration-artifact') {
                await this.openIterationArtifact(msg.artifactDir);
            }
            if (msg.type === 'update-setting') {
                const wsFolder = vscode.workspace.workspaceFolders?.[0];
                await this.configSync.enqueueSettingUpdate(msg.key, msg.value);
                if (wsFolder) {
                    const freshConfig = (0, readConfig_1.readConfig)(wsFolder);
                    this.latestState = {
                        ...this.latestState,
                        settingsSurface: (0, sidebarViewProvider_1.snapshotConfig)(freshConfig, { newSettingKeys: this.newSettingKeys })
                    };
                    // Do NOT fullRender() here — the user's input already shows the new
                    // value; a full HTML replace would destroy focus and cursor position.
                    // The updated latestState will be picked up by the next natural render.
                }
            }
            if (msg.type === 'seed-tasks') {
                await this.handleSeedTasksMessage(msg.requestText, msg.source);
            }
        });
        this.broadcastDisposable = broadcaster.onEvent((event) => {
            this.handleBroadcast(event);
        });
        this.fullRender();
        void this.refreshDashboardSnapshot();
    }
    /** Updates state from file-watcher changes and triggers a full render. */
    updateFromWatchedState(watched) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        const config = workspaceFolder ? (0, readConfig_1.readConfig)(workspaceFolder) : null;
        const ws = watched.workspaceState;
        const tasks = (0, sidebarViewProvider_1.buildDashboardTasks)(watched.taskFile, watched.selectedTaskId);
        const taskCounts = watched.taskFile ? (0, sidebarViewProvider_1.countTasks)(watched.taskFile) : null;
        const recentIterations = (ws?.iterationHistory ?? [])
            .slice(-5)
            .reverse()
            .map((iter) => ({
            iteration: iter.iteration,
            taskId: iter.selectedTaskId,
            taskTitle: iter.selectedTaskTitle,
            classification: iter.completionClassification,
            stopReason: iter.stopReason,
            artifactDir: iter.artifactDir,
            agentId: iter.agentId,
            selectedModel: iter.selectedModel,
            effectiveTier: iter.effectiveTier
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
            agentLanes: this.getLanes(),
            settingsSurface: config ? (0, sidebarViewProvider_1.snapshotConfig)(config, { newSettingKeys: this.newSettingKeys }) : null,
            dashboardSnapshot: this.latestState.dashboardSnapshot,
            snapshotStatus: this.latestState.snapshotStatus ?? { phase: 'idle', errorMessage: null },
            taskSeeding: this.latestState.taskSeeding,
            viewIntent: this.latestState.viewIntent,
            prdExists: watched.prdExists
        };
        this.fullRender();
        void this.refreshDashboardSnapshot();
    }
    async handleSeedTasksMessage(requestText, source) {
        const trimmedRequest = requestText.trim();
        if (!trimmedRequest) {
            const message = 'Enter an epic or feature request before seeding tasks.';
            this.latestState = {
                ...this.latestState,
                taskSeeding: {
                    phase: 'error',
                    requestText,
                    createdTaskCount: null,
                    message,
                    artifactPath: null
                }
            };
            this.bridge.send({ type: 'seed-tasks-result', status: 'error', source, message });
            this.fullRender(true);
            return;
        }
        if (!this.actions.seedTasks) {
            const message = 'Task seeding is unavailable because the dashboard host has no seeding action configured.';
            this.latestState = {
                ...this.latestState,
                taskSeeding: {
                    phase: 'error',
                    requestText: trimmedRequest,
                    createdTaskCount: null,
                    message,
                    artifactPath: null
                }
            };
            this.bridge.send({ type: 'seed-tasks-result', status: 'error', source, message });
            this.fullRender(true);
            return;
        }
        this.latestState = {
            ...this.latestState,
            taskSeeding: {
                phase: 'submitting',
                requestText: trimmedRequest,
                createdTaskCount: null,
                message: `Seeding tasks from ${source === 'panel' ? 'dashboard' : 'sidebar'} request...`,
                artifactPath: null
            }
        };
        this.bridge.send({ type: 'seed-tasks-result', status: 'started', source, message: this.latestState.taskSeeding.message ?? undefined });
        this.fullRender(true);
        try {
            const seeded = await this.actions.seedTasks(trimmedRequest);
            const message = `Seeded ${seeded.createdTaskCount} task(s).`;
            this.latestState = {
                ...this.latestState,
                taskSeeding: {
                    phase: 'success',
                    requestText: trimmedRequest,
                    createdTaskCount: seeded.createdTaskCount,
                    message,
                    artifactPath: seeded.artifactPath
                }
            };
            this.bridge.send({
                type: 'seed-tasks-result',
                status: 'done',
                source,
                createdTaskCount: seeded.createdTaskCount,
                artifactPath: seeded.artifactPath,
                message
            });
            this.fullRender(true);
            await this.refreshDashboardSnapshot();
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.latestState = {
                ...this.latestState,
                taskSeeding: {
                    phase: 'error',
                    requestText: trimmedRequest,
                    createdTaskCount: null,
                    message,
                    artifactPath: null
                }
            };
            this.bridge.send({ type: 'seed-tasks-result', status: 'error', source, message });
            this.fullRender(true);
        }
    }
    applyViewIntent(intent) {
        this.newSettingKeys = [...(intent?.newSettingKeys ?? [])];
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        const refreshedSettings = workspaceFolder
            ? (0, sidebarViewProvider_1.snapshotConfig)((0, readConfig_1.readConfig)(workspaceFolder), { newSettingKeys: this.newSettingKeys })
            : this.latestState.settingsSurface;
        this.latestState = {
            ...this.latestState,
            settingsSurface: refreshedSettings,
            viewIntent: intent
        };
        this.fullRender(true);
    }
    /** Forces a fresh snapshot load and re-renders. Safe to call concurrently — uses a generation counter to drop stale results. */
    async refreshDashboardSnapshot() {
        if (!this.loadSnapshot) {
            return;
        }
        const generation = ++this.snapshotLoadGeneration;
        const currentStatus = this.latestState.snapshotStatus ?? { phase: 'idle', errorMessage: null };
        const nextPhase = currentStatus.phase === 'idle' ? 'loading' : 'refreshing';
        this.latestState = {
            ...this.latestState,
            snapshotStatus: { phase: nextPhase, errorMessage: null }
        };
        this.fullRender(true);
        try {
            const snapshot = await this.loadSnapshot();
            if (generation !== this.snapshotLoadGeneration) {
                return;
            }
            this.latestState = {
                ...this.latestState,
                dashboardSnapshot: snapshot,
                snapshotStatus: { phase: 'ready', errorMessage: null }
            };
            this.fullRender(true);
        }
        catch (error) {
            if (generation !== this.snapshotLoadGeneration) {
                return;
            }
            this.latestState = {
                ...this.latestState,
                snapshotStatus: {
                    phase: 'error',
                    errorMessage: error instanceof Error ? error.message : String(error)
                }
            };
            this.fullRender(true);
        }
    }
    async openIterationArtifact(artifactDir) {
        const summaryPath = path.join(artifactDir, 'summary.md');
        const preflightSummaryPath = path.join(artifactDir, 'preflight-summary.md');
        const target = (await this.pathExists(summaryPath)) ? summaryPath : (await this.pathExists(preflightSummaryPath) ? preflightSummaryPath : null);
        if (!target) {
            return;
        }
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(target));
        await vscode.window.showTextDocument(document, { preview: false });
    }
    async pathExists(candidate) {
        try {
            await fs.access(candidate);
            return true;
        }
        catch {
            return false;
        }
    }
    getLanes() {
        return Array.from(this.agentLanesMap.entries()).map(([agentId, lane]) => ({
            agentId,
            phase: lane.phase,
            iteration: lane.iteration,
            message: lane.message
        }));
    }
    handleBroadcast(event) {
        switch (event.type) {
            case 'phase': {
                const laneKey = event.agentId ?? 'default';
                this.agentLanesMap.set(laneKey, { phase: event.phase, iteration: event.iteration, message: event.message });
                this.latestState = { ...this.latestState, agentLanes: this.getLanes() };
                this.bridge.send({ type: 'phase', phase: event.phase, iteration: event.iteration, agentId: event.agentId, message: event.message });
                break;
            }
            case 'loop-start':
                this.latestState = { ...this.latestState, loopState: 'running', iterationCap: event.iterationCap };
                this.fullRender();
                break;
            case 'iteration-start': {
                const laneKey = event.agentId ?? 'default';
                this.agentLanesMap.set(laneKey, { phase: 'inspect', iteration: event.iteration });
                this.latestState = {
                    ...this.latestState,
                    loopState: 'running',
                    agentLanes: this.getLanes()
                };
                this.fullRender();
                break;
            }
            case 'iteration-end': {
                const laneKey = event.agentId ?? 'default';
                this.agentLanesMap.delete(laneKey);
                this.latestState = {
                    ...this.latestState,
                    agentLanes: this.getLanes()
                };
                this.fullRender();
                break;
            }
            case 'loop-end':
                this.agentLanesMap.clear();
                this.latestState = {
                    ...this.latestState,
                    loopState: event.stopReason ? 'stopped' : 'idle',
                    agentLanes: []
                };
                this.fullRender();
                break;
        }
    }
    fullRender(force = false) {
        // Debounce most renders to avoid repaint churn, but allow critical phase
        // transitions to bypass the window so transient states do not get stuck.
        const now = Date.now();
        if (!force && now - this.lastRenderTime < 100) {
            return;
        }
        this.lastRenderTime = now;
        const nonce = crypto.randomBytes(16).toString('hex');
        this.webview.html = this.renderFn(this.latestState, nonce);
    }
    dispose() {
        this.broadcastDisposable.dispose();
        this.bridge.dispose();
    }
}
exports.DashboardHost = DashboardHost;
//# sourceMappingURL=dashboardHost.js.map