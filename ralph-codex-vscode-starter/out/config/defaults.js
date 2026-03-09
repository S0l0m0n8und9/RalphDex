"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CONFIG = void 0;
exports.DEFAULT_CONFIG = {
    codexCommandPath: 'codex',
    preferredHandoffMode: 'ideCommand',
    inspectionRootOverride: '',
    ralphIterationCap: 20,
    verifierModes: ['validationCommand', 'gitDiff', 'taskState'],
    noProgressThreshold: 5,
    repeatedFailureThreshold: 2,
    artifactRetentionPath: '.ralph/artifacts',
    generatedArtifactRetentionCount: 25,
    provenanceBundleRetentionCount: 25,
    gitCheckpointMode: 'snapshotAndDiff',
    validationCommandOverride: '',
    stopOnHumanReviewNeeded: true,
    ralphTaskFilePath: '.ralph/tasks.json',
    prdPath: '.ralph/prd.md',
    progressPath: '.ralph/progress.md',
    promptTemplateDirectory: '',
    promptIncludeVerifierFeedback: true,
    promptPriorContextBudget: 8,
    clipboardAutoCopy: true,
    model: 'gpt-5.4',
    approvalMode: 'never',
    sandboxMode: 'workspace-write',
    openSidebarCommandId: 'chatgpt.openSidebar',
    newChatCommandId: 'chatgpt.newChat'
};
//# sourceMappingURL=defaults.js.map