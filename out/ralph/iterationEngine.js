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
const path = __importStar(require("path"));
const providers_1 = require("../config/providers");
const readConfig_1 = require("../config/readConfig");
const promptBuilder_1 = require("../prompt/promptBuilder");
const error_1 = require("../util/error");
const iterationPreparation_1 = require("./iterationPreparation");
const types_1 = require("./types");
const taskFile_1 = require("./taskFile");
const planningPass_1 = require("./planningPass");
const failureDiagnostics_1 = require("./failureDiagnostics");
const integrity_1 = require("./integrity");
const loopLogic_1 = require("./loopLogic");
const complexityScorer_1 = require("./complexityScorer");
const hookRunner_1 = require("./hookRunner");
const verifier_1 = require("./verifier");
const reconciliation_1 = require("./reconciliation");
const provenancePersistence_1 = require("./provenancePersistence");
const ArtifactPersistenceService_1 = require("./iteration/ArtifactPersistenceService");
const IterationExecutor_1 = require("./iteration/IterationExecutor");
const LoopDecisionService_1 = require("./iteration/LoopDecisionService");
const OutcomeClassifier_1 = require("./iteration/OutcomeClassifier");
const RemediationCoordinator_1 = require("./iteration/RemediationCoordinator");
const ScmCoordinator_1 = require("./iteration/ScmCoordinator");
const VerificationRunner_1 = require("./iteration/VerificationRunner");
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
    artifactPersistence;
    iterationExecutor;
    verificationRunner;
    outcomeClassifier;
    loopDecisionService;
    remediationCoordinator;
    scmCoordinator;
    constructor(stateManager, strategies, logger, hooks = {}) {
        this.stateManager = stateManager;
        this.strategies = strategies;
        this.logger = logger;
        this.hooks = hooks;
        this.artifactPersistence = new ArtifactPersistenceService_1.ArtifactPersistenceService(this.logger);
        this.iterationExecutor = new IterationExecutor_1.IterationExecutor(this.strategies, this.logger, this.artifactPersistence);
        this.verificationRunner = new VerificationRunner_1.VerificationRunner();
        this.outcomeClassifier = new OutcomeClassifier_1.OutcomeClassifier();
        this.loopDecisionService = new LoopDecisionService_1.LoopDecisionService();
        this.remediationCoordinator = new RemediationCoordinator_1.RemediationCoordinator(this.logger);
        this.scmCoordinator = new ScmCoordinator_1.ScmCoordinator(this.logger);
    }
    async preparePrompt(workspaceFolder, progress, options) {
        const prepared = await (0, iterationPreparation_1.prepareIterationContext)({
            workspaceFolder,
            progress,
            includeVerifierContext: false,
            configOverrides: options?.configOverrides,
            rolePolicySource: options?.rolePolicySource,
            stateManager: this.stateManager,
            logger: this.logger,
            cliProvider: this.strategies.getActiveCliProvider(),
            persistBlockedPreflightBundle: (input) => (0, provenancePersistence_1.persistBlockedPreflightBundle)(input, this.logger),
            persistPreparedProvenanceBundle: (preparedContext) => (0, provenancePersistence_1.persistPreparedProvenanceBundle)(preparedContext, this.logger)
        });
        return {
            ...prepared
        };
    }
    /**
     * Checks whether the inline planning pass should run and, if so, delegates
     * to runInlinePlanningPass.  Best-effort: all failures are swallowed so the
     * main iteration always proceeds.
     */
    async maybeRunInlinePlanningPass(workspaceFolder, configOverrides) {
        try {
            const config = { ...(0, readConfig_1.readConfig)(workspaceFolder), ...(configOverrides ?? {}) };
            if (!(0, planningPass_1.shouldRunInlinePlanningPassForConfig)(config)) {
                return;
            }
            const rootPath = workspaceFolder.uri.fsPath;
            const paths = this.stateManager.resolvePaths(rootPath, config);
            let taskFileText;
            try {
                taskFileText = await fs.readFile(paths.taskFilePath, 'utf8');
            }
            catch {
                return; // No task file yet; let prepareIterationContext handle initialization
            }
            const taskFile = (0, taskFile_1.parseTaskFile)(taskFileText);
            const selectedTask = await (0, taskFile_1.selectNextTaskForRole)(taskFile, config.agentRole, paths.artifactDir);
            if (!selectedTask) {
                return;
            }
            const existingPlan = await (0, planningPass_1.readTaskPlan)(paths.artifactDir, selectedTask.id);
            if (existingPlan) {
                return; // Plan already exists; skip the planning pass
            }
            this.logger.info('Starting inline planning pass.', { taskId: selectedTask.id });
            this.strategies.configureCliProvider(config);
            const execStrategy = this.strategies.getCliExecStrategyForProvider();
            if (!execStrategy.runExec) {
                this.logger.warn('Inline planning pass skipped: CLI strategy does not support exec.');
                return;
            }
            await this.runInlinePlanningPass(rootPath, paths.artifactDir, selectedTask.id, selectedTask.title, selectedTask.acceptance ?? [], execStrategy, (0, providers_1.getCliCommandPath)(config), config);
        }
        catch (err) {
            this.logger.warn('maybeRunInlinePlanningPass encountered an unexpected error; continuing.', {
                error: String(err)
            });
        }
    }
    /**
     * Runs a lightweight planning CLI turn for the given task and writes task-plan.json.
     * Failures are logged but do not abort the main iteration — the planning pass is best-effort.
     */
    async runInlinePlanningPass(workspaceRoot, artifactsDir, taskId, taskTitle, taskAcceptance, execStrategy, commandPath, config) {
        const planningPrompt = [
            'You are a planning agent. Analyse the task below and produce a JSON planning artifact.',
            '',
            `Task ID: ${taskId}`,
            `Task Title: ${taskTitle}`,
            taskAcceptance.length > 0 ? `Acceptance criteria:\n${taskAcceptance.map((a) => `- ${a}`).join('\n')}` : '',
            '',
            'Respond with ONLY a valid JSON object (no markdown fences) in this exact schema:',
            '{',
            '  "reasoning": "<why this task matters and what the key challenge is>",',
            '  "approach": "<one-sentence implementation strategy>",',
            '  "steps": ["<step 1>", "<step 2>", ...],',
            '  "risks": ["<risk 1>", ...],',
            '  "suggestedValidationCommand": "<optional shell command to validate the work>"',
            '}'
        ].filter(Boolean).join('\n');
        const taskArtifactDir = path.join(artifactsDir, taskId);
        await fs.mkdir(taskArtifactDir, { recursive: true });
        const promptPath = path.join(taskArtifactDir, 'task-plan-prompt.md');
        const transcriptPath = path.join(taskArtifactDir, 'task-plan-transcript.json');
        const lastMessagePath = path.join(taskArtifactDir, 'task-plan-last-message.txt');
        await fs.writeFile(promptPath, planningPrompt, 'utf8');
        try {
            const execResult = await execStrategy.runExec({
                commandPath,
                workspaceRoot,
                executionRoot: workspaceRoot,
                prompt: planningPrompt,
                promptPath,
                promptHash: (0, integrity_1.hashText)(planningPrompt),
                promptByteLength: (0, integrity_1.utf8ByteLength)(planningPrompt),
                transcriptPath,
                lastMessagePath,
                model: config.model,
                reasoningEffort: config.reasoningEffort,
                sandboxMode: config.sandboxMode,
                approvalMode: config.approvalMode,
                timeoutMs: config.cliExecutionTimeoutMs > 0 ? config.cliExecutionTimeoutMs : undefined,
                promptCaching: config.promptCaching
            });
            if (execResult.exitCode !== 0) {
                this.logger.warn('Inline planning pass exited non-zero; skipping task-plan.json.', {
                    taskId,
                    exitCode: execResult.exitCode
                });
                return;
            }
            const plan = (0, planningPass_1.parsePlanningResponse)(execResult.lastMessage);
            if (!plan) {
                this.logger.warn('Inline planning pass produced no parseable plan; skipping task-plan.json.', { taskId });
                return;
            }
            await (0, planningPass_1.writeTaskPlan)(artifactsDir, taskId, plan);
            this.logger.info('Inline planning pass wrote task-plan.json.', { taskId });
        }
        catch (err) {
            this.logger.warn('Inline planning pass failed; continuing without plan.', {
                taskId,
                error: String(err)
            });
        }
    }
    /**
     * Runs a failure-diagnostic CLI turn when the loop stops due to a blocked task
     * or failed verifier. Writes failure-analysis.json. Best-effort: failures are
     * logged and never abort the main loop.
     */
    async maybeRunFailureDiagnostic(opts) {
        try {
            const { taskId, taskTitle, result, config, artifactRootDir, iterationHistory, workspaceRoot, lastIterationPrompt, lastMessage } = opts;
            if (!(0, loopLogic_1.shouldRunFailureDiagnostic)(result.completionClassification, result.verificationStatus, config.failureDiagnostics)) {
                return;
            }
            const failureSignal = result.verification.validationFailureSignature ?? result.summary ?? '';
            // Transient failures are classified without an LLM call.
            const transientCategory = (0, failureDiagnostics_1.classifyTransientFailure)(failureSignal);
            if (transientCategory) {
                const analysis = {
                    schemaVersion: 1,
                    kind: 'failureAnalysis',
                    taskId,
                    createdAt: new Date().toISOString(),
                    rootCauseCategory: transientCategory,
                    confidence: 'high',
                    summary: 'Failure classified as transient by pattern match.',
                    suggestedAction: 'Retry the task; the failure is likely due to a temporary infrastructure condition.'
                };
                await (0, failureDiagnostics_1.writeFailureAnalysis)(artifactRootDir, taskId, analysis);
                this.logger.info('Failure diagnostic: transient failure detected via pattern match.', { taskId });
                return;
            }
            this.strategies.configureCliProvider(config);
            const execStrategy = this.strategies.getCliExecStrategyForProvider();
            if (!execStrategy.runExec) {
                this.logger.warn('Failure diagnostic skipped: CLI strategy does not support exec.');
                return;
            }
            const recentHistory = iterationHistory.slice(-3).map((h) => ({
                iteration: h.iteration,
                completionClassification: h.completionClassification,
                verificationStatus: h.verificationStatus
            }));
            const diagnosticPrompt = (0, failureDiagnostics_1.buildFailureDiagnosticPrompt)({
                taskId,
                taskTitle,
                lastIterationPrompt,
                lastMessage,
                failureSignal,
                recentHistory
            });
            const taskArtifactDir = path.join(artifactRootDir, taskId);
            await fs.mkdir(taskArtifactDir, { recursive: true });
            const promptPath = path.join(taskArtifactDir, 'failure-diagnostic-prompt.md');
            const transcriptPath = path.join(taskArtifactDir, 'failure-diagnostic-transcript.json');
            const lastMessagePath = path.join(taskArtifactDir, 'failure-diagnostic-last-message.txt');
            await fs.writeFile(promptPath, diagnosticPrompt, 'utf8');
            const execResult = await execStrategy.runExec({
                commandPath: (0, providers_1.getCliCommandPath)(config),
                workspaceRoot,
                executionRoot: workspaceRoot,
                prompt: diagnosticPrompt,
                promptPath,
                promptHash: (0, integrity_1.hashText)(diagnosticPrompt),
                promptByteLength: (0, integrity_1.utf8ByteLength)(diagnosticPrompt),
                transcriptPath,
                lastMessagePath,
                model: config.model,
                reasoningEffort: config.reasoningEffort,
                sandboxMode: config.sandboxMode,
                approvalMode: config.approvalMode,
                timeoutMs: config.cliExecutionTimeoutMs > 0 ? config.cliExecutionTimeoutMs : undefined,
                promptCaching: config.promptCaching
            });
            if (execResult.exitCode !== 0) {
                this.logger.warn('Failure diagnostic exited non-zero; skipping failure-analysis.json.', {
                    taskId,
                    exitCode: execResult.exitCode
                });
                return;
            }
            const analysis = (0, failureDiagnostics_1.parseFailureDiagnosticResponse)(execResult.lastMessage);
            if (!analysis) {
                this.logger.warn('Failure diagnostic produced no parseable analysis; skipping failure-analysis.json.', { taskId });
                return;
            }
            const enriched = { ...analysis, taskId, createdAt: new Date().toISOString() };
            await (0, failureDiagnostics_1.writeFailureAnalysis)(artifactRootDir, taskId, enriched);
            this.logger.info('Failure diagnostic wrote failure-analysis.json.', {
                taskId,
                rootCauseCategory: enriched.rootCauseCategory,
                confidence: enriched.confidence
            });
        }
        catch (err) {
            this.logger.warn('maybeRunFailureDiagnostic encountered an unexpected error; continuing.', {
                error: String(err)
            });
        }
    }
    async runCliIteration(workspaceFolder, mode, progress, options) {
        const broadcaster = options.broadcaster;
        const earlyAgentId = options.configOverrides?.agentId;
        broadcaster?.emitPhase(0, 'inspect', earlyAgentId);
        // Inline planning pass: runs a quick planning CLI turn before the main
        // iteration so the implementer prompt can include task-plan.json context.
        // Only runs when planningPass.enabled=true, mode='inline', and the selected
        // task does not yet have a task-plan.json artifact.
        await this.maybeRunInlinePlanningPass(workspaceFolder, options.configOverrides);
        const prepared = await (0, iterationPreparation_1.prepareIterationContext)({
            workspaceFolder,
            progress,
            includeVerifierContext: true,
            configOverrides: options.configOverrides,
            rolePolicySource: options.rolePolicySource,
            focusTaskId: options.focusTaskId,
            stateManager: this.stateManager,
            logger: this.logger,
            cliProvider: this.strategies.getActiveCliProvider(),
            persistBlockedPreflightBundle: (input) => (0, provenancePersistence_1.persistBlockedPreflightBundle)(input, this.logger),
            persistPreparedProvenanceBundle: (preparedContext) => (0, provenancePersistence_1.persistPreparedProvenanceBundle)(preparedContext, this.logger)
        });
        try {
            const artifactPaths = this.artifactPersistence.resolvePaths(prepared.paths.artifactDir, prepared.iteration);
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
            broadcaster?.emitPhase(prepared.iteration, 'prompt', prepared.config.agentId);
            progress.report({
                message: `Executing Ralph iteration ${prepared.iteration}`
            });
            broadcaster?.emitPhase(prepared.iteration, 'execute', prepared.config.agentId);
            // Model tiering: select the appropriate model (and optional provider override)
            // based on task complexity. Adopted from Ruflo's smart task-routing pattern.
            const { model: selectedModel, provider: selectedProvider, score: complexityScore, tier: effectiveTier } = prepared.selectedTask
                ? (0, complexityScorer_1.selectModelForTask)({
                    task: prepared.selectedTask,
                    taskFile: prepared.beforeCoreState.taskFile,
                    iterationHistory: prepared.state.iterationHistory,
                    tiering: prepared.config.modelTiering,
                    fallbackModel: prepared.config.model
                })
                : { model: prepared.config.model, provider: undefined, score: null, tier: 'default' };
            if (complexityScore !== null) {
                this.logger.info('Model tiering selected model for task.', {
                    taskId: prepared.selectedTask?.id ?? null,
                    model: selectedModel,
                    provider: selectedProvider ?? prepared.config.cliProvider,
                    complexityScore: complexityScore.score,
                    signals: complexityScore.signals
                });
            }
            // Resolve the effective provider for this iteration. When the tier
            // specifies a provider override, use it; otherwise fall back to the
            // workspace default.
            const effectiveProvider = selectedProvider ?? prepared.config.cliProvider;
            const effectiveCommandPath = selectedProvider
                ? (0, providers_1.getCliCommandPathForProvider)(selectedProvider, prepared.config)
                : (0, providers_1.getCliCommandPath)(prepared.config);
            const shouldExecutePrompt = prepared.selectedTask !== null || prepared.promptKind === 'replenish-backlog';
            // Keep strategy support checks before hook execution.
            this.strategies.configureCliProvider(prepared.config);
            const precheckExecStrategy = this.strategies.getCliExecStrategyForProvider(selectedProvider);
            if (!precheckExecStrategy.runExec) {
                throw new Error('The configured CLI strategy does not support exec.');
            }
            if (shouldExecutePrompt) {
                // Run beforeIteration hook (adopted from Ruflo's hook system).
                const hookContext = {
                    agentId: prepared.config.agentId,
                    taskId: prepared.selectedTask?.id ?? null,
                    outcome: 'pending',
                    stopReason: null,
                    cwd: prepared.rootPath
                };
                const beforeHookResult = await (0, hookRunner_1.runHook)('beforeIteration', prepared.config.hooks, hookContext);
                if (!beforeHookResult.skipped && beforeHookResult.exitCode !== 0) {
                    this.logger.warn('beforeIteration hook exited non-zero.', {
                        command: beforeHookResult.command,
                        exitCode: beforeHookResult.exitCode,
                        stderr: beforeHookResult.stderr.slice(0, 500)
                    });
                }
            }
            const artifactBaseName = (0, promptBuilder_1.createArtifactBaseName)(prepared.promptKind, prepared.iteration);
            const runArtifacts = this.stateManager.runArtifactPaths(prepared.paths, artifactBaseName);
            const execution = await this.iterationExecutor.execute({
                prepared,
                mode,
                selectedModel,
                selectedProvider,
                effectiveProvider,
                effectiveCommandPath,
                artifactPaths,
                runArtifacts,
                beforeCliExecutionIntegrityCheck: this.hooks.beforeCliExecutionIntegrityCheck,
                prepareExecutionWorkspace: (preparedContext) => this.scmCoordinator.prepareExecutionWorkspace(preparedContext)
            });
            phaseTimestamps.executionStartedAt = execution.executionStartedAt;
            phaseTimestamps.executionFinishedAt = execution.executionFinishedAt;
            // Run afterIteration / onFailure hooks (adopted from Ruflo's hook system).
            if (shouldExecutePrompt) {
                const postHookContext = {
                    agentId: prepared.config.agentId,
                    taskId: prepared.selectedTask?.id ?? null,
                    outcome: execution.executionStatus,
                    stopReason: null,
                    cwd: prepared.rootPath
                };
                const afterHookResult = await (0, hookRunner_1.runHook)('afterIteration', prepared.config.hooks, postHookContext);
                if (!afterHookResult.skipped && afterHookResult.exitCode !== 0) {
                    this.logger.warn('afterIteration hook exited non-zero.', {
                        command: afterHookResult.command,
                        exitCode: afterHookResult.exitCode,
                        stderr: afterHookResult.stderr.slice(0, 500)
                    });
                }
                if (execution.executionStatus === 'failed') {
                    const failureHookResult = await (0, hookRunner_1.runHook)('onFailure', prepared.config.hooks, postHookContext);
                    if (!failureHookResult.skipped && failureHookResult.exitCode !== 0) {
                        this.logger.warn('onFailure hook exited non-zero.', {
                            command: failureHookResult.command,
                            exitCode: failureHookResult.exitCode,
                            stderr: failureHookResult.stderr.slice(0, 500)
                        });
                    }
                }
            }
            phaseTimestamps.resultCollectedAt = new Date().toISOString();
            broadcaster?.emitPhase(prepared.iteration, 'verify', prepared.config.agentId);
            progress.report({ message: 'Running Ralph verifiers' });
            const preliminaryVerification = await this.verificationRunner.runPreliminaryVerification({
                prepared,
                artifactPaths,
                executionStatus: execution.executionStatus
            });
            const completionReconciliation = await (0, reconciliation_1.reconcileCompletionReport)({
                prepared,
                selectedTask: prepared.selectedTask,
                verificationStatus: preliminaryVerification.preliminaryVerificationStatus,
                validationCommandStatus: preliminaryVerification.validationVerification.result.status,
                preliminaryClassification: preliminaryVerification.preliminaryOutcome.classification,
                lastMessage: execution.lastMessage,
                taskFilePath: prepared.paths.taskFilePath,
                logger: this.logger
            });
            const branchPerTask = await this.scmCoordinator.reconcileBranchPerTask({
                prepared,
                completionReconciliation,
                validationStatus: preliminaryVerification.validationVerification.result.status,
                runConflictResolverIteration: async (taskId) => {
                    const scmRun = await this.runCliIteration(workspaceFolder, 'singleExec', progress, {
                        reachedIterationCap: false,
                        configOverrides: { agentRole: 'scm', agentId: `scm-conflict-${taskId}` },
                        rolePolicySource: 'explicit',
                        focusTaskId: taskId
                    });
                    return {
                        executionStatus: scmRun.result.executionStatus,
                        selectedTaskId: scmRun.result.selectedTaskId,
                        completionReportStatus: scmRun.result.completionReportStatus
                    };
                }
            });
            const afterCoreState = await (0, verifier_1.captureCoreState)(prepared.paths);
            const taskStateVerification = await this.verificationRunner.runTaskStateVerification({
                prepared,
                artifactPaths,
                completionReconciliation,
                afterCoreState
            });
            phaseTimestamps.verificationFinishedAt = new Date().toISOString();
            broadcaster?.emitPhase(prepared.iteration, 'classify', prepared.config.agentId);
            const classified = this.outcomeClassifier.classify({
                prepared,
                artifactPaths,
                startedAt,
                phaseTimestamps,
                execution,
                validationVerification: preliminaryVerification.validationVerification,
                fileChangeVerification: preliminaryVerification.fileChangeVerification,
                effectiveFileChangeVerification: preliminaryVerification.effectiveFileChangeVerification,
                relevantFileChangesForOutcome: preliminaryVerification.relevantFileChangesForOutcome,
                completionReconciliation,
                taskStateVerification,
                afterCoreState,
                selectedModel,
                effectiveTier,
                branchPerTaskWarnings: branchPerTask.warnings
            });
            let result = classified.result;
            const loopEvaluation = this.loopDecisionService.evaluate({
                prepared,
                result,
                selectedTaskCompleted: taskStateVerification.selectedTaskCompleted,
                remainingSubtaskCount: classified.remainingSubtaskList.length,
                remainingTaskCount: classified.remainingTaskCount,
                hasActionableTask: Boolean(classified.nextActionableTask),
                reachedIterationCap: options.reachedIterationCap,
                relevantChangedFiles: preliminaryVerification.effectiveFileChangeVerification.diffSummary?.relevantChangedFiles ?? [],
                completionReconciliation
            });
            const loopDecision = loopEvaluation.loopDecision;
            result = loopEvaluation.result;
            if (loopEvaluation.shouldBuildRemediation) {
                result = this.remediationCoordinator.attachStopRemediation({
                    result,
                    stopReason: loopDecision.stopReason,
                    previousIterations: prepared.state.iterationHistory,
                    taskFile: afterCoreState.taskFile
                });
            }
            if (!loopDecision.shouldContinue && result.selectedTaskId) {
                await this.maybeRunFailureDiagnostic({
                    taskId: result.selectedTaskId,
                    taskTitle: prepared.selectedTask?.title ?? result.selectedTaskId,
                    result,
                    config: prepared.config,
                    artifactRootDir: prepared.paths.artifactDir,
                    iterationHistory: prepared.state.iterationHistory,
                    workspaceRoot: prepared.rootPath,
                    lastIterationPrompt: prepared.prompt,
                    lastMessage: execution.lastMessage
                });
            }
            result = {
                ...result,
                phaseTimestamps: {
                    ...result.phaseTimestamps,
                    persistedAt: new Date().toISOString()
                }
            };
            const remediationOutcome = await this.remediationCoordinator.buildAndAutoApply({
                result,
                taskFile: afterCoreState.taskFile,
                previousIterations: prepared.state.iterationHistory,
                artifactPaths,
                taskFilePath: prepared.paths.taskFilePath,
                autoApplyRemediation: prepared.config.autoApplyRemediation,
                createdAt: result.phaseTimestamps.persistedAt
            });
            result = remediationOutcome.result;
            const remediationArtifact = remediationOutcome.remediationArtifact;
            remediationOutcome.effectiveTaskFile;
            // Run onStop hook when the loop will not continue (adopted from Ruflo's hook system).
            if (result.stopReason) {
                const stopHookContext = {
                    agentId: prepared.config.agentId,
                    taskId: result.selectedTaskId,
                    outcome: result.completionClassification,
                    stopReason: result.stopReason,
                    cwd: prepared.rootPath
                };
                const stopHookResult = await (0, hookRunner_1.runHook)('onStop', prepared.config.hooks, stopHookContext);
                if (!stopHookResult.skipped && stopHookResult.exitCode !== 0) {
                    this.logger.warn('onStop hook exited non-zero.', {
                        command: stopHookResult.command,
                        exitCode: stopHookResult.exitCode,
                        stderr: stopHookResult.stderr.slice(0, 500)
                    });
                }
            }
            try {
                await (0, provenancePersistence_1.updateAgentIdentityRecord)({
                    rootPath: prepared.rootPath,
                    agentId: prepared.config.agentId,
                    startedAt,
                    selectedTaskId: prepared.selectedTask?.id ?? null,
                    selectedTaskCompleted: taskStateVerification.selectedTaskCompleted,
                    diffSummary: preliminaryVerification.fileChangeVerification.diffSummary
                });
            }
            catch (error) {
                result.warnings.push(`Failed to update agent identity record for ${prepared.config.agentId}: ${(0, error_1.toErrorMessage)(error)}`);
            }
            // Run onTaskComplete hook when a task transitions to done (adopted from Ruflo's hook system).
            if (taskStateVerification.selectedTaskCompleted && prepared.selectedTask) {
                const taskCompleteHookContext = {
                    agentId: prepared.config.agentId,
                    taskId: prepared.selectedTask.id,
                    outcome: result.completionClassification,
                    stopReason: result.stopReason ?? '',
                    cwd: prepared.rootPath
                };
                const taskCompleteHookResult = await (0, hookRunner_1.runHook)('onTaskComplete', prepared.config.hooks, taskCompleteHookContext);
                if (!taskCompleteHookResult.skipped && taskCompleteHookResult.exitCode !== 0) {
                    this.logger.warn('onTaskComplete hook exited non-zero.', {
                        command: taskCompleteHookResult.command,
                        exitCode: taskCompleteHookResult.exitCode,
                        stderr: taskCompleteHookResult.stderr.slice(0, 500)
                    });
                }
            }
            const commitWarnings = await this.scmCoordinator.commitOnDoneIfNeeded({
                prepared,
                selectedTaskCompleted: taskStateVerification.selectedTaskCompleted,
                validationStatus: preliminaryVerification.validationVerification.result.status
            });
            if (commitWarnings.length > 0) {
                result.warnings.push(...commitWarnings);
            }
            broadcaster?.emitPhase(prepared.iteration, 'persist', prepared.config.agentId);
            await this.artifactPersistence.persistIterationArtifacts({
                prepared,
                artifactPaths,
                completionReport: completionReconciliation.artifact,
                stdout: execution.stdout,
                stderr: execution.stderr,
                executionStatus: execution.executionStatus,
                exitCode: execution.exitCode,
                executionMessage: execution.executionErrors[0] ?? null,
                stdinHash: execution.stdinHash,
                transcriptPath: execution.transcriptPath,
                lastMessagePath: execution.lastMessagePath,
                lastMessage: execution.lastMessage,
                invocation: execution.invocation,
                verifierResults: [...classified.verifierResults],
                diffSummary: preliminaryVerification.fileChangeVerification.diffSummary,
                result,
                remediationArtifact,
                afterGit: preliminaryVerification.afterGit,
                promptCacheStats: execution.promptCacheStats,
                executionCostUsd: execution.executionCostUsd
            });
            const runRecord = runRecordFromIteration(mode, prepared, startedAt, result);
            await this.stateManager.recordIteration(prepared.rootPath, prepared.paths, prepared.state, result, prepared.objectiveText, runRecord);
            await (0, provenancePersistence_1.writeLoopTerminationHandoff)({
                paths: prepared.paths,
                result,
                progressNote: completionReconciliation.artifact.report?.progressNote ?? null,
                pendingBlocker: classified.selectedTaskAfter?.blocker ?? completionReconciliation.artifact.report?.blocker ?? null
            });
            await (0, provenancePersistence_1.cleanupGeneratedArtifactsHelper)(prepared.paths, prepared.config.generatedArtifactRetentionCount, 'execution', this.logger);
            this.logger.info('Completed Ralph iteration.', {
                iteration: prepared.iteration,
                selectedTaskId: prepared.selectedTask?.id ?? null,
                executionStatus: result.executionStatus,
                verificationStatus: result.verificationStatus,
                completionClassification: result.completionClassification,
                stopReason: result.stopReason,
                promptPath: prepared.promptPath,
                promptArtifactPath: prepared.executionPlan.promptArtifactPath,
                promptHash: prepared.executionPlan.promptHash,
                executionPayloadMatched: result.executionIntegrity?.executionPayloadMatched ?? null,
                artifactDir: artifactPaths.directory,
                selectedTaskAfterStatus: classified.selectedTaskAfter?.status ?? null
            });
            return {
                prepared,
                result,
                loopDecision,
                createdPaths: prepared.createdPaths,
                autoReviewContext: branchPerTask.autoReviewContext
            };
        }
        finally {
            if (prepared.selectedTask) {
                await (0, taskFile_1.releaseClaim)(prepared.paths.claimFilePath, prepared.selectedTask.id, prepared.config.agentId).catch((error) => {
                    this.logger.warn('Failed to release Ralph task claim after iteration.', {
                        selectedTaskId: prepared.selectedTask?.id ?? null,
                        provenanceId: prepared.provenanceId,
                        error: (0, error_1.toErrorMessage)(error)
                    });
                });
            }
        }
    }
}
exports.RalphIterationEngine = RalphIterationEngine;
//# sourceMappingURL=iterationEngine.js.map