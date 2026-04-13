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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const registerCommands_1 = require("./commands/registerCommands");
const readConfig_1 = require("./config/readConfig");
const settingsSurface_1 = require("./config/settingsSurface");
const logger_1 = require("./services/logger");
const dashboardPanel_1 = require("./ui/dashboardPanel");
const iterationBroadcaster_1 = require("./ui/iterationBroadcaster");
const sidebarViewProvider_1 = require("./ui/sidebarViewProvider");
const stateWatcher_1 = require("./ui/stateWatcher");
const statusBarItem_1 = require("./ui/statusBarItem");
const taskTreeView_1 = require("./ui/taskTreeView");
const WebviewPanelManager_1 = require("./webview/WebviewPanelManager");
const dashboardDataLoader_1 = require("./webview/dashboardDataLoader");
const stateManager_1 = require("./ralph/stateManager");
function activate(context) {
    const logger = new logger_1.Logger(vscode.window.createOutputChannel('Ralphdex'));
    context.subscriptions.push(logger);
    // UI infrastructure
    const broadcaster = new iterationBroadcaster_1.IterationBroadcaster();
    context.subscriptions.push(broadcaster);
    const statusBar = new statusBarItem_1.RalphStatusBar();
    context.subscriptions.push(statusBar);
    const panelManager = new WebviewPanelManager_1.WebviewPanelManager(vscode.window);
    context.subscriptions.push(panelManager);
    const dashboardStateManager = new stateManager_1.RalphStateManager(context.workspaceState, logger);
    const dashboardSnapshotLoader = (0, dashboardDataLoader_1.createDashboardSnapshotLoader)(dashboardStateManager, logger);
    const sidebarProvider = new sidebarViewProvider_1.RalphSidebarViewProvider(context.extensionUri, broadcaster, dashboardSnapshotLoader);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(sidebarViewProvider_1.RalphSidebarViewProvider.viewType, sidebarProvider));
    // Status bar quick-pick command
    context.subscriptions.push(vscode.commands.registerCommand('ralphCodex.statusBarQuickPick', statusBarItem_1.showStatusBarQuickPick));
    // Primary dashboard command — opens the full dashboard in the editor area.
    context.subscriptions.push(vscode.commands.registerCommand('ralphCodex.showDashboard', (viewIntent) => {
        dashboardPanel_1.RalphDashboardPanel.createOrReveal(panelManager, broadcaster, dashboardSnapshotLoader, viewIntent ?? null);
    }));
    // Legacy alias — keeps existing status bar items, sidebar buttons, and any
    // saved key bindings working without a breaking change.
    context.subscriptions.push(vscode.commands.registerCommand('ralphCodex.openDashboard', (viewIntent) => {
        dashboardPanel_1.RalphDashboardPanel.createOrReveal(panelManager, broadcaster, dashboardSnapshotLoader, viewIntent ?? null);
    }));
    // Forces a fresh snapshot reload on the open panel, if any. Idempotent: no-op
    // when no panel is open. Show Status commands call this after revealing the
    // panel to guarantee the operator sees current data rather than a cached view.
    context.subscriptions.push(vscode.commands.registerCommand('ralphCodex.refreshDashboard', () => {
        dashboardPanel_1.RalphDashboardPanel.currentPanel?.refreshSnapshot();
    }));
    // Wire broadcaster events to the status bar.
    // DashboardHost owns its own broadcaster subscription, so the panel and
    // sidebar are updated internally without an extra listener here.
    context.subscriptions.push(broadcaster.onEvent((event) => {
        statusBar.updateFromBroadcast(event);
    }));
    // State watcher — responds to .ralph/ file changes
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceRoot) {
        const primaryWorkspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!primaryWorkspaceFolder) {
            return;
        }
        const taskTreeProvider = new taskTreeView_1.RalphTaskTreeDataProvider(primaryWorkspaceFolder);
        context.subscriptions.push(vscode.window.registerTreeDataProvider('ralphCodex.tasks', taskTreeProvider));
        const watcher = new stateWatcher_1.RalphStateWatcher(workspaceRoot);
        context.subscriptions.push(watcher);
        watcher.onStateChange((state) => {
            statusBar.updateFromWatchedState(state);
            sidebarProvider.updateFromWatchedState(state);
            dashboardPanel_1.RalphDashboardPanel.currentPanel?.updateFromWatchedState(state);
            taskTreeProvider.refresh();
        });
        // Initial read
        void watcher.refresh();
    }
    (0, registerCommands_1.registerCommands)(context, logger, broadcaster, panelManager);
    logger.info('Activated Ralphdex extension.', {
        workspaceTrusted: vscode.workspace.isTrusted,
        activationMode: vscode.workspace.isTrusted ? 'full' : 'limited'
    });
    if (!vscode.workspace.workspaceFolders?.length) {
        logger.info('Effective Ralph autonomy configuration unavailable at activation because no workspace folder is open.');
        return;
    }
    for (const workspaceFolder of vscode.workspace.workspaceFolders) {
        const config = (0, readConfig_1.readConfig)(workspaceFolder);
        logger.info('Effective Ralph autonomy configuration.', {
            workspaceFolder: workspaceFolder.name,
            autonomyMode: config.autonomyMode,
            autoReloadOnControlPlaneChange: config.autoReloadOnControlPlaneChange,
            autoApplyRemediation: config.autoApplyRemediation,
            autoReplenishBacklog: config.autoReplenishBacklog
        });
    }
    void (async () => {
        const persistedState = await (0, settingsSurface_1.readSettingsDiscoveryState)(context.globalState ?? context.workspaceState);
        const metadata = (0, settingsSurface_1.getSettingsSurfaceMetadata)();
        const notice = persistedState ? (0, settingsSurface_1.collectNewSettingsNotice)(metadata, persistedState) : null;
        await (0, settingsSurface_1.writeSettingsDiscoveryState)(context.globalState ?? context.workspaceState, metadata);
        if (!notice) {
            return;
        }
        const choice = await vscode.window.showInformationMessage(notice.message, 'Open Settings Panel');
        if (choice === 'Open Settings Panel') {
            await vscode.commands.executeCommand('ralphCodex.showDashboard', {
                activeTab: 'settings',
                focusSettingKey: notice.focusSettingKey
            });
        }
    })();
}
function deactivate() {
    // no-op
}
//# sourceMappingURL=extension.js.map