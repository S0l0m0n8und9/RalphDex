import * as fs from 'fs/promises';
import * as path from 'path';
import { stableJson } from './integrity';
import type {
  OrchestrationEvidenceRef,
  RalphAgentRole,
  RalphHandoff,
  RalphHandoffStatus
} from './types';

// ---------------------------------------------------------------------------
// Handoff artifact paths
// ---------------------------------------------------------------------------

export function resolveHandoffDir(ralphRoot: string): string {
  return path.join(ralphRoot, 'handoffs');
}

export function resolveHandoffPath(ralphRoot: string, handoffId: string): string {
  return path.join(resolveHandoffDir(ralphRoot), `${handoffId}.json`);
}

export function resolveLatestHandoffPath(ralphRoot: string): string {
  return path.join(ralphRoot, 'latest-handoff.json');
}

export function resolveLatestHandoffSummaryPath(ralphRoot: string): string {
  return path.join(ralphRoot, 'latest-handoff-summary.md');
}

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class HandoffLifecycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HandoffLifecycleError';
  }
}

// ---------------------------------------------------------------------------
// Expiry helper
// ---------------------------------------------------------------------------

/**
 * Returns `true` when the handoff's `expiresAt` timestamp is in the past
 * relative to the supplied `now` (defaults to the current time).
 */
export function isHandoffExpired(
  handoff: RalphHandoff,
  now: Date = new Date()
): boolean {
  return new Date(handoff.expiresAt).getTime() <= now.getTime();
}

// ---------------------------------------------------------------------------
// Lifecycle: propose
// ---------------------------------------------------------------------------

export interface ProposeHandoffInput {
  handoffId: string;
  fromAgentId: string;
  toRole: RalphAgentRole;
  taskId: string;
  objective: string;
  constraints: string[];
  acceptedEvidence: OrchestrationEvidenceRef[];
  expectedOutputContract: string;
  stopConditions: string[];
  expiresAt: string;
  provenanceLinks: string[];
}

/**
 * Create a new handoff in `proposed` status and persist it atomically.
 *
 * Throws {@link HandoffLifecycleError} if a handoff with the same ID already
 * exists on disk.
 */
export async function proposeHandoff(
  ralphRoot: string,
  input: ProposeHandoffInput
): Promise<RalphHandoff> {
  const filePath = resolveHandoffPath(ralphRoot, input.handoffId);

  // Guard: do not overwrite an existing handoff.
  try {
    await fs.access(filePath);
    throw new HandoffLifecycleError(
      `Handoff "${input.handoffId}" already exists. Use a unique handoffId.`
    );
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err; // Re-throw HandoffLifecycleError or unexpected errors.
    }
  }

  const now = new Date().toISOString();
  const handoff: RalphHandoff = {
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
  await fs.writeFile(filePath, stableJson(handoff), 'utf8');
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
export async function acceptHandoff(
  ralphRoot: string,
  handoffId: string,
  acceptingAgentId: string,
  acceptingRole: RalphAgentRole,
  reason: string
): Promise<RalphHandoff> {
  const handoff = await readHandoff(ralphRoot, handoffId);

  if (handoff.status === 'accepted') {
    // Concurrent accept → contested.
    return transitionHandoff(ralphRoot, handoff, 'contested', reason);
  }

  if (handoff.status !== 'proposed') {
    throw new HandoffLifecycleError(
      `Cannot accept handoff "${handoffId}": current status is "${handoff.status}", expected "proposed".`
    );
  }

  if (acceptingRole !== handoff.toRole) {
    throw new HandoffLifecycleError(
      `Cannot accept handoff "${handoffId}": accepting role "${acceptingRole}" does not match target role "${handoff.toRole}".`
    );
  }

  if (isHandoffExpired(handoff)) {
    // Auto-expire before accepting.
    await transitionHandoff(ralphRoot, handoff, 'expired', 'Expired before acceptance');
    throw new HandoffLifecycleError(
      `Cannot accept handoff "${handoffId}": handoff has expired.`
    );
  }

  return transitionHandoff(ralphRoot, handoff, 'accepted', reason);
}

// ---------------------------------------------------------------------------
// Lifecycle: reject
// ---------------------------------------------------------------------------

/**
 * Transition a handoff from `proposed` to `rejected`.
 */
export async function rejectHandoff(
  ralphRoot: string,
  handoffId: string,
  reason: string
): Promise<RalphHandoff> {
  const handoff = await readHandoff(ralphRoot, handoffId);

  if (handoff.status !== 'proposed') {
    throw new HandoffLifecycleError(
      `Cannot reject handoff "${handoffId}": current status is "${handoff.status}", expected "proposed".`
    );
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
export async function expireHandoff(
  ralphRoot: string,
  handoffId: string
): Promise<RalphHandoff> {
  const handoff = await readHandoff(ralphRoot, handoffId);

  const terminalStatuses: RalphHandoffStatus[] = ['rejected', 'expired', 'superseded'];
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
export async function getHandoffStatus(
  ralphRoot: string,
  handoffId: string
): Promise<RalphHandoff> {
  return readHandoff(ralphRoot, handoffId);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function writeLatestHandoffArtifacts(ralphRoot: string, handoff: RalphHandoff): Promise<void> {
  const summary = `${handoff.handoffId} ${handoff.status} ${handoff.fromAgentId} → ${handoff.toRole} for ${handoff.taskId}, expires ${handoff.expiresAt}`;
  await Promise.all([
    fs.writeFile(resolveLatestHandoffPath(ralphRoot), stableJson(handoff), 'utf8'),
    fs.writeFile(resolveLatestHandoffSummaryPath(ralphRoot), summary, 'utf8')
  ]);
}

async function readHandoff(ralphRoot: string, handoffId: string): Promise<RalphHandoff> {
  const filePath = resolveHandoffPath(ralphRoot, handoffId);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as RalphHandoff;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new HandoffLifecycleError(
        `Handoff "${handoffId}" not found at ${filePath}.`
      );
    }
    throw err;
  }
}

async function transitionHandoff(
  ralphRoot: string,
  handoff: RalphHandoff,
  to: RalphHandoffStatus,
  reason: string
): Promise<RalphHandoff> {
  const now = new Date().toISOString();
  const updated: RalphHandoff = {
    ...handoff,
    status: to,
    history: [
      ...handoff.history,
      { at: now, from: handoff.status, to, reason }
    ]
  };

  const filePath = resolveHandoffPath(ralphRoot, handoff.handoffId);
  await fs.writeFile(filePath, stableJson(updated), 'utf8');
  await writeLatestHandoffArtifacts(ralphRoot, updated);
  return updated;
}
