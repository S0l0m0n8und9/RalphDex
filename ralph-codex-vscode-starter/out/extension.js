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
function activate(context) {
    const logger = new logger_1.Logger(vscode.window.createOutputChannel('Ralph Codex'));
    context.subscriptions.push(logger);
    (0, registerCommands_1.registerCommands)(context, logger);
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