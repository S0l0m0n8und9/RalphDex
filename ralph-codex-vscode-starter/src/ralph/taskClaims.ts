import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { withFileLock } from '../util/fileLock';
import {
  RalphTaskClaim,
  RalphTaskClaimFile
} from './types';

export const DEFAULT_CLAIM_TTL_MS = 1000 * 60 * 60 * 24;

export interface RalphTaskClaimOptions {
  ttlMs?: number;
  now?: Date;
  lockRetryCount?: number;
  lockRetryDelayMs?: number;
}

export interface RalphTaskClaimDetails {
  claim: RalphTaskClaim;
  stale: boolean;
}

export interface RalphAcquireClaimResult {
  outcome: 'acquired' | 'already_held' | 'contested';
  claim: RalphTaskClaimDetails | null;
  canonicalClaim: RalphTaskClaimDetails | null;
  claimFile: RalphTaskClaimFile;
}

export interface RalphReleaseClaimResult {
  outcome: 'released' | 'not_held';
  releasedClaim: RalphTaskClaimDetails | null;
  canonicalClaim: RalphTaskClaimDetails | null;
  claimFile: RalphTaskClaimFile;
}

export interface RalphClaimOwnershipStatus {
  holdsActiveClaim: boolean;
  canonicalClaim: RalphTaskClaimDetails | null;
  claimFile: RalphTaskClaimFile;
}

export interface RalphTaskClaimGraphEntry {
  taskId: string;
  canonicalClaim: RalphTaskClaimDetails | null;
  activeClaims: RalphTaskClaimDetails[];
  contested: boolean;
}

export interface RalphTaskClaimGraphInspection {
  claimFile: RalphTaskClaimFile;
  tasks: RalphTaskClaimGraphEntry[];
  latestResolvedClaim: RalphTaskClaimDetails | null;
}

export interface RalphResolveStaleClaimOptions extends RalphTaskClaimOptions {
  expectedClaim: RalphTaskClaim;
  resolutionReason: string;
  resolvedBy?: string;
  status?: Extract<RalphTaskClaim['status'], 'released' | 'stale'>;
}

export interface RalphResolveStaleClaimResult {
  outcome: 'resolved' | 'not_eligible';
  resolvedClaim: RalphTaskClaimDetails | null;
  canonicalClaim: RalphTaskClaimDetails | null;
  claimFile: RalphTaskClaimFile;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function normalizeClaimStatus(value: unknown): RalphTaskClaim['status'] {
  return value === 'active' || value === 'released' || value === 'stale'
    ? value
    : 'active';
}

function normalizeClaim(candidate: unknown): RalphTaskClaim | null {
  if (typeof candidate !== 'object' || candidate === null) {
    return null;
  }

  const record = candidate as Record<string, unknown>;
  if (typeof record.agentId !== 'string'
    || typeof record.taskId !== 'string'
    || typeof record.claimedAt !== 'string'
    || typeof record.provenanceId !== 'string') {
    return null;
  }

  return {
    agentId: record.agentId,
    taskId: record.taskId,
    claimedAt: record.claimedAt,
    provenanceId: record.provenanceId,
    status: normalizeClaimStatus(record.status),
    baseBranch: typeof record.baseBranch === 'string' ? record.baseBranch : undefined,
    integrationBranch: typeof record.integrationBranch === 'string' ? record.integrationBranch : undefined,
    featureBranch: typeof record.featureBranch === 'string' ? record.featureBranch : undefined,
    resolvedAt: typeof record.resolvedAt === 'string' ? record.resolvedAt : undefined,
    resolvedBy: typeof record.resolvedBy === 'string' ? record.resolvedBy : undefined,
    resolutionReason: typeof record.resolutionReason === 'string' ? record.resolutionReason : undefined
  };
}

function createDefaultTaskClaimFile(): RalphTaskClaimFile {
  return {
    version: 1,
    claims: []
  };
}

function stringifyTaskClaimFile(claimFile: RalphTaskClaimFile): string {
  return `${JSON.stringify(claimFile, null, 2)}\n`;
}

async function readTaskClaimFile(claimFilePath: string): Promise<RalphTaskClaimFile> {
  let raw = '';
  try {
    raw = await fs.readFile(claimFilePath, 'utf8');
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';
    if (code === 'ENOENT') {
      return createDefaultTaskClaimFile();
    }

    throw error;
  }

  if (!raw.trim()) {
    return createDefaultTaskClaimFile();
  }

  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const claims = Array.isArray(parsed.claims)
    ? parsed.claims
      .map((claim) => normalizeClaim(claim))
      .filter((claim): claim is RalphTaskClaim => claim !== null)
    : [];

  return {
    version: 1,
    claims
  };
}

function claimIdentityMatches(left: RalphTaskClaim, right: RalphTaskClaim): boolean {
  return left.taskId === right.taskId
    && left.agentId === right.agentId
    && left.provenanceId === right.provenanceId
    && left.claimedAt === right.claimedAt;
}

function isIdeHandoffProvenance(provenanceId: string): boolean {
  return /^run-i\d+-ide-/.test(provenanceId);
}

function claimRecordMatches(left: RalphTaskClaim, right: RalphTaskClaim): boolean {
  return claimIdentityMatches(left, right)
    && left.status === right.status
    && left.baseBranch === right.baseBranch
    && left.integrationBranch === right.integrationBranch
    && left.featureBranch === right.featureBranch
    && left.resolvedAt === right.resolvedAt
    && left.resolvedBy === right.resolvedBy
    && left.resolutionReason === right.resolutionReason;
}

function findClaim(claimFile: RalphTaskClaimFile, candidate: RalphTaskClaim): RalphTaskClaim | null {
  return claimFile.claims.find((claim) => claimRecordMatches(claim, candidate)) ?? null;
}

function resolveClaimTtlMs(options?: RalphTaskClaimOptions): number {
  return Math.max(0, Math.floor(options?.ttlMs ?? DEFAULT_CLAIM_TTL_MS));
}

function claimIsStale(claim: RalphTaskClaim, ttlMs: number, now: Date): boolean {
  if (claim.status !== 'active') {
    return false;
  }

  if (ttlMs === 0) {
    return false;
  }

  const claimedAt = Date.parse(claim.claimedAt);
  if (Number.isNaN(claimedAt)) {
    return false;
  }

  return now.getTime() - claimedAt > ttlMs;
}

function describeClaim(claim: RalphTaskClaim | null, options?: RalphTaskClaimOptions): RalphTaskClaimDetails | null {
  if (!claim) {
    return null;
  }

  const now = options?.now ?? new Date();
  return {
    claim,
    stale: claimIsStale(claim, resolveClaimTtlMs(options), now)
  };
}

function activeClaimsForTask(claimFile: RalphTaskClaimFile, taskId: string): RalphTaskClaim[] {
  return claimFile.claims.filter((claim) => claim.taskId === taskId && claim.status === 'active');
}

function canonicalClaimForTask(claimFile: RalphTaskClaimFile, taskId: string): RalphTaskClaim | null {
  const activeClaims = activeClaimsForTask(claimFile, taskId);
  return activeClaims.length > 0 ? activeClaims[activeClaims.length - 1] : null;
}

function taskIdsWithActiveClaims(claimFile: RalphTaskClaimFile): string[] {
  return [...new Set(
    claimFile.claims
      .filter((claim) => claim.status === 'active')
      .map((claim) => claim.taskId)
  )].sort((left, right) => left.localeCompare(right));
}

function latestResolvedClaim(claimFile: RalphTaskClaimFile): RalphTaskClaim | null {
  const resolvedClaims = claimFile.claims.filter((claim) => (
    (claim.status === 'stale' || claim.status === 'released')
    && typeof claim.resolvedAt === 'string'
    && claim.resolvedAt.trim().length > 0
  ));

  if (resolvedClaims.length === 0) {
    return null;
  }

  return [...resolvedClaims].sort((left, right) => {
    const leftTime = Date.parse(left.resolvedAt ?? '');
    const rightTime = Date.parse(right.resolvedAt ?? '');
    if (Number.isNaN(leftTime) && Number.isNaN(rightTime)) {
      return 0;
    }
    if (Number.isNaN(leftTime)) {
      return 1;
    }
    if (Number.isNaN(rightTime)) {
      return -1;
    }
    return rightTime - leftTime;
  })[0] ?? null;
}

async function writeTaskClaimFile(claimFilePath: string, claimFile: RalphTaskClaimFile): Promise<void> {
  const directoryPath = path.dirname(claimFilePath);
  const tempFilePath = path.join(
    directoryPath,
    `${path.basename(claimFilePath)}.${process.pid}.${Date.now()}.tmp`
  );
  const contents = stringifyTaskClaimFile(claimFile);

  await fs.mkdir(directoryPath, { recursive: true });

  let tempHandle: Awaited<ReturnType<typeof fs.open>> | null = null;
  try {
    tempHandle = await fs.open(tempFilePath, 'w');
    await tempHandle.writeFile(contents, 'utf8');
    await tempHandle.sync();
    await tempHandle.close();
    tempHandle = null;

    await fs.rm(claimFilePath, { force: true });
    await fs.rename(tempFilePath, claimFilePath);
  } finally {
    if (tempHandle) {
      await tempHandle.close().catch(() => undefined);
    }

    await fs.rm(tempFilePath, { force: true }).catch(() => undefined);
  }
}

async function withClaimFileLock<T>(
  claimFilePath: string,
  options: RalphTaskClaimOptions | undefined,
  fn: () => Promise<T>
): Promise<T> {
  const lockPath = `${claimFilePath}.lock`;
  const result = await withFileLock(lockPath, {
    lockRetryCount: options?.lockRetryCount,
    lockRetryDelayMs: options?.lockRetryDelayMs
  }, fn);
  if (result.outcome === 'lock_timeout') {
    throw new Error(`Claim file lock timeout after ${result.attempts} attempts at ${result.lockPath}`);
  }
  return result.value;
}

// ---------------------------------------------------------------------------
// Exported claim operations
// ---------------------------------------------------------------------------

export async function acquireClaim(
  claimFilePath: string,
  taskId: string,
  agentId: string,
  provenanceId: string,
  options?: RalphTaskClaimOptions & Pick<RalphTaskClaim, 'baseBranch' | 'integrationBranch' | 'featureBranch'>
): Promise<RalphAcquireClaimResult> {
  return withClaimFileLock(claimFilePath, options, async () => {
    const claimFile = await readTaskClaimFile(claimFilePath);
    const releasableLegacyIdeClaims = activeClaimsForTask(claimFile, taskId).filter((claim) => (
      claim.agentId === agentId && isIdeHandoffProvenance(claim.provenanceId)
    ));
    const releasedLegacyClaimFile: RalphTaskClaimFile = releasableLegacyIdeClaims.length > 0
      ? {
        version: 1,
        claims: claimFile.claims.map((claim) => (
          releasableLegacyIdeClaims.some((legacyClaim) => claimRecordMatches(claim, legacyClaim))
            ? { ...claim, status: 'released' }
            : claim
        ))
      }
      : claimFile;
    const effectiveClaimFile: RalphTaskClaimFile = releasableLegacyIdeClaims.length > 0
      ? await (async (): Promise<RalphTaskClaimFile> => {
        await writeTaskClaimFile(claimFilePath, releasedLegacyClaimFile);
        return readTaskClaimFile(claimFilePath);
      })()
      : releasedLegacyClaimFile;
    const activeClaims = activeClaimsForTask(effectiveClaimFile, taskId);
    const effectiveCanonicalClaim = canonicalClaimForTask(effectiveClaimFile, taskId);

    if (effectiveCanonicalClaim) {
      const contestedByAnotherActiveClaim = activeClaims.some((claim) => !claimIdentityMatches(claim, effectiveCanonicalClaim));
      if (contestedByAnotherActiveClaim) {
        return {
          outcome: 'contested',
          claim: null,
          canonicalClaim: describeClaim(effectiveCanonicalClaim, options),
          claimFile: effectiveClaimFile
        };
      }

      if (effectiveCanonicalClaim.agentId === agentId && effectiveCanonicalClaim.provenanceId === provenanceId) {
        return {
          outcome: 'already_held',
          claim: describeClaim(effectiveCanonicalClaim, options),
          canonicalClaim: describeClaim(effectiveCanonicalClaim, options),
          claimFile: effectiveClaimFile
        };
      }

      return {
        outcome: 'contested',
        claim: null,
        canonicalClaim: describeClaim(effectiveCanonicalClaim, options),
        claimFile: effectiveClaimFile
      };
    }

    const nextClaim: RalphTaskClaim = {
      taskId,
      agentId,
      provenanceId,
      claimedAt: (options?.now ?? new Date()).toISOString(),
      status: 'active',
      baseBranch: options?.baseBranch?.trim() || undefined,
      integrationBranch: options?.integrationBranch?.trim() || undefined,
      featureBranch: options?.featureBranch?.trim() || undefined
    };
    const nextClaimFile: RalphTaskClaimFile = {
      version: 1,
      claims: [...effectiveClaimFile.claims, nextClaim]
    };

    await writeTaskClaimFile(claimFilePath, nextClaimFile);

    const verifiedClaimFile = await readTaskClaimFile(claimFilePath);
    const verifiedCanonicalClaim = canonicalClaimForTask(verifiedClaimFile, taskId);
    if (!verifiedCanonicalClaim || !claimRecordMatches(verifiedCanonicalClaim, nextClaim)) {
      return {
        outcome: 'contested',
        claim: null,
        canonicalClaim: describeClaim(verifiedCanonicalClaim, options),
        claimFile: verifiedClaimFile
      };
    }

    return {
      outcome: 'acquired',
      claim: describeClaim(nextClaim, options),
      canonicalClaim: describeClaim(verifiedCanonicalClaim, options),
      claimFile: verifiedClaimFile
    };
  });
}

export async function releaseClaim(
  claimFilePath: string,
  taskId: string,
  agentId: string,
  options?: RalphTaskClaimOptions
): Promise<RalphReleaseClaimResult> {
  return withClaimFileLock(claimFilePath, options, async () => {
    const claimFile = await readTaskClaimFile(claimFilePath);
    const canonicalClaim = canonicalClaimForTask(claimFile, taskId);

    if (!canonicalClaim || canonicalClaim.agentId !== agentId) {
      return {
        outcome: 'not_held',
        releasedClaim: null,
        canonicalClaim: describeClaim(canonicalClaim, options),
        claimFile
      };
    }

    let releasedClaim: RalphTaskClaim | null = null;

    const nextClaimFile: RalphTaskClaimFile = {
      version: 1,
      claims: claimFile.claims.map((claim) => {
        if (claimRecordMatches(claim, canonicalClaim)) {
          releasedClaim = {
            ...claim,
            status: 'released'
          };
          return releasedClaim;
        }

        return claim;
      })
    };

    await writeTaskClaimFile(claimFilePath, nextClaimFile);

    const verifiedClaimFile = await readTaskClaimFile(claimFilePath);
    const verifiedReleasedClaim = releasedClaim ? findClaim(verifiedClaimFile, releasedClaim) : null;

    if (!releasedClaim || !verifiedReleasedClaim) {
      throw new Error(`Failed to verify released claim for task ${taskId} held by agent ${agentId}.`);
    }

    return {
      outcome: 'released',
      releasedClaim: describeClaim(verifiedReleasedClaim, options),
      canonicalClaim: describeClaim(canonicalClaimForTask(verifiedClaimFile, taskId), options),
      claimFile: verifiedClaimFile
    };
  });
}

export async function inspectClaimOwnership(
  claimFilePath: string,
  taskId: string,
  agentId: string,
  provenanceId: string,
  options?: RalphTaskClaimOptions
): Promise<RalphClaimOwnershipStatus> {
  return withClaimFileLock(claimFilePath, options, async () => {
    const claimFile = await readTaskClaimFile(claimFilePath);
    const canonicalClaim = canonicalClaimForTask(claimFile, taskId);

    return {
      holdsActiveClaim: canonicalClaim?.status === 'active'
        && canonicalClaim.taskId === taskId
        && canonicalClaim.agentId === agentId
        && canonicalClaim.provenanceId === provenanceId,
      canonicalClaim: describeClaim(canonicalClaim, options),
      claimFile
    };
  });
}

export async function inspectTaskClaimGraph(
  claimFilePath: string,
  options?: RalphTaskClaimOptions
): Promise<RalphTaskClaimGraphInspection> {
  return withClaimFileLock(claimFilePath, options, async () => {
    const claimFile = await readTaskClaimFile(claimFilePath);
    const tasks = taskIdsWithActiveClaims(claimFile).map((taskId) => {
      const activeClaims = activeClaimsForTask(claimFile, taskId)
        .map((claim) => describeClaim(claim, options))
        .filter((claim): claim is RalphTaskClaimDetails => claim !== null);

      return {
        taskId,
        canonicalClaim: describeClaim(canonicalClaimForTask(claimFile, taskId), options),
        activeClaims,
        contested: activeClaims.length > 1
      };
    });

    return {
      claimFile,
      tasks,
      latestResolvedClaim: describeClaim(latestResolvedClaim(claimFile), options)
    };
  });
}

/**
 * Resolve a stale claim by looking up the canonical claim for a task+agent
 * inside the claim lock, closing the TOCTOU race where a build agent could
 * acquire the task's claim between an unlocked graph read and the locked
 * resolution (Gap 4 in parallel-verification-gaps.md).
 */
export async function resolveStaleClaimByTask(
  claimFilePath: string,
  taskId: string,
  agentId: string,
  options: Omit<RalphResolveStaleClaimOptions, 'expectedClaim'>
): Promise<RalphResolveStaleClaimResult & { lookupMiss: boolean }> {
  return withClaimFileLock(claimFilePath, options, async () => {
    const claimFile = await readTaskClaimFile(claimFilePath);
    const canonicalClaim = canonicalClaimForTask(claimFile, taskId);

    if (!canonicalClaim || canonicalClaim.agentId !== agentId) {
      return {
        outcome: 'not_eligible' as const,
        resolvedClaim: null,
        canonicalClaim: describeClaim(canonicalClaim, options),
        claimFile,
        lookupMiss: true
      };
    }

    const describedCanonicalClaim = describeClaim(canonicalClaim, options);
    if (canonicalClaim.status !== 'active' || !describedCanonicalClaim?.stale) {
      return {
        outcome: 'not_eligible' as const,
        resolvedClaim: null,
        canonicalClaim: describedCanonicalClaim,
        claimFile,
        lookupMiss: false
      };
    }

    const resolvedAt = (options.now ?? new Date()).toISOString();
    const nextStatus = options.status ?? 'stale';
    let resolvedClaim: RalphTaskClaim | null = null;
    const nextClaimFile: RalphTaskClaimFile = {
      version: 1,
      claims: claimFile.claims.map((claim) => {
        if (!claimRecordMatches(claim, canonicalClaim)) {
          return claim;
        }
        resolvedClaim = {
          ...claim,
          status: nextStatus,
          resolvedAt,
          resolvedBy: options.resolvedBy?.trim() || undefined,
          resolutionReason: options.resolutionReason.trim()
        };
        return resolvedClaim;
      })
    };

    await writeTaskClaimFile(claimFilePath, nextClaimFile);

    const verifiedClaimFile = await readTaskClaimFile(claimFilePath);
    const verifiedResolvedClaim = resolvedClaim ? findClaim(verifiedClaimFile, resolvedClaim) : null;
    if (!resolvedClaim || !verifiedResolvedClaim) {
      throw new Error(
        `resolveStaleClaimByTask: Claim file write did not persist the resolved claim for task ${taskId}.`
      );
    }

    return {
      outcome: 'resolved' as const,
      resolvedClaim: describeClaim(verifiedResolvedClaim, options),
      canonicalClaim: describeClaim(canonicalClaimForTask(verifiedClaimFile, taskId), options),
      claimFile: verifiedClaimFile,
      lookupMiss: false
    };
  });
}

export async function resolveStaleClaim(
  claimFilePath: string,
  options: RalphResolveStaleClaimOptions
): Promise<RalphResolveStaleClaimResult> {
  return withClaimFileLock(claimFilePath, options, async () => {
    const claimFile = await readTaskClaimFile(claimFilePath);
    const canonicalClaim = canonicalClaimForTask(claimFile, options.expectedClaim.taskId);
    const describedCanonicalClaim = describeClaim(canonicalClaim, options);

    if (!canonicalClaim
      || !claimIdentityMatches(canonicalClaim, options.expectedClaim)
      || canonicalClaim.status !== 'active'
      || !describedCanonicalClaim?.stale) {
      return {
        outcome: 'not_eligible',
        resolvedClaim: null,
        canonicalClaim: describedCanonicalClaim,
        claimFile
      };
    }

    const resolvedAt = (options.now ?? new Date()).toISOString();
    const nextStatus = options.status ?? 'stale';
    let resolvedClaim: RalphTaskClaim | null = null;
    const nextClaimFile: RalphTaskClaimFile = {
      version: 1,
      claims: claimFile.claims.map((claim) => {
        if (!claimRecordMatches(claim, canonicalClaim)) {
          return claim;
        }

        resolvedClaim = {
          ...claim,
          status: nextStatus,
          resolvedAt,
          resolvedBy: options.resolvedBy?.trim() || undefined,
          resolutionReason: options.resolutionReason.trim()
        };
        return resolvedClaim;
      })
    };

    await writeTaskClaimFile(claimFilePath, nextClaimFile);

    const verifiedClaimFile = await readTaskClaimFile(claimFilePath);
    const verifiedResolvedClaim = resolvedClaim ? findClaim(verifiedClaimFile, resolvedClaim) : null;
    if (!resolvedClaim || !verifiedResolvedClaim) {
      throw new Error(
        `Failed to verify resolved stale claim for task ${options.expectedClaim.taskId} held by ${options.expectedClaim.agentId}.`
      );
    }

    return {
      outcome: 'resolved',
      resolvedClaim: describeClaim(verifiedResolvedClaim, options),
      canonicalClaim: describeClaim(canonicalClaimForTask(verifiedClaimFile, options.expectedClaim.taskId), options),
      claimFile: verifiedClaimFile
    };
  });
}
