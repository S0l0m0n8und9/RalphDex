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
exports.resolveOperatorModeProvenance = resolveOperatorModeProvenance;
exports.readConfig = readConfig;
const vscode = __importStar(require("vscode"));
const defaults_1 = require("./defaults");
const providers_1 = require("./providers");
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
function readPromptBudgetOverrideMap(config, key) {
    const value = config.get(key);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }
    const normalized = {};
    for (const [entryKey, entryValue] of Object.entries(value)) {
        if (typeof entryValue !== 'number' || !Number.isFinite(entryValue) || entryValue <= 0) {
            continue;
        }
        const trimmedKey = entryKey.trim();
        if (!trimmedKey) {
            continue;
        }
        normalized[trimmedKey] = Math.floor(entryValue);
    }
    return normalized;
}
const CLI_PROVIDER_IDS = ['codex', 'claude', 'copilot', 'azure-foundry'];
const OPERATOR_PRESETS = {
    simple: {
        autonomyMode: 'supervised',
        agentCount: 1,
        preferredHandoffMode: 'ideCommand',
        modelTieringEnabled: false,
        ralphIterationCap: 20,
        stopOnHumanReviewNeeded: true,
        scmStrategy: 'none',
        memoryStrategy: 'verbatim',
        autoReplenishBacklog: false,
        pipelineHumanGates: true
    },
    'multi-agent': {
        autonomyMode: 'autonomous',
        agentCount: 3,
        preferredHandoffMode: 'cliExec',
        modelTieringEnabled: true,
        ralphIterationCap: defaults_1.DEFAULT_CONFIG.ralphIterationCap,
        stopOnHumanReviewNeeded: defaults_1.DEFAULT_CONFIG.stopOnHumanReviewNeeded,
        scmStrategy: 'branch-per-task',
        memoryStrategy: 'sliding-window',
        autoReplenishBacklog: true,
        pipelineHumanGates: true,
        autoReviewOnParentDone: true,
        autoWatchdogOnStall: true
    },
    hardcore: {
        autonomyMode: 'autonomous',
        agentCount: 3,
        preferredHandoffMode: 'cliExec',
        modelTieringEnabled: true,
        ralphIterationCap: 100,
        stopOnHumanReviewNeeded: defaults_1.DEFAULT_CONFIG.stopOnHumanReviewNeeded,
        scmStrategy: 'branch-per-task',
        memoryStrategy: 'summary',
        autoReplenishBacklog: true,
        pipelineHumanGates: false,
        autoReviewOnParentDone: true,
        autoWatchdogOnStall: true,
        autoApplyRemediation: ['decompose_task', 'mark_blocked']
    }
};
function readTierConfig(raw, fallback) {
    // Accept a plain string (backward-compat: old flat `simpleModel` format).
    if (typeof raw === 'string' && raw.trim()) {
        return { model: raw.trim() };
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return fallback;
    }
    const record = raw;
    const model = typeof record.model === 'string' && record.model.trim()
        ? record.model.trim()
        : fallback.model;
    const provider = typeof record.provider === 'string' && CLI_PROVIDER_IDS.includes(record.provider)
        ? record.provider
        : undefined;
    return provider ? { provider, model } : { model };
}
function readModelTiering(config, fallback) {
    const raw = config.get('modelTiering');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return fallback;
    }
    const record = raw;
    // Backward-compat: accept old flat `simpleModel`/`mediumModel`/`complexModel` strings.
    const simple = record.simple !== undefined
        ? readTierConfig(record.simple, fallback.simple)
        : typeof record.simpleModel === 'string' && record.simpleModel.trim()
            ? { model: record.simpleModel.trim() }
            : fallback.simple;
    const medium = record.medium !== undefined
        ? readTierConfig(record.medium, fallback.medium)
        : typeof record.mediumModel === 'string' && record.mediumModel.trim()
            ? { model: record.mediumModel.trim() }
            : fallback.medium;
    const complex = record.complex !== undefined
        ? readTierConfig(record.complex, fallback.complex)
        : typeof record.complexModel === 'string' && record.complexModel.trim()
            ? { model: record.complexModel.trim() }
            : fallback.complex;
    return {
        enabled: typeof record.enabled === 'boolean' ? record.enabled : fallback.enabled,
        simple,
        medium,
        complex,
        simpleThreshold: typeof record.simpleThreshold === 'number' && Number.isFinite(record.simpleThreshold)
            ? Math.floor(record.simpleThreshold)
            : fallback.simpleThreshold,
        complexThreshold: typeof record.complexThreshold === 'number' && Number.isFinite(record.complexThreshold)
            ? Math.floor(record.complexThreshold)
            : fallback.complexThreshold
    };
}
function readHooks(config, fallback) {
    const raw = config.get('hooks');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return fallback;
    }
    const record = raw;
    const hooks = {};
    for (const key of ['beforeIteration', 'afterIteration', 'onTaskComplete', 'onStop', 'onFailure']) {
        if (typeof record[key] === 'string' && record[key].trim()) {
            hooks[key] = record[key].trim();
        }
    }
    return hooks;
}
function readPlanningPass(config, fallback) {
    const raw = config.get('planningPass');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return fallback;
    }
    const record = raw;
    const enabled = typeof record.enabled === 'boolean' ? record.enabled : fallback.enabled;
    const PLANNING_PASS_MODES = ['dedicated', 'inline'];
    const mode = typeof record.mode === 'string' && PLANNING_PASS_MODES.includes(record.mode)
        ? record.mode
        : fallback.mode;
    return { enabled, mode };
}
/**
 * Returns per-setting provenance for all preset-affected keys when an operator mode is active.
 * Returns null when no operator mode is set.
 * For each setting, `source` is 'explicit' when the user has a workspace or global override,
 * and 'preset' when the resolved value came from the preset fallback.
 */
function resolveOperatorModeProvenance(config, resolvedConfig, operatorMode) {
    if (operatorMode === undefined) {
        return null;
    }
    const checkKey = (key, resolvedValue) => {
        const inspect = config.inspect(key);
        const hasExplicit = inspect?.workspaceValue !== undefined || inspect?.globalValue !== undefined;
        return { key, value: resolvedValue, source: hasExplicit ? 'explicit' : 'preset' };
    };
    const entries = [
        checkKey('autonomyMode', resolvedConfig.autonomyMode),
        checkKey('agentCount', String(resolvedConfig.agentCount)),
        checkKey('preferredHandoffMode', resolvedConfig.preferredHandoffMode),
        checkKey('ralphIterationCap', String(resolvedConfig.ralphIterationCap)),
        checkKey('stopOnHumanReviewNeeded', String(resolvedConfig.stopOnHumanReviewNeeded)),
        checkKey('scmStrategy', resolvedConfig.scmStrategy),
        checkKey('memoryStrategy', resolvedConfig.memoryStrategy),
        checkKey('autoReplenishBacklog', String(resolvedConfig.autoReplenishBacklog)),
        checkKey('pipelineHumanGates', String(resolvedConfig.pipelineHumanGates)),
        checkKey('autoReviewOnParentDone', String(resolvedConfig.autoReviewOnParentDone)),
        checkKey('autoWatchdogOnStall', String(resolvedConfig.autoWatchdogOnStall)),
        checkKey('autoApplyRemediation', resolvedConfig.autoApplyRemediation.join(', ') || 'none')
    ];
    // modelTiering.enabled needs special handling since it's nested and has a flat legacy key
    const tieringInspect = config.inspect('modelTiering');
    const tieringRecord = (tieringInspect?.workspaceValue ?? tieringInspect?.globalValue);
    const enableInspect = config.inspect('enableModelTiering');
    const modelTieringExplicit = typeof tieringRecord?.enabled === 'boolean'
        || enableInspect?.workspaceValue !== undefined
        || enableInspect?.globalValue !== undefined;
    entries.push({
        key: 'modelTiering.enabled',
        value: String(resolvedConfig.modelTiering.enabled),
        source: modelTieringExplicit ? 'explicit' : 'preset'
    });
    return entries;
}
function readConfig(workspaceFolder) {
    const config = vscode.workspace.getConfiguration('ralphCodex', workspaceFolder.uri);
    const rawOperatorMode = config.get('operatorMode');
    const operatorMode = rawOperatorMode === 'simple' || rawOperatorMode === 'multi-agent' || rawOperatorMode === 'hardcore'
        ? rawOperatorMode
        : undefined;
    const preset = operatorMode !== undefined ? OPERATOR_PRESETS[operatorMode] : undefined;
    const cliProvider = readEnum(config, 'cliProvider', ['codex', 'claude', 'copilot', 'azure-foundry'], defaults_1.DEFAULT_CONFIG.cliProvider);
    const autonomyMode = readEnum(config, 'autonomyMode', ['supervised', 'autonomous'], preset?.autonomyMode ?? defaults_1.DEFAULT_CONFIG.autonomyMode);
    const openSidebarFallback = (0, providers_1.getDefaultOpenSidebarCommandId)(cliProvider);
    const newChatFallback = (0, providers_1.getDefaultNewChatCommandId)(cliProvider);
    const autoReplenishBacklog = readBoolean(config, 'autoReplenishBacklog', preset?.autoReplenishBacklog ?? defaults_1.DEFAULT_CONFIG.autoReplenishBacklog);
    const autoReloadOnControlPlaneChange = readBoolean(config, 'autoReloadOnControlPlaneChange', defaults_1.DEFAULT_CONFIG.autoReloadOnControlPlaneChange);
    const autoApplyRemediation = readEnumArray(config, 'autoApplyRemediation', ['decompose_task', 'mark_blocked'], preset?.autoApplyRemediation ?? defaults_1.DEFAULT_CONFIG.autoApplyRemediation);
    const effectiveAutonomy = autonomyMode === 'autonomous'
        ? {
            autoReplenishBacklog: true,
            autoReloadOnControlPlaneChange: true,
            autoApplyRemediation: ['decompose_task', 'mark_blocked']
        }
        : {
            autoReplenishBacklog,
            autoReloadOnControlPlaneChange,
            autoApplyRemediation
        };
    return {
        cliProvider,
        codexCommandPath: readString(config, 'codexCommandPath', defaults_1.DEFAULT_CONFIG.codexCommandPath, ['codexExecutable']),
        claudeCommandPath: readString(config, 'claudeCommandPath', defaults_1.DEFAULT_CONFIG.claudeCommandPath),
        copilotCommandPath: readString(config, 'copilotCommandPath', defaults_1.DEFAULT_CONFIG.copilotCommandPath),
        azureFoundryCommandPath: readString(config, 'azureFoundryCommandPath', defaults_1.DEFAULT_CONFIG.azureFoundryCommandPath),
        azureFoundryEndpointUrl: readString(config, 'azureFoundryEndpointUrl', defaults_1.DEFAULT_CONFIG.azureFoundryEndpointUrl),
        azureFoundryApiKey: readString(config, 'azureFoundryApiKey', defaults_1.DEFAULT_CONFIG.azureFoundryApiKey),
        azureFoundryModelDeployment: readString(config, 'azureFoundryModelDeployment', defaults_1.DEFAULT_CONFIG.azureFoundryModelDeployment),
        azureFoundryApiVersion: readString(config, 'azureFoundryApiVersion', defaults_1.DEFAULT_CONFIG.azureFoundryApiVersion),
        claudeMaxTurns: readNumber(config, 'claudeMaxTurns', defaults_1.DEFAULT_CONFIG.claudeMaxTurns, 1),
        copilotMaxAutopilotContinues: readNumber(config, 'copilotMaxAutopilotContinues', defaults_1.DEFAULT_CONFIG.copilotMaxAutopilotContinues, 1),
        claudePermissionMode: readEnum(config, 'claudePermissionMode', ['dangerously-skip-permissions', 'default'], defaults_1.DEFAULT_CONFIG.claudePermissionMode),
        copilotApprovalMode: readEnum(config, 'copilotApprovalMode', ['allow-all', 'allow-tools-only', 'interactive'], defaults_1.DEFAULT_CONFIG.copilotApprovalMode),
        agentId: readString(config, 'agentId', defaults_1.DEFAULT_CONFIG.agentId),
        agentRole: readEnum(config, 'agentRole', ['build', 'review', 'watchdog', 'scm', 'planner', 'implementer', 'reviewer'], defaults_1.DEFAULT_CONFIG.agentRole),
        preferredHandoffMode: readEnum(config, 'preferredHandoffMode', ['ideCommand', 'clipboard', 'cliExec'], preset?.preferredHandoffMode ?? defaults_1.DEFAULT_CONFIG.preferredHandoffMode),
        inspectionRootOverride: readString(config, 'inspectionRootOverride', defaults_1.DEFAULT_CONFIG.inspectionRootOverride),
        ralphIterationCap: readNumber(config, 'ralphIterationCap', preset?.ralphIterationCap ?? defaults_1.DEFAULT_CONFIG.ralphIterationCap, 1, ['maxIterations']),
        verifierModes: readEnumArray(config, 'verifierModes', ['validationCommand', 'gitDiff', 'taskState'], defaults_1.DEFAULT_CONFIG.verifierModes),
        noProgressThreshold: readNumber(config, 'noProgressThreshold', defaults_1.DEFAULT_CONFIG.noProgressThreshold, 1),
        repeatedFailureThreshold: readNumber(config, 'repeatedFailureThreshold', defaults_1.DEFAULT_CONFIG.repeatedFailureThreshold, 1),
        artifactRetentionPath: readString(config, 'artifactRetentionPath', defaults_1.DEFAULT_CONFIG.artifactRetentionPath),
        generatedArtifactRetentionCount: readNumber(config, 'generatedArtifactRetentionCount', defaults_1.DEFAULT_CONFIG.generatedArtifactRetentionCount, 0),
        provenanceBundleRetentionCount: readNumber(config, 'provenanceBundleRetentionCount', defaults_1.DEFAULT_CONFIG.provenanceBundleRetentionCount, 0),
        gitCheckpointMode: readEnum(config, 'gitCheckpointMode', ['off', 'snapshot', 'snapshotAndDiff'], defaults_1.DEFAULT_CONFIG.gitCheckpointMode),
        scmStrategy: readEnum(config, 'scmStrategy', ['none', 'commit-on-done', 'branch-per-task'], preset?.scmStrategy ?? defaults_1.DEFAULT_CONFIG.scmStrategy),
        scmPrOnParentDone: readBoolean(config, 'scmPrOnParentDone', defaults_1.DEFAULT_CONFIG.scmPrOnParentDone),
        watchdogStaleTtlMs: readNumber(config, 'watchdogStaleTtlMs', defaults_1.DEFAULT_CONFIG.watchdogStaleTtlMs, 0),
        validationCommandOverride: readString(config, 'validationCommandOverride', defaults_1.DEFAULT_CONFIG.validationCommandOverride),
        stopOnHumanReviewNeeded: readBoolean(config, 'stopOnHumanReviewNeeded', preset?.stopOnHumanReviewNeeded ?? defaults_1.DEFAULT_CONFIG.stopOnHumanReviewNeeded),
        autonomyMode,
        autoReplenishBacklog: effectiveAutonomy.autoReplenishBacklog,
        autoReloadOnControlPlaneChange: effectiveAutonomy.autoReloadOnControlPlaneChange,
        autoApplyRemediation: effectiveAutonomy.autoApplyRemediation,
        ralphTaskFilePath: readString(config, 'ralphTaskFilePath', defaults_1.DEFAULT_CONFIG.ralphTaskFilePath),
        prdPath: readString(config, 'prdPath', defaults_1.DEFAULT_CONFIG.prdPath),
        progressPath: readString(config, 'progressPath', defaults_1.DEFAULT_CONFIG.progressPath),
        promptTemplateDirectory: readString(config, 'promptTemplateDirectory', defaults_1.DEFAULT_CONFIG.promptTemplateDirectory),
        promptIncludeVerifierFeedback: readBoolean(config, 'promptIncludeVerifierFeedback', defaults_1.DEFAULT_CONFIG.promptIncludeVerifierFeedback),
        promptPriorContextBudget: readNumber(config, 'promptPriorContextBudget', defaults_1.DEFAULT_CONFIG.promptPriorContextBudget, 1),
        promptBudgetProfile: readEnum(config, 'promptBudgetProfile', ['codex', 'claude', 'custom'], defaults_1.DEFAULT_CONFIG.promptBudgetProfile),
        customPromptBudget: readPromptBudgetOverrideMap(config, 'customPromptBudget'),
        clipboardAutoCopy: readBoolean(config, 'clipboardAutoCopy', defaults_1.DEFAULT_CONFIG.clipboardAutoCopy),
        model: readString(config, 'model', defaults_1.DEFAULT_CONFIG.model),
        reasoningEffort: readEnum(config, 'reasoningEffort', ['medium', 'high'], defaults_1.DEFAULT_CONFIG.reasoningEffort),
        approvalMode: readEnum(config, 'approvalMode', ['never', 'on-request', 'untrusted'], defaults_1.DEFAULT_CONFIG.approvalMode),
        sandboxMode: readEnum(config, 'sandboxMode', ['read-only', 'workspace-write', 'danger-full-access'], defaults_1.DEFAULT_CONFIG.sandboxMode),
        openSidebarCommandId: readString(config, 'openSidebarCommandId', openSidebarFallback),
        newChatCommandId: readString(config, 'newChatCommandId', newChatFallback),
        claimTtlHours: readNumber(config, 'claimTtlHours', defaults_1.DEFAULT_CONFIG.claimTtlHours, 1),
        staleLockThresholdMinutes: readNumber(config, 'staleLockThresholdMinutes', defaults_1.DEFAULT_CONFIG.staleLockThresholdMinutes, 1),
        agentCount: readNumber(config, 'agentCount', preset?.agentCount ?? defaults_1.DEFAULT_CONFIG.agentCount, 1),
        modelTiering: (() => {
            const tiering = readModelTiering(config, defaults_1.DEFAULT_CONFIG.modelTiering);
            // Flat ralphCodex.enableModelTiering takes precedence over modelTiering.enabled,
            // but only if explicitly set by the user (workspace or global scope).
            // Using inspect() avoids treating the package.json default (false) as a user choice.
            const enableInspect = config.inspect('enableModelTiering');
            const enableOverride = enableInspect?.workspaceValue ?? enableInspect?.globalValue;
            if (typeof enableOverride === 'boolean') {
                tiering.enabled = enableOverride;
            }
            else if (preset?.modelTieringEnabled !== undefined) {
                // Apply preset value when modelTiering.enabled was not explicitly set.
                const tieringInspect = config.inspect('modelTiering');
                const tieringRecord = (tieringInspect?.workspaceValue ?? tieringInspect?.globalValue);
                if (typeof tieringRecord?.enabled !== 'boolean') {
                    tiering.enabled = preset.modelTieringEnabled;
                }
            }
            return tiering;
        })(),
        hooks: readHooks(config, defaults_1.DEFAULT_CONFIG.hooks),
        autoWatchdogOnStall: readBoolean(config, 'autoWatchdogOnStall', preset?.autoWatchdogOnStall ?? defaults_1.DEFAULT_CONFIG.autoWatchdogOnStall),
        autoReviewOnParentDone: readBoolean(config, 'autoReviewOnParentDone', preset?.autoReviewOnParentDone ?? defaults_1.DEFAULT_CONFIG.autoReviewOnParentDone),
        autoReviewOnLoopComplete: readBoolean(config, 'autoReviewOnLoopComplete', defaults_1.DEFAULT_CONFIG.autoReviewOnLoopComplete),
        autoScmOnConflict: readBoolean(config, 'autoScmOnConflict', defaults_1.DEFAULT_CONFIG.autoScmOnConflict),
        scmConflictRetryLimit: readNumber(config, 'scmConflictRetryLimit', defaults_1.DEFAULT_CONFIG.scmConflictRetryLimit, 1),
        pipelineHumanGates: readBoolean(config, 'pipelineHumanGates', preset?.pipelineHumanGates ?? defaults_1.DEFAULT_CONFIG.pipelineHumanGates),
        cliExecutionTimeoutMs: readNumber(config, 'cliExecutionTimeoutMs', defaults_1.DEFAULT_CONFIG.cliExecutionTimeoutMs, 0),
        promptCaching: readEnum(config, 'promptCaching', ['auto', 'force', 'off'], defaults_1.DEFAULT_CONFIG.promptCaching),
        memoryStrategy: readEnum(config, 'memoryStrategy', ['verbatim', 'sliding-window', 'summary'], preset?.memoryStrategy ?? defaults_1.DEFAULT_CONFIG.memoryStrategy),
        memoryWindowSize: readNumber(config, 'memoryWindowSize', defaults_1.DEFAULT_CONFIG.memoryWindowSize, 1),
        memorySummaryThreshold: readNumber(config, 'memorySummaryThreshold', defaults_1.DEFAULT_CONFIG.memorySummaryThreshold, 1),
        operatorMode,
        prdGenerationTemplate: readString(config, 'prdGenerationTemplate', defaults_1.DEFAULT_CONFIG.prdGenerationTemplate),
        planningPass: readPlanningPass(config, defaults_1.DEFAULT_CONFIG.planningPass),
        failureDiagnostics: readEnum(config, 'failureDiagnostics', ['auto', 'off'], defaults_1.DEFAULT_CONFIG.failureDiagnostics),
        maxRecoveryAttempts: readNumber(config, 'maxRecoveryAttempts', defaults_1.DEFAULT_CONFIG.maxRecoveryAttempts, 1)
    };
}
//# sourceMappingURL=readConfig.js.map