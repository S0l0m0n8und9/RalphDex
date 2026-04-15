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
exports.readJsonArtifact = readJsonArtifact;
exports.firstExistingPath = firstExistingPath;
exports.normalizeExecutionPlan = normalizeExecutionPlan;
exports.normalizePromptEvidence = normalizePromptEvidence;
exports.normalizeCliInvocation = normalizeCliInvocation;
exports.normalizeProvenanceBundle = normalizeProvenanceBundle;
exports.normalizeLatestRemediation = normalizeLatestRemediation;
exports.normalizeTaskRemediationArtifact = normalizeTaskRemediationArtifact;
exports.normalizeCompletionReportArtifact = normalizeCompletionReportArtifact;
exports.collectStatusSnapshot = collectStatusSnapshot;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const providers_1 = require("../config/providers");
const readConfig_1 = require("../config/readConfig");
const preflight_1 = require("../ralph/preflight");
const rootPolicy_1 = require("../ralph/rootPolicy");
const statusReport_1 = require("../ralph/statusReport");
const complexityScorer_1 = require("../ralph/complexityScorer");
const taskFile_1 = require("../ralph/taskFile");
const artifactStore_1 = require("../ralph/artifactStore");
const verifier_1 = require("../ralph/verifier");
const pipeline_1 = require("../ralph/pipeline");
const orchestrationSupervisor_1 = require("../ralph/orchestrationSupervisor");
const deadLetter_1 = require("../ralph/deadLetter");
const failureDiagnostics_1 = require("../ralph/failureDiagnostics");
const recoveryOrchestrator_1 = require("../ralph/recoveryOrchestrator");
const codexCliSupport_1 = require("../services/codexCliSupport");
const fs_1 = require("../util/fs");
const validate_1 = require("../util/validate");
const workspaceScanner_1 = require("../services/workspaceScanner");
async function readJsonArtifact(target) {
    if (!target) {
        return null;
    }
    try {
        return JSON.parse(await fs.readFile(target, 'utf8'));
    }
    catch {
        return null;
    }
}
async function firstExistingPath(candidates) {
    for (const candidate of candidates) {
        if (await (0, fs_1.pathExists)(candidate)) {
            return candidate ?? null;
        }
    }
    return null;
}
function normalizeExecutionPlan(candidate) {
    return (0, validate_1.validateRecord)(candidate, {
        kind: ['literal', 'executionPlan'],
        iteration: 'number',
        promptKind: 'string',
        promptTarget: 'string',
        templatePath: 'string',
        promptArtifactPath: 'string',
        promptHash: 'string'
    });
}
function normalizePromptEvidence(candidate) {
    return (0, validate_1.validateRecord)(candidate, {
        iteration: 'number',
        kind: 'string',
        target: 'string',
        templatePath: 'string',
        selectionReason: 'string'
    });
}
function normalizeCliInvocation(candidate) {
    return (0, validate_1.validateRecord)(candidate, {
        kind: ['literal', 'cliInvocation'],
        iteration: 'number',
        commandPath: 'string',
        args: 'array',
        promptArtifactPath: 'string',
        stdinHash: 'string'
    });
}
function normalizeProvenanceBundle(candidate) {
    return (0, validate_1.validateRecord)(candidate, {
        kind: ['literal', 'provenanceBundle'],
        provenanceId: 'string',
        iteration: 'number',
        promptKind: 'string',
        promptTarget: 'string',
        trustLevel: 'string',
        bundleDir: 'string',
        status: 'string',
        summary: 'string'
    });
}
function normalizeLatestRemediation(candidate) {
    if (typeof candidate !== 'object' || candidate === null) {
        return null;
    }
    const record = candidate;
    if (typeof record.trigger !== 'string'
        || typeof record.attemptCount !== 'number'
        || typeof record.action !== 'string'
        || typeof record.humanReviewRecommended !== 'boolean'
        || typeof record.summary !== 'string'
        || !Array.isArray(record.evidence)
        || record.evidence.some((entry) => typeof entry !== 'string')) {
        return null;
    }
    return {
        trigger: record.trigger,
        attemptCount: record.attemptCount,
        action: record.action,
        humanReviewRecommended: record.humanReviewRecommended,
        summary: record.summary,
        evidence: record.evidence,
        suggestedChildTasks: Array.isArray(record.suggestedChildTasks)
            ? record.suggestedChildTasks
                .filter((entry) => {
                if (typeof entry !== 'object' || entry === null) {
                    return false;
                }
                const child = entry;
                return typeof child.id === 'string'
                    && typeof child.title === 'string'
                    && typeof child.parentId === 'string'
                    && (child.validation === null || typeof child.validation === 'string')
                    && typeof child.rationale === 'string'
                    && Array.isArray(child.dependsOn)
                    && child.dependsOn.every((dependency) => {
                        if (typeof dependency !== 'object' || dependency === null) {
                            return false;
                        }
                        const record = dependency;
                        return typeof record.taskId === 'string' && typeof record.reason === 'string';
                    });
            })
            : []
    };
}
function normalizeTaskRemediationArtifact(candidate) {
    if (typeof candidate !== 'object' || candidate === null) {
        return null;
    }
    const record = candidate;
    if (record.kind !== 'taskRemediation'
        || typeof record.iteration !== 'number'
        || (typeof record.selectedTaskId !== 'string' && record.selectedTaskId !== null)
        || typeof record.action !== 'string'
        || !Array.isArray(record.suggestedChildTasks)) {
        return null;
    }
    const latestRemediation = normalizeLatestRemediation(candidate);
    if (!latestRemediation) {
        return null;
    }
    return {
        schemaVersion: 1,
        kind: 'taskRemediation',
        provenanceId: typeof record.provenanceId === 'string' ? record.provenanceId : null,
        iteration: record.iteration,
        selectedTaskId: record.selectedTaskId,
        selectedTaskTitle: typeof record.selectedTaskTitle === 'string' ? record.selectedTaskTitle : null,
        trigger: latestRemediation.trigger,
        attemptCount: latestRemediation.attemptCount,
        action: latestRemediation.action,
        humanReviewRecommended: latestRemediation.humanReviewRecommended,
        summary: latestRemediation.summary,
        rationale: typeof record.rationale === 'string' ? record.rationale : '',
        proposedAction: typeof record.proposedAction === 'string' ? record.proposedAction : latestRemediation.summary,
        evidence: latestRemediation.evidence,
        triggeringHistory: Array.isArray(record.triggeringHistory)
            ? record.triggeringHistory
            : [],
        suggestedChildTasks: latestRemediation.suggestedChildTasks ?? [],
        artifactDir: typeof record.artifactDir === 'string' ? record.artifactDir : '',
        iterationResultPath: typeof record.iterationResultPath === 'string' ? record.iterationResultPath : '',
        createdAt: typeof record.createdAt === 'string' ? record.createdAt : ''
    };
}
function normalizeCompletionReportArtifact(candidate) {
    if (typeof candidate !== 'object' || candidate === null) {
        return null;
    }
    const record = candidate;
    if (record.kind !== 'completionReport'
        || typeof record.status !== 'string'
        || (typeof record.selectedTaskId !== 'string' && record.selectedTaskId !== null)
        || !Array.isArray(record.warnings)) {
        return null;
    }
    const report = record.report;
    const normalizedReport = typeof report === 'object' && report !== null
        ? report
        : null;
    return {
        schemaVersion: 1,
        kind: 'completionReport',
        status: record.status,
        rejectionReason: typeof record.rejectionReason === 'string' ? record.rejectionReason : null,
        selectedTaskId: record.selectedTaskId,
        report: normalizedReport,
        rawBlock: typeof record.rawBlock === 'string' ? record.rawBlock : null,
        parseError: typeof record.parseError === 'string' ? record.parseError : null,
        warnings: record.warnings.filter((warning) => typeof warning === 'string')
    };
}
async function readRecommendedSkills(filePath) {
    try {
        const raw = JSON.parse(await fs.readFile(filePath, 'utf8'));
        if (!Array.isArray(raw)) {
            return [];
        }
        return raw.filter((entry) => typeof entry === 'object'
            && entry !== null
            && typeof entry.name === 'string'
            && typeof entry.rationale === 'string');
    }
    catch {
        return [];
    }
}
async function collectStatusSnapshot(workspaceFolder, stateManager, logger) {
    const config = (0, readConfig_1.readConfig)(workspaceFolder);
    const rawConfig = vscode.workspace.getConfiguration('ralphCodex', workspaceFolder.uri);
    const operatorModeProvenance = (0, readConfig_1.resolveOperatorModeProvenance)(rawConfig, config, config.operatorMode);
    const planningPassInspect = rawConfig.inspect('planningPass');
    const planningPassExplicit = planningPassInspect?.workspaceValue !== undefined
        || planningPassInspect?.globalValue !== undefined;
    const planningPassEnabledSource = planningPassExplicit ? 'explicit' : 'manifest-default';
    const budgetProfileInspect = rawConfig.inspect('promptBudgetProfile');
    const budgetProfileExplicit = budgetProfileInspect?.workspaceValue !== undefined
        || budgetProfileInspect?.globalValue !== undefined;
    const promptBudgetProfileSource = budgetProfileExplicit ? 'explicit' : 'manifest-default';
    const inspection = await stateManager.inspectWorkspace(workspaceFolder.uri.fsPath, config);
    await logger.setWorkspaceLogFile(inspection.paths.logFilePath);
    const taskInspection = inspection.fileStatus.taskFilePath
        ? await stateManager.inspectTaskFile(inspection.paths)
        : {
            taskFile: null,
            text: null,
            migrated: false,
            diagnostics: []
        };
    const taskCounts = taskInspection.taskFile
        ? await stateManager.taskCounts(inspection.paths).catch((err) => {
            logger.warn('Failed to read task counts for status snapshot.', { error: err });
            return null;
        })
        : null;
    let taskFileError = null;
    let selectedTask = null;
    if (taskInspection.taskFile) {
        selectedTask = (0, taskFile_1.selectNextTask)(taskInspection.taskFile);
    }
    else if (taskInspection.diagnostics.length > 0) {
        taskFileError = taskInspection.diagnostics.map((diagnostic) => diagnostic.message).join(' ');
    }
    const focusPath = vscode.window.activeTextEditor?.document.uri.scheme === 'file'
        ? vscode.window.activeTextEditor.document.uri.fsPath
        : null;
    const availableCommands = await vscode.commands.getCommands(true);
    const [workspaceScan, latestArtifacts, codexCliSupport] = await Promise.all([
        (0, workspaceScanner_1.scanWorkspaceCached)(workspaceFolder.uri.fsPath, workspaceFolder.name, {
            focusPath,
            inspectionRootOverride: config.inspectionRootOverride
        }),
        (0, statusReport_1.resolveLatestStatusArtifacts)(inspection.paths),
        (0, codexCliSupport_1.inspectCodexCliSupport)((0, providers_1.getCliCommandPath)(config))
    ]);
    const rootPolicy = (0, rootPolicy_1.deriveRootPolicy)(workspaceScan);
    const gitStatus = await (0, verifier_1.captureGitStatus)(rootPolicy.verificationRootPath);
    const ideCommandSupport = (0, codexCliSupport_1.inspectIdeCommandSupport)({
        preferredHandoffMode: config.preferredHandoffMode,
        openSidebarCommandId: config.openSidebarCommandId,
        newChatCommandId: config.newChatCommandId,
        availableCommands
    });
    const validationCommand = (0, verifier_1.normalizeValidationCommand)({
        command: (0, verifier_1.chooseValidationCommand)(workspaceScan, selectedTask, config.validationCommandOverride),
        workspaceRootPath: workspaceFolder.uri.fsPath,
        verificationRootPath: rootPolicy.verificationRootPath
    });
    const taskValidationHint = selectedTask?.validation?.trim() || null;
    const rawSelectedValidationCommand = (0, verifier_1.chooseValidationCommand)(workspaceScan, selectedTask, config.validationCommandOverride);
    const normalizedValidationCommandFrom = rawSelectedValidationCommand
        && validationCommand
        && rawSelectedValidationCommand !== validationCommand
        ? rawSelectedValidationCommand
        : null;
    const validationCommandReadiness = await (0, verifier_1.inspectValidationCommandReadiness)({
        command: validationCommand,
        rootPath: rootPolicy.verificationRootPath
    });
    const [artifactReadinessDiagnostics, staleStateDiagnostics, handoffHealthDiagnostics] = await Promise.all([
        (0, preflight_1.inspectPreflightArtifactReadiness)({
            rootPath: workspaceFolder.uri.fsPath,
            artifactRootDir: inspection.paths.artifactDir,
            promptDir: inspection.paths.promptDir,
            runDir: inspection.paths.runDir,
            stateFilePath: inspection.paths.stateFilePath,
            generatedArtifactRetentionCount: config.generatedArtifactRetentionCount,
            provenanceBundleRetentionCount: config.provenanceBundleRetentionCount
        }),
        (0, preflight_1.checkStaleState)({
            stateFilePath: inspection.paths.stateFilePath,
            taskFilePath: inspection.paths.taskFilePath,
            claimFilePath: inspection.paths.claimFilePath,
            artifactDir: inspection.paths.artifactDir,
            staleClaimTtlMs: config.watchdogStaleTtlMs
        }),
        (0, preflight_1.checkHandoffHealth)({ ralphRoot: inspection.paths.ralphDir })
    ]);
    const agentHealthDiagnostics = [...staleStateDiagnostics, ...handoffHealthDiagnostics];
    const claimGraph = await (0, taskFile_1.inspectTaskClaimGraph)(inspection.paths.claimFilePath);
    const [latestPromptEvidence, latestExecutionPlan, latestCliInvocation, latestRemediation, latestProvenanceBundle] = await Promise.all([
        readJsonArtifact(latestArtifacts.latestPromptEvidencePath).then(normalizePromptEvidence),
        readJsonArtifact(latestArtifacts.latestExecutionPlanPath).then(normalizeExecutionPlan),
        readJsonArtifact(latestArtifacts.latestCliInvocationPath).then(normalizeCliInvocation),
        readJsonArtifact(latestArtifacts.latestRemediationPath).then(normalizeLatestRemediation),
        readJsonArtifact(latestArtifacts.latestProvenanceBundlePath).then(normalizeProvenanceBundle)
    ]);
    const currentProvenanceId = latestExecutionPlan?.provenanceId
        ?? latestProvenanceBundle?.provenanceId
        ?? inspection.state.lastIteration?.provenanceId
        ?? null;
    const preflightReport = (0, preflight_1.buildPreflightReport)({
        rootPath: workspaceFolder.uri.fsPath,
        workspaceTrusted: vscode.workspace.isTrusted,
        config,
        taskInspection,
        taskCounts,
        selectedTask,
        currentProvenanceId,
        claimGraph,
        taskValidationHint,
        validationCommand,
        normalizedValidationCommandFrom,
        validationCommandReadiness,
        fileStatus: inspection.fileStatus,
        codexCliSupport,
        ideCommandSupport,
        artifactReadinessDiagnostics,
        agentHealthDiagnostics
    });
    const recommendedSkills = await readRecommendedSkills(path.join(workspaceFolder.uri.fsPath, '.ralph', 'recommended-skills.json'));
    const [generatedArtifactRetention, provenanceBundleRetention, latestPipelineEntry, deadLetterQueue] = await Promise.all([
        (0, artifactStore_1.inspectGeneratedArtifactRetention)({
            artifactRootDir: inspection.paths.artifactDir,
            promptDir: inspection.paths.promptDir,
            runDir: inspection.paths.runDir,
            stateFilePath: inspection.paths.stateFilePath,
            retentionCount: config.generatedArtifactRetentionCount
        }),
        (0, artifactStore_1.inspectProvenanceBundleRetention)({
            artifactRootDir: inspection.paths.artifactDir,
            retentionCount: config.provenanceBundleRetentionCount
        }),
        (0, pipeline_1.readLatestPipelineArtifact)(inspection.paths.artifactDir),
        (0, deadLetter_1.readDeadLetterQueue)(inspection.paths.deadLetterPath)
    ]);
    let orchestration = null;
    if (latestPipelineEntry?.artifact) {
        const runId = latestPipelineEntry.artifact.runId;
        const orchestrationPaths = (0, orchestrationSupervisor_1.resolveOrchestrationPaths)(inspection.paths.ralphDir, runId);
        try {
            const [graph, state] = await Promise.all([
                (0, orchestrationSupervisor_1.readOrchestrationGraph)(orchestrationPaths),
                (0, orchestrationSupervisor_1.readOrchestrationState)(orchestrationPaths)
            ]);
            const activeNode = graph.nodes.find((n) => n.id === state.cursor);
            const completedNodes = state.nodeStates
                .filter((ns) => ns.outcome === 'completed')
                .map((ns) => {
                const node = graph.nodes.find((n) => n.id === ns.nodeId);
                return {
                    nodeId: ns.nodeId,
                    label: node?.label ?? ns.nodeId,
                    outcome: ns.outcome,
                    finishedAt: ns.finishedAt
                };
            });
            const pendingBranchNodes = state.cursor
                ? graph.edges
                    .filter((e) => e.from === state.cursor)
                    .map((e) => {
                    const node = graph.nodes.find((n) => n.id === e.to);
                    return {
                        nodeId: e.to,
                        label: node?.label ?? e.to
                    };
                })
                : [];
            orchestration = {
                activeNodeId: state.cursor,
                activeNodeLabel: activeNode?.label ?? null,
                completedNodes,
                pendingBranchNodes
            };
        }
        catch {
            // no orchestration state for this run, or malformed — leave as null
        }
    }
    const deadLetterEntries = deadLetterQueue.entries;
    let lastFailureCategory = null;
    let recoveryAttemptCount = null;
    let latestFailureAnalysis = null;
    let latestFailureAnalysisPath = null;
    let recoveryStatePath = null;
    if (selectedTask) {
        const selectedFailureAnalysisPath = (0, failureDiagnostics_1.getFailureAnalysisPath)(inspection.paths.artifactDir, selectedTask.id);
        const selectedRecoveryStatePath = (0, recoveryOrchestrator_1.getRecoveryStatePath)(inspection.paths.artifactDir, selectedTask.id);
        const [failureAnalysisRaw, recoveryStateRaw] = await Promise.all([
            fs.readFile(selectedFailureAnalysisPath, 'utf8').catch(() => null),
            fs.readFile(selectedRecoveryStatePath, 'utf8').catch(() => null)
        ]);
        if (failureAnalysisRaw) {
            const parsed = (0, failureDiagnostics_1.parseFailureDiagnosticResponse)(failureAnalysisRaw);
            latestFailureAnalysis = parsed;
            lastFailureCategory = parsed?.rootCauseCategory ?? null;
            latestFailureAnalysisPath = selectedFailureAnalysisPath;
        }
        if (recoveryStateRaw) {
            try {
                const parsed = JSON.parse(recoveryStateRaw);
                recoveryAttemptCount = typeof parsed.attemptCount === 'number' ? parsed.attemptCount : null;
                recoveryStatePath = selectedRecoveryStatePath;
            }
            catch {
                // malformed JSON — leave null
            }
        }
    }
    const tierThresholds = {
        simpleThreshold: config.modelTiering.simpleThreshold,
        complexThreshold: config.modelTiering.complexThreshold
    };
    const taskFile = taskInspection.taskFile;
    const iterationHistory = inspection.state.iterationHistory;
    const effectiveTierInfo = selectedTask && taskFile
        ? (0, complexityScorer_1.deriveEffectiveTier)({ task: selectedTask, taskFile, iterationHistory, ...tierThresholds })
        : null;
    const lastTaskId = inspection.state.lastIteration?.selectedTaskId ?? null;
    const lastTask = lastTaskId && taskFile
        ? taskFile.tasks.find((task) => task.id === lastTaskId) ?? null
        : null;
    const lastTaskTierInfo = lastTask && taskFile
        ? (0, complexityScorer_1.deriveEffectiveTier)({ task: lastTask, taskFile, iterationHistory, ...tierThresholds })
        : null;
    return {
        workspaceName: workspaceFolder.name,
        rootPath: workspaceFolder.uri.fsPath,
        workspaceTrusted: vscode.workspace.isTrusted,
        nextIteration: inspection.state.nextIteration,
        lastIteration: inspection.state.lastIteration,
        runHistory: inspection.state.runHistory,
        iterationHistory,
        taskCounts,
        taskFileError,
        selectedTask,
        latestSummaryPath: latestArtifacts.latestSummaryPath,
        latestResultPath: latestArtifacts.latestResultPath,
        latestPreflightReportPath: latestArtifacts.latestPreflightReportPath,
        latestPreflightSummaryPath: latestArtifacts.latestPreflightSummaryPath,
        latestPromptPath: latestArtifacts.latestPromptPath,
        latestPromptEvidencePath: latestArtifacts.latestPromptEvidencePath,
        latestExecutionPlanPath: latestArtifacts.latestExecutionPlanPath,
        latestCliInvocationPath: latestArtifacts.latestCliInvocationPath,
        latestRemediationPath: latestArtifacts.latestRemediationPath,
        latestProvenanceBundlePath: latestArtifacts.latestProvenanceBundlePath,
        latestProvenanceSummaryPath: latestArtifacts.latestProvenanceSummaryPath,
        latestProvenanceFailurePath: latestArtifacts.latestProvenanceFailurePath,
        artifactDir: inspection.paths.artifactDir,
        stateFilePath: inspection.paths.stateFilePath,
        progressPath: inspection.paths.progressPath,
        taskFilePath: inspection.paths.taskFilePath,
        promptPath: inspection.state.lastIteration?.promptPath ?? inspection.state.lastPromptPath,
        latestPromptEvidence,
        latestExecutionPlan,
        latestCliInvocation,
        latestRemediation,
        latestProvenanceBundle,
        latestArtifactRepair: latestArtifacts.repair,
        generatedArtifactRetention,
        provenanceBundleRetention,
        generatedArtifactRetentionCount: config.generatedArtifactRetentionCount,
        provenanceBundleRetentionCount: config.provenanceBundleRetentionCount,
        verifierModes: config.verifierModes,
        gitCheckpointMode: config.gitCheckpointMode,
        validationCommandOverride: config.validationCommandOverride || null,
        agentCount: config.agentCount,
        workspaceScan,
        gitStatus,
        preflightReport,
        claimGraph,
        currentProvenanceId,
        latestPipelineRunPath: latestPipelineEntry?.artifactPath ?? null,
        latestPipelineRun: latestPipelineEntry?.artifact ?? null,
        recommendedSkills,
        effectiveTierInfo,
        lastTaskTierInfo,
        operatorMode: config.operatorMode,
        operatorModeProvenance,
        planningPassEnabled: config.planningPass.enabled,
        planningPassEnabledSource,
        promptBudgetProfile: config.promptBudgetProfile,
        promptBudgetProfileSource,
        deadLetterEntries,
        lastFailureCategory,
        recoveryAttemptCount,
        latestFailureAnalysis,
        latestFailureAnalysisPath,
        recoveryStatePath,
        orchestration
    };
}
//# sourceMappingURL=statusSnapshot.js.map