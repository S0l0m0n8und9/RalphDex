import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildExecutionIntentPreview,
  buildRunTrustTimeline,
  renderExecutionIntentPreviewMarkdown,
  renderRunTrustTimelineMarkdown,
  type ExecutionIntentConfig
} from '../src/ralph/runTimeline';
import { RUNTIME_EVENT_SCHEMA_VERSION, type RalphRuntimeEvent, type RalphRuntimeEventInput } from '../src/ralph/eventJournal';

const BASE_CONFIG: ExecutionIntentConfig = {
  cliProvider: 'claude',
  autonomyMode: 'autonomous',
  agentRole: 'implementer',
  verifierModes: ['validationCommand', 'gitDiff'],
  gitCheckpointMode: 'snapshot',
  scmStrategy: 'branch-per-task',
  autoApplyRemediation: ['mark_blocked']
};

function events(...inputs: Array<RalphRuntimeEventInput & { seq: number; timestamp: string }>): RalphRuntimeEvent[] {
  return inputs.map((input) => ({ schemaVersion: RUNTIME_EVENT_SCHEMA_VERSION, runId: 'run-1', ...input }) as RalphRuntimeEvent);
}

test('buildExecutionIntentPreview reflects provider, autonomy, verifier stack, scm, and remediation', () => {
  const intent = buildExecutionIntentPreview({ config: BASE_CONFIG, selectedTask: { id: 'T5', title: 'Add caching' } });
  assert.equal(intent.provider, 'claude');
  assert.equal(intent.autonomyMode, 'autonomous');
  assert.deepEqual(intent.verifierStack, ['validationCommand', 'gitDiff']);
  assert.equal(intent.scmStrategy, 'branch-per-task');
  assert.deepEqual(intent.autoAppliedRemediations, ['mark_blocked']);
  assert.equal(intent.selectedTaskId, 'T5');
  assert.ok(intent.notes.some((n) => n.includes('branch per task')));
  assert.ok(intent.notes.some((n) => n.includes('mark_blocked')));
  assert.match(renderExecutionIntentPreviewMarkdown(intent), /Execution intent preview/);
});

test('buildExecutionIntentPreview notes when no remediation auto-applies and no task selected', () => {
  const intent = buildExecutionIntentPreview({
    config: { ...BASE_CONFIG, autoApplyRemediation: [], scmStrategy: 'none' },
    selectedTask: null
  });
  assert.equal(intent.selectedTaskId, null);
  assert.ok(intent.notes.some((n) => n.includes('proposals only')));
  assert.ok(intent.notes.some((n) => n.includes('No task selected')));
});

test('buildRunTrustTimeline folds the journal into entries, totals, and remediation audit', () => {
  const timeline = buildRunTrustTimeline(events(
    { seq: 1, timestamp: '2026-01-01T00:00:01Z', type: 'run_started', mode: 'loop' },
    { seq: 2, timestamp: '2026-01-01T00:00:02Z', type: 'task_selected', taskId: 'T1', title: 'First' },
    { seq: 3, timestamp: '2026-01-01T00:00:03Z', type: 'provider_invoked', taskId: 'T1', provider: 'claude' },
    { seq: 4, timestamp: '2026-01-01T00:00:04Z', type: 'provider_completed', taskId: 'T1', provider: 'claude', status: 'succeeded' },
    { seq: 5, timestamp: '2026-01-01T00:00:05Z', type: 'verifier_result', taskId: 'T1', verifier: 'validation', status: 'passed' },
    { seq: 6, timestamp: '2026-01-01T00:00:06Z', type: 'remediation_applied', taskId: 'T1', action: 'mark_blocked', applied: true },
    { seq: 7, timestamp: '2026-01-01T00:00:07Z', type: 'artifact_written', artifactType: 'iteration-result', relativePath: 'iteration-001/iteration-result.json' },
    { seq: 8, timestamp: '2026-01-01T00:00:08Z', type: 'scm_action', taskId: 'T1', action: 'commit', status: 'succeeded' },
    { seq: 9, timestamp: '2026-01-01T00:00:09Z', type: 'task_state_changed', taskId: 'T1', from: 'in_progress', to: 'done' },
    { seq: 10, timestamp: '2026-01-01T00:00:10Z', type: 'run_completed', stopReason: 'no_actionable_task' }
  ));

  assert.equal(timeline.runId, 'run-1');
  assert.equal(timeline.stopReason, 'no_actionable_task');
  assert.equal(timeline.totals.taskStateChanges, 1);
  assert.equal(timeline.totals.providerInvocations, 1);
  assert.equal(timeline.totals.remediationsApplied, 1);
  assert.equal(timeline.totals.scmActions, 1);
  assert.equal(timeline.totals.artifactsWritten, 1);
  assert.deepEqual(timeline.artifactsWritten, ['iteration-001/iteration-result.json']);

  // artifact_written is folded into totals only (not a timeline entry); the rest are entries.
  assert.ok(!timeline.entries.some((e) => e.kind === 'artifact_written'));
  assert.ok(timeline.entries.some((e) => e.kind === 'task_state_changed' && e.taskId === 'T1'));
  assert.deepEqual(timeline.remediationAudit, [
    { seq: 6, timestamp: '2026-01-01T00:00:06Z', taskId: 'T1', action: 'mark_blocked', applied: true }
  ]);

  const md = renderRunTrustTimelineMarkdown(timeline);
  assert.match(md, /Run trust timeline/);
  assert.match(md, /Auto-remediation audit/);
});

test('buildRunTrustTimeline handles an empty journal', () => {
  const timeline = buildRunTrustTimeline([]);
  assert.equal(timeline.runId, null);
  assert.equal(timeline.entries.length, 0);
  assert.match(renderRunTrustTimelineMarkdown(timeline), /No timeline events/);
});

test('buildRunTrustTimeline surfaces recovery_applied events in totals and the timeline', () => {
  const timeline = buildRunTrustTimeline(events(
    { seq: 1, timestamp: '2026-01-01T00:00:01Z', type: 'run_started', mode: 'loop' },
    { seq: 2, timestamp: '2026-01-01T00:00:02Z', type: 'recovery_applied', taskId: 'T1', action: 'retry_with_context', severity: 'medium' },
    { seq: 3, timestamp: '2026-01-01T00:00:03Z', type: 'run_completed', stopReason: 'no_actionable_task' }
  ));
  assert.equal(timeline.totals.recoveryActionsApplied, 1);
  const recoveryEntry = timeline.entries.find((e) => e.kind === 'recovery_applied');
  assert.ok(recoveryEntry, 'expected a recovery_applied timeline entry');
  assert.match(recoveryEntry!.summary, /Recovery retry_with_context applied \(severity medium\)/);
});
