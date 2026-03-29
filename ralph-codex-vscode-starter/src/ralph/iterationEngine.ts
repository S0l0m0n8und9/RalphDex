import * as fs from 'fs/promises';
import * as vscode from 'vscode';
import { CodexStrategyRegistry } from '../codex/providerFactory';
import { createArtifactBaseName } from '../prompt/promptBuilder';
import { Logger } from '../services/logger';
import { toErrorMessage } from '../util/error';
import { commitOnDone, reconcileBranchPerTaskScm } from './iterationScm';
import { RalphStateManager } from './stateManager';
import {
  prepareIterationContext,
  PreparedIterationContext,
  PreparedPrompt,
} from './iterationPreparation';
import {
  DEFAULT_RALPH_AGENT_ID,
  RalphCliInvocation,
  RalphDiffSummary,
  RalphIterationResult,
  RalphLoopDecision,
  RalphRunMode,
  RalphRunRecord,
  RalphTaskRemediationArtifact,
  RalphTaskFile,
  RalphTaskCounts,
} from './types';
import {
  countTaskStatuses,
  findTaskById,
  parseTaskFile,
  releaseClaim,
  remainingSubtasks,
  selectNextTask,
  stringifyTaskFile,
  withTaskFileLock
} from './taskFile';
import { buildTaskRemediation, classifyIterationOutcome, classifyVerificationStatus, decideLoopContinuation } from './loopLogic';
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
  applyTaskDecompositionProposalArtifact,
  buildRemediationArtifact,
  normalizeRemediationForTask
} from './taskDecomposition';
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

// ---------------------------------------------------------------------------
// Claude stream-json output formatter
// ---------------------------------------------------------------------------

interface ClaudeStreamEvent {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  result?: string;
  cost_usd?: number;
  num_turns?: number;
  message?: {
    content?: Array<{ type: string; text?: string; name?: string }>;
  };
}

function formatClaudeStreamLine(line: string): string | null {
  if (!line) {
    return null;
  }
  try {
    const event = JSON.parse(line) as ClaudeStreamEvent;
    switch (event.type) {
      case 'assistant': {
        const content = event.message?.content ?? [];
        const toolUses = content.filter((c) => c.type === 'tool_use').map((c) => c.name ?? 'tool');
        if (toolUses.length > 0) {
          return `claude [tool_use]: ${toolUses.join(', ')}`;
        }
        const textItem = content.find((c) => c.type === 'text');
        if (textItem?.text) {
          const firstLine = textItem.text.trim().split('\n')[0].slice(0, 120);
          return firstLine ? `claude: ${firstLine}` : null;
        }
        return null;
      }
      case 'result': {
        const status = event.is_error ? 'error' : (event.subtype ?? 'done');
        const turns = event.num_turns != null ? ` (${event.num_turns} turns)` : '';
        const cost = event.cost_usd != null ? ` $${event.cost_usd.toFixed(4)}` : '';
        return `claude [result]: ${status}${turns}${cost}`;
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export interface RalphIterationEngineHooks {
  beforeCliExecutionIntegrityCheck?: (prepared: PreparedIterationContext) => Promise<void>;
}

export interface RalphIterationRunSummary {
  prepared: PreparedPrompt;
  result: RalphIterationResult;
  loopDecision: RalphLoopDecision;
  createdPaths: string[];
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

async function autoApplyMarkBlockedRemediation(input: {
  taskFilePath: string;
  taskId: string;
  blocker: string;
}): Promise<RalphTaskFile> {
  const locked = await withTaskFileLock(input.taskFilePath, undefined, async () => {
    const taskFile = parseTaskFile(await fs.readFile(input.taskFilePath, 'utf8'));
    const nextTaskFile: RalphTaskFile = {
      ...taskFile,
      tasks: taskFile.tasks.map((task) => (
        task.id === input.taskId
          ? {
            ...task,
            status: 'blocked',
            blocker: input.blocker
          }
          : task
      ))
    };

    await fs.writeFile(input.taskFilePath, stringifyTaskFile(nextTaskFile), 'utf8');
    return nextTaskFile;
  });

  if (locked.outcome === 'lock_timeout') {
    throw new Error(
      `Timed out acquiring tasks.json lock at ${locked.lockPath} after ${locked.attempts} attempt(s).`
    );
  }

  const updatedTask = locked.value.tasks.find((task) => task.id === input.taskId);
  if (!updatedTask) {
    throw new Error(`Task ${input.taskId} was not found in tasks.json while auto-applying mark_blocked remediation.`);
  }

  return locked.value;
}

async function autoApplyDecomposeTaskRemediation(input: {
  taskFilePath: string;
  remediationArtifact: NonNullable<RalphTaskRemediationArtifact>;
}): Promise<RalphTaskFile> {
  const applied = await applyTaskDecompositionProposalArtifact(input.taskFilePath, input.remediationArtifact);
  return applied.taskFile;
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

function uniqueSorted(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0))).sort((left, right) => left.localeCompare(right));
}

function applyReviewAgentFileChangePolicy(input: {
  agentRole: PreparedIterationContext['config']['agentRole'];
  fileChangeVerification: {
    diffSummary: RalphDiffSummary | null;
    result: RalphIterationResult['verification']['verifiers'][number];
  };
}): {
  fileChangeVerification: {
    diffSummary: RalphDiffSummary | null;
    result: RalphIterationResult['verification']['verifiers'][number];
  };
  relevantFileChangesForOutcome: string[];
} {
  const relevantChangedFiles = input.fileChangeVerification.diffSummary?.relevantChangedFiles ?? [];
  if (input.agentRole !== 'review' || relevantChangedFiles.length === 0) {
    return {
      fileChangeVerification: input.fileChangeVerification,
      relevantFileChangesForOutcome: relevantChangedFiles
    };
  }

  const anomaly = `Review-agent anomaly: detected source-file modifications during a review-only pass (${relevantChangedFiles.join(', ')}).`;
  return {
    fileChangeVerification: {
      ...input.fileChangeVerification,
      result: {
        ...input.fileChangeVerification.result,
        status: 'failed',
        summary: `Review-agent anomaly: detected ${relevantChangedFiles.length} relevant workspace change(s) during a review-only pass.`,
        warnings: uniqueSorted([
          ...input.fileChangeVerification.result.warnings,
          anomaly
        ]),
        errors: uniqueSorted([
          ...input.fileChangeVerification.result.errors,
          'Review agents must not modify source files during review-only execution.'
        ])
      }
    },
    relevantFileChangesForOutcome: []
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

  public async runCliIteration(
    workspaceFolder: vscode.WorkspaceFolder,
    mode: RalphRunMode,
    progress: vscode.Progress<{ message?: string; increment?: number }>,
    options: {
      reachedIterationCap: boolean;
      configOverrides?: Partial<Pick<PreparedPrompt['config'], 'agentId' | 'agentRole'>>;
      broadcaster?: IterationBroadcaster;
    }
  ): Promise<RalphIterationRunSummary> {
    const broadcaster = options.broadcaster;
    broadcaster?.emitPhase(0, 'inspect');
    const prepared = await prepareIterationContext({
      workspaceFolder,
      progress,
      includeVerifierContext: true,
      configOverrides: options.configOverrides,
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

    broadcaster?.emitPhase(prepared.iteration, 'prompt');
    progress.report({
      message: `Executing Ralph iteration ${prepared.iteration}`
    });
    broadcaster?.emitPhase(prepared.iteration, 'execute');

    this.strategies.configureCliProvider(prepared.config);
    const execStrategy = this.strategies.getCliExecStrategy();
    if (!execStrategy.runExec) {
      throw new Error('The configured CLI strategy does not support exec.');
    }

    let executionStatus: RalphIterationResult['executionStatus'] = 'skipped';
    let executionWarnings: string[] = [];
    let executionErrors: string[] = [];
    let execStdout = '';
    let execStderr = '';
    let execExitCode: number | null = null;
    let execStdinHash: string | null = null;
    let transcriptPath: string | undefined;
    let lastMessagePath: string | undefined;
    let lastMessage = '';
    let invocation: RalphCliInvocation | undefined;

    const shouldExecutePrompt = prepared.selectedTask !== null || prepared.promptKind === 'replenish-backlog';

    // Model tiering: select the appropriate Claude model based on task complexity.
    // Adopted from Ruflo's smart task-routing pattern.
    const { model: selectedModel, score: complexityScore } = prepared.selectedTask
      ? selectModelForTask({
          task: prepared.selectedTask,
          taskFile: prepared.beforeCoreState.taskFile,
          iterationHistory: prepared.state.iterationHistory,
          tiering: prepared.config.modelTiering,
          fallbackModel: prepared.config.model
        })
      : { model: prepared.config.model, score: null };

    if (complexityScore !== null) {
      this.logger.info('Model tiering selected model for task.', {
        taskId: prepared.selectedTask?.id ?? null,
        model: selectedModel,
        complexityScore: complexityScore.score,
        signals: complexityScore.signals
      });
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
          model: selectedModel,
          reasoningEffort: prepared.config.reasoningEffort,
          sandboxMode: prepared.config.sandboxMode,
          approvalMode: prepared.config.approvalMode,
          onStdoutChunk: prepared.config.cliProvider === 'claude'
            ? (chunk) => {
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
            : (chunk) => this.logger.info('codex stdout', { iteration: prepared.iteration, chunk }),
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
          agentId: prepared.config.agentId,
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

    broadcaster?.emitPhase(prepared.iteration, 'verify');
    progress.report({ message: 'Running Ralph verifiers' });

    const validationVerification = prepared.config.verifierModes.includes('validationCommand') && executionStatus === 'succeeded'
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
      previousIterations: prepared.state.iterationHistory
    });
    const completionReconciliation = await reconcileCompletionReport({
      prepared,
      selectedTask: prepared.selectedTask,
      verificationStatus: preliminaryVerificationStatus,
      preliminaryClassification: preliminaryOutcome.classification,
      lastMessage,
      taskFilePath: prepared.paths.taskFilePath,
      logger: this.logger
    });
    const branchPerTaskWarnings: string[] = [];
    if (prepared.config.scmStrategy === 'branch-per-task'
      && completionReconciliation.selectedTask?.status === 'done'
      && prepared.selectedTask) {
      const taskFileAfterCompletion = parseTaskFile(await fs.readFile(prepared.paths.taskFilePath, 'utf8'));
      const branchScm = await reconcileBranchPerTaskScm({
        prepared,
        validationStatus: validationVerification.result.status,
        taskFileAfter: taskFileAfterCompletion
      });
      branchPerTaskWarnings.push(...branchScm.warnings);
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
    broadcaster?.emitPhase(prepared.iteration, 'classify');
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
      previousIterations: prepared.state.iterationHistory
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

    broadcaster?.emitPhase(prepared.iteration, 'persist');
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
      createdPaths: prepared.createdPaths
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
