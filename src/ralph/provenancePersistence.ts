import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger } from '../services/logger';
import { stableJson } from './integrity';
import {
  DEFAULT_RALPH_AGENT_ID,
  PromptCacheStats,
  RalphHandoffNote,
  RalphIntegrityFailure,
  RalphIterationResult,
  RalphPersistedPreflightReport,
  RalphPromptKind,
  RalphPromptTarget,
  RalphProvenanceBundle,
  RalphProvenanceTrustLevel,
  RalphRootPolicy,
  RalphTask,
} from './types';
import type { PreparedIterationContext, PreparedPromptContext } from './iterationPreparation';
import type { RalphStateManager } from './stateManager';
import { withTaskFileLock } from './taskFile';
import {
  cleanupGeneratedArtifacts as cleanupArtifacts,
  resolveIterationArtifactPaths,
  resolveProvenanceBundlePaths,
  writeProvenanceBundle
} from './artifactStore';

// ---------------------------------------------------------------------------
// Provenance bundle creation
// ---------------------------------------------------------------------------

export function createProvenanceBundle(input: {
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
  promptCacheStats?: PromptCacheStats | null;
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
    provenanceFailureSummaryPath = null,
    promptCacheStats = null
  } = input;

  return {
    schemaVersion: 1,
    kind: 'provenanceBundle',
    agentId: prepared.config.agentId,
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
    promptCacheStats,
    createdAt: prepared.executionPlan.createdAt,
    updatedAt: new Date().toISOString()
  };
}

// ---------------------------------------------------------------------------
// Provenance bundle persistence helpers
// ---------------------------------------------------------------------------

export async function persistPreparedProvenanceBundle(
  prepared: PreparedPromptContext,
  logger: Logger
): Promise<void> {
  const bundle = createProvenanceBundle({
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
    logger.info('Cleaned up old Ralph provenance bundles after prepare.', {
      deletedBundleIds: writeResult.retention.deletedBundleIds,
      retentionCount: prepared.config.provenanceBundleRetentionCount
    });
  }

  await cleanupGeneratedArtifactsHelper(prepared.paths, prepared.config.generatedArtifactRetentionCount, 'prepare', logger);
}

export async function persistBlockedPreflightBundle(input: {
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
}, logger: Logger): Promise<void> {
  const provenanceBundlePaths = resolveProvenanceBundlePaths(input.paths.artifactDir, input.provenanceId);
  const bundle: RalphProvenanceBundle = {
    schemaVersion: 1,
    kind: 'provenanceBundle',
    agentId: input.persistedPreflightReport.agentId,
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
    logger.info('Cleaned up old Ralph provenance bundles after blocked preflight.', {
      deletedBundleIds: writeResult.retention.deletedBundleIds
    });
  }

  await cleanupGeneratedArtifactsHelper(input.paths, input.generatedArtifactRetentionCount, 'blocked preflight', logger);
}

export interface IntegrityFailureDetails {
  stage: RalphIntegrityFailure['stage'];
  message: string;
  expectedExecutionPlanHash: string | null;
  actualExecutionPlanHash: string | null;
  expectedPromptHash: string | null;
  actualPromptHash: string | null;
  expectedPayloadHash: string | null;
  actualPayloadHash: string | null;
}

export async function persistIntegrityFailureBundle(
  prepared: PreparedIterationContext,
  failureDetails: IntegrityFailureDetails,
  logger: Logger
): Promise<void> {
  const failure: RalphIntegrityFailure = {
    schemaVersion: 1,
    kind: 'integrityFailure',
    provenanceId: prepared.provenanceId,
    iteration: prepared.iteration,
    promptKind: prepared.promptKind,
    promptTarget: prepared.promptTarget,
    trustLevel: prepared.trustLevel,
    stage: failureDetails.stage,
    blocked: true,
    summary: `Blocked before launch because ${failureDetails.stage} verification failed.`,
    message: failureDetails.message,
    artifactDir: resolveIterationArtifactPaths(prepared.paths.artifactDir, prepared.iteration).directory,
    executionPlanPath: prepared.executionPlanPath,
    promptArtifactPath: prepared.executionPlan.promptArtifactPath,
    cliInvocationPath: null,
    expectedExecutionPlanHash: failureDetails.expectedExecutionPlanHash,
    actualExecutionPlanHash: failureDetails.actualExecutionPlanHash,
    expectedPromptHash: failureDetails.expectedPromptHash,
    actualPromptHash: failureDetails.actualPromptHash,
    expectedPayloadHash: failureDetails.expectedPayloadHash,
    actualPayloadHash: failureDetails.actualPayloadHash,
    createdAt: new Date().toISOString()
  };
  const bundle = createProvenanceBundle({
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
    logger.info('Cleaned up old Ralph provenance bundles after integrity failure.', {
      deletedBundleIds: writeResult.retention.deletedBundleIds,
      retentionCount: prepared.config.provenanceBundleRetentionCount
    });
  }

  await cleanupGeneratedArtifactsHelper(prepared.paths, prepared.config.generatedArtifactRetentionCount, 'integrity failure', logger);
}

export async function cleanupGeneratedArtifactsHelper(
  paths: ReturnType<RalphStateManager['resolvePaths']>,
  retentionCount: number,
  stage: string,
  logger: Logger
): Promise<void> {
  const retention = await cleanupArtifacts({
    artifactRootDir: paths.artifactDir,
    promptDir: paths.promptDir,
    runDir: paths.runDir,
    handoffDir: paths.handoffDir,
    stateFilePath: paths.stateFilePath,
    retentionCount
  });

  if (retention.deletedIterationDirectories.length === 0
    && retention.deletedPromptFiles.length === 0
    && retention.deletedRunArtifactBaseNames.length === 0
    && (retention.deletedHandoffFiles?.length ?? 0) === 0) {
    return;
  }

  logger.info(`Cleaned up generated Ralph artifacts after ${stage}.`, {
    retentionCount,
    deletedIterationDirectories: retention.deletedIterationDirectories,
    protectedRetainedIterationDirectories: retention.protectedRetainedIterationDirectories,
    deletedPromptFiles: retention.deletedPromptFiles,
    protectedRetainedPromptFiles: retention.protectedRetainedPromptFiles,
    deletedRunArtifactBaseNames: retention.deletedRunArtifactBaseNames,
    protectedRetainedRunArtifactBaseNames: retention.protectedRetainedRunArtifactBaseNames,
    deletedHandoffFiles: retention.deletedHandoffFiles ?? []
  });
}

// ---------------------------------------------------------------------------
// Loop termination handoff
// ---------------------------------------------------------------------------

const CLEAN_TERMINAL_HANDOFF_STOP_REASONS = new Set<string>([
  'task_marked_complete',
  'iteration_cap_reached',
  'control_plane_reload_required',
  'human_review_needed',
  'no_actionable_task',
  'verification_passed_no_remaining_subtasks'
]);

export function isCleanTerminalHandoffStopReason(
  stopReason: string | null | undefined
): boolean {
  return typeof stopReason === 'string' && CLEAN_TERMINAL_HANDOFF_STOP_REASONS.has(stopReason);
}

function buildHandoffHumanSummary(note: Omit<RalphHandoffNote, 'humanSummary'>): string {
  const taskLabel = note.selectedTaskId
    ? `${note.selectedTaskId}${note.selectedTaskTitle ? ` (${note.selectedTaskTitle})` : ''}`
    : 'No selected task';
  const detail = note.progressNote
    ?? note.pendingBlocker
    ?? note.validationFailureSignature
    ?? note.completionClassification;
  return `${taskLabel} stopped with ${note.stopReason}. ${detail}`.trim();
}

async function writeAtomicJsonFile(targetPath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const temporaryPath = `${targetPath}.tmp`;
  await fs.writeFile(temporaryPath, stableJson(value), 'utf8');
  await fs.rename(temporaryPath, targetPath);
}

export async function writeLoopTerminationHandoff(input: {
  paths: ReturnType<RalphStateManager['resolvePaths']>;
  result: RalphIterationResult;
  progressNote: string | null;
  pendingBlocker: string | null;
}): Promise<void> {
  if (!isCleanTerminalHandoffStopReason(input.result.stopReason)) {
    return;
  }

  const note: Omit<RalphHandoffNote, 'humanSummary'> = {
    agentId: input.result.agentId ?? DEFAULT_RALPH_AGENT_ID,
    iteration: input.result.iteration,
    selectedTaskId: input.result.selectedTaskId,
    selectedTaskTitle: input.result.selectedTaskTitle,
    stopReason: input.result.stopReason!,
    completionClassification: input.result.completionClassification,
    progressNote: input.progressNote ?? undefined,
    pendingBlocker: input.pendingBlocker ?? undefined,
    validationFailureSignature: input.result.verification.validationFailureSignature ?? undefined,
    backlog: input.result.backlog
  };

  await writeAtomicJsonFile(
    path.join(input.paths.handoffDir, `${note.agentId}-${String(note.iteration).padStart(3, '0')}.json`),
    {
      ...note,
      humanSummary: buildHandoffHumanSummary(note)
    } satisfies RalphHandoffNote
  );
}

// ---------------------------------------------------------------------------
// Agent identity record
// ---------------------------------------------------------------------------

interface RalphAgentIdentityRecord {
  agentId: string;
  firstSeenAt: string;
  completedTaskIds: string[];
  touchedFiles: string[];
}

function normalizeAgentIdentityRecord(
  candidate: unknown,
  agentId: string,
  firstSeenAt: string
): RalphAgentIdentityRecord {
  if (typeof candidate !== 'object' || candidate === null) {
    return {
      agentId,
      firstSeenAt,
      completedTaskIds: [],
      touchedFiles: []
    };
  }

  const record = candidate as Record<string, unknown>;
  const completedTaskIds = Array.isArray(record.completedTaskIds)
    ? record.completedTaskIds.filter((item): item is string => typeof item === 'string')
    : [];
  const touchedFiles = Array.isArray(record.touchedFiles)
    ? record.touchedFiles.filter((item): item is string => typeof item === 'string')
    : [];

  return {
    agentId,
    firstSeenAt: typeof record.firstSeenAt === 'string' && record.firstSeenAt.trim().length > 0
      ? record.firstSeenAt
      : firstSeenAt,
    completedTaskIds,
    touchedFiles
  };
}

function uniqueSorted(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0))).sort((left, right) => left.localeCompare(right));
}

export async function updateAgentIdentityRecord(input: {
  rootPath: string;
  agentId: string;
  startedAt: string;
  selectedTaskId: string | null;
  selectedTaskCompleted: boolean;
  diffSummary: { changedFiles?: string[] } | null;
}): Promise<void> {
  const agentDirectoryPath = path.join(input.rootPath, '.ralph', 'agents');
  const recordPath = path.join(agentDirectoryPath, `${input.agentId}.json`);

  await fs.mkdir(agentDirectoryPath, { recursive: true });
  const locked = await withTaskFileLock(recordPath, undefined, async () => {
    let existing: unknown = null;

    try {
      existing = JSON.parse(await fs.readFile(recordPath, 'utf8')) as unknown;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        throw error;
      }
    }

    const record = normalizeAgentIdentityRecord(existing, input.agentId, input.startedAt);
    const completedTaskIds = [...record.completedTaskIds];
    if (input.selectedTaskCompleted && input.selectedTaskId) {
      completedTaskIds.push(input.selectedTaskId);
    }

    const nextRecord: RalphAgentIdentityRecord = {
      agentId: input.agentId,
      firstSeenAt: record.firstSeenAt,
      completedTaskIds,
      touchedFiles: uniqueSorted([
        ...record.touchedFiles,
        ...(input.diffSummary?.changedFiles ?? [])
      ])
    };

    const tempPath = path.join(agentDirectoryPath, `${input.agentId}.${process.pid}.${Date.now()}.tmp`);
    await fs.writeFile(tempPath, `${JSON.stringify(nextRecord, null, 2)}\n`, 'utf8');
    await fs.rm(recordPath, { force: true });
    await fs.rename(tempPath, recordPath);
  });

  if (locked.outcome === 'lock_timeout') {
    throw new Error(
      `Timed out acquiring agent record lock for ${input.agentId} after ${locked.attempts} attempt(s).`
    );
  }
}
