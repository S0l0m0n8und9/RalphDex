import * as fs from 'fs/promises';
import { getCliCommandPath } from '../../config/providers';
import type { CliProviderId } from '../../config/types';
import type { CodexExecResult } from '../../codex/types';
import type { CodexStrategyRegistry } from '../../codex/providerFactory';
import { Logger } from '../../services/logger';
import { formatClaudeStreamLine } from '../cliOutputFormatter';
import {
  readVerifiedExecutionPlanArtifact,
  readVerifiedPromptArtifact,
  StaleTaskContextError,
  toIntegrityFailureError
} from '../executionIntegrity';
import type { PreparedIterationContext } from '../iterationPreparation';
import { findTaskById, parseTaskFile } from '../taskFile';
import type { PromptCacheStats, RalphCliInvocation, RalphIterationResult } from '../types';
import { persistIntegrityFailureBundle } from '../provenancePersistence';
import type { ArtifactPersistenceService } from './ArtifactPersistenceService';

export interface IterationExecutorInput {
  prepared: PreparedIterationContext;
  mode: 'handoff' | 'singleExec' | 'loop';
  selectedModel: string;
  selectedProvider: CliProviderId | undefined;
  effectiveProvider: CliProviderId;
  effectiveCommandPath: string;
  artifactPaths: ReturnType<ArtifactPersistenceService['resolvePaths']>;
  runArtifacts: { transcriptPath: string; lastMessagePath: string };
  beforeCliExecutionIntegrityCheck?: (prepared: PreparedIterationContext) => Promise<void>;
  prepareExecutionWorkspace?: (prepared: PreparedIterationContext) => Promise<void>;
}

export interface IterationExecutionResult {
  shouldExecutePrompt: boolean;
  executionStatus: RalphIterationResult['executionStatus'];
  executionWarnings: string[];
  executionErrors: string[];
  stdout: string;
  stderr: string;
  exitCode: number | null;
  stdinHash: string | null;
  transcriptPath: string | undefined;
  lastMessagePath: string | undefined;
  lastMessage: string;
  invocation: RalphCliInvocation | undefined;
  promptCacheStats: PromptCacheStats | null;
  executionCostUsd: number | null;
  executionStartedAt: string;
  executionFinishedAt: string;
}

export class IterationExecutor {
  public constructor(
    private readonly strategies: CodexStrategyRegistry,
    private readonly logger: Logger,
    private readonly artifactPersistence: ArtifactPersistenceService
  ) {}

  public async execute(input: IterationExecutorInput): Promise<IterationExecutionResult> {
    const shouldExecutePrompt = input.prepared.selectedTask !== null || input.prepared.promptKind === 'replenish-backlog';
    let executionStatus: RalphIterationResult['executionStatus'] = 'skipped';
    let executionWarnings: string[] = [];
    let executionErrors: string[] = [];
    let stdout = '';
    let stderr = '';
    let exitCode: number | null = null;
    let stdinHash: string | null = null;
    let promptCacheStats: PromptCacheStats | null = null;
    let executionCostUsd: number | null = null;
    let transcriptPath: string | undefined;
    let lastMessagePath: string | undefined;
    let lastMessage = '';
    let invocation: RalphCliInvocation | undefined;
    let executionStartedAt: string | undefined;
    let executionFinishedAt: string | undefined;

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
      const verifiedPlan = await readVerifiedExecutionPlanArtifact(
        input.prepared.executionPlanPath,
        input.prepared.executionPlanHash
      );
      const promptArtifactText = await readVerifiedPromptArtifact(verifiedPlan);

      if (input.prepared.selectedTask) {
        const freshTask = findTaskById(
          parseTaskFile(await fs.readFile(input.prepared.paths.taskFilePath, 'utf8')),
          input.prepared.selectedTask.id
        );
        if (freshTask?.status === 'done') {
          throw new StaleTaskContextError(input.prepared.selectedTask.id);
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
        onStderrChunk: (chunk: string) => this.logger.warn('codex stderr', { iteration: input.prepared.iteration, chunk })
      } as const;

      const makeStdoutChunk = (provider: CliProviderId) =>
        provider === 'claude'
          ? (chunk: string) => {
              claudeLineBuffer += chunk;
              const lines = claudeLineBuffer.split('\n');
              claudeLineBuffer = lines.pop() ?? '';
              for (const line of lines) {
                const label = formatClaudeStreamLine(line.trim());
                if (label) {
                  this.logger.appendText(label);
                }
              }
            }
          : (chunk: string) => this.logger.info('codex stdout', { iteration: input.prepared.iteration, chunk });

      let execResult: CodexExecResult;
      let usedCommandPath = input.effectiveCommandPath;
      let fallbackWarning: string | undefined;

      try {
        execResult = await execStrategy.runExec({
          ...baseExecRequest,
          commandPath: input.effectiveCommandPath,
          onStdoutChunk: makeStdoutChunk(input.effectiveProvider)
        });
      } catch (primaryError) {
        const isEnoent = (primaryError as { cause?: { code?: string } })?.cause?.code === 'ENOENT';
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
          usedCommandPath = getCliCommandPath(input.prepared.config);
          fallbackWarning = `Per-tier provider "${input.selectedProvider}" not found; fell back to workspace default "${input.prepared.config.cliProvider}".`;
          claudeLineBuffer = '';
          execResult = await fallbackStrategy.runExec({
            ...baseExecRequest,
            commandPath: usedCommandPath,
            onStdoutChunk: makeStdoutChunk(input.prepared.config.cliProvider)
          });
        } else {
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
    } catch (error) {
      if (error instanceof StaleTaskContextError) {
        executionStatus = 'skipped';
        executionWarnings.push(
          `Execution skipped: task ${error.taskId} was already completed by a concurrent agent between preparation and execution.`
        );
        executionStartedAt = executionStartedAt ?? new Date().toISOString();
        executionFinishedAt = new Date().toISOString();
      } else {
        const integrityFailure = toIntegrityFailureError(error, input.prepared);
        if (integrityFailure) {
          executionStartedAt = executionStartedAt ?? new Date().toISOString();
          executionFinishedAt = new Date().toISOString();
          await persistIntegrityFailureBundle(input.prepared, integrityFailure.details, this.logger);
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
