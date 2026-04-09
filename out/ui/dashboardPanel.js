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
exports.RalphDashboardPanel = void 0;
const vscode = __importStar(require("vscode"));
const crypto = __importStar(require("crypto"));
const panelHtml_1 = require("./panelHtml");
const sidebarViewProvider_1 = require("./sidebarViewProvider");
const readConfig_1 = require("../config/readConfig");
const webviewConfigSync_1 = require("./webviewConfigSync");
/**
 * Manages a singleton WebviewPanel that shows the full Ralph Codex dashboard
 * in the editor area (centre stage).
 */
class RalphDashboardPanel {
    static viewType = 'ralphCodex.dashboardPanel';
    static currentPanel;
    panel;
    extensionUri;
    broadcaster;
    broadcastDisposable;
    latestState;
    agentLanesMap = new Map();
    lastRenderTime = 0;
    configSync = new webviewConfigSync_1.WebviewConfigSync();
    constructor(panel, extensionUri, broadcaster) {
        this.panel = panel;
        this.extensionUri = extensionUri;
        this.broadcaster = broadcaster;
        this.latestState = (0, sidebarViewProvider_1.defaultDashboardState)();
        // Eagerly populate config so settings are visible on first render
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
            const initialConfig = (0, readConfig_1.readConfig)(workspaceFolder);
            this.latestState = { ...this.latestState, config: (0, sidebarViewProvider_1.snapshotConfig)(initialConfig) };
        }
        panel.webview.options = { enableScripts: true };
        // Listen for commands and settings updates from the webview
        panel.webview.onDidReceiveMessage(async (msg) => {
            if (msg.type === 'command' && msg.command) {
                this.postMessage({ type: 'command-ack', command: msg.command, status: 'started' });
                try {
                    await this.configSync.whenIdle();
                    await vscode.commands.executeCommand(msg.command);
                    this.postMessage({ type: 'command-ack', command: msg.command, status: 'done' });
                }
                catch {
                    this.postMessage({ type: 'command-ack', command: msg.command, status: 'error' });
                }
            }
            if (msg.type === 'update-setting') {
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                await this.configSync.enqueueSettingUpdate(msg.key, msg.value);
                if (workspaceFolder) {
                    const freshConfig = (0, readConfig_1.readConfig)(workspaceFolder);
                    this.latestState = { ...this.latestState, config: (0, sidebarViewProvider_1.snapshotConfig)(freshConfig) };
                    // Do NOT fullRender() here — the user's input already shows the new
                    // value; a full HTML replace would destroy focus and cursor position.
                    // The updated latestState will be picked up by the next natural render.
                }
            }
        });
        // Listen for broadcast events
        this.broadcastDisposable = broadcaster.onEvent((event) => {
            this.handleBroadcast(event);
        });
        // Dispose when the panel is closed
        panel.onDidDispose(() => {
            this.dispose();
        });
        this.fullRender();
    }
    static createOrShow(extensionUri, broadcaster) {
        if (RalphDashboardPanel.currentPanel) {
            RalphDashboardPanel.currentPanel.panel.reveal(vscode.ViewColumn.One);
            return;
        }
        const panel = vscode.window.createWebviewPanel(RalphDashboardPanel.viewType, 'Ralph Codex', vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true });
        RalphDashboardPanel.currentPanel = new RalphDashboardPanel(panel, extensionUri, broadcaster);
    }
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
            agentId: iter.agentId
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
            config: config ? (0, sidebarViewProvider_1.snapshotConfig)(config) : null
        };
        this.fullRender();
    }
    updateFromBroadcast(event) {
        this.handleBroadcast(event);
    }
    getLanes() {
        return Array.from(this.agentLanesMap.entries()).map(([agentId, lane]) => ({
            agentId,
            phase: lane.phase,
            iteration: lane.iteration
        }));
    }
    handleBroadcast(event) {
        switch (event.type) {
            case 'phase': {
                const laneKey = event.agentId ?? 'default';
                this.agentLanesMap.set(laneKey, { phase: event.phase, iteration: event.iteration });
                this.latestState = { ...this.latestState, agentLanes: this.getLanes() };
                this.postMessage({ type: 'phase', phase: event.phase, iteration: event.iteration, agentId: event.agentId });
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
    fullRender() {
        // Debounce: skip renders within 100ms of last render
        const now = Date.now();
        if (now - this.lastRenderTime < 100) {
            return;
        }
        this.lastRenderTime = now;
        const nonce = crypto.randomBytes(16).toString('hex');
        this.panel.webview.html = (0, panelHtml_1.buildPanelDashboardHtml)(this.latestState, nonce);
    }
    postMessage(message) {
        void this.panel.webview.postMessage(message);
    }
    dispose() {
        RalphDashboardPanel.currentPanel = undefined;
        this.broadcastDisposable?.dispose();
        this.panel.dispose();
    }
}
exports.RalphDashboardPanel = RalphDashboardPanel;
//# sourceMappingURL=dashboardPanel.js.map