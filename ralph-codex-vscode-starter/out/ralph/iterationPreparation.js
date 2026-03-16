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
exports.prepareIterationContext = prepareIterationContext;
const vscode = __importStar(require("vscode"));
const readConfig_1 = require("../config/readConfig");
const promptBuilder_1 = require("../prompt/promptBuilder");
const workspaceScanner_1 = require("../services/workspaceScanner");
const codexCliSupport_1 = require("../services/codexCliSupport");
const integrity_1 = require("./integrity");
const rootPolicy_1 = require("./rootPolicy");
const types_1 = require("./types");
const taskFile_1 = require("./taskFile");
const preflight_1 = require("./preflight");
const verifier_1 = require("./verifier");
const artifactStore_1 = require("./artifactStore");
const EMPTY_GIT_STATUS = {
    available: false,
    raw: '',
    entries: []
};
function trustLevelForTarget(promptTarget) {
    return promptTarget === 'cliExec' ? 'verifiedCliExecution' : 'preparedPromptOnly';
}
async function maybeSeedObjective(stateManager, paths) {
    const objectiveText = await stateManager.readObjectiveText(paths);
    if (!stateManager.isDefaultObjective(objectiveText)) {
        return objectiveText;
    }
    const seededObjective = await vscode.window.showInputBox({
        prompt: 'Seed the PRD with a short objective for this workspace',
        placeHolder: 'Example: Harden the VS Code extension starter into a reliable v2 iteration engine'
    });
    if (!seededObjective?.trim()) {
        return objectiveText;
    }
    const nextText = [
        '# Product / project brief',
        '',
        seededObjective.trim()
    ].join('\n');
    await stateManager.writeObjectiveText(paths, nextText);
    return `${nextText}\n`;
}
async function prepareIterationContext(input) {
    const { workspaceFolder, progress, includeVerifierContext, stateManager, logger } = input;
    const inspectStartedAt = new Date().toISOString();
    progress.report({ message: 'Inspecting Ralph workspace' });
    const config = (0, readConfig_1.readConfig)(workspaceFolder);
    const rootPath = workspaceFolder.uri.fsPath;
    const snapshot = await stateManager.ensureWorkspace(rootPath, config);
    await logger.setWorkspaceLogFile(snapshot.paths.logFilePath);
    if (snapshot.createdPaths.length > 0) {
        logger.warn('Initialized or repaired Ralph workspace paths.', {
            rootPath,
            createdPaths: snapshot.createdPaths
        });
    }
    const objectiveText = await maybeSeedObjective(stateManager, snapshot.paths);
    const focusPath = vscode.window.activeTextEditor?.document.uri.scheme === 'file'
        ? vscode.window.activeTextEditor.document.uri.fsPath
        : null;
    const [progressText, taskInspection, taskCounts, summary, beforeCoreState] = await Promise.all([
        stateManager.readProgressText(snapshot.paths),
        stateManager.inspectTaskFile(snapshot.paths),
        stateManager.taskCounts(snapshot.paths).catch(() => null),
        (0, workspaceScanner_1.scanWorkspace)(rootPath, workspaceFolder.name, {
            focusPath,
            inspectionRootOverride: config.inspectionRootOverride
        }),
        (0, verifier_1.captureCoreState)(snapshot.paths)
    ]);
    const tasksText = taskInspection.text ?? beforeCoreState.tasksText;
    const taskFile = taskInspection.taskFile ?? beforeCoreState.taskFile;
    const effectiveTaskCounts = taskCounts ?? (0, taskFile_1.countTaskStatuses)(taskFile);
    const taskSelectedAt = new Date().toISOString();
    const iteration = snapshot.state.nextIteration;
    const promptTarget = includeVerifierContext ? 'cliExec' : 'ideHandoff';
    const provenanceId = (0, integrity_1.createProvenanceId)({
        iteration,
        promptTarget,
        createdAt: taskSelectedAt
    });
    const selectedTask = promptTarget === 'cliExec'
        ? await selectClaimedTask(taskFile, snapshot.paths.claimFilePath, provenanceId)
        : (0, taskFile_1.selectNextTask)(taskFile);
    const rootPolicy = (0, rootPolicy_1.deriveRootPolicy)(summary);
    const promptDecision = (0, promptBuilder_1.decidePromptKind)(snapshot.state, promptTarget, {
        selectedTask,
        taskCounts: effectiveTaskCounts,
        taskInspectionDiagnostics: taskInspection.diagnostics
    });
    const promptKind = promptDecision.kind;
    const taskValidationHint = selectedTask?.validation?.trim() || null;
    const selectedValidationCommand = promptKind === 'replenish-backlog'
        ? null
        : (0, verifier_1.chooseValidationCommand)(summary, selectedTask, config.validationCommandOverride);
    const effectiveValidationCommand = promptKind === 'replenish-backlog'
        ? null
        : (0, verifier_1.normalizeValidationCommand)({
            command: selectedValidationCommand,
            workspaceRootPath: workspaceFolder.uri.fsPath,
            verificationRootPath: rootPolicy.verificationRootPath
        });
    const normalizedValidationCommandFrom = selectedValidationCommand
        && effectiveValidationCommand
        && selectedValidationCommand !== effectiveValidationCommand
        ? selectedValidationCommand
        : null;
    const validationCommandReadiness = await (0, verifier_1.inspectValidationCommandReadiness)({
        command: effectiveValidationCommand,
        rootPath: rootPolicy.verificationRootPath
    });
    const trustLevel = trustLevelForTarget(promptTarget);
    const cliCommandPath = config.cliProvider === 'claude'
        ? config.claudeCommandPath
        : config.codexCommandPath;
    const [availableCommands, codexCliSupport] = await Promise.all([
        vscode.commands.getCommands(true),
        (0, codexCliSupport_1.inspectCliSupport)(config.cliProvider, cliCommandPath)
    ]);
    const ideCommandSupport = (0, codexCliSupport_1.inspectIdeCommandSupport)({
        preferredHandoffMode: config.preferredHandoffMode,
        openSidebarCommandId: config.openSidebarCommandId,
        newChatCommandId: config.newChatCommandId,
        availableCommands
    });
    const artifactReadinessDiagnostics = await (0, preflight_1.inspectPreflightArtifactReadiness)({
        rootPath,
        artifactRootDir: snapshot.paths.artifactDir,
        promptDir: snapshot.paths.promptDir,
        runDir: snapshot.paths.runDir,
        stateFilePath: snapshot.paths.stateFilePath,
        generatedArtifactRetentionCount: config.generatedArtifactRetentionCount,
        provenanceBundleRetentionCount: config.provenanceBundleRetentionCount
    });
    const preflightReport = (0, preflight_1.buildPreflightReport)({
        rootPath,
        workspaceTrusted: vscode.workspace.isTrusted,
        config,
        taskInspection,
        taskCounts: effectiveTaskCounts,
        selectedTask,
        currentProvenanceId: provenanceId,
        claimGraph: await (0, taskFile_1.inspectTaskClaimGraph)(snapshot.paths.claimFilePath),
        taskValidationHint,
        validationCommand: effectiveValidationCommand,
        normalizedValidationCommandFrom,
        validationCommandReadiness,
        fileStatus: snapshot.fileStatus,
        createdPaths: snapshot.createdPaths,
        codexCliSupport,
        ideCommandSupport,
        artifactReadinessDiagnostics
    });
    const preflightArtifactPaths = (0, artifactStore_1.resolvePreflightArtifactPaths)(snapshot.paths.artifactDir, iteration);
    const { persistedReport: persistedPreflightReport, humanSummary: preflightSummaryText } = await (0, artifactStore_1.writePreflightArtifacts)({
        paths: preflightArtifactPaths,
        artifactRootDir: snapshot.paths.artifactDir,
        provenanceId,
        iteration,
        promptKind,
        promptTarget,
        trustLevel,
        report: preflightReport,
        selectedTaskId: selectedTask?.id ?? null,
        selectedTaskTitle: selectedTask?.title ?? null,
        taskValidationHint,
        effectiveValidationCommand,
        normalizedValidationCommandFrom,
        validationCommand: effectiveValidationCommand
    });
    progress.report({ message: preflightReport.summary });
    logger.appendText((0, preflight_1.renderPreflightReport)(preflightReport));
    logger.info('Prepared Ralph preflight report.', {
        rootPath,
        iteration,
        ready: preflightReport.ready,
        preflightReportPath: preflightArtifactPaths.reportPath,
        preflightSummaryPath: preflightArtifactPaths.summaryPath,
        diagnostics: preflightReport.diagnostics
    });
    if (includeVerifierContext && !preflightReport.ready) {
        await input.persistBlockedPreflightBundle({
            paths: snapshot.paths,
            provenanceId,
            iteration,
            promptKind,
            promptTarget,
            trustLevel,
            provenanceRetentionCount: config.provenanceBundleRetentionCount,
            generatedArtifactRetentionCount: config.generatedArtifactRetentionCount,
            selectedTask,
            rootPolicy,
            persistedPreflightReport,
            preflightSummaryText
        });
        throw new Error((0, preflight_1.buildBlockingPreflightMessage)(preflightReport));
    }
    progress.report({ message: 'Generating Ralph prompt' });
    const artifactPaths = (0, artifactStore_1.resolveIterationArtifactPaths)(snapshot.paths.artifactDir, iteration);
    const provenanceBundlePaths = (0, artifactStore_1.resolveProvenanceBundlePaths)(snapshot.paths.artifactDir, provenanceId);
    const promptRender = await (0, promptBuilder_1.buildPrompt)({
        kind: promptKind,
        target: promptTarget,
        iteration,
        selectionReason: promptDecision.reason,
        objectiveText,
        progressText,
        taskCounts: effectiveTaskCounts,
        summary,
        state: snapshot.state,
        paths: snapshot.paths,
        taskFile,
        selectedTask,
        taskValidationHint,
        effectiveValidationCommand,
        normalizedValidationCommandFrom,
        validationCommand: effectiveValidationCommand,
        preflightReport,
        config
    });
    const prompt = promptRender.prompt;
    const promptEvidence = {
        ...promptRender.evidence,
        provenanceId
    };
    const promptPath = await stateManager.writePrompt(snapshot.paths, (0, promptBuilder_1.createPromptFileName)(promptKind, iteration), prompt);
    await (0, artifactStore_1.writePromptArtifacts)({
        paths: artifactPaths,
        artifactRootDir: snapshot.paths.artifactDir,
        prompt,
        promptEvidence
    });
    const executionPlan = {
        schemaVersion: 1,
        kind: 'executionPlan',
        provenanceId,
        iteration,
        selectedTaskId: selectedTask?.id ?? null,
        selectedTaskTitle: selectedTask?.title ?? null,
        taskValidationHint,
        effectiveValidationCommand,
        normalizedValidationCommandFrom,
        promptKind,
        promptTarget,
        selectionReason: promptDecision.reason,
        rootPolicy,
        templatePath: promptRender.templatePath,
        promptPath,
        promptArtifactPath: artifactPaths.promptPath,
        promptEvidencePath: artifactPaths.promptEvidencePath,
        promptHash: (0, integrity_1.hashText)(prompt),
        promptByteLength: (0, integrity_1.utf8ByteLength)(prompt),
        artifactDir: artifactPaths.directory,
        createdAt: new Date().toISOString()
    };
    const executionPlanHash = (0, integrity_1.hashJson)(executionPlan);
    await (0, artifactStore_1.writeExecutionPlanArtifact)({
        paths: artifactPaths,
        artifactRootDir: snapshot.paths.artifactDir,
        plan: executionPlan
    });
    const promptGeneratedAt = new Date().toISOString();
    const beforeGit = includeVerifierContext
        && (config.verifierModes.includes('gitDiff') || config.gitCheckpointMode !== 'off')
        ? await (0, verifier_1.captureGitStatus)(rootPolicy.verificationRootPath)
        : EMPTY_GIT_STATUS;
    logger.info('Prepared Ralph prompt context.', {
        rootPath,
        promptKind,
        promptTarget,
        promptSelectionReason: promptDecision.reason,
        iteration,
        promptPath,
        promptTemplatePath: promptRender.templatePath,
        promptArtifactPath: executionPlan.promptArtifactPath,
        promptHash: executionPlan.promptHash,
        executionPlanPath: artifactPaths.executionPlanPath,
        promptEvidence,
        selectedTaskId: selectedTask?.id ?? null,
        taskValidationHint,
        effectiveValidationCommand,
        normalizedValidationCommandFrom
    });
    const preparedContext = {
        config,
        rootPath,
        rootPolicy,
        state: snapshot.state,
        paths: snapshot.paths,
        provenanceId,
        trustLevel,
        promptKind,
        promptTarget,
        promptSelectionReason: promptDecision.reason,
        promptPath,
        promptTemplatePath: promptRender.templatePath,
        promptEvidence,
        executionPlan,
        executionPlanHash,
        executionPlanPath: artifactPaths.executionPlanPath,
        prompt,
        iteration,
        objectiveText,
        progressText,
        tasksText,
        taskFile,
        taskCounts: effectiveTaskCounts,
        summary,
        selectedTask,
        taskValidationHint,
        effectiveValidationCommand,
        normalizedValidationCommandFrom,
        validationCommand: effectiveValidationCommand,
        preflightReport,
        persistedPreflightReport,
        preflightSummaryText,
        provenanceBundlePaths,
        createdPaths: snapshot.createdPaths,
        beforeCoreState,
        beforeGit,
        phaseSeed: {
            inspectStartedAt,
            inspectFinishedAt: taskSelectedAt,
            taskSelectedAt,
            promptGeneratedAt
        }
    };
    await input.persistPreparedProvenanceBundle(preparedContext);
    return preparedContext;
}
async function selectClaimedTask(taskFile, claimFilePath, provenanceId) {
    for (const candidate of (0, taskFile_1.listSelectableTasks)(taskFile)) {
        const claimResult = await (0, taskFile_1.acquireClaim)(claimFilePath, candidate.id, types_1.DEFAULT_RALPH_AGENT_ID, provenanceId);
        if (claimResult.outcome === 'acquired' || claimResult.outcome === 'already_held') {
            return candidate;
        }
    }
    return null;
}
//# sourceMappingURL=iterationPreparation.js.map