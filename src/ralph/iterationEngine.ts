import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { getCliCommandPath, getCliCommandPathForProvider } from '../config/providers';
import { CliProviderId } from '../config/types';
import { readConfig } from '../config/readConfig';
import { CodexStrategyRegistry } from '../codex/providerFactory';
import { createArtifactBaseName } from '../prompt/promptBuilder';
import { Logger } from '../services/logger';
import { toErrorMessage } from '../util/error';
import { RalphStateManager } from './stateManager';
import {
  prepareIterationContext,
  PreparedIterationContext,
  PreparedPrompt,
} from './iterationPreparation';
import {
  DEFAULT_RALPH_AGENT_ID,
  RalphIterationResult,
  RalphLoopDecision,
  RalphRunMode,
  RalphRunRecord,
} from './types';
import {
  parseTaskFile,
  releaseClaim,
  selectNextTaskForRole,
} from './taskFile';
import {
  parsePlanningResponse,
  readTaskPlan,
  shouldRunInlinePlanningPassForConfig,
  writeTaskPlan
} from './planningPass';
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

export class RalphIterationEngine {
  private readonly artifactPersistence: ArtifactPersistenceService;
  private readonly iterationExecutor: IterationExecutor;
  private readonly verificationRunner: VerificationRunner;
  private readonly outcomeClassifier: OutcomeClassifier;
  private readonly loopDecisionService: LoopDecisionService;
  private readonly remediationCoordinator: RemediationCoordinator;
  private readonly scmCoordinator: ScmCoordinator;

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
   * Checks whether the inline planning pass should run and, if so, delegates
   * to runInlinePlanningPass.  Best-effort: all failures are swallowed so the
   * main iteration always proceeds.
   */
  private async maybeRunInlinePlanningPass(
    workspaceFolder: vscode.WorkspaceFolder,
    configOverrides?: Partial<Pick<PreparedPrompt['config'], 'agentId' | 'agentRole'>>
  ): Promise<void> {
    try {
      const config = { ...readConfig(workspaceFolder), ...(configOverrides ?? {}) };
      if (!shouldRunInlinePlanningPassForConfig(config)) {
        return;
      }

      const rootPath = workspaceFolder.uri.fsPath;
      const paths = this.stateManager.resolvePaths(rootPath, config);

      let taskFileText: string;
      try {
        taskFileText = await fs.readFile(paths.taskFilePath, 'utf8');
      } catch {
        return; // No task file yet; let prepareIterationContext handle initialization
      }

      const taskFile = parseTaskFile(taskFileText);
      const selectedTask = await selectNextTaskForRole(taskFile, config.agentRole, paths.artifactDir);
      if (!selectedTask) {
        return;
      }

      const existingPlan = await readTaskPlan(paths.artifactDir, selectedTask.id);
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

      await this.runInlinePlanningPass(
        rootPath,
        paths.artifactDir,
        selectedTask.id,
        selectedTask.title,
        selectedTask.acceptance ?? [],
        execStrategy as { runExec: (req: import('../codex/types').CodexExecRequest) => Promise<import('../codex/types').CodexExecResult> },
        getCliCommandPath(config),
        config
      );
    } catch (err) {
      this.logger.warn('maybeRunInlinePlanningPass encountered an unexpected error; continuing.', {
        error: String(err)
      });
    }
  }

  /**
   * Runs a lightweight planning CLI turn for the given task and writes task-plan.json.
   * Failures are logged but do not abort the main iteration — the planning pass is best-effort.
   */
  private async runInlinePlanningPass(
    workspaceRoot: string,
    artifactsDir: string,
    taskId: string,
    taskTitle: string,
    taskAcceptance: string[],
    execStrategy: { runExec: (req: import('../codex/types').CodexExecRequest) => Promise<import('../codex/types').CodexExecResult> },
    commandPath: string,
    config: import('../config/types').RalphCodexConfig
  ): Promise<void> {
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
        promptHash: hashText(planningPrompt),
        promptByteLength: utf8ByteLength(planningPrompt),
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

      const plan = parsePlanningResponse(execResult.lastMessage);
      if (!plan) {
        this.logger.warn('Inline planning pass produced no parseable plan; skipping task-plan.json.', { taskId });
        return;
      }

      await writeTaskPlan(artifactsDir, taskId, plan);
      this.logger.info('Inline planning pass wrote task-plan.json.', { taskId });
    } catch (err) {
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

    // Inline planning pass: runs a quick planning CLI turn before the main
    // iteration so the implementer prompt can include task-plan.json context.
    // Only runs when planningPass.enabled=true, mode='inline', and the selected
    // task does not yet have a task-plan.json artifact.
    await this.maybeRunInlinePlanningPass(workspaceFolder, options.configOverrides);

    const prepared = await prepareIterationContext({
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
    try {
      const artifactPaths = this.artifactPersistence.resolvePaths(prepared.paths.artifactDir, prepared.iteration);
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

      broadcaster?.emitPhase(prepared.iteration, 'prompt', prepared.config.agentId);
      progress.report({
        message: `Executing Ralph iteration ${prepared.iteration}`
      });
      broadcaster?.emitPhase(prepared.iteration, 'execute', prepared.config.agentId);

      // Model tiering: select the appropriate model (and optional provider override)
      // based on task complexity. Adopted from Ruflo's smart task-routing pattern.
      const { model: selectedModel, provider: selectedProvider, score: complexityScore, tier: effectiveTier } = prepared.selectedTask
        ? selectModelForTask({
          task: prepared.selectedTask,
          taskFile: prepared.beforeCoreState.taskFile,
          iterationHistory: prepared.state.iterationHistory,
          tiering: prepared.config.modelTiering,
          fallbackModel: prepared.config.model
        })
        : { model: prepared.config.model, provider: undefined as CliProviderId | undefined, score: null, tier: 'default' as const };

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
      const effectiveProvider: CliProviderId = selectedProvider ?? prepared.config.cliProvider;
      const effectiveCommandPath = selectedProvider
        ? getCliCommandPathForProvider(selectedProvider, prepared.config)
        : getCliCommandPath(prepared.config);
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

      const afterCoreState = await captureCoreState(prepared.paths);
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
