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
const logger_1 = require("./services/logger");
const iterationBroadcaster_1 = require("./ui/iterationBroadcaster");
const sidebarViewProvider_1 = require("./ui/sidebarViewProvider");
const stateWatcher_1 = require("./ui/stateWatcher");
const statusBarItem_1 = require("./ui/statusBarItem");
function activate(context) {
    const logger = new logger_1.Logger(vscode.window.createOutputChannel('Ralph Codex'));
    context.subscriptions.push(logger);
    // UI infrastructure
    const broadcaster = new iterationBroadcaster_1.IterationBroadcaster();
    context.subscriptions.push(broadcaster);
    const statusBar = new statusBarItem_1.RalphStatusBar();
    context.subscriptions.push(statusBar);
    const sidebarProvider = new sidebarViewProvider_1.RalphSidebarViewProvider(context.extensionUri, broadcaster);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(sidebarViewProvider_1.RalphSidebarViewProvider.viewType, sidebarProvider));
    // Status bar quick-pick command
    context.subscriptions.push(vscode.commands.registerCommand('ralphCodex.statusBarQuickPick', statusBarItem_1.showStatusBarQuickPick));
    // Dashboard focus command
    context.subscriptions.push(vscode.commands.registerCommand('ralphCodex.openDashboard', () => {
        void vscode.commands.executeCommand('ralphCodex.dashboard.focus');
    }));
    // Wire broadcaster events to status bar
    context.subscriptions.push(broadcaster.onEvent((event) => statusBar.updateFromBroadcast(event)));
    // State watcher — responds to .ralph/ file changes
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceRoot) {
        const watcher = new stateWatcher_1.RalphStateWatcher(workspaceRoot);
        context.subscriptions.push(watcher);
        watcher.onStateChange((state) => {
            statusBar.updateFromWatchedState(state);
            sidebarProvider.updateFromWatchedState(state);
        });
        // Initial read
        void watcher.refresh();
    }
    (0, registerCommands_1.registerCommands)(context, logger, broadcaster);
    logger.info('Activated Ralph Codex Workbench extension.', {
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
}
function deactivate() {
    // no-op
}
//# sourceMappingURL=extension.js.map