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
const iterationScm_1 = require("./iterationScm");
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
const artifactStore_1 = require("./artifactStore");
const reconciliation_1 = require("./reconciliation");
const taskDecomposition_1 = require("./taskDecomposition");
const cliOutputFormatter_1 = require("./cliOutputFormatter");
const reviewPolicy_1 = require("./reviewPolicy");
const provenancePersistence_1 = require("./provenancePersistence");
const executionIntegrity_1 = require("./executionIntegrity");
const EMPTY_GIT_STATUS = {
    available: false,
    raw: '',
    entries: []
};
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
    async preparePrompt(workspaceFolder, progress, options) {
        const prepared = await (0, iterationPreparation_1.prepareIterationContext)({
            workspaceFolder,
            progress,
            includeVerifierContext: false,
            configOverrides: options?.configOverrides,
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
            focusTaskId: options.focusTaskId,
            stateManager: this.stateManager,
            logger: this.logger,
            cliProvider: this.strategies.getActiveCliProvider(),
            persistBlockedPreflightBundle: (input) => (0, provenancePersistence_1.persistBlockedPreflightBundle)(input, this.logger),
            persistPreparedProvenanceBundle: (preparedContext) => (0, provenancePersistence_1.persistPreparedProvenanceBundle)(preparedContext, this.logger)
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
            broadcaster?.emitPhase(prepared.iteration, 'prompt', prepared.config.agentId);
            progress.report({
                message: `Executing Ralph iteration ${prepared.iteration}`
            });
            broadcaster?.emitPhase(prepared.iteration, 'execute', prepared.config.agentId);
            this.strategies.configureCliProvider(prepared.config);
            let executionStatus = 'skipped';
            let executionWarnings = [];
            let executionErrors = [];
            let execStdout = '';
            let execStderr = '';
            let execExitCode = null;
            let execStdinHash = null;
            let execPromptCacheStats = null;
            let execCostUsd = null;
            let transcriptPath;
            let lastMessagePath;
            let lastMessage = '';
            let invocation;
            const shouldExecutePrompt = prepared.selectedTask !== null || prepared.promptKind === 'replenish-backlog';
            // Model tiering: select the appropriate model (and optional provider override)
            // based on task complexity.  Adopted from Ruflo's smart task-routing pattern.
            const { model: selectedModel, provider: selectedProvider, score: complexityScore } = prepared.selectedTask
                ? (0, complexityScorer_1.selectModelForTask)({
                    task: prepared.selectedTask,
                    taskFile: prepared.beforeCoreState.taskFile,
                    iterationHistory: prepared.state.iterationHistory,
                    tiering: prepared.config.modelTiering,
                    fallbackModel: prepared.config.model
                })
                : { model: prepared.config.model, provider: undefined, score: null };
            if (complexityScore !== null) {
                this.logger.info('Model tiering selected model for task.', {
                    taskId: prepared.selectedTask?.id ?? null,
                    model: selectedModel,
                    provider: selectedProvider ?? prepared.config.cliProvider,
                    complexityScore: complexityScore.score,
                    signals: complexityScore.signals
                });
            }
            // Resolve the effective provider for this iteration.  When the tier
            // specifies a provider override, use it; otherwise fall back to the
            // workspace default.
            const effectiveProvider = selectedProvider ?? prepared.config.cliProvider;
            const effectiveCommandPath = selectedProvider
                ? (0, providers_1.getCliCommandPathForProvider)(selectedProvider, prepared.config)
                : (0, providers_1.getCliCommandPath)(prepared.config);
            const execStrategy = this.strategies.getCliExecStrategyForProvider(selectedProvider);
            if (!execStrategy.runExec) {
                throw new Error('The configured CLI strategy does not support exec.');
            }
            if (shouldExecutePrompt) {
                const artifactBaseName = (0, promptBuilder_1.createArtifactBaseName)(prepared.promptKind, prepared.iteration);
                const runArtifacts = this.stateManager.runArtifactPaths(prepared.paths, artifactBaseName);
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
                    const verifiedPlan = await (0, executionIntegrity_1.readVerifiedExecutionPlanArtifact)(prepared.executionPlanPath, prepared.executionPlanHash);
                    const promptArtifactText = await (0, executionIntegrity_1.readVerifiedPromptArtifact)(verifiedPlan);
                    // Gap 6: Re-read the selected task status immediately before shelling out.
                    // Another agent may have completed this task in the window between
                    // prepareIterationContext (where the prompt was built) and now.
                    // Throw StaleTaskContextError so the catch block below can convert it into
                    // a clean 'skipped' result instead of wasting CLI compute.
                    if (prepared.selectedTask) {
                        const freshTask = (0, taskFile_1.findTaskById)((0, taskFile_1.parseTaskFile)(await fs.readFile(prepared.paths.taskFilePath, 'utf8')), prepared.selectedTask.id);
                        if (freshTask?.status === 'done') {
                            throw new executionIntegrity_1.StaleTaskContextError(prepared.selectedTask.id);
                        }
                    }
                    phaseTimestamps.executionStartedAt = new Date().toISOString();
                    let claudeLineBuffer = '';
                    // Build the base exec request used by both the primary and fallback providers.
                    const baseExecRequest = {
                        workspaceRoot: prepared.rootPath,
                        executionRoot: prepared.rootPolicy.executionRootPath,
                        prompt: promptArtifactText,
                        promptPath: verifiedPlan.promptArtifactPath,
                        promptHash: verifiedPlan.promptHash,
                        promptByteLength: verifiedPlan.promptByteLength,
                        transcriptPath: runArtifacts.transcriptPath,
                        lastMessagePath: runArtifacts.lastMessagePath,
                        model: selectedModel,
                        reasoningEffort: prepared.config.reasoningEffort,
                        sandboxMode: prepared.config.sandboxMode,
                        approvalMode: prepared.config.approvalMode,
                        timeoutMs: prepared.config.cliExecutionTimeoutMs > 0 ? prepared.config.cliExecutionTimeoutMs : undefined,
                        promptCaching: prepared.config.promptCaching,
                        onStderrChunk: (chunk) => this.logger.warn('codex stderr', { iteration: prepared.iteration, chunk })
                    };
                    const makeStdoutChunk = (provider) => provider === 'claude'
                        ? (chunk) => {
                            claudeLineBuffer += chunk;
                            const lines = claudeLineBuffer.split('\n');
                            claudeLineBuffer = lines.pop() ?? '';
                            for (const line of lines) {
                                const label = (0, cliOutputFormatter_1.formatClaudeStreamLine)(line.trim());
                                if (label) {
                                    this.logger.appendText(label);
                                }
                            }
                        }
                        : (chunk) => this.logger.info('codex stdout', { iteration: prepared.iteration, chunk });
                    let execResult;
                    let usedCommandPath = effectiveCommandPath;
                    let fallbackWarning;
                    try {
                        execResult = await execStrategy.runExec({
                            ...baseExecRequest,
                            commandPath: effectiveCommandPath,
                            onStdoutChunk: makeStdoutChunk(effectiveProvider)
                        });
                    }
                    catch (primaryError) {
                        // Fallback chain: if a per-tier provider failed with ENOENT (binary not found)
                        // and it differs from the workspace default, retry with the default provider.
                        const isEnoent = primaryError?.cause?.code === 'ENOENT';
                        if (isEnoent && selectedProvider && selectedProvider !== prepared.config.cliProvider) {
                            this.logger.warn('Per-tier provider not found; falling back to workspace default.', {
                                failedProvider: selectedProvider,
                                fallbackProvider: prepared.config.cliProvider,
                                model: selectedModel
                            });
                            const fallbackStrategy = this.strategies.getCliExecStrategyForProvider(prepared.config.cliProvider);
                            if (!fallbackStrategy.runExec) {
                                throw primaryError;
                            }
                            usedCommandPath = (0, providers_1.getCliCommandPath)(prepared.config);
                            fallbackWarning = `Per-tier provider "${selectedProvider}" not found; fell back to workspace default "${prepared.config.cliProvider}".`;
                            claudeLineBuffer = '';
                            execResult = await fallbackStrategy.runExec({
                                ...baseExecRequest,
                                commandPath: usedCommandPath,
                                onStdoutChunk: makeStdoutChunk(prepared.config.cliProvider)
                            });
                        }
                        else {
                            throw primaryError;
                        }
                    }
                    phaseTimestamps.executionFinishedAt = new Date().toISOString();
                    executionStatus = execResult.exitCode === 0 ? 'succeeded' : 'failed';
                    executionWarnings = fallbackWarning ? [fallbackWarning, ...execResult.warnings] : execResult.warnings;
                    executionErrors = execResult.exitCode === 0 ? [] : [execResult.message];
                    execStdout = execResult.stdout;
                    execStderr = execResult.stderr;
                    execExitCode = execResult.exitCode;
                    execStdinHash = execResult.stdinHash;
                    transcriptPath = execResult.transcriptPath;
                    lastMessagePath = execResult.lastMessagePath;
                    lastMessage = execResult.lastMessage;
                    execPromptCacheStats = execResult.promptCacheStats ?? null;
                    execCostUsd = execResult.executionCostUsd ?? null;
                    invocation = {
                        schemaVersion: 1,
                        kind: 'cliInvocation',
                        agentId: prepared.config.agentId,
                        provenanceId: prepared.provenanceId,
                        iteration: prepared.iteration,
                        commandPath: usedCommandPath,
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
                    if (error instanceof executionIntegrity_1.StaleTaskContextError) {
                        // Gap 6: selected task was completed by a concurrent agent between
                        // prepare and execute.  Treat as a clean skip rather than a failure.
                        executionStatus = 'skipped';
                        executionWarnings.push(`Execution skipped: task ${error.taskId} was already completed by a concurrent agent between preparation and execution.`);
                        phaseTimestamps.executionStartedAt = phaseTimestamps.executionStartedAt ?? new Date().toISOString();
                        phaseTimestamps.executionFinishedAt = new Date().toISOString();
                    }
                    else {
                        const integrityFailure = (0, executionIntegrity_1.toIntegrityFailureError)(error, prepared);
                        if (integrityFailure) {
                            phaseTimestamps.executionStartedAt = phaseTimestamps.executionStartedAt ?? new Date().toISOString();
                            phaseTimestamps.executionFinishedAt = new Date().toISOString();
                            await (0, provenancePersistence_1.persistIntegrityFailureBundle)(prepared, integrityFailure.details, this.logger);
                        }
                        throw error;
                    }
                }
            }
            else {
                executionWarnings = ['No actionable Ralph task was selected; execution was skipped.'];
                phaseTimestamps.executionStartedAt = new Date().toISOString();
                phaseTimestamps.executionFinishedAt = phaseTimestamps.executionStartedAt;
            }
            // Run afterIteration / onFailure hooks (adopted from Ruflo's hook system).
            if (shouldExecutePrompt) {
                const postHookContext = {
                    agentId: prepared.config.agentId,
                    taskId: prepared.selectedTask?.id ?? null,
                    outcome: executionStatus,
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
                if (executionStatus === 'failed') {
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
            const afterCoreStateBeforeReconciliation = await (0, verifier_1.captureCoreState)(prepared.paths);
            const shouldCaptureGit = prepared.config.verifierModes.includes('gitDiff') || prepared.config.gitCheckpointMode !== 'off';
            const afterGit = shouldCaptureGit ? await (0, verifier_1.captureGitStatus)(prepared.rootPolicy.verificationRootPath) : EMPTY_GIT_STATUS;
            broadcaster?.emitPhase(prepared.iteration, 'verify', prepared.config.agentId);
            progress.report({ message: 'Running Ralph verifiers' });
            const skipValidationForDocMode = (0, taskFile_1.isDocumentationMode)(prepared.selectedTask);
            const validationVerification = prepared.config.verifierModes.includes('validationCommand')
                && executionStatus === 'succeeded'
                && !skipValidationForDocMode
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
                        summary: skipValidationForDocMode
                            ? 'Validation-command verifier skipped for documentation-mode task.'
                            : executionStatus === 'succeeded'
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
            const roleAdjustedFileChange = (0, reviewPolicy_1.applyReviewAgentFileChangePolicy)({
                agentRole: prepared.config.agentRole,
                fileChangeVerification
            });
            const effectiveFileChangeVerification = roleAdjustedFileChange.fileChangeVerification;
            const relevantFileChangesForOutcome = roleAdjustedFileChange.relevantFileChangesForOutcome;
            const preliminaryVerificationStatus = (0, loopLogic_1.classifyVerificationStatus)([
                validationVerification.result.status,
                effectiveFileChangeVerification.result.status
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
                relevantFileChanges: relevantFileChangesForOutcome,
                progressChanged: prepared.beforeCoreState.hashes.progress !== afterCoreStateBeforeReconciliation.hashes.progress,
                taskFileChanged: prepared.beforeCoreState.hashes.tasks !== afterCoreStateBeforeReconciliation.hashes.tasks,
                previousIterations: prepared.state.iterationHistory,
                taskMode: prepared.selectedTask?.mode
            });
            const completionReconciliation = await (0, reconciliation_1.reconcileCompletionReport)({
                prepared,
                selectedTask: prepared.selectedTask,
                verificationStatus: preliminaryVerificationStatus,
                validationCommandStatus: validationVerification.result.status,
                preliminaryClassification: preliminaryOutcome.classification,
                lastMessage,
                taskFilePath: prepared.paths.taskFilePath,
                logger: this.logger
            });
            const branchPerTaskWarnings = [];
            let autoReviewContext;
            if (prepared.config.scmStrategy === 'branch-per-task'
                && completionReconciliation.selectedTask?.status === 'done'
                && prepared.selectedTask) {
                const taskFileAfterCompletion = (0, taskFile_1.parseTaskFile)(await fs.readFile(prepared.paths.taskFilePath, 'utf8'));
                let conflictResolver;
                if (prepared.config.autoScmOnConflict) {
                    const retryLimit = prepared.config.scmConflictRetryLimit;
                    const capturedWorkspaceFolder = workspaceFolder;
                    const capturedProgress = progress;
                    conflictResolver = async (ctx) => {
                        for (let attempt = 0; attempt < retryLimit; attempt++) {
                            const scmRun = await this.runCliIteration(capturedWorkspaceFolder, 'singleExec', capturedProgress, {
                                reachedIterationCap: false,
                                configOverrides: { agentRole: 'scm', agentId: `scm-conflict-${ctx.taskId}` }
                            });
                            if (scmRun.result.executionStatus === 'failed')
                                break;
                            const remaining = await (0, iterationScm_1.listGitConflictPaths)(ctx.rootPath);
                            if (remaining.length === 0)
                                return { resolved: true };
                        }
                        return { resolved: false };
                    };
                }
                const branchScm = await (0, iterationScm_1.reconcileBranchPerTaskScm)({
                    prepared,
                    validationStatus: validationVerification.result.status,
                    taskFileAfter: taskFileAfterCompletion,
                    conflictResolver
                });
                branchPerTaskWarnings.push(...branchScm.warnings);
                if (branchScm.parentCompletedAndMerged && branchScm.parentTask) {
                    autoReviewContext = {
                        parentTaskId: branchScm.parentTask.id,
                        parentTaskTitle: branchScm.parentTask.title
                    };
                }
            }
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
                effectiveFileChangeVerification.result,
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
            broadcaster?.emitPhase(prepared.iteration, 'classify', prepared.config.agentId);
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
                relevantFileChanges: relevantFileChangesForOutcome,
                progressChanged: taskStateVerification.progressChanged,
                taskFileChanged: taskStateVerification.taskFileChanged,
                previousIterations: prepared.state.iterationHistory,
                taskMode: prepared.selectedTask?.mode
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
                ...branchPerTaskWarnings,
                ...completionReconciliation.warnings,
                ...verifierResults.flatMap((item) => item.warnings)
            ];
            const errors = [
                ...executionErrors,
                ...verifierResults.flatMap((item) => item.errors)
            ];
            const result = {
                schemaVersion: 1,
                agentId: prepared.config.agentId,
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
            const runtimeChanges = controlPlaneRuntimeChanges(effectiveFileChangeVerification.diffSummary?.relevantChangedFiles ?? []);
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
                    lastMessage
                });
            }
            let _effectiveTaskFile = afterCoreState.taskFile;
            phaseTimestamps.persistedAt = new Date().toISOString();
            const remediationArtifact = (0, taskDecomposition_1.buildRemediationArtifact)({
                result,
                taskFile: afterCoreState.taskFile,
                previousIterations: prepared.state.iterationHistory,
                artifactDir: artifactPaths.directory,
                iterationResultPath: artifactPaths.iterationResultPath,
                createdAt: phaseTimestamps.persistedAt
            });
            if (result.stopReason === 'repeated_identical_failure'
                && result.remediation?.action === 'mark_blocked'
                && result.selectedTaskId
                && prepared.config.autoApplyRemediation.includes('mark_blocked')) {
                try {
                    _effectiveTaskFile = await (0, taskDecomposition_1.autoApplyMarkBlockedRemediation)({
                        taskFilePath: prepared.paths.taskFilePath,
                        taskId: result.selectedTaskId,
                        blocker: result.remediation.summary
                    });
                    result.warnings.push(`Remediation auto-applied: mark_blocked on task ${result.selectedTaskId}`);
                    this.logger.info('Auto-applied remediation: mark_blocked.', {
                        taskId: result.selectedTaskId,
                        blocker: result.remediation.summary
                    });
                }
                catch (error) {
                    result.warnings.push(`Failed to auto-apply remediation mark_blocked on task ${result.selectedTaskId}: ${(0, error_1.toErrorMessage)(error)}`);
                    this.logger.warn('Failed to auto-apply remediation: mark_blocked.', {
                        taskId: result.selectedTaskId,
                        blocker: result.remediation.summary,
                        error: (0, error_1.toErrorMessage)(error)
                    });
                }
            }
            if (result.remediation?.action === 'decompose_task'
                && result.selectedTaskId
                && prepared.config.autoApplyRemediation.includes('decompose_task')) {
                const suggestedChildTasks = remediationArtifact?.suggestedChildTasks ?? [];
                if (suggestedChildTasks.length === 0) {
                    result.warnings.push(`Skipped remediation auto-apply for decompose_task on task ${result.selectedTaskId}: no suggested child tasks were available.`);
                }
                else {
                    try {
                        _effectiveTaskFile = await (0, taskDecomposition_1.autoApplyDecomposeTaskRemediation)({
                            taskFilePath: prepared.paths.taskFilePath,
                            remediationArtifact: remediationArtifact
                        });
                        result.warnings.push(`Remediation auto-applied: decompose_task on task ${result.selectedTaskId}, added ${suggestedChildTasks.length} child tasks`);
                        this.logger.info('Auto-applied remediation: decompose_task.', {
                            taskId: result.selectedTaskId,
                            childTaskIds: suggestedChildTasks.map((task) => task.id)
                        });
                    }
                    catch (error) {
                        result.warnings.push(`Failed to auto-apply remediation decompose_task on task ${result.selectedTaskId}: ${(0, error_1.toErrorMessage)(error)}`);
                        this.logger.warn('Failed to auto-apply remediation: decompose_task.', {
                            taskId: result.selectedTaskId,
                            childTaskIds: suggestedChildTasks.map((task) => task.id),
                            error: (0, error_1.toErrorMessage)(error)
                        });
                    }
                }
            }
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
                    diffSummary: fileChangeVerification.diffSummary
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
            if (prepared.config.scmStrategy === 'commit-on-done'
                && taskStateVerification.selectedTaskCompleted
                && prepared.selectedTask) {
                try {
                    result.warnings.push(await (0, iterationScm_1.commitOnDone)({
                        rootPath: prepared.rootPath,
                        taskId: prepared.selectedTask.id,
                        taskTitle: prepared.selectedTask.title,
                        agentId: prepared.config.agentId,
                        iteration: prepared.iteration,
                        validationStatus: validationVerification.result.status
                    }));
                }
                catch (error) {
                    result.warnings.push(`SCM commit-on-done failed for ${prepared.selectedTask.id}: ${(0, error_1.toErrorMessage)(error)}`);
                    this.logger.warn('SCM commit-on-done failed.', {
                        taskId: prepared.selectedTask.id,
                        iteration: prepared.iteration,
                        error: (0, error_1.toErrorMessage)(error)
                    });
                }
            }
            broadcaster?.emitPhase(prepared.iteration, 'persist', prepared.config.agentId);
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
                bundle: (0, provenancePersistence_1.createProvenanceBundle)({
                    prepared,
                    status: 'executed',
                    summary: result.summary,
                    executionPayloadHash: execStdinHash,
                    executionPayloadMatched: result.executionIntegrity?.executionPayloadMatched ?? null,
                    mismatchReason: result.executionIntegrity?.mismatchReason ?? null,
                    cliInvocationPath: invocation ? prepared.provenanceBundlePaths.cliInvocationPath : null,
                    iterationResultPath: prepared.provenanceBundlePaths.iterationResultPath,
                    promptCacheStats: execPromptCacheStats,
                    executionCostUsd: execCostUsd
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
            await (0, provenancePersistence_1.writeLoopTerminationHandoff)({
                paths: prepared.paths,
                result,
                progressNote: completionReconciliation.artifact.report?.progressNote ?? null,
                pendingBlocker: selectedTaskAfter?.blocker ?? completionReconciliation.artifact.report?.blocker ?? null
            });
            await (0, provenancePersistence_1.cleanupGeneratedArtifactsHelper)(prepared.paths, prepared.config.generatedArtifactRetentionCount, 'execution', this.logger);
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
                createdPaths: prepared.createdPaths,
                autoReviewContext
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