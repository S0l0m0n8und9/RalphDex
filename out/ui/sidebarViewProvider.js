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
const settingsSurface_1 = require("../config/settingsSurface");
const dashboardHost_1 = require("../webview/dashboardHost");
const reactWebviewHtml_1 = require("../webview/reactWebviewHtml");
/**
 * Provides the sidebar webview launcher for Ralphdex.
 * Registered as a WebviewViewProvider for the `ralphCodex.dashboard` view.
 *
 * State assembly, broadcast handling, and message wiring are delegated to
 * {@link DashboardHost} so the sidebar and the editor-panel share one
 * implementation.
 */
class RalphSidebarViewProvider {
    extensionUri;
    broadcaster;
    loadSnapshot;
    actions;
    static viewType = 'ralphCodex.dashboard';
    host;
    constructor(extensionUri, broadcaster, loadSnapshot, actions = {}) {
        this.extensionUri = extensionUri;
        this.broadcaster = broadcaster;
        this.loadSnapshot = loadSnapshot;
        this.actions = actions;
    }
    resolveWebviewView(webviewView, _context, _token) {
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'out', 'webview-ui')]
        };
        // Dispose any previous host before creating a new one (VS Code may call
        // resolveWebviewView again if the view is hidden and re-shown).
        this.host?.dispose();
        this.host = new dashboardHost_1.DashboardHost(webviewView.webview, this.broadcaster, (state, nonce, webview) => (0, reactWebviewHtml_1.buildWebviewUiHtml)({ mode: 'sidebar', state, nonce, webview, extensionUri: this.extensionUri }), this.loadSnapshot, null, this.actions);
        webviewView.onDidDispose(() => {
            this.host?.dispose();
            this.host = undefined;
        });
    }
    updateFromWatchedState(watched) {
        this.host?.updateFromWatchedState(watched);
    }
    dispose() {
        this.host?.dispose();
    }
}
exports.RalphSidebarViewProvider = RalphSidebarViewProvider;
// ---------------------------------------------------------------------------
// Helpers (exported for reuse by DashboardHost and tests)
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
        agentLanes: [],
        settingsSurface: null,
        dashboardSnapshot: null,
        snapshotStatus: { phase: 'idle', errorMessage: null },
        taskSeeding: { phase: 'idle', requestText: '', createdTaskCount: null, message: null, artifactPath: null },
        viewIntent: null,
        prdExists: false
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
function snapshotConfig(config, options) {
    return (0, settingsSurface_1.buildSettingsSurfaceSnapshot)(config, options);
}
//# sourceMappingURL=sidebarViewProvider.js.map