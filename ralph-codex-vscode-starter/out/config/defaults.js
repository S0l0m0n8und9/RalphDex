"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CONFIG = void 0;
exports.DEFAULT_CONFIG = {
    cliProvider: 'claude',
    codexCommandPath: 'codex',
    claudeCommandPath: 'claude',
    claudeMaxTurns: 50,
    claudePermissionMode: 'dangerously-skip-permissions',
    preferredHandoffMode: 'ideCommand',
    inspectionRootOverride: '',
    ralphIterationCap: 20,
    verifierModes: ['validationCommand', 'gitDiff', 'taskState'],
    noProgressThreshold: 5,
    repeatedFailureThreshold: 5,
    artifactRetentionPath: '.ralph/artifacts',
    generatedArtifactRetentionCount: 25,
    provenanceBundleRetentionCount: 25,
    gitCheckpointMode: 'snapshotAndDiff',
    validationCommandOverride: '',
    stopOnHumanReviewNeeded: true,
    autoReplenishBacklog: false,
    ralphTaskFilePath: '.ralph/tasks.json',
    prdPath: '.ralph/prd.md',
    progressPath: '.ralph/progress.md',
    promptTemplateDirectory: '',
    promptIncludeVerifierFeedback: true,
    promptPriorContextBudget: 8,
    clipboardAutoCopy: true,
    model: 'claude-sonnet-4-6',
    reasoningEffort: 'medium',
    approvalMode: 'never',
    sandboxMode: 'workspace-write',
    openSidebarCommandId: 'claude.openSidebar',
    newChatCommandId: 'claude.newChat'
};
//# sourceMappingURL=defaults.js.map