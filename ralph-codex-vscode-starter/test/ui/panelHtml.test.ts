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
    agentLanes: [],
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
  // Should NOT show the completed-tasks collapsible summary when all tasks are done
  assert.ok(!html.includes(`Completed (${doneTasks.length})</summary>`));
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
    agentLanes: [{ agentId: 'default', phase: 'execute', iteration: 3 }]
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

test('buildPanelDashboardHtml eagerly persists plain setting inputs before commands run', () => {
  const html = buildPanelDashboardHtml(defaultState(), 'persist');
  assert.ok(html.includes('document.activeElement.blur'));
  assert.ok(html.includes("input[data-setting], input[data-setting-nested]"));
  assert.ok(html.includes('function sendSettingUpdate(el)'));
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

function fullConfig() {
  return {
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
    copilotApprovalMode: 'allow-all',
    copilotMaxAutopilotContinues: 200,
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
    promptBudgetProfile: 'claude',
    codexCommandPath: 'codex',
    claudeCommandPath: 'claude',
    copilotCommandPath: 'copilot',
    inspectionRootOverride: '',
    artifactRetentionPath: '.ralph/artifacts',
    ralphTaskFilePath: '.ralph/tasks.json',
    prdPath: '.ralph/prd.md',
    progressPath: '.ralph/progress.md',
    promptTemplateDirectory: '',
    generatedArtifactRetentionCount: 10,
    provenanceBundleRetentionCount: 5,
    watchdogStaleTtlMs: 86400000,
    claimTtlHours: 24,
    staleLockThresholdMinutes: 30,
    promptPriorContextBudget: 4000,
    scmPrOnParentDone: false,
    promptIncludeVerifierFeedback: true,
    validationCommandOverride: '',
    verifierModes: ['validationCommand', 'gitDiff'],
    autoApplyRemediation: ['decompose_task'],
    customPromptBudget: { system: 2000, context: 1500 },
    modelTiering: {
      enabled: false,
      simple: { model: 'claude-haiku-4-5-20251001' },
      medium: { model: 'claude-sonnet-4-6' },
      complex: { model: 'claude-opus-4-6' },
      simpleThreshold: 2,
      complexThreshold: 6
    },
    hooks: {
      beforeIteration: 'echo before',
      afterIteration: undefined,
      onTaskComplete: undefined,
      onStop: undefined,
      onFailure: undefined
    },
    openSidebarCommandId: 'ralphCodex.openSidebar',
    newChatCommandId: 'ralphCodex.newChat'
  };
}

test('buildPanelDashboardHtml renders settings section when config is present', () => {
  const html = buildPanelDashboardHtml(defaultState({ config: fullConfig() }), 'n12');

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

test('buildPanelDashboardHtml renders new path settings', () => {
  const html = buildPanelDashboardHtml(defaultState({ config: fullConfig() }), 'n14');
  assert.ok(html.includes('data-setting="codexCommandPath"'));
  assert.ok(html.includes('data-setting="claudeCommandPath"'));
  assert.ok(html.includes('data-setting="copilotCommandPath"'));
  assert.ok(html.includes('data-setting="artifactRetentionPath"'));
  assert.ok(html.includes('data-setting="ralphTaskFilePath"'));
  assert.ok(html.includes('data-setting="prdPath"'));
  assert.ok(html.includes('data-setting="progressPath"'));
  assert.ok(html.includes('data-setting="promptTemplateDirectory"'));
});

test('buildPanelDashboardHtml renders verifierModes as multi-checkbox', () => {
  const html = buildPanelDashboardHtml(defaultState({ config: fullConfig() }), 'nMulti');
  assert.ok(html.includes('data-setting-multi="verifierModes"'));
  const checkboxCount = (html.match(/data-setting-multi="verifierModes"/g) ?? []).length;
  assert.equal(checkboxCount, 3, 'Should render 3 verifierModes checkboxes');
});

test('buildPanelDashboardHtml renders modelTiering nested fields', () => {
  const html = buildPanelDashboardHtml(defaultState({ config: fullConfig() }), 'nTier');
  assert.ok(html.includes('data-setting-nested="modelTiering.enabled"'));
  assert.ok(html.includes('data-setting-nested="modelTiering.simple.model"'));
  assert.ok(html.includes('data-setting-nested="modelTiering.medium.model"'));
  assert.ok(html.includes('data-setting-nested="modelTiering.complex.model"'));
  assert.ok(html.includes('data-setting-nested="modelTiering.complexThreshold"'));
});

test('buildPanelDashboardHtml renders hooks nested fields', () => {
  const html = buildPanelDashboardHtml(defaultState({ config: fullConfig() }), 'nHook');
  assert.ok(html.includes('data-setting-nested="hooks.beforeIteration"'));
  assert.ok(html.includes('data-setting-nested="hooks.afterIteration"'));
  assert.ok(html.includes('data-setting-nested="hooks.onTaskComplete"'));
  assert.ok(html.includes('data-setting-nested="hooks.onStop"'));
  assert.ok(html.includes('data-setting-nested="hooks.onFailure"'));
});

test('buildPanelDashboardHtml renders customPromptBudget key-value editor', () => {
  const html = buildPanelDashboardHtml(defaultState({ config: fullConfig() }), 'nKv');
  assert.ok(html.includes('data-setting-kv-group="customPromptBudget"'));
  assert.ok(html.includes('data-setting-kv="customPromptBudget"'));
  assert.ok(html.includes('kv-add'));
});

test('buildPanelDashboardHtml renders advanced section as collapsible', () => {
  const html = buildPanelDashboardHtml(defaultState({ config: fullConfig() }), 'nAdv');
  assert.ok(html.includes('settings-advanced-toggle'));
  assert.ok(html.includes('data-setting="openSidebarCommandId"'));
  assert.ok(html.includes('data-setting="newChatCommandId"'));
});

test('buildPanelDashboardHtml renders number settings with new fields', () => {
  const html = buildPanelDashboardHtml(defaultState({ config: fullConfig() }), 'nNum');
  assert.ok(html.includes('data-setting="generatedArtifactRetentionCount"'));
  assert.ok(html.includes('data-setting="provenanceBundleRetentionCount"'));
  assert.ok(html.includes('data-setting="watchdogStaleTtlMs"'));
  assert.ok(html.includes('data-setting="claimTtlHours"'));
  assert.ok(html.includes('data-setting="staleLockThresholdMinutes"'));
  assert.ok(html.includes('data-setting="promptPriorContextBudget"'));
});

test('buildPanelDashboardHtml renders new boolean settings', () => {
  const html = buildPanelDashboardHtml(defaultState({ config: fullConfig() }), 'nBool');
  assert.ok(html.includes('data-setting="scmPrOnParentDone"'));
  assert.ok(html.includes('data-setting="promptIncludeVerifierFeedback"'));
  assert.ok(html.includes('data-setting="validationCommandOverride"'));
});

test('buildPanelDashboardHtml renders autoApplyRemediation multi-checkbox', () => {
  const html = buildPanelDashboardHtml(defaultState({ config: fullConfig() }), 'nRem');
  assert.ok(html.includes('data-setting-multi="autoApplyRemediation"'));
  const count = (html.match(/data-setting-multi="autoApplyRemediation"/g) ?? []).length;
  assert.equal(count, 2, 'Should render 2 autoApplyRemediation checkboxes');
});

test('buildPanelDashboardHtml hides settings section when config is null', () => {
  const html = buildPanelDashboardHtml(defaultState({ config: null }), 'n13');
  assert.ok(!html.includes('data-setting='));
});
