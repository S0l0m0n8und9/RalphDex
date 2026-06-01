import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  EventJournalWriter,
  parseEventJournal,
  readEventJournal,
  reduceRunState,
  resolveEventJournalPaths,
  RUNTIME_EVENT_SCHEMA_VERSION,
  RUNTIME_EVENT_TYPES,
  serializeEvent,
  type RalphRuntimeEvent
} from '../src/ralph/eventJournal';

async function tmpArtifactsDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ralph-events-'));
}

function fixedClock(): () => Date {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++));
}

test('resolveEventJournalPaths co-locates the journal with the run bundle', () => {
  const { directory, journalPath } = resolveEventJournalPaths('/ws/.ralph/artifacts', 'run-7');
  assert.equal(directory, path.join('/ws/.ralph/artifacts', 'runs', 'run-7'));
  assert.equal(journalPath, path.join('/ws/.ralph/artifacts', 'runs', 'run-7', 'events.jsonl'));
});

test('writer stamps envelope fields with monotonic 1-based seq and appends JSONL', async (t) => {
  const dir = await tmpArtifactsDir();
  t.after(() => fs.rm(dir, { recursive: true, force: true }));

  const writer = await EventJournalWriter.open(dir, 'run-1', { clock: fixedClock() });
  assert.equal(writer.peekNextSeq, 1);

  const first = await writer.append({ type: 'run_started', mode: 'loop', backlogRemaining: 3 });
  const second = await writer.append({ type: 'task_selected', taskId: 'T1', title: 'First' });

  assert.deepEqual(
    { schemaVersion: first.schemaVersion, runId: first.runId, seq: first.seq, type: first.type },
    { schemaVersion: RUNTIME_EVENT_SCHEMA_VERSION, runId: 'run-1', seq: 1, type: 'run_started' }
  );
  assert.equal(second.seq, 2);
  assert.match(first.timestamp, /^\d{4}-\d{2}-\d{2}T/);

  const onDisk = parseEventJournal(
    await fs.readFile(resolveEventJournalPaths(dir, 'run-1').journalPath, 'utf8')
  );
  assert.equal(onDisk.length, 2);
  assert.deepEqual(onDisk.map((e) => e.seq), [1, 2]);
});

test('writer.open resumes the sequence after an existing journal', async (t) => {
  const dir = await tmpArtifactsDir();
  t.after(() => fs.rm(dir, { recursive: true, force: true }));

  const first = await EventJournalWriter.open(dir, 'run-resume', { clock: fixedClock() });
  await first.append({ type: 'run_started' });
  await first.append({ type: 'task_selected', taskId: 'T1' });

  // Simulate a crash + restart: a fresh writer must not reuse seq 1/2.
  const resumed = await EventJournalWriter.open(dir, 'run-resume', { clock: fixedClock() });
  assert.equal(resumed.peekNextSeq, 3);
  const next = await resumed.append({ type: 'provider_invoked', provider: 'codex', taskId: 'T1' });
  assert.equal(next.seq, 3);

  const events = await readEventJournal(dir, 'run-resume');
  assert.deepEqual(events.map((e) => e.seq), [1, 2, 3]);
});

test('serializeEvent round-trips through parseEventJournal', () => {
  const event: RalphRuntimeEvent = {
    schemaVersion: RUNTIME_EVENT_SCHEMA_VERSION,
    runId: 'run-x',
    seq: 9,
    timestamp: '2026-01-01T00:00:00.000Z',
    type: 'verifier_result',
    verifier: 'validationCommand',
    status: 'passed'
  };
  const [parsed] = parseEventJournal(serializeEvent(event));
  assert.deepEqual(parsed, event);
});

test('parseEventJournal skips blank lines and throws on malformed lines with line numbers', () => {
  const body = ['{"seq":1,"type":"run_started","runId":"r","schemaVersion":1,"timestamp":"t"}', '', '   ', 'not json'].join(
    '\n'
  );
  assert.throws(() => parseEventJournal(body), /Malformed event-journal line 4/);
});

test('readEventJournal returns an empty list when no journal exists', async (t) => {
  const dir = await tmpArtifactsDir();
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  assert.deepEqual(await readEventJournal(dir, 'never-written'), []);
});

test('reduceRunState folds a full iteration lifecycle into a snapshot', async (t) => {
  const dir = await tmpArtifactsDir();
  t.after(() => fs.rm(dir, { recursive: true, force: true }));

  const writer = await EventJournalWriter.open(dir, 'run-life', { clock: fixedClock() });
  await writer.append({ type: 'run_started', mode: 'loop', backlogRemaining: 2 });
  await writer.append({ type: 'task_selected', taskId: 'T1', title: 'Build feature', iteration: 1 });
  await writer.append({ type: 'provider_invoked', provider: 'codex', taskId: 'T1', iteration: 1 });
  await writer.append({ type: 'provider_completed', provider: 'codex', taskId: 'T1', status: 'succeeded' });
  await writer.append({ type: 'completion_report_parsed', taskId: 'T1', requestedStatus: 'done', parsed: true });
  await writer.append({ type: 'verifier_result', verifier: 'validationCommand', status: 'passed', taskId: 'T1' });
  await writer.append({ type: 'verifier_result', verifier: 'gitDiff', status: 'failed', taskId: 'T1' });
  await writer.append({ type: 'review_result', taskId: 'T1', status: 'flagged', anomalies: 1 });
  await writer.append({ type: 'remediation_applied', taskId: 'T1', action: 'decompose_task', applied: true });
  await writer.append({ type: 'artifact_written', artifactType: 'iteration-result', relativePath: 'iteration-001/iteration-result.json' });
  await writer.append({ type: 'scm_action', taskId: 'T1', action: 'commit', status: 'succeeded' });
  await writer.append({ type: 'task_state_changed', taskId: 'T1', from: 'in_progress', to: 'done' });
  await writer.append({ type: 'workflow_phase_completed', phase: 'review', status: 'succeeded' });
  await writer.append({ type: 'run_completed', stopReason: 'task_marked_complete', iterations: 1, backlogRemaining: 0 });

  const snapshot = reduceRunState(await readEventJournal(dir, 'run-life'));

  assert.equal(snapshot.runId, 'run-life');
  assert.equal(snapshot.status, 'completed');
  assert.equal(snapshot.stopReason, 'task_marked_complete');
  assert.equal(snapshot.currentTaskId, 'T1');
  assert.equal(snapshot.lastExecutionStatus, 'succeeded');
  assert.equal(snapshot.lastVerificationStatus, 'failed');
  assert.deepEqual(snapshot.phasesCompleted, ['review']);
  assert.deepEqual(snapshot.tasks.T1, {
    taskId: 'T1',
    title: 'Build feature',
    status: 'done',
    invocations: 1
  });
  assert.deepEqual(snapshot.totals, {
    events: 14,
    providerInvocations: 1,
    verifierPassed: 1,
    verifierFailed: 1,
    remediationsApplied: 1,
    reviewsFlagged: 1,
    artifactsWritten: 1,
    phasesCompleted: 1
  });
  assert.equal(snapshot.lastEventSeq, 14);
});

test('reduceRunState defensively orders by seq and handles the empty journal', () => {
  const empty = reduceRunState([]);
  assert.equal(empty.runId, null);
  assert.equal(empty.status, 'idle');
  assert.equal(empty.totals.events, 0);

  const base = {
    schemaVersion: RUNTIME_EVENT_SCHEMA_VERSION,
    runId: 'r',
    timestamp: '2026-01-01T00:00:00.000Z'
  } as const;
  const outOfOrder: RalphRuntimeEvent[] = [
    { ...base, seq: 3, type: 'task_state_changed', taskId: 'T1', to: 'done' },
    { ...base, seq: 1, type: 'run_started' },
    { ...base, seq: 2, type: 'task_selected', taskId: 'T1', title: 'X' }
  ];
  const snapshot = reduceRunState(outOfOrder);
  assert.equal(snapshot.status, 'running');
  assert.equal(snapshot.tasks.T1.status, 'done');
  assert.equal(snapshot.lastEventSeq, 3);
});

test('every declared event type is unique and reduces without throwing', () => {
  assert.equal(new Set(RUNTIME_EVENT_TYPES).size, RUNTIME_EVENT_TYPES.length);
  // Smoke-reduce a minimal event of each type to guard the exhaustiveness switch.
  const minimal: Record<string, Partial<RalphRuntimeEvent>> = {
    run_started: {},
    run_completed: {},
    task_selected: { taskId: 'T1' },
    task_state_changed: { taskId: 'T1', to: 'done' },
    provider_invoked: { provider: 'codex' },
    provider_completed: { provider: 'codex', status: 'succeeded' },
    completion_report_parsed: { parsed: true },
    verifier_result: { verifier: 'v', status: 'passed' },
    remediation_applied: { action: 'a', applied: true },
    review_result: { status: 'passed' },
    scm_action: { action: 'commit', status: 'succeeded' },
    recovery_applied: { action: 'resolve_stale_claim' },
    artifact_written: { artifactType: 't', relativePath: 'p' },
    workflow_phase_completed: { phase: 'p' }
  };
  const events = RUNTIME_EVENT_TYPES.map((type, i) => ({
    schemaVersion: RUNTIME_EVENT_SCHEMA_VERSION,
    runId: 'r',
    seq: i + 1,
    timestamp: '2026-01-01T00:00:00.000Z',
    type,
    ...minimal[type]
  })) as RalphRuntimeEvent[];
  const snapshot = reduceRunState(events);
  assert.equal(snapshot.totals.events, RUNTIME_EVENT_TYPES.length);
});
