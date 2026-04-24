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
exports.IterationExecutor = void 0;
const fs = __importStar(require("fs/promises"));
const providers_1 = require("../../config/providers");
const cliOutputFormatter_1 = require("../cliOutputFormatter");
const executionIntegrity_1 = require("../executionIntegrity");
const taskFile_1 = require("../taskFile");
const provenancePersistence_1 = require("../provenancePersistence");
class IterationExecutor {
    strategies;
    logger;
    artifactPersistence;
    constructor(strategies, logger, artifactPersistence) {
        this.strategies = strategies;
        this.logger = logger;
        this.artifactPersistence = artifactPersistence;
    }
    async execute(input) {
        const shouldExecutePrompt = input.prepared.selectedTask !== null || input.prepared.promptKind === 'replenish-backlog';
        let executionStatus = 'skipped';
        let executionWarnings = [];
        let executionErrors = [];
        let stdout = '';
        let stderr = '';
        let exitCode = null;
        let stdinHash = null;
        let promptCacheStats = null;
        let executionCostUsd = null;
        let transcriptPath;
        let lastMessagePath;
        let lastMessage = '';
        let invocation;
        let executionStartedAt;
        let executionFinishedAt;
        this.strategies.configureCliProvider(input.prepared.config);
        const execStrategy = this.strategies.getCliExecStrategyForProvider(input.selectedProvider);
        if (!execStrategy.runExec) {
            throw new Error('The configured CLI strategy does not support exec.');
        }
        if (!shouldExecutePrompt) {
            executionWarnings = ['No actionable Ralph task was selected; execution was skipped.'];
            executionStartedAt = new Date().toISOString();
            executionFinishedAt = executionStartedAt;
            return {
                shouldExecutePrompt,
                executionStatus,
                executionWarnings,
                executionErrors,
                stdout,
                stderr,
                exitCode,
                stdinHash,
                transcriptPath,
                lastMessagePath,
                lastMessage,
                invocation,
                promptCacheStats,
                executionCostUsd,
                executionStartedAt: executionStartedAt ?? new Date().toISOString(),
                executionFinishedAt: executionFinishedAt ?? executionStartedAt ?? new Date().toISOString()
            };
        }
        this.logger.info('Running Ralph iteration.', {
            iteration: input.prepared.iteration,
            mode: input.mode,
            promptPath: input.prepared.promptPath,
            promptArtifactPath: input.prepared.executionPlan.promptArtifactPath,
            promptHash: input.prepared.executionPlan.promptHash,
            selectedTaskId: input.prepared.selectedTask?.id ?? null,
            validationCommand: input.prepared.validationCommand
        });
        try {
            if (input.beforeCliExecutionIntegrityCheck) {
                await input.beforeCliExecutionIntegrityCheck(input.prepared);
            }
            const verifiedPlan = await (0, executionIntegrity_1.readVerifiedExecutionPlanArtifact)(input.prepared.executionPlanPath, input.prepared.executionPlanHash);
            const promptArtifactText = await (0, executionIntegrity_1.readVerifiedPromptArtifact)(verifiedPlan);
            if (input.prepared.selectedTask) {
                const freshTask = (0, taskFile_1.findTaskById)((0, taskFile_1.parseTaskFile)(await fs.readFile(input.prepared.paths.taskFilePath, 'utf8')), input.prepared.selectedTask.id);
                if (freshTask?.status === 'done') {
                    throw new executionIntegrity_1.StaleTaskContextError(input.prepared.selectedTask.id);
                }
            }
            // Phase boundary: preparation has already persisted prompt/plan artifacts
            // and durable claim/task state. Git branch/worktree mutation occurs here,
            // immediately before provider execution.
            if (input.prepareExecutionWorkspace) {
                await input.prepareExecutionWorkspace(input.prepared);
            }
            executionStartedAt = new Date().toISOString();
            let claudeLineBuffer = '';
            const baseExecRequest = {
                workspaceRoot: input.prepared.rootPath,
                executionRoot: input.prepared.rootPolicy.executionRootPath,
                prompt: promptArtifactText,
                promptPath: verifiedPlan.promptArtifactPath,
                promptHash: verifiedPlan.promptHash,
                promptByteLength: verifiedPlan.promptByteLength,
                transcriptPath: input.runArtifacts.transcriptPath,
                lastMessagePath: input.runArtifacts.lastMessagePath,
                model: input.selectedModel,
                reasoningEffort: input.prepared.config.reasoningEffort,
                sandboxMode: input.prepared.config.sandboxMode,
                approvalMode: input.prepared.config.approvalMode,
                timeoutMs: input.prepared.config.cliExecutionTimeoutMs > 0 ? input.prepared.config.cliExecutionTimeoutMs : undefined,
                promptCaching: input.prepared.config.promptCaching,
                onStderrChunk: (chunk) => this.logger.warn('codex stderr', { iteration: input.prepared.iteration, chunk })
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
                : (chunk) => this.logger.info('codex stdout', { iteration: input.prepared.iteration, chunk });
            let execResult;
            let usedCommandPath = input.effectiveCommandPath;
            let fallbackWarning;
            try {
                execResult = await execStrategy.runExec({
                    ...baseExecRequest,
                    commandPath: input.effectiveCommandPath,
                    onStdoutChunk: makeStdoutChunk(input.effectiveProvider)
                });
            }
            catch (primaryError) {
                const isEnoent = primaryError?.cause?.code === 'ENOENT';
                if (isEnoent && input.selectedProvider && input.selectedProvider !== input.prepared.config.cliProvider) {
                    this.logger.warn('Per-tier provider not found; falling back to workspace default.', {
                        failedProvider: input.selectedProvider,
                        fallbackProvider: input.prepared.config.cliProvider,
                        model: input.selectedModel
                    });
                    const fallbackStrategy = this.strategies.getCliExecStrategyForProvider(input.prepared.config.cliProvider);
                    if (!fallbackStrategy.runExec) {
                        throw primaryError;
                    }
                    usedCommandPath = (0, providers_1.getCliCommandPath)(input.prepared.config);
                    fallbackWarning = `Per-tier provider "${input.selectedProvider}" not found; fell back to workspace default "${input.prepared.config.cliProvider}".`;
                    claudeLineBuffer = '';
                    execResult = await fallbackStrategy.runExec({
                        ...baseExecRequest,
                        commandPath: usedCommandPath,
                        onStdoutChunk: makeStdoutChunk(input.prepared.config.cliProvider)
                    });
                }
                else {
                    throw primaryError;
                }
            }
            executionFinishedAt = new Date().toISOString();
            executionStatus = execResult.exitCode === 0 ? 'succeeded' : 'failed';
            executionWarnings = fallbackWarning ? [fallbackWarning, ...execResult.warnings] : execResult.warnings;
            executionErrors = execResult.exitCode === 0 ? [] : [execResult.message];
            stdout = execResult.stdout;
            stderr = execResult.stderr;
            exitCode = execResult.exitCode;
            stdinHash = execResult.stdinHash;
            transcriptPath = execResult.transcriptPath;
            lastMessagePath = execResult.lastMessagePath;
            lastMessage = execResult.lastMessage;
            promptCacheStats = execResult.promptCacheStats ?? null;
            executionCostUsd = execResult.executionCostUsd ?? null;
            invocation = {
                schemaVersion: 1,
                kind: 'cliInvocation',
                agentId: input.prepared.config.agentId,
                provenanceId: input.prepared.provenanceId,
                iteration: input.prepared.iteration,
                commandPath: usedCommandPath,
                args: execResult.args,
                reasoningEffort: input.prepared.config.reasoningEffort,
                workspaceRoot: input.prepared.rootPath,
                rootPolicy: input.prepared.rootPolicy,
                promptArtifactPath: verifiedPlan.promptArtifactPath,
                promptHash: verifiedPlan.promptHash,
                promptByteLength: verifiedPlan.promptByteLength,
                stdinHash: execResult.stdinHash,
                transcriptPath: execResult.transcriptPath,
                lastMessagePath: execResult.lastMessagePath,
                createdAt: new Date().toISOString()
            };
            await this.artifactPersistence.persistCliInvocation({
                paths: input.artifactPaths,
                artifactRootDir: input.prepared.paths.artifactDir,
                invocation
            });
        }
        catch (error) {
            if (error instanceof executionIntegrity_1.StaleTaskContextError) {
                executionStatus = 'skipped';
                executionWarnings.push(`Execution skipped: task ${error.taskId} was already completed by a concurrent agent between preparation and execution.`);
                executionStartedAt = executionStartedAt ?? new Date().toISOString();
                executionFinishedAt = new Date().toISOString();
            }
            else {
                const integrityFailure = (0, executionIntegrity_1.toIntegrityFailureError)(error, input.prepared);
                if (integrityFailure) {
                    executionStartedAt = executionStartedAt ?? new Date().toISOString();
                    executionFinishedAt = new Date().toISOString();
                    await (0, provenancePersistence_1.persistIntegrityFailureBundle)(input.prepared, integrityFailure.details, this.logger);
                }
                throw error;
            }
        }
        return {
            shouldExecutePrompt,
            executionStatus,
            executionWarnings,
            executionErrors,
            stdout,
            stderr,
            exitCode,
            stdinHash,
            transcriptPath,
            lastMessagePath,
            lastMessage,
            invocation,
            promptCacheStats,
            executionCostUsd,
            executionStartedAt: executionStartedAt ?? new Date().toISOString(),
            executionFinishedAt: executionFinishedAt ?? executionStartedAt ?? new Date().toISOString()
        };
    }
}
exports.IterationExecutor = IterationExecutor;
//# sourceMappingURL=IterationExecutor.js.map