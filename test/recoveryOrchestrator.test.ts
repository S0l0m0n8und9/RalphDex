import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import type { FailureAnalysis } from '../src/ralph/failureDiagnostics';
import {
  dispatchRecovery,
  getRecoveryStatePath,
  type RecoveryContext
} from '../src/ralph/recoveryOrchestrator';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAnalysis(override: Partial<FailureAnalysis> = {}): FailureAnalysis {
  return {
    schemaVersion: 1,
    kind: 'failureAnalysis',
    taskId: 'T1',
    createdAt: new Date().toISOString(),
    rootCauseCategory: 'transient',
    confidence: 'high',
    summary: 'Test failure.',
    suggestedAction: 'Retry.',
    ...override
  };
}

function makeContext(
  artifactRootDir: string,
  override: Partial<RecoveryContext> = {}
): RecoveryContext {
  return {
    taskId: 'T1',
    taskTitle: 'Test Task',
    analysis: makeAnalysis(),
    artifactRootDir,
    maxRecoveryAttempts: 3,
    autoApplyRemediation: ['decompose_task'],
    releaseClaim: async () => {},
    emitOperatorNotification: async () => {},
    ...override
  };
}

// ---------------------------------------------------------------------------
// AC 11: transient failure triggers auto-retry with backoff without LLM call
// ---------------------------------------------------------------------------

test('transient failure returns retry_with_backoff action', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-recovery-'));
  try {
    let releaseClaimCalled = false;
    let notificationEmitted = false;

    const decision = await dispatchRecovery(makeContext(tmpDir, {
      analysis: makeAnalysis({ rootCauseCategory: 'transient' }),
      releaseClaim: async () => { releaseClaimCalled = true; },
      emitOperatorNotification: async () => { notificationEmitted = true; }
    }));

    assert.equal(decision.action, 'retry_with_backoff');
    assert.ok(typeof decision.backoffMs === 'number' && decision.backoffMs > 0, 'backoffMs should be positive');
    assert.equal(decision.pauseAgent, false);
    assert.equal(decision.escalated, false);
    assert.equal(decision.attemptCount, 1);
    // No claim release and no operator notification — transient path is self-contained.
    assert.equal(releaseClaimCalled, false);
    assert.equal(notificationEmitted, false);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('transient failure backoff grows exponentially on subsequent attempts', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-recovery-'));
  try {
    const ctx = makeContext(tmpDir, { analysis: makeAnalysis({ rootCauseCategory: 'transient' }) });

    const first = await dispatchRecovery(ctx);
    const second = await dispatchRecovery(ctx);
    const third = await dispatchRecovery(ctx);

    assert.ok(first.backoffMs! < second.backoffMs!, 'backoff should grow on second attempt');
    assert.ok(second.backoffMs! < third.backoffMs!, 'backoff should grow on third attempt');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('transient failure attempt count resets when category changes', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-recovery-'));
  try {
    const ctx = makeContext(tmpDir, { analysis: makeAnalysis({ rootCauseCategory: 'transient' }) });

    // Accumulate two transient attempts.
    await dispatchRecovery(ctx);
    await dispatchRecovery(ctx);

    // Now switch to a different category — count should reset to 1.
    const decision = await dispatchRecovery(makeContext(tmpDir, {
      analysis: makeAnalysis({ rootCauseCategory: 'implementation_error' })
    }));
    assert.equal(decision.attemptCount, 1);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// AC 12: implementation_error injects retryPromptAddendum into next prompt
// ---------------------------------------------------------------------------

test('implementation_error returns retry_with_addendum with the addendum text', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-recovery-'));
  try {
    const addendum = 'Focus on type safety in the new module.';
    const decision = await dispatchRecovery(makeContext(tmpDir, {
      analysis: makeAnalysis({ rootCauseCategory: 'implementation_error', retryPromptAddendum: addendum }),
      autoApplyRemediation: []
    }));

    assert.equal(decision.action, 'retry_with_addendum');
    assert.equal(decision.retryPromptAddendum, addendum);
    assert.equal(decision.pauseAgent, false);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('implementation_error persists retryPromptAddendum in recovery-state.json', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-recovery-'));
  try {
    const addendum = 'Check the return type of processResult.';
    await dispatchRecovery(makeContext(tmpDir, {
      analysis: makeAnalysis({ rootCauseCategory: 'implementation_error', retryPromptAddendum: addendum })
    }));

    const stateText = await fs.readFile(getRecoveryStatePath(tmpDir, 'T1'), 'utf8');
    const state = JSON.parse(stateText);
    assert.equal(state.retryPromptAddendum, addendum);
    assert.equal(state.kind, 'recoveryState');
    assert.equal(state.schemaVersion, 1);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('validation_mismatch also returns retry_with_addendum', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-recovery-'));
  try {
    const decision = await dispatchRecovery(makeContext(tmpDir, {
      analysis: makeAnalysis({ rootCauseCategory: 'validation_mismatch', retryPromptAddendum: 'Check output format.' })
    }));
    assert.equal(decision.action, 'retry_with_addendum');
    assert.equal(decision.retryPromptAddendum, 'Check output format.');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// AC 13: dependency_missing releases claim and pauses
// ---------------------------------------------------------------------------

test('dependency_missing releases claim and returns pause when autoApplyRemediation is set', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-recovery-'));
  try {
    let claimReleased = false;
    const decision = await dispatchRecovery(makeContext(tmpDir, {
      analysis: makeAnalysis({ rootCauseCategory: 'dependency_missing' }),
      autoApplyRemediation: ['decompose_task'],
      releaseClaim: async () => { claimReleased = true; }
    }));

    assert.equal(decision.action, 'release_claim_and_pause');
    assert.equal(decision.pauseAgent, true);
    assert.ok(claimReleased, 'releaseClaim callback should have been invoked');
    assert.equal(decision.autoApplied, true);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('dependency_missing does NOT release claim when autoApplyRemediation is empty', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-recovery-'));
  try {
    let claimReleased = false;
    const decision = await dispatchRecovery(makeContext(tmpDir, {
      analysis: makeAnalysis({ rootCauseCategory: 'dependency_missing' }),
      autoApplyRemediation: [],
      releaseClaim: async () => { claimReleased = true; }
    }));

    assert.equal(decision.action, 'release_claim_and_pause');
    assert.equal(decision.pauseAgent, true);
    assert.equal(claimReleased, false, 'releaseClaim should NOT be called when autoApplyRemediation is empty');
    assert.equal(decision.autoApplied, false);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// AC 14: escalate_to_operator pauses agent and emits notification
// ---------------------------------------------------------------------------

test('escalate_to_operator is triggered when maxRecoveryAttempts is exceeded', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-recovery-'));
  try {
    const ctx = makeContext(tmpDir, {
      analysis: makeAnalysis({ rootCauseCategory: 'transient' }),
      maxRecoveryAttempts: 1,
      autoApplyRemediation: ['decompose_task']
    });

    // First attempt: within limit.
    const first = await dispatchRecovery(ctx);
    assert.equal(first.action, 'retry_with_backoff');

    // Second attempt: exceeds maxRecoveryAttempts=1 → escalate.
    let emittedMessage = '';
    const second = await dispatchRecovery({ ...ctx, emitOperatorNotification: async (msg) => { emittedMessage = msg; } });

    assert.equal(second.action, 'escalate_to_operator');
    assert.equal(second.pauseAgent, true);
    assert.ok(second.escalated);
    assert.ok(emittedMessage.length > 0, 'operator notification message should be emitted');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('escalate_to_operator does NOT emit notification when autoApplyRemediation is empty', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-recovery-'));
  try {
    const ctx = makeContext(tmpDir, {
      analysis: makeAnalysis({ rootCauseCategory: 'transient' }),
      maxRecoveryAttempts: 0,
      autoApplyRemediation: []
    });

    let notified = false;
    const decision = await dispatchRecovery({ ...ctx, emitOperatorNotification: async () => { notified = true; } });

    assert.equal(decision.action, 'escalate_to_operator');
    assert.equal(decision.pauseAgent, true);
    assert.equal(notified, false, 'no notification should be emitted when autoApplyRemediation is empty');
    assert.equal(decision.autoApplied, false);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Additional coverage: task_ambiguity and environment_issue playbooks
// ---------------------------------------------------------------------------

test('task_ambiguity returns trigger_planning_pass without pausing', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-recovery-'));
  try {
    const decision = await dispatchRecovery(makeContext(tmpDir, {
      analysis: makeAnalysis({ rootCauseCategory: 'task_ambiguity' })
    }));
    assert.equal(decision.action, 'trigger_planning_pass');
    assert.equal(decision.pauseAgent, false);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('environment_issue returns attempt_preflight_remediation', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-recovery-'));
  try {
    const decision = await dispatchRecovery(makeContext(tmpDir, {
      analysis: makeAnalysis({ rootCauseCategory: 'environment_issue' })
    }));
    assert.equal(decision.action, 'attempt_preflight_remediation');
    assert.equal(decision.pauseAgent, false);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Recovery-state persistence
// ---------------------------------------------------------------------------

test('recovery-state.json is written with correct schema on first dispatch', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-recovery-'));
  try {
    await dispatchRecovery(makeContext(tmpDir, {
      analysis: makeAnalysis({ rootCauseCategory: 'transient' })
    }));

    const stateText = await fs.readFile(getRecoveryStatePath(tmpDir, 'T1'), 'utf8');
    const state = JSON.parse(stateText);
    assert.equal(state.schemaVersion, 1);
    assert.equal(state.kind, 'recoveryState');
    assert.equal(state.taskId, 'T1');
    assert.equal(state.category, 'transient');
    assert.equal(state.attemptCount, 1);
    assert.equal(state.escalated, false);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('getRecoveryStatePath returns expected path', () => {
  const dir = '/tmp/artifacts';
  const result = getRecoveryStatePath(dir, 'T42');
  assert.ok(result.endsWith(path.join('T42', 'recovery-state.json')));
});
