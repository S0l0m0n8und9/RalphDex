import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeStuckScore,
  buildNoProgressHeatmap,
  buildMultiAgentStatusReport,
  STUCK_SCORE_THRESHOLD,
  HEATMAP_WINDOW,
  type AgentHandoffSummary,
  type AgentStatusSummary,
} from '../src/ralph/multiAgentStatus';

// ---------------------------------------------------------------------------
// computeStuckScore
// ---------------------------------------------------------------------------

test('computeStuckScore: returns 0 for empty history', () => {
  assert.strictEqual(computeStuckScore([]), 0);
});

test('computeStuckScore: returns 0 when latest entry is not no_progress', () => {
  const handoffs: AgentHandoffSummary[] = [
    { iteration: 1, selectedTaskId: 'T1', selectedTaskTitle: null, stopReason: null, completionClassification: 'no_progress', progressNote: null },
    { iteration: 2, selectedTaskId: 'T1', selectedTaskTitle: null, stopReason: null, completionClassification: 'task_complete', progressNote: null },
  ];
  assert.strictEqual(computeStuckScore(handoffs), 0);
});

test('computeStuckScore: returns 0 when latest entry has null selectedTaskId', () => {
  const handoffs: AgentHandoffSummary[] = [
    { iteration: 1, selectedTaskId: null, selectedTaskTitle: null, stopReason: null, completionClassification: 'no_progress', progressNote: null },
  ];
  assert.strictEqual(computeStuckScore(handoffs), 0);
});

test('computeStuckScore: returns 1 for a single no_progress entry', () => {
  const handoffs: AgentHandoffSummary[] = [
    { iteration: 1, selectedTaskId: 'T1', selectedTaskTitle: null, stopReason: null, completionClassification: 'no_progress', progressNote: null },
  ];
  assert.strictEqual(computeStuckScore(handoffs), 1);
});

test('computeStuckScore: returns streak count when consecutive same-task no_progress at tail', () => {
  const handoffs: AgentHandoffSummary[] = [
    { iteration: 1, selectedTaskId: 'T1', selectedTaskTitle: null, stopReason: null, completionClassification: 'task_complete', progressNote: null },
    { iteration: 2, selectedTaskId: 'T2', selectedTaskTitle: null, stopReason: null, completionClassification: 'no_progress', progressNote: null },
    { iteration: 3, selectedTaskId: 'T2', selectedTaskTitle: null, stopReason: null, completionClassification: 'no_progress', progressNote: null },
    { iteration: 4, selectedTaskId: 'T2', selectedTaskTitle: null, stopReason: null, completionClassification: 'no_progress', progressNote: null },
  ];
  assert.strictEqual(computeStuckScore(handoffs), 3);
});

test('computeStuckScore: streak resets when task changes mid-tail', () => {
  const handoffs: AgentHandoffSummary[] = [
    { iteration: 1, selectedTaskId: 'T1', selectedTaskTitle: null, stopReason: null, completionClassification: 'no_progress', progressNote: null },
    { iteration: 2, selectedTaskId: 'T1', selectedTaskTitle: null, stopReason: null, completionClassification: 'no_progress', progressNote: null },
    { iteration: 3, selectedTaskId: 'T2', selectedTaskTitle: null, stopReason: null, completionClassification: 'no_progress', progressNote: null },
    { iteration: 4, selectedTaskId: 'T2', selectedTaskTitle: null, stopReason: null, completionClassification: 'no_progress', progressNote: null },
  ];
  assert.strictEqual(computeStuckScore(handoffs), 2);
});

test('computeStuckScore: streak resets when classification breaks mid-tail', () => {
  const handoffs: AgentHandoffSummary[] = [
    { iteration: 1, selectedTaskId: 'T1', selectedTaskTitle: null, stopReason: null, completionClassification: 'no_progress', progressNote: null },
    { iteration: 2, selectedTaskId: 'T1', selectedTaskTitle: null, stopReason: null, completionClassification: 'task_complete', progressNote: null },
    { iteration: 3, selectedTaskId: 'T1', selectedTaskTitle: null, stopReason: null, completionClassification: 'no_progress', progressNote: null },
  ];
  assert.strictEqual(computeStuckScore(handoffs), 1);
});

test('computeStuckScore: handles unsorted input by sorting on iteration before computing', () => {
  const handoffs: AgentHandoffSummary[] = [
    { iteration: 3, selectedTaskId: 'T1', selectedTaskTitle: null, stopReason: null, completionClassification: 'no_progress', progressNote: null },
    { iteration: 1, selectedTaskId: 'T1', selectedTaskTitle: null, stopReason: null, completionClassification: 'no_progress', progressNote: null },
    { iteration: 2, selectedTaskId: 'T1', selectedTaskTitle: null, stopReason: null, completionClassification: 'no_progress', progressNote: null },
  ];
  assert.strictEqual(computeStuckScore(handoffs), 3);
});

// ---------------------------------------------------------------------------
// STUCK_SCORE_THRESHOLD / HEATMAP_WINDOW constants
// ---------------------------------------------------------------------------

test('STUCK_SCORE_THRESHOLD is 3', () => {
  assert.strictEqual(STUCK_SCORE_THRESHOLD, 3);
});

test('HEATMAP_WINDOW is 10', () => {
  assert.strictEqual(HEATMAP_WINDOW, 10);
});

// ---------------------------------------------------------------------------
// buildNoProgressHeatmap
// ---------------------------------------------------------------------------

test('buildNoProgressHeatmap: returns empty string for empty history', () => {
  assert.strictEqual(buildNoProgressHeatmap([]), '');
});

test('buildNoProgressHeatmap: single no_progress entry renders X', () => {
  const handoffs: AgentHandoffSummary[] = [
    { iteration: 1, selectedTaskId: 'T1', selectedTaskTitle: null, stopReason: null, completionClassification: 'no_progress', progressNote: null },
  ];
  assert.strictEqual(buildNoProgressHeatmap(handoffs), '[X]');
});

test('buildNoProgressHeatmap: non-no_progress entry renders dot', () => {
  const handoffs: AgentHandoffSummary[] = [
    { iteration: 1, selectedTaskId: 'T1', selectedTaskTitle: null, stopReason: null, completionClassification: 'task_complete', progressNote: null },
  ];
  assert.strictEqual(buildNoProgressHeatmap(handoffs), '[.]');
});

test('buildNoProgressHeatmap: mixed history renders correct symbols in order', () => {
  const handoffs: AgentHandoffSummary[] = [
    { iteration: 1, selectedTaskId: 'T1', selectedTaskTitle: null, stopReason: null, completionClassification: 'task_complete', progressNote: null },
    { iteration: 2, selectedTaskId: 'T1', selectedTaskTitle: null, stopReason: null, completionClassification: 'no_progress', progressNote: null },
    { iteration: 3, selectedTaskId: 'T1', selectedTaskTitle: null, stopReason: null, completionClassification: 'no_progress', progressNote: null },
  ];
  assert.strictEqual(buildNoProgressHeatmap(handoffs), '[.XX]');
});

test('buildNoProgressHeatmap: unsorted input is sorted by iteration before rendering', () => {
  const handoffs: AgentHandoffSummary[] = [
    { iteration: 3, selectedTaskId: 'T1', selectedTaskTitle: null, stopReason: null, completionClassification: 'no_progress', progressNote: null },
    { iteration: 1, selectedTaskId: 'T1', selectedTaskTitle: null, stopReason: null, completionClassification: 'task_complete', progressNote: null },
    { iteration: 2, selectedTaskId: 'T1', selectedTaskTitle: null, stopReason: null, completionClassification: 'no_progress', progressNote: null },
  ];
  assert.strictEqual(buildNoProgressHeatmap(handoffs), '[.XX]');
});

test('buildNoProgressHeatmap: windows to last maxLen entries', () => {
  const handoffs: AgentHandoffSummary[] = Array.from({ length: 12 }, (_, i) => ({
    iteration: i + 1,
    selectedTaskId: 'T1',
    selectedTaskTitle: null,
    stopReason: null,
    completionClassification: i < 2 ? 'task_complete' : 'no_progress',
    progressNote: null,
  }));
  // iterations 1 and 2 are task_complete (.), rest are no_progress (X)
  // window of last 10 = iterations 3–12, all no_progress
  assert.strictEqual(buildNoProgressHeatmap(handoffs, 10), '[XXXXXXXXXX]');
});

test('buildNoProgressHeatmap: null completionClassification renders as dot', () => {
  const handoffs: AgentHandoffSummary[] = [
    { iteration: 1, selectedTaskId: 'T1', selectedTaskTitle: null, stopReason: null, completionClassification: null, progressNote: null },
  ];
  assert.strictEqual(buildNoProgressHeatmap(handoffs), '[.]');
});

// ---------------------------------------------------------------------------
// buildMultiAgentStatusReport
// ---------------------------------------------------------------------------

function makeAgent(overrides: Partial<AgentStatusSummary> = {}): AgentStatusSummary {
  return {
    agentId: 'default',
    firstSeenAt: '2026-01-01T00:00:00.000Z',
    completedTaskCount: 0,
    activeClaimTaskId: null,
    handoffHistory: [],
    latestHandoff: null,
    stuckScore: 0,
    ...overrides,
  };
}

test('buildMultiAgentStatusReport: empty summaries renders no-agent message', () => {
  const report = buildMultiAgentStatusReport([]);
  assert.ok(report.includes('No agent identity records found'));
});

test('buildMultiAgentStatusReport: renders agent id and first seen timestamp', () => {
  const agent = makeAgent({ agentId: 'alpha', firstSeenAt: '2026-03-01T00:00:00.000Z' });
  const report = buildMultiAgentStatusReport([agent]);
  assert.ok(report.includes('Agent: alpha'), 'should include agent id');
  assert.ok(report.includes('first seen: 2026-03-01T00:00:00.000Z'), 'should include timestamp');
});

test('buildMultiAgentStatusReport: renders WARNING prefix for stuck agent at threshold', () => {
  const handoffs: AgentHandoffSummary[] = [
    { iteration: 1, selectedTaskId: 'T5', selectedTaskTitle: 'Do thing', stopReason: null, completionClassification: 'no_progress', progressNote: null },
    { iteration: 2, selectedTaskId: 'T5', selectedTaskTitle: 'Do thing', stopReason: null, completionClassification: 'no_progress', progressNote: null },
    { iteration: 3, selectedTaskId: 'T5', selectedTaskTitle: 'Do thing', stopReason: null, completionClassification: 'no_progress', progressNote: null },
  ];
  const agent = makeAgent({
    agentId: 'worker-1',
    stuckScore: 3,
    handoffHistory: handoffs,
    latestHandoff: handoffs[2],
  });
  const report = buildMultiAgentStatusReport([agent]);
  assert.ok(report.includes('WARNING Agent: worker-1'), 'should show WARNING prefix');
  assert.ok(report.includes('STUCK: 3 consecutive no-progress'), 'should include stuck count');
});

test('buildMultiAgentStatusReport: does not render WARNING prefix below threshold', () => {
  const agent = makeAgent({ agentId: 'worker-2', stuckScore: 2 });
  const report = buildMultiAgentStatusReport([agent]);
  assert.ok(!report.includes('WARNING'), 'should not have WARNING prefix below threshold');
});

test('buildMultiAgentStatusReport: renders last iteration and outcome from latestHandoff', () => {
  const handoff: AgentHandoffSummary = {
    iteration: 7,
    selectedTaskId: 'T9',
    selectedTaskTitle: 'My task',
    stopReason: 'task_marked_complete',
    completionClassification: 'task_complete',
    progressNote: 'Tests pass',
  };
  const agent = makeAgent({ latestHandoff: handoff });
  const report = buildMultiAgentStatusReport([agent]);
  assert.ok(report.includes('Last iteration: 7'), 'should include iteration number');
  assert.ok(report.includes('T9: My task'), 'should include task id and title');
  assert.ok(report.includes('task_complete'), 'should include classification');
  assert.ok(report.includes('task_marked_complete'), 'should include stop reason');
  assert.ok(report.includes('Tests pass'), 'should include progress note');
});

test('buildMultiAgentStatusReport: renders none when no latestHandoff', () => {
  const agent = makeAgent({ latestHandoff: null });
  const report = buildMultiAgentStatusReport([agent]);
  assert.ok(report.includes('Last iteration: none'));
});

test('buildMultiAgentStatusReport: renders current claim task id when active', () => {
  const agent = makeAgent({ activeClaimTaskId: 'T42' });
  const report = buildMultiAgentStatusReport([agent]);
  assert.ok(report.includes('Current claim: T42'));
});

test('buildMultiAgentStatusReport: renders none for current claim when absent', () => {
  const agent = makeAgent({ activeClaimTaskId: null });
  const report = buildMultiAgentStatusReport([agent]);
  assert.ok(report.includes('Current claim: none'));
});

test('buildMultiAgentStatusReport: renders heatmap line when handoff history is present', () => {
  const handoffs: AgentHandoffSummary[] = [
    { iteration: 1, selectedTaskId: 'T1', selectedTaskTitle: null, stopReason: null, completionClassification: 'task_complete', progressNote: null },
    { iteration: 2, selectedTaskId: 'T1', selectedTaskTitle: null, stopReason: null, completionClassification: 'no_progress', progressNote: null },
  ];
  const agent = makeAgent({ handoffHistory: handoffs, latestHandoff: handoffs[1] });
  const report = buildMultiAgentStatusReport([agent]);
  assert.ok(report.includes('No-progress heatmap'), 'should include heatmap label');
  assert.ok(report.includes('[.X]'), 'should include correct heatmap symbols');
  assert.ok(report.includes('X = no_progress'), 'should include legend');
});

test('buildMultiAgentStatusReport: does not render heatmap line when handoff history is empty', () => {
  const agent = makeAgent({ handoffHistory: [] });
  const report = buildMultiAgentStatusReport([agent]);
  assert.ok(!report.includes('No-progress heatmap'), 'should not include heatmap when no history');
});
