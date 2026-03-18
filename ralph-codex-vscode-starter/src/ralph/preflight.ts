import * as fs from 'fs/promises';
import * as path from 'path';
import { RalphCodexConfig } from '../config/types';
import { CliSupportResult, CodexCliSupport, CodexIdeCommandSupport } from '../services/codexCliSupport';
import { RalphWorkspaceFileStatus } from './stateManager';
import { RalphTaskClaimGraphInspection, RalphTaskFileInspection } from './taskFile';
import {
  inspectGeneratedArtifactRetention,
  inspectProvenanceBundleRetention,
  PROTECTED_GENERATED_LATEST_POINTER_REFERENCES,
  resolveLatestArtifactPaths
} from './artifactStore';
import {
  RalphPreflightCategory,
  RalphPreflightDiagnostic,
  RalphPreflightReport,
  RalphTask,
  RalphTaskCounts,
  RalphValidationCommandReadiness
} from './types';
import { DEFAULT_CLAIM_TTL_MS } from './taskFile';

const CATEGORY_LABELS: Record<RalphPreflightCategory, string> = {
  taskGraph: 'Task graph',
  claimGraph: 'Claim graph',
  workspaceRuntime: 'Workspace/runtime',
  codexAdapter: 'Codex adapter',
  validationVerifier: 'Validation/verifier',
  agentHealth: 'Agent Health'
};

const DEFAULT_STALE_LOCK_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

function createDiagnostic(
  category: RalphPreflightCategory,
  severity: RalphPreflightDiagnostic['severity'],
  code: string,
  message: string,
  details: Pick<RalphPreflightDiagnostic, 'taskId' | 'relatedTaskIds' | 'location' | 'relatedLocations'> = {}
): RalphPreflightDiagnostic {
  return {
    category,
    severity,
    code,
    message,
    ...details
  };
}

function relativePath(rootPath: string, target: string): string {
  return path.relative(rootPath, target) || '.';
}

function sectionSummary(category: RalphPreflightCategory, diagnostics: RalphPreflightDiagnostic[]): string {
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length;
  const warnings = diagnostics.filter((diagnostic) => diagnostic.severity === 'warning').length;
  const infos = diagnostics.filter((diagnostic) => diagnostic.severity === 'info').length;
  const parts: string[] = [];

  if (errors > 0) {
    parts.push(`${errors} error${errors === 1 ? '' : 's'}`);
  }
  if (warnings > 0) {
    parts.push(`${warnings} warning${warnings === 1 ? '' : 's'}`);
  }
  if (infos > 0) {
    parts.push(`${infos} info`);
  }

  return `${CATEGORY_LABELS[category]}: ${parts.join(', ') || 'ok'}`;
}

function sortDiagnostics(diagnostics: RalphPreflightDiagnostic[]): RalphPreflightDiagnostic[] {
  const severityRank = new Map<RalphPreflightDiagnostic['severity'], number>([
    ['error', 0],
    ['warning', 1],
    ['info', 2]
  ]);

  return [...diagnostics].sort((left, right) => {
    const leftRank = severityRank.get(left.severity) ?? 99;
    const rightRank = severityRank.get(right.severity) ?? 99;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    if (left.category !== right.category) {
      return left.category.localeCompare(right.category);
    }

    return left.message.localeCompare(right.message);
  });
}

function summarizeTaskSelection(
  selectedTask: RalphTask | null,
  diagnostics: readonly RalphPreflightDiagnostic[]
): string {
  if (selectedTask) {
    return `Selected task ${selectedTask.id}.`;
  }

  const taskLedgerDrift = diagnostics.find((diagnostic) => (
    diagnostic.category === 'taskGraph' && diagnostic.severity === 'error'
  ));

  if (taskLedgerDrift) {
    return `No task selected because task-ledger drift blocks safe selection: ${taskLedgerDrift.message}`;
  }

  return 'No task selected.';
}

export interface RalphPreflightInput {
  rootPath: string;
  workspaceTrusted: boolean;
  config: RalphCodexConfig;
  taskInspection: RalphTaskFileInspection;
  taskCounts: RalphTaskCounts | null;
  selectedTask: RalphTask | null;
  currentProvenanceId?: string | null;
  claimGraph?: RalphTaskClaimGraphInspection | null;
  taskValidationHint: string | null;
  validationCommand: string | null;
  normalizedValidationCommandFrom: string | null;
  validationCommandReadiness: RalphValidationCommandReadiness;
  fileStatus: RalphWorkspaceFileStatus;
  createdPaths?: string[];
  codexCliSupport?: CodexCliSupport | null;
  ideCommandSupport?: CodexIdeCommandSupport | null;
  artifactReadinessDiagnostics?: RalphPreflightExternalDiagnostic[];
  agentHealthDiagnostics?: RalphPreflightExternalDiagnostic[];
}

export interface RalphPreflightExternalDiagnostic {
  severity: RalphPreflightDiagnostic['severity'];
  code: string;
  message: string;
}

export interface RalphPreflightArtifactReadinessInput {
  rootPath: string;
  artifactRootDir: string;
  promptDir: string;
  runDir: string;
  stateFilePath: string;
  generatedArtifactRetentionCount: number;
  provenanceBundleRetentionCount: number;
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function readJsonRecord(target: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await fs.readFile(target, 'utf8');
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function pathOverlaps(left: string, right: string): boolean {
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  const leftRelative = path.relative(normalizedLeft, normalizedRight);
  const rightRelative = path.relative(normalizedRight, normalizedLeft);

  return (!leftRelative.startsWith('..') && !path.isAbsolute(leftRelative))
    || (!rightRelative.startsWith('..') && !path.isAbsolute(rightRelative));
}

function derivedPromptEvidenceReferences(record: Record<string, unknown> | null, dirs: {
  artifactRootDir: string;
  promptDir: string;
}): string[] {
  const kind = typeof record?.kind === 'string' ? record.kind : null;
  const iteration = typeof record?.iteration === 'number' && Number.isFinite(record.iteration) && record.iteration >= 1
    ? Math.floor(record.iteration)
    : null;
  if (!kind || iteration === null) {
    return [];
  }

  const paddedIteration = String(iteration).padStart(3, '0');
  return [
    path.join(dirs.artifactRootDir, `iteration-${paddedIteration}`),
    path.join(dirs.promptDir, `${kind}-${paddedIteration}.prompt.md`)
  ];
}

function basenameList(rootPath: string, targets: string[]): string {
  return targets
    .map((target) => relativePath(rootPath, target))
    .join(', ');
}

export interface CheckStaleStateInput {
  stateFilePath: string;
  taskFilePath: string;
  claimFilePath: string;
  artifactDir: string;
  staleLockThresholdMs?: number;
  staleClaimTtlMs?: number;
  now?: Date;
}

export async function checkStaleState(
  input: CheckStaleStateInput
): Promise<RalphPreflightExternalDiagnostic[]> {
  const diagnostics: RalphPreflightExternalDiagnostic[] = [];
  const now = input.now ?? new Date();
  const staleLockThresholdMs = input.staleLockThresholdMs ?? DEFAULT_STALE_LOCK_THRESHOLD_MS;
  const staleClaimTtlMs = input.staleClaimTtlMs ?? DEFAULT_CLAIM_TTL_MS;

  // (1) Check state.lock
  const stateLockPath = path.join(path.dirname(input.stateFilePath), 'state.lock');
  try {
    const stat = await fs.stat(stateLockPath);
    const ageMs = now.getTime() - stat.mtimeMs;
    if (ageMs > staleLockThresholdMs) {
      const ageSec = Math.round(ageMs / 1000);
      diagnostics.push({
        severity: 'warning',
        code: 'stale_state_lock',
        message: `state.lock is ${ageSec}s old (threshold ${Math.round(staleLockThresholdMs / 1000)}s). Remove it manually if no iteration is in progress.`
      });
    }
  } catch {
    // lock file absent — expected during normal operation
  }

  // (2) Check tasks.lock
  const tasksLockPath = path.join(path.dirname(input.taskFilePath), 'tasks.lock');
  try {
    const stat = await fs.stat(tasksLockPath);
    const ageMs = now.getTime() - stat.mtimeMs;
    if (ageMs > staleLockThresholdMs) {
      const ageSec = Math.round(ageMs / 1000);
      diagnostics.push({
        severity: 'warning',
        code: 'stale_tasks_lock',
        message: `tasks.lock is ${ageSec}s old (threshold ${Math.round(staleLockThresholdMs / 1000)}s). Remove it manually if no iteration is in progress.`
      });
    }
  } catch {
    // lock file absent — expected during normal operation
  }

  // Read claims.json for active-claim checks
  const claimsRecord = await readJsonRecord(input.claimFilePath);
  if (!claimsRecord) {
    return diagnostics;
  }

  const rawClaims = Array.isArray(claimsRecord.claims) ? claimsRecord.claims : [];
  const activeClaims = rawClaims.filter(
    (c): c is Record<string, unknown> =>
      typeof c === 'object' && c !== null && (c as Record<string, unknown>).status === 'active'
  );

  if (activeClaims.length === 0) {
    return diagnostics;
  }

  // Find the mtime of the most recent iteration-result.json in artifactDir
  let latestResultMtimeMs: number | null = null;
  try {
    const entries = await fs.readdir(input.artifactDir, { withFileTypes: true });
    await Promise.all(
      entries
        .filter((e) => e.isDirectory() && e.name.startsWith('iteration-'))
        .map(async (e) => {
          const resultPath = path.join(input.artifactDir, e.name, 'iteration-result.json');
          try {
            const stat = await fs.stat(resultPath);
            if (latestResultMtimeMs === null || stat.mtimeMs > latestResultMtimeMs) {
              latestResultMtimeMs = stat.mtimeMs;
            }
          } catch {
            // no result file in this dir
          }
        })
    );
  } catch {
    // artifactDir absent or unreadable
  }

  // Read state.json lastRun.finishedAt for offline detection
  const stateRecord = await readJsonRecord(input.stateFilePath);
  const lastRunRecord = typeof stateRecord?.lastRun === 'object' && stateRecord.lastRun !== null
    ? stateRecord.lastRun as Record<string, unknown>
    : null;
  const lastRunFinishedAt = typeof lastRunRecord?.finishedAt === 'string' ? lastRunRecord.finishedAt : null;
  const lastRunTimeMs = lastRunFinishedAt ? new Date(lastRunFinishedAt).getTime() : null;

  for (const claim of activeClaims) {
    const claimedAt = typeof claim.claimedAt === 'string' ? claim.claimedAt : null;
    const agentId = typeof claim.agentId === 'string' ? claim.agentId : 'unknown';
    const taskId = typeof claim.taskId === 'string' ? claim.taskId : 'unknown';

    if (!claimedAt) {
      continue;
    }

    const claimTimeMs = new Date(claimedAt).getTime();
    if (isNaN(claimTimeMs)) {
      continue;
    }

    const claimAgeMs = now.getTime() - claimTimeMs;
    if (claimAgeMs <= staleClaimTtlMs) {
      continue; // claim is within TTL — not stale
    }

    const claimAgeSec = Math.round(claimAgeMs / 1000);

    // (3) No iteration result found after claim time
    const hasResultAfterClaim = latestResultMtimeMs !== null && latestResultMtimeMs > claimTimeMs;
    if (!hasResultAfterClaim) {
      diagnostics.push({
        severity: 'warning',
        code: 'stale_active_claim_no_result',
        message: `Active claim by ${agentId} on task ${taskId} is ${claimAgeSec}s old (since ${claimedAt}) with no iteration result found after claim time.`
      });
    }

    // (4) No recent state.json lastRun — agent may be offline
    const hasRecentLastRun = lastRunTimeMs !== null && lastRunTimeMs > claimTimeMs;
    if (!hasRecentLastRun) {
      diagnostics.push({
        severity: 'warning',
        code: 'stale_active_claim_agent_offline',
        message: `Active claim by ${agentId} on task ${taskId} is ${claimAgeSec}s old with no state.json lastRun after claim time; agent may be offline.`
      });
    }
  }

  return diagnostics;
}

export async function inspectPreflightArtifactReadiness(
  input: RalphPreflightArtifactReadinessInput
): Promise<RalphPreflightExternalDiagnostic[]> {
  const diagnostics: RalphPreflightExternalDiagnostic[] = [];
  const latestPaths = resolveLatestArtifactPaths(input.artifactRootDir);
  const [
    latestResultRecord,
    latestPreflightRecord,
    latestPromptEvidenceRecord,
    latestExecutionPlanRecord,
    latestCliInvocationRecord,
    latestProvenanceBundleRecord,
    latestProvenanceFailureRecord,
    latestSummaryExists,
    latestPreflightSummaryExists,
    latestProvenanceSummaryExists,
    generatedArtifactRetention,
    provenanceBundleRetention
  ] = await Promise.all([
    readJsonRecord(latestPaths.latestResultPath),
    readJsonRecord(latestPaths.latestPreflightReportPath),
    readJsonRecord(latestPaths.latestPromptEvidencePath),
    readJsonRecord(latestPaths.latestExecutionPlanPath),
    readJsonRecord(latestPaths.latestCliInvocationPath),
    readJsonRecord(latestPaths.latestProvenanceBundlePath),
    readJsonRecord(latestPaths.latestProvenanceFailurePath),
    pathExists(latestPaths.latestSummaryPath),
    pathExists(latestPaths.latestPreflightSummaryPath),
    pathExists(latestPaths.latestProvenanceSummaryPath),
    inspectGeneratedArtifactRetention({
      artifactRootDir: input.artifactRootDir,
      promptDir: input.promptDir,
      runDir: input.runDir,
      stateFilePath: input.stateFilePath,
      retentionCount: input.generatedArtifactRetentionCount
    }),
    inspectProvenanceBundleRetention({
      artifactRootDir: input.artifactRootDir,
      retentionCount: input.provenanceBundleRetentionCount
    })
  ]);

  const staleLatestArtifactPaths: string[] = [];
  if (latestResultRecord && !latestSummaryExists) {
    staleLatestArtifactPaths.push(latestPaths.latestSummaryPath);
  }
  if (latestPreflightRecord && !latestPreflightSummaryExists) {
    staleLatestArtifactPaths.push(latestPaths.latestPreflightSummaryPath);
  }
  if (latestProvenanceBundleRecord && !latestProvenanceSummaryExists) {
    staleLatestArtifactPaths.push(latestPaths.latestProvenanceSummaryPath);
  }
  if (staleLatestArtifactPaths.length > 0) {
    diagnostics.push({
      severity: 'warning',
      code: 'latest_artifact_surfaces_stale',
      message: `Latest artifact surfaces are stale or missing: ${basenameList(input.rootPath, staleLatestArtifactPaths)}.`
    });
  }

  const latestRecords: Array<{
    latestArtifactPath: string;
    record: Record<string, unknown> | null;
    fields: readonly string[];
  }> = [
    {
      latestArtifactPath: latestPaths.latestResultPath,
      record: latestResultRecord,
      fields: PROTECTED_GENERATED_LATEST_POINTER_REFERENCES['latest-result.json']
    },
    {
      latestArtifactPath: latestPaths.latestPreflightReportPath,
      record: latestPreflightRecord,
      fields: PROTECTED_GENERATED_LATEST_POINTER_REFERENCES['latest-preflight-report.json']
    },
    {
      latestArtifactPath: latestPaths.latestExecutionPlanPath,
      record: latestExecutionPlanRecord,
      fields: PROTECTED_GENERATED_LATEST_POINTER_REFERENCES['latest-execution-plan.json']
    },
    {
      latestArtifactPath: latestPaths.latestCliInvocationPath,
      record: latestCliInvocationRecord,
      fields: PROTECTED_GENERATED_LATEST_POINTER_REFERENCES['latest-cli-invocation.json']
    },
    {
      latestArtifactPath: latestPaths.latestProvenanceBundlePath,
      record: latestProvenanceBundleRecord,
      fields: PROTECTED_GENERATED_LATEST_POINTER_REFERENCES['latest-provenance-bundle.json']
    },
    {
      latestArtifactPath: latestPaths.latestProvenanceFailurePath,
      record: latestProvenanceFailureRecord,
      fields: PROTECTED_GENERATED_LATEST_POINTER_REFERENCES['latest-provenance-failure.json']
    }
  ];
  const missingPointerTargets: string[] = [];
  await Promise.all(latestRecords.map(async ({ latestArtifactPath, record, fields }) => {
    if (!record) {
      return;
    }

    const targetPaths = fields
      .map((field) => record[field])
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
    const missingTargets = (await Promise.all(targetPaths.map(async (targetPath) =>
      await pathExists(targetPath) ? null : targetPath
    ))).filter((value): value is string => value !== null);
    if (missingTargets.length > 0) {
      missingPointerTargets.push(
        `${path.basename(latestArtifactPath)} -> ${basenameList(input.rootPath, missingTargets)}`
      );
    }
  }));
  const promptEvidenceTargets = derivedPromptEvidenceReferences(latestPromptEvidenceRecord, {
    artifactRootDir: input.artifactRootDir,
    promptDir: input.promptDir
  });
  const missingPromptEvidenceTargets = (await Promise.all(promptEvidenceTargets.map(async (targetPath) =>
    await pathExists(targetPath) ? null : targetPath
  ))).filter((value): value is string => value !== null);
  if (missingPromptEvidenceTargets.length > 0) {
    missingPointerTargets.push(
      `latest-prompt-evidence.json -> ${basenameList(input.rootPath, missingPromptEvidenceTargets)}`
    );
  }
  if (missingPointerTargets.length > 0) {
    diagnostics.push({
      severity: 'warning',
      code: 'latest_artifact_pointer_targets_missing',
      message: `Latest artifact pointers reference missing files: ${missingPointerTargets.join(' | ')}.`
    });
  }

  const overlappingRoots = [
    ['artifact retention', input.artifactRootDir, 'prompt', input.promptDir],
    ['artifact retention', input.artifactRootDir, 'run', input.runDir]
  ].filter((entry) => pathOverlaps(entry[1], entry[3]));
  if (overlappingRoots.length > 0) {
    diagnostics.push({
      severity: 'warning',
      code: 'artifact_cleanup_root_overlap',
      message: `Artifact cleanup roots overlap and cleanup cannot prune safely: ${overlappingRoots
        .map(([leftLabel, leftPath, rightLabel, rightPath]) =>
          `${leftLabel} ${relativePath(input.rootPath, leftPath)} with ${rightLabel} ${relativePath(input.rootPath, rightPath)}`)
        .join(' | ')}.`
    });
  }

  if (input.generatedArtifactRetentionCount <= 0
    && (generatedArtifactRetention.retainedIterationDirectories.length > 0
      || generatedArtifactRetention.retainedPromptFiles.length > 0
      || generatedArtifactRetention.retainedRunArtifactBaseNames.length > 0)) {
    diagnostics.push({
      severity: 'warning',
      code: 'generated_artifact_retention_disabled',
      message: `Generated-artifact cleanup is disabled, so older prompts, runs, and iteration directories will accumulate under ${relativePath(input.rootPath, input.artifactRootDir)} and .ralph until removed manually.`
    });
  }

  if (input.provenanceBundleRetentionCount <= 0 && provenanceBundleRetention.retainedBundleIds.length > 0) {
    diagnostics.push({
      severity: 'warning',
      code: 'provenance_bundle_retention_disabled',
      message: 'Provenance-bundle cleanup is disabled, so older run bundles will accumulate until removed manually.'
    });
  }

  if (input.generatedArtifactRetentionCount > 0
    && (generatedArtifactRetention.protectedRetainedIterationDirectories.length > 0
      || generatedArtifactRetention.protectedRetainedPromptFiles.length > 0
      || generatedArtifactRetention.protectedRetainedRunArtifactBaseNames.length > 0)) {
    diagnostics.push({
      severity: 'info',
      code: 'generated_artifact_retention_protected_overflow',
      message: `Generated-artifact retention currently keeps older protected references beyond the newest ${input.generatedArtifactRetentionCount}: iterations ${generatedArtifactRetention.protectedRetainedIterationDirectories.length}, prompts ${generatedArtifactRetention.protectedRetainedPromptFiles.length}, runs ${generatedArtifactRetention.protectedRetainedRunArtifactBaseNames.length}.`
    });
  }

  if (input.provenanceBundleRetentionCount > 0 && provenanceBundleRetention.protectedBundleIds.length > 0) {
    diagnostics.push({
      severity: 'info',
      code: 'provenance_bundle_retention_protected_overflow',
      message: `Bundle retention currently keeps ${provenanceBundleRetention.protectedBundleIds.length} older protected run bundle${provenanceBundleRetention.protectedBundleIds.length === 1 ? '' : 's'} beyond the newest ${input.provenanceBundleRetentionCount}.`
    });
  }

  return diagnostics;
}

export function buildPreflightReport(input: RalphPreflightInput): RalphPreflightReport {
  const diagnostics: RalphPreflightDiagnostic[] = [...input.taskInspection.diagnostics];
  const currentProvenanceId = input.currentProvenanceId?.trim() || null;

  for (const claimEntry of input.claimGraph?.tasks ?? []) {
    if (claimEntry.contested) {
      diagnostics.push(createDiagnostic(
        'claimGraph',
        'warning',
        'task_claim_contested',
        `Task ${claimEntry.taskId} has contested active claims: ${claimEntry.activeClaims
          .map((activeClaim) => `${activeClaim.claim.agentId}/${activeClaim.claim.provenanceId}`)
          .join(', ')}.`,
        { taskId: claimEntry.taskId }
      ));
    }

    const canonicalClaim = claimEntry.canonicalClaim;
    if (!canonicalClaim) {
      continue;
    }

    if (canonicalClaim.stale) {
      diagnostics.push(createDiagnostic(
        'claimGraph',
        'warning',
        'task_claim_stale',
        `Task ${claimEntry.taskId} is held by ${canonicalClaim.claim.agentId}/${canonicalClaim.claim.provenanceId} but the active claim is stale from ${canonicalClaim.claim.claimedAt}.`,
        { taskId: claimEntry.taskId }
      ));
    }

    if (currentProvenanceId && canonicalClaim.claim.provenanceId !== currentProvenanceId) {
      diagnostics.push(createDiagnostic(
        'claimGraph',
        'info',
        'task_claim_provenance_mismatch',
        `Task ${claimEntry.taskId} is currently claimed by ${canonicalClaim.claim.agentId}/${canonicalClaim.claim.provenanceId}, not the current iteration provenance ${currentProvenanceId}.`,
        { taskId: claimEntry.taskId }
      ));
    }
  }

  if (input.claimGraph?.latestResolvedClaim?.claim.resolvedAt && input.claimGraph.latestResolvedClaim.claim.resolutionReason) {
    const resolvedClaim = input.claimGraph.latestResolvedClaim.claim;
    diagnostics.push(createDiagnostic(
      'claimGraph',
      'info',
      'stale_claim_resolved',
      `Task ${resolvedClaim.taskId} claim ${resolvedClaim.agentId}/${resolvedClaim.provenanceId} was marked ${resolvedClaim.status} at ${resolvedClaim.resolvedAt} because ${resolvedClaim.resolutionReason}.`,
      { taskId: resolvedClaim.taskId }
    ));
  }

  for (const diagnostic of input.artifactReadinessDiagnostics ?? []) {
    diagnostics.push(createDiagnostic(
      'workspaceRuntime',
      diagnostic.severity,
      diagnostic.code,
      diagnostic.message
    ));
  }

  for (const diagnostic of input.agentHealthDiagnostics ?? []) {
    diagnostics.push(createDiagnostic(
      'agentHealth',
      diagnostic.severity,
      diagnostic.code,
      diagnostic.message
    ));
  }

  if (!input.workspaceTrusted) {
    diagnostics.push(createDiagnostic(
      'workspaceRuntime',
      'info',
      'workspace_untrusted',
      'Workspace is not trusted; only read-only Ralph status inspection is supported.'
    ));
  }

  const missingFiles = [
    input.fileStatus.prdPath ? null : 'PRD',
    input.fileStatus.progressPath ? null : 'progress log',
    input.fileStatus.taskFilePath ? null : 'task file'
  ].filter((value): value is string => value !== null);

  if (missingFiles.length > 0) {
    diagnostics.push(createDiagnostic(
      'workspaceRuntime',
      'warning',
      'ralph_files_missing',
      `Missing Ralph workspace files: ${missingFiles.join(', ')}.`
    ));
  }

  if ((input.createdPaths ?? []).length > 0) {
    diagnostics.push(createDiagnostic(
      'workspaceRuntime',
      'info',
      'workspace_paths_initialized',
      `Initialized Ralph paths: ${input.createdPaths!.map((target) => relativePath(input.rootPath, target)).join(', ')}.`
    ));
  }

  if (input.taskInspection.taskFile && input.selectedTask === null) {
    const counts = input.taskCounts;
    if (counts && (counts.todo > 0 || counts.in_progress > 0 || counts.blocked > 0)) {
      diagnostics.push(createDiagnostic(
        'workspaceRuntime',
        'warning',
        'no_actionable_task',
        'No actionable task is currently selectable. Check blocked tasks and incomplete dependencies.'
      ));
    }
  }

  if (input.codexCliSupport) {
    const cliSupport = input.codexCliSupport as CodexCliSupport & { provider?: string; configKey?: string };
    const providerLabel = cliSupport.provider === 'claude' ? 'Claude' : 'Codex';
    const configKey = cliSupport.configKey ?? 'ralphCodex.codexCommandPath';
    if (input.codexCliSupport.check === 'pathMissing') {
      diagnostics.push(createDiagnostic(
        'codexAdapter',
        'error',
        'codex_cli_missing',
        `Configured ${providerLabel} CLI path does not exist: ${input.codexCliSupport.commandPath}. Update ${configKey}.`
      ));
    } else if (input.codexCliSupport.check === 'pathNotExecutable') {
      diagnostics.push(createDiagnostic(
        'codexAdapter',
        'error',
        'codex_cli_not_executable',
        `Configured ${providerLabel} CLI path is not executable: ${input.codexCliSupport.commandPath}.`
      ));
    } else if (input.codexCliSupport.check === 'pathLookupAssumed') {
      diagnostics.push(createDiagnostic(
        'codexAdapter',
        'warning',
        'codex_cli_path_lookup_assumed',
        `${providerLabel} CLI will be resolved from PATH at runtime: ${input.codexCliSupport.commandPath}. Availability is assumed until execution starts.`
      ));
    } else if (input.codexCliSupport.check === 'pathVerifiedExecutable') {
      diagnostics.push(createDiagnostic(
        'codexAdapter',
        'info',
        'codex_cli_path_verified',
        `Configured ${providerLabel} CLI executable was verified: ${input.codexCliSupport.commandPath}.`
      ));
    }
  }

  if (input.ideCommandSupport?.status === 'unavailable') {
    const missingCommands = input.ideCommandSupport.missingCommandIds
      .filter((commandId) => commandId && commandId !== 'none');
    diagnostics.push(createDiagnostic(
      'codexAdapter',
      'warning',
      'ide_command_strategy_unavailable',
      missingCommands.length > 0
        ? `Configured IDE command strategy is unavailable. Missing VS Code commands: ${missingCommands.join(', ')}. Clipboard handoff can still fall back.`
        : 'Configured IDE command strategy is unavailable because no usable VS Code command ids were configured. Clipboard handoff can still fall back.'
    ));
  } else if (input.ideCommandSupport?.status === 'available') {
    diagnostics.push(createDiagnostic(
      'codexAdapter',
      'info',
      'ide_command_strategy_available',
      `Configured IDE command strategy is available via ${input.ideCommandSupport.openSidebarCommandId} and ${input.ideCommandSupport.newChatCommandId}.`
    ));
  }

  if (input.config.verifierModes.includes('validationCommand')) {
    if (!input.validationCommand) {
      diagnostics.push(createDiagnostic(
        'validationVerifier',
        'warning',
        'validation_command_missing',
        'Validation-command verifier is enabled but no validation command was selected for this iteration.'
      ));
    } else if (input.validationCommandReadiness.status === 'executableConfirmed') {
      diagnostics.push(createDiagnostic(
        'validationVerifier',
        'info',
        'validation_command_executable_confirmed',
        `Validation command executable was confirmed before execution: ${input.validationCommandReadiness.executable ?? input.validationCommand}.`
      ));
    } else if (input.validationCommandReadiness.status === 'executableNotConfirmed') {
      diagnostics.push(createDiagnostic(
        'validationVerifier',
        'warning',
        'validation_command_executable_not_confirmed',
        `Validation command was selected but its executable could not be confirmed before execution: ${input.validationCommandReadiness.executable ?? input.validationCommand}.`
      ));
    } else {
      diagnostics.push(createDiagnostic(
        'validationVerifier',
        'info',
        'validation_command_selected_not_confirmed',
        `Validation command was selected but preflight could not confirm its executable cheaply: ${input.validationCommand}.`
      ));
    }
  }

  if (input.normalizedValidationCommandFrom && input.validationCommand) {
    diagnostics.push(createDiagnostic(
      'validationVerifier',
      'info',
      'validation_command_normalized',
      `Normalized the selected validation command from "${input.normalizedValidationCommandFrom}" to "${input.validationCommand}" because the verifier root already matches the nested repo target.`
    ));
  }

  if (input.config.verifierModes.length === 0) {
    diagnostics.push(createDiagnostic(
      'validationVerifier',
      'info',
      'no_verifiers_enabled',
      'No post-iteration verifiers are enabled.'
    ));
  }

  const orderedDiagnostics = sortDiagnostics(diagnostics);
  const ready = !orderedDiagnostics.some((diagnostic) => diagnostic.severity === 'error');
  const byCategory = (category: RalphPreflightCategory) => orderedDiagnostics.filter((diagnostic) => diagnostic.category === category);
  const scopeSummary = [
    sectionSummary('taskGraph', byCategory('taskGraph')),
    sectionSummary('claimGraph', byCategory('claimGraph')),
    sectionSummary('workspaceRuntime', byCategory('workspaceRuntime')),
    sectionSummary('codexAdapter', byCategory('codexAdapter')),
    sectionSummary('validationVerifier', byCategory('validationVerifier')),
    sectionSummary('agentHealth', byCategory('agentHealth'))
  ].join(' | ');
  const selectionSummary = summarizeTaskSelection(input.selectedTask, orderedDiagnostics);
  const validationSummary = input.validationCommand
    ? [
      `Validation ${input.validationCommand}.`,
      input.validationCommandReadiness.status === 'executableConfirmed'
        ? 'Executable confirmed.'
        : input.validationCommandReadiness.status === 'executableNotConfirmed'
          ? 'Executable not confirmed.'
          : input.validationCommandReadiness.status === 'selected'
            ? 'Executable not checked.'
            : 'No validation command selected.'
    ].join(' ')
    : 'Validation none.';

  return {
    ready,
    summary: `Preflight ${ready ? 'ready' : 'blocked'}: ${selectionSummary} ${validationSummary} ${scopeSummary}`,
    diagnostics: orderedDiagnostics
  };
}

export function renderPreflightReport(report: RalphPreflightReport): string {
  const renderDiagnostic = (diagnostic: RalphPreflightDiagnostic): string =>
    `- ${diagnostic.severity} [${diagnostic.code}]: ${diagnostic.message}`;
  const sections = (Object.keys(CATEGORY_LABELS) as RalphPreflightCategory[]).map((category) => {
    const diagnostics = report.diagnostics.filter((diagnostic) => diagnostic.category === category);
    return [
      `## ${CATEGORY_LABELS[category]}`,
      diagnostics.length > 0
        ? diagnostics.map(renderDiagnostic).join('\n')
        : '- ok'
    ].join('\n');
  });

  return [
    '# Ralph Preflight',
    '',
    `- Ready: ${report.ready ? 'yes' : 'no'}`,
    `- Summary: ${report.summary}`,
    '',
    ...sections
  ].join('\n');
}

export function buildBlockingPreflightMessage(report: RalphPreflightReport): string {
  const blockingDiagnostics = report.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
  const firstReason = blockingDiagnostics[0]?.message ?? 'Unknown preflight failure.';
  return `Ralph preflight blocked iteration start. ${firstReason}`;
}
