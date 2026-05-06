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
    prdExists: false,
    ...overrides
  };
}

function populatedDashboardSnapshot(): DashboardSnapshot {
  return {
    workspaceName: 'test-ws',
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
    }
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
  const html = buildPanelDashboardHtml(defaultState({
    loopState: 'running',
    prdExists: true,
    taskCounts: { todo: 1, in_progress: 0, blocked: 0, done: 0 }
  }), 'n4');
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

test('buildPanelDashboardHtml keeps settings selects readable with VS Code dropdown and list tokens', () => {
  const html = buildPanelDashboardHtml(defaultState(), 'select-theme');

  assert.match(html, /\.setting-control select\s*option/);
  assert.match(html, /\.setting-control select\s*option:checked/);
  assert.ok(html.includes('var(--vscode-dropdown-background, var(--vscode-input-background))'));
  assert.ok(html.includes('var(--vscode-dropdown-foreground, var(--vscode-input-foreground))'));
  assert.ok(html.includes('var(--vscode-list-activeSelectionBackground, var(--vscode-dropdown-background))'));
  assert.ok(html.includes('var(--vscode-list-activeSelectionForeground, var(--vscode-dropdown-foreground))'));
});

test('buildPanelDashboardHtml shows empty state when no tasks and no PRD', () => {
  const html = buildPanelDashboardHtml(defaultState({ prdExists: false }), 'n10');
  assert.ok(html.includes('Open PRD Wizard'));
  assert.ok(html.includes('ralphCodex.openPrdWizard'));
});

test('buildPanelDashboardHtml renders empty dashboard summary sections when no durable snapshot is loaded', () => {
  const html = buildPanelDashboardHtml(defaultState(), 'dash-empty');
  assert.ok(html.includes('Task board unavailable until Ralph status is loaded.'));
  assert.ok(html.includes('No focused diagnosis is available for the selected task.'));
  assert.ok(html.includes('No failure-analysis artifact for the selected task.'));
  assert.ok(html.includes('No durable agent identity records found yet.'));
  assert.ok(html.includes('No tasks are parked in dead-letter.'));
  assert.ok(!html.includes('Common Actions'));
  assert.ok(html.includes('Prepare &amp; Inspect'));
});

test('buildPanelDashboardHtml diagnostics tab surfaces doctrine repair guidance from preflight diagnostics', () => {
  const html = buildPanelDashboardHtml(defaultState({
    preflightReady: false,
    diagnostics: [{
      severity: 'warning',
      message: 'Doctrine health: missing. .ralph/doctrine has not been created for this workspace. Run "Ralphdex: Initialize Doctrine Pack" to scaffold or repair doctrine files.'
    }]
  }), 'diag-doctrine');

  assert.ok(html.includes('Ralphdex: Initialize Doctrine Pack'));
  assert.ok(html.includes('Doctrine health: missing.'));
});

test('buildPanelDashboardHtml diagnostics tab surfaces doctrine repair guidance for incomplete doctrine packs', () => {
  const html = buildPanelDashboardHtml(defaultState({
    preflightReady: false,
    diagnostics: [{
      severity: 'warning',
      message: 'Doctrine health: incomplete. Missing required doctrine file .ralph/doctrine/risks.md. Run "Ralphdex: Initialize Doctrine Pack" to scaffold or repair doctrine files.'
    }]
  }), 'diag-doctrine-incomplete');

  assert.ok(html.includes('Ralphdex: Initialize Doctrine Pack'));
  assert.ok(html.includes('Doctrine health: incomplete.'));
  assert.ok(html.includes('.ralph/doctrine/risks.md'));
});

test('buildPanelDashboardHtml diagnostics tab renders first-run readiness checklist with state labels', () => {
  const dashboardSnapshot = populatedDashboardSnapshot();
  dashboardSnapshot.preflight = {
    ready: false,
    summary: 'Preflight blocked.',
    diagnostics: [],
    firstRunChecklist: [
      {
        id: 'workspace_initialized',
        label: 'Workspace initialized',
        status: 'blocker',
        detail: 'Missing Ralph workspace files.'
      },
      {
        id: 'tasks_present',
        label: 'Tasks present',
        status: 'warning',
        detail: 'No tasks yet.'
      },
      {
        id: 'provider_ready',
        label: 'Provider ready',
        status: 'complete',
        detail: 'CLI path verified.'
      },
      {
        id: 'doctrine_optional_healthy',
        label: 'Doctrine optional/healthy',
        status: 'complete',
        detail: 'No doctrine issues detected.'
      },
      {
        id: 'validation_command_detected',
        label: 'Validation command detected',
        status: 'complete',
        detail: 'Validation command executable confirmed.'
      }
    ]
  };
  const html = buildPanelDashboardHtml(defaultState({ dashboardSnapshot }), 'diag-checklist');

  assert.ok(html.includes('First-Run Readiness'));
  assert.ok(html.includes('Workspace initialized'));
  assert.ok(html.includes('Tasks present'));
  assert.ok(html.includes('Provider ready'));
  assert.ok(html.includes('status-pill bad'));
  assert.ok(html.includes('status-pill warn'));
  assert.ok(html.includes('status-pill ok'));
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

test('buildPanelDashboardHtml renders populated agent, task, dead-letter, and failure sections', () => {
  const html = buildPanelDashboardHtml(defaultState({
    prdExists: true,
    dashboardSnapshot: populatedDashboardSnapshot()
  }), 'dash-full');
  assert.match(html, /Done<\/span><span class="metric-value ok">4<\/span>/);
  assert.ok(html.includes('Recovery Queue'));
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

test('dashboard surfaces dead-letter recovery outside buried diagnostics', () => {
  const html = buildPanelDashboardHtml(defaultState({ dashboardSnapshot: populatedDashboardSnapshot() }), 'dl-operational');

  assert.ok(html.includes('dead-letter-recovery-card'), 'operational recovery card is rendered');
  assert.ok(html.includes('data-section="dead-letter-diagnostics"'), 'diagnostics details may still exist');
  assert.ok(
    html.indexOf('dead-letter-recovery-card') < html.indexOf('id="tab-diagnostics"'),
    'recovery card should appear before the diagnostics tab markup'
  );
  assert.ok(html.includes('ralphCodex.requeueDeadLetterTask'), 'requeue action present');
  assert.ok(html.includes('ralphCodex.openFailureDiagnosis'), 'open failure diagnosis action present');
  assert.ok(html.includes('ralphCodex.autoRecoverTask'), 'auto recover action present');
});

test('buildPanelDashboardHtml prefers durable snapshot sections over empty-state placeholder copy when snapshot data exists', () => {
  const html = buildPanelDashboardHtml(defaultState({ dashboardSnapshot: populatedDashboardSnapshot() }), 'dash-live');

  assert.ok(html.includes('Surface dashboard sections'));
  assert.ok(html.includes('Selected T110'));
  assert.ok(html.includes('Recovery Queue'));
  assert.ok(html.includes('Recover failed task'));
  assert.ok(html.includes('agent-alpha'));
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
  assert.ok(html.includes('ralphCodex.openPrdWizard'));
  assert.ok(html.includes('ralphCodex.openSettings'));
});

test('buildPanelDashboardHtml rail preserves live operator shortcuts', () => {
  const html = buildPanelDashboardHtml(defaultState({ dashboardSnapshot: populatedDashboardSnapshot() }), 'dash-rail');

  assert.ok(html.includes('ralphCodex.showRalphStatus'));
  assert.ok(!html.includes('ralphCodex.showMultiAgentStatus'));
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
  assert.ok(!html.includes('data-setting="operatorMode"'));
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
  assert.ok(!html.includes('data-setting="autonomyMode"'));
});

test('buildPanelDashboardHtml empty state shows Open PRD Wizard when prdExists is false', () => {
  const html = buildPanelDashboardHtml(defaultState({ prdExists: false }), 'n14');

  assert.ok(!html.includes('ralphCodex.regeneratePrd'), 'should not show old Initialize Workspace command');
  assert.ok(html.includes('ralphCodex.openPrdWizard'), 'should show openPrdWizard command');
  assert.ok(html.includes('Open PRD Wizard'), 'should show Open PRD Wizard label');
});

test('buildPanelDashboardHtml empty state shows Generate tasks when prdExists is true', () => {
  const html = buildPanelDashboardHtml(defaultState({ prdExists: true }), 'n15');

  assert.ok(!html.includes('ralphCodex.regeneratePrd'), 'should not show old Initialize Workspace command');
  assert.ok(html.includes('ralphCodex.openPrdWizard'), 'should show openPrdWizard command');
  assert.ok(html.includes('Generate tasks from PRD'), 'should show generate tasks label');
});

// ---------------------------------------------------------------------------
// Phase 2 — Dashboard gap hardening tests
// ---------------------------------------------------------------------------

test('dashboard renders summary/status cards in hero health grid', () => {
  const html = buildPanelDashboardHtml(defaultState({
    taskCounts: { todo: 2, in_progress: 1, blocked: 0, done: 3 },
    dashboardSnapshot: populatedDashboardSnapshot()
  }), 'summary-cards');

  assert.ok(html.includes('hero-health-grid'), 'hero health grid present');
  assert.ok(html.includes('Progress'), 'progress card');
  assert.ok(html.includes('Iteration'), 'iteration card');
  assert.ok(html.includes('Attention'), 'attention card');
  assert.ok(html.includes('Cost'), 'cost card');
  assert.ok(html.includes('hero-health-value'), 'values displayed');
  assert.ok(html.includes('hero-health-sub'), 'secondary metadata');
});

test('advanced settings are collapsed by default', () => {
  const settingsSurface = buildSettingsSurfaceSnapshot(DEFAULT_CONFIG);
  const html = buildPanelDashboardHtml(defaultState({ settingsSurface }), 'collapsed');

  assert.ok(html.includes('settings-advanced-group'), 'advanced group exists');
  assert.ok(html.includes('Advanced Configuration'), 'advanced toggle label');
  assert.ok(html.includes('data-section="settings-operator-mode"'), 'operator-mode section present');
  const advancedMatch = html.match(/<details class="settings-advanced-group"[^>]*>/);
  assert.ok(advancedMatch, 'advanced details element found');
  assert.ok(!advancedMatch![0].includes(' open'), 'advanced is collapsed by default');
});

test('invalid tier thresholds render inline validation', () => {
  const settingsSurface = buildSettingsSurfaceSnapshot({
    ...DEFAULT_CONFIG,
    modelTiering: {
      ...DEFAULT_CONFIG.modelTiering,
      simpleThreshold: 50,
      complexThreshold: 30
    }
  });
  const html = buildPanelDashboardHtml(defaultState({ settingsSurface }), 'tier-invalid');

  assert.ok(html.includes('Simple threshold must be strictly less than complex threshold'), 'validation message shown');
  assert.ok(html.includes('class="setting-control invalid"'), 'invalid CSS class applied');
  assert.ok(html.includes('error-text'), 'error text class present');
});

test('empty task state renders actionable CTAs with addTask and seedTasks commands', () => {
  const html = buildPanelDashboardHtml(defaultState({ prdExists: false }), 'empty-cta');

  assert.ok(html.includes('ralphCodex.addTask'), 'addTask CTA present');
  assert.ok(html.includes('ralphCodex.seedTasksFromFeatureRequest'), 'seedTasksFromFeatureRequest CTA present');
  assert.ok(html.includes('ralphCodex.openPrdWizard'), 'openPrdWizard CTA present');
  assert.ok(html.includes('Add Task'), 'Add Task button label');
  assert.ok(html.includes('Seed Tasks'), 'Seed Tasks button label');
});

test('empty task state with prdExists=true shows Generate from PRD plus addTask', () => {
  const html = buildPanelDashboardHtml(defaultState({ prdExists: true }), 'empty-prd');

  assert.ok(html.includes('ralphCodex.openPrdWizard'), 'generate from PRD');
  assert.ok(html.includes('ralphCodex.addTask'), 'addTask CTA');
  assert.ok(html.includes('Generate tasks from PRD'), 'PRD generate label');
});

test('iteration rows expose clickable affordance with chevron and artifact message path', () => {
  const html = buildPanelDashboardHtml(defaultState({
    recentIterations: [
      { iteration: 5, taskId: 'T3', taskTitle: 'Test task', classification: 'complete', stopReason: null, artifactDir: '/tmp/iter5' }
    ]
  }), 'iter-row-affordance');

  assert.ok(html.includes('iter-row-chevron'), 'chevron affordance present');
  assert.ok(html.includes('›'), 'chevron character');
  assert.ok(html.includes('data-artifact-dir'), 'artifact dir data attribute');
  assert.ok(html.includes('open-iteration-artifact'), 'message path for opening artifacts');
  assert.ok(html.includes('aria-label="Iteration 5'), 'iteration row aria-label');
  assert.ok(html.includes('complete'), 'classification text present');
});

test('reduced-motion CSS exists in base styles', () => {
  const html = buildPanelDashboardHtml(defaultState(), 'reduced-motion');

  assert.ok(html.includes('prefers-reduced-motion: reduce'), 'reduced-motion media query');
  assert.ok(html.includes('.phase-pulse { animation: none'), 'phase pulse disabled');
  assert.ok(html.includes('.hero-state-pill.running { animation: none'), 'hero pulse disabled');
});

test('command buttons use existing command IDs and MessageBridge path', () => {
  const settingsSurface = buildSettingsSurfaceSnapshot(DEFAULT_CONFIG);
  const html = buildPanelDashboardHtml(defaultState({
    prdExists: true,
    dashboardSnapshot: populatedDashboardSnapshot(),
    settingsSurface
  }), 'msg-bridge');

  assert.ok(html.includes('ralphCodex.runRalphLoop'), 'runRalphLoop');
  assert.ok(html.includes('ralphCodex.runRalphIteration'), 'runRalphIteration');
  assert.ok(html.includes('ralphCodex.generatePrompt'), 'generatePrompt');
  assert.ok(html.includes('ralphCodex.showRalphStatus'), 'showRalphStatus');
  assert.ok(html.includes('ralphCodex.openSettings'), 'openSettings');
  assert.ok(html.includes('ralphCodex.setProviderSecret'), 'setProviderSecret');
  assert.ok(html.includes('ralphCodex.clearProviderSecret'), 'clearProviderSecret');
  assert.ok(html.includes("vscode.postMessage({ type: 'command', command: cmd })"), 'MessageBridge command post');
});

test('no external @import or CDN font URLs in dashboard output', () => {
  const html = buildPanelDashboardHtml(defaultState(), 'no-cdn');

  assert.ok(!html.includes('@import url'), 'no @import url');
  assert.ok(!html.includes('cdn.jsdelivr.net'), 'no jsdelivr CDN');
  assert.ok(!html.includes('fonts.googleapis.com'), 'no Google Fonts CDN');
  assert.ok(html.includes('var(--vscode-font-family'), 'uses VS Code font family variable');
  assert.ok(html.includes('var(--vscode-editor-font-family'), 'uses VS Code editor font family variable');
});

test('empty iteration history shows actionable Run First Iteration CTA', () => {
  const html = buildPanelDashboardHtml(defaultState(), 'empty-iter');

  assert.ok(html.includes('No iterations recorded yet'), 'empty iteration message');
  assert.ok(html.includes('Run First Iteration'), 'actionable CTA label');
  assert.ok(html.includes('ralphCodex.runRalphIteration'), 'iteration command');
});

test('empty agent grid shows actionable CTAs', () => {
  const html = buildPanelDashboardHtml(defaultState(), 'empty-agents');

  assert.ok(html.includes('No durable agent identity records found yet'), 'agent grid empty text');
  assert.ok(html.includes('ralphCodex.runMultiAgentLoop'), 'multi-agent loop CTA');
});

test('empty dead-letter shows actionable CTA', () => {
  const html = buildPanelDashboardHtml(defaultState(), 'empty-dl');

  assert.ok(html.includes('No tasks are parked in dead-letter'), 'dead-letter empty text');
  assert.ok(html.includes('Show Status'), 'show status CTA in dead-letter empty state');
});

test('provider section includes set/clear secret CTAs', () => {
  const settingsSurface = buildSettingsSurfaceSnapshot(DEFAULT_CONFIG);
  const html = buildPanelDashboardHtml(defaultState({ settingsSurface }), 'provider-cta');

  assert.ok(html.includes('ralphCodex.setProviderSecret'), 'set secret CTA');
  assert.ok(html.includes('ralphCodex.clearProviderSecret'), 'clear secret CTA');
  assert.ok(html.includes('Set Secret'), 'set secret label');
  assert.ok(html.includes('Clear Secret'), 'clear secret label');
});

test('azure-foundry provider with missing endpoint renders inline validation', () => {
  const settingsSurface = buildSettingsSurfaceSnapshot({
    ...DEFAULT_CONFIG,
    cliProvider: 'azure-foundry',
    azureFoundry: {
      ...DEFAULT_CONFIG.azureFoundry,
      endpointUrl: '',
      auth: { ...DEFAULT_CONFIG.azureFoundry.auth, mode: 'vscode-secret', secretStorageKey: '' }
    }
  });
  const html = buildPanelDashboardHtml(defaultState({ settingsSurface }), 'azure-validation');

  assert.ok(html.includes('Endpoint URL is required when azure-foundry is the active provider'), 'endpoint validation');
  assert.ok(html.includes('SecretStorage key is required when auth mode is vscode-secret'), 'secret key validation');
});

test('sidebar rail shows Add Task CTA when no current task', () => {
  const html = buildPanelDashboardHtml(defaultState(), 'rail-empty');

  assert.ok(html.includes('No task selected'), 'no task selected message');
  assert.ok(html.includes('ralphCodex.addTask'), 'addTask CTA in rail');
});
