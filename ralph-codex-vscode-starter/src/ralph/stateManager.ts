import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { RalphCodexConfig } from '../config/types';
import { Logger } from '../services/logger';
import { resolveRalphPaths, RalphPaths } from './pathResolver';
import {
  cleanupGeneratedArtifacts,
  cleanupProvenanceBundles,
  RalphGeneratedArtifactRetentionSummary,
  RalphProvenanceRetentionSummary
} from './artifactStore';
import {
  countTaskStatuses,
  createDefaultTaskFile,
  inspectTaskFileText,
  parseTaskFile,
  RalphTaskFileInspection,
  findTaskById,
  stringifyTaskFile,
  withTaskFileLock
} from './taskFile';
import {
  DEFAULT_RALPH_AGENT_ID,
  RalphDiffSummary,
  RalphExecutionIntegritySummary,
  RalphIterationResult,
  RalphPromptKind,
  RalphRootPolicy,
  RalphRunRecord,
  RalphTaskRemediation,
  RalphTask,
  RalphTaskCounts,
  RalphTaskFile,
  RalphVerificationResult,
  RalphWorkspaceState
} from './types';

const RUN_HISTORY_LIMIT = 20;
const ITERATION_HISTORY_LIMIT = 30;

const DEFAULT_LOCK_RETRY_COUNT = 10;
const DEFAULT_LOCK_RETRY_DELAY_MS = 25;

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export interface RalphStateLockOptions {
  lockRetryCount?: number;
  lockRetryDelayMs?: number;
}

export interface RalphStateLockTimeout {
  outcome: 'lock_timeout';
  lockPath: string;
  attempts: number;
}

export interface RalphStateLockAcquired<T> {
  outcome: 'ok';
  value: T;
}

export type RalphStateLockResult<T> = RalphStateLockAcquired<T> | RalphStateLockTimeout;

export async function withStateLock<T>(
  stateFilePath: string,
  options: RalphStateLockOptions | undefined,
  fn: () => Promise<T>
): Promise<RalphStateLockResult<T>> {
  const lockPath = path.join(path.dirname(stateFilePath), 'state.lock');
  const retryCount = Math.max(0, Math.floor(options?.lockRetryCount ?? DEFAULT_LOCK_RETRY_COUNT));
  const retryDelayMs = Math.max(0, Math.floor(options?.lockRetryDelayMs ?? DEFAULT_LOCK_RETRY_DELAY_MS));

  for (let attempt = 0; ; attempt += 1) {
    let handle: Awaited<ReturnType<typeof fs.open>> | null = null;
    try {
      await fs.mkdir(path.dirname(lockPath), { recursive: true });
      handle = await fs.open(lockPath, 'wx');
      try {
        return {
          outcome: 'ok',
          value: await fn()
        };
      } finally {
        await handle.close();
        await fs.rm(lockPath, { force: true });
      }
    } catch (error) {
      if (handle) {
        await handle.close().catch(() => undefined);
      }

      const code = typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code)
        : '';
      if (code !== 'EEXIST' || attempt >= retryCount) {
        throw error;
      }

      await sleep(retryDelayMs);
    }
  }
}

const DEFAULT_PRD = [
  '# Product / project brief',
  '',
  'Describe the current objective for Ralph here.',
  '',
  '- What should Codex change?',
  '- What constraints matter?',
  '- What does “done” look like?'
].join('\n');

const DEFAULT_PROGRESS = [
  '# Progress',
  '',
  '- Ralph workspace initialized.',
  '- Use this file for durable progress notes between fresh Codex runs.'
].join('\n');

function defaultState(): RalphWorkspaceState {
  return {
    version: 2,
    objectivePreview: null,
    nextIteration: 1,
    lastPromptKind: null,
    lastPromptPath: null,
    lastRun: null,
    runHistory: [],
    lastIteration: null,
    iterationHistory: [],
    updatedAt: new Date().toISOString()
  };
}

function stateKey(rootPath: string): string {
  return `ralphCodex.workspaceState:${rootPath}`;
}

function summarizeObjective(text: string): string | null {
  const line = text
    .split('\n')
    .map((value) => value.trim())
    .find((value) => value.length > 0 && !value.startsWith('#') && !value.startsWith('-'));

  return line ? line.slice(0, 160) : null;
}

function normalizeRunRecord(candidate: unknown): RalphRunRecord | null {
  if (typeof candidate !== 'object' || candidate === null) {
    return null;
  }

  const record = candidate as Record<string, unknown>;
  if (typeof record.iteration !== 'number'
    || typeof record.mode !== 'string'
    || typeof record.promptKind !== 'string'
    || typeof record.startedAt !== 'string'
    || typeof record.finishedAt !== 'string'
    || typeof record.status !== 'string'
    || (typeof record.exitCode !== 'number' && record.exitCode !== null)
    || typeof record.promptPath !== 'string'
    || typeof record.summary !== 'string') {
    return null;
  }

  return {
    agentId: typeof record.agentId === 'string' ? record.agentId : DEFAULT_RALPH_AGENT_ID,
    provenanceId: typeof record.provenanceId === 'string' ? record.provenanceId : undefined,
    iteration: Math.max(1, Math.floor(record.iteration)),
    mode: record.mode as RalphRunRecord['mode'],
    promptKind: record.promptKind as RalphPromptKind,
    startedAt: record.startedAt,
    finishedAt: record.finishedAt,
    status: record.status as RalphRunRecord['status'],
    exitCode: typeof record.exitCode === 'number' ? record.exitCode : null,
    promptPath: record.promptPath,
    transcriptPath: typeof record.transcriptPath === 'string' ? record.transcriptPath : undefined,
    lastMessagePath: typeof record.lastMessagePath === 'string' ? record.lastMessagePath : undefined,
    summary: record.summary
  };
}

function normalizeVerificationResult(candidate: unknown): RalphVerificationResult | null {
  if (typeof candidate !== 'object' || candidate === null) {
    return null;
  }

  const record = candidate as Record<string, unknown>;
  if (typeof record.verifier !== 'string' || typeof record.status !== 'string' || typeof record.summary !== 'string') {
    return null;
  }

  return {
    verifier: record.verifier as RalphVerificationResult['verifier'],
    status: record.status as RalphVerificationResult['status'],
    summary: record.summary,
    warnings: Array.isArray(record.warnings) ? record.warnings.filter((item): item is string => typeof item === 'string') : [],
    errors: Array.isArray(record.errors) ? record.errors.filter((item): item is string => typeof item === 'string') : [],
    command: typeof record.command === 'string' ? record.command : undefined,
    artifactPath: typeof record.artifactPath === 'string' ? record.artifactPath : undefined,
    failureSignature: typeof record.failureSignature === 'string' ? record.failureSignature : null,
    metadata: typeof record.metadata === 'object' && record.metadata !== null
      ? record.metadata as Record<string, unknown>
      : undefined
  };
}

function normalizeDiffSummary(candidate: unknown): RalphDiffSummary | null {
  if (typeof candidate !== 'object' || candidate === null) {
    return null;
  }

  const record = candidate as Record<string, unknown>;
  if (typeof record.available !== 'boolean' || typeof record.summary !== 'string') {
    return null;
  }

  const changedFiles = Array.isArray(record.changedFiles)
    ? record.changedFiles.filter((item): item is string => typeof item === 'string')
    : [];
  const relevantChangedFiles = Array.isArray(record.relevantChangedFiles)
    ? record.relevantChangedFiles.filter((item): item is string => typeof item === 'string')
    : [];

  return {
    available: record.available,
    gitAvailable: typeof record.gitAvailable === 'boolean' ? record.gitAvailable : record.available,
    summary: record.summary,
    changedFileCount: typeof record.changedFileCount === 'number'
      ? Math.max(0, Math.floor(record.changedFileCount))
      : changedFiles.length,
    relevantChangedFileCount: typeof record.relevantChangedFileCount === 'number'
      ? Math.max(0, Math.floor(record.relevantChangedFileCount))
      : relevantChangedFiles.length,
    changedFiles,
    relevantChangedFiles,
    statusTransitions: Array.isArray(record.statusTransitions)
      ? record.statusTransitions.filter((item): item is string => typeof item === 'string')
      : [],
    suggestedCheckpointRef: typeof record.suggestedCheckpointRef === 'string' ? record.suggestedCheckpointRef : undefined,
    beforeStatusPath: typeof record.beforeStatusPath === 'string' ? record.beforeStatusPath : undefined,
    afterStatusPath: typeof record.afterStatusPath === 'string' ? record.afterStatusPath : undefined
  };
}

function normalizeRootPolicy(candidate: unknown): RalphRootPolicy | null {
  if (typeof candidate !== 'object' || candidate === null) {
    return null;
  }

  const record = candidate as Record<string, unknown>;
  if (typeof record.workspaceRootPath !== 'string'
    || typeof record.inspectionRootPath !== 'string'
    || typeof record.executionRootPath !== 'string'
    || typeof record.verificationRootPath !== 'string'
    || typeof record.selectionStrategy !== 'string'
    || typeof record.selectionSummary !== 'string'
    || typeof record.policySummary !== 'string') {
    return null;
  }

  return {
    workspaceRootPath: record.workspaceRootPath,
    inspectionRootPath: record.inspectionRootPath,
    executionRootPath: record.executionRootPath,
    verificationRootPath: record.verificationRootPath,
    selectionStrategy: record.selectionStrategy as RalphRootPolicy['selectionStrategy'],
    selectionSummary: record.selectionSummary,
    policySummary: record.policySummary
  };
}

function normalizeExecutionIntegrity(candidate: unknown): RalphExecutionIntegritySummary | null {
  if (typeof candidate !== 'object' || candidate === null) {
    return null;
  }

  const record = candidate as Record<string, unknown>;
  if (typeof record.promptTarget !== 'string'
    || typeof record.templatePath !== 'string'
    || typeof record.executionPlanPath !== 'string'
    || typeof record.promptArtifactPath !== 'string'
    || typeof record.promptHash !== 'string'
    || typeof record.promptByteLength !== 'number') {
    return null;
  }

  return {
    provenanceId: typeof record.provenanceId === 'string' ? record.provenanceId : undefined,
    promptTarget: record.promptTarget as RalphExecutionIntegritySummary['promptTarget'],
    rootPolicy: normalizeRootPolicy(record.rootPolicy),
    templatePath: record.templatePath,
    reasoningEffort: typeof record.reasoningEffort === 'string' ? record.reasoningEffort : null,
    taskValidationHint: typeof record.taskValidationHint === 'string' ? record.taskValidationHint : null,
    effectiveValidationCommand: typeof record.effectiveValidationCommand === 'string'
      ? record.effectiveValidationCommand
      : typeof record.validationCommand === 'string'
        ? record.validationCommand
        : null,
    normalizedValidationCommandFrom: typeof record.normalizedValidationCommandFrom === 'string'
      ? record.normalizedValidationCommandFrom
      : null,
    executionPlanPath: record.executionPlanPath,
    executionPlanHash: typeof record.executionPlanHash === 'string' ? record.executionPlanHash : undefined,
    promptArtifactPath: record.promptArtifactPath,
    promptHash: record.promptHash,
    promptByteLength: Math.max(0, Math.floor(record.promptByteLength)),
    executionPayloadHash: typeof record.executionPayloadHash === 'string' ? record.executionPayloadHash : null,
    executionPayloadMatched: typeof record.executionPayloadMatched === 'boolean' ? record.executionPayloadMatched : null,
    mismatchReason: typeof record.mismatchReason === 'string' ? record.mismatchReason : null,
    cliInvocationPath: typeof record.cliInvocationPath === 'string' ? record.cliInvocationPath : null
  };
}

function iterationFromRunRecord(run: RalphRunRecord): RalphIterationResult {
  return {
    schemaVersion: 1,
    agentId: run.agentId ?? DEFAULT_RALPH_AGENT_ID,
    provenanceId: run.provenanceId,
    iteration: run.iteration,
    selectedTaskId: null,
    selectedTaskTitle: null,
    promptKind: run.promptKind,
    promptPath: run.promptPath,
    artifactDir: path.dirname(run.promptPath),
    adapterUsed: run.mode === 'handoff' ? 'clipboard' : 'cliExec',
    executionIntegrity: null,
    executionStatus: run.status,
    verificationStatus: 'skipped',
    completionClassification: run.status === 'succeeded' ? 'partial_progress' : 'failed',
    followUpAction: run.status === 'succeeded' ? 'continue_same_task' : 'retry_same_task',
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    phaseTimestamps: {
      inspectStartedAt: run.startedAt,
      inspectFinishedAt: run.startedAt,
      taskSelectedAt: run.startedAt,
      promptGeneratedAt: run.startedAt,
      executionStartedAt: run.startedAt,
      executionFinishedAt: run.finishedAt,
      resultCollectedAt: run.finishedAt,
      verificationFinishedAt: run.finishedAt,
      classifiedAt: run.finishedAt
    },
    summary: run.summary,
    warnings: [],
    errors: [],
    execution: {
      exitCode: run.exitCode,
      transcriptPath: run.transcriptPath,
      lastMessagePath: run.lastMessagePath
    },
    verification: {
      taskValidationHint: null,
      effectiveValidationCommand: null,
      normalizedValidationCommandFrom: null,
      primaryCommand: null,
      validationFailureSignature: null,
      verifiers: []
    },
    backlog: {
      remainingTaskCount: 0,
      actionableTaskAvailable: false
    },
    diffSummary: null,
    noProgressSignals: [],
    remediation: null,
    stopReason: null
  };
}

function normalizeTaskRemediation(candidate: unknown): RalphTaskRemediation | null {
  if (typeof candidate !== 'object' || candidate === null) {
    return null;
  }

  const record = candidate as Record<string, unknown>;
  if (typeof record.trigger !== 'string'
    || typeof record.action !== 'string'
    || typeof record.attemptCount !== 'number'
    || typeof record.humanReviewRecommended !== 'boolean'
    || typeof record.summary !== 'string') {
    return null;
  }

  return {
    trigger: record.trigger as RalphTaskRemediation['trigger'],
    taskId: typeof record.taskId === 'string' ? record.taskId : null,
    attemptCount: Math.max(1, Math.floor(record.attemptCount)),
    action: record.action as RalphTaskRemediation['action'],
    humanReviewRecommended: record.humanReviewRecommended,
    summary: record.summary,
    evidence: Array.isArray(record.evidence)
      ? record.evidence.filter((item): item is string => typeof item === 'string')
      : []
  };
}

function normalizeIterationResult(candidate: unknown): RalphIterationResult | null {
  if (typeof candidate !== 'object' || candidate === null) {
    return null;
  }

  const record = candidate as Record<string, unknown>;
  if (typeof record.iteration !== 'number'
    || typeof record.promptKind !== 'string'
    || typeof record.promptPath !== 'string'
    || typeof record.artifactDir !== 'string'
    || typeof record.adapterUsed !== 'string'
    || typeof record.executionStatus !== 'string'
    || typeof record.verificationStatus !== 'string'
    || typeof record.completionClassification !== 'string'
    || typeof record.followUpAction !== 'string'
    || typeof record.startedAt !== 'string'
    || typeof record.finishedAt !== 'string'
    || typeof record.summary !== 'string') {
    return null;
  }

  const phaseTimestamps = typeof record.phaseTimestamps === 'object' && record.phaseTimestamps !== null
    ? record.phaseTimestamps as Record<string, unknown>
    : {};
  const execution = typeof record.execution === 'object' && record.execution !== null
    ? record.execution as Record<string, unknown>
    : {};
  const verification = typeof record.verification === 'object' && record.verification !== null
    ? record.verification as Record<string, unknown>
    : {};
  const verifiers = Array.isArray(verification.verifiers)
    ? verification.verifiers
      .map((item) => normalizeVerificationResult(item))
      .filter((item): item is RalphVerificationResult => item !== null)
    : [];

    return {
      schemaVersion: 1,
      agentId: typeof record.agentId === 'string' ? record.agentId : DEFAULT_RALPH_AGENT_ID,
      provenanceId: typeof record.provenanceId === 'string' ? record.provenanceId : undefined,
      iteration: Math.max(1, Math.floor(record.iteration)),
      selectedTaskId: typeof record.selectedTaskId === 'string' ? record.selectedTaskId : null,
      selectedTaskTitle: typeof record.selectedTaskTitle === 'string' ? record.selectedTaskTitle : null,
      promptKind: record.promptKind as RalphPromptKind,
      promptPath: record.promptPath,
    artifactDir: record.artifactDir,
    adapterUsed: record.adapterUsed,
    executionIntegrity: normalizeExecutionIntegrity(record.executionIntegrity),
    executionStatus: record.executionStatus as RalphIterationResult['executionStatus'],
    verificationStatus: record.verificationStatus as RalphIterationResult['verificationStatus'],
    completionClassification: record.completionClassification as RalphIterationResult['completionClassification'],
    followUpAction: record.followUpAction as RalphIterationResult['followUpAction'],
    startedAt: record.startedAt,
    finishedAt: record.finishedAt,
    phaseTimestamps: {
      inspectStartedAt: typeof phaseTimestamps.inspectStartedAt === 'string' ? phaseTimestamps.inspectStartedAt : record.startedAt,
      inspectFinishedAt: typeof phaseTimestamps.inspectFinishedAt === 'string' ? phaseTimestamps.inspectFinishedAt : record.startedAt,
      taskSelectedAt: typeof phaseTimestamps.taskSelectedAt === 'string' ? phaseTimestamps.taskSelectedAt : record.startedAt,
      promptGeneratedAt: typeof phaseTimestamps.promptGeneratedAt === 'string' ? phaseTimestamps.promptGeneratedAt : record.startedAt,
      executionStartedAt: typeof phaseTimestamps.executionStartedAt === 'string' ? phaseTimestamps.executionStartedAt : undefined,
      executionFinishedAt: typeof phaseTimestamps.executionFinishedAt === 'string' ? phaseTimestamps.executionFinishedAt : undefined,
      resultCollectedAt: typeof phaseTimestamps.resultCollectedAt === 'string' ? phaseTimestamps.resultCollectedAt : record.finishedAt,
      verificationFinishedAt: typeof phaseTimestamps.verificationFinishedAt === 'string' ? phaseTimestamps.verificationFinishedAt : record.finishedAt,
      classifiedAt: typeof phaseTimestamps.classifiedAt === 'string' ? phaseTimestamps.classifiedAt : record.finishedAt,
      persistedAt: typeof phaseTimestamps.persistedAt === 'string' ? phaseTimestamps.persistedAt : undefined
    },
    summary: record.summary,
    warnings: Array.isArray(record.warnings) ? record.warnings.filter((item): item is string => typeof item === 'string') : [],
    errors: Array.isArray(record.errors) ? record.errors.filter((item): item is string => typeof item === 'string') : [],
    execution: {
      exitCode: typeof execution.exitCode === 'number' ? execution.exitCode : null,
      message: typeof execution.message === 'string' ? execution.message : undefined,
      transcriptPath: typeof execution.transcriptPath === 'string' ? execution.transcriptPath : undefined,
      lastMessagePath: typeof execution.lastMessagePath === 'string' ? execution.lastMessagePath : undefined,
      stdoutPath: typeof execution.stdoutPath === 'string' ? execution.stdoutPath : undefined,
      stderrPath: typeof execution.stderrPath === 'string' ? execution.stderrPath : undefined
    },
    verification: {
      taskValidationHint: typeof verification.taskValidationHint === 'string' ? verification.taskValidationHint : null,
      effectiveValidationCommand: typeof verification.effectiveValidationCommand === 'string'
        ? verification.effectiveValidationCommand
        : typeof verification.primaryCommand === 'string'
          ? verification.primaryCommand
          : null,
      normalizedValidationCommandFrom: typeof verification.normalizedValidationCommandFrom === 'string'
        ? verification.normalizedValidationCommandFrom
        : null,
      primaryCommand: typeof verification.primaryCommand === 'string' ? verification.primaryCommand : null,
      validationFailureSignature: typeof verification.validationFailureSignature === 'string'
        ? verification.validationFailureSignature
        : null,
      verifiers
    },
    backlog: typeof record.backlog === 'object' && record.backlog !== null
      ? {
        remainingTaskCount: typeof (record.backlog as Record<string, unknown>).remainingTaskCount === 'number'
          ? Math.max(0, Math.floor((record.backlog as Record<string, unknown>).remainingTaskCount as number))
          : 0,
        actionableTaskAvailable: Boolean((record.backlog as Record<string, unknown>).actionableTaskAvailable)
      }
      : {
        remainingTaskCount: 0,
        actionableTaskAvailable: false
      },
    diffSummary: normalizeDiffSummary(record.diffSummary),
    noProgressSignals: Array.isArray(record.noProgressSignals)
      ? record.noProgressSignals.filter((item): item is string => typeof item === 'string')
      : [],
    remediation: normalizeTaskRemediation(record.remediation),
    completionReportStatus: record.completionReportStatus === 'applied'
      || record.completionReportStatus === 'rejected'
      || record.completionReportStatus === 'missing'
      || record.completionReportStatus === 'invalid'
      ? record.completionReportStatus
      : undefined,
    reconciliationWarnings: Array.isArray(record.reconciliationWarnings)
      ? record.reconciliationWarnings.filter((item): item is string => typeof item === 'string')
      : undefined,
    stopReason: typeof record.stopReason === 'string' ? record.stopReason as RalphIterationResult['stopReason'] : null
  };
}

function normalizeWorkspaceState(candidate: unknown): RalphWorkspaceState {
  if (typeof candidate !== 'object' || candidate === null) {
    return defaultState();
  }

  const record = candidate as Record<string, unknown>;
  const runHistory = Array.isArray(record.runHistory)
    ? record.runHistory
      .map((item) => normalizeRunRecord(item))
      .filter((item): item is RalphRunRecord => item !== null)
      .slice(-RUN_HISTORY_LIMIT)
    : [];

  const iterationHistory = Array.isArray(record.iterationHistory)
    ? record.iterationHistory
      .map((item) => normalizeIterationResult(item))
      .filter((item): item is RalphIterationResult => item !== null)
      .slice(-ITERATION_HISTORY_LIMIT)
    : runHistory.map((item) => iterationFromRunRecord(item)).slice(-ITERATION_HISTORY_LIMIT);

  const lastRun = normalizeRunRecord(record.lastRun) ?? (runHistory.length > 0 ? runHistory[runHistory.length - 1] : null);
  const lastIteration = normalizeIterationResult(record.lastIteration)
    ?? (iterationHistory.length > 0 ? iterationHistory[iterationHistory.length - 1] : null);

  return {
    version: 2,
    objectivePreview: typeof record.objectivePreview === 'string' ? record.objectivePreview : null,
    nextIteration: typeof record.nextIteration === 'number' && record.nextIteration > 0 ? Math.floor(record.nextIteration) : 1,
    lastPromptKind: record.lastPromptKind === 'bootstrap'
      || record.lastPromptKind === 'iteration'
      || record.lastPromptKind === 'replenish-backlog'
      || record.lastPromptKind === 'fix-failure'
      || record.lastPromptKind === 'continue-progress'
      || record.lastPromptKind === 'human-review-handoff'
      ? record.lastPromptKind
      : null,
    lastPromptPath: typeof record.lastPromptPath === 'string' ? record.lastPromptPath : null,
    lastRun,
    runHistory,
    lastIteration,
    iterationHistory,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date().toISOString()
  };
}

async function ensureFile(target: string, content: string): Promise<void> {
  try {
    await fs.access(target);
  } catch {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, `${content.trimEnd()}\n`, 'utf8');
  }
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function readText(target: string, fallback = ''): Promise<string> {
  try {
    return await fs.readFile(target, 'utf8');
  } catch {
    return fallback;
  }
}

export interface RalphWorkspaceSnapshot {
  paths: RalphPaths;
  state: RalphWorkspaceState;
  createdPaths: string[];
  fileStatus: RalphWorkspaceFileStatus;
}

export interface RalphWorkspaceFileStatus {
  prdPath: boolean;
  progressPath: boolean;
  taskFilePath: boolean;
  stateFilePath: boolean;
  promptDir: boolean;
  runDir: boolean;
  logDir: boolean;
  artifactDir: boolean;
}

export interface RalphRuntimeArtifactCleanupSummary {
  generatedArtifacts: RalphGeneratedArtifactRetentionSummary;
  provenanceBundles: RalphProvenanceRetentionSummary;
  deletedLogFiles: string[];
}

export interface RalphRuntimeArtifactCleanupResult {
  snapshot: RalphWorkspaceSnapshot;
  cleanup: RalphRuntimeArtifactCleanupSummary;
}

export class RalphStateManager {
  public constructor(
    private readonly workspaceState: vscode.Memento,
    private readonly logger: Logger
  ) {}

  public resolvePaths(rootPath: string, config: RalphCodexConfig): RalphPaths {
    return resolveRalphPaths(rootPath, config);
  }

  public async inspectWorkspace(rootPath: string, config: RalphCodexConfig): Promise<RalphWorkspaceSnapshot> {
    const paths = this.resolvePaths(rootPath, config);
    return {
      paths,
      state: await this.loadState(rootPath, paths),
      createdPaths: [],
      fileStatus: await this.collectFileStatus(paths)
    };
  }

  public async ensureWorkspace(rootPath: string, config: RalphCodexConfig): Promise<RalphWorkspaceSnapshot> {
    const paths = this.resolvePaths(rootPath, config);
    const createdPaths: string[] = [];

    for (const dir of [paths.promptDir, paths.runDir, paths.logDir, paths.artifactDir]) {
      if (!(await pathExists(dir))) {
        createdPaths.push(dir);
      }
      await fs.mkdir(dir, { recursive: true });
    }

    if (!(await pathExists(paths.prdPath))) {
      createdPaths.push(paths.prdPath);
    }
    await ensureFile(paths.prdPath, DEFAULT_PRD);

    if (!(await pathExists(paths.progressPath))) {
      createdPaths.push(paths.progressPath);
    }
    await ensureFile(paths.progressPath, DEFAULT_PROGRESS);

    if (!(await pathExists(paths.taskFilePath))) {
      createdPaths.push(paths.taskFilePath);
      await fs.mkdir(path.dirname(paths.taskFilePath), { recursive: true });
      await fs.writeFile(paths.taskFilePath, stringifyTaskFile(createDefaultTaskFile()), 'utf8');
    }

    const stateFileExists = await pathExists(paths.stateFilePath);
    const state = await this.loadState(rootPath, paths);
    await this.saveState(rootPath, paths, state);
    if (!stateFileExists) {
      createdPaths.push(paths.stateFilePath);
    }

    return {
      paths,
      state,
      createdPaths,
      fileStatus: await this.collectFileStatus(paths)
    };
  }

  public async loadState(rootPath: string, paths: RalphPaths): Promise<RalphWorkspaceState> {
    const diskStateText = await readText(paths.stateFilePath);
    if (diskStateText.trim()) {
      try {
        return normalizeWorkspaceState(JSON.parse(diskStateText));
      } catch (error) {
        this.logger.warn('Failed to parse .ralph/state.json. Falling back to workspace storage.', {
          rootPath,
          stateFilePath: paths.stateFilePath,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    const storedState = await this.workspaceState.get<RalphWorkspaceState>(stateKey(rootPath));
    return normalizeWorkspaceState(storedState);
  }

  public async saveState(rootPath: string, paths: RalphPaths, state: RalphWorkspaceState): Promise<void> {
    const locked = await withStateLock(paths.stateFilePath, undefined, async () => {
      const normalized: RalphWorkspaceState = {
        ...state,
        version: 2,
        lastRun: state.runHistory.length > 0 ? state.runHistory[state.runHistory.length - 1] : state.lastRun,
        lastIteration: state.iterationHistory.length > 0 ? state.iterationHistory[state.iterationHistory.length - 1] : state.lastIteration,
        runHistory: state.runHistory.slice(-RUN_HISTORY_LIMIT),
        iterationHistory: state.iterationHistory.slice(-ITERATION_HISTORY_LIMIT),
        updatedAt: new Date().toISOString()
      };

      await fs.writeFile(paths.stateFilePath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
      await this.workspaceState.update(stateKey(rootPath), normalized);
    });

    if (locked.outcome === 'lock_timeout') {
      throw new Error(
        `Timed out acquiring state.lock at ${locked.lockPath} after ${locked.attempts} attempt(s).`
      );
    }
  }

  public async readObjectiveText(paths: RalphPaths): Promise<string> {
    return readText(paths.prdPath, `${DEFAULT_PRD}\n`);
  }

  public async writeObjectiveText(paths: RalphPaths, text: string): Promise<void> {
    await fs.writeFile(paths.prdPath, `${text.trimEnd()}\n`, 'utf8');
  }

  public async readProgressText(paths: RalphPaths): Promise<string> {
    return readText(paths.progressPath, `${DEFAULT_PROGRESS}\n`);
  }

  public async readTaskFileText(paths: RalphPaths): Promise<string> {
    const inspection = await this.inspectTaskFile(paths);
    if (inspection.text) {
      return inspection.text;
    }

    throw new Error(`Failed to parse Ralph task file at ${paths.taskFilePath}: ${inspection.diagnostics.map((item) => item.message).join(' ')}`);
  }

  public async inspectTaskFile(paths: RalphPaths): Promise<RalphTaskFileInspection> {
    const locked = await withTaskFileLock(paths.taskFilePath, undefined, async () => {
      const raw = await readText(paths.taskFilePath);
      if (!raw.trim()) {
        const seeded = stringifyTaskFile(createDefaultTaskFile());
        await fs.writeFile(paths.taskFilePath, seeded, 'utf8');
        return inspectTaskFileText(seeded);
      }

      const inspection = inspectTaskFileText(raw);
      if (inspection.taskFile && inspection.text && inspection.migrated) {
        await fs.writeFile(paths.taskFilePath, inspection.text, 'utf8');
      }

      return inspection;
    });

    if (locked.outcome === 'lock_timeout') {
      throw new Error(
        `Timed out acquiring tasks.json lock at ${locked.lockPath} after ${locked.attempts} attempt(s).`
      );
    }

    return locked.value;
  }

  public async readTaskFile(paths: RalphPaths): Promise<RalphTaskFile> {
    return parseTaskFile(await this.readTaskFileText(paths));
  }

  public async taskCounts(paths: RalphPaths): Promise<RalphTaskCounts> {
    return countTaskStatuses(await this.readTaskFile(paths));
  }

  public async updateTaskFile(paths: RalphPaths, transform: (taskFile: RalphTaskFile) => RalphTaskFile): Promise<RalphTaskFile> {
    const locked = await withTaskFileLock(paths.taskFilePath, undefined, async () => {
      const nextTaskFile = transform(parseTaskFile(await fs.readFile(paths.taskFilePath, 'utf8')));
      await fs.writeFile(paths.taskFilePath, stringifyTaskFile(nextTaskFile), 'utf8');
      return parseTaskFile(await fs.readFile(paths.taskFilePath, 'utf8'));
    });

    if (locked.outcome === 'lock_timeout') {
      throw new Error(
        `Timed out acquiring tasks.json lock at ${locked.lockPath} after ${locked.attempts} attempt(s).`
      );
    }

    return locked.value;
  }

  public async appendProgressBullet(paths: RalphPaths, bullet: string): Promise<void> {
    const current = await this.readProgressText(paths);
    const trimmed = bullet.trim();
    if (!trimmed) {
      return;
    }

    const nextText = `${current.trimEnd()}\n- ${trimmed}\n`;
    await fs.writeFile(paths.progressPath, nextText, 'utf8');
  }

  public async selectedTask(paths: RalphPaths, taskId: string | null): Promise<RalphTask | null> {
    return findTaskById(await this.readTaskFile(paths), taskId);
  }

  public async writePrompt(paths: RalphPaths, fileName: string, prompt: string): Promise<string> {
    const target = path.join(paths.promptDir, fileName);
    await fs.writeFile(target, `${prompt.trimEnd()}\n`, 'utf8');
    return target;
  }

  public runArtifactPaths(paths: RalphPaths, artifactBaseName: string): { transcriptPath: string; lastMessagePath: string } {
    return {
      transcriptPath: path.join(paths.runDir, `${artifactBaseName}.transcript.md`),
      lastMessagePath: path.join(paths.runDir, `${artifactBaseName}.last-message.md`)
    };
  }

  public iterationArtifactDir(paths: RalphPaths, iteration: number): string {
    return path.join(paths.artifactDir, `iteration-${String(iteration).padStart(3, '0')}`);
  }

  public async recordPrompt(
    rootPath: string,
    paths: RalphPaths,
    state: RalphWorkspaceState,
    promptKind: RalphPromptKind,
    promptPath: string,
    objectiveText: string
  ): Promise<RalphWorkspaceState> {
    const nextState: RalphWorkspaceState = {
      ...state,
      objectivePreview: summarizeObjective(objectiveText),
      lastPromptKind: promptKind,
      lastPromptPath: promptPath,
      updatedAt: new Date().toISOString()
    };

    await this.saveState(rootPath, paths, nextState);
    return nextState;
  }

  public async recordIteration(
    rootPath: string,
    paths: RalphPaths,
    state: RalphWorkspaceState,
    result: RalphIterationResult,
    objectiveText: string,
    runRecord?: RalphRunRecord
  ): Promise<RalphWorkspaceState> {
    const nextRunHistory = runRecord
      ? [...state.runHistory, runRecord].slice(-RUN_HISTORY_LIMIT)
      : state.runHistory.slice(-RUN_HISTORY_LIMIT);
    const nextIterationHistory = [...state.iterationHistory, result].slice(-ITERATION_HISTORY_LIMIT);
    const nextState: RalphWorkspaceState = {
      ...state,
      objectivePreview: summarizeObjective(objectiveText),
      nextIteration: result.iteration + 1,
      lastPromptKind: result.promptKind,
      lastPromptPath: result.promptPath,
      lastRun: runRecord ?? state.lastRun,
      runHistory: nextRunHistory,
      lastIteration: result,
      iterationHistory: nextIterationHistory,
      updatedAt: new Date().toISOString()
    };

    await this.saveState(rootPath, paths, nextState);
    return nextState;
  }

  public async recordRun(
    rootPath: string,
    paths: RalphPaths,
    state: RalphWorkspaceState,
    runRecord: RalphRunRecord,
    objectiveText: string
  ): Promise<RalphWorkspaceState> {
    const history = [...state.runHistory, runRecord].slice(-RUN_HISTORY_LIMIT);
    const nextState: RalphWorkspaceState = {
      ...state,
      objectivePreview: summarizeObjective(objectiveText),
      nextIteration: runRecord.iteration + 1,
      lastPromptKind: runRecord.promptKind,
      lastPromptPath: runRecord.promptPath,
      lastRun: runRecord,
      runHistory: history,
      updatedAt: new Date().toISOString()
    };

    await this.saveState(rootPath, paths, nextState);
    return nextState;
  }

  public async resetRuntimeState(rootPath: string, config: RalphCodexConfig): Promise<RalphWorkspaceSnapshot> {
    const paths = this.resolvePaths(rootPath, config);

    await fs.rm(paths.promptDir, { recursive: true, force: true });
    await fs.rm(paths.runDir, { recursive: true, force: true });
    await fs.rm(paths.logDir, { recursive: true, force: true });
    await fs.rm(paths.artifactDir, { recursive: true, force: true });
    await fs.rm(paths.stateFilePath, { force: true });

    await this.workspaceState.update(stateKey(rootPath), undefined);
    return this.ensureWorkspace(rootPath, config);
  }

  public async cleanupRuntimeArtifacts(
    rootPath: string,
    config: RalphCodexConfig
  ): Promise<RalphRuntimeArtifactCleanupResult> {
    const paths = this.resolvePaths(rootPath, config);
    const deletedLogFiles = await fs.readdir(paths.logDir).catch(() => []);
    const generatedArtifacts = await cleanupGeneratedArtifacts({
      artifactRootDir: paths.artifactDir,
      promptDir: paths.promptDir,
      runDir: paths.runDir,
      stateFilePath: paths.stateFilePath,
      retentionCount: 1,
      protectionScope: 'currentAndLatest'
    });
    const provenanceBundles = await cleanupProvenanceBundles({
      artifactRootDir: paths.artifactDir,
      retentionCount: 1
    });

    await fs.rm(paths.logDir, { recursive: true, force: true });

    return {
      snapshot: await this.ensureWorkspace(rootPath, config),
      cleanup: {
        generatedArtifacts,
        provenanceBundles,
        deletedLogFiles
      }
    };
  }

  public isDefaultObjective(text: string): boolean {
    return text.trim() === DEFAULT_PRD.trim();
  }

  private async collectFileStatus(paths: RalphPaths): Promise<RalphWorkspaceFileStatus> {
    const [
      prdPath,
      progressPath,
      taskFilePath,
      stateFilePath,
      promptDir,
      runDir,
      logDir,
      artifactDir
    ] = await Promise.all([
      pathExists(paths.prdPath),
      pathExists(paths.progressPath),
      pathExists(paths.taskFilePath),
      pathExists(paths.stateFilePath),
      pathExists(paths.promptDir),
      pathExists(paths.runDir),
      pathExists(paths.logDir),
      pathExists(paths.artifactDir)
    ]);

    return {
      prdPath,
      progressPath,
      taskFilePath,
      stateFilePath,
      promptDir,
      runDir,
      logDir,
      artifactDir
    };
  }
}
