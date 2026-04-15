import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import {
  acceptHandoff,
  expireHandoff,
  getHandoffStatus,
  HandoffLifecycleError,
  isHandoffExpired,
  proposeHandoff,
  rejectHandoff,
  resolveHandoffDir,
  resolveHandoffPath,
  resolveLatestHandoffPath,
  resolveLatestHandoffSummaryPath,
  type ProposeHandoffInput
} from '../src/ralph/handoffManager';
import type { RalphHandoff } from '../src/ralph/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeTempRalphRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ralph-handoff-'));
}

function makeProposalInput(overrides: Partial<ProposeHandoffInput> = {}): ProposeHandoffInput {
  return {
    handoffId: 'h-001',
    fromAgentId: 'agent-planner',
    toRole: 'implementer',
    taskId: 'T100',
    objective: 'Implement the caching layer',
    constraints: ['Do not modify the database schema'],
    acceptedEvidence: [
      { kind: 'verifier_outcome', ref: '.ralph/artifacts/iter-010/verifier.json', summary: 'Validation passed' }
    ],
    expectedOutputContract: 'Unit tests pass, cache hit rate above 80%',
    stopConditions: ['All acceptance criteria met', 'Validation gate passes'],
    expiresAt: new Date(Date.now() + 3600_000).toISOString(), // 1 hour from now
    provenanceLinks: ['.ralph/provenance/run-010/bundle.json'],
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

test('resolveHandoffDir returns .ralph/handoffs', () => {
  const dir = resolveHandoffDir('/project/.ralph');
  assert.ok(dir.endsWith(path.join('.ralph', 'handoffs')));
});

test('resolveHandoffPath returns <handoffId>.json inside handoffs dir', () => {
  const p = resolveHandoffPath('/project/.ralph', 'h-abc');
  assert.ok(p.endsWith(path.join('handoffs', 'h-abc.json')));
});

// ---------------------------------------------------------------------------
// isHandoffExpired
// ---------------------------------------------------------------------------

test('isHandoffExpired returns true when expiresAt is in the past', () => {
  const handoff = { expiresAt: '2020-01-01T00:00:00.000Z' } as RalphHandoff;
  assert.equal(isHandoffExpired(handoff), true);
});

test('isHandoffExpired returns false when expiresAt is in the future', () => {
  const handoff = { expiresAt: new Date(Date.now() + 60_000).toISOString() } as RalphHandoff;
  assert.equal(isHandoffExpired(handoff), false);
});

test('isHandoffExpired returns true when expiresAt equals now', () => {
  const now = new Date();
  const handoff = { expiresAt: now.toISOString() } as RalphHandoff;
  assert.equal(isHandoffExpired(handoff, now), true);
});

// ---------------------------------------------------------------------------
// proposeHandoff
// ---------------------------------------------------------------------------

test('proposeHandoff creates a handoff file with proposed status', async () => {
  const ralphRoot = await makeTempRalphRoot();
  const input = makeProposalInput();

  const handoff = await proposeHandoff(ralphRoot, input);

  assert.equal(handoff.handoffId, 'h-001');
  assert.equal(handoff.status, 'proposed');
  assert.equal(handoff.fromAgentId, 'agent-planner');
  assert.equal(handoff.toRole, 'implementer');
  assert.equal(handoff.taskId, 'T100');
  assert.deepEqual(handoff.history, []);

  // File exists on disk.
  const filePath = resolveHandoffPath(ralphRoot, 'h-001');
  const raw = await fs.readFile(filePath, 'utf8');
  const persisted = JSON.parse(raw) as RalphHandoff;
  assert.equal(persisted.status, 'proposed');
});

test('proposeHandoff rejects duplicate handoff IDs', async () => {
  const ralphRoot = await makeTempRalphRoot();
  const input = makeProposalInput();

  await proposeHandoff(ralphRoot, input);

  await assert.rejects(
    () => proposeHandoff(ralphRoot, input),
    (err: unknown) => {
      assert.ok(err instanceof HandoffLifecycleError);
      assert.match(err.message, /already exists/);
      return true;
    }
  );
});

// ---------------------------------------------------------------------------
// Propose → accept → getHandoffStatus (full lifecycle)
// ---------------------------------------------------------------------------

test('propose → accept lifecycle persists accepted status and history', async () => {
  const ralphRoot = await makeTempRalphRoot();
  const input = makeProposalInput();

  await proposeHandoff(ralphRoot, input);
  const accepted = await acceptHandoff(ralphRoot, 'h-001', 'agent-impl', 'implementer', 'Ready to work');

  assert.equal(accepted.status, 'accepted');
  assert.equal(accepted.history.length, 1);
  assert.equal(accepted.history[0].from, 'proposed');
  assert.equal(accepted.history[0].to, 'accepted');
  assert.equal(accepted.history[0].reason, 'Ready to work');

  // Verify persistence via getHandoffStatus.
  const loaded = await getHandoffStatus(ralphRoot, 'h-001');
  assert.equal(loaded.status, 'accepted');
  assert.equal(loaded.history.length, 1);
});

// ---------------------------------------------------------------------------
// Propose → expire lifecycle
// ---------------------------------------------------------------------------

test('propose → expire lifecycle transitions status when past expiresAt', async () => {
  const ralphRoot = await makeTempRalphRoot();
  const input = makeProposalInput({
    expiresAt: '2020-01-01T00:00:00.000Z' // Already expired.
  });

  await proposeHandoff(ralphRoot, input);
  const expired = await expireHandoff(ralphRoot, 'h-001');

  assert.equal(expired.status, 'expired');
  assert.equal(expired.history.length, 1);
  assert.equal(expired.history[0].from, 'proposed');
  assert.equal(expired.history[0].to, 'expired');
});

test('expireHandoff is a no-op when handoff has not yet expired', async () => {
  const ralphRoot = await makeTempRalphRoot();
  const input = makeProposalInput(); // Expires 1 hour from now.

  await proposeHandoff(ralphRoot, input);
  const result = await expireHandoff(ralphRoot, 'h-001');

  assert.equal(result.status, 'proposed');
  assert.equal(result.history.length, 0);
});

test('expireHandoff is a no-op for already-expired handoff', async () => {
  const ralphRoot = await makeTempRalphRoot();
  const input = makeProposalInput({ expiresAt: '2020-01-01T00:00:00.000Z' });

  await proposeHandoff(ralphRoot, input);
  await expireHandoff(ralphRoot, 'h-001');
  const secondCall = await expireHandoff(ralphRoot, 'h-001');

  assert.equal(secondCall.status, 'expired');
  assert.equal(secondCall.history.length, 1); // Only one transition recorded.
});

// ---------------------------------------------------------------------------
// Contested status on concurrent accept attempts
// ---------------------------------------------------------------------------

test('second accept on already-accepted handoff transitions to contested', async () => {
  const ralphRoot = await makeTempRalphRoot();
  const input = makeProposalInput();

  await proposeHandoff(ralphRoot, input);
  await acceptHandoff(ralphRoot, 'h-001', 'agent-impl-1', 'implementer', 'First accept');
  const contested = await acceptHandoff(ralphRoot, 'h-001', 'agent-impl-2', 'implementer', 'Second accept');

  assert.equal(contested.status, 'contested');
  assert.equal(contested.history.length, 2);
  assert.equal(contested.history[1].from, 'accepted');
  assert.equal(contested.history[1].to, 'contested');
});

// ---------------------------------------------------------------------------
// Reject on out-of-role acceptance attempt
// ---------------------------------------------------------------------------

test('acceptHandoff rejects when accepting role does not match toRole', async () => {
  const ralphRoot = await makeTempRalphRoot();
  const input = makeProposalInput({ toRole: 'implementer' });

  await proposeHandoff(ralphRoot, input);

  await assert.rejects(
    () => acceptHandoff(ralphRoot, 'h-001', 'agent-rev', 'reviewer', 'I want to help'),
    (err: unknown) => {
      assert.ok(err instanceof HandoffLifecycleError);
      assert.match(err.message, /does not match target role/);
      return true;
    }
  );

  // Handoff remains proposed.
  const status = await getHandoffStatus(ralphRoot, 'h-001');
  assert.equal(status.status, 'proposed');
});

// ---------------------------------------------------------------------------
// Reject lifecycle
// ---------------------------------------------------------------------------

test('rejectHandoff transitions proposed to rejected', async () => {
  const ralphRoot = await makeTempRalphRoot();
  await proposeHandoff(ralphRoot, makeProposalInput());

  const rejected = await rejectHandoff(ralphRoot, 'h-001', 'Not in scope');

  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.history.length, 1);
  assert.equal(rejected.history[0].from, 'proposed');
  assert.equal(rejected.history[0].to, 'rejected');
});

test('rejectHandoff fails on non-proposed handoff', async () => {
  const ralphRoot = await makeTempRalphRoot();
  await proposeHandoff(ralphRoot, makeProposalInput());
  await acceptHandoff(ralphRoot, 'h-001', 'agent-impl', 'implementer', 'On it');

  await assert.rejects(
    () => rejectHandoff(ralphRoot, 'h-001', 'Too late'),
    (err: unknown) => {
      assert.ok(err instanceof HandoffLifecycleError);
      assert.match(err.message, /expected "proposed"/);
      return true;
    }
  );
});

// ---------------------------------------------------------------------------
// acceptHandoff fails on expired handoff
// ---------------------------------------------------------------------------

test('acceptHandoff rejects expired handoff and auto-transitions to expired', async () => {
  const ralphRoot = await makeTempRalphRoot();
  await proposeHandoff(ralphRoot, makeProposalInput({
    expiresAt: '2020-01-01T00:00:00.000Z'
  }));

  await assert.rejects(
    () => acceptHandoff(ralphRoot, 'h-001', 'agent-impl', 'implementer', 'Trying'),
    (err: unknown) => {
      assert.ok(err instanceof HandoffLifecycleError);
      assert.match(err.message, /has expired/);
      return true;
    }
  );

  // Status should be expired on disk.
  const loaded = await getHandoffStatus(ralphRoot, 'h-001');
  assert.equal(loaded.status, 'expired');
});

// ---------------------------------------------------------------------------
// getHandoffStatus — missing handoff
// ---------------------------------------------------------------------------

test('getHandoffStatus throws for non-existent handoff', async () => {
  const ralphRoot = await makeTempRalphRoot();

  await assert.rejects(
    () => getHandoffStatus(ralphRoot, 'does-not-exist'),
    (err: unknown) => {
      assert.ok(err instanceof HandoffLifecycleError);
      assert.match(err.message, /not found/);
      return true;
    }
  );
});

// ---------------------------------------------------------------------------
// latest-handoff artifacts (Phase 4)
// ---------------------------------------------------------------------------

test('proposeHandoff writes latest-handoff.json to ralphRoot', async () => {
  const ralphRoot = await makeTempRalphRoot();
  const handoff = await proposeHandoff(ralphRoot, makeProposalInput());

  const latestPath = resolveLatestHandoffPath(ralphRoot);
  const raw = await fs.readFile(latestPath, 'utf8');
  const latest = JSON.parse(raw) as RalphHandoff;

  assert.equal(latest.handoffId, handoff.handoffId);
  assert.equal(latest.status, 'proposed');
});

test('proposeHandoff writes latest-handoff-summary.md to ralphRoot', async () => {
  const ralphRoot = await makeTempRalphRoot();
  await proposeHandoff(ralphRoot, makeProposalInput());

  const summaryPath = resolveLatestHandoffSummaryPath(ralphRoot);
  const summary = await fs.readFile(summaryPath, 'utf8');

  assert.match(summary, /h-001/);
  assert.match(summary, /proposed/);
  assert.match(summary, /agent-planner/);
  assert.match(summary, /implementer/);
  assert.match(summary, /T100/);
});

test('acceptHandoff updates latest-handoff.json with accepted status', async () => {
  const ralphRoot = await makeTempRalphRoot();
  await proposeHandoff(ralphRoot, makeProposalInput());
  await acceptHandoff(ralphRoot, 'h-001', 'agent-impl', 'implementer', 'Ready');

  const latestPath = resolveLatestHandoffPath(ralphRoot);
  const raw = await fs.readFile(latestPath, 'utf8');
  const latest = JSON.parse(raw) as RalphHandoff;

  assert.equal(latest.status, 'accepted');
  assert.equal(latest.handoffId, 'h-001');
});
