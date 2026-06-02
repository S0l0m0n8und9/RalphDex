import assert from 'node:assert/strict';
import test from 'node:test';
import { buildRunTimelineSection, DASHBOARD_FILE_CHANGE_CAP, DASHBOARD_TIMELINE_ENTRY_CAP } from '../src/webview/dashboardSnapshot';
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
    fileChanges: null,
    totals: { taskStateChanges: 1, providerInvocations: 1, remediationsApplied: 1, recoveryActionsApplied: 0, workflowPhasesCompleted: 0, artifactsWritten: 1, scmActions: 1 }
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
  assert.ok(section?.fileChanges);
  assert.equal(section?.fileChanges.status, 'missing');
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
    entries: [], remediationAudit: audits, artifactsWritten: [], fileChanges: null,
    totals: { taskStateChanges: 0, providerInvocations: 0, remediationsApplied: audits.length, recoveryActionsApplied: 0, workflowPhasesCompleted: 0, artifactsWritten: 0, scmActions: 0 }
  };
  const section = buildRunTimelineSection({ intent: null, timeline: t });
  assert.equal(section?.remediationAudit.length, DASHBOARD_TIMELINE_ENTRY_CAP);
  // Keeps the most recent (last) entries.
  assert.equal(section?.remediationAudit[section.remediationAudit.length - 1].seq, DASHBOARD_TIMELINE_ENTRY_CAP + 5);
});

test('buildRunTimelineSection projects one changed file from durable diff evidence', () => {
  const section = buildRunTimelineSection({
    intent: null,
    timeline: {
      ...timeline([]),
      fileChanges: {
        status: 'available',
        artifactPath: '/workspace/.ralph/artifacts/iteration-001/diff-summary.json',
        changedFileCount: 1,
        relevantChangedFileCount: 1,
        files: [{ path: 'src/ralph/runTimeline.ts', changeType: 'modified', relevant: true }],
        message: 'Detected 1 relevant changed file(s) out of 1 total changes.'
      }
    }
  });

  assert.ok(section?.fileChanges);
  assert.equal(section?.fileChanges.status, 'available');
  assert.equal(section?.fileChanges.changedFileCount, 1);
  assert.equal(section?.fileChanges.files[0]?.path, 'src/ralph/runTimeline.ts');
  assert.equal(section?.fileChanges.files[0]?.changeType, 'modified');
});

test('buildRunTimelineSection caps multiple changed files from durable diff evidence', () => {
  const files = Array.from({ length: DASHBOARD_FILE_CHANGE_CAP + 3 }, (_unused, index) => ({
    path: `src/file-${index + 1}.ts`,
    changeType: 'modified' as const,
    relevant: index % 2 === 0
  }));
  const section = buildRunTimelineSection({
    intent: null,
    timeline: {
      ...timeline([]),
      fileChanges: {
        status: 'available',
        artifactPath: '/workspace/.ralph/artifacts/iteration-001/diff-summary.json',
        changedFileCount: files.length,
        relevantChangedFileCount: files.filter((file) => file.relevant).length,
        files,
        message: 'Detected multiple relevant changed files.'
      }
    }
  });

  assert.ok(section?.fileChanges);
  assert.equal(section?.fileChanges.files.length, DASHBOARD_FILE_CHANGE_CAP);
  assert.equal(section?.fileChanges.changedFileCount, DASHBOARD_FILE_CHANGE_CAP + 3);
});

test('buildRunTimelineSection preserves unreadable diff artifact status without file rows', () => {
  const section = buildRunTimelineSection({
    intent: null,
    timeline: {
      ...timeline([]),
      fileChanges: {
        status: 'unreadable',
        artifactPath: '/workspace/.ralph/artifacts/iteration-001/diff-summary.json',
        changedFileCount: 0,
        relevantChangedFileCount: 0,
        files: [],
        message: 'Unable to read latest run diff summary: ENOENT'
      }
    }
  });

  assert.ok(section?.fileChanges);
  assert.equal(section?.fileChanges.status, 'unreadable');
  assert.match(section?.fileChanges.message ?? '', /unable to read/i);
  assert.deepEqual(section?.fileChanges.files, []);
});
