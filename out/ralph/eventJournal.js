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
exports.EventJournalWriter = exports.RUNTIME_EVENT_TYPES = exports.RUNTIME_EVENT_SCHEMA_VERSION = void 0;
exports.resolveEventJournalPaths = resolveEventJournalPaths;
exports.serializeEvent = serializeEvent;
exports.parseEventJournal = parseEventJournal;
exports.readEventJournal = readEventJournal;
exports.reduceRunState = reduceRunState;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
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
exports.RUNTIME_EVENT_SCHEMA_VERSION = 1;
exports.RUNTIME_EVENT_TYPES = [
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
];
/** Resolves the per-run event-journal location under the artifacts root. */
function resolveEventJournalPaths(artifactsDir, runId) {
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
function serializeEvent(event) {
    return JSON.stringify(event);
}
/**
 * Parses a JSONL journal body into typed events. Blank lines are ignored.
 * Malformed lines throw with their 1-based line number so corruption is loud
 * rather than silently dropped.
 */
function parseEventJournal(body) {
    const events = [];
    const lines = body.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) {
            continue;
        }
        try {
            events.push(JSON.parse(line));
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            throw new Error(`Malformed event-journal line ${i + 1}: ${message}`);
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
class EventJournalWriter {
    runId;
    paths;
    clock;
    nextSeq;
    constructor(runId, paths, startSeq, clock) {
        this.runId = runId;
        this.paths = paths;
        this.clock = clock;
        this.nextSeq = startSeq;
    }
    /**
     * Opens (creating if needed) the journal for `runId`. If a journal already
     * exists, the next sequence number continues after the highest persisted one.
     */
    static async open(artifactsDir, runId, options = {}) {
        const paths = resolveEventJournalPaths(artifactsDir, runId);
        let startSeq = 1;
        try {
            const existing = parseEventJournal(await fs.readFile(paths.journalPath, 'utf8'));
            const maxSeq = existing.reduce((max, event) => Math.max(max, event.seq), 0);
            startSeq = maxSeq + 1;
        }
        catch (err) {
            if (!(err instanceof Error && 'code' in err && err.code === 'ENOENT')) {
                throw err;
            }
        }
        return new EventJournalWriter(runId, paths, startSeq, options.clock ?? (() => new Date()));
    }
    /** The sequence number the next appended event will receive. */
    get peekNextSeq() {
        return this.nextSeq;
    }
    /** Appends one typed event, stamping envelope fields, and returns it. */
    async append(input) {
        const event = {
            ...input,
            schemaVersion: exports.RUNTIME_EVENT_SCHEMA_VERSION,
            runId: this.runId,
            seq: this.nextSeq,
            timestamp: this.clock().toISOString()
        };
        await fs.mkdir(this.paths.directory, { recursive: true });
        await fs.appendFile(this.paths.journalPath, `${serializeEvent(event)}\n`, 'utf8');
        this.nextSeq += 1;
        return event;
    }
}
exports.EventJournalWriter = EventJournalWriter;
/** Reads and parses a run's event journal; returns `[]` when none exists yet. */
async function readEventJournal(artifactsDir, runId) {
    const { journalPath } = resolveEventJournalPaths(artifactsDir, runId);
    try {
        return parseEventJournal(await fs.readFile(journalPath, 'utf8'));
    }
    catch (err) {
        if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
            return [];
        }
        throw err;
    }
}
function emptySnapshot(runId) {
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
function ensureTask(snapshot, taskId) {
    const existing = snapshot.tasks[taskId];
    if (existing) {
        return existing;
    }
    const created = { taskId, title: null, status: null, invocations: 0 };
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
function reduceRunState(events) {
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
                if (task.status === null) {
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
                }
                else if (event.status === 'failed') {
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
                const _exhaustive = event;
                void _exhaustive;
            }
        }
    }
    return snapshot;
}
//# sourceMappingURL=eventJournal.js.map