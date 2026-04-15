"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CONFIG = void 0;
exports.DEFAULT_CONFIG = {
    cliProvider: 'claude',
    codexCommandPath: 'codex',
    claudeCommandPath: 'claude',
    copilotCommandPath: 'copilot',
    geminiCommandPath: 'gemini',
    copilotFoundry: {
        commandPath: 'copilot',
        approvalMode: 'allow-all',
        maxAutopilotContinues: 200,
        auth: {
            mode: 'az-bearer',
            tenantId: '',
            subscriptionId: '',
            apiKeyEnvVar: '',
            secretStorageKey: ''
        },
        azure: {
            resourceGroup: '',
            resourceName: '',
            baseUrlOverride: ''
        },
        model: {
            deployment: '',
            wireApi: 'responses'
        }
    },
    azureFoundry: {
        commandPath: 'azure-foundry',
        endpointUrl: '',
        modelDeployment: '',
        apiVersion: '2024-12-01-preview',
        auth: {
            mode: 'az-bearer',
            tenantId: '',
            subscriptionId: '',
            apiKeyEnvVar: '',
            secretStorageKey: ''
        }
    },
    claudeMaxTurns: 125,
    copilotMaxAutopilotContinues: 200,
    claudePermissionMode: 'dangerously-skip-permissions',
    copilotApprovalMode: 'allow-all',
    agentId: 'default',
    agentRole: 'implementer',
    preferredHandoffMode: 'ideCommand',
    inspectionRootOverride: '',
    ralphIterationCap: 20,
    verifierModes: ['validationCommand', 'gitDiff', 'taskState'],
    noProgressThreshold: 2,
    repeatedFailureThreshold: 2,
    artifactRetentionPath: '.ralph/artifacts',
    generatedArtifactRetentionCount: 25,
    provenanceBundleRetentionCount: 25,
    gitCheckpointMode: 'snapshotAndDiff',
    scmStrategy: 'none',
    scmPrOnParentDone: false,
    watchdogStaleTtlMs: 24 * 60 * 60 * 1000,
    validationCommandOverride: '',
    stopOnHumanReviewNeeded: true,
    autonomyMode: 'supervised',
    autoReplenishBacklog: false,
    autoReloadOnControlPlaneChange: false,
    autoApplyRemediation: [],
    ralphTaskFilePath: '.ralph/tasks.json',
    prdPath: '.ralph/prd.md',
    progressPath: '.ralph/progress.md',
    promptTemplateDirectory: '',
    promptIncludeVerifierFeedback: true,
    promptPriorContextBudget: 8,
    promptBudgetProfile: 'codex',
    customPromptBudget: {},
    clipboardAutoCopy: true,
    model: 'claude-sonnet-4-6',
    reasoningEffort: 'medium',
    approvalMode: 'never',
    sandboxMode: 'workspace-write',
    openSidebarCommandId: 'claude.openSidebar',
    newChatCommandId: 'claude.newChat',
    claimTtlHours: 24,
    staleLockThresholdMinutes: 5,
    agentCount: 1,
    modelTiering: {
        enabled: true,
        simple: { provider: 'claude', model: 'claude-haiku-4-5' },
        medium: { provider: 'claude', model: 'claude-sonnet-4-6' },
        complex: { provider: 'claude', model: 'claude-opus-4-6' },
        simpleThreshold: 3,
        complexThreshold: 6
    },
    hooks: {},
    autoWatchdogOnStall: false,
    autoReviewOnParentDone: false,
    autoReviewOnLoopComplete: false,
    autoScmOnConflict: true,
    scmConflictRetryLimit: 1,
    pipelineHumanGates: false,
    cliExecutionTimeoutMs: 0,
    promptCaching: 'auto',
    memoryStrategy: 'verbatim',
    memoryWindowSize: 10,
    memorySummaryThreshold: 20,
    prdGenerationTemplate: '',
    planningPass: {
        enabled: false,
        mode: 'inline'
    },
    failureDiagnostics: 'auto',
    maxRecoveryAttempts: 3
};
//# sourceMappingURL=defaults.js.map