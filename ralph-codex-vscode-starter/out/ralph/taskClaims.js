"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CLAIM_TTL_MS = void 0;
exports.acquireClaim = acquireClaim;
exports.releaseClaim = releaseClaim;
exports.inspectClaimOwnership = inspectClaimOwnership;
exports.inspectTaskClaimGraph = inspectTaskClaimGraph;
exports.resolveStaleClaimByTask = resolveStaleClaimByTask;
exports.resolveStaleClaim = resolveStaleClaim;
const fs = __importStar(require("node:fs/promises"));
const path = __importStar(require("node:path"));
const fileLock_1 = require("../util/fileLock");
exports.DEFAULT_CLAIM_TTL_MS = 1000 * 60 * 60 * 24;
// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------
function normalizeClaimStatus(value) {
    return value === 'active' || value === 'released' || value === 'stale'
        ? value
        : 'active';
}
function normalizeClaim(candidate) {
    if (typeof candidate !== 'object' || candidate === null) {
        return null;
    }
    const record = candidate;
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
function createDefaultTaskClaimFile() {
    return {
        version: 1,
        claims: []
    };
}
function stringifyTaskClaimFile(claimFile) {
    return `${JSON.stringify(claimFile, null, 2)}\n`;
}
async function readTaskClaimFile(claimFilePath) {
    let raw = '';
    try {
        raw = await fs.readFile(claimFilePath, 'utf8');
    }
    catch (error) {
        const code = typeof error === 'object' && error !== null && 'code' in error
            ? String(error.code)
            : '';
        if (code === 'ENOENT') {
            return createDefaultTaskClaimFile();
        }
        throw error;
    }
    if (!raw.trim()) {
        return createDefaultTaskClaimFile();
    }
    const parsed = JSON.parse(raw);
    const claims = Array.isArray(parsed.claims)
        ? parsed.claims
            .map((claim) => normalizeClaim(claim))
            .filter((claim) => claim !== null)
        : [];
    return {
        version: 1,
        claims
    };
}
function claimIdentityMatches(left, right) {
    return left.taskId === right.taskId
        && left.agentId === right.agentId
        && left.provenanceId === right.provenanceId
        && left.claimedAt === right.claimedAt;
}
function isIdeHandoffProvenance(provenanceId) {
    return /^run-i\d+-ide-/.test(provenanceId);
}
function claimRecordMatches(left, right) {
    return claimIdentityMatches(left, right)
        && left.status === right.status
        && left.baseBranch === right.baseBranch
        && left.integrationBranch === right.integrationBranch
        && left.featureBranch === right.featureBranch
        && left.resolvedAt === right.resolvedAt
        && left.resolvedBy === right.resolvedBy
        && left.resolutionReason === right.resolutionReason;
}
function findClaim(claimFile, candidate) {
    return claimFile.claims.find((claim) => claimRecordMatches(claim, candidate)) ?? null;
}
function resolveClaimTtlMs(options) {
    return Math.max(0, Math.floor(options?.ttlMs ?? exports.DEFAULT_CLAIM_TTL_MS));
}
function claimIsStale(claim, ttlMs, now) {
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
function describeClaim(claim, options) {
    if (!claim) {
        return null;
    }
    const now = options?.now ?? new Date();
    return {
        claim,
        stale: claimIsStale(claim, resolveClaimTtlMs(options), now)
    };
}
function activeClaimsForTask(claimFile, taskId) {
    return claimFile.claims.filter((claim) => claim.taskId === taskId && claim.status === 'active');
}
function canonicalClaimForTask(claimFile, taskId) {
    const activeClaims = activeClaimsForTask(claimFile, taskId);
    return activeClaims.length > 0 ? activeClaims[activeClaims.length - 1] : null;
}
function taskIdsWithActiveClaims(claimFile) {
    return [...new Set(claimFile.claims
            .filter((claim) => claim.status === 'active')
            .map((claim) => claim.taskId))].sort((left, right) => left.localeCompare(right));
}
function latestResolvedClaim(claimFile) {
    const resolvedClaims = claimFile.claims.filter((claim) => ((claim.status === 'stale' || claim.status === 'released')
        && typeof claim.resolvedAt === 'string'
        && claim.resolvedAt.trim().length > 0));
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
async function writeTaskClaimFile(claimFilePath, claimFile) {
    const directoryPath = path.dirname(claimFilePath);
    const tempFilePath = path.join(directoryPath, `${path.basename(claimFilePath)}.${process.pid}.${Date.now()}.tmp`);
    const contents = stringifyTaskClaimFile(claimFile);
    await fs.mkdir(directoryPath, { recursive: true });
    let tempHandle = null;
    try {
        tempHandle = await fs.open(tempFilePath, 'w');
        await tempHandle.writeFile(contents, 'utf8');
        await tempHandle.sync();
        await tempHandle.close();
        tempHandle = null;
        await fs.rm(claimFilePath, { force: true });
        await fs.rename(tempFilePath, claimFilePath);
    }
    finally {
        if (tempHandle) {
            await tempHandle.close().catch(() => undefined);
        }
        await fs.rm(tempFilePath, { force: true }).catch(() => undefined);
    }
}
async function withClaimFileLock(claimFilePath, options, fn) {
    const lockPath = `${claimFilePath}.lock`;
    const result = await (0, fileLock_1.withFileLock)(lockPath, {
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
async function acquireClaim(claimFilePath, taskId, agentId, provenanceId, options) {
    return withClaimFileLock(claimFilePath, options, async () => {
        const claimFile = await readTaskClaimFile(claimFilePath);
        const releasableLegacyIdeClaims = activeClaimsForTask(claimFile, taskId).filter((claim) => (claim.agentId === agentId && isIdeHandoffProvenance(claim.provenanceId)));
        const releasedLegacyClaimFile = releasableLegacyIdeClaims.length > 0
            ? {
                version: 1,
                claims: claimFile.claims.map((claim) => (releasableLegacyIdeClaims.some((legacyClaim) => claimRecordMatches(claim, legacyClaim))
                    ? { ...claim, status: 'released' }
                    : claim))
            }
            : claimFile;
        const effectiveClaimFile = releasableLegacyIdeClaims.length > 0
            ? await (async () => {
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
        const nextClaim = {
            taskId,
            agentId,
            provenanceId,
            claimedAt: (options?.now ?? new Date()).toISOString(),
            status: 'active',
            baseBranch: options?.baseBranch?.trim() || undefined,
            integrationBranch: options?.integrationBranch?.trim() || undefined,
            featureBranch: options?.featureBranch?.trim() || undefined
        };
        const nextClaimFile = {
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
async function releaseClaim(claimFilePath, taskId, agentId, options) {
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
        let releasedClaim = null;
        const nextClaimFile = {
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
async function inspectClaimOwnership(claimFilePath, taskId, agentId, provenanceId, options) {
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
async function inspectTaskClaimGraph(claimFilePath, options) {
    return withClaimFileLock(claimFilePath, options, async () => {
        const claimFile = await readTaskClaimFile(claimFilePath);
        const tasks = taskIdsWithActiveClaims(claimFile).map((taskId) => {
            const activeClaims = activeClaimsForTask(claimFile, taskId)
                .map((claim) => describeClaim(claim, options))
                .filter((claim) => claim !== null);
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
async function resolveStaleClaimByTask(claimFilePath, taskId, agentId, options) {
    return withClaimFileLock(claimFilePath, options, async () => {
        const claimFile = await readTaskClaimFile(claimFilePath);
        const canonicalClaim = canonicalClaimForTask(claimFile, taskId);
        if (!canonicalClaim || canonicalClaim.agentId !== agentId) {
            return {
                outcome: 'not_eligible',
                resolvedClaim: null,
                canonicalClaim: describeClaim(canonicalClaim, options),
                claimFile,
                lookupMiss: true
            };
        }
        const describedCanonicalClaim = describeClaim(canonicalClaim, options);
        if (canonicalClaim.status !== 'active' || !describedCanonicalClaim?.stale) {
            return {
                outcome: 'not_eligible',
                resolvedClaim: null,
                canonicalClaim: describedCanonicalClaim,
                claimFile,
                lookupMiss: false
            };
        }
        const resolvedAt = (options.now ?? new Date()).toISOString();
        const nextStatus = options.status ?? 'stale';
        let resolvedClaim = null;
        const nextClaimFile = {
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
            throw new Error(`resolveStaleClaimByTask: Claim file write did not persist the resolved claim for task ${taskId}.`);
        }
        return {
            outcome: 'resolved',
            resolvedClaim: describeClaim(verifiedResolvedClaim, options),
            canonicalClaim: describeClaim(canonicalClaimForTask(verifiedClaimFile, taskId), options),
            claimFile: verifiedClaimFile,
            lookupMiss: false
        };
    });
}
async function resolveStaleClaim(claimFilePath, options) {
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
        let resolvedClaim = null;
        const nextClaimFile = {
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
            throw new Error(`Failed to verify resolved stale claim for task ${options.expectedClaim.taskId} held by ${options.expectedClaim.agentId}.`);
        }
        return {
            outcome: 'resolved',
            resolvedClaim: describeClaim(verifiedResolvedClaim, options),
            canonicalClaim: describeClaim(canonicalClaimForTask(verifiedClaimFile, options.expectedClaim.taskId), options),
            claimFile: verifiedClaimFile
        };
    });
}
//# sourceMappingURL=taskClaims.js.map