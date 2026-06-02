import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { getCliCommandPath, getCliCommandPathForProvider } from '../config/providers';
import { CliProviderId } from '../config/types';
import { CodexStrategyRegistry } from '../codex/providerFactory';
import { createArtifactBaseName } from '../prompt/promptBuilder';
import { Logger } from '../services/logger';
import { toErrorMessage } from '../util/error';
import { RalphStateManager } from './stateManager';
import { PlanningGate, type PlanningGateDecision } from './planningGate';
import {
  prepareIterationContext,
  PreparedIterationContext,
  PreparedPrompt,
  rerenderPreparedPromptContext,
} from './iterationPreparation';
import {
  DEFAULT_RALPH_AGENT_ID,
  RalphIterationResult,
  RalphLoopDecision,
  RalphRunMode,
  RalphRunRecord,
} from './types';
import {
  releaseClaim,
  parseTaskFile,
  stringifyTaskFile,
} from './taskFile';
import {
  buildFailureDiagnosticPrompt,
  classifyTransientFailure,
  parseFailureDiagnosticResponse,
  writeFailureAnalysis
} from './failureDiagnostics';
import { hashText, utf8ByteLength } from './integrity';
import { shouldRunFailureDiagnostic } from './loopLogic';
import { selectModelForTask } from './complexityScorer';
import { runHook, HookRunContext } from './hookRunner';
import { captureCoreState } from './verifier';
import { reconcileCompletionReport } from './reconciliation';
import {
  persistPreparedProvenanceBundle,
  persistBlockedPreflightBundle,
  cleanupGeneratedArtifactsHelper,
  writeLoopTerminationHandoff,
  updateAgentIdentityRecord
} from './provenancePersistence';
import type { IterationBroadcaster } from '../ui/iterationBroadcaster';
import { ArtifactPersistenceService } from './iteration/ArtifactPersistenceService';
import { IterationExecutor } from './iteration/IterationExecutor';
import { LoopDecisionService } from './iteration/LoopDecisionService';
import { OutcomeClassifier } from './iteration/OutcomeClassifier';
import { RemediationCoordinator } from './iteration/RemediationCoordinator';
import { ScmCoordinator } from './iteration/ScmCoordinator';
import { VerificationRunner } from './iteration/VerificationRunner';
import { EventJournalWriter, type RalphRuntimeEventInput } from './eventJournal';

export interface RalphIterationEngineHooks {
  beforeCliExecutionIntegrityCheck?: (prepared: PreparedIterationContext) => Promise<void>;
}

export interface RalphIterationRunSummary {
  prepared: PreparedPrompt;
  result: RalphIterationResult;
  loopDecision: RalphLoopDecision;
  createdPaths: string[];
  /** Set when a parent task completed and its integration branch was merged, signalling a review pass is appropriate. */
  autoReviewContext?: { parentTaskId: string; parentTaskTitle: string };
}

function runRecordFromIteration(
  mode: RalphRunMode,
  prepared: PreparedIterationContext,
  startedAt: string,
  result: RalphIterationResult
): RalphRunRecord | undefined {
  if (result.executionStatus === 'skipped') {
    return undefined;
  }

  return {
    agentId: result.agentId ?? DEFAULT_RALPH_AGENT_ID,
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

function relativeArtifactPath(artifactRootDir: string, artifactPath: string): string {
  return path.relative(artifactRootDir, artifactPath).replace(/\\/g, '/');
}

function isReviewAgentRole(agentRole: string): boolean {
  return agentRole === 'review' || agentRole === 'reviewer';
}

export class RalphIterationEngine {
  private readonly artifactPersistence: ArtifactPersistenceService;
  private readonly iterationExecutor: IterationExecutor;
  private readonly verificationRunner: VerificationRunner;
  private readonly outcomeClassifier: OutcomeClassifier;
  private readonly loopDecisionService: LoopDecisionService;
  private readonly remediationCoordinator: RemediationCoordinator;
  private readonly scmCoordinator: ScmCoordinator;
  private readonly planningGate: PlanningGate;

  public constructor(
    private readonly stateManager: RalphStateManager,
    private readonly strategies: CodexStrategyRegistry,
    private readonly logger: Logger,
    private readonly hooks: RalphIterationEngineHooks = {}
  ) {
    this.artifactPersistence = new ArtifactPersistenceService(this.logger);
    this.iterationExecutor = new IterationExecutor(this.strategies, this.logger, this.artifactPersistence);
    this.verificationRunner = new VerificationRunner();
    this.outcomeClassifier = new OutcomeClassifier();
    this.loopDecisionService = new LoopDecisionService();
    this.remediationCoordinator = new RemediationCoordinator(this.logger);
    this.scmCoordinator = new ScmCoordinator(this.logger);
    this.planningGate = new PlanningGate(this.strategies, this.logger);
  }

  private async appendRuntimeEvent(
    writer: EventJournalWriter | null,
    input: RalphRuntimeEventInput
  ): Promise<boolean> {
    if (!writer) {
      return false;
    }
    try {
      await writer.append(input);
      return true;
    } catch (error) {
      this.logger.warn('Failed to append Ralph runtime event.', {
        eventType: input.type,
        error: toErrorMessage(error)
      });
      return false;
    }
  }

  public async preparePrompt(
    workspaceFolder: vscode.WorkspaceFolder,
    progress: vscode.Progress<{ message?: string; increment?: number }>,
    options?: {
      configOverrides?: Partial<Pick<PreparedPrompt['config'], 'agentId' | 'agentRole'>>;
      rolePolicySource?: 'preset' | 'crew' | 'explicit';
    }
  ): Promise<PreparedPrompt> {
    const prepared = await prepareIterationContext({
      workspaceFolder,
      progress,
      includeVerifierContext: false,
      configOverrides: options?.configOverrides,
      rolePolicySource: options?.rolePolicySource,
      stateManager: this.stateManager,
      logger: this.logger,
      cliProvider: this.strategies.getActiveCliProvider(),
      persistBlockedPreflightBundle: (input) => persistBlockedPreflightBundle(input, this.logger),
      persistPreparedProvenanceBundle: (preparedContext) => persistPreparedProvenanceBundle(preparedContext, this.logger)
    });

    return {
      ...prepared
    };
  }

  /**
   * Runs a failure-diagnostic CLI turn when the loop stops due to a blocked task
   * or failed verifier. Writes failure-analysis.json. Best-effort: failures are
   * logged and never abort the main loop.
   */
  private async maybeRunFailureDiagnostic(opts: {
    taskId: string;
    taskTitle: string;
    result: import('./types').RalphIterationResult;
    config: import('../config/types').RalphCodexConfig;
    artifactRootDir: string;
    iterationHistory: import('./types').RalphIterationResult[];
    workspaceRoot: string;
    lastIterationPrompt: string;
    lastMessage: string;
  }): Promise<void> {
    try {
      const { taskId, taskTitle, result, config, artifactRootDir, iterationHistory, workspaceRoot, lastIterationPrompt, lastMessage } = opts;

      if (!shouldRunFailureDiagnostic(result.completionClassification, result.verificationStatus, config.failureDiagnostics)) {
        return;
      }

      const failureSignal = result.verification.validationFailureSignature ?? result.summary ?? '';

      // Transient failures are classified without an LLM call.
      const transientCategory = classifyTransientFailure(failureSignal);
      if (transientCategory) {
        const analysis = {
          schemaVersion: 1 as const,
          kind: 'failureAnalysis' as const,
          taskId,
          createdAt: new Date().toISOString(),
          rootCauseCategory: transientCategory,
          confidence: 'high' as const,
          summary: 'Failure classified as transient by pattern match.',
          suggestedAction: 'Retry the task; the failure is likely due to a temporary infrastructure condition.'
        };
        await writeFailureAnalysis(artifactRootDir, taskId, analysis);
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

      const diagnosticPrompt = buildFailureDiagnosticPrompt({
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

      // Diagnostic turns use global reasoning effort, not the tier-specific override.
      const execResult = await (execStrategy as { runExec: (req: import('../codex/types').CodexExecRequest) => Promise<import('../codex/types').CodexExecResult> }).runExec({
        commandPath: getCliCommandPath(config),
        workspaceRoot,
        executionRoot: workspaceRoot,
        prompt: diagnosticPrompt,
        promptPath,
        promptHash: hashText(diagnosticPrompt),
        promptByteLength: utf8ByteLength(diagnosticPrompt),
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

      const analysis = parseFailureDiagnosticResponse(execResult.lastMessage);
      if (!analysis) {
        this.logger.warn('Failure diagnostic produced no parseable analysis; skipping failure-analysis.json.', { taskId });
        return;
      }

      const enriched = { ...analysis, taskId, createdAt: new Date().toISOString() };
      await writeFailureAnalysis(artifactRootDir, taskId, enriched);
      this.logger.info('Failure diagnostic wrote failure-analysis.json.', {
        taskId,
        rootCauseCategory: enriched.rootCauseCategory,
        confidence: enriched.confidence
      });
    } catch (err) {
      this.logger.warn('maybeRunFailureDiagnostic encountered an unexpected error; continuing.', {
        error: String(err)
      });
    }
  }

  public async runCliIteration(
    workspaceFolder: vscode.WorkspaceFolder,
    mode: RalphRunMode,
    progress: vscode.Progress<{ message?: string; increment?: number }>,
    options: {
      reachedIterationCap: boolean;
      configOverrides?: Partial<Pick<PreparedPrompt['config'], 'agentId' | 'agentRole'>>;
      rolePolicySource?: 'preset' | 'crew' | 'explicit';
      broadcaster?: IterationBroadcaster;
      /** When set, task selection will prefer this task ID (used to direct review agents to a specific parent task). */
      focusTaskId?: string;
    }
  ): Promise<RalphIterationRunSummary> {
    const broadcaster = options.broadcaster;
    const earlyAgentId = options.configOverrides?.agentId;
    broadcaster?.emitPhase(0, 'inspect', earlyAgentId);

    let prepared = await prepareIterationContext({
      workspaceFolder,
      progress,
      includeVerifierContext: true,
      configOverrides: options.configOverrides,
      rolePolicySource: options.rolePolicySource,
      focusTaskId: options.focusTaskId,
      stateManager: this.stateManager,
      logger: this.logger,
      cliProvider: this.strategies.getActiveCliProvider(),
      persistBlockedPreflightBundle: (input) => persistBlockedPreflightBundle(input, this.logger),
      persistPreparedProvenanceBundle: (preparedContext) => persistPreparedProvenanceBundle(preparedContext, this.logger)
    });
    let eventJournal: EventJournalWriter | null = null;
    let runtimeRunCompleted = false;
    try {
      let artifactPaths = this.artifactPersistence.resolvePaths(prepared.paths.artifactDir, prepared.iteration);
      eventJournal = await EventJournalWriter.open(prepared.paths.artifactDir, prepared.provenanceId);
      const startedAt = prepared.phaseSeed.inspectStartedAt;
      const phaseTimestamps: RalphIterationResult['phaseTimestamps'] = {
        inspectStartedAt: prepared.phaseSeed.inspectStartedAt,
        inspectFinishedAt: prepared.phaseSeed.inspectFinishedAt,
        taskSelectedAt: prepared.phaseSeed.taskSelectedAt,
        promptGeneratedAt: prepared.phaseSeed.promptGeneratedAt,
        resultCollectedAt: startedAt,
        verificationFinishedAt: startedAt,
        classifiedAt: startedAt
      };
      await this.appendRuntimeEvent(eventJournal, {
        type: 'run_started',
        mode,
        backlogRemaining: prepared.beforeCoreState.taskFile.tasks.filter((task) => task.status !== 'done').length
      });
      if (prepared.selectedTask) {
        await this.appendRuntimeEvent(eventJournal, {
          type: 'task_selected',
          taskId: prepared.selectedTask.id,
          title: prepared.selectedTask.title,
          iteration: prepared.iteration
        });
      }

      const planningGateDecision = await this.planningGate.evaluate(prepared);
      if (planningGateDecision.warnings.length > 0) {
        this.logger.warn('Planning readiness gate produced warnings.', {
          selectedTaskId: prepared.selectedTask?.id ?? null,
          warnings: planningGateDecision.warnings
        });
      }
      if (planningGateDecision.outcome === 'decomposed_and_stop'
        || planningGateDecision.outcome === 'blocked_and_stop'
        || planningGateDecision.outcome === 'human_review_and_stop') {
        const now = new Date().toISOString();
        const stopReason = planningGateDecision.outcome === 'decomposed_and_stop'
          ? 'planning_gate_decomposed'
          : planningGateDecision.outcome === 'blocked_and_stop'
            ? 'planning_gate_blocked'
            : 'planning_gate_human_review';
        const completionClassification = planningGateDecision.outcome === 'human_review_and_stop' ? 'needs_human_review' : 'blocked';
        const taskArtifactDir = path.join(prepared.paths.artifactDir, prepared.selectedTask?.id ?? 'none');
        await fs.mkdir(taskArtifactDir, { recursive: true });
        const gateArtifactPath = path.join(taskArtifactDir, 'planning-gate-result.json');
        const iterationGateArtifactPath = path.join(artifactPaths.directory, 'planning-gate-result.json');
        await fs.writeFile(gateArtifactPath, JSON.stringify({
          schemaVersion: 1,
          kind: 'planningReadinessGate',
          outcome: planningGateDecision.outcome,
          selectedTaskId: prepared.selectedTask?.id ?? null,
          selectedTaskTitle: prepared.selectedTask?.title ?? null,
          summary: planningGateDecision.summary,
          warnings: planningGateDecision.warnings,
          plan: planningGateDecision.plan,
          createdAt: now
        }, null, 2), 'utf8');
        await fs.mkdir(artifactPaths.directory, { recursive: true });
        await fs.copyFile(gateArtifactPath, iterationGateArtifactPath);

        const result: RalphIterationResult = {
          schemaVersion: 1,
          agentId: prepared.config.agentId,
          provenanceId: prepared.provenanceId,
          iteration: prepared.iteration,
          selectedTaskId: prepared.selectedTask?.id ?? null,
          selectedTaskTitle: prepared.selectedTask?.title ?? null,
          promptKind: prepared.promptKind,
          promptPath: prepared.promptPath,
          artifactDir: artifactPaths.directory,
          adapterUsed: prepared.config.cliProvider,
          executionIntegrity: null,
          executionStatus: 'skipped',
          verificationStatus: 'skipped',
          completionClassification,
          followUpAction: 'stop',
          startedAt,
          finishedAt: now,
          phaseTimestamps: {
            ...phaseTimestamps,
            executionStartedAt: now,
            executionFinishedAt: now,
            resultCollectedAt: now,
            verificationFinishedAt: now,
            classifiedAt: now,
            persistedAt: now
          },
          summary: planningGateDecision.summary,
          warnings: planningGateDecision.warnings,
          errors: [],
          execution: {
            exitCode: null,
            message: planningGateDecision.summary
          },
          verification: {
            taskValidationHint: prepared.taskValidationHint,
            effectiveValidationCommand: prepared.effectiveValidationCommand,
            normalizedValidationCommandFrom: prepared.normalizedValidationCommandFrom,
            primaryCommand: null,
            validationFailureSignature: null,
            verifiers: []
          },
          backlog: {
            remainingTaskCount: prepared.beforeCoreState.taskFile.tasks.filter((task) => task.status !== 'done').length,
            actionableTaskAvailable: true
          },
          diffSummary: null,
          noProgressSignals: [],
          remediation: null,
          completionReportStatus: 'missing',
          stopReason,
          selectedModel: prepared.config.model,
          selectedReasoningEffort: prepared.config.reasoningEffort,
          effectiveTier: 'planning_gate'
        };
        const loopDecision: RalphLoopDecision = {
          shouldContinue: false,
          stopReason,
          message: planningGateDecision.summary
        };

        await this.artifactPersistence.persistIterationArtifacts({
          prepared,
          artifactPaths,
          completionReport: {
            schemaVersion: 1,
            kind: 'completionReport',
            status: 'missing',
            rejectionReason: null,
            selectedTaskId: prepared.selectedTask?.id ?? null,
            report: null,
            rawBlock: null,
            parseError: null,
            warnings: []
          },
          stdout: '',
          stderr: '',
          executionStatus: 'skipped',
          exitCode: null,
          executionMessage: planningGateDecision.summary,
          stdinHash: null,
          transcriptPath: undefined,
          lastMessagePath: undefined,
          lastMessage: planningGateDecision.summary,
          invocation: undefined,
          verifierResults: [],
          diffSummary: null,
          result,
          remediationArtifact: null,
          afterGit: prepared.beforeGit,
          promptCacheStats: null,
          executionCostUsd: null
        });
        await this.appendRuntimeEvent(eventJournal, {
          type: 'artifact_written',
          artifactType: 'iteration-result',
          relativePath: relativeArtifactPath(prepared.paths.artifactDir, artifactPaths.iterationResultPath),
          iteration: prepared.iteration
        });
        await this.appendRuntimeEvent(eventJournal, {
          type: 'artifact_written',
          artifactType: 'planning-gate-result',
          relativePath: relativeArtifactPath(prepared.paths.artifactDir, iterationGateArtifactPath),
          iteration: prepared.iteration
        });
        if (prepared.selectedTask && completionClassification === 'blocked' && prepared.selectedTask.status !== 'blocked') {
          await this.appendRuntimeEvent(eventJournal, {
            type: 'task_state_changed',
            taskId: prepared.selectedTask.id,
            from: prepared.selectedTask.status,
            to: 'blocked',
            reason: stopReason
          });
        }
        runtimeRunCompleted = await this.appendRuntimeEvent(eventJournal, {
          type: 'run_completed',
          stopReason,
          iterations: prepared.iteration,
          backlogRemaining: result.backlog.remainingTaskCount ?? undefined
        });

        const runRecord = runRecordFromIteration(mode, prepared, startedAt, result);
        await this.stateManager.recordIteration(
          prepared.rootPath,
          prepared.paths,
          prepared.state,
          result,
          prepared.objectiveText,
          runRecord
        );
        await writeLoopTerminationHandoff({
          paths: prepared.paths,
          result,
          progressNote: null,
          pendingBlocker: planningGateDecision.summary
        });

        return {
          prepared,
          result,
          loopDecision,
          createdPaths: prepared.createdPaths
        };
      }

      if ((planningGateDecision.outcome === 'proceed' || planningGateDecision.outcome === 'warn_and_proceed')
        && planningGateDecision.plan) {
        prepared = await rerenderPreparedPromptContext({
          prepared,
          stateManager: this.stateManager,
          logger: this.logger,
          rolePolicySource: options.rolePolicySource,
          persistPreparedProvenanceBundle: (preparedContext) => persistPreparedProvenanceBundle(preparedContext, this.logger)
        });
      }

      broadcaster?.emitPhase(prepared.iteration, 'prompt', prepared.config.agentId);
      progress.report({
        message: `Executing Ralph iteration ${prepared.iteration}`
      });
      broadcaster?.emitPhase(prepared.iteration, 'execute', prepared.config.agentId);

      // Model tiering: select the appropriate model (and optional provider override)
      // based on task complexity. Adopted from Ruflo's smart task-routing pattern.
      const {
        model: selectedModel,
        provider: selectedProvider,
        reasoningEffort: selectedTierReasoningEffort,
        score: complexityScore,
        tier: effectiveTier
      } = prepared.selectedTask
        ? selectModelForTask({
          task: prepared.selectedTask,
          taskFile: prepared.beforeCoreState.taskFile,
          iterationHistory: prepared.state.iterationHistory,
          tiering: prepared.config.modelTiering,
          fallbackModel: prepared.config.model,
          fallbackReasoningEffort: prepared.config.reasoningEffort
        })
        : {
          model: prepared.config.model,
          provider: undefined as CliProviderId | undefined,
          reasoningEffort: prepared.config.reasoningEffort,
          score: null,
          tier: 'default' as const
        };
      let selectedReasoningEffort = selectedTierReasoningEffort ?? prepared.config.reasoningEffort;

      if (complexityScore !== null) {
        this.logger.info('Model tiering selected model for task.', {
          taskId: prepared.selectedTask?.id ?? null,
          model: selectedModel,
          provider: selectedProvider ?? prepared.config.cliProvider,
          reasoningEffort: selectedReasoningEffort,
          complexityScore: complexityScore.score,
          signals: complexityScore.signals
        });
      }

      // Resolve the effective provider for this iteration. When the tier
      // specifies a provider override, use it; otherwise fall back to the
      // workspace default.
      const effectiveProvider: CliProviderId = selectedProvider ?? prepared.config.cliProvider;
      const effectiveCommandPath = selectedProvider
        ? getCliCommandPathForProvider(selectedProvider, prepared.config)
        : getCliCommandPath(prepared.config);
      let selectedProviderForResult: CliProviderId = effectiveProvider;
      let selectedModelForResult = selectedModel;
      const shouldExecutePrompt = prepared.selectedTask !== null || prepared.promptKind === 'replenish-backlog';

      // Keep strategy support checks before hook execution.
      this.strategies.configureCliProvider(prepared.config);
      const precheckExecStrategy = this.strategies.getCliExecStrategyForProvider(selectedProvider);
      if (!precheckExecStrategy.runExec) {
        throw new Error('The configured CLI strategy does not support exec.');
      }

      if (shouldExecutePrompt) {
        // Run beforeIteration hook (adopted from Ruflo's hook system).
        const hookContext: HookRunContext = {
          agentId: prepared.config.agentId,
          taskId: prepared.selectedTask?.id ?? null,
          outcome: 'pending',
          stopReason: null,
          cwd: prepared.rootPath
        };
        const beforeHookResult = await runHook('beforeIteration', prepared.config.hooks, hookContext);
        if (!beforeHookResult.skipped && beforeHookResult.exitCode !== 0) {
          this.logger.warn('beforeIteration hook exited non-zero.', {
            command: beforeHookResult.command,
            exitCode: beforeHookResult.exitCode,
            stderr: beforeHookResult.stderr.slice(0, 500)
          });
        }
      }

      const artifactBaseName = createArtifactBaseName(prepared.promptKind, prepared.iteration);
      const runArtifacts = this.stateManager.runArtifactPaths(prepared.paths, artifactBaseName);
      if (shouldExecutePrompt) {
        await this.appendRuntimeEvent(eventJournal, {
          type: 'provider_invoked',
          taskId: prepared.selectedTask?.id ?? null,
          provider: effectiveProvider,
          iteration: prepared.iteration
        });
      }
      const execution = await this.iterationExecutor.execute({
        prepared,
        mode,
        selectedModel,
        selectedReasoningEffort,
        effectiveTier,
        selectedProvider,
        effectiveProvider,
        effectiveCommandPath,
        artifactPaths,
        runArtifacts,
        beforeCliExecutionIntegrityCheck: this.hooks.beforeCliExecutionIntegrityCheck,
        prepareExecutionWorkspace: (preparedContext) => this.scmCoordinator.prepareExecutionWorkspace(preparedContext)
      });
      if (shouldExecutePrompt) {
        await this.appendRuntimeEvent(eventJournal, {
          type: 'provider_completed',
          taskId: prepared.selectedTask?.id ?? null,
          provider: effectiveProvider,
          status: execution.executionStatus,
          iteration: prepared.iteration
        });
      }
      phaseTimestamps.executionStartedAt = execution.executionStartedAt;
      phaseTimestamps.executionFinishedAt = execution.executionFinishedAt;

      // If the executor fell back due to a missing per-tier provider, the invocation
      // will reflect the workspace-default reasoning effort. Update selectedReasoningEffort
      // to match what was actually used so OutcomeClassifier records the true execution profile.
      if (execution.invocation && execution.invocation.reasoningEffort !== selectedReasoningEffort) {
        selectedReasoningEffort = execution.invocation.reasoningEffort;
      }
      if (execution.invocation?.selectedProvider) {
        selectedProviderForResult = execution.invocation.selectedProvider;
      }
      if (execution.invocation?.selectedModel) {
        selectedModelForResult = execution.invocation.selectedModel;
      }

      // Run afterIteration / onFailure hooks (adopted from Ruflo's hook system).
      if (shouldExecutePrompt) {
        const postHookContext: HookRunContext = {
          agentId: prepared.config.agentId,
          taskId: prepared.selectedTask?.id ?? null,
          outcome: execution.executionStatus,
          stopReason: null,
          cwd: prepared.rootPath
        };
        const afterHookResult = await runHook('afterIteration', prepared.config.hooks, postHookContext);
        if (!afterHookResult.skipped && afterHookResult.exitCode !== 0) {
          this.logger.warn('afterIteration hook exited non-zero.', {
            command: afterHookResult.command,
            exitCode: afterHookResult.exitCode,
            stderr: afterHookResult.stderr.slice(0, 500)
          });
        }
        if (execution.executionStatus === 'failed') {
          const failureHookResult = await runHook('onFailure', prepared.config.hooks, postHookContext);
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
      const completionReconciliation = await reconcileCompletionReport({
        prepared,
        selectedTask: prepared.selectedTask,
        verificationStatus: preliminaryVerification.preliminaryVerificationStatus,
        validationCommandStatus: preliminaryVerification.validationVerification.result.status,
        preliminaryClassification: preliminaryVerification.preliminaryOutcome.classification,
        lastMessage: execution.lastMessage,
        taskFilePath: prepared.paths.taskFilePath,
        logger: this.logger
      });
      await this.appendRuntimeEvent(eventJournal, {
        type: 'completion_report_parsed',
        taskId: prepared.selectedTask?.id ?? null,
        requestedStatus: completionReconciliation.artifact.report?.requestedStatus ?? null,
        parsed: completionReconciliation.artifact.status === 'applied',
        needsHumanReview: completionReconciliation.artifact.report?.needsHumanReview ?? false
      });
      if (prepared.config.agentRole === 'watchdog'
        && completionReconciliation.artifact.status === 'applied'
        && completionReconciliation.appliedWatchdogActions.length > 0) {
        for (const action of completionReconciliation.appliedWatchdogActions) {
          await this.appendRuntimeEvent(eventJournal, {
            type: 'recovery_applied',
            taskId: action.taskId,
            action: `watchdog:${action.action}`,
            severity: action.severity.toLowerCase()
          });
        }
      }
      const branchPerTask = await this.scmCoordinator.reconcileBranchPerTask({
        prepared,
        completionReconciliation,
        validationStatus: preliminaryVerification.validationVerification.result.status,
        runConflictResolverIteration: async (taskId) => {
          const scmRun = await this.runCliIteration(
            workspaceFolder,
            'singleExec',
            progress,
            {
              reachedIterationCap: false,
              configOverrides: { agentRole: 'scm', agentId: `scm-conflict-${taskId}` },
              rolePolicySource: 'explicit',
              focusTaskId: taskId
            }
          );
          return {
            executionStatus: scmRun.result.executionStatus,
            selectedTaskId: scmRun.result.selectedTaskId,
            completionReportStatus: scmRun.result.completionReportStatus
          };
        }
      });
      for (const scmAction of branchPerTask.scmActions) {
        await this.appendRuntimeEvent(eventJournal, {
          type: 'scm_action',
          taskId: scmAction.taskId,
          action: scmAction.action,
          status: scmAction.status
        });
      }

      let afterCoreState = await captureCoreState(prepared.paths);
      let taskStateVerification = await this.verificationRunner.runTaskStateVerification({
        prepared,
        artifactPaths,
        completionReconciliation,
        afterCoreState
      });

      if (branchPerTask.warnings.some((warning) => warning.includes('SCM branch-per-task failed for '))) {
        afterCoreState = await captureCoreState(prepared.paths);
        taskStateVerification = await this.verificationRunner.runTaskStateVerification({
          prepared,
          artifactPaths,
          completionReconciliation,
          afterCoreState
        });
      }
      const branchPerTaskFailed = branchPerTask.warnings.some((warning) => warning.includes('SCM branch-per-task failed for '));
      const selectedTaskReopened = branchPerTask.selectedTaskStatus === 'in_progress'
        || taskStateVerification.selectedTaskAfter?.status === 'in_progress';
      if (branchPerTaskFailed && taskStateVerification.selectedTaskAfter?.status === 'in_progress') {
        taskStateVerification = {
          ...taskStateVerification,
          selectedTaskCompleted: false,
          selectedTaskBlocked: false,
          humanReviewNeeded: false
        };
      }
      if (selectedTaskReopened) {
        const reopenedSelectedTask = taskStateVerification.selectedTaskAfter
          ?? branchPerTask.selectedTask
          ?? completionReconciliation.selectedTask;
        completionReconciliation.selectedTask = reopenedSelectedTask
          ? {
            ...reopenedSelectedTask,
            status: 'in_progress'
          }
          : completionReconciliation.selectedTask;
        taskStateVerification = {
          ...taskStateVerification,
          selectedTaskAfter: completionReconciliation.selectedTask,
          selectedTaskCompleted: false,
          selectedTaskBlocked: false,
          humanReviewNeeded: false
        };
      }

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
        workspaceChangeScanFiles: preliminaryVerification.workspaceChangeScanFiles,
        completionReconciliation,
        taskStateVerification,
        afterCoreState,
        selectedProvider: selectedProviderForResult,
        selectedModel: selectedModelForResult,
        selectedReasoningEffort,
        effectiveTier,
        branchPerTaskWarnings: branchPerTask.warnings
      });

      let result = classified.result;
      if (planningGateDecision.warnings.length > 0) {
        result = {
          ...result,
          warnings: [...planningGateDecision.warnings, ...result.warnings]
        };
      }
      for (const verifier of classified.verifierResults) {
        await this.appendRuntimeEvent(eventJournal, {
          type: 'verifier_result',
          taskId: prepared.selectedTask?.id ?? null,
          verifier: verifier.verifier,
          status: verifier.status,
          iteration: prepared.iteration
        });
      }
      if (isReviewAgentRole(prepared.config.agentRole)) {
        const anomalyCount = classified.verifierResults.filter((verifier) => verifier.status === 'failed').length
          + result.errors.length;
        await this.appendRuntimeEvent(eventJournal, {
          type: 'review_result',
          taskId: prepared.selectedTask?.id ?? null,
          status: result.verificationStatus === 'passed' && result.completionReportStatus !== 'rejected' && anomalyCount === 0
            ? 'passed'
            : 'flagged',
          anomalies: anomalyCount
        });
      }
      if (prepared.selectedTask
        && classified.selectedTaskAfter
        && prepared.selectedTask.status !== classified.selectedTaskAfter.status) {
        await this.appendRuntimeEvent(eventJournal, {
          type: 'task_state_changed',
          taskId: prepared.selectedTask.id,
          from: prepared.selectedTask.status,
          to: classified.selectedTaskAfter.status,
          reason: completionReconciliation.artifact.status
        });
      }
      const loopEvaluation = this.loopDecisionService.evaluate({
        prepared,
        result,
        selectedTaskCompleted: taskStateVerification.selectedTaskCompleted,
        remainingSubtaskCount: classified.remainingSubtaskList.length,
        remainingTaskCount: classified.remainingTaskCount,
        hasActionableTask: Boolean(classified.nextActionableTask),
        reachedIterationCap: options.reachedIterationCap,
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
        createdAt: result.phaseTimestamps.persistedAt as string
      });
      result = remediationOutcome.result;
      const remediationArtifact = remediationOutcome.remediationArtifact;
      remediationOutcome.effectiveTaskFile;
      if (result.remediation) {
        const autoApplied = result.warnings.some((warning) => warning.includes(`Remediation auto-applied: ${result.remediation?.action}`));
        await this.appendRuntimeEvent(eventJournal, {
          type: 'remediation_applied',
          taskId: result.selectedTaskId,
          action: result.remediation.action,
          applied: autoApplied
        });
      }

      // Run onStop hook when the loop will not continue (adopted from Ruflo's hook system).
      if (result.stopReason) {
        const stopHookContext: HookRunContext = {
          agentId: prepared.config.agentId,
          taskId: result.selectedTaskId,
          outcome: result.completionClassification,
          stopReason: result.stopReason,
          cwd: prepared.rootPath
        };
        const stopHookResult = await runHook('onStop', prepared.config.hooks, stopHookContext);
        if (!stopHookResult.skipped && stopHookResult.exitCode !== 0) {
          this.logger.warn('onStop hook exited non-zero.', {
            command: stopHookResult.command,
            exitCode: stopHookResult.exitCode,
            stderr: stopHookResult.stderr.slice(0, 500)
          });
        }
      }

      try {
        await updateAgentIdentityRecord({
          rootPath: prepared.rootPath,
          agentId: prepared.config.agentId,
          startedAt,
          selectedTaskId: prepared.selectedTask?.id ?? null,
          selectedTaskCompleted: taskStateVerification.selectedTaskCompleted,
          diffSummary: preliminaryVerification.fileChangeVerification.diffSummary
        });
      } catch (error) {
        result.warnings.push(`Failed to update agent identity record for ${prepared.config.agentId}: ${toErrorMessage(error)}`);
      }

      // Run onTaskComplete hook when a task transitions to done (adopted from Ruflo's hook system).
      if (taskStateVerification.selectedTaskCompleted && prepared.selectedTask) {
        const taskCompleteHookContext: HookRunContext = {
          agentId: prepared.config.agentId,
          taskId: prepared.selectedTask.id,
          outcome: result.completionClassification,
          stopReason: result.stopReason ?? '',
          cwd: prepared.rootPath
        };
        const taskCompleteHookResult = await runHook('onTaskComplete', prepared.config.hooks, taskCompleteHookContext);
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
      if (prepared.config.scmStrategy === 'commit-on-done' && taskStateVerification.selectedTaskCompleted) {
        await this.appendRuntimeEvent(eventJournal, {
          type: 'scm_action',
          taskId: prepared.selectedTask?.id ?? null,
          action: 'commit-on-done',
          status: commitWarnings.length > 0 ? 'failed' : 'succeeded'
        });
      }

      if (selectedTaskReopened && prepared.selectedTask) {
        const refreshedTaskFile = parseTaskFile(await fs.readFile(prepared.paths.taskFilePath, 'utf8'));
        const refreshedSelectedTask = refreshedTaskFile.tasks.find((task) => task.id === prepared.selectedTask?.id) ?? null;
        if (refreshedSelectedTask?.status !== 'in_progress') {
          await fs.writeFile(
            prepared.paths.taskFilePath,
            stringifyTaskFile({
              ...refreshedTaskFile,
              tasks: refreshedTaskFile.tasks.map((task) => (
                task.id === prepared.selectedTask!.id
                  ? {
                    ...task,
                    status: 'in_progress',
                    blocker: branchPerTask.selectedTask?.blocker ?? task.blocker
                  }
                  : task
              )),
              mutationCount: (refreshedTaskFile.mutationCount ?? 0) + 1
            })
          );
        }
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
      await this.appendRuntimeEvent(eventJournal, {
        type: 'artifact_written',
        artifactType: 'iteration-result',
        relativePath: relativeArtifactPath(prepared.paths.artifactDir, artifactPaths.iterationResultPath),
        iteration: prepared.iteration
      });
      await this.appendRuntimeEvent(eventJournal, {
        type: 'artifact_written',
        artifactType: 'provenance-bundle',
        relativePath: relativeArtifactPath(prepared.paths.artifactDir, prepared.provenanceBundlePaths.bundlePath),
        iteration: prepared.iteration
      });
      if (remediationArtifact) {
        await this.appendRuntimeEvent(eventJournal, {
          type: 'artifact_written',
          artifactType: 'task-remediation',
          relativePath: relativeArtifactPath(prepared.paths.artifactDir, artifactPaths.remediationPath),
          iteration: prepared.iteration
        });
      }
      runtimeRunCompleted = await this.appendRuntimeEvent(eventJournal, {
        type: 'run_completed',
        stopReason: result.stopReason,
        iterations: prepared.iteration,
        backlogRemaining: result.backlog.remainingTaskCount ?? undefined
      });

      const runRecord = runRecordFromIteration(mode, prepared, startedAt, result);
      await this.stateManager.recordIteration(
        prepared.rootPath,
        prepared.paths,
        prepared.state,
        result,
        prepared.objectiveText,
        runRecord
      );
      await writeLoopTerminationHandoff({
        paths: prepared.paths,
        result,
        progressNote: completionReconciliation.artifact.report?.progressNote ?? null,
        pendingBlocker: classified.selectedTaskAfter?.blocker ?? completionReconciliation.artifact.report?.blocker ?? null
      });
      await cleanupGeneratedArtifactsHelper(prepared.paths, prepared.config.generatedArtifactRetentionCount, 'execution', this.logger);

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
    } finally {
      if (eventJournal && !runtimeRunCompleted) {
        await this.appendRuntimeEvent(eventJournal, {
          type: 'run_completed',
          stopReason: null,
          iterations: prepared.iteration
        });
      }
      if (prepared.selectedTask) {
        await releaseClaim(
          prepared.paths.claimFilePath,
          prepared.selectedTask.id,
          prepared.config.agentId
        ).catch((error: unknown) => {
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
