import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_CONFIG } from '../../src/config/defaults';
import { buildSettingsSurfaceSnapshot } from '../../src/config/settingsSurface';
import { buildPanelDashboardHtml } from '../../src/ui/panelHtml';
import type { RalphDashboardState } from '../../src/ui/uiTypes';
import type { DashboardSnapshot } from '../../src/webview/dashboardSnapshot';

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
    settingsSurface: null,
    dashboardSnapshot: null,
    snapshotStatus: { phase: 'idle', errorMessage: null },
    taskSeeding: { phase: 'idle', requestText: '', createdTaskCount: null, message: null, artifactPath: null },
    viewIntent: null,
    ...overrides
  };
}

function populatedDashboardSnapshot(): DashboardSnapshot {
  return {
    workspaceName: 'test-ws',
    pipeline: {
      runId: 'pipeline-001',
      status: 'running',
      phase: 'loop',
      rootTaskId: 'Tpipe-1',
      decomposedTaskCount: 3,
      loopStartTime: '2026-01-01T00:00:00.000Z',
      loopEndTime: null,
      prUrl: null,
      lastStopReason: 'repeated_no_progress'
    },
    taskBoard: {
      counts: { todo: 2, in_progress: 1, blocked: 1, done: 4 },
      deadLetterCount: 1,
      selectedTaskId: 'T110',
      selectedTaskTitle: 'Surface dashboard sections',
      nextIteration: 9
    },
    agentGrid: {
      rows: [{
        agentId: 'agent-alpha',
        firstSeenAt: '2026-01-01T00:00:00.000Z',
        completedTaskCount: 4,
        activeClaimTaskId: 'T110',
        stuckScore: 3,
        isStuck: true,
        latestHandoffClassification: 'no_progress',
        latestHandoffIteration: 8,
        noProgressHeatmap: '[..XXX]'
      }]
    },
    failureFeed: {
      entries: [{
        taskId: 'T110',
        taskTitle: 'Surface dashboard sections',
        category: 'validation_mismatch',
        confidence: 'high',
        summary: 'Verifier contract mismatch.',
        suggestedAction: 'Align emitted dashboard payload.',
        recoveryAttemptCount: 2,
        remediationSummary: 'Validation mismatch — adjusted prompt',
        humanReviewRecommended: true
      }]
    },
    diagnosis: {
      taskId: 'T110',
      taskTitle: 'Surface dashboard sections',
      category: 'validation_mismatch',
      confidence: 'high',
      summary: 'Verifier contract mismatch.',
      suggestedAction: 'Align emitted dashboard payload.',
      retryPromptAddendum: 'Re-run with the durable dashboard snapshot shape locked.',
      recoveryAttemptCount: 2,
      remediationSummary: 'Validation mismatch — adjusted prompt',
      failureAnalysisPath: '.ralph/artifacts/T110/failure-analysis.json',
      recoveryStatePath: '.ralph/artifacts/T110/recovery-state.json'
    },
    deadLetter: {
      entries: [{
        schemaVersion: 1,
        kind: 'deadLetterEntry',
        taskId: 'T99',
        taskTitle: 'Recover failed task',
        deadLetteredAt: '2026-01-01T00:00:00.000Z',
        diagnosticHistory: [],
        recoveryAttemptCount: 3
      }]
    },
    quickActions: {
      hasDeadLetterEntries: true,
      hasBlockedTasks: true,
      canAttemptLoop: true
    },
    cost: {
      executionCostUsd: 0.0142,
      diagnosticCostUsd: null,
      promptCacheStats: { staticPrefixBytes: 8192, cacheHit: true },
      hasAnyCostData: true
    },
    orchestration: null
  };
}

test('buildPanelDashboardHtml returns valid HTML with nonce-gated script and style', () => {
  const html = buildPanelDashboardHtml(defaultState(), 'abc123');
  assert.ok(html.includes('nonce-abc123'));
  assert.ok(html.includes('<style nonce="abc123">'));
  assert.ok(html.includes('<script nonce="abc123">'));
  assert.ok(html.includes('<!DOCTYPE html>'));
});

test('buildPanelDashboardHtml renders tabbed dashboard layout', () => {
  const html = buildPanelDashboardHtml(defaultState(), 'n1');
  assert.ok(html.includes('tab-bar'));
  assert.ok(html.includes('dashboard-sidebar'));
  assert.ok(html.includes('dashboard-main'));
  assert.ok(html.includes('data-tab="overview"'));
  assert.ok(html.includes('data-tab="work"'));
  assert.ok(html.includes('data-tab="diagnostics"'));
  assert.ok(html.includes('data-tab="settings"'));
  assert.ok(html.includes('tab-overview'));
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
  assert.ok(html.includes('data-section="completed-tasks"'));
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

test('buildPanelDashboardHtml renders task-seeding form and success follow-up affordances', () => {
  const html = buildPanelDashboardHtml(defaultState({
    taskSeeding: {
      phase: 'success',
      requestText: 'Seed a dashboard intake flow',
      createdTaskCount: 2,
      message: 'Seeded 2 task(s).',
      artifactPath: '.ralph/artifacts/task-seeding/latest.json'
    }
  }), 'seed-panel');

  assert.ok(html.includes('Seed Tasks From Epic'));
  assert.ok(html.includes('data-seed-request'));
  assert.ok(html.includes("type: 'seed-tasks'"));
  assert.ok(html.includes('Seeded 2 task(s).'));
  assert.ok(html.includes('ralphCodex.showTasks'));
  assert.ok(html.includes('ralphCodex.refreshDashboard'));
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

test('buildPanelDashboardHtml renders empty dashboard summary sections when no durable snapshot is loaded', () => {
  const html = buildPanelDashboardHtml(defaultState(), 'dash-empty');
  assert.ok(html.includes('Pipeline'));
  assert.ok(html.includes('No pipeline run artifact recorded yet.'));
  assert.ok(html.includes('Task board unavailable until Ralph status is loaded.'));
  assert.ok(html.includes('No focused diagnosis is available for the selected task.'));
  assert.ok(html.includes('No failure-analysis artifact for the selected task.'));
  assert.ok(html.includes('No durable agent identity records found yet.'));
  assert.ok(html.includes('No tasks are parked in dead-letter.'));
  assert.ok(html.includes('Common Actions'));
});

test('buildPanelDashboardHtml renders accessible task and history controls with persisted tabs', () => {
  const html = buildPanelDashboardHtml(defaultState({
    tasks: [{
      id: 'T1',
      title: 'Task one',
      status: 'todo',
      isCurrent: true,
      priority: 'normal',
      childIds: [],
      dependsOn: []
    }],
    recentIterations: [
      { iteration: 4, taskId: 'T1', taskTitle: 'Task one', classification: 'partial_progress', stopReason: null, artifactDir: '/tmp/iter' }
    ],
    taskCounts: { todo: 1, in_progress: 0, blocked: 0, done: 0 }
  }), 'tabs');

  assert.ok(html.includes('role="tablist"'));
  assert.ok(html.includes('saveStoredState({ activeTab: tabId })'));
  assert.ok(html.includes("document.addEventListener('keydown'"));
  assert.ok(html.includes("e.key === 'ArrowRight'"));
  assert.ok(html.includes("e.key === 'ArrowLeft'"));
  assert.ok(html.includes("e.key === 'Home'"));
  assert.ok(html.includes("e.key === 'End'"));
  assert.ok(html.includes('aria-expanded="false"'));
  assert.ok(html.includes('type: \'open-iteration-artifact\''));
});

test('buildPanelDashboardHtml renders populated pipeline, agent, task, dead-letter, and failure sections', () => {
  const html = buildPanelDashboardHtml(defaultState({ dashboardSnapshot: populatedDashboardSnapshot() }), 'dash-full');
  assert.ok(html.includes('pipeline-001'));
  assert.ok(html.includes('Last Stop</strong> repeated_no_progress'));
  assert.ok(html.includes('data-command="ralphCodex.openLatestPipelineRun"'));
  assert.match(html, /Done<\/span><span class="metric-value ok">4<\/span>/);
  assert.ok(html.includes('Dead-Letter'));
  assert.ok(html.includes('Recover failed task'));
  assert.ok(html.includes('validation_mismatch'));
  assert.ok(html.includes('Confidence</strong> high'));
  assert.ok(html.includes('Focused Diagnosis'));
  assert.ok(html.includes('Re-run with the durable dashboard snapshot shape locked.'));
  assert.ok(html.includes('ralphCodex.openFailureDiagnosis'));
  assert.ok(html.includes('ralphCodex.autoRecoverTask'));
  assert.ok(html.includes('ralphCodex.skipTask'));
  assert.ok(html.includes('agent-alpha'));
  assert.ok(html.includes('First Seen</strong> 2026-01-01T00:00:00Z'));
  assert.ok(html.includes('stuck 3'));
  assert.ok(html.includes('Selected T110'));
  assert.ok(html.includes('Run Loop'));
  assert.ok(html.includes('Open Settings'));
});

test('buildPanelDashboardHtml prefers durable snapshot sections over empty-state placeholder copy when snapshot data exists', () => {
  const html = buildPanelDashboardHtml(defaultState({ dashboardSnapshot: populatedDashboardSnapshot() }), 'dash-live');

  assert.ok(html.includes('Surface dashboard sections'));
  assert.ok(html.includes('Selected T110'));
  assert.ok(html.includes('Dead-Letter'));
  assert.ok(html.includes('Recover failed task'));
  assert.ok(html.includes('agent-alpha'));
  assert.ok(!html.includes('No pipeline run artifact recorded yet.'));
  assert.ok(!html.includes('Task board unavailable until Ralph status is loaded.'));
  assert.ok(!html.includes('No focused diagnosis is available for the selected task.'));
  assert.ok(!html.includes('No durable agent identity records found yet.'));
  assert.ok(!html.includes('No tasks are parked in dead-letter.'));
});

test('buildPanelDashboardHtml quick actions expose latest artifact and settings commands', () => {
  const html = buildPanelDashboardHtml(defaultState({ dashboardSnapshot: populatedDashboardSnapshot() }), 'dash-actions');
  assert.ok(html.includes('ralphCodex.openLatestPipelineRun'));
  assert.ok(html.includes('ralphCodex.openLatestProvenanceBundle'));
  assert.ok(html.includes('ralphCodex.openLatestPromptEvidence'));
  assert.ok(html.includes('ralphCodex.openLatestCliTranscript'));
  assert.ok(html.includes('workbench.action.openSettings'));
});

test('buildPanelDashboardHtml rail preserves live operator shortcuts', () => {
  const html = buildPanelDashboardHtml(defaultState({ dashboardSnapshot: populatedDashboardSnapshot() }), 'dash-rail');

  assert.ok(html.includes('ralphCodex.showRalphStatus'));
  assert.ok(html.includes('ralphCodex.showMultiAgentStatus'));
  assert.ok(html.includes('ralphCodex.showTasks'));
  assert.ok(html.includes('ralphCodex.openLatestPipelineRun'));
});

test('buildPanelDashboardHtml renders a live hero summary from durable state', () => {
  const html = buildPanelDashboardHtml(defaultState({
    loopState: 'running',
    agentRole: 'implementer',
    nextIteration: 7,
    iterationCap: 20,
    tasks: [{
      id: 'T156',
      title: 'Integrate the UXrefresh dashboard shell',
      status: 'in_progress',
      isCurrent: true,
      priority: 'high',
      childIds: [],
      dependsOn: []
    }],
    taskCounts: { todo: 3, in_progress: 1, blocked: 1, done: 9 },
    dashboardSnapshot: populatedDashboardSnapshot()
  }), 'hero');

  assert.ok(html.includes('hero-card'));
  assert.ok(html.includes('Now'));
  assert.ok(html.includes('Integrate the UXrefresh dashboard shell'));
  assert.ok(html.includes('Loop running'));
  assert.ok(html.includes('Progress'));
  assert.ok(html.includes('Iteration'));
  assert.ok(html.includes('Attention'));
  assert.ok(html.includes('Cost'));
});

test('buildPanelDashboardHtml applies refreshed section shells to work, diagnostics, and orchestration tabs', () => {
  const dashboardSnapshot = populatedDashboardSnapshot();
  dashboardSnapshot.orchestration = {
    activeNodeId: 'node-review',
    activeNodeLabel: 'Review Agent',
    completedNodes: [],
    pendingBranchNodes: [],
    fanInStatus: 'passed',
    fanInErrors: [],
    replanHistory: []
  };

  const html = buildPanelDashboardHtml(defaultState({
    taskCounts: { todo: 2, in_progress: 1, blocked: 0, done: 4 },
    tasks: [{
      id: 'T156',
      title: 'Integrate the UXrefresh dashboard shell',
      status: 'in_progress',
      isCurrent: true,
      priority: 'high',
      childIds: [],
      dependsOn: []
    }],
    dashboardSnapshot
  }), 'section-shells');

  assert.ok(html.includes('<div class="work-shell">'));
  assert.ok(html.includes('<div class="diagnostics-shell">'));
  assert.ok(html.includes('<div class="orchestration-shell">'));
});

test('buildPanelDashboardHtml renders multiple recent failure feed entries when present', () => {
  const dashboardSnapshot = populatedDashboardSnapshot();
  dashboardSnapshot.failureFeed.entries.push({
    taskId: 'T201',
    taskTitle: 'Repair pipeline resume',
    category: 'implementation_error',
    confidence: 'medium',
    summary: 'Pipeline artifact did not reconcile cleanly.',
    suggestedAction: 'Re-run the resume path after repairing the artifact.',
    recoveryAttemptCount: 4,
    remediationSummary: null,
    humanReviewRecommended: false
  });

  const html = buildPanelDashboardHtml(defaultState({ dashboardSnapshot }), 'dash-failures');

  assert.ok(html.includes('Surface dashboard sections'));
  assert.ok(html.includes('Repair pipeline resume'));
  assert.ok(html.includes('Pipeline artifact did not reconcile cleanly.'));
  assert.ok(html.includes('implementation_error'));
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

test('buildPanelDashboardHtml renders metadata-driven settings sections when settingsSurface is present', () => {
  const settingsSurface = buildSettingsSurfaceSnapshot({
    ...DEFAULT_CONFIG,
    operatorMode: 'multi-agent',
    cliProvider: 'copilot',
    memoryStrategy: 'summary',
    planningPass: { enabled: true, mode: 'dedicated' },
    azureFoundry: {
      ...DEFAULT_CONFIG.azureFoundry,
      endpointUrl: 'https://foundry.example'
    }
  }, {
    newSettingKeys: ['planningPass.enabled']
  });
  const html = buildPanelDashboardHtml(defaultState({ settingsSurface }), 'n12');

  assert.ok(html.includes('Operator Mode'));
  assert.ok(html.includes('Provider'));
  assert.ok(html.includes('Memory'));
  assert.ok(html.includes('Planning'));
  assert.ok(html.includes('Azure Foundry'));
  assert.ok(html.includes('data-setting="operatorMode"'));
  assert.ok(html.includes('data-setting="planningPass.enabled"'));
  assert.ok(html.includes('data-setting="azureFoundry.endpointUrl"'));
  assert.ok(html.includes('https://foundry.example'));
  assert.ok(html.includes('Default: false'));
  assert.ok(html.includes('settings-badge'));
  assert.ok(html.includes('ralphCodex.testCurrentProviderConnection'));
  assert.ok(html.includes('Test GitHub Copilot Connection'));
});

test('buildPanelDashboardHtml uses the dashboard view intent to open the settings tab and focus a setting', () => {
  const settingsSurface = buildSettingsSurfaceSnapshot(DEFAULT_CONFIG);
  const html = buildPanelDashboardHtml(defaultState({
    settingsSurface,
    viewIntent: {
      activeTab: 'settings',
      focusSettingKey: 'planningPass.enabled'
    }
  }), 'intent');

  assert.ok(html.includes('"activeTab":"settings"'));
  assert.ok(html.includes('"focusSettingKey":"planningPass.enabled"'));
  assert.ok(html.includes("document.querySelector('[data-setting-entry=\"' + VIEW_INTENT.focusSettingKey + '\"]')"));
  assert.ok(html.includes('details.open = true') || html.includes('details.open = true;'));
});

test('buildPanelDashboardHtml hides settings inputs when settingsSurface is null', () => {
  const html = buildPanelDashboardHtml(defaultState({ settingsSurface: null }), 'n13');
  assert.ok(!html.includes('data-setting="operatorMode"'));
});

test('buildPanelDashboardHtml empty states use the registered regeneratePrd command id', () => {
  const html = buildPanelDashboardHtml(defaultState(), 'n14');

  assert.ok(!html.includes('ralphCodex.regeneratePRD'));
  assert.ok(html.includes('ralphCodex.regeneratePrd'));
});
