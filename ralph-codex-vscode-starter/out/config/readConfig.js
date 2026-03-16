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
exports.readConfig = readConfig;
const vscode = __importStar(require("vscode"));
const defaults_1 = require("./defaults");
function readString(config, key, fallback, legacyKeys = []) {
    const value = config.get(key);
    if (typeof value === 'string' && value.trim()) {
        return value.trim();
    }
    for (const legacyKey of legacyKeys) {
        const legacyValue = config.get(legacyKey);
        if (typeof legacyValue === 'string' && legacyValue.trim()) {
            return legacyValue.trim();
        }
    }
    return fallback;
}
function readBoolean(config, key, fallback, legacyKeys = []) {
    const value = config.get(key);
    if (typeof value === 'boolean') {
        return value;
    }
    for (const legacyKey of legacyKeys) {
        const legacyValue = config.get(legacyKey);
        if (typeof legacyValue === 'boolean') {
            return legacyValue;
        }
    }
    return fallback;
}
function readNumber(config, key, fallback, minimum, legacyKeys = []) {
    const value = config.get(key);
    if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.max(minimum, Math.floor(value));
    }
    for (const legacyKey of legacyKeys) {
        const legacyValue = config.get(legacyKey);
        if (typeof legacyValue === 'number' && Number.isFinite(legacyValue)) {
            return Math.max(minimum, Math.floor(legacyValue));
        }
    }
    return fallback;
}
function readEnum(config, key, allowed, fallback, legacyKeys = []) {
    const value = config.get(key);
    if (typeof value === 'string' && allowed.includes(value)) {
        return value;
    }
    for (const legacyKey of legacyKeys) {
        const legacyValue = config.get(legacyKey);
        if (typeof legacyValue === 'string' && allowed.includes(legacyValue)) {
            return legacyValue;
        }
    }
    return fallback;
}
function readEnumArray(config, key, allowed, fallback) {
    const value = config.get(key);
    if (!Array.isArray(value)) {
        return [...fallback];
    }
    const normalized = value.filter((item) => typeof item === 'string' && allowed.includes(item));
    return normalized.length > 0 ? normalized : [...fallback];
}
function readConfig(workspaceFolder) {
    const config = vscode.workspace.getConfiguration('ralphCodex', workspaceFolder.uri);
    const cliProvider = readEnum(config, 'cliProvider', ['codex', 'claude'], defaults_1.DEFAULT_CONFIG.cliProvider);
    const openSidebarFallback = cliProvider === 'claude' ? 'claude.openSidebar' : 'chatgpt.openSidebar';
    const newChatFallback = cliProvider === 'claude' ? 'claude.newChat' : 'chatgpt.newChat';
    return {
        cliProvider,
        codexCommandPath: readString(config, 'codexCommandPath', defaults_1.DEFAULT_CONFIG.codexCommandPath, ['codexExecutable']),
        claudeCommandPath: readString(config, 'claudeCommandPath', defaults_1.DEFAULT_CONFIG.claudeCommandPath),
        claudeMaxTurns: readNumber(config, 'claudeMaxTurns', defaults_1.DEFAULT_CONFIG.claudeMaxTurns, 1),
        claudePermissionMode: readEnum(config, 'claudePermissionMode', ['dangerously-skip-permissions', 'default'], defaults_1.DEFAULT_CONFIG.claudePermissionMode),
        preferredHandoffMode: readEnum(config, 'preferredHandoffMode', ['ideCommand', 'clipboard', 'cliExec'], defaults_1.DEFAULT_CONFIG.preferredHandoffMode),
        inspectionRootOverride: readString(config, 'inspectionRootOverride', defaults_1.DEFAULT_CONFIG.inspectionRootOverride),
        ralphIterationCap: readNumber(config, 'ralphIterationCap', defaults_1.DEFAULT_CONFIG.ralphIterationCap, 1, ['maxIterations']),
        verifierModes: readEnumArray(config, 'verifierModes', ['validationCommand', 'gitDiff', 'taskState'], defaults_1.DEFAULT_CONFIG.verifierModes),
        noProgressThreshold: readNumber(config, 'noProgressThreshold', defaults_1.DEFAULT_CONFIG.noProgressThreshold, 1),
        repeatedFailureThreshold: readNumber(config, 'repeatedFailureThreshold', defaults_1.DEFAULT_CONFIG.repeatedFailureThreshold, 1),
        artifactRetentionPath: readString(config, 'artifactRetentionPath', defaults_1.DEFAULT_CONFIG.artifactRetentionPath),
        generatedArtifactRetentionCount: readNumber(config, 'generatedArtifactRetentionCount', defaults_1.DEFAULT_CONFIG.generatedArtifactRetentionCount, 0),
        provenanceBundleRetentionCount: readNumber(config, 'provenanceBundleRetentionCount', defaults_1.DEFAULT_CONFIG.provenanceBundleRetentionCount, 0),
        gitCheckpointMode: readEnum(config, 'gitCheckpointMode', ['off', 'snapshot', 'snapshotAndDiff'], defaults_1.DEFAULT_CONFIG.gitCheckpointMode),
        validationCommandOverride: readString(config, 'validationCommandOverride', defaults_1.DEFAULT_CONFIG.validationCommandOverride),
        stopOnHumanReviewNeeded: readBoolean(config, 'stopOnHumanReviewNeeded', defaults_1.DEFAULT_CONFIG.stopOnHumanReviewNeeded),
        autoReplenishBacklog: readBoolean(config, 'autoReplenishBacklog', defaults_1.DEFAULT_CONFIG.autoReplenishBacklog),
        ralphTaskFilePath: readString(config, 'ralphTaskFilePath', defaults_1.DEFAULT_CONFIG.ralphTaskFilePath),
        prdPath: readString(config, 'prdPath', defaults_1.DEFAULT_CONFIG.prdPath),
        progressPath: readString(config, 'progressPath', defaults_1.DEFAULT_CONFIG.progressPath),
        promptTemplateDirectory: readString(config, 'promptTemplateDirectory', defaults_1.DEFAULT_CONFIG.promptTemplateDirectory),
        promptIncludeVerifierFeedback: readBoolean(config, 'promptIncludeVerifierFeedback', defaults_1.DEFAULT_CONFIG.promptIncludeVerifierFeedback),
        promptPriorContextBudget: readNumber(config, 'promptPriorContextBudget', defaults_1.DEFAULT_CONFIG.promptPriorContextBudget, 1),
        clipboardAutoCopy: readBoolean(config, 'clipboardAutoCopy', defaults_1.DEFAULT_CONFIG.clipboardAutoCopy),
        model: readString(config, 'model', defaults_1.DEFAULT_CONFIG.model),
        reasoningEffort: readEnum(config, 'reasoningEffort', ['medium', 'high'], defaults_1.DEFAULT_CONFIG.reasoningEffort),
        approvalMode: readEnum(config, 'approvalMode', ['never', 'on-request', 'untrusted'], defaults_1.DEFAULT_CONFIG.approvalMode),
        sandboxMode: readEnum(config, 'sandboxMode', ['read-only', 'workspace-write', 'danger-full-access'], defaults_1.DEFAULT_CONFIG.sandboxMode),
        openSidebarCommandId: readString(config, 'openSidebarCommandId', openSidebarFallback),
        newChatCommandId: readString(config, 'newChatCommandId', newChatFallback),
        claudeCodeCommandPath: readString(config, 'claudeCodeCommandPath', defaults_1.DEFAULT_CONFIG.claudeCodeCommandPath),
        preferredExecutionAdapter: readEnum(config, 'preferredExecutionAdapter', ['codex', 'claudeCode'], defaults_1.DEFAULT_CONFIG.preferredExecutionAdapter)
    };
}
//# sourceMappingURL=readConfig.js.map