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
exports.inspectCodexCliSupport = inspectCodexCliSupport;
exports.inspectCliSupport = inspectCliSupport;
exports.inspectIdeCommandSupport = inspectIdeCommandSupport;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
function usesExplicitPath(commandPath) {
    return path.isAbsolute(commandPath) || commandPath.includes(path.sep) || commandPath.includes('/');
}
async function isExecutable(commandPath) {
    try {
        await fs.access(commandPath, fs.constants.X_OK);
        return true;
    }
    catch {
        return false;
    }
}
async function inspectCodexCliSupport(commandPath) {
    if (!usesExplicitPath(commandPath)) {
        return {
            commandPath,
            configuredAs: 'pathLookup',
            check: 'pathLookupAssumed',
            confidence: 'assumed'
        };
    }
    try {
        await fs.access(commandPath);
        if (!(await isExecutable(commandPath))) {
            return {
                commandPath,
                configuredAs: 'explicitPath',
                check: 'pathNotExecutable',
                confidence: 'blocked'
            };
        }
        return {
            commandPath,
            configuredAs: 'explicitPath',
            check: 'pathVerifiedExecutable',
            confidence: 'verified'
        };
    }
    catch {
        return {
            commandPath,
            configuredAs: 'explicitPath',
            check: 'pathMissing',
            confidence: 'blocked'
        };
    }
}
async function inspectCliSupport(provider, commandPath) {
    const base = await inspectCodexCliSupport(commandPath);
    const configKey = provider === 'claude'
        ? 'ralphCodex.claudeCommandPath'
        : provider === 'copilot'
            ? 'ralphCodex.copilotCommandPath'
            : 'ralphCodex.codexCommandPath';
    return {
        ...base,
        provider,
        configKey
    };
}
function commandIsDisabled(commandId) {
    return !commandId || commandId === 'none';
}
function inspectIdeCommandSupport(input) {
    if (input.preferredHandoffMode !== 'ideCommand') {
        return {
            preferredHandoffMode: input.preferredHandoffMode,
            status: 'notRequired',
            openSidebarCommandId: input.openSidebarCommandId,
            newChatCommandId: input.newChatCommandId,
            missingCommandIds: []
        };
    }
    const availableCommands = new Set(input.availableCommands);
    const candidateCommandIds = [input.openSidebarCommandId, input.newChatCommandId]
        .filter((commandId) => !commandIsDisabled(commandId));
    const missingCommandIds = candidateCommandIds.filter((commandId) => !availableCommands.has(commandId));
    const configuredCommandCount = candidateCommandIds.length;
    return {
        preferredHandoffMode: input.preferredHandoffMode,
        status: configuredCommandCount > 0 && missingCommandIds.length === 0 ? 'available' : 'unavailable',
        openSidebarCommandId: input.openSidebarCommandId,
        newChatCommandId: input.newChatCommandId,
        missingCommandIds: configuredCommandCount > 0
            ? missingCommandIds
            : [input.openSidebarCommandId, input.newChatCommandId].filter((commandId) => commandIsDisabled(commandId) || !availableCommands.has(commandId))
    };
}
//# sourceMappingURL=codexCliSupport.js.map