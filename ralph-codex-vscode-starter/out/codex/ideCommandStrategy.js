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
exports.IdeCommandCodexStrategy = void 0;
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
async function runVsCodeCommand(commandId, warnings, warningText) {
    if (!commandId || commandId === 'none') {
        return;
    }
    try {
        await vscode.commands.executeCommand(commandId);
    }
    catch {
        warnings.push(warningText);
    }
}
class IdeCommandCodexStrategy {
    id = 'ideCommand';
    async handoffPrompt(request) {
        const warnings = [];
        if (request.copyToClipboard) {
            await vscode.env.clipboard.writeText(request.prompt);
        }
        else {
            warnings.push('Clipboard auto-copy is disabled, so you will need to paste the generated prompt manually.');
        }
        await runVsCodeCommand(request.openSidebarCommandId, warnings, `The configured Codex sidebar command (${request.openSidebarCommandId}) was not available.`);
        await runVsCodeCommand(request.newChatCommandId, warnings, `The configured Codex new-chat command (${request.newChatCommandId}) was not available.`);
        return {
            strategy: this.id,
            success: true,
            message: `Prompt ready at ${path.basename(request.promptPath)}.`,
            warnings
        };
    }
}
exports.IdeCommandCodexStrategy = IdeCommandCodexStrategy;
//# sourceMappingURL=ideCommandStrategy.js.map