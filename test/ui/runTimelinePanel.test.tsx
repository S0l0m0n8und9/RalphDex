import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { RunTimelinePanel } from '../../src/webview-ui/components/panels/RunTimelinePanel';
import type { DashboardRunTimelineSection } from '../../src/webview/dashboardSnapshot';

function section(overrides: Partial<DashboardRunTimelineSection> = {}): DashboardRunTimelineSection {
  return {
    intent: {
      provider: 'claude',
      autonomyMode: 'autonomous',
      agentRole: 'implementer',
      verifierStack: ['validationCommand', 'gitDiff'],
      gitCheckpointMode: 'snapshot',
      scmStrategy: 'branch-per-task',
      autoAppliedRemediations: ['mark_blocked'],
      selectedTaskId: 'T1',
      selectedTaskTitle: 'Do thing',
      notes: ['Provider: claude (autonomous autonomy, role implementer).']
    },
    runId: 'run-1',
    startedAt: '2026-01-01T00:00:00Z',
    completedAt: '2026-01-01T00:01:00Z',
    stopReason: 'no_actionable_task',
    totals: { taskStateChanges: 2, providerInvocations: 1, remediationsApplied: 1, recoveryActionsApplied: 1, artifactsWritten: 3, scmActions: 1 },
    entries: [
      { seq: 4, timestamp: 't4', kind: 'task_state_changed', summary: 'T1: in_progress -> done.', taskId: 'T1' },
      { seq: 1, timestamp: 't1', kind: 'run_started', summary: 'Run started (loop).', taskId: null }
    ],
    remediationAudit: [{ seq: 3, timestamp: 't3', taskId: 'T1', action: 'mark_blocked', applied: true }],
    fileChanges: {
      status: 'available',
      artifactPath: '/workspace/.ralph/artifacts/iteration-001/diff-summary.json',
      changedFileCount: 3,
      relevantChangedFileCount: 2,
      message: 'Detected 2 relevant changed file(s) out of 3 total changes.',
      files: [
        { path: 'src/ralph/runTimeline.ts', changeType: 'modified', relevant: true },
        { path: 'test/runTimeline.test.ts', changeType: 'added', relevant: true },
        { path: '.ralph/tasks.json', changeType: 'modified', relevant: false }
      ]
    },
    ...overrides
  };
}

test('RunTimelinePanel renders intent, timeline entries, and remediation audit', () => {
  const html = renderToStaticMarkup(<RunTimelinePanel runTimeline={section()} />);
  assert.match(html, /Run Trust Timeline/i);
  assert.match(html, /provider: claude/);
  assert.match(html, /scm: branch-per-task/);
  assert.match(html, /auto-remediation: mark_blocked/);
  assert.match(html, /Latest run run-1/);
  assert.match(html, /stop: no_actionable_task/);
  assert.match(html, /T1: in_progress -&gt; done\./);
  assert.match(html, /Repository file changes/);
  assert.match(html, /2\/3 relevant/);
  assert.match(html, /src\/ralph\/runTimeline\.ts/);
  assert.match(html, /test\/runTimeline\.test\.ts/);
  assert.match(html, /managed/);
  assert.match(html, /Auto-remediation audit/);
  assert.match(html, /mark_blocked on T1: applied/);
});

test('RunTimelinePanel renders an intent-only state before any run', () => {
  const html = renderToStaticMarkup(<RunTimelinePanel runTimeline={section({ runId: null, entries: [], remediationAudit: [], stopReason: null })} />);
  assert.match(html, /No run has been recorded yet\./);
  assert.match(html, /provider: claude/);
  assert.doesNotMatch(html, /Repository file changes/);
});

test('RunTimelinePanel tolerates older run timeline payloads without fileChanges', () => {
  const html = renderToStaticMarkup(<RunTimelinePanel runTimeline={section({ fileChanges: undefined })} />);
  assert.match(html, /Repository file changes/);
  assert.match(html, /No durable diff summary was recorded for the latest run\./);
});

test('RunTimelinePanel renders unreadable file-change evidence without file rows', () => {
  const html = renderToStaticMarkup(<RunTimelinePanel runTimeline={section({
    fileChanges: {
      status: 'unreadable',
      artifactPath: '/workspace/.ralph/artifacts/iteration-001/diff-summary.json',
      changedFileCount: 0,
      relevantChangedFileCount: 0,
      message: 'Unable to read latest run diff summary: ENOENT',
      files: []
    }
  })} />);

  assert.match(html, /Repository file changes/);
  assert.match(html, /unreadable/);
  assert.match(html, /Unable to read latest run diff summary/);
  assert.doesNotMatch(html, /src\/ralph\/runTimeline\.ts/);
});

test('RunTimelinePanel reports hidden file-change rows when capped', () => {
  const html = renderToStaticMarkup(<RunTimelinePanel runTimeline={section({
    fileChanges: {
      status: 'available',
      artifactPath: '/workspace/.ralph/artifacts/iteration-001/diff-summary.json',
      changedFileCount: 4,
      relevantChangedFileCount: 4,
      message: 'Detected many files.',
      files: [
        { path: 'src/a.ts', changeType: 'modified', relevant: true },
        { path: 'src/b.ts', changeType: 'modified', relevant: true }
      ]
    }
  })} />);

  assert.match(html, /\+2 more files/);
});
