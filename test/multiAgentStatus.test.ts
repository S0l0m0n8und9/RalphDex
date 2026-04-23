import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeStuckScore,
  buildNoProgressHeatmap,
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

