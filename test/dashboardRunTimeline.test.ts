import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRunTimelineSection, DASHBOARD_TIMELINE_ENTRY_CAP } from '../src/webview/dashboardSnapshot';
import type { ExecutionIntentPreview, RunTrustTimeline, TrustTimelineEntry } from '../src/ralph/runTimeline';

const INTENT: ExecutionIntentPreview = {
  provider: 'claude',
  autonomyMode: 'autonomous',
  agentRole: 'implementer',
  verifierStack: ['validationCommand'],
  gitCheckpointMode: 'snapshot',
  scmStrategy: 'branch-per-task',
  autoAppliedRemediations: ['mark_blocked'],
  selectedTaskId: 'T1',
  selectedTaskTitle: 'Do thing',
  notes: ['Provider: claude (autonomous autonomy, role implementer).']
};

function timeline(entries: TrustTimelineEntry[]): RunTrustTimeline {
  return {
    runId: 'run-1',
    startedAt: '2026-01-01T00:00:00Z',
    completedAt: '2026-01-01T00:01:00Z',
    stopReason: 'no_actionable_task',
    entries,
    remediationAudit: [{ seq: 5, timestamp: '2026-01-01T00:00:05Z', taskId: 'T1', action: 'mark_blocked', applied: true }],
    artifactsWritten: ['iteration-001/iteration-result.json'],
    totals: { taskStateChanges: 1, providerInvocations: 1, remediationsApplied: 1, artifactsWritten: 1, scmActions: 1 }
  };
}

test('buildRunTimelineSection returns null when neither intent nor timeline exists', () => {
  assert.equal(buildRunTimelineSection({ intent: null, timeline: null }), null);
});

test('buildRunTimelineSection projects intent + timeline and sorts entries newest-first', () => {
  const entries: TrustTimelineEntry[] = [
    { seq: 1, timestamp: 't1', kind: 'run_started', summary: 'Run started.', taskId: null },
    { seq: 3, timestamp: 't3', kind: 'task_state_changed', summary: 'T1: in_progress -> done.', taskId: 'T1' },
    { seq: 2, timestamp: 't2', kind: 'task_selected', summary: 'Selected T1.', taskId: 'T1' }
  ];
  const section = buildRunTimelineSection({ intent: INTENT, timeline: timeline(entries) });
  assert.ok(section);
  assert.equal(section?.intent?.provider, 'claude');
  assert.equal(section?.stopReason, 'no_actionable_task');
  assert.equal(section?.totals.remediationsApplied, 1);
  // Newest-first by seq.
  assert.deepEqual(section?.entries.map((e) => e.seq), [3, 2, 1]);
  assert.equal(section?.remediationAudit.length, 1);
});

test('buildRunTimelineSection caps entries at DASHBOARD_TIMELINE_ENTRY_CAP', () => {
  const entries: TrustTimelineEntry[] = Array.from({ length: DASHBOARD_TIMELINE_ENTRY_CAP + 10 }, (_unused, i) => ({
    seq: i + 1,
    timestamp: `t${i + 1}`,
    kind: 'task_state_changed',
    summary: `change ${i + 1}`,
    taskId: 'T1'
  }));
  const section = buildRunTimelineSection({ intent: null, timeline: timeline(entries) });
  assert.equal(section?.entries.length, DASHBOARD_TIMELINE_ENTRY_CAP);
  // Highest seqs retained (newest-first).
  assert.equal(section?.entries[0].seq, DASHBOARD_TIMELINE_ENTRY_CAP + 10);
});

test('buildRunTimelineSection works with intent only (no run yet)', () => {
  const section = buildRunTimelineSection({ intent: INTENT, timeline: null });
  assert.ok(section);
  assert.equal(section?.runId, null);
  assert.deepEqual(section?.entries, []);
  assert.equal(section?.totals.taskStateChanges, 0);
});

test('buildRunTimelineSection caps remediationAudit at DASHBOARD_TIMELINE_ENTRY_CAP', () => {
  const audits = Array.from({ length: DASHBOARD_TIMELINE_ENTRY_CAP + 5 }, (_unused, i) => ({
    seq: i + 1, timestamp: `t${i + 1}`, taskId: 'T1', action: 'mark_blocked', applied: true
  }));
  const t: RunTrustTimeline = {
    runId: 'run-1', startedAt: null, completedAt: null, stopReason: null,
    entries: [], remediationAudit: audits, artifactsWritten: [],
    totals: { taskStateChanges: 0, providerInvocations: 0, remediationsApplied: audits.length, artifactsWritten: 0, scmActions: 0 }
  };
  const section = buildRunTimelineSection({ intent: null, timeline: t });
  assert.equal(section?.remediationAudit.length, DASHBOARD_TIMELINE_ENTRY_CAP);
  // Keeps the most recent (last) entries.
  assert.equal(section?.remediationAudit[section.remediationAudit.length - 1].seq, DASHBOARD_TIMELINE_ENTRY_CAP + 5);
});
