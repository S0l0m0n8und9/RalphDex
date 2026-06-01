import * as fs from 'fs/promises';
import * as path from 'path';
import type {
  RalphCompletionClassification,
  RalphExecutionStatus,
  RalphStopReason,
  RalphTaskStatus,
  RalphVerificationStatus
} from './types';

/**
 * Typed, append-only runtime event journal.
 *
 * This is the durable event backbone described in issue #68: a per-run,
 * append-only log of typed Ralph runtime events plus pure reducers that fold a
 * journal into a current run/task snapshot. It is deliberately additive — it
 * lives *beside* `.ralph/tasks.json` and `.ralph/state.json` rather than
 * replacing them — so consumers (provenance, diagnostics, replay, and the React
 * dashboard) can migrate onto it incrementally.
 *
 * Storage: one JSON object per line (JSONL) at
 * `<artifactsDir>/runs/<runId>/events.jsonl`, co-located with the run's
 * provenance bundles. Append-only writes keep the file diff-friendly and make
 * concurrent readers safe to tail.
 */

export const RUNTIME_EVENT_SCHEMA_VERSION = 1 as const;

export const RUNTIME_EVENT_TYPES = [
  'run_started',
  'run_completed',
  'task_selected',
  'task_state_changed',
  'provider_invoked',
  'provider_completed',
  'completion_report_parsed',
  'verifier_result',
  'remediation_applied',
  'review_result',
  'scm_action',
  'recovery_applied',
  'artifact_written',
  'workflow_phase_completed'
] as const;

export type RalphRuntimeEventType = (typeof RUNTIME_EVENT_TYPES)[number];

/** Fields stamped onto every event by the journal writer. */
export interface RuntimeEventEnvelope {
  /** Journal schema version; bump on incompatible event-shape changes. */
  schemaVersion: typeof RUNTIME_EVENT_SCHEMA_VERSION;
  /** The run this event belongs to. */
  runId: string;
  /** Monotonic, 1-based sequence number within the run. */
  seq: number;
  /** ISO-8601 timestamp of when the event was recorded. */
  timestamp: string;
  type: RalphRuntimeEventType;
}

// ---------------------------------------------------------------------------
// Per-type event bodies (the data carried beyond the common envelope)
// ---------------------------------------------------------------------------

export interface RunStartedEvent extends RuntimeEventEnvelope {
  type: 'run_started';
  /** Operator-facing label, e.g. "loop", "single", "full-workflow". */
  mode?: string;
  backlogRemaining?: number;
}

export interface RunCompletedEvent extends RuntimeEventEnvelope {
  type: 'run_completed';
  stopReason?: RalphStopReason | null;
  iterations?: number;
  backlogRemaining?: number;
}

export interface TaskSelectedEvent extends RuntimeEventEnvelope {
  type: 'task_selected';
  taskId: string;
  title?: string | null;
  iteration?: number;
}

export interface TaskStateChangedEvent extends RuntimeEventEnvelope {
  type: 'task_state_changed';
  taskId: string;
  from?: RalphTaskStatus | null;
  to: RalphTaskStatus;
  reason?: string;
}

export interface ProviderInvokedEvent extends RuntimeEventEnvelope {
  type: 'provider_invoked';
  taskId?: string | null;
  provider: string;
  iteration?: number;
}

export interface ProviderCompletedEvent extends RuntimeEventEnvelope {
  type: 'provider_completed';
  taskId?: string | null;
  provider: string;
  status: RalphExecutionStatus;
  iteration?: number;
}

export interface CompletionReportParsedEvent extends RuntimeEventEnvelope {
  type: 'completion_report_parsed';
  taskId?: string | null;
  requestedStatus?: RalphTaskStatus | null;
  parsed: boolean;
  needsHumanReview?: boolean;
}

export interface VerifierResultEvent extends RuntimeEventEnvelope {
  type: 'verifier_result';
  taskId?: string | null;
  verifier: string;
  status: RalphVerificationStatus;
  iteration?: number;
}

export interface RemediationAppliedEvent extends RuntimeEventEnvelope {
  type: 'remediation_applied';
  taskId?: string | null;
  action: string;
  applied: boolean;
}

export interface ReviewResultEvent extends RuntimeEventEnvelope {
  type: 'review_result';
  taskId?: string | null;
  status: 'passed' | 'flagged' | 'skipped';
  anomalies?: number;
}

export interface ScmActionEvent extends RuntimeEventEnvelope {
  type: 'scm_action';
  taskId?: string | null;
  action: string;
  status: 'succeeded' | 'failed' | 'skipped';
}

export interface RecoveryAppliedEvent extends RuntimeEventEnvelope {
  type: 'recovery_applied';
  taskId?: string | null;
  action: string;
  severity?: string;
}

export interface ArtifactWrittenEvent extends RuntimeEventEnvelope {
  type: 'artifact_written';
  artifactType: string;
  relativePath: string;
  iteration?: number;
}

export interface WorkflowPhaseCompletedEvent extends RuntimeEventEnvelope {
  type: 'workflow_phase_completed';
  phase: string;
  status?: 'succeeded' | 'failed' | 'skipped';
}

/** Discriminated union of every runtime event. */
export type RalphRuntimeEvent =
  | RunStartedEvent
  | RunCompletedEvent
  | TaskSelectedEvent
  | TaskStateChangedEvent
  | ProviderInvokedEvent
  | ProviderCompletedEvent
  | CompletionReportParsedEvent
  | VerifierResultEvent
  | RemediationAppliedEvent
  | ReviewResultEvent
  | ScmActionEvent
  | RecoveryAppliedEvent
  | ArtifactWrittenEvent
  | WorkflowPhaseCompletedEvent;

/** An event body without the writer-stamped envelope fields. */
export type RalphRuntimeEventInput = DistributiveOmit<
  RalphRuntimeEvent,
  'schemaVersion' | 'runId' | 'seq' | 'timestamp'
>;

// Omit that distributes over a union so the discriminant is preserved.
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

export interface EventJournalPaths {
  directory: string;
  journalPath: string;
}

/** Resolves the per-run event-journal location under the artifacts root. */
export function resolveEventJournalPaths(artifactsDir: string, runId: string): EventJournalPaths {
  const directory = path.join(artifactsDir, 'runs', runId);
  return {
    directory,
    journalPath: path.join(directory, 'events.jsonl')
  };
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

/** Serializes one event to a single JSONL line (no trailing newline). */
export function serializeEvent(event: RalphRuntimeEvent): string {
  return JSON.stringify(event);
}

/**
 * Parses a JSONL journal body into typed events. Blank lines are ignored.
 * Malformed lines throw with their 1-based line number so corruption is loud
 * rather than silently dropped.
 */
export function parseEventJournal(body: string): RalphRuntimeEvent[] {
  const events: RalphRuntimeEvent[] = [];
  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      continue;
    }
    try {
      events.push(JSON.parse(line) as RalphRuntimeEvent);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Malformed event-journal line ${i + 1}: ${message}`);
    }
  }
  return events;
}

/**
 * Like {@link parseEventJournal} but tolerant of a malformed trailing line:
 * returns every event up to (not including) the first line that fails to parse.
 *
 * A crash mid-`appendFile` (event larger than the OS atomic-write boundary, or
 * power loss mid-syscall) can leave a partial, unparseable last line. Resume
 * needs the valid prefix to continue the sequence monotonically rather than
 * failing to reopen the journal at all — so this is used only by the writer's
 * resume path. The public read path ({@link parseEventJournal}) stays strict so
 * mid-journal corruption surfaces loudly instead of being silently truncated.
 */
export function parseEventJournalResumable(body: string): RalphRuntimeEvent[] {
  const events: RalphRuntimeEvent[] = [];
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (!line) {
      continue;
    }
    try {
      events.push(JSON.parse(line) as RalphRuntimeEvent);
    } catch {
      break;
    }
  }
  return events;
}

// ---------------------------------------------------------------------------
// Writer
// ---------------------------------------------------------------------------

/**
 * Append-only writer for a single run's event journal.
 *
 * Sequence numbers are monotonic and 1-based. Use {@link EventJournalWriter.open}
 * to resume an existing journal (e.g. after a crash) so new events continue from
 * the last persisted `seq` rather than colliding with it.
 */
export class EventJournalWriter {
  private nextSeq: number;

  private constructor(
    public readonly runId: string,
    private readonly paths: EventJournalPaths,
    startSeq: number,
    private readonly clock: () => Date
  ) {
    this.nextSeq = startSeq;
  }

  /**
   * Opens (creating if needed) the journal for `runId`. If a journal already
   * exists, the next sequence number continues after the highest persisted one.
   */
  static async open(
    artifactsDir: string,
    runId: string,
    options: { clock?: () => Date } = {}
  ): Promise<EventJournalWriter> {
    const paths = resolveEventJournalPaths(artifactsDir, runId);
    let startSeq = 1;
    try {
      // Resume tolerantly: a crash mid-write can leave a partial last line, so
      // recover the valid prefix and continue after the highest persisted seq
      // rather than re-throwing and locking the journal shut.
      const existing = parseEventJournalResumable(await fs.readFile(paths.journalPath, 'utf8'));
      const maxSeq = existing.reduce((max, event) => Math.max(max, event.seq), 0);
      startSeq = maxSeq + 1;
    } catch (err) {
      if (!(err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT')) {
        throw err;
      }
    }
    // The run directory is established once here and never removed, so appends
    // need not re-stat/mkdir it on every event.
    await fs.mkdir(paths.directory, { recursive: true });
    return new EventJournalWriter(runId, paths, startSeq, options.clock ?? (() => new Date()));
  }

  /** The sequence number the next appended event will receive. */
  get peekNextSeq(): number {
    return this.nextSeq;
  }

  /** Appends one typed event, stamping envelope fields, and returns it. */
  async append(input: RalphRuntimeEventInput): Promise<RalphRuntimeEvent> {
    const event = {
      ...input,
      schemaVersion: RUNTIME_EVENT_SCHEMA_VERSION,
      runId: this.runId,
      seq: this.nextSeq,
      timestamp: this.clock().toISOString()
    } as RalphRuntimeEvent;
    await fs.appendFile(this.paths.journalPath, `${serializeEvent(event)}\n`, 'utf8');
    this.nextSeq += 1;
    return event;
  }
}

/** Reads and parses a run's event journal; returns `[]` when none exists yet. */
export async function readEventJournal(artifactsDir: string, runId: string): Promise<RalphRuntimeEvent[]> {
  const { journalPath } = resolveEventJournalPaths(artifactsDir, runId);
  try {
    return parseEventJournal(await fs.readFile(journalPath, 'utf8'));
  } catch (err) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Reducers
// ---------------------------------------------------------------------------

export interface RunTaskSnapshot {
  taskId: string;
  title: string | null;
  status: RalphTaskStatus | null;
  /** Provider invocations observed for this task within the run. */
  invocations: number;
}

export interface RunStateSnapshot {
  runId: string | null;
  status: 'idle' | 'running' | 'completed';
  startedAt: string | null;
  completedAt: string | null;
  stopReason: RalphStopReason | null;
  currentTaskId: string | null;
  lastExecutionStatus: RalphExecutionStatus | null;
  lastVerificationStatus: RalphVerificationStatus | null;
  lastCompletionClassification: RalphCompletionClassification | null;
  tasks: Record<string, RunTaskSnapshot>;
  totals: {
    events: number;
    providerInvocations: number;
    verifierPassed: number;
    verifierFailed: number;
    remediationsApplied: number;
    reviewsFlagged: number;
    artifactsWritten: number;
    phasesCompleted: number;
  };
  phasesCompleted: string[];
  lastEventSeq: number;
}

function emptySnapshot(runId: string | null): RunStateSnapshot {
  return {
    runId,
    status: 'idle',
    startedAt: null,
    completedAt: null,
    stopReason: null,
    currentTaskId: null,
    lastExecutionStatus: null,
    lastVerificationStatus: null,
    lastCompletionClassification: null,
    tasks: {},
    totals: {
      events: 0,
      providerInvocations: 0,
      verifierPassed: 0,
      verifierFailed: 0,
      remediationsApplied: 0,
      reviewsFlagged: 0,
      artifactsWritten: 0,
      phasesCompleted: 0
    },
    phasesCompleted: [],
    lastEventSeq: 0
  };
}

function ensureTask(snapshot: RunStateSnapshot, taskId: string): RunTaskSnapshot {
  const existing = snapshot.tasks[taskId];
  if (existing) {
    return existing;
  }
  const created: RunTaskSnapshot = { taskId, title: null, status: null, invocations: 0 };
  snapshot.tasks[taskId] = created;
  return created;
}

/**
 * Folds an ordered event journal into a current run/task snapshot.
 *
 * Events are processed in `seq` order (the journal is append-only, but we sort
 * defensively so out-of-order reads still reduce deterministically). The
 * reducer is pure: it never touches disk.
 */
export function reduceRunState(events: readonly RalphRuntimeEvent[]): RunStateSnapshot {
  const ordered = [...events].sort((a, b) => a.seq - b.seq);
  const snapshot = emptySnapshot(ordered.length > 0 ? ordered[0].runId : null);

  for (const event of ordered) {
    snapshot.totals.events += 1;
    snapshot.lastEventSeq = Math.max(snapshot.lastEventSeq, event.seq);
    if (!snapshot.runId) {
      snapshot.runId = event.runId;
    }

    switch (event.type) {
      case 'run_started':
        snapshot.status = 'running';
        snapshot.startedAt = event.timestamp;
        break;
      case 'run_completed':
        snapshot.status = 'completed';
        snapshot.completedAt = event.timestamp;
        snapshot.stopReason = event.stopReason ?? null;
        break;
      case 'task_selected': {
        snapshot.currentTaskId = event.taskId;
        const task = ensureTask(snapshot, event.taskId);
        if (event.title !== undefined && event.title !== null) {
          task.title = event.title;
        }
        // Selecting a task marks it active. `task_state_changed` remains the
        // authoritative source for status transitions, so we don't clobber a
        // live non-terminal status here. But a task re-selected after reaching
        // a terminal state ('done'/'blocked') is being reopened — reflect that
        // it is active again instead of leaving the stale terminal status.
        if (task.status === null || task.status === 'done' || task.status === 'blocked') {
          task.status = 'in_progress';
        }
        break;
      }
      case 'task_state_changed': {
        const task = ensureTask(snapshot, event.taskId);
        task.status = event.to;
        break;
      }
      case 'provider_invoked': {
        snapshot.totals.providerInvocations += 1;
        if (event.taskId) {
          ensureTask(snapshot, event.taskId).invocations += 1;
        }
        break;
      }
      case 'provider_completed':
        snapshot.lastExecutionStatus = event.status;
        break;
      case 'completion_report_parsed':
        // No snapshot mutation beyond totals; captured for replay/diagnostics.
        break;
      case 'verifier_result':
        snapshot.lastVerificationStatus = event.status;
        if (event.status === 'passed') {
          snapshot.totals.verifierPassed += 1;
        } else if (event.status === 'failed') {
          snapshot.totals.verifierFailed += 1;
        }
        break;
      case 'remediation_applied':
        if (event.applied) {
          snapshot.totals.remediationsApplied += 1;
        }
        break;
      case 'review_result':
        if (event.status === 'flagged') {
          snapshot.totals.reviewsFlagged += 1;
        }
        break;
      case 'scm_action':
        // Captured for the trust timeline (#73); no snapshot rollup yet.
        break;
      case 'recovery_applied':
        // Captured for diagnostics; no snapshot rollup yet.
        break;
      case 'artifact_written':
        snapshot.totals.artifactsWritten += 1;
        break;
      case 'workflow_phase_completed':
        snapshot.phasesCompleted.push(event.phase);
        snapshot.totals.phasesCompleted += 1;
        break;
      default: {
        // Exhaustiveness guard: a new event type must be handled above.
        const _exhaustive: never = event;
        void _exhaustive;
      }
    }
  }

  return snapshot;
}
