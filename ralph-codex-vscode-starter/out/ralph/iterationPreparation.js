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
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const providers_1 = require("../config/providers");
const readConfig_1 = require("../config/readConfig");
const promptBuilder_1 = require("../prompt/promptBuilder");
const processRunner_1 = require("../services/processRunner");
const workspaceScanner_1 = require("../services/workspaceScanner");
const codexCliSupport_1 = require("../services/codexCliSupport");
const integrity_1 = require("./integrity");
const rootPolicy_1 = require("./rootPolicy");
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
async function findLatestHandoffPath(handoffDir, agentId, iteration) {
    // Fast path: check the immediately preceding iteration first
    const directPath = path.join(handoffDir, `${agentId}-${String(iteration - 1).padStart(3, '0')}.json`);
    try {
        await fs.access(directPath);
        return directPath;
    }
    catch {
        // fall through to directory scan
    }
    // Scan directory for the most recent handoff before this iteration
    try {
        const files = await fs.readdir(handoffDir);
        const prefix = `${agentId}-`;
        const suffix = '.json';
        let latestIteration = -1;
        for (const file of files) {
            if (!file.startsWith(prefix) || !file.endsWith(suffix)) {
                continue;
            }
            const numStr = file.slice(prefix.length, -suffix.length);
            const num = parseInt(numStr, 10);
            if (!isNaN(num) && num < iteration && num > latestIteration) {
                latestIteration = num;
            }
        }
        if (latestIteration < 0) {
            return null;
        }
        return path.join(handoffDir, `${agentId}-${String(latestIteration).padStart(3, '0')}.json`);
    }
    catch {
        return null;
    }
}
async function readSessionHandoff(handoffDir, agentId, iteration) {
    if (iteration <= 1) {
        return null;
    }
    const handoffPath = await findLatestHandoffPath(handoffDir, agentId, iteration);
    if (!handoffPath) {
        return null;
    }
    try {
        const raw = JSON.parse(await fs.readFile(handoffPath, 'utf8'));
        return {
            agentId: typeof raw.agentId === 'string' ? raw.agentId : agentId,
            iteration: typeof raw.iteration === 'number' ? raw.iteration : iteration - 1,
            selectedTaskId: typeof raw.selectedTaskId === 'string' ? raw.selectedTaskId : null,
            selectedTaskTitle: typeof raw.selectedTaskTitle === 'string' ? raw.selectedTaskTitle : null,
            stopReason: typeof raw.stopReason === 'string'
                ? raw.stopReason
                : 'verification_passed_no_remaining_subtasks',
            completionClassification: typeof raw.completionClassification === 'string'
                ? raw.completionClassification
                : 'no_progress',
            humanSummary: typeof raw.humanSummary === 'string' ? raw.humanSummary : 'none',
            pendingBlocker: typeof raw.pendingBlocker === 'string' ? raw.pendingBlocker : null,
            validationFailureSignature: typeof raw.validationFailureSignature === 'string'
                ? raw.validationFailureSignature
                : null,
            remainingTaskCount: typeof raw.backlog === 'object' && raw.backlog !== null
                && typeof raw.backlog.remainingTaskCount === 'number'
                ? raw.backlog.remainingTaskCount
                : null
        };
    }
    catch {
        return null;
    }
}
async function prepareIterationContext(input) {
    const { workspaceFolder, progress, includeVerifierContext, stateManager, logger } = input;
    const inspectStartedAt = new Date().toISOString();
    progress.report({ message: 'Inspecting Ralph workspace' });
    const config = {
        ...(0, readConfig_1.readConfig)(workspaceFolder),
        ...(input.configOverrides ?? {})
    };
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
    const [progressText, taskInspection, taskCounts, summary, initialCoreState] = await Promise.all([
        stateManager.readProgressText(snapshot.paths),
        stateManager.inspectTaskFile(snapshot.paths),
        stateManager.taskCounts(snapshot.paths).catch((err) => {
            logger.warn('Failed to read task counts during iteration preparation.', { error: err });
            return null;
        }),
        (0, workspaceScanner_1.scanWorkspaceCached)(rootPath, workspaceFolder.name, {
            focusPath,
            inspectionRootOverride: config.inspectionRootOverride
        }),
        (0, verifier_1.captureCoreState)(snapshot.paths)
    ]);
    const tasksText = taskInspection.text ?? initialCoreState.tasksText;
    const taskFile = taskInspection.taskFile ?? initialCoreState.taskFile;
    const effectiveTaskCounts = taskCounts ?? (0, taskFile_1.countTaskStatuses)(taskFile);
    const taskSelectedAt = new Date().toISOString();
    const iteration = await stateManager.allocateIteration(rootPath, snapshot.paths);
    const sessionHandoff = await readSessionHandoff(snapshot.paths.handoffDir, config.agentId, iteration);
    const promptTarget = includeVerifierContext ? 'cliExec' : 'ideHandoff';
    const provenanceId = (0, integrity_1.createProvenanceId)({
        iteration,
        promptTarget,
        createdAt: taskSelectedAt
    });
    const claimedSelection = promptTarget === 'cliExec'
        ? await selectClaimedTask(rootPath, config, taskFile, snapshot.paths.taskFilePath, snapshot.paths.claimFilePath, provenanceId, config.agentId)
        : {
            task: (0, taskFile_1.selectNextTask)(taskFile),
            claim: null
        };
    const selectedTask = claimedSelection.task;
    const selectedTaskClaim = claimedSelection.claim;
    // Re-capture after selectClaimedTask may have marked the selected task in_progress so that
    // the todo→in_progress bookkeeping change is not counted as durable agent progress.
    const beforeCoreState = promptTarget === 'cliExec'
        ? await (0, verifier_1.captureCoreState)(snapshot.paths)
        : initialCoreState;
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
    const cliCommandPath = (0, providers_1.getCliCommandPath)(config);
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
    const [artifactReadinessDiagnostics, agentHealthDiagnostics] = await Promise.all([
        (0, preflight_1.inspectPreflightArtifactReadiness)({
            rootPath,
            artifactRootDir: snapshot.paths.artifactDir,
            promptDir: snapshot.paths.promptDir,
            runDir: snapshot.paths.runDir,
            stateFilePath: snapshot.paths.stateFilePath,
            generatedArtifactRetentionCount: config.generatedArtifactRetentionCount,
            provenanceBundleRetentionCount: config.provenanceBundleRetentionCount
        }),
        (0, preflight_1.checkStaleState)({
            stateFilePath: snapshot.paths.stateFilePath,
            taskFilePath: snapshot.paths.taskFilePath,
            claimFilePath: snapshot.paths.claimFilePath,
            artifactDir: snapshot.paths.artifactDir,
            staleClaimTtlMs: config.claimTtlHours * 60 * 60 * 1000,
            staleLockThresholdMs: config.staleLockThresholdMinutes * 60 * 1000
        })
    ]);
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
        artifactReadinessDiagnostics,
        agentHealthDiagnostics,
        sessionHandoff
    });
    const preflightArtifactPaths = (0, artifactStore_1.resolvePreflightArtifactPaths)(snapshot.paths.artifactDir, iteration);
    const { persistedReport: persistedPreflightReport, humanSummary: preflightSummaryText } = await (0, artifactStore_1.writePreflightArtifacts)({
        paths: preflightArtifactPaths,
        artifactRootDir: snapshot.paths.artifactDir,
        agentId: config.agentId,
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
        validationCommand: effectiveValidationCommand,
        sessionHandoff
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
        sessionHandoff,
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
        agentId: config.agentId,
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
        selectedTaskClaim,
        taskValidationHint,
        effectiveValidationCommand,
        normalizedValidationCommandFrom,
        validationCommand: effectiveValidationCommand,
        preflightReport,
        persistedPreflightReport,
        preflightSummaryText,
        sessionHandoff,
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
async function selectClaimedTask(rootPath, config, taskFile, taskFilePath, claimFilePath, provenanceId, agentId) {
    for (const candidate of (0, taskFile_1.listSelectableTasks)(taskFile)) {
        const claimBranches = config.scmStrategy === 'branch-per-task'
            ? await prepareTaskBranchWorkspace(rootPath, candidate)
            : null;
        const claimResult = await (0, taskFile_1.acquireClaim)(claimFilePath, candidate.id, agentId, provenanceId, {
            ...(claimBranches ?? {}),
            ttlMs: config.claimTtlHours * 60 * 60 * 1000
        });
        if (claimResult.outcome === 'acquired' || claimResult.outcome === 'already_held') {
            if (candidate.status === 'todo') {
                await (0, taskFile_1.markTaskInProgress)(taskFilePath, candidate.id);
            }
            return {
                task: candidate,
                claim: claimResult.claim ?? claimResult.canonicalClaim
            };
        }
    }
    return {
        task: null,
        claim: null
    };
}
async function prepareTaskBranchWorkspace(rootPath, task) {
    const baseBranch = await currentGitBranch(rootPath);
    const featureBranch = `ralph/${task.id}`;
    if (task.parentId) {
        const integrationBranch = `ralph/integration/${task.parentId}`;
        await ensureGitBranch(rootPath, integrationBranch, baseBranch);
        await ensureGitBranch(rootPath, featureBranch, integrationBranch);
        await checkoutGitBranch(rootPath, featureBranch);
        return {
            baseBranch,
            integrationBranch,
            featureBranch
        };
    }
    await ensureGitBranch(rootPath, featureBranch, baseBranch);
    await checkoutGitBranch(rootPath, featureBranch);
    return {
        baseBranch,
        featureBranch
    };
}
async function currentGitBranch(rootPath) {
    const result = await (0, processRunner_1.runProcess)('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: rootPath });
    if (result.code !== 0) {
        const failure = (result.stderr || result.stdout || `exit code ${result.code}`).trim();
        throw new Error(`git rev-parse --abbrev-ref HEAD failed: ${failure}`);
    }
    const branch = result.stdout.trim();
    if (!branch) {
        throw new Error('git rev-parse --abbrev-ref HEAD returned an empty branch name.');
    }
    return branch;
}
async function branchExists(rootPath, branchName) {
    const result = await (0, processRunner_1.runProcess)('git', ['rev-parse', '--verify', branchName], { cwd: rootPath });
    return result.code === 0;
}
async function ensureGitBranch(rootPath, branchName, startPoint) {
    if (await branchExists(rootPath, branchName)) {
        return;
    }
    const result = await (0, processRunner_1.runProcess)('git', ['checkout', '-b', branchName, startPoint], { cwd: rootPath });
    if (result.code !== 0) {
        const failure = (result.stderr || result.stdout || `exit code ${result.code}`).trim();
        throw new Error(`git checkout -b ${branchName} ${startPoint} failed: ${failure}`);
    }
}
async function checkoutGitBranch(rootPath, branchName) {
    const result = await (0, processRunner_1.runProcess)('git', ['checkout', branchName], { cwd: rootPath });
    if (result.code !== 0) {
        const failure = (result.stderr || result.stdout || `exit code ${result.code}`).trim();
        throw new Error(`git checkout ${branchName} failed: ${failure}`);
    }
}
//# sourceMappingURL=iterationPreparation.js.map