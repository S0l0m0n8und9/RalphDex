import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDashboardHtml } from '../../src/ui/sidebarHtml';
import type { RalphDashboardState } from '../../src/ui/uiTypes';

function defaultState(overrides: Partial<RalphDashboardState> = {}): RalphDashboardState {
  return {
    workspaceName: 'test-ws',
    loopState: 'idle',
    agentRole: 'build',
    nextIteration: 1,
    iterationCap: 5,
    taskCounts: null,
    tasks: [],
    recentIterations: [],
    preflightReady: true,
    preflightSummary: 'ok',
    diagnostics: [],
    currentPhase: null,
    currentIteration: null,
    ...overrides
  };
}

test('buildDashboardHtml returns valid HTML with nonce-gated script and style', () => {
  const html = buildDashboardHtml(defaultState(), 'abc123');
  assert.ok(html.includes('nonce-abc123'));
  assert.ok(html.includes('<style nonce="abc123">'));
  assert.ok(html.includes('<script nonce="abc123">'));
  assert.ok(html.includes('<!DOCTYPE html>'));
});

test('buildDashboardHtml escapes task titles to prevent XSS', () => {
  const html = buildDashboardHtml(defaultState({
    tasks: [{
      id: 'T1',
      title: '<script>alert("xss")</script>',
      status: 'todo',
      isCurrent: false,
      priority: 'normal',
      childIds: [],
      dependsOn: []
    }],
    taskCounts: { todo: 1, in_progress: 0, blocked: 0, done: 0 }
  }), 'n1');

  assert.ok(!html.includes('<script>alert'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('buildDashboardHtml marks current task with amber border class', () => {
  const html = buildDashboardHtml(defaultState({
    tasks: [
      { id: 'T1', title: 'Current one', status: 'in_progress', isCurrent: true, priority: 'normal', childIds: [], dependsOn: [] },
      { id: 'T2', title: 'Other', status: 'todo', isCurrent: false, priority: 'normal', childIds: [], dependsOn: [] }
    ],
    taskCounts: { todo: 1, in_progress: 1, blocked: 0, done: 0 }
  }), 'n2');

  assert.ok(html.includes('current'));
  assert.ok(html.includes('T1'));
});

test('buildDashboardHtml shows progress bar with block characters', () => {
  const html = buildDashboardHtml(defaultState({
    taskCounts: { todo: 1, in_progress: 1, blocked: 0, done: 2 }
  }), 'n3');

  assert.ok(html.includes('█'));
  assert.ok(html.includes('2/4 done'));
  assert.ok(html.includes('50%'));
});

test('buildDashboardHtml shows phase tracker when running', () => {
  const html = buildDashboardHtml(defaultState({
    loopState: 'running',
    currentPhase: 'execute',
    currentIteration: 3
  }), 'n4');

  assert.ok(html.includes('phase-step'));
  assert.ok(html.includes('Iteration 3'));
  // execute should be active, inspect/select/prompt should be done
  assert.ok(html.includes('class="phase-step done"'));
  assert.ok(html.includes('class="phase-step active"'));
});

test('buildDashboardHtml keeps all buttons enabled during running state for parallel launches', () => {
  const html = buildDashboardHtml(defaultState({ loopState: 'running' }), 'n5');
  // Agents are designed for concurrent operation — claims handle contention.
  // No button elements should have the disabled attribute.
  const disabledButtons = (html.match(/<button[^>]*disabled[^>]*>/g) ?? []).length;
  assert.equal(disabledButtons, 0, `Expected 0 disabled buttons, got ${disabledButtons}`);
});

test('buildDashboardHtml shows diagnostics when not ready', () => {
  const html = buildDashboardHtml(defaultState({
    preflightReady: false,
    preflightSummary: 'Not ready: missing validation command',
    diagnostics: [
      { severity: 'error', message: 'Validation command not found' },
      { severity: 'warning', message: 'Git not available' }
    ]
  }), 'n6');

  assert.ok(html.includes('Validation command not found'));
  assert.ok(html.includes('Git not available'));
  assert.ok(html.includes('diag-item'));
});

test('buildDashboardHtml renders iteration history rows', () => {
  const html = buildDashboardHtml(defaultState({
    recentIterations: [
      { iteration: 3, taskId: 'T2', taskTitle: 'Fix bug', classification: 'complete', stopReason: null, artifactDir: '/tmp/a' },
      { iteration: 2, taskId: 'T1', taskTitle: 'Add tests', classification: 'partial_progress', stopReason: null, artifactDir: '/tmp/b' }
    ]
  }), 'n7');

  assert.ok(html.includes('#3'));
  assert.ok(html.includes('#2'));
  assert.ok(html.includes('T2'));
  assert.ok(html.includes('complete'));
  assert.ok(html.includes('partial progress'));
});

test('buildDashboardHtml shows empty state when no tasks', () => {
  const html = buildDashboardHtml(defaultState(), 'n8');
  assert.ok(html.includes('No tasks yet'));
});

test('buildDashboardHtml includes task detail sections for expandable tasks', () => {
  const html = buildDashboardHtml(defaultState({
    tasks: [{
      id: 'T1',
      title: 'Test task',
      status: 'blocked',
      isCurrent: false,
      priority: 'high',
      blocker: 'Needs API key',
      notes: 'Some important notes',
      validation: 'npm test',
      childIds: ['T1a', 'T1b'],
      dependsOn: ['T0'],
      parentId: 'root'
    }],
    taskCounts: { todo: 0, in_progress: 0, blocked: 1, done: 0 }
  }), 'n9');

  assert.ok(html.includes('detail-T1'));
  assert.ok(html.includes('Needs API key'));
  assert.ok(html.includes('Some important notes'));
  assert.ok(html.includes('npm test'));
  assert.ok(html.includes('T1a, T1b'));
  assert.ok(html.includes('T0'));
  assert.ok(html.includes('high'));
});
