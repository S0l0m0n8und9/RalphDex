import * as fs from 'fs/promises';
import * as vscode from 'vscode';
import { readConfig } from '../config/readConfig';
import { RalphCodexConfig } from '../config/types';
import { CodexStrategyRegistry } from '../codex/providerFactory';
import { buildPrompt, createArtifactBaseName, createPromptFileName, decidePromptKind } from '../prompt/promptBuilder';
import { Logger } from '../services/logger';
import { scanWorkspace } from '../services/workspaceScanner';
import { inspectCodexCliSupport, inspectIdeCommandSupport } from '../services/codexCliSupport';
import { RalphStateManager } from './stateManager';
import { createProvenanceId, hashJson, hashText, utf8ByteLength } from './integrity';
import {
  RalphCliInvocation,
  RalphDiffSummary,
  RalphExecutionPlan,
  RalphIntegrityFailure,
  RalphIterationResult,
  RalphLoopDecision,
  RalphPersistedPreflightReport,
  RalphPreflightReport,
  RalphPromptEvidence,
  RalphPromptKind,
  RalphPromptTarget,
  RalphProvenanceBundle,
  RalphProvenanceTrustLevel,
  RalphRunMode,
  RalphRunRecord,
  RalphTask,
  RalphTaskCounts,
  RalphTaskFile,
  RalphWorkspaceState
} from './types';
import { countTaskStatuses, remainingSubtasks, selectNextTask } from './taskFile';
import { classifyIterationOutcome, classifyVerificationStatus, decideLoopContinuation } from './loopLogic';
import { buildBlockingPreflightMessage, buildPreflightReport, renderPreflightReport } from './preflight';
import {
  captureCoreState,
  captureGitStatus,
  chooseValidationCommand,
  GitStatusSnapshot,
  inspectValidationCommandReadiness,
  RalphCoreStateSnapshot,
  runFileChangeVerifier,
  runTaskStateVerifier,
  runValidationCommandVerifier
} from './verifier';
import {
  resolveIterationArtifactPaths,
  resolveProvenanceBundlePaths,
  resolvePreflightArtifactPaths,
  writeCliInvocationArtifact,
  writeExecutionPlanArtifact,
  writeProvenanceBundle,
  writePromptArtifacts,
  writeIterationArtifacts,
  writePreflightArtifacts
} from './artifactStore';

const EMPTY_GIT_STATUS: GitStatusSnapshot = {
  available: false,
  raw: '',
  entries: []
};

interface PreparedPromptContext {
  config: RalphCodexConfig;
  rootPath: string;
  state: RalphWorkspaceState;
  paths: ReturnType<RalphStateManager['resolvePaths']>;
  provenanceId: string;
  trustLevel: RalphProvenanceTrustLevel;
  promptKind: RalphPromptKind;
  promptTarget: RalphPromptTarget;
  promptSelectionReason: string;
  promptPath: string;
  promptTemplatePath: string;
  promptEvidence: RalphPromptEvidence;
  executionPlan: RalphExecutionPlan;
  executionPlanHash: string;
  executionPlanPath: string;
  prompt: string;
  iteration: number;
  objectiveText: string;
  progressText: string;
  tasksText: string;
  taskFile: RalphTaskFile;
  taskCounts: RalphTaskCounts;
  summary: Awaited<ReturnType<typeof scanWorkspace>>;
  selectedTask: RalphTask | null;
  validationCommand: string | null;
  preflightReport: RalphPreflightReport;
  persistedPreflightReport: RalphPersistedPreflightReport;
  preflightSummaryText: string;
  provenanceBundlePaths: ReturnType<typeof resolveProvenanceBundlePaths>;
  createdPaths: string[];
}

export interface PreparedIterationContext extends PreparedPromptContext {
  beforeCoreState: RalphCoreStateSnapshot;
  beforeGit: GitStatusSnapshot;
  phaseSeed: Pick<RalphIterationResult['phaseTimestamps'], 'inspectStartedAt' | 'inspectFinishedAt' | 'taskSelectedAt' | 'promptGeneratedAt'>;
}

export interface RalphIterationEngineHooks {
  beforeCliExecutionIntegrityCheck?: (prepared: PreparedIterationContext) => Promise<void>;
}

export interface PreparedPrompt extends PreparedPromptContext {}

export interface RalphIterationRunSummary {
  prepared: PreparedPrompt;
  result: RalphIterationResult;
  loopDecision: RalphLoopDecision;
  createdPaths: string[];
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function summarizeLastMessage(lastMessage: string, exitCode: number | null): string {
  return lastMessage
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0)
    ?? (exitCode === null ? 'Execution skipped.' : `Exit code ${exitCode}`);
}

function trustLevelForTarget(promptTarget: RalphPromptTarget): RalphProvenanceTrustLevel {
  return promptTarget === 'cliExec' ? 'verifiedCliExecution' : 'preparedPromptOnly';
}

interface IntegrityFailureDetails {
  stage: RalphIntegrityFailure['stage'];
  message: string;
  expectedExecutionPlanHash: string | null;
  actualExecutionPlanHash: string | null;
  expectedPromptHash: string | null;
  actualPromptHash: string | null;
  expectedPayloadHash: string | null;
  actualPayloadHash: string | null;
}

class RalphIntegrityFailureError extends Error {
  public constructor(public readonly details: IntegrityFailureDetails) {
    super(details.message);
    this.name = 'RalphIntegrityFailureError';
  }
}

async function readVerifiedExecutionPlanArtifact(
  executionPlanPath: string,
  expectedExecutionPlanHash: string
): Promise<RalphExecutionPlan> {
  const planText = await fs.readFile(executionPlanPath, 'utf8').catch((error: unknown) => {
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

  const actualExecutionPlanHash = hashText(planText);
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
    return JSON.parse(planText) as RalphExecutionPlan;
  } catch (error) {
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

async function readVerifiedPromptArtifact(plan: RalphExecutionPlan): Promise<string> {
  const promptArtifactText = await fs.readFile(plan.promptArtifactPath, 'utf8').catch((error: unknown) => {
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

  const artifactHash = hashText(promptArtifactText);
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

function toIntegrityFailureError(error: unknown, prepared: PreparedIterationContext): RalphIntegrityFailureError | null {
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

  private createProvenanceBundle(input: {
    prepared: PreparedPromptContext;
    status: RalphProvenanceBundle['status'];
    summary: string;
    executionPayloadHash?: string | null;
    executionPayloadMatched?: boolean | null;
    mismatchReason?: string | null;
    cliInvocationPath?: string | null;
    iterationResultPath?: string | null;
    provenanceFailurePath?: string | null;
    provenanceFailureSummaryPath?: string | null;
  }): RalphProvenanceBundle {
    const {
      prepared,
      status,
      summary,
      executionPayloadHash = null,
      executionPayloadMatched = null,
      mismatchReason = null,
      cliInvocationPath = null,
      iterationResultPath = null,
      provenanceFailurePath = null,
      provenanceFailureSummaryPath = null
    } = input;

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
      selectedTaskId: prepared.selectedTask?.id ?? null,
      selectedTaskTitle: prepared.selectedTask?.title ?? null,
      artifactDir: resolveIterationArtifactPaths(prepared.paths.artifactDir, prepared.iteration).directory,
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

  private async persistPreparedProvenanceBundle(prepared: PreparedPromptContext): Promise<void> {
    const bundle = this.createProvenanceBundle({
      prepared,
      status: prepared.promptTarget === 'cliExec' ? 'prepared' : 'prepared',
      summary: prepared.promptTarget === 'cliExec'
        ? 'Prepared CLI execution provenance bundle.'
        : 'Prepared prompt provenance bundle for IDE handoff.'
    });

    const writeResult = await writeProvenanceBundle({
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
  }

  private async persistBlockedPreflightBundle(input: {
    paths: ReturnType<RalphStateManager['resolvePaths']>;
    provenanceId: string;
    iteration: number;
    promptKind: RalphPromptKind;
    promptTarget: RalphPromptTarget;
    trustLevel: RalphProvenanceTrustLevel;
    retentionCount: number;
    selectedTask: RalphTask | null;
    persistedPreflightReport: RalphPersistedPreflightReport;
    preflightSummaryText: string;
  }): Promise<void> {
    const provenanceBundlePaths = resolveProvenanceBundlePaths(input.paths.artifactDir, input.provenanceId);
    const bundle: RalphProvenanceBundle = {
      schemaVersion: 1,
      kind: 'provenanceBundle',
      provenanceId: input.provenanceId,
      iteration: input.iteration,
      promptKind: input.promptKind,
      promptTarget: input.promptTarget,
      trustLevel: input.trustLevel,
      status: 'blocked',
      summary: input.persistedPreflightReport.summary,
      selectedTaskId: input.selectedTask?.id ?? null,
      selectedTaskTitle: input.selectedTask?.title ?? null,
      artifactDir: resolveIterationArtifactPaths(input.paths.artifactDir, input.iteration).directory,
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

    const writeResult = await writeProvenanceBundle({
      artifactRootDir: input.paths.artifactDir,
      paths: provenanceBundlePaths,
      bundle,
      preflightReport: input.persistedPreflightReport,
      preflightSummary: input.preflightSummaryText,
      retentionCount: input.retentionCount
    });

    if (writeResult.retention.deletedBundleIds.length > 0) {
      this.logger.info('Cleaned up old Ralph provenance bundles after blocked preflight.', {
        deletedBundleIds: writeResult.retention.deletedBundleIds
      });
    }
  }

  private async persistIntegrityFailureBundle(
    prepared: PreparedIterationContext,
    failureError: RalphIntegrityFailureError
  ): Promise<void> {
    const failure: RalphIntegrityFailure = {
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
      artifactDir: resolveIterationArtifactPaths(prepared.paths.artifactDir, prepared.iteration).directory,
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

    const writeResult = await writeProvenanceBundle({
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
  }

  public async preparePrompt(
    workspaceFolder: vscode.WorkspaceFolder,
    progress: vscode.Progress<{ message?: string; increment?: number }>
  ): Promise<PreparedPrompt> {
    const prepared = await this.prepareIterationContext(workspaceFolder, progress, false);

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
    }
  ): Promise<RalphIterationRunSummary> {
    const prepared = await this.prepareIterationContext(workspaceFolder, progress, true);
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

    progress.report({
      message: `Executing Ralph iteration ${prepared.iteration}`
    });

    const execStrategy = this.strategies.getCliExecStrategy();
    if (!execStrategy.runExec) {
      throw new Error('The configured Codex CLI strategy does not support codex exec.');
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

    if (prepared.selectedTask) {
      const artifactBaseName = createArtifactBaseName(prepared.promptKind, prepared.iteration);
      const runArtifacts = this.stateManager.runArtifactPaths(prepared.paths, artifactBaseName);

      this.logger.info('Running Ralph iteration.', {
        iteration: prepared.iteration,
        mode,
        promptPath: prepared.promptPath,
        promptArtifactPath: prepared.executionPlan.promptArtifactPath,
        promptHash: prepared.executionPlan.promptHash,
        selectedTaskId: prepared.selectedTask.id,
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
        phaseTimestamps.executionStartedAt = new Date().toISOString();
        const execResult = await execStrategy.runExec({
          commandPath: prepared.config.codexCommandPath,
          workspaceRoot: prepared.rootPath,
          prompt: promptArtifactText,
          promptPath: verifiedPlan.promptArtifactPath,
          promptHash: verifiedPlan.promptHash,
          promptByteLength: verifiedPlan.promptByteLength,
          transcriptPath: runArtifacts.transcriptPath,
          lastMessagePath: runArtifacts.lastMessagePath,
          model: prepared.config.model,
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
          commandPath: prepared.config.codexCommandPath,
          args: execResult.args,
          workspaceRoot: prepared.rootPath,
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
        const integrityFailure = toIntegrityFailureError(error, prepared);
        if (integrityFailure) {
          phaseTimestamps.executionStartedAt = phaseTimestamps.executionStartedAt ?? new Date().toISOString();
          phaseTimestamps.executionFinishedAt = new Date().toISOString();
          await this.persistIntegrityFailureBundle(prepared, integrityFailure);
        }
        throw error;
      }
    } else {
      executionWarnings = ['No actionable Ralph task was selected; execution was skipped.'];
      phaseTimestamps.executionStartedAt = new Date().toISOString();
      phaseTimestamps.executionFinishedAt = phaseTimestamps.executionStartedAt;
    }

    phaseTimestamps.resultCollectedAt = new Date().toISOString();

    const afterCoreState = await captureCoreState(prepared.paths);
    const shouldCaptureGit = prepared.config.verifierModes.includes('gitDiff') || prepared.config.gitCheckpointMode !== 'off';
    const afterGit = shouldCaptureGit ? await captureGitStatus(prepared.rootPath) : EMPTY_GIT_STATUS;

    progress.report({ message: 'Running Ralph verifiers' });

    const validationVerification = prepared.config.verifierModes.includes('validationCommand') && executionStatus === 'succeeded'
      ? await runValidationCommandVerifier({
        command: prepared.validationCommand,
        rootPath: prepared.rootPath,
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

    const taskStateVerification = prepared.config.verifierModes.includes('taskState')
      ? await runTaskStateVerifier({
        selectedTaskId: prepared.selectedTask?.id ?? null,
        before: prepared.beforeCoreState,
        after: afterCoreState,
        artifactDir: artifactPaths.directory
      })
      : {
        selectedTaskAfter: prepared.selectedTask,
        selectedTaskCompleted: false,
        selectedTaskBlocked: false,
        humanReviewNeeded: false,
        progressChanged: false,
        taskFileChanged: false,
        result: {
          verifier: 'taskState' as const,
          status: 'skipped' as const,
          summary: 'Task-state verifier disabled for this iteration.',
          warnings: [],
          errors: []
        }
      };

    const shouldRunFileChangeVerifier = prepared.config.verifierModes.includes('gitDiff')
      || prepared.config.gitCheckpointMode === 'snapshotAndDiff';
    const fileChangeVerification = shouldRunFileChangeVerifier
      ? await runFileChangeVerifier({
        rootPath: prepared.rootPath,
        artifactDir: artifactPaths.directory,
        beforeGit: prepared.beforeGit,
        afterGit,
        before: prepared.beforeCoreState,
        after: afterCoreState
      })
      : {
        diffSummary: null as RalphDiffSummary | null,
        result: {
          verifier: 'gitDiff' as const,
          status: 'skipped' as const,
          summary: 'Git-diff/file-change verifier disabled for this iteration.',
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
    const verificationStatus = classifyVerificationStatus(verifierResults.map((item) => item.status));
    const selectedTaskAfter = taskStateVerification.selectedTaskAfter ?? prepared.selectedTask;
    const remainingSubtaskList = remainingSubtasks(afterCoreState.taskFile, prepared.selectedTask?.id ?? null);
    const afterTaskCounts = countTaskStatuses(afterCoreState.taskFile);
    const remainingTaskCount = afterTaskCounts.todo + afterTaskCounts.in_progress + afterTaskCounts.blocked;
    const nextActionableTask = selectNextTask(afterCoreState.taskFile);
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
      relevantFileChanges: fileChangeVerification.diffSummary?.relevantChangedFiles ?? [],
      progressChanged: taskStateVerification.progressChanged,
      taskFileChanged: taskStateVerification.taskFileChanged,
      previousIterations: prepared.state.iterationHistory
    });

    let completionClassification = outcome.classification;
    let followUpAction = outcome.followUpAction;
    if (!prepared.selectedTask) {
      if (prepared.taskCounts.todo === 0 && prepared.taskCounts.in_progress === 0 && prepared.taskCounts.blocked === 0) {
        completionClassification = 'complete';
        followUpAction = 'stop';
      } else if (prepared.taskCounts.todo === 0 && prepared.taskCounts.in_progress === 0 && prepared.taskCounts.blocked > 0) {
        completionClassification = 'blocked';
        followUpAction = 'request_human_review';
      }
    }

    phaseTimestamps.classifiedAt = new Date().toISOString();

    const summary = [
      prepared.selectedTask
        ? `Selected ${prepared.selectedTask.id}: ${prepared.selectedTask.title}`
        : 'No actionable Ralph task selected.',
      `Execution: ${executionStatus}`,
      `Verification: ${verificationStatus}`,
      `Outcome: ${completionClassification}`,
      `Backlog remaining: ${remainingTaskCount}`
    ].join(' | ');
    const warnings = [
      ...executionWarnings,
      ...verifierResults.flatMap((item) => item.warnings)
    ];
    const errors = [
      ...executionErrors,
      ...verifierResults.flatMap((item) => item.errors)
    ];

    const result: RalphIterationResult = {
      schemaVersion: 1,
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
        templatePath: prepared.executionPlan.templatePath,
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
      stopReason: null
    };

    const loopDecision = decideLoopContinuation({
      currentResult: result,
      selectedTaskCompleted: taskStateVerification.selectedTaskCompleted,
      remainingSubtaskCount: remainingSubtaskList.length,
      remainingTaskCount,
      hasActionableTask: Boolean(nextActionableTask),
      noProgressThreshold: prepared.config.noProgressThreshold,
      repeatedFailureThreshold: prepared.config.repeatedFailureThreshold,
      stopOnHumanReviewNeeded: prepared.config.stopOnHumanReviewNeeded,
      reachedIterationCap: options.reachedIterationCap,
      previousIterations: prepared.state.iterationHistory
    });

    if (!loopDecision.shouldContinue) {
      result.stopReason = loopDecision.stopReason;
      result.followUpAction = 'stop';
    }

    phaseTimestamps.persistedAt = new Date().toISOString();

    await writeIterationArtifacts({
      paths: artifactPaths,
      artifactRootDir: prepared.paths.artifactDir,
      prompt: prepared.prompt,
      promptEvidence: prepared.promptEvidence,
      stdout: execStdout,
      stderr: execStderr,
      executionSummary: {
        iteration: prepared.iteration,
        selectedTaskId: prepared.selectedTask?.id ?? null,
        promptKind: prepared.promptKind,
        promptTarget: prepared.executionPlan.promptTarget,
        templatePath: prepared.executionPlan.templatePath,
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
        lastMessage: summarizeLastMessage(lastMessage, execExitCode)
      },
      verifierSummary: verifierResults,
      diffSummary: fileChangeVerification.diffSummary,
      result,
      gitStatusBefore: prepared.beforeGit.available ? prepared.beforeGit.raw : undefined,
      gitStatusAfter: afterGit.available ? afterGit.raw : undefined
    });

    const writeResult = await writeProvenanceBundle({
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
    await this.stateManager.recordIteration(
      prepared.rootPath,
      prepared.paths,
      prepared.state,
      result,
      prepared.objectiveText,
      runRecord
    );

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

  private async maybeSeedObjective(paths: PreparedPromptContext['paths']): Promise<string> {
    const objectiveText = await this.stateManager.readObjectiveText(paths);
    if (!this.stateManager.isDefaultObjective(objectiveText)) {
      return objectiveText;
    }

    const seededObjective = await vscode.window.showInputBox({
      prompt: 'Seed the PRD with a short objective for this workspace',
      placeHolder: 'Example: Harden the VS Code extension starter into a reliable v2 iteration engine'
    });

    if (!seededObjective?.trim()) {
      return objectiveText;
    }

    const nextText = [
      '# Product / project brief',
      '',
      seededObjective.trim()
    ].join('\n');

    await this.stateManager.writeObjectiveText(paths, nextText);
    return `${nextText}\n`;
  }

  private async prepareIterationContext(
    workspaceFolder: vscode.WorkspaceFolder,
    progress: vscode.Progress<{ message?: string; increment?: number }>,
    includeVerifierContext: boolean
  ): Promise<PreparedIterationContext> {
    const inspectStartedAt = new Date().toISOString();
    progress.report({ message: 'Inspecting Ralph workspace' });
    const config = readConfig(workspaceFolder);
    const rootPath = workspaceFolder.uri.fsPath;
    const snapshot = await this.stateManager.ensureWorkspace(rootPath, config);
    await this.logger.setWorkspaceLogFile(snapshot.paths.logFilePath);

    if (snapshot.createdPaths.length > 0) {
      this.logger.warn('Initialized or repaired Ralph workspace paths.', {
        rootPath,
        createdPaths: snapshot.createdPaths
      });
    }

    const objectiveText = await this.maybeSeedObjective(snapshot.paths);
    const focusPath = vscode.window.activeTextEditor?.document.uri.scheme === 'file'
      ? vscode.window.activeTextEditor.document.uri.fsPath
      : null;
    const [progressText, taskInspection, taskCounts, summary, beforeCoreState] = await Promise.all([
      this.stateManager.readProgressText(snapshot.paths),
      this.stateManager.inspectTaskFile(snapshot.paths),
      this.stateManager.taskCounts(snapshot.paths).catch(() => null),
      scanWorkspace(rootPath, workspaceFolder.name, { focusPath }),
      captureCoreState(snapshot.paths)
    ]);
    const tasksText = taskInspection.text ?? beforeCoreState.tasksText;
    const taskFile = taskInspection.taskFile ?? beforeCoreState.taskFile;
    const effectiveTaskCounts = taskCounts ?? countTaskStatuses(taskFile);
    const selectedTask = selectNextTask(taskFile);
    const taskSelectedAt = new Date().toISOString();
    const validationCommand = chooseValidationCommand(summary, selectedTask, config.validationCommandOverride);
    const validationCommandReadiness = await inspectValidationCommandReadiness({
      command: validationCommand,
      rootPath
    });
    const promptTarget: RalphPromptTarget = includeVerifierContext ? 'cliExec' : 'ideHandoff';
    const trustLevel = trustLevelForTarget(promptTarget);
    const promptDecision = decidePromptKind(snapshot.state, promptTarget);
    const promptKind = promptDecision.kind;
    const iteration = snapshot.state.nextIteration;
    const provenanceId = createProvenanceId({
      iteration,
      promptTarget,
      createdAt: taskSelectedAt
    });
    const [availableCommands, codexCliSupport] = await Promise.all([
      vscode.commands.getCommands(true),
      inspectCodexCliSupport(config.codexCommandPath)
    ]);
    const ideCommandSupport = inspectIdeCommandSupport({
      preferredHandoffMode: config.preferredHandoffMode,
      openSidebarCommandId: config.openSidebarCommandId,
      newChatCommandId: config.newChatCommandId,
      availableCommands
    });
    const preflightReport = buildPreflightReport({
      rootPath,
      workspaceTrusted: vscode.workspace.isTrusted,
      config,
      taskInspection,
      taskCounts: effectiveTaskCounts,
      selectedTask,
      validationCommand,
      validationCommandReadiness,
      fileStatus: snapshot.fileStatus,
      createdPaths: snapshot.createdPaths,
      codexCliSupport,
      ideCommandSupport
    });
    const preflightArtifactPaths = resolvePreflightArtifactPaths(snapshot.paths.artifactDir, iteration);
    const {
      persistedReport: persistedPreflightReport,
      humanSummary: preflightSummaryText
    } = await writePreflightArtifacts({
      paths: preflightArtifactPaths,
      artifactRootDir: snapshot.paths.artifactDir,
      provenanceId,
      iteration,
      promptKind,
      promptTarget,
      trustLevel,
      report: preflightReport,
      selectedTaskId: selectedTask?.id ?? null,
      selectedTaskTitle: selectedTask?.title ?? null,
      validationCommand
    });
    progress.report({ message: preflightReport.summary });
    this.logger.appendText(renderPreflightReport(preflightReport));
    this.logger.info('Prepared Ralph preflight report.', {
      rootPath,
      iteration,
      ready: preflightReport.ready,
      preflightReportPath: preflightArtifactPaths.reportPath,
      preflightSummaryPath: preflightArtifactPaths.summaryPath,
      diagnostics: preflightReport.diagnostics
    });
    if (includeVerifierContext && !preflightReport.ready) {
      await this.persistBlockedPreflightBundle({
        paths: snapshot.paths,
        provenanceId,
        iteration,
        promptKind,
        promptTarget,
        trustLevel,
        retentionCount: config.provenanceBundleRetentionCount,
        selectedTask,
        persistedPreflightReport,
        preflightSummaryText
      });
      throw new Error(buildBlockingPreflightMessage(preflightReport));
    }

    progress.report({ message: 'Generating Ralph prompt' });
    const artifactPaths = resolveIterationArtifactPaths(snapshot.paths.artifactDir, iteration);
    const provenanceBundlePaths = resolveProvenanceBundlePaths(snapshot.paths.artifactDir, provenanceId);
    const promptRender = await buildPrompt({
      kind: promptKind,
      target: promptTarget,
      iteration,
      selectionReason: promptDecision.reason,
      objectiveText,
      progressText,
      taskCounts: effectiveTaskCounts,
      summary,
      state: snapshot.state,
      paths: snapshot.paths,
      taskFile,
      selectedTask,
      validationCommand,
      preflightReport,
      config
    });
    const prompt = promptRender.prompt;
    const promptEvidence: RalphPromptEvidence = {
      ...promptRender.evidence,
      provenanceId
    };

    const promptPath = await this.stateManager.writePrompt(
      snapshot.paths,
      createPromptFileName(promptKind, iteration),
      prompt
    );
    await writePromptArtifacts({
      paths: artifactPaths,
      artifactRootDir: snapshot.paths.artifactDir,
      prompt,
      promptEvidence
    });
    const executionPlan: RalphExecutionPlan = {
      schemaVersion: 1,
      kind: 'executionPlan',
      provenanceId,
      iteration,
      selectedTaskId: selectedTask?.id ?? null,
      selectedTaskTitle: selectedTask?.title ?? null,
      promptKind,
      promptTarget,
      selectionReason: promptDecision.reason,
      templatePath: promptRender.templatePath,
      promptPath,
      promptArtifactPath: artifactPaths.promptPath,
      promptEvidencePath: artifactPaths.promptEvidencePath,
      promptHash: hashText(prompt),
      promptByteLength: utf8ByteLength(prompt),
      artifactDir: artifactPaths.directory,
      createdAt: new Date().toISOString()
    };
    const executionPlanHash = hashJson(executionPlan);
    await writeExecutionPlanArtifact({
      paths: artifactPaths,
      artifactRootDir: snapshot.paths.artifactDir,
      plan: executionPlan
    });
    const promptGeneratedAt = new Date().toISOString();
    const beforeGit = includeVerifierContext
      && (config.verifierModes.includes('gitDiff') || config.gitCheckpointMode !== 'off')
      ? await captureGitStatus(rootPath)
      : EMPTY_GIT_STATUS;

    this.logger.info('Prepared Ralph prompt context.', {
      rootPath,
      promptKind,
      promptTarget,
      promptSelectionReason: promptDecision.reason,
      iteration,
      promptPath,
      promptTemplatePath: promptRender.templatePath,
      promptArtifactPath: executionPlan.promptArtifactPath,
      promptHash: executionPlan.promptHash,
      executionPlanPath: artifactPaths.executionPlanPath,
      promptEvidence,
      selectedTaskId: selectedTask?.id ?? null,
      validationCommand
    });

    const preparedContext: PreparedIterationContext = {
      config,
      rootPath,
      state: snapshot.state,
      paths: snapshot.paths,
      provenanceId,
      trustLevel,
      promptKind,
      promptTarget,
      promptSelectionReason: promptDecision.reason,
      promptPath,
      promptTemplatePath: promptRender.templatePath,
      promptEvidence,
      executionPlan,
      executionPlanHash,
      executionPlanPath: artifactPaths.executionPlanPath,
      prompt,
      iteration,
      objectiveText,
      progressText,
      tasksText,
      taskFile,
      taskCounts: effectiveTaskCounts,
      summary,
      selectedTask,
      validationCommand,
      preflightReport,
      persistedPreflightReport,
      preflightSummaryText,
      provenanceBundlePaths,
      createdPaths: snapshot.createdPaths,
      beforeCoreState,
      beforeGit,
      phaseSeed: {
        inspectStartedAt,
        inspectFinishedAt: taskSelectedAt,
        taskSelectedAt,
        promptGeneratedAt
      }
    };
    await this.persistPreparedProvenanceBundle(preparedContext);

    return preparedContext;
  }
}
