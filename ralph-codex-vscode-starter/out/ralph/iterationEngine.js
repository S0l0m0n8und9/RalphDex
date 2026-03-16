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
exports.RalphIterationEngine = void 0;
const fs = __importStar(require("fs/promises"));
const promptBuilder_1 = require("../prompt/promptBuilder");
const integrity_1 = require("./integrity");
const iterationPreparation_1 = require("./iterationPreparation");
const types_1 = require("./types");
const taskFile_1 = require("./taskFile");
const loopLogic_1 = require("./loopLogic");
const verifier_1 = require("./verifier");
const artifactStore_1 = require("./artifactStore");
const reconciliation_1 = require("./reconciliation");
const taskDecomposition_1 = require("./taskDecomposition");
const EMPTY_GIT_STATUS = {
    available: false,
    raw: '',
    entries: []
};
function toErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
function summarizeLastMessage(lastMessage, exitCode) {
    return lastMessage
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.length > 0)
        ?? (exitCode === null ? 'Execution skipped.' : `Exit code ${exitCode}`);
}
function controlPlaneRuntimeChanges(changedFiles) {
    const matches = new Set();
    for (const filePath of changedFiles) {
        const normalized = filePath.replace(/\\/g, '/');
        if (/^(?:.+\/)?package\.json$/.test(normalized)
            || /(?:^|\/)(?:src|out|prompt-templates)\//.test(normalized)) {
            matches.add(filePath);
        }
    }
    return Array.from(matches).sort();
}
function isBacklogExhausted(taskCounts) {
    return taskCounts.todo === 0 && taskCounts.in_progress === 0 && taskCounts.blocked === 0;
}
class RalphIntegrityFailureError extends Error {
    details;
    constructor(details) {
        super(details.message);
        this.details = details;
        this.name = 'RalphIntegrityFailureError';
    }
}
async function readVerifiedExecutionPlanArtifact(executionPlanPath, expectedExecutionPlanHash) {
    const planText = await fs.readFile(executionPlanPath, 'utf8').catch((error) => {
        throw new RalphIntegrityFailureError({
            stage: 'executionPlanHash',
            message: `Execution integrity check failed before launch: could not read execution plan ${executionPlanPath}: ${toErrorMessage(error)}`,
            expectedExecutionPlanHash,
            actualExecutionPlanHash: null,
            expectedPromptHash: null,
            actualPromptHash: null,
            expectedPayloadHash: null,
            actualPayloadHash: null
        });
    });
    const actualExecutionPlanHash = (0, integrity_1.hashText)(planText);
    if (actualExecutionPlanHash !== expectedExecutionPlanHash) {
        throw new RalphIntegrityFailureError({
            stage: 'executionPlanHash',
            message: `Execution integrity check failed before launch: execution plan hash ${actualExecutionPlanHash} did not match expected plan hash ${expectedExecutionPlanHash}.`,
            expectedExecutionPlanHash,
            actualExecutionPlanHash,
            expectedPromptHash: null,
            actualPromptHash: null,
            expectedPayloadHash: null,
            actualPayloadHash: null
        });
    }
    try {
        return JSON.parse(planText);
    }
    catch (error) {
        throw new RalphIntegrityFailureError({
            stage: 'executionPlanHash',
            message: `Execution integrity check failed before launch: could not parse execution plan ${executionPlanPath}: ${toErrorMessage(error)}`,
            expectedExecutionPlanHash,
            actualExecutionPlanHash,
            expectedPromptHash: null,
            actualPromptHash: null,
            expectedPayloadHash: null,
            actualPayloadHash: null
        });
    }
}
async function readVerifiedPromptArtifact(plan) {
    const promptArtifactText = await fs.readFile(plan.promptArtifactPath, 'utf8').catch((error) => {
        throw new RalphIntegrityFailureError({
            stage: 'promptArtifactHash',
            message: `Execution integrity check failed before launch: could not read prompt artifact ${plan.promptArtifactPath}: ${toErrorMessage(error)}`,
            expectedExecutionPlanHash: null,
            actualExecutionPlanHash: null,
            expectedPromptHash: plan.promptHash,
            actualPromptHash: null,
            expectedPayloadHash: null,
            actualPayloadHash: null
        });
    });
    const artifactHash = (0, integrity_1.hashText)(promptArtifactText);
    if (artifactHash !== plan.promptHash) {
        throw new RalphIntegrityFailureError({
            stage: 'promptArtifactHash',
            message: `Execution integrity check failed before launch: prompt artifact hash ${artifactHash} did not match planned prompt hash ${plan.promptHash}.`,
            expectedExecutionPlanHash: null,
            actualExecutionPlanHash: null,
            expectedPromptHash: plan.promptHash,
            actualPromptHash: artifactHash,
            expectedPayloadHash: null,
            actualPayloadHash: null
        });
    }
    return promptArtifactText;
}
function toIntegrityFailureError(error, prepared) {
    if (error instanceof RalphIntegrityFailureError) {
        return error;
    }
    const message = toErrorMessage(error);
    const stdinHashMatch = message.match(/stdin payload hash (\S+) did not match planned prompt hash (\S+)\./);
    if (stdinHashMatch) {
        return new RalphIntegrityFailureError({
            stage: 'stdinPayloadHash',
            message,
            expectedExecutionPlanHash: prepared.executionPlanHash,
            actualExecutionPlanHash: prepared.executionPlanHash,
            expectedPromptHash: prepared.executionPlan.promptHash,
            actualPromptHash: prepared.executionPlan.promptHash,
            expectedPayloadHash: stdinHashMatch[2],
            actualPayloadHash: stdinHashMatch[1]
        });
    }
    return null;
}
function runRecordFromIteration(mode, prepared, startedAt, result) {
    if (result.executionStatus === 'skipped') {
        return undefined;
    }
    return {
        agentId: result.agentId ?? types_1.DEFAULT_RALPH_AGENT_ID,
        provenanceId: prepared.provenanceId,
        iteration: prepared.iteration,
        mode,
        promptKind: prepared.promptKind,
        startedAt,
        finishedAt: result.finishedAt,
        status: result.executionStatus === 'succeeded' ? 'succeeded' : 'failed',
        exitCode: result.execution.exitCode,
        promptPath: prepared.promptPath,
        transcriptPath: result.execution.transcriptPath,
        lastMessagePath: result.execution.lastMessagePath,
        summary: result.summary
    };
}
class RalphIterationEngine {
    stateManager;
    strategies;
    logger;
    hooks;
    constructor(stateManager, strategies, logger, hooks = {}) {
        this.stateManager = stateManager;
        this.strategies = strategies;
        this.logger = logger;
        this.hooks = hooks;
    }
    createProvenanceBundle(input) {
        const { prepared, status, summary, executionPayloadHash = null, executionPayloadMatched = null, mismatchReason = null, cliInvocationPath = null, iterationResultPath = null, provenanceFailurePath = null, provenanceFailureSummaryPath = null } = input;
        return {
            schemaVersion: 1,
            kind: 'provenanceBundle',
            provenanceId: prepared.provenanceId,
            iteration: prepared.iteration,
            promptKind: prepared.promptKind,
            promptTarget: prepared.promptTarget,
            trustLevel: prepared.trustLevel,
            status,
            summary,
            rootPolicy: prepared.rootPolicy,
            selectedTaskId: prepared.selectedTask?.id ?? null,
            selectedTaskTitle: prepared.selectedTask?.title ?? null,
            artifactDir: (0, artifactStore_1.resolveIterationArtifactPaths)(prepared.paths.artifactDir, prepared.iteration).directory,
            bundleDir: prepared.provenanceBundlePaths.directory,
            preflightReportPath: prepared.provenanceBundlePaths.preflightReportPath,
            preflightSummaryPath: prepared.provenanceBundlePaths.preflightSummaryPath,
            promptArtifactPath: prepared.provenanceBundlePaths.promptPath,
            promptEvidencePath: prepared.provenanceBundlePaths.promptEvidencePath,
            executionPlanPath: prepared.provenanceBundlePaths.executionPlanPath,
            executionPlanHash: prepared.executionPlanHash,
            cliInvocationPath,
            iterationResultPath,
            provenanceFailurePath,
            provenanceFailureSummaryPath,
            promptHash: prepared.executionPlan.promptHash,
            promptByteLength: prepared.executionPlan.promptByteLength,
            executionPayloadHash,
            executionPayloadMatched,
            mismatchReason,
            createdAt: prepared.executionPlan.createdAt,
            updatedAt: new Date().toISOString()
        };
    }
    async persistPreparedProvenanceBundle(prepared) {
        const bundle = this.createProvenanceBundle({
            prepared,
            status: prepared.promptTarget === 'cliExec' ? 'prepared' : 'prepared',
            summary: prepared.promptTarget === 'cliExec'
                ? 'Prepared CLI execution provenance bundle.'
                : 'Prepared prompt provenance bundle for IDE handoff.'
        });
        const writeResult = await (0, artifactStore_1.writeProvenanceBundle)({
            artifactRootDir: prepared.paths.artifactDir,
            paths: prepared.provenanceBundlePaths,
            bundle,
            preflightReport: prepared.persistedPreflightReport,
            preflightSummary: prepared.preflightSummaryText,
            prompt: prepared.prompt,
            promptEvidence: prepared.promptEvidence,
            executionPlan: prepared.executionPlan,
            retentionCount: prepared.config.provenanceBundleRetentionCount
        });
        if (writeResult.retention.deletedBundleIds.length > 0) {
            this.logger.info('Cleaned up old Ralph provenance bundles after prepare.', {
                deletedBundleIds: writeResult.retention.deletedBundleIds,
                retentionCount: prepared.config.provenanceBundleRetentionCount
            });
        }
        await this.cleanupGeneratedArtifacts(prepared.paths, prepared.config.generatedArtifactRetentionCount, 'prepare');
    }
    async persistBlockedPreflightBundle(input) {
        const provenanceBundlePaths = (0, artifactStore_1.resolveProvenanceBundlePaths)(input.paths.artifactDir, input.provenanceId);
        const bundle = {
            schemaVersion: 1,
            kind: 'provenanceBundle',
            provenanceId: input.provenanceId,
            iteration: input.iteration,
            promptKind: input.promptKind,
            promptTarget: input.promptTarget,
            trustLevel: input.trustLevel,
            status: 'blocked',
            summary: input.persistedPreflightReport.summary,
            rootPolicy: input.rootPolicy,
            selectedTaskId: input.selectedTask?.id ?? null,
            selectedTaskTitle: input.selectedTask?.title ?? null,
            artifactDir: (0, artifactStore_1.resolveIterationArtifactPaths)(input.paths.artifactDir, input.iteration).directory,
            bundleDir: provenanceBundlePaths.directory,
            preflightReportPath: provenanceBundlePaths.preflightReportPath,
            preflightSummaryPath: provenanceBundlePaths.preflightSummaryPath,
            promptArtifactPath: null,
            promptEvidencePath: null,
            executionPlanPath: null,
            executionPlanHash: null,
            cliInvocationPath: null,
            iterationResultPath: null,
            provenanceFailurePath: null,
            provenanceFailureSummaryPath: null,
            promptHash: null,
            promptByteLength: null,
            executionPayloadHash: null,
            executionPayloadMatched: null,
            mismatchReason: null,
            createdAt: input.persistedPreflightReport.createdAt,
            updatedAt: new Date().toISOString()
        };
        const writeResult = await (0, artifactStore_1.writeProvenanceBundle)({
            artifactRootDir: input.paths.artifactDir,
            paths: provenanceBundlePaths,
            bundle,
            preflightReport: input.persistedPreflightReport,
            preflightSummary: input.preflightSummaryText,
            retentionCount: input.provenanceRetentionCount
        });
        if (writeResult.retention.deletedBundleIds.length > 0) {
            this.logger.info('Cleaned up old Ralph provenance bundles after blocked preflight.', {
                deletedBundleIds: writeResult.retention.deletedBundleIds
            });
        }
        await this.cleanupGeneratedArtifacts(input.paths, input.generatedArtifactRetentionCount, 'blocked preflight');
    }
    async persistIntegrityFailureBundle(prepared, failureError) {
        const failure = {
            schemaVersion: 1,
            kind: 'integrityFailure',
            provenanceId: prepared.provenanceId,
            iteration: prepared.iteration,
            promptKind: prepared.promptKind,
            promptTarget: prepared.promptTarget,
            trustLevel: prepared.trustLevel,
            stage: failureError.details.stage,
            blocked: true,
            summary: `Blocked before launch because ${failureError.details.stage} verification failed.`,
            message: failureError.details.message,
            artifactDir: (0, artifactStore_1.resolveIterationArtifactPaths)(prepared.paths.artifactDir, prepared.iteration).directory,
            executionPlanPath: prepared.executionPlanPath,
            promptArtifactPath: prepared.executionPlan.promptArtifactPath,
            cliInvocationPath: null,
            expectedExecutionPlanHash: failureError.details.expectedExecutionPlanHash,
            actualExecutionPlanHash: failureError.details.actualExecutionPlanHash,
            expectedPromptHash: failureError.details.expectedPromptHash,
            actualPromptHash: failureError.details.actualPromptHash,
            expectedPayloadHash: failureError.details.expectedPayloadHash,
            actualPayloadHash: failureError.details.actualPayloadHash,
            createdAt: new Date().toISOString()
        };
        const bundle = this.createProvenanceBundle({
            prepared,
            status: 'blocked',
            summary: failure.summary,
            executionPayloadHash: failure.actualPayloadHash,
            executionPayloadMatched: false,
            mismatchReason: failure.message,
            provenanceFailurePath: prepared.provenanceBundlePaths.provenanceFailurePath,
            provenanceFailureSummaryPath: prepared.provenanceBundlePaths.provenanceFailureSummaryPath
        });
        const writeResult = await (0, artifactStore_1.writeProvenanceBundle)({
            artifactRootDir: prepared.paths.artifactDir,
            paths: prepared.provenanceBundlePaths,
            bundle,
            preflightReport: prepared.persistedPreflightReport,
            preflightSummary: prepared.preflightSummaryText,
            prompt: prepared.prompt,
            promptEvidence: prepared.promptEvidence,
            executionPlan: prepared.executionPlan,
            failure,
            retentionCount: prepared.config.provenanceBundleRetentionCount
        });
        if (writeResult.retention.deletedBundleIds.length > 0) {
            this.logger.info('Cleaned up old Ralph provenance bundles after integrity failure.', {
                deletedBundleIds: writeResult.retention.deletedBundleIds,
                retentionCount: prepared.config.provenanceBundleRetentionCount
            });
        }
        await this.cleanupGeneratedArtifacts(prepared.paths, prepared.config.generatedArtifactRetentionCount, 'integrity failure');
    }
    async cleanupGeneratedArtifacts(paths, retentionCount, stage) {
        const retention = await (0, artifactStore_1.cleanupGeneratedArtifacts)({
            artifactRootDir: paths.artifactDir,
            promptDir: paths.promptDir,
            runDir: paths.runDir,
            stateFilePath: paths.stateFilePath,
            retentionCount
        });
        if (retention.deletedIterationDirectories.length === 0
            && retention.deletedPromptFiles.length === 0
            && retention.deletedRunArtifactBaseNames.length === 0) {
            return;
        }
        this.logger.info(`Cleaned up generated Ralph artifacts after ${stage}.`, {
            retentionCount,
            deletedIterationDirectories: retention.deletedIterationDirectories,
            protectedRetainedIterationDirectories: retention.protectedRetainedIterationDirectories,
            deletedPromptFiles: retention.deletedPromptFiles,
            protectedRetainedPromptFiles: retention.protectedRetainedPromptFiles,
            deletedRunArtifactBaseNames: retention.deletedRunArtifactBaseNames,
            protectedRetainedRunArtifactBaseNames: retention.protectedRetainedRunArtifactBaseNames
        });
    }
    async preparePrompt(workspaceFolder, progress) {
        const prepared = await (0, iterationPreparation_1.prepareIterationContext)({
            workspaceFolder,
            progress,
            includeVerifierContext: false,
            stateManager: this.stateManager,
            logger: this.logger,
            persistBlockedPreflightBundle: (input) => this.persistBlockedPreflightBundle(input),
            persistPreparedProvenanceBundle: (preparedContext) => this.persistPreparedProvenanceBundle(preparedContext)
        });
        return {
            ...prepared
        };
    }
    async runCliIteration(workspaceFolder, mode, progress, options) {
        const prepared = await (0, iterationPreparation_1.prepareIterationContext)({
            workspaceFolder,
            progress,
            includeVerifierContext: true,
            stateManager: this.stateManager,
            logger: this.logger,
            persistBlockedPreflightBundle: (input) => this.persistBlockedPreflightBundle(input),
            persistPreparedProvenanceBundle: (preparedContext) => this.persistPreparedProvenanceBundle(preparedContext)
        });
        try {
            const artifactPaths = (0, artifactStore_1.resolveIterationArtifactPaths)(prepared.paths.artifactDir, prepared.iteration);
            const startedAt = prepared.phaseSeed.inspectStartedAt;
            const phaseTimestamps = {
                inspectStartedAt: prepared.phaseSeed.inspectStartedAt,
                inspectFinishedAt: prepared.phaseSeed.inspectFinishedAt,
                taskSelectedAt: prepared.phaseSeed.taskSelectedAt,
                promptGeneratedAt: prepared.phaseSeed.promptGeneratedAt,
                resultCollectedAt: startedAt,
                verificationFinishedAt: startedAt,
                classifiedAt: startedAt
            };
            progress.report({
                message: `Executing Ralph iteration ${prepared.iteration}`
            });
            this.strategies.configureCliProvider(prepared.config);
            const execStrategy = this.strategies.getCliExecStrategy();
            if (!execStrategy.runExec) {
                throw new Error('The configured CLI strategy does not support exec.');
            }
            let executionStatus = 'skipped';
            let executionWarnings = [];
            let executionErrors = [];
            let execStdout = '';
            let execStderr = '';
            let execExitCode = null;
            let execStdinHash = null;
            let transcriptPath;
            let lastMessagePath;
            let lastMessage = '';
            let invocation;
            const shouldExecutePrompt = prepared.selectedTask !== null || prepared.promptKind === 'replenish-backlog';
            if (shouldExecutePrompt) {
                const artifactBaseName = (0, promptBuilder_1.createArtifactBaseName)(prepared.promptKind, prepared.iteration);
                const runArtifacts = this.stateManager.runArtifactPaths(prepared.paths, artifactBaseName);
                this.logger.info('Running Ralph iteration.', {
                    iteration: prepared.iteration,
                    mode,
                    promptPath: prepared.promptPath,
                    promptArtifactPath: prepared.executionPlan.promptArtifactPath,
                    promptHash: prepared.executionPlan.promptHash,
                    selectedTaskId: prepared.selectedTask?.id ?? null,
                    validationCommand: prepared.validationCommand
                });
                try {
                    if (this.hooks.beforeCliExecutionIntegrityCheck) {
                        await this.hooks.beforeCliExecutionIntegrityCheck(prepared);
                    }
                    const verifiedPlan = await readVerifiedExecutionPlanArtifact(prepared.executionPlanPath, prepared.executionPlanHash);
                    const promptArtifactText = await readVerifiedPromptArtifact(verifiedPlan);
                    phaseTimestamps.executionStartedAt = new Date().toISOString();
                    const execResult = await execStrategy.runExec({
                        commandPath: prepared.config.cliProvider === 'claude'
                            ? prepared.config.claudeCommandPath
                            : prepared.config.codexCommandPath,
                        workspaceRoot: prepared.rootPath,
                        executionRoot: prepared.rootPolicy.executionRootPath,
                        prompt: promptArtifactText,
                        promptPath: verifiedPlan.promptArtifactPath,
                        promptHash: verifiedPlan.promptHash,
                        promptByteLength: verifiedPlan.promptByteLength,
                        transcriptPath: runArtifacts.transcriptPath,
                        lastMessagePath: runArtifacts.lastMessagePath,
                        model: prepared.config.model,
                        reasoningEffort: prepared.config.reasoningEffort,
                        sandboxMode: prepared.config.sandboxMode,
                        approvalMode: prepared.config.approvalMode,
                        onStdoutChunk: (chunk) => this.logger.info('codex stdout', { iteration: prepared.iteration, chunk }),
                        onStderrChunk: (chunk) => this.logger.warn('codex stderr', { iteration: prepared.iteration, chunk })
                    });
                    phaseTimestamps.executionFinishedAt = new Date().toISOString();
                    executionStatus = execResult.exitCode === 0 ? 'succeeded' : 'failed';
                    executionWarnings = execResult.warnings;
                    executionErrors = execResult.exitCode === 0 ? [] : [execResult.message];
                    execStdout = execResult.stdout;
                    execStderr = execResult.stderr;
                    execExitCode = execResult.exitCode;
                    execStdinHash = execResult.stdinHash;
                    transcriptPath = execResult.transcriptPath;
                    lastMessagePath = execResult.lastMessagePath;
                    lastMessage = execResult.lastMessage;
                    invocation = {
                        schemaVersion: 1,
                        kind: 'cliInvocation',
                        provenanceId: prepared.provenanceId,
                        iteration: prepared.iteration,
                        commandPath: prepared.config.cliProvider === 'claude'
                            ? prepared.config.claudeCommandPath
                            : prepared.config.codexCommandPath,
                        args: execResult.args,
                        reasoningEffort: prepared.config.reasoningEffort,
                        workspaceRoot: prepared.rootPath,
                        rootPolicy: prepared.rootPolicy,
                        promptArtifactPath: verifiedPlan.promptArtifactPath,
                        promptHash: verifiedPlan.promptHash,
                        promptByteLength: verifiedPlan.promptByteLength,
                        stdinHash: execResult.stdinHash,
                        transcriptPath: execResult.transcriptPath,
                        lastMessagePath: execResult.lastMessagePath,
                        createdAt: new Date().toISOString()
                    };
                    await (0, artifactStore_1.writeCliInvocationArtifact)({
                        paths: artifactPaths,
                        artifactRootDir: prepared.paths.artifactDir,
                        invocation
                    });
                }
                catch (error) {
                    const integrityFailure = toIntegrityFailureError(error, prepared);
                    if (integrityFailure) {
                        phaseTimestamps.executionStartedAt = phaseTimestamps.executionStartedAt ?? new Date().toISOString();
                        phaseTimestamps.executionFinishedAt = new Date().toISOString();
                        await this.persistIntegrityFailureBundle(prepared, integrityFailure);
                    }
                    throw error;
                }
            }
            else {
                executionWarnings = ['No actionable Ralph task was selected; execution was skipped.'];
                phaseTimestamps.executionStartedAt = new Date().toISOString();
                phaseTimestamps.executionFinishedAt = phaseTimestamps.executionStartedAt;
            }
            phaseTimestamps.resultCollectedAt = new Date().toISOString();
            const afterCoreStateBeforeReconciliation = await (0, verifier_1.captureCoreState)(prepared.paths);
            const shouldCaptureGit = prepared.config.verifierModes.includes('gitDiff') || prepared.config.gitCheckpointMode !== 'off';
            const afterGit = shouldCaptureGit ? await (0, verifier_1.captureGitStatus)(prepared.rootPolicy.verificationRootPath) : EMPTY_GIT_STATUS;
            progress.report({ message: 'Running Ralph verifiers' });
            const validationVerification = prepared.config.verifierModes.includes('validationCommand') && executionStatus === 'succeeded'
                ? await (0, verifier_1.runValidationCommandVerifier)({
                    command: prepared.validationCommand,
                    taskValidationHint: prepared.taskValidationHint,
                    normalizedValidationCommandFrom: prepared.normalizedValidationCommandFrom,
                    rootPath: prepared.rootPolicy.verificationRootPath,
                    artifactDir: artifactPaths.directory
                })
                : {
                    command: prepared.validationCommand,
                    stdout: '',
                    stderr: '',
                    exitCode: null,
                    result: {
                        verifier: 'validationCommand',
                        status: 'skipped',
                        summary: executionStatus === 'succeeded'
                            ? 'Validation-command verifier disabled for this iteration.'
                            : 'Validation-command verifier skipped because Codex execution did not succeed.',
                        warnings: [],
                        errors: [],
                        command: prepared.validationCommand ?? undefined
                    }
                };
            const shouldRunFileChangeVerifier = prepared.selectedTask !== null
                && (prepared.config.verifierModes.includes('gitDiff')
                    || prepared.config.gitCheckpointMode === 'snapshotAndDiff');
            const fileChangeVerification = shouldRunFileChangeVerifier
                ? await (0, verifier_1.runFileChangeVerifier)({
                    rootPath: prepared.rootPolicy.verificationRootPath,
                    artifactDir: artifactPaths.directory,
                    beforeGit: prepared.beforeGit,
                    afterGit,
                    before: prepared.beforeCoreState,
                    after: afterCoreStateBeforeReconciliation
                })
                : {
                    diffSummary: null,
                    result: {
                        verifier: 'gitDiff',
                        status: 'skipped',
                        summary: prepared.selectedTask
                            ? 'Git-diff/file-change verifier disabled for this iteration.'
                            : 'Git-diff/file-change verifier skipped because no Ralph task was selected.',
                        warnings: [],
                        errors: []
                    }
                };
            const preliminaryVerificationStatus = (0, loopLogic_1.classifyVerificationStatus)([
                validationVerification.result.status,
                fileChangeVerification.result.status
            ]);
            const preliminaryOutcome = (0, loopLogic_1.classifyIterationOutcome)({
                selectedTaskId: prepared.selectedTask?.id ?? null,
                selectedTaskCompleted: false,
                selectedTaskBlocked: false,
                humanReviewNeeded: false,
                remainingSubtaskCount: (0, taskFile_1.remainingSubtasks)(afterCoreStateBeforeReconciliation.taskFile, prepared.selectedTask?.id ?? null).length,
                remainingTaskCount: (0, taskFile_1.countTaskStatuses)(afterCoreStateBeforeReconciliation.taskFile).todo
                    + (0, taskFile_1.countTaskStatuses)(afterCoreStateBeforeReconciliation.taskFile).in_progress
                    + (0, taskFile_1.countTaskStatuses)(afterCoreStateBeforeReconciliation.taskFile).blocked,
                executionStatus,
                verificationStatus: preliminaryVerificationStatus,
                validationFailureSignature: validationVerification.result.failureSignature ?? null,
                relevantFileChanges: fileChangeVerification.diffSummary?.relevantChangedFiles ?? [],
                progressChanged: prepared.beforeCoreState.hashes.progress !== afterCoreStateBeforeReconciliation.hashes.progress,
                taskFileChanged: prepared.beforeCoreState.hashes.tasks !== afterCoreStateBeforeReconciliation.hashes.tasks,
                previousIterations: prepared.state.iterationHistory
            });
            const completionReconciliation = await (0, reconciliation_1.reconcileCompletionReport)({
                prepared,
                selectedTask: prepared.selectedTask,
                verificationStatus: preliminaryVerificationStatus,
                preliminaryClassification: preliminaryOutcome.classification,
                lastMessage,
                taskFilePath: prepared.paths.taskFilePath,
                logger: this.logger
            });
            const afterCoreState = await (0, verifier_1.captureCoreState)(prepared.paths);
            const taskStateVerification = prepared.config.verifierModes.includes('taskState')
                ? await (0, verifier_1.runTaskStateVerifier)({
                    selectedTaskId: prepared.selectedTask?.id ?? null,
                    before: prepared.beforeCoreState,
                    after: afterCoreState,
                    artifactDir: artifactPaths.directory
                })
                : {
                    selectedTaskAfter: completionReconciliation.selectedTask ?? prepared.selectedTask,
                    selectedTaskCompleted: false,
                    selectedTaskBlocked: false,
                    humanReviewNeeded: false,
                    progressChanged: completionReconciliation.progressChanged,
                    taskFileChanged: completionReconciliation.taskFileChanged,
                    result: {
                        verifier: 'taskState',
                        status: 'skipped',
                        summary: 'Task-state verifier disabled for this iteration.',
                        warnings: [],
                        errors: []
                    }
                };
            phaseTimestamps.verificationFinishedAt = new Date().toISOString();
            const verifierResults = [
                validationVerification.result,
                fileChangeVerification.result,
                taskStateVerification.result
            ];
            const verificationStatus = (0, loopLogic_1.classifyVerificationStatus)(verifierResults.map((item) => item.status));
            const selectedTaskAfter = taskStateVerification.selectedTaskAfter
                ?? completionReconciliation.selectedTask
                ?? prepared.selectedTask;
            const remainingSubtaskList = (0, taskFile_1.remainingSubtasks)(afterCoreState.taskFile, prepared.selectedTask?.id ?? null);
            const afterTaskCounts = (0, taskFile_1.countTaskStatuses)(afterCoreState.taskFile);
            const remainingTaskCount = afterTaskCounts.todo + afterTaskCounts.in_progress + afterTaskCounts.blocked;
            const nextActionableTask = (0, taskFile_1.selectNextTask)(afterCoreState.taskFile);
            const outcome = (0, loopLogic_1.classifyIterationOutcome)({
                selectedTaskId: prepared.selectedTask?.id ?? null,
                selectedTaskCompleted: taskStateVerification.selectedTaskCompleted,
                selectedTaskBlocked: taskStateVerification.selectedTaskBlocked,
                humanReviewNeeded: taskStateVerification.humanReviewNeeded,
                remainingSubtaskCount: remainingSubtaskList.length,
                remainingTaskCount,
                executionStatus,
                verificationStatus,
                validationFailureSignature: validationVerification.result.failureSignature ?? null,
                relevantFileChanges: fileChangeVerification.diffSummary?.relevantChangedFiles ?? [],
                progressChanged: taskStateVerification.progressChanged,
                taskFileChanged: taskStateVerification.taskFileChanged,
                previousIterations: prepared.state.iterationHistory
            });
            let completionClassification = outcome.classification;
            let followUpAction = outcome.followUpAction;
            if (!prepared.selectedTask) {
                if (isBacklogExhausted(afterTaskCounts)) {
                    completionClassification = 'complete';
                    followUpAction = 'stop';
                }
                else if (afterTaskCounts.todo === 0 && afterTaskCounts.in_progress === 0 && afterTaskCounts.blocked > 0) {
                    completionClassification = 'blocked';
                    followUpAction = 'request_human_review';
                }
            }
            phaseTimestamps.classifiedAt = new Date().toISOString();
            const summary = [
                prepared.selectedTask
                    ? `Selected ${prepared.selectedTask.id}: ${prepared.selectedTask.title}`
                    : prepared.promptKind === 'replenish-backlog'
                        ? 'Replenishing exhausted Ralph backlog.'
                        : 'No actionable Ralph task selected.',
                `Execution: ${executionStatus}`,
                `Verification: ${verificationStatus}`,
                `Outcome: ${completionClassification}`,
                `Backlog remaining: ${remainingTaskCount}`
            ].join(' | ');
            const warnings = [
                ...executionWarnings,
                ...completionReconciliation.warnings,
                ...verifierResults.flatMap((item) => item.warnings)
            ];
            const errors = [
                ...executionErrors,
                ...verifierResults.flatMap((item) => item.errors)
            ];
            const result = {
                schemaVersion: 1,
                agentId: types_1.DEFAULT_RALPH_AGENT_ID,
                provenanceId: prepared.provenanceId,
                iteration: prepared.iteration,
                selectedTaskId: prepared.selectedTask?.id ?? null,
                selectedTaskTitle: prepared.selectedTask?.title ?? null,
                promptKind: prepared.promptKind,
                promptPath: prepared.promptPath,
                artifactDir: artifactPaths.directory,
                adapterUsed: 'cliExec',
                executionIntegrity: {
                    provenanceId: prepared.provenanceId,
                    promptTarget: prepared.executionPlan.promptTarget,
                    rootPolicy: prepared.rootPolicy,
                    templatePath: prepared.executionPlan.templatePath,
                    reasoningEffort: prepared.config.reasoningEffort,
                    taskValidationHint: prepared.taskValidationHint,
                    effectiveValidationCommand: prepared.effectiveValidationCommand,
                    normalizedValidationCommandFrom: prepared.normalizedValidationCommandFrom,
                    executionPlanPath: prepared.executionPlanPath,
                    executionPlanHash: prepared.executionPlanHash,
                    promptArtifactPath: prepared.executionPlan.promptArtifactPath,
                    promptHash: prepared.executionPlan.promptHash,
                    promptByteLength: prepared.executionPlan.promptByteLength,
                    executionPayloadHash: execStdinHash,
                    executionPayloadMatched: execStdinHash === null ? null : execStdinHash === prepared.executionPlan.promptHash,
                    mismatchReason: execStdinHash === null
                        ? null
                        : execStdinHash === prepared.executionPlan.promptHash
                            ? null
                            : `Executed stdin hash ${execStdinHash} did not match planned prompt hash ${prepared.executionPlan.promptHash}.`,
                    cliInvocationPath: invocation ? artifactPaths.cliInvocationPath : null
                },
                executionStatus,
                verificationStatus,
                completionClassification,
                followUpAction,
                startedAt,
                finishedAt: new Date().toISOString(),
                phaseTimestamps,
                summary,
                warnings,
                errors,
                execution: {
                    exitCode: execExitCode,
                    message: prepared.selectedTask ? executionErrors[0] ?? undefined : undefined,
                    transcriptPath,
                    lastMessagePath,
                    stdoutPath: artifactPaths.stdoutPath,
                    stderrPath: artifactPaths.stderrPath
                },
                verification: {
                    taskValidationHint: prepared.taskValidationHint,
                    effectiveValidationCommand: prepared.effectiveValidationCommand,
                    normalizedValidationCommandFrom: prepared.normalizedValidationCommandFrom,
                    primaryCommand: validationVerification.command ?? null,
                    validationFailureSignature: validationVerification.result.failureSignature ?? null,
                    verifiers: verifierResults
                },
                backlog: {
                    remainingTaskCount,
                    actionableTaskAvailable: Boolean(nextActionableTask)
                },
                diffSummary: fileChangeVerification.diffSummary,
                noProgressSignals: outcome.noProgressSignals,
                remediation: null,
                completionReportStatus: completionReconciliation.artifact.status,
                reconciliationWarnings: completionReconciliation.warnings,
                stopReason: null
            };
            let loopDecision = (0, loopLogic_1.decideLoopContinuation)({
                currentResult: result,
                selectedTaskCompleted: taskStateVerification.selectedTaskCompleted,
                remainingSubtaskCount: remainingSubtaskList.length,
                remainingTaskCount,
                hasActionableTask: Boolean(nextActionableTask),
                preflightDiagnostics: prepared.preflightReport.diagnostics,
                noProgressThreshold: prepared.config.noProgressThreshold,
                repeatedFailureThreshold: prepared.config.repeatedFailureThreshold,
                stopOnHumanReviewNeeded: prepared.config.stopOnHumanReviewNeeded,
                autoReplenishBacklog: prepared.config.autoReplenishBacklog,
                reachedIterationCap: options.reachedIterationCap,
                previousIterations: prepared.state.iterationHistory
            });
            const runtimeChanges = controlPlaneRuntimeChanges(fileChangeVerification.diffSummary?.relevantChangedFiles ?? []);
            if (completionReconciliation.claimContested) {
                loopDecision = {
                    shouldContinue: false,
                    stopReason: 'claim_contested',
                    message: `Selected task claim was no longer owned by ${prepared.provenanceId} during completion reconciliation.`
                };
                result.stopReason = 'claim_contested';
                result.followUpAction = 'stop';
                result.remediation = null;
            }
            else if (!loopDecision.shouldContinue) {
                result.stopReason = loopDecision.stopReason;
                result.followUpAction = 'stop';
                result.remediation = (0, loopLogic_1.buildTaskRemediation)({
                    currentResult: result,
                    stopReason: loopDecision.stopReason,
                    previousIterations: prepared.state.iterationHistory
                });
                result.remediation = (0, taskDecomposition_1.normalizeRemediationForTask)(afterCoreState.taskFile, result);
            }
            else if (runtimeChanges.length > 0) {
                loopDecision = {
                    shouldContinue: false,
                    stopReason: 'control_plane_reload_required',
                    message: 'Control-plane runtime files changed; rerun Ralph in a fresh process before continuing.'
                };
                result.stopReason = 'control_plane_reload_required';
                result.followUpAction = 'stop';
                result.remediation = null;
                result.warnings.push(`Control-plane runtime files changed during this iteration; rerun Ralph in a fresh process before continuing. (${runtimeChanges.join(', ')})`);
            }
            phaseTimestamps.persistedAt = new Date().toISOString();
            const remediationArtifact = (0, taskDecomposition_1.buildRemediationArtifact)({
                result,
                taskFile: afterCoreState.taskFile,
                previousIterations: prepared.state.iterationHistory,
                artifactDir: artifactPaths.directory,
                iterationResultPath: artifactPaths.iterationResultPath,
                createdAt: phaseTimestamps.persistedAt
            });
            await (0, artifactStore_1.writeIterationArtifacts)({
                paths: artifactPaths,
                artifactRootDir: prepared.paths.artifactDir,
                prompt: prepared.prompt,
                promptEvidence: prepared.promptEvidence,
                completionReport: completionReconciliation.artifact,
                stdout: execStdout,
                stderr: execStderr,
                executionSummary: {
                    iteration: prepared.iteration,
                    selectedTaskId: prepared.selectedTask?.id ?? null,
                    promptKind: prepared.promptKind,
                    promptTarget: prepared.executionPlan.promptTarget,
                    rootPolicy: prepared.rootPolicy,
                    templatePath: prepared.executionPlan.templatePath,
                    taskValidationHint: prepared.taskValidationHint,
                    effectiveValidationCommand: prepared.effectiveValidationCommand,
                    normalizedValidationCommandFrom: prepared.normalizedValidationCommandFrom,
                    executionPlanPath: prepared.executionPlanPath,
                    executionPlanHash: prepared.executionPlanHash,
                    promptArtifactPath: prepared.executionPlan.promptArtifactPath,
                    promptHash: prepared.executionPlan.promptHash,
                    executionPayloadHash: execStdinHash,
                    executionPayloadMatched: execStdinHash === null ? null : execStdinHash === prepared.executionPlan.promptHash,
                    cliInvocationPath: invocation ? artifactPaths.cliInvocationPath : null,
                    executionStatus,
                    exitCode: execExitCode,
                    message: executionErrors[0] ?? null,
                    transcriptPath,
                    lastMessagePath,
                    lastMessage: summarizeLastMessage(lastMessage, execExitCode),
                    completionReportStatus: completionReconciliation.artifact.status
                },
                verifierSummary: verifierResults,
                diffSummary: fileChangeVerification.diffSummary,
                result,
                remediationArtifact,
                gitStatusBefore: prepared.beforeGit.available ? prepared.beforeGit.raw : undefined,
                gitStatusAfter: afterGit.available ? afterGit.raw : undefined
            });
            const writeResult = await (0, artifactStore_1.writeProvenanceBundle)({
                artifactRootDir: prepared.paths.artifactDir,
                paths: prepared.provenanceBundlePaths,
                bundle: this.createProvenanceBundle({
                    prepared,
                    status: 'executed',
                    summary: result.summary,
                    executionPayloadHash: execStdinHash,
                    executionPayloadMatched: result.executionIntegrity?.executionPayloadMatched ?? null,
                    mismatchReason: result.executionIntegrity?.mismatchReason ?? null,
                    cliInvocationPath: invocation ? prepared.provenanceBundlePaths.cliInvocationPath : null,
                    iterationResultPath: prepared.provenanceBundlePaths.iterationResultPath
                }),
                preflightReport: prepared.persistedPreflightReport,
                preflightSummary: prepared.preflightSummaryText,
                prompt: prepared.prompt,
                promptEvidence: prepared.promptEvidence,
                executionPlan: prepared.executionPlan,
                cliInvocation: invocation,
                result,
                retentionCount: prepared.config.provenanceBundleRetentionCount
            });
            if (writeResult.retention.deletedBundleIds.length > 0) {
                this.logger.info('Cleaned up old Ralph provenance bundles after execution.', {
                    deletedBundleIds: writeResult.retention.deletedBundleIds,
                    retentionCount: prepared.config.provenanceBundleRetentionCount
                });
            }
            const runRecord = runRecordFromIteration(mode, prepared, startedAt, result);
            await this.stateManager.recordIteration(prepared.rootPath, prepared.paths, prepared.state, result, prepared.objectiveText, runRecord);
            await this.cleanupGeneratedArtifacts(prepared.paths, prepared.config.generatedArtifactRetentionCount, 'execution');
            this.logger.info('Completed Ralph iteration.', {
                iteration: prepared.iteration,
                selectedTaskId: prepared.selectedTask?.id ?? null,
                executionStatus,
                verificationStatus,
                completionClassification,
                stopReason: result.stopReason,
                promptPath: prepared.promptPath,
                promptArtifactPath: prepared.executionPlan.promptArtifactPath,
                promptHash: prepared.executionPlan.promptHash,
                executionPayloadMatched: result.executionIntegrity?.executionPayloadMatched ?? null,
                artifactDir: artifactPaths.directory,
                selectedTaskAfterStatus: selectedTaskAfter?.status ?? null
            });
            return {
                prepared,
                result,
                loopDecision,
                createdPaths: prepared.createdPaths
            };
        }
        finally {
            if (prepared.selectedTask) {
                await (0, taskFile_1.releaseClaim)(prepared.paths.claimFilePath, prepared.selectedTask.id, types_1.DEFAULT_RALPH_AGENT_ID).catch((error) => {
                    this.logger.warn('Failed to release Ralph task claim after iteration.', {
                        selectedTaskId: prepared.selectedTask?.id ?? null,
                        provenanceId: prepared.provenanceId,
                        error: toErrorMessage(error)
                    });
                });
            }
        }
    }
}
exports.RalphIterationEngine = RalphIterationEngine;
//# sourceMappingURL=iterationEngine.js.map