import assert from 'node:assert/strict';
import test from 'node:test';
import {
  drivePipelineRun,
  type PipelineRoleRunners,
  type PipelineStartPhase
} from '../src/ralph/pipelineDriver';
import type { PipelineRunArtifact } from '../src/ralph/pipeline';

// ---------------------------------------------------------------------------
// Full-workflow ("Run Full Workflow") contract tests.
//
// These exercise the loop -> review -> SCM -> done phase sequencer with fake
// role runners (no provider, no verifier, no Git, no Extension Host), so the
// default `npm run validate` gate covers role sequencing, stop reasons, and the
// PR-artifact shape without any real GitHub calls. Everything here is in-memory
// and synchronous-fast.
// ---------------------------------------------------------------------------

const FIXED_NOW = '2026-05-31T00:00:00.000Z';

function baseArtifact(overrides: Partial<PipelineRunArtifact> = {}): PipelineRunArtifact {
  return {
    schemaVersion: 1,
    kind: 'pipelineRun',
    runId: 'pipeline-20260531T000000Z-abcd',
    prdHash: 'hash',
    prdPath: '.ralph/prd.md',
    rootTaskId: 'T1',
    decomposedTaskIds: ['T1', 'T2'],
    loopStartTime: FIXED_NOW,
    status: 'running',
    phase: 'scaffold',
    ...overrides
  };
}

interface DriveHarness {
  checkpoints: PipelineRunArtifact[];
  progressMessages: string[];
  errors: Array<{ message: string; error: unknown }>;
  calls: PipelineStartPhase[];
  phaseEvents: Array<{ phase: string; status: 'succeeded' | 'failed' | 'skipped'; taskId: string | null }>;
}

async function drive(
  startPhase: PipelineStartPhase,
  runnerOverrides: Partial<PipelineRoleRunners>,
  artifact: PipelineRunArtifact = baseArtifact()
): Promise<DriveHarness & { result: Awaited<ReturnType<typeof drivePipelineRun>> }> {
  const harness: DriveHarness = { checkpoints: [], progressMessages: [], errors: [], calls: [], phaseEvents: [] };

  const provided: PipelineRoleRunners = {
    runLoop: async () => {},
    runReview: async () => undefined,
    runScm: async () => undefined,
    ...runnerOverrides
  };

  // Wrap each runner so `calls` records every invocation regardless of whether
  // the test supplied an override, while still returning the override's value.
  const runners: PipelineRoleRunners = {
    runLoop: async () => {
      harness.calls.push('loop');
      return provided.runLoop();
    },
    runReview: async () => {
      harness.calls.push('review');
      return provided.runReview();
    },
    runScm: async () => {
      harness.calls.push('scm');
      return provided.runScm();
    }
  };

  const result = await drivePipelineRun({
    startPhase,
    artifact,
    runners,
    checkpoint: async (next) => {
      // Capture a snapshot to prove each checkpoint is a fresh merged object.
      harness.checkpoints.push({ ...next });
    },
    journalWorkflowPhaseCompleted: async (event) => {
      harness.phaseEvents.push(event);
    },
    reportProgress: (message) => harness.progressMessages.push(message),
    onError: (message, error) => harness.errors.push({ message, error }),
    now: () => FIXED_NOW
  });

  return { ...harness, result };
}

test('drivePipelineRun runs loop -> review -> scm in order on the happy path', async () => {
  const h = await drive('loop', {
    runReview: async () => ({ transcriptPath: '.ralph/artifacts/review.txt' }),
    runScm: async () => ({ prUrl: 'https://github.com/acme/repo/pull/7' })
  });

  // Role sequencing: every role attempted, in order.
  assert.deepEqual(h.result.rolesRun, ['loop', 'review', 'scm']);
  assert.deepEqual(h.calls, ['loop', 'review', 'scm']);
  assert.equal(h.result.status, 'complete');

  // Checkpoint phase progression: loop -> review -> done.
  assert.deepEqual(h.checkpoints.map((c) => c.phase), ['loop', 'review', 'done']);
  assert.deepEqual(h.phaseEvents, [
    { phase: 'loop', status: 'succeeded', taskId: 'T1' },
    { phase: 'review', status: 'succeeded', taskId: 'T1' },
    { phase: 'scm', status: 'succeeded', taskId: 'T1' },
    { phase: 'done', status: 'succeeded', taskId: 'T1' }
  ]);

  // PR-artifact shape: PR URL + review transcript propagate onto the final artifact.
  assert.equal(h.result.artifact.status, 'complete');
  assert.equal(h.result.artifact.phase, 'done');
  assert.equal(h.result.artifact.prUrl, 'https://github.com/acme/repo/pull/7');
  assert.equal(h.result.artifact.reviewTranscriptPath, '.ralph/artifacts/review.txt');
  assert.equal(h.result.artifact.loopEndTime, FIXED_NOW);
});

test('drivePipelineRun stops before review/SCM when the loop fails', async () => {
  const loopError = new Error('provider crashed');
  const h = await drive('loop', {
    runLoop: async () => {
      throw loopError;
    }
  });

  // Stop reason: a loop failure is terminal — review and SCM never run.
  assert.deepEqual(h.result.rolesRun, ['loop']);
  assert.deepEqual(h.calls, ['loop']);
  assert.equal(h.result.status, 'failed');

  // Only the finalize checkpoint is written (the post-loop checkpoint is skipped).
  assert.deepEqual(h.checkpoints.map((c) => c.phase), ['done']);
  assert.deepEqual(h.phaseEvents, [
    { phase: 'loop', status: 'failed', taskId: 'T1' },
    { phase: 'done', status: 'failed', taskId: 'T1' }
  ]);
  assert.equal(h.result.artifact.status, 'failed');
  assert.equal(h.result.artifact.prUrl, undefined);

  // The failure is surfaced through onError, not swallowed.
  assert.equal(h.errors.length, 1);
  assert.equal(h.errors[0].error, loopError);
  assert.match(h.errors[0].message, /loop failed/i);
});

test('drivePipelineRun skips SCM but stays complete when review fails', async () => {
  const reviewError = new Error('review agent error');
  const h = await drive('loop', {
    runReview: async () => {
      throw reviewError;
    }
  });

  // Review failure short-circuits SCM but is NOT a terminal run failure.
  assert.deepEqual(h.result.rolesRun, ['loop', 'review']);
  assert.equal(h.result.status, 'complete');
  assert.deepEqual(h.checkpoints.map((c) => c.phase), ['loop', 'done']);
  assert.deepEqual(h.phaseEvents, [
    { phase: 'loop', status: 'succeeded', taskId: 'T1' },
    { phase: 'review', status: 'failed', taskId: 'T1' },
    { phase: 'scm', status: 'skipped', taskId: 'T1' },
    { phase: 'done', status: 'succeeded', taskId: 'T1' }
  ]);
  assert.equal(h.result.artifact.status, 'complete');
  assert.equal(h.result.artifact.prUrl, undefined);
  assert.equal(h.errors.length, 1);
  assert.equal(h.errors[0].error, reviewError);
  // The review catch names only the review phase (SCM never ran here).
  assert.match(h.errors[0].message, /review phase failed/i);
  assert.doesNotMatch(h.errors[0].message, /SCM/i);
});

test('drivePipelineRun logs the SCM failure but stays complete with no PR URL', async () => {
  const scmError = new Error('git push rejected');
  const h = await drive('loop', {
    runScm: async () => {
      throw scmError;
    }
  });

  // SCM is attempted (all roles run) but its failure is non-terminal: the run
  // still finalizes as `complete` and simply carries no PR URL.
  assert.deepEqual(h.result.rolesRun, ['loop', 'review', 'scm']);
  assert.equal(h.result.status, 'complete');
  assert.deepEqual(h.checkpoints.map((c) => c.phase), ['loop', 'review', 'done']);
  assert.deepEqual(h.phaseEvents, [
    { phase: 'loop', status: 'succeeded', taskId: 'T1' },
    { phase: 'review', status: 'succeeded', taskId: 'T1' },
    { phase: 'scm', status: 'failed', taskId: 'T1' },
    { phase: 'done', status: 'succeeded', taskId: 'T1' }
  ]);
  assert.equal('prUrl' in h.result.artifact, false);
  assert.equal(h.errors.length, 1);
  assert.equal(h.errors[0].error, scmError);
  assert.match(h.errors[0].message, /SCM phase failed/i);
});

test('drivePipelineRun resumes at the review phase without re-running the loop', async () => {
  const h = await drive('review', {
    runReview: async () => ({ transcriptPath: '.ralph/artifacts/review.txt' }),
    runScm: async () => ({ prUrl: 'https://github.com/acme/repo/pull/9' })
  });

  assert.deepEqual(h.result.rolesRun, ['review', 'scm']);
  assert.deepEqual(h.calls, ['review', 'scm']);
  assert.equal(h.result.status, 'complete');
  assert.deepEqual(h.checkpoints.map((c) => c.phase), ['review', 'done']);
  assert.equal(h.result.artifact.prUrl, 'https://github.com/acme/repo/pull/9');
});

test('drivePipelineRun resumes at the SCM phase without loop or review', async () => {
  const h = await drive('scm', {
    runScm: async () => ({ prUrl: 'https://github.com/acme/repo/pull/11' })
  });

  assert.deepEqual(h.result.rolesRun, ['scm']);
  assert.deepEqual(h.calls, ['scm']);
  assert.equal(h.result.status, 'complete');
  assert.deepEqual(h.checkpoints.map((c) => c.phase), ['done']);
  assert.equal(h.result.artifact.prUrl, 'https://github.com/acme/repo/pull/11');
});

test('drivePipelineRun omits prUrl and reviewTranscriptPath when runners report none', async () => {
  const h = await drive('loop', {
    runReview: async () => undefined,
    runScm: async () => undefined
  });

  assert.deepEqual(h.result.rolesRun, ['loop', 'review', 'scm']);
  // Optional keys must be absent (not set to undefined) to keep the artifact tidy.
  assert.equal('prUrl' in h.result.artifact, false);
  assert.equal('reviewTranscriptPath' in h.result.artifact, false);

  const reviewCheckpoint = h.checkpoints.find((c) => c.phase === 'review');
  assert.ok(reviewCheckpoint);
  assert.equal('reviewTranscriptPath' in reviewCheckpoint, false);
});

test('drivePipelineRun reports a progress message for each attempted role', async () => {
  const h = await drive('loop', {});

  assert.equal(h.progressMessages.length, 3);
  assert.match(h.progressMessages[0], /multi-agent loop/i);
  assert.match(h.progressMessages[1], /review agent/i);
  assert.match(h.progressMessages[2], /SCM agent/i);
});

test('drivePipelineRun does not mutate the input artifact', async () => {
  const input = baseArtifact();
  const snapshot = { ...input };
  await drive('loop', { runScm: async () => ({ prUrl: 'https://github.com/acme/repo/pull/3' }) }, input);
  assert.deepEqual(input, snapshot);
});
