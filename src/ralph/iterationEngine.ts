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
import { commitOnDone, listGitConflictPaths, reconcileBranchPerTaskScm, ScmConflictResolver } from './iterationScm';
import { RalphStateManager } from './stateManager';
import {
  prepareIterationContext,
  PreparedIterationContext,
  PreparedPrompt,
} from './iterationPreparation';
import {
  DEFAULT_RALPH_AGENT_ID,
  PromptCacheStats,
  RalphCliInvocation,
  RalphDiffSummary,
  RalphIterationResult,
  RalphLoopDecision,
  RalphRunMode,
  RalphRunRecord,
  RalphTaskRemediationArtifact,
  RalphTaskCounts,
} from './types';
import {
  countTaskStatuses,
  findTaskById,
  isDocumentationMode,
  parseTaskFile,
  releaseClaim,
  remainingSubtasks,
  selectNextTask,
  selectNextTaskForRole,
} from './taskFile';
import { parsePlanningResponse, readTaskPlan, writeTaskPlan } from './planningPass';
import {
  buildFailureDiagnosticPrompt,
  classifyTransientFailure,
  parseFailureDiagnosticResponse,
  writeFailureAnalysis
} from './failureDiagnostics';
import { hashText, utf8ByteLength } from './integrity';
import { buildTaskRemediation, classifyIterationOutcome, classifyVerificationStatus, decideLoopContinuation, shouldRunFailureDiagnostic } from './loopLogic';
import { selectModelForTask } from './complexityScorer';
import { runHook, HookRunContext } from './hookRunner';
import {
  captureCoreState,
  captureGitStatus,
  GitStatusSnapshot,
  runFileChangeVerifier,
  runTaskStateVerifier,
  runValidationCommandVerifier
} from './verifier';
import {
  resolveIterationArtifactPaths,
  writeCliInvocationArtifact,
  writeProvenanceBundle,
  writeIterationArtifacts,
} from './artifactStore';
import { reconcileCompletionReport } from './reconciliation';
import {
  autoApplyDecomposeTaskRemediation,
  autoApplyMarkBlockedRemediation,
  buildRemediationArtifact,
  normalizeRemediationForTask
} from './taskDecomposition';
import { formatClaudeStreamLine } from './cliOutputFormatter';
import { applyReviewAgentFileChangePolicy } from './reviewPolicy';
import {
  createProvenanceBundle,
  persistPreparedProvenanceBundle,
  persistBlockedPreflightBundle,
  persistIntegrityFailureBundle,
  cleanupGeneratedArtifactsHelper,
  writeLoopTerminationHandoff,
  updateAgentIdentityRecord
} from './provenancePersistence';
import {
  IntegrityFailureDetails,
  RalphIntegrityFailureError,
  StaleTaskContextError,
  readVerifiedExecutionPlanArtifact,
  readVerifiedPromptArtifact,
  toIntegrityFailureError
} from './executionIntegrity';
import type { IterationBroadcaster } from '../ui/iterationBroadcaster';

const EMPTY_GIT_STATUS: GitStatusSnapshot = {
  available: false,
  raw: '',
  entries: []
};

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

function summarizeLastMessage(lastMessage: string, exitCode: number | null): string {
  return lastMessage
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0)
    ?? (exitCode === null ? 'Execution skipped.' : `Exit code ${exitCode}`);
}

function controlPlaneRuntimeChanges(changedFiles: string[]): string[] {
  const matches = new Set<string>();

  for (const filePath of changedFiles) {
    const normalized = filePath.replace(/\\/g, '/');
    if (/^(?:.+\/)?package\.json$/.test(normalized)
      || /(?:^|\/)(?:src|out|prompt-templates)\//.test(normalized)) {
      matches.add(filePath);
    }
  }

  return Array.from(matches).sort();
}

function isBacklogExhausted(taskCounts: RalphTaskCounts): boolean {
  return taskCounts.todo === 0 && taskCounts.in_progress === 0 && taskCounts.blocked === 0;
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
  public constructor(
    private readonly stateManager: RalphStateManager,
    private readonly strategies: CodexStrategyRegistry,
    private readonly logger: Logger,
    private readonly hooks: RalphIterationEngineHooks = {}
  ) {}

  public async preparePrompt(
    workspaceFolder: vscode.WorkspaceFolder,
    progress: vscode.Progress<{ message?: string; increment?: number }>,
    options?: {
      configOverrides?: Partial<Pick<PreparedPrompt['config'], 'agentId' | 'agentRole'>>;
    }
  ): Promise<PreparedPrompt> {
    const prepared = await prepareIterationContext({
      workspaceFolder,
      progress,
      includeVerifierContext: false,
      configOverrides: options?.configOverrides,
      stateManager: this.stateManager,
      logger: this.logger,
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
      if (!config.planningPass.enabled || config.planningPass.mode !== 'inline') {
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
      focusTaskId: options.focusTaskId,
      stateManager: this.stateManager,
      logger: this.logger,
      persistBlockedPreflightBundle: (input) => persistBlockedPreflightBundle(input, this.logger),
      persistPreparedProvenanceBundle: (preparedContext) => persistPreparedProvenanceBundle(preparedContext, this.logger)
    });
    try {
    const artifactPaths = resolveIterationArtifactPaths(prepared.paths.artifactDir, prepared.iteration);
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

    this.strategies.configureCliProvider(prepared.config);

    let executionStatus: RalphIterationResult['executionStatus'] = 'skipped';
    let executionWarnings: string[] = [];
    let executionErrors: string[] = [];
    let execStdout = '';
    let execStderr = '';
    let execExitCode: number | null = null;
    let execStdinHash: string | null = null;
    let execPromptCacheStats: PromptCacheStats | null = null;
    let transcriptPath: string | undefined;
    let lastMessagePath: string | undefined;
    let lastMessage = '';
    let invocation: RalphCliInvocation | undefined;

    const shouldExecutePrompt = prepared.selectedTask !== null || prepared.promptKind === 'replenish-backlog';

    // Model tiering: select the appropriate model (and optional provider override)
    // based on task complexity.  Adopted from Ruflo's smart task-routing pattern.
    const { model: selectedModel, provider: selectedProvider, score: complexityScore } = prepared.selectedTask
      ? selectModelForTask({
          task: prepared.selectedTask,
          taskFile: prepared.beforeCoreState.taskFile,
          iterationHistory: prepared.state.iterationHistory,
          tiering: prepared.config.modelTiering,
          fallbackModel: prepared.config.model
        })
      : { model: prepared.config.model, provider: undefined as CliProviderId | undefined, score: null };

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
    const effectiveProvider: CliProviderId = selectedProvider ?? prepared.config.cliProvider;
    const effectiveCommandPath = selectedProvider
      ? getCliCommandPathForProvider(selectedProvider, prepared.config)
      : getCliCommandPath(prepared.config);

    const execStrategy = this.strategies.getCliExecStrategyForProvider(selectedProvider);
    if (!execStrategy.runExec) {
      throw new Error('The configured CLI strategy does not support exec.');
    }

    if (shouldExecutePrompt) {
      const artifactBaseName = createArtifactBaseName(prepared.promptKind, prepared.iteration);
      const runArtifacts = this.stateManager.runArtifactPaths(prepared.paths, artifactBaseName);

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
        const verifiedPlan = await readVerifiedExecutionPlanArtifact(
          prepared.executionPlanPath,
          prepared.executionPlanHash
        );
        const promptArtifactText = await readVerifiedPromptArtifact(verifiedPlan);

        // Gap 6: Re-read the selected task status immediately before shelling out.
        // Another agent may have completed this task in the window between
        // prepareIterationContext (where the prompt was built) and now.
        // Throw StaleTaskContextError so the catch block below can convert it into
        // a clean 'skipped' result instead of wasting CLI compute.
        if (prepared.selectedTask) {
          const freshTask = findTaskById(
            parseTaskFile(await fs.readFile(prepared.paths.taskFilePath, 'utf8')),
            prepared.selectedTask.id
          );
          if (freshTask?.status === 'done') {
            throw new StaleTaskContextError(prepared.selectedTask.id);
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
          onStderrChunk: (chunk: string) => this.logger.warn('codex stderr', { iteration: prepared.iteration, chunk })
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
            : (chunk: string) => this.logger.info('codex stdout', { iteration: prepared.iteration, chunk });

        let execResult;
        let usedCommandPath = effectiveCommandPath;
        let fallbackWarning: string | undefined;

        try {
          execResult = await execStrategy.runExec({
            ...baseExecRequest,
            commandPath: effectiveCommandPath,
            onStdoutChunk: makeStdoutChunk(effectiveProvider)
          });
        } catch (primaryError) {
          // Fallback chain: if a per-tier provider failed with ENOENT (binary not found)
          // and it differs from the workspace default, retry with the default provider.
          const isEnoent = (primaryError as { cause?: { code?: string } })?.cause?.code === 'ENOENT';
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
            usedCommandPath = getCliCommandPath(prepared.config);
            fallbackWarning = `Per-tier provider "${selectedProvider}" not found; fell back to workspace default "${prepared.config.cliProvider}".`;
            claudeLineBuffer = '';
            execResult = await fallbackStrategy.runExec({
              ...baseExecRequest,
              commandPath: usedCommandPath,
              onStdoutChunk: makeStdoutChunk(prepared.config.cliProvider)
            });
          } else {
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
        await writeCliInvocationArtifact({
          paths: artifactPaths,
          artifactRootDir: prepared.paths.artifactDir,
          invocation
        });
      } catch (error) {
        if (error instanceof StaleTaskContextError) {
          // Gap 6: selected task was completed by a concurrent agent between
          // prepare and execute.  Treat as a clean skip rather than a failure.
          executionStatus = 'skipped';
          executionWarnings.push(
            `Execution skipped: task ${error.taskId} was already completed by a concurrent agent between preparation and execution.`
          );
          phaseTimestamps.executionStartedAt = phaseTimestamps.executionStartedAt ?? new Date().toISOString();
          phaseTimestamps.executionFinishedAt = new Date().toISOString();
        } else {
          const integrityFailure = toIntegrityFailureError(error, prepared);
          if (integrityFailure) {
            phaseTimestamps.executionStartedAt = phaseTimestamps.executionStartedAt ?? new Date().toISOString();
            phaseTimestamps.executionFinishedAt = new Date().toISOString();
            await persistIntegrityFailureBundle(prepared, integrityFailure.details, this.logger);
          }
          throw error;
        }
      }
    } else {
      executionWarnings = ['No actionable Ralph task was selected; execution was skipped.'];
      phaseTimestamps.executionStartedAt = new Date().toISOString();
      phaseTimestamps.executionFinishedAt = phaseTimestamps.executionStartedAt;
    }

    // Run afterIteration / onFailure hooks (adopted from Ruflo's hook system).
    if (shouldExecutePrompt) {
      const postHookContext: HookRunContext = {
        agentId: prepared.config.agentId,
        taskId: prepared.selectedTask?.id ?? null,
        outcome: executionStatus,
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
      if (executionStatus === 'failed') {
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

    const afterCoreStateBeforeReconciliation = await captureCoreState(prepared.paths);
    const shouldCaptureGit = prepared.config.verifierModes.includes('gitDiff') || prepared.config.gitCheckpointMode !== 'off';
    const afterGit = shouldCaptureGit ? await captureGitStatus(prepared.rootPolicy.verificationRootPath) : EMPTY_GIT_STATUS;

    broadcaster?.emitPhase(prepared.iteration, 'verify', prepared.config.agentId);
    progress.report({ message: 'Running Ralph verifiers' });

    const skipValidationForDocMode = isDocumentationMode(prepared.selectedTask);
    const validationVerification = prepared.config.verifierModes.includes('validationCommand')
      && executionStatus === 'succeeded'
      && !skipValidationForDocMode
      ? await runValidationCommandVerifier({
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
          verifier: 'validationCommand' as const,
          status: 'skipped' as const,
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
      ? await runFileChangeVerifier({
        rootPath: prepared.rootPolicy.verificationRootPath,
        artifactDir: artifactPaths.directory,
        beforeGit: prepared.beforeGit,
        afterGit,
        before: prepared.beforeCoreState,
        after: afterCoreStateBeforeReconciliation
      })
      : {
        diffSummary: null as RalphDiffSummary | null,
        result: {
          verifier: 'gitDiff' as const,
          status: 'skipped' as const,
          summary: prepared.selectedTask
            ? 'Git-diff/file-change verifier disabled for this iteration.'
            : 'Git-diff/file-change verifier skipped because no Ralph task was selected.',
          warnings: [],
          errors: []
        }
      };
    const roleAdjustedFileChange = applyReviewAgentFileChangePolicy({
      agentRole: prepared.config.agentRole,
      fileChangeVerification
    });
    const effectiveFileChangeVerification = roleAdjustedFileChange.fileChangeVerification;
    const relevantFileChangesForOutcome = roleAdjustedFileChange.relevantFileChangesForOutcome;

    const preliminaryVerificationStatus = classifyVerificationStatus([
      validationVerification.result.status,
      effectiveFileChangeVerification.result.status
    ]);
    const preliminaryOutcome = classifyIterationOutcome({
      selectedTaskId: prepared.selectedTask?.id ?? null,
      selectedTaskCompleted: false,
      selectedTaskBlocked: false,
      humanReviewNeeded: false,
      remainingSubtaskCount: remainingSubtasks(afterCoreStateBeforeReconciliation.taskFile, prepared.selectedTask?.id ?? null).length,
      remainingTaskCount: countTaskStatuses(afterCoreStateBeforeReconciliation.taskFile).todo
        + countTaskStatuses(afterCoreStateBeforeReconciliation.taskFile).in_progress
        + countTaskStatuses(afterCoreStateBeforeReconciliation.taskFile).blocked,
      executionStatus,
      verificationStatus: preliminaryVerificationStatus,
      validationFailureSignature: validationVerification.result.failureSignature ?? null,
      relevantFileChanges: relevantFileChangesForOutcome,
      progressChanged: prepared.beforeCoreState.hashes.progress !== afterCoreStateBeforeReconciliation.hashes.progress,
      taskFileChanged: prepared.beforeCoreState.hashes.tasks !== afterCoreStateBeforeReconciliation.hashes.tasks,
      previousIterations: prepared.state.iterationHistory,
      taskMode: prepared.selectedTask?.mode
    });
    const completionReconciliation = await reconcileCompletionReport({
      prepared,
      selectedTask: prepared.selectedTask,
      verificationStatus: preliminaryVerificationStatus,
      validationCommandStatus: validationVerification.result.status,
      preliminaryClassification: preliminaryOutcome.classification,
      lastMessage,
      taskFilePath: prepared.paths.taskFilePath,
      logger: this.logger
    });
    const branchPerTaskWarnings: string[] = [];
    let autoReviewContext: RalphIterationRunSummary['autoReviewContext'];
    if (prepared.config.scmStrategy === 'branch-per-task'
      && completionReconciliation.selectedTask?.status === 'done'
      && prepared.selectedTask) {
      const taskFileAfterCompletion = parseTaskFile(await fs.readFile(prepared.paths.taskFilePath, 'utf8'));

      let conflictResolver: ScmConflictResolver | undefined;
      if (prepared.config.autoScmOnConflict) {
        const retryLimit = prepared.config.scmConflictRetryLimit;
        const capturedWorkspaceFolder = workspaceFolder;
        const capturedProgress = progress;
        conflictResolver = async (ctx) => {
          for (let attempt = 0; attempt < retryLimit; attempt++) {
            const scmRun = await this.runCliIteration(
              capturedWorkspaceFolder,
              'singleExec',
              capturedProgress,
              {
                reachedIterationCap: false,
                configOverrides: { agentRole: 'scm', agentId: `scm-conflict-${ctx.taskId}` }
              }
            );
            if (scmRun.result.executionStatus === 'failed') break;
            const remaining = await listGitConflictPaths(ctx.rootPath);
            if (remaining.length === 0) return { resolved: true };
          }
          return { resolved: false };
        };
      }

      const branchScm = await reconcileBranchPerTaskScm({
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
    const afterCoreState = await captureCoreState(prepared.paths);
    const taskStateVerification = prepared.config.verifierModes.includes('taskState')
      ? await runTaskStateVerifier({
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
          verifier: 'taskState' as const,
          status: 'skipped' as const,
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
    const verificationStatus = classifyVerificationStatus(verifierResults.map((item) => item.status));
    const selectedTaskAfter = taskStateVerification.selectedTaskAfter
      ?? completionReconciliation.selectedTask
      ?? prepared.selectedTask;
    const remainingSubtaskList = remainingSubtasks(afterCoreState.taskFile, prepared.selectedTask?.id ?? null);
    const afterTaskCounts = countTaskStatuses(afterCoreState.taskFile);
    const remainingTaskCount = afterTaskCounts.todo + afterTaskCounts.in_progress + afterTaskCounts.blocked;
    const nextActionableTask = selectNextTask(afterCoreState.taskFile);
    broadcaster?.emitPhase(prepared.iteration, 'classify', prepared.config.agentId);
    const outcome = classifyIterationOutcome({
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
      } else if (afterTaskCounts.todo === 0 && afterTaskCounts.in_progress === 0 && afterTaskCounts.blocked > 0) {
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

    let loopDecision = decideLoopContinuation({
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
    } else if (!loopDecision.shouldContinue) {
      result.stopReason = loopDecision.stopReason;
      result.followUpAction = 'stop';
      result.remediation = buildTaskRemediation({
        currentResult: result,
        stopReason: loopDecision.stopReason,
        previousIterations: prepared.state.iterationHistory
      });
      result.remediation = normalizeRemediationForTask(afterCoreState.taskFile, result);
    } else if (runtimeChanges.length > 0) {
      loopDecision = {
        shouldContinue: false,
        stopReason: 'control_plane_reload_required',
        message: 'Control-plane runtime files changed; rerun Ralph in a fresh process before continuing.'
      };
      result.stopReason = 'control_plane_reload_required';
      result.followUpAction = 'stop';
      result.remediation = null;
      result.warnings.push(
        `Control-plane runtime files changed during this iteration; rerun Ralph in a fresh process before continuing. (${runtimeChanges.join(', ')})`
      );
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
    const remediationArtifact = buildRemediationArtifact({
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
        _effectiveTaskFile = await autoApplyMarkBlockedRemediation({
          taskFilePath: prepared.paths.taskFilePath,
          taskId: result.selectedTaskId,
          blocker: result.remediation.summary
        });
        result.warnings.push(`Remediation auto-applied: mark_blocked on task ${result.selectedTaskId}`);
        this.logger.info('Auto-applied remediation: mark_blocked.', {
          taskId: result.selectedTaskId,
          blocker: result.remediation.summary
        });
      } catch (error) {
        result.warnings.push(
          `Failed to auto-apply remediation mark_blocked on task ${result.selectedTaskId}: ${toErrorMessage(error)}`
        );
        this.logger.warn('Failed to auto-apply remediation: mark_blocked.', {
          taskId: result.selectedTaskId,
          blocker: result.remediation.summary,
          error: toErrorMessage(error)
        });
      }
    }

    if (result.remediation?.action === 'decompose_task'
      && result.selectedTaskId
      && prepared.config.autoApplyRemediation.includes('decompose_task')) {
      const suggestedChildTasks = remediationArtifact?.suggestedChildTasks ?? [];
      if (suggestedChildTasks.length === 0) {
        result.warnings.push(
          `Skipped remediation auto-apply for decompose_task on task ${result.selectedTaskId}: no suggested child tasks were available.`
        );
      } else {
        try {
          _effectiveTaskFile = await autoApplyDecomposeTaskRemediation({
            taskFilePath: prepared.paths.taskFilePath,
            remediationArtifact: remediationArtifact as NonNullable<RalphTaskRemediationArtifact>
          });
          result.warnings.push(
            `Remediation auto-applied: decompose_task on task ${result.selectedTaskId}, added ${suggestedChildTasks.length} child tasks`
          );
          this.logger.info('Auto-applied remediation: decompose_task.', {
            taskId: result.selectedTaskId,
            childTaskIds: suggestedChildTasks.map((task) => task.id)
          });
        } catch (error) {
          result.warnings.push(
            `Failed to auto-apply remediation decompose_task on task ${result.selectedTaskId}: ${toErrorMessage(error)}`
          );
          this.logger.warn('Failed to auto-apply remediation: decompose_task.', {
            taskId: result.selectedTaskId,
            childTaskIds: suggestedChildTasks.map((task) => task.id),
            error: toErrorMessage(error)
          });
        }
      }
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
        diffSummary: fileChangeVerification.diffSummary
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

    if (prepared.config.scmStrategy === 'commit-on-done'
      && taskStateVerification.selectedTaskCompleted
      && prepared.selectedTask) {
      try {
        result.warnings.push(await commitOnDone({
          rootPath: prepared.rootPath,
          taskId: prepared.selectedTask.id,
          taskTitle: prepared.selectedTask.title,
          agentId: prepared.config.agentId,
          iteration: prepared.iteration,
          validationStatus: validationVerification.result.status
        }));
      } catch (error) {
        result.warnings.push(`SCM commit-on-done failed for ${prepared.selectedTask.id}: ${toErrorMessage(error)}`);
        this.logger.warn('SCM commit-on-done failed.', {
          taskId: prepared.selectedTask.id,
          iteration: prepared.iteration,
          error: toErrorMessage(error)
        });
      }
    }

    broadcaster?.emitPhase(prepared.iteration, 'persist', prepared.config.agentId);
    await writeIterationArtifacts({
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

    const writeResult = await writeProvenanceBundle({
      artifactRootDir: prepared.paths.artifactDir,
      paths: prepared.provenanceBundlePaths,
      bundle: createProvenanceBundle({
        prepared,
        status: 'executed',
        summary: result.summary,
        executionPayloadHash: execStdinHash,
        executionPayloadMatched: result.executionIntegrity?.executionPayloadMatched ?? null,
        mismatchReason: result.executionIntegrity?.mismatchReason ?? null,
        cliInvocationPath: invocation ? prepared.provenanceBundlePaths.cliInvocationPath : null,
        iterationResultPath: prepared.provenanceBundlePaths.iterationResultPath,
        promptCacheStats: execPromptCacheStats
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
      pendingBlocker: selectedTaskAfter?.blocker ?? completionReconciliation.artifact.report?.blocker ?? null
    });
    await cleanupGeneratedArtifactsHelper(prepared.paths, prepared.config.generatedArtifactRetentionCount, 'execution', this.logger);

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
