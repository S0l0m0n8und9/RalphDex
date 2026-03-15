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
import { deriveRootPolicy } from './rootPolicy';
import {
  DEFAULT_RALPH_AGENT_ID,
  RalphCompletionReport,
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
  RalphRootPolicy,
  RalphProvenanceTrustLevel,
  RalphRunMode,
  RalphRunRecord,
  RalphSuggestedChildTask,
  RalphTask,
  RalphTaskCounts,
  RalphTaskFile,
  RalphTaskRemediationArtifact,
  RalphTaskRemediationHistoryEntry,
  RalphWorkspaceState
} from './types';
import { countTaskStatuses, findTaskById, remainingSubtasks, selectNextTask } from './taskFile';
import { buildTaskRemediation, classifyIterationOutcome, classifyVerificationStatus, decideLoopContinuation } from './loopLogic';
import {
  buildBlockingPreflightMessage,
  buildPreflightReport,
  inspectPreflightArtifactReadiness,
  renderPreflightReport
} from './preflight';
import {
  captureCoreState,
  captureGitStatus,
  chooseValidationCommand,
  GitStatusSnapshot,
  inspectValidationCommandReadiness,
  normalizeValidationCommand,
  RalphCoreStateSnapshot,
  runFileChangeVerifier,
  runTaskStateVerifier,
  runValidationCommandVerifier
} from './verifier';
import {
  cleanupGeneratedArtifacts,
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
import { reconcileCompletionReport } from './reconciliation';
import { buildRemediationArtifact, normalizeRemediationForTask } from './taskDecomposition';

const EMPTY_GIT_STATUS: GitStatusSnapshot = {
  available: false,
  raw: '',
  entries: []
};

interface PreparedPromptContext {
  config: RalphCodexConfig;
  rootPath: string;
  rootPolicy: RalphRootPolicy;
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
  taskValidationHint: string | null;
  effectiveValidationCommand: string | null;
  normalizedValidationCommandFrom: string | null;
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

function trustLevelForTarget(promptTarget: RalphPromptTarget): RalphProvenanceTrustLevel {
  return promptTarget === 'cliExec' ? 'verifiedCliExecution' : 'preparedPromptOnly';
}

function isBacklogExhausted(taskCounts: RalphTaskCounts): boolean {
  return taskCounts.todo === 0 && taskCounts.in_progress === 0 && taskCounts.blocked === 0;
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
      rootPolicy: prepared.rootPolicy,
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

    await this.cleanupGeneratedArtifacts(prepared.paths, prepared.config.generatedArtifactRetentionCount, 'prepare');
  }

  private async persistBlockedPreflightBundle(input: {
    paths: ReturnType<RalphStateManager['resolvePaths']>;
    provenanceId: string;
    iteration: number;
    promptKind: RalphPromptKind;
    promptTarget: RalphPromptTarget;
    trustLevel: RalphProvenanceTrustLevel;
    provenanceRetentionCount: number;
    generatedArtifactRetentionCount: number;
    selectedTask: RalphTask | null;
    rootPolicy: RalphRootPolicy;
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
      rootPolicy: input.rootPolicy,
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
      retentionCount: input.provenanceRetentionCount
    });

    if (writeResult.retention.deletedBundleIds.length > 0) {
      this.logger.info('Cleaned up old Ralph provenance bundles after blocked preflight.', {
        deletedBundleIds: writeResult.retention.deletedBundleIds
      });
    }

    await this.cleanupGeneratedArtifacts(input.paths, input.generatedArtifactRetentionCount, 'blocked preflight');
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

    await this.cleanupGeneratedArtifacts(prepared.paths, prepared.config.generatedArtifactRetentionCount, 'integrity failure');
  }

  private async cleanupGeneratedArtifacts(
    paths: ReturnType<RalphStateManager['resolvePaths']>,
    retentionCount: number,
    stage: string
  ): Promise<void> {
    const retention = await cleanupGeneratedArtifacts({
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

    const shouldExecutePrompt = prepared.selectedTask !== null || prepared.promptKind === 'replenish-backlog';

    if (shouldExecutePrompt) {
      const artifactBaseName = createArtifactBaseName(prepared.promptKind, prepared.iteration);
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
        const verifiedPlan = await readVerifiedExecutionPlanArtifact(
          prepared.executionPlanPath,
          prepared.executionPlanHash
        );
        const promptArtifactText = await readVerifiedPromptArtifact(verifiedPlan);
        phaseTimestamps.executionStartedAt = new Date().toISOString();
        const execResult = await execStrategy.runExec({
          commandPath: prepared.config.codexCommandPath,
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
          commandPath: prepared.config.codexCommandPath,
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

    const afterCoreStateBeforeReconciliation = await captureCoreState(prepared.paths);
    const shouldCaptureGit = prepared.config.verifierModes.includes('gitDiff') || prepared.config.gitCheckpointMode !== 'off';
    const afterGit = shouldCaptureGit ? await captureGitStatus(prepared.rootPolicy.verificationRootPath) : EMPTY_GIT_STATUS;

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

    const preliminaryVerificationStatus = classifyVerificationStatus([
      validationVerification.result.status,
      fileChangeVerification.result.status
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
      relevantFileChanges: fileChangeVerification.diffSummary?.relevantChangedFiles ?? [],
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
      fileChangeVerification.result,
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
      ...completionReconciliation.warnings,
      ...verifierResults.flatMap((item) => item.warnings)
    ];
    const errors = [
      ...executionErrors,
      ...verifierResults.flatMap((item) => item.errors)
    ];

    const result: RalphIterationResult = {
      schemaVersion: 1,
      agentId: DEFAULT_RALPH_AGENT_ID,
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
    const runtimeChanges = controlPlaneRuntimeChanges(fileChangeVerification.diffSummary?.relevantChangedFiles ?? []);

    if (!loopDecision.shouldContinue) {
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

    phaseTimestamps.persistedAt = new Date().toISOString();

    const remediationArtifact = buildRemediationArtifact({
      result,
      taskFile: afterCoreState.taskFile,
      previousIterations: prepared.state.iterationHistory,
      artifactDir: artifactPaths.directory,
      iterationResultPath: artifactPaths.iterationResultPath,
      createdAt: phaseTimestamps.persistedAt
    });

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
      scanWorkspace(rootPath, workspaceFolder.name, {
        focusPath,
        inspectionRootOverride: config.inspectionRootOverride
      }),
      captureCoreState(snapshot.paths)
    ]);
    const tasksText = taskInspection.text ?? beforeCoreState.tasksText;
    const taskFile = taskInspection.taskFile ?? beforeCoreState.taskFile;
    const effectiveTaskCounts = taskCounts ?? countTaskStatuses(taskFile);
    const selectedTask = selectNextTask(taskFile);
    const taskSelectedAt = new Date().toISOString();
    const rootPolicy = deriveRootPolicy(summary);
    const promptTarget: RalphPromptTarget = includeVerifierContext ? 'cliExec' : 'ideHandoff';
    const promptDecision = decidePromptKind(snapshot.state, promptTarget, {
      selectedTask,
      taskCounts: effectiveTaskCounts,
      taskInspectionDiagnostics: taskInspection.diagnostics
    });
    const promptKind = promptDecision.kind;
    const taskValidationHint = selectedTask?.validation?.trim() || null;
    const selectedValidationCommand = promptKind === 'replenish-backlog'
      ? null
      : chooseValidationCommand(summary, selectedTask, config.validationCommandOverride);
    const effectiveValidationCommand = promptKind === 'replenish-backlog'
      ? null
      : normalizeValidationCommand({
        command: selectedValidationCommand,
        workspaceRootPath: workspaceFolder.uri.fsPath,
        verificationRootPath: rootPolicy.verificationRootPath
      });
    const normalizedValidationCommandFrom = selectedValidationCommand
      && effectiveValidationCommand
      && selectedValidationCommand !== effectiveValidationCommand
      ? selectedValidationCommand
      : null;
    const validationCommandReadiness = await inspectValidationCommandReadiness({
      command: effectiveValidationCommand,
      rootPath: rootPolicy.verificationRootPath
    });
    const trustLevel = trustLevelForTarget(promptTarget);
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
    const artifactReadinessDiagnostics = await inspectPreflightArtifactReadiness({
      rootPath,
      artifactRootDir: snapshot.paths.artifactDir,
      promptDir: snapshot.paths.promptDir,
      runDir: snapshot.paths.runDir,
      stateFilePath: snapshot.paths.stateFilePath,
      generatedArtifactRetentionCount: config.generatedArtifactRetentionCount,
      provenanceBundleRetentionCount: config.provenanceBundleRetentionCount
    });
    const preflightReport = buildPreflightReport({
      rootPath,
      workspaceTrusted: vscode.workspace.isTrusted,
      config,
      taskInspection,
      taskCounts: effectiveTaskCounts,
      selectedTask,
      taskValidationHint,
      validationCommand: effectiveValidationCommand,
      normalizedValidationCommandFrom,
      validationCommandReadiness,
      fileStatus: snapshot.fileStatus,
      createdPaths: snapshot.createdPaths,
      codexCliSupport,
      ideCommandSupport,
      artifactReadinessDiagnostics
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
      taskValidationHint,
      effectiveValidationCommand,
      normalizedValidationCommandFrom,
      validationCommand: effectiveValidationCommand
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
        provenanceRetentionCount: config.provenanceBundleRetentionCount,
        generatedArtifactRetentionCount: config.generatedArtifactRetentionCount,
        selectedTask,
        rootPolicy,
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
      taskValidationHint,
      effectiveValidationCommand,
      normalizedValidationCommandFrom,
      validationCommand: effectiveValidationCommand,
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
      taskValidationHint,
      effectiveValidationCommand,
      normalizedValidationCommandFrom,
      promptKind,
      promptTarget,
      selectionReason: promptDecision.reason,
      rootPolicy,
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
      ? await captureGitStatus(rootPolicy.verificationRootPath)
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
      taskValidationHint,
      effectiveValidationCommand,
      normalizedValidationCommandFrom
    });

    const preparedContext: PreparedIterationContext = {
      config,
      rootPath,
      rootPolicy,
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
      taskValidationHint,
      effectiveValidationCommand,
      normalizedValidationCommandFrom,
      validationCommand: effectiveValidationCommand,
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
