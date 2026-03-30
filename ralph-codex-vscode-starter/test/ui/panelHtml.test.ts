import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPanelDashboardHtml } from '../../src/ui/panelHtml';
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
    config: null,
    ...overrides
  };
}

test('buildPanelDashboardHtml returns valid HTML with nonce-gated script and style', () => {
  const html = buildPanelDashboardHtml(defaultState(), 'abc123');
  assert.ok(html.includes('nonce-abc123'));
  assert.ok(html.includes('<style nonce="abc123">'));
  assert.ok(html.includes('<script nonce="abc123">'));
  assert.ok(html.includes('<!DOCTYPE html>'));
});

test('buildPanelDashboardHtml uses two-column grid layout', () => {
  const html = buildPanelDashboardHtml(defaultState(), 'n1');
  assert.ok(html.includes('dashboard-grid'));
  assert.ok(html.includes('panel-left'));
  assert.ok(html.includes('panel-right'));
});

test('buildPanelDashboardHtml filters active tasks from done tasks', () => {
  const tasks = [
    { id: 'T1', title: 'Active task', status: 'todo' as const, isCurrent: true, priority: 'normal', childIds: [], dependsOn: [] },
    { id: 'T2', title: 'Done task', status: 'done' as const, isCurrent: false, priority: 'normal', childIds: [], dependsOn: [] },
    { id: 'T3', title: 'Blocked task', status: 'blocked' as const, isCurrent: false, priority: 'normal', childIds: [], dependsOn: [] }
  ];
  const html = buildPanelDashboardHtml(defaultState({
    tasks,
    taskCounts: { todo: 1, in_progress: 0, blocked: 1, done: 1 }
  }), 'n2');

  // Active tasks visible directly
  assert.ok(html.includes('Active task'));
  assert.ok(html.includes('Blocked task'));
  // Done tasks in collapsible section
  assert.ok(html.includes('Completed (1)'));
  assert.ok(html.includes('<details>'));
});

test('buildPanelDashboardHtml shows all-done summary when every task is complete', () => {
  const doneTasks = Array.from({ length: 5 }, (_, i) => ({
    id: `T${i + 1}`,
    title: `Done task ${i + 1}`,
    status: 'done' as const,
    isCurrent: false,
    priority: 'normal',
    childIds: [] as string[],
    dependsOn: [] as string[]
  }));
  const html = buildPanelDashboardHtml(defaultState({
    tasks: doneTasks,
    taskCounts: { todo: 0, in_progress: 0, blocked: 0, done: 5 }
  }), 'n3');

  assert.ok(html.includes('all-done-card'));
  assert.ok(html.includes('All 5 tasks completed'));
  // Should NOT show the collapsed details section when all done
  assert.ok(!html.includes('<details>'));
});

test('buildPanelDashboardHtml disables loop and iteration buttons when running', () => {
  const html = buildPanelDashboardHtml(defaultState({ loopState: 'running' }), 'n4');
  // Actions section: Run Loop and Run Iter should be disabled
  const disabledButtons = (html.match(/<button[^>]*disabled[^>]*>/g) ?? []).length;
  assert.ok(disabledButtons >= 2, `Expected at least 2 disabled buttons, got ${disabledButtons}`);

  // Agent buttons should NOT be disabled (claims handle contention)
  const agentSection = html.split('Agents')[1]?.split('Actions')[0] ?? '';
  const disabledAgentButtons = (agentSection.match(/<button[^>]*disabled[^>]*>/g) ?? []).length;
  assert.equal(disabledAgentButtons, 0, 'Agent buttons should remain enabled');
});

test('buildPanelDashboardHtml escapes task titles to prevent XSS', () => {
  const html = buildPanelDashboardHtml(defaultState({
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
  }), 'n5');

  assert.ok(!html.includes('<script>alert'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('buildPanelDashboardHtml shows progress bar', () => {
  const html = buildPanelDashboardHtml(defaultState({
    taskCounts: { todo: 1, in_progress: 1, blocked: 0, done: 2 }
  }), 'n6');

  assert.ok(html.includes('█'));
  assert.ok(html.includes('2/4 done'));
  assert.ok(html.includes('50%'));
});

test('buildPanelDashboardHtml renders iteration history rows', () => {
  const html = buildPanelDashboardHtml(defaultState({
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

test('buildPanelDashboardHtml shows phase tracker when running', () => {
  const html = buildPanelDashboardHtml(defaultState({
    loopState: 'running',
    currentPhase: 'execute',
    currentIteration: 3
  }), 'n8');

  assert.ok(html.includes('phase-step'));
  assert.ok(html.includes('Iteration 3'));
  assert.ok(html.includes('class="phase-step done"'));
  assert.ok(html.includes('class="phase-step active"'));
});

test('buildPanelDashboardHtml includes button spinner and command-ack handler', () => {
  const html = buildPanelDashboardHtml(defaultState(), 'n9');
  assert.ok(html.includes('btn-spinner'));
  assert.ok(html.includes('command-ack'));
  assert.ok(html.includes('resetButton'));
});

test('buildPanelDashboardHtml shows empty state when no tasks', () => {
  const html = buildPanelDashboardHtml(defaultState(), 'n10');
  assert.ok(html.includes('No tasks yet'));
});

test('buildPanelDashboardHtml includes task detail sections for expandable tasks', () => {
  const html = buildPanelDashboardHtml(defaultState({
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
  }), 'n11');

  assert.ok(html.includes('detail-T1'));
  assert.ok(html.includes('Needs API key'));
  assert.ok(html.includes('Some important notes'));
  assert.ok(html.includes('npm test'));
  assert.ok(html.includes('T1a, T1b'));
  assert.ok(html.includes('T0'));
  assert.ok(html.includes('high'));
});

test('buildPanelDashboardHtml renders settings section when config is present', () => {
  const html = buildPanelDashboardHtml(defaultState({
    config: {
      cliProvider: 'claude',
      model: 'claude-sonnet-4-6',
      agentRole: 'build',
      agentId: 'default',
      agentCount: 1,
      autonomyMode: 'supervised',
      ralphIterationCap: 20,
      preferredHandoffMode: 'ideCommand',
      claudeMaxTurns: 50,
      claudePermissionMode: 'dangerously-skip-permissions',
      reasoningEffort: 'medium',
      approvalMode: 'never',
      sandboxMode: 'workspace-write',
      scmStrategy: 'none',
      gitCheckpointMode: 'snapshotAndDiff',
      noProgressThreshold: 5,
      repeatedFailureThreshold: 5,
      stopOnHumanReviewNeeded: true,
      clipboardAutoCopy: true,
      autoReplenishBacklog: false,
      autoReloadOnControlPlaneChange: false,
      promptBudgetProfile: 'claude'
    }
  }), 'n12');

  // Settings section rendered
  assert.ok(html.includes('settings-grid'));
  assert.ok(html.includes('data-setting="cliProvider"'));
  assert.ok(html.includes('data-setting="model"'));
  assert.ok(html.includes('data-setting="agentRole"'));
  assert.ok(html.includes('data-setting="ralphIterationCap"'));
  assert.ok(html.includes('data-setting="scmStrategy"'));
  assert.ok(html.includes('data-setting="autonomyMode"'));
  // Current values rendered
  assert.ok(html.includes('claude-sonnet-4-6'));
  assert.ok(html.includes('update-setting'));
});

test('buildPanelDashboardHtml hides settings section when config is null', () => {
  const html = buildPanelDashboardHtml(defaultState({ config: null }), 'n13');
  assert.ok(!html.includes('data-setting='));
});
