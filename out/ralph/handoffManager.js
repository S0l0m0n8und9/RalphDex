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
exports.HandoffLifecycleError = void 0;
exports.resolveHandoffDir = resolveHandoffDir;
exports.resolveHandoffPath = resolveHandoffPath;
exports.resolveLatestHandoffPath = resolveLatestHandoffPath;
exports.resolveLatestHandoffSummaryPath = resolveLatestHandoffSummaryPath;
exports.isHandoffExpired = isHandoffExpired;
exports.proposeHandoff = proposeHandoff;
exports.acceptHandoff = acceptHandoff;
exports.rejectHandoff = rejectHandoff;
exports.expireHandoff = expireHandoff;
exports.getHandoffStatus = getHandoffStatus;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const integrity_1 = require("./integrity");
// ---------------------------------------------------------------------------
// Handoff artifact paths
// ---------------------------------------------------------------------------
function resolveHandoffDir(ralphRoot) {
    return path.join(ralphRoot, 'handoffs');
}
function resolveHandoffPath(ralphRoot, handoffId) {
    return path.join(resolveHandoffDir(ralphRoot), `${handoffId}.json`);
}
function resolveLatestHandoffPath(ralphRoot) {
    return path.join(ralphRoot, 'latest-handoff.json');
}
function resolveLatestHandoffSummaryPath(ralphRoot) {
    return path.join(ralphRoot, 'latest-handoff-summary.md');
}
// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------
class HandoffLifecycleError extends Error {
    constructor(message) {
        super(message);
        this.name = 'HandoffLifecycleError';
    }
}
exports.HandoffLifecycleError = HandoffLifecycleError;
// ---------------------------------------------------------------------------
// Expiry helper
// ---------------------------------------------------------------------------
/**
 * Returns `true` when the handoff's `expiresAt` timestamp is in the past
 * relative to the supplied `now` (defaults to the current time).
 */
function isHandoffExpired(handoff, now = new Date()) {
    return new Date(handoff.expiresAt).getTime() <= now.getTime();
}
/**
 * Create a new handoff in `proposed` status and persist it atomically.
 *
 * Throws {@link HandoffLifecycleError} if a handoff with the same ID already
 * exists on disk.
 */
async function proposeHandoff(ralphRoot, input) {
    const filePath = resolveHandoffPath(ralphRoot, input.handoffId);
    // Guard: do not overwrite an existing handoff.
    try {
        await fs.access(filePath);
        throw new HandoffLifecycleError(`Handoff "${input.handoffId}" already exists. Use a unique handoffId.`);
    }
    catch (err) {
        if (err.code !== 'ENOENT') {
            throw err; // Re-throw HandoffLifecycleError or unexpected errors.
        }
    }
    const now = new Date().toISOString();
    const handoff = {
        handoffId: input.handoffId,
        fromAgentId: input.fromAgentId,
        toRole: input.toRole,
        taskId: input.taskId,
        objective: input.objective,
        constraints: input.constraints,
        acceptedEvidence: input.acceptedEvidence,
        expectedOutputContract: input.expectedOutputContract,
        stopConditions: input.stopConditions,
        createdAt: now,
        expiresAt: input.expiresAt,
        provenanceLinks: input.provenanceLinks,
        status: 'proposed',
        history: []
    };
    await fs.mkdir(resolveHandoffDir(ralphRoot), { recursive: true });
    await fs.writeFile(filePath, (0, integrity_1.stableJson)(handoff), 'utf8');
    await writeLatestHandoffArtifacts(ralphRoot, handoff);
    return handoff;
}
// ---------------------------------------------------------------------------
// Lifecycle: accept
// ---------------------------------------------------------------------------
/**
 * Transition a handoff from `proposed` to `accepted`.
 *
 * Throws {@link HandoffLifecycleError} if:
 * - the handoff does not exist
 * - the handoff is not in `proposed` status
 * - the accepting agent's role does not match `toRole`
 * - the handoff has already expired
 *
 * If a concurrent accept is detected (status already `accepted`), the handoff
 * is moved to `contested` instead.
 */
async function acceptHandoff(ralphRoot, handoffId, acceptingAgentId, acceptingRole, reason) {
    const handoff = await readHandoff(ralphRoot, handoffId);
    if (handoff.status === 'accepted') {
        // Concurrent accept → contested.
        return transitionHandoff(ralphRoot, handoff, 'contested', reason);
    }
    if (handoff.status !== 'proposed') {
        throw new HandoffLifecycleError(`Cannot accept handoff "${handoffId}": current status is "${handoff.status}", expected "proposed".`);
    }
    if (acceptingRole !== handoff.toRole) {
        throw new HandoffLifecycleError(`Cannot accept handoff "${handoffId}": accepting role "${acceptingRole}" does not match target role "${handoff.toRole}".`);
    }
    if (isHandoffExpired(handoff)) {
        // Auto-expire before accepting.
        await transitionHandoff(ralphRoot, handoff, 'expired', 'Expired before acceptance');
        throw new HandoffLifecycleError(`Cannot accept handoff "${handoffId}": handoff has expired.`);
    }
    return transitionHandoff(ralphRoot, handoff, 'accepted', reason);
}
// ---------------------------------------------------------------------------
// Lifecycle: reject
// ---------------------------------------------------------------------------
/**
 * Transition a handoff from `proposed` to `rejected`.
 */
async function rejectHandoff(ralphRoot, handoffId, reason) {
    const handoff = await readHandoff(ralphRoot, handoffId);
    if (handoff.status !== 'proposed') {
        throw new HandoffLifecycleError(`Cannot reject handoff "${handoffId}": current status is "${handoff.status}", expected "proposed".`);
    }
    return transitionHandoff(ralphRoot, handoff, 'rejected', reason);
}
// ---------------------------------------------------------------------------
// Lifecycle: expire
// ---------------------------------------------------------------------------
/**
 * Transition a handoff to `expired` status if it is past its `expiresAt` time.
 *
 * If the handoff is already in a terminal status (`rejected`, `expired`,
 * `superseded`), the call is a no-op and returns the current state.
 */
async function expireHandoff(ralphRoot, handoffId) {
    const handoff = await readHandoff(ralphRoot, handoffId);
    const terminalStatuses = ['rejected', 'expired', 'superseded'];
    if (terminalStatuses.includes(handoff.status)) {
        return handoff;
    }
    if (!isHandoffExpired(handoff)) {
        return handoff; // Not yet expired — no-op.
    }
    return transitionHandoff(ralphRoot, handoff, 'expired', 'Expired by time check');
}
// ---------------------------------------------------------------------------
// Read / status
// ---------------------------------------------------------------------------
/**
 * Read a persisted handoff from disk.
 *
 * Throws {@link HandoffLifecycleError} if the file does not exist.
 */
async function getHandoffStatus(ralphRoot, handoffId) {
    return readHandoff(ralphRoot, handoffId);
}
// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
async function writeLatestHandoffArtifacts(ralphRoot, handoff) {
    const summary = `${handoff.handoffId} ${handoff.status} ${handoff.fromAgentId} → ${handoff.toRole} for ${handoff.taskId}, expires ${handoff.expiresAt}`;
    await Promise.all([
        fs.writeFile(resolveLatestHandoffPath(ralphRoot), (0, integrity_1.stableJson)(handoff), 'utf8'),
        fs.writeFile(resolveLatestHandoffSummaryPath(ralphRoot), summary, 'utf8')
    ]);
}
async function readHandoff(ralphRoot, handoffId) {
    const filePath = resolveHandoffPath(ralphRoot, handoffId);
    try {
        const raw = await fs.readFile(filePath, 'utf8');
        return JSON.parse(raw);
    }
    catch (err) {
        if (err.code === 'ENOENT') {
            throw new HandoffLifecycleError(`Handoff "${handoffId}" not found at ${filePath}.`);
        }
        throw err;
    }
}
async function transitionHandoff(ralphRoot, handoff, to, reason) {
    const now = new Date().toISOString();
    const updated = {
        ...handoff,
        status: to,
        history: [
            ...handoff.history,
            { at: now, from: handoff.status, to, reason }
        ]
    };
    const filePath = resolveHandoffPath(ralphRoot, handoff.handoffId);
    await fs.writeFile(filePath, (0, integrity_1.stableJson)(updated), 'utf8');
    await writeLatestHandoffArtifacts(ralphRoot, updated);
    return updated;
}
//# sourceMappingURL=handoffManager.js.map