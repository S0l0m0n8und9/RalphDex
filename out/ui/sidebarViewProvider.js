"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RalphSidebarViewProvider = void 0;
exports.defaultDashboardState = defaultDashboardState;
exports.buildDashboardTasks = buildDashboardTasks;
exports.countTasks = countTasks;
exports.snapshotConfig = snapshotConfig;
const settingsSurface_1 = require("../config/settingsSurface");
const sidebarHtml_1 = require("./sidebarHtml");
const dashboardHost_1 = require("../webview/dashboardHost");
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
    static viewType = 'ralphCodex.dashboard';
    host;
    constructor(extensionUri, broadcaster, loadSnapshot) {
        this.extensionUri = extensionUri;
        this.broadcaster = broadcaster;
        this.loadSnapshot = loadSnapshot;
    }
    resolveWebviewView(webviewView, _context, _token) {
        webviewView.webview.options = { enableScripts: true };
        // Dispose any previous host before creating a new one (VS Code may call
        // resolveWebviewView again if the view is hidden and re-shown).
        this.host?.dispose();
        this.host = new dashboardHost_1.DashboardHost(webviewView.webview, this.broadcaster, sidebarHtml_1.buildDashboardHtml, this.loadSnapshot);
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
        viewIntent: null
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