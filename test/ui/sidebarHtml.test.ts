import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDashboardHtml } from '../../src/ui/sidebarHtml';
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
        remediationSummary: 'Validation mismatch - adjusted prompt',
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
      remediationSummary: 'Validation mismatch - adjusted prompt',
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

test('buildDashboardHtml returns valid HTML with nonce-gated script and style', () => {
  const html = buildDashboardHtml(defaultState(), 'abc123');
  assert.ok(html.includes('nonce-abc123'));
  assert.ok(html.includes('<style nonce="abc123">'));
  assert.ok(html.includes('<script nonce="abc123">'));
  assert.ok(html.includes('<!DOCTYPE html>'));
});

test('buildDashboardHtml shows progress bar with block characters', () => {
  const html = buildDashboardHtml(defaultState({
    taskCounts: { todo: 1, in_progress: 1, blocked: 0, done: 2 }
  }), 'n3');

  assert.ok(html.includes('█'));
  assert.ok(html.includes('2/4 done'));
  assert.ok(html.includes('50%'));
});

test('buildDashboardHtml shows phase indicator when running', () => {
  const html = buildDashboardHtml(defaultState({
    loopState: 'running',
    agentLanes: [{ agentId: 'default', phase: 'execute', iteration: 3 }]
  }), 'n4');

  assert.ok(html.includes('phase-indicator'));
  assert.ok(html.includes('iter 3'));
  assert.ok(html.includes('execute'));
});

test('buildDashboardHtml keeps all buttons enabled during running state for parallel launches', () => {
  const html = buildDashboardHtml(defaultState({ loopState: 'running' }), 'n5');
  // Sidebar buttons stay enabled — claims handle contention.
  const disabledButtons = (html.match(/<button[^>]*disabled[^>]*>/g) ?? []).length;
  assert.equal(disabledButtons, 0, `Expected 0 disabled buttons, got ${disabledButtons}`);
});

test('buildDashboardHtml renders agent and action button grids', () => {
  const html = buildDashboardHtml(defaultState(), 'n6');
  assert.ok(html.includes('ralphCodex.runRalphLoop'));
  assert.ok(html.includes('ralphCodex.runReviewAgent'));
  assert.ok(html.includes('ralphCodex.runWatchdogAgent'));
  assert.ok(html.includes('ralphCodex.runScmAgent'));
  assert.ok(html.includes('ralphCodex.runRalphIteration'));
  assert.ok(html.includes('ralphCodex.generatePrompt'));
  assert.ok(html.includes('ralphCodex.openPrdWizard'));
  assert.ok(!html.includes('ralphCodex.initializeWorkspace'));
});

test('buildDashboardHtml includes Open Dashboard button', () => {
  const html = buildDashboardHtml(defaultState(), 'n7');
  assert.ok(html.includes('ralphCodex.openDashboard'));
  assert.ok(html.includes('Open Dashboard'));
});

test('buildDashboardHtml renders header with workspace name and state', () => {
  const html = buildDashboardHtml(defaultState({ workspaceName: 'my-project' }), 'n8');
  assert.ok(html.includes('my-project'));
  assert.ok(html.includes('Ralphdex'));
  assert.ok(html.includes('idle'));
});

test('buildDashboardHtml includes command-ack message handler', () => {
  const html = buildDashboardHtml(defaultState(), 'n9');
  assert.ok(html.includes('command-ack'));
  assert.ok(html.includes('resetButton'));
});

test('buildDashboardHtml renders sidebar task-seeding affordance and latest result copy', () => {
  const html = buildDashboardHtml(defaultState({
    taskSeeding: {
      phase: 'success',
      requestText: 'Seed a sidebar epic',
      createdTaskCount: 4,
      message: 'Seeded 4 task(s).',
      artifactPath: '.ralph/artifacts/task-seeding/sidebar.json'
    }
  }), 'seed-sidebar');

  assert.ok(html.includes('Seed Tasks'));
  assert.ok(html.includes('data-seed-request'));
  assert.ok(html.includes("type: 'seed-tasks'"));
  assert.ok(html.includes('Seeded 4 task(s).'));
  assert.ok(html.includes('ralphCodex.showTasks'));
});

test('buildDashboardHtml preserves live status, orchestration, task, and settings shortcuts', () => {
  const html = buildDashboardHtml(defaultState(), 'sidebar-actions');

  assert.ok(html.includes('ralphCodex.showRalphStatus'));
  assert.ok(!html.includes('ralphCodex.showMultiAgentStatus'));
  assert.ok(html.includes('ralphCodex.showTasks'));
  assert.ok(html.includes('ralphCodex.openLatestPipelineRun'));
  assert.ok(html.includes('ralphCodex.openSettings'));
  assert.ok(html.includes('ralphCodex.openDashboard'));
});

test('buildDashboardHtml exposes Open PRD wizard in simple mode with the existing command binding', () => {
  const html = buildDashboardHtml(defaultState(), 'simple-prd-wizard');

  assert.ok(html.includes('Open PRD wizard'));
  assert.ok(html.includes('data-command="ralphCodex.openPrdWizard"'));
});

test('buildDashboardHtml omits orchestration tab wiring from sidebar navigation', () => {
  const html = buildDashboardHtml(defaultState(), 'sidebar-tabs');

  assert.ok(html.includes('data-sidebar-tab="run"'));
  assert.ok(html.includes('data-sidebar-tab="agents"'));
  assert.ok(html.includes('data-sidebar-tab="seed"'));
  assert.ok(!html.includes('data-sidebar-tab="orchestration"'));
  assert.ok(!html.includes('data-sidebar-panel="orchestration"'));
  assert.ok(!html.includes('>Orchestration<'));
});

test('buildDashboardHtml keeps refreshed sidebar routing bound to live commands and typed seed-task hooks', () => {
  const html = buildDashboardHtml(defaultState({
    taskSeeding: {
      phase: 'submitting',
      requestText: 'Seed the refreshed dashboard regression contract',
      createdTaskCount: null,
      message: 'Seeding tasks from sidebar request...',
      artifactPath: null
    }
  }), 'sidebar-routing');

  assert.ok(html.includes('data-command="ralphCodex.runRalphLoop"'));
  assert.ok(html.includes('data-command="ralphCodex.runMultiAgentLoop"'));
  assert.ok(html.includes('data-command="ralphCodex.runRalphIteration"'));
  assert.ok(html.includes('data-command="ralphCodex.showRalphStatus"'));
  assert.ok(!html.includes('data-command="ralphCodex.showMultiAgentStatus"'));
  assert.ok(html.includes('data-command="ralphCodex.openLatestPipelineRun"'));
  assert.ok(html.includes('data-command="ralphCodex.openSettings"'));
  assert.ok(html.includes('data-command="ralphCodex.showTasks"'));
  assert.ok(html.includes('data-command="ralphCodex.openDashboard"'));
  assert.ok(html.includes('data-seed-request="sidebar"'));
  assert.ok(html.includes('data-seed-submit="sidebar"'));
  assert.ok(html.includes("vscode.postMessage({ type: 'seed-tasks', requestText: requestText, source: source })"));
  assert.ok(html.includes("document.querySelectorAll('[data-seed-submit=\"' + msg.source + '\"]')"));
});

test('buildDashboardHtml surfaces live durable snapshot summary signals in the refreshed sidebar', () => {
  const html = buildDashboardHtml(defaultState({
    dashboardSnapshot: populatedDashboardSnapshot()
  }), 'sidebar-snapshot');

  assert.ok(html.includes('Selected T110'));
  assert.ok(html.includes('Surface dashboard sections'));
  assert.ok(html.includes('Blocked 1'));
  assert.ok(html.includes('Dead-Letter 1'));
  assert.ok(html.includes('validation_mismatch'));
  assert.ok(html.includes('Recover failed task'));
  assert.ok(html.includes('agent-alpha'));
});

// ---------------------------------------------------------------------------
// Phase 3 — Sidebar triage surface tests
// ---------------------------------------------------------------------------

test('overview counts render from taskCounts', () => {
  const html = buildDashboardHtml(defaultState({
    taskCounts: { todo: 5, in_progress: 2, blocked: 1, done: 8 }
  }), 'counts-tc');

  assert.ok(html.includes('overview-counts'), 'overview counts container');
  assert.ok(html.includes('2 Active'), 'active count from taskCounts');
  assert.ok(html.includes('5 Queued'), 'queued count from taskCounts');
  assert.ok(html.includes('1 Blocked'), 'blocked count from taskCounts');
  assert.ok(html.includes('8 Done'), 'done count from taskCounts');
});

test('overview counts render from dashboardSnapshot when taskCounts is null', () => {
  const html = buildDashboardHtml(defaultState({
    taskCounts: null,
    dashboardSnapshot: populatedDashboardSnapshot()
  }), 'counts-snap');

  assert.ok(html.includes('1 Active'), 'active from snapshot');
  assert.ok(html.includes('2 Queued'), 'queued from snapshot');
  assert.ok(html.includes('1 Blocked'), 'blocked from snapshot');
  assert.ok(html.includes('4 Done'), 'done from snapshot');
});

test('dead-letter count chip appears when dead-letter entries exist', () => {
  const html = buildDashboardHtml(defaultState({
    dashboardSnapshot: populatedDashboardSnapshot()
  }), 'dl-chip');

  assert.ok(html.includes('1 Dead'), 'dead-letter count chip');
  assert.ok(html.includes('data-filter="dead-letter"'), 'dead-letter filter attribute');
});

test('filter tabs render all expected statuses', () => {
  const html = buildDashboardHtml(defaultState(), 'filter-tabs');

  assert.ok(html.includes('filter-tabs'), 'filter tabs container');
  assert.ok(html.includes('data-filter="all"'), 'All filter');
  assert.ok(html.includes('data-filter="in_progress"'), 'Active filter');
  assert.ok(html.includes('data-filter="todo"'), 'Queued filter');
  assert.ok(html.includes('data-filter="blocked"'), 'Blocked filter');
  assert.ok(html.includes('data-filter="done"'), 'Done filter');
  assert.ok(html.includes('role="tab"'), 'tab role for accessibility');
});

test('search input has accessible label and clear affordance', () => {
  const html = buildDashboardHtml(defaultState(), 'search');

  assert.ok(html.includes('data-task-search'), 'search input');
  assert.ok(html.includes('aria-label="Search tasks'), 'search accessible label');
  assert.ok(html.includes('data-search-clear'), 'clear button');
  assert.ok(html.includes('aria-label="Clear search"'), 'clear button accessible label');
});

test('task list renders compact task rows with ID, title, status, and priority', () => {
  const tasks = [
    { id: 'T1', title: 'First task', status: 'todo' as const, isCurrent: false, priority: 'high', childIds: [], dependsOn: [] },
    { id: 'T2', title: 'Second task', status: 'in_progress' as const, isCurrent: true, priority: 'medium', childIds: [], dependsOn: [] },
    { id: 'T3', title: 'Blocked task', status: 'blocked' as const, isCurrent: false, priority: 'low', blocker: 'Missing API key', childIds: [], dependsOn: [] },
    { id: 'T4', title: 'Done task', status: 'done' as const, isCurrent: false, priority: 'medium', childIds: ['T4.1'], dependsOn: [] },
  ];
  const html = buildDashboardHtml(defaultState({ tasks }), 'task-rows');

  assert.ok(html.includes('sb-task-row'), 'task row class');
  assert.ok(html.includes('T1'), 'T1 ID');
  assert.ok(html.includes('First task'), 'T1 title');
  assert.ok(html.includes('T2'), 'T2 ID');
  assert.ok(html.includes('data-task-status="in_progress"'), 'status data attribute');
  assert.ok(html.includes('data-task-priority="high"'), 'priority data attribute');
  assert.ok(html.includes('sb-task-priority'), 'non-medium priority displayed');
  assert.ok(html.includes('role="listbox"'), 'listbox role');
});

test('current task row is marked with aria-selected', () => {
  const tasks = [
    { id: 'T1', title: 'Current', status: 'in_progress' as const, isCurrent: true, priority: 'medium', childIds: [], dependsOn: [] },
    { id: 'T2', title: 'Other', status: 'todo' as const, isCurrent: false, priority: 'medium', childIds: [], dependsOn: [] },
  ];
  const html = buildDashboardHtml(defaultState({ tasks }), 'selected');

  const t1Match = html.match(/data-task-id="T1"[^>]*aria-selected="true"/);
  assert.ok(t1Match, 'current task has aria-selected=true');
  const t2Match = html.match(/data-task-id="T2"[^>]*aria-selected="false"/);
  assert.ok(t2Match, 'non-current task has aria-selected=false');
});

test('blocked task has blocker marker and data attribute', () => {
  const tasks = [
    { id: 'T1', title: 'Blocked', status: 'blocked' as const, isCurrent: false, priority: 'medium', blocker: 'Dependency missing', childIds: [], dependsOn: [] },
  ];
  const html = buildDashboardHtml(defaultState({ tasks }), 'blocker');

  assert.ok(html.includes('sb-task-marker blocker'), 'blocker marker');
  assert.ok(html.includes('data-task-blocker="Dependency missing"'), 'blocker data attribute');
  assert.ok(html.includes('class="sb-task-row blocked"'), 'blocked row class');
});

test('task row with children has subtask marker', () => {
  const tasks = [
    { id: 'T1', title: 'Parent', status: 'todo' as const, isCurrent: false, priority: 'medium', childIds: ['T1.1', 'T1.2'], dependsOn: [] },
  ];
  const html = buildDashboardHtml(defaultState({ tasks }), 'children');

  assert.ok(html.includes('sb-task-marker has-children'), 'children marker');
  assert.ok(html.includes('aria-label="Has subtasks"'), 'subtask aria label');
});

test('task row expand controls link to detail element', () => {
  const tasks = [
    { id: 'T1', title: 'Expandable', status: 'todo' as const, isCurrent: false, priority: 'medium', notes: 'Some notes', childIds: [], dependsOn: ['T0'] },
  ];
  const html = buildDashboardHtml(defaultState({ tasks }), 'expand');

  assert.ok(html.includes('aria-controls="sb-detail-T1"'), 'aria-controls');
  assert.ok(html.includes('id="sb-detail-T1"'), 'detail id');
  assert.ok(html.includes('aria-expanded="false"'), 'initially collapsed');
  assert.ok(html.includes('Some notes'), 'notes in detail');
  assert.ok(html.includes('Depends on'), 'dependsOn in detail');
  assert.ok(html.includes('T0'), 'dependency ID');
});

test('alerts banner is prominent when blocked/dead-letter tasks exist', () => {
  const html = buildDashboardHtml(defaultState({
    taskCounts: { todo: 2, in_progress: 1, blocked: 3, done: 0 },
    dashboardSnapshot: populatedDashboardSnapshot()
  }), 'alerts');

  assert.ok(html.includes('alerts-banner'), 'alerts banner present');
  assert.ok(html.includes('3 blocked'), 'blocked count in banner');
  assert.ok(html.includes('1 dead-letter'), 'dead-letter count in banner');
  assert.ok(html.includes('needs attention'), 'attention message');
  assert.ok(html.includes('role="alert"'), 'alert role');
});

test('alerts banner absent when no blocked/dead-letter tasks', () => {
  const html = buildDashboardHtml(defaultState({
    taskCounts: { todo: 2, in_progress: 1, blocked: 0, done: 3 }
  }), 'no-alerts');

  assert.ok(!html.includes('class="alerts-banner'), 'no alerts banner element');
  assert.ok(!html.includes('needs attention'), 'no attention message');
});

test('dead-letter section shows entries with requeue/diagnose/recover actions', () => {
  const html = buildDashboardHtml(defaultState({
    dashboardSnapshot: populatedDashboardSnapshot()
  }), 'dl-section');

  assert.ok(html.includes('Dead-Letter (1)'), 'dead-letter section label with count');
  assert.ok(html.includes('T99'), 'dead-letter task ID');
  assert.ok(html.includes('Recover failed task'), 'dead-letter task title');
  assert.ok(html.includes('ralphCodex.requeueDeadLetterTask'), 'requeue action');
  assert.ok(html.includes('ralphCodex.openFailureDiagnosis'), 'diagnose action');
  assert.ok(html.includes('ralphCodex.autoRecoverTask'), 'auto-recover action');
  assert.ok(html.includes('3 attempts'), 'recovery attempt count');
});

test('dead-letter section shows positive empty state when empty', () => {
  const html = buildDashboardHtml(defaultState(), 'dl-empty');

  assert.ok(html.includes('No tasks in dead-letter queue'), 'positive empty message');
  assert.ok(html.includes('dl-positive-empty'), 'positive empty class');
});

test('seed form rejects empty input before postMessage', () => {
  const html = buildDashboardHtml(defaultState(), 'seed-validate');

  // Validation container present
  assert.ok(html.includes('data-seed-validation'), 'validation container');
  // JS validates trim length
  assert.ok(html.includes("requestText.trim().length === 0"), 'empty check in JS');
  assert.ok(html.includes("requestText.trim().length < 3"), 'too-short check in JS');
  assert.ok(html.includes("'Input cannot be whitespace only'"), 'whitespace-only message');
});

test('seed success renders created count and artifact path', () => {
  const html = buildDashboardHtml(defaultState({
    taskSeeding: {
      phase: 'success',
      requestText: 'Test seed',
      createdTaskCount: 5,
      message: 'Seeded 5 task(s).',
      artifactPath: '.ralph/artifacts/task-seeding/sidebar.json'
    }
  }), 'seed-success');

  assert.ok(html.includes('Seeded 5 task(s).'), 'seed message');
  assert.ok(html.includes('Created 5 task(s)'), 'created count');
  assert.ok(html.includes('.ralph/artifacts/task-seeding/sidebar.json'), 'artifact path');
  assert.ok(html.includes('View Tasks'), 'next action: view tasks');
  assert.ok(html.includes('Run Loop'), 'next action: run loop');
  assert.ok(html.includes('seed-success-actions'), 'success actions container');
});

test('quick action buttons use existing command IDs', () => {
  const html = buildDashboardHtml(defaultState(), 'qa-cmds');

  assert.ok(html.includes('ralphCodex.addTask'), 'addTask');
  assert.ok(html.includes('ralphCodex.showRalphStatus'), 'showRalphStatus');
  assert.ok(html.includes('ralphCodex.showTasks'), 'showTasks');
  assert.ok(html.includes('ralphCodex.openLatestRalphSummary'), 'openLatestRalphSummary');
  assert.ok(html.includes('ralphCodex.openLatestPipelineRun'), 'openLatestPipelineRun');
  assert.ok(html.includes('ralphCodex.openSettings'), 'openSettings');
  assert.ok(html.includes('ralphCodex.openDashboard'), 'openDashboard');
  assert.ok(html.includes('ralphCodex.runRalphLoop'), 'runRalphLoop');
  assert.ok(html.includes('ralphCodex.runRalphIteration'), 'runRalphIteration');
  assert.ok(html.includes('ralphCodex.seedTasksFromFeatureRequest') || html.includes('data-seed-submit'), 'seed path');
});

test('iteration/artifact rows expose clickable affordance in recent outputs', () => {
  const html = buildDashboardHtml(defaultState({
    recentIterations: [
      { iteration: 3, taskId: 'T1', taskTitle: 'Test', classification: 'complete', stopReason: null, artifactDir: '/tmp/iter3' },
      { iteration: 2, taskId: 'T1', taskTitle: 'Test', classification: 'partial_progress', stopReason: null, artifactDir: '/tmp/iter2' },
    ]
  }), 'recent-outputs');

  assert.ok(html.includes('Recent Outputs'), 'recent outputs section');
  assert.ok(html.includes('iter-row'), 'iteration row');
  assert.ok(html.includes('data-artifact-dir'), 'artifact dir data attribute');
  assert.ok(html.includes('iter-row-chevron'), 'chevron affordance');
  assert.ok(html.includes('open-iteration-artifact'), 'artifact open message');
  assert.ok(html.includes('#3'), 'iteration number');
  assert.ok(html.includes('#2'), 'second iteration number');
});

test('recent outputs shows empty state when no iterations', () => {
  const html = buildDashboardHtml(defaultState(), 'recent-empty');

  assert.ok(html.includes('No iterations recorded yet'), 'empty message');
});

test('reduced-motion CSS exists in sidebar styles', () => {
  const html = buildDashboardHtml(defaultState(), 'reduced-motion');

  assert.ok(html.includes('prefers-reduced-motion: reduce'), 'media query present');
  assert.ok(html.includes('.state-dot.running { animation: none'), 'running dot animation disabled');
});

test('no external @import or CDN font URLs in sidebar output', () => {
  const html = buildDashboardHtml(defaultState(), 'no-cdn');

  assert.ok(!html.includes('@import url'), 'no @import url');
  assert.ok(!html.includes('cdn.jsdelivr.net'), 'no jsdelivr CDN');
  assert.ok(!html.includes('fonts.googleapis.com'), 'no Google Fonts CDN');
});

test('triage tab is default active in advanced mode', () => {
  const html = buildDashboardHtml(defaultState(), 'triage-default');

  assert.ok(html.includes('data-sidebar-tab="triage"'), 'triage tab exists');
  assert.ok(html.includes('data-sidebar-panel="triage"'), 'triage panel exists');
  // Triage tab has active class
  const triageTabMatch = html.match(/<button class="sidebar-tab active" data-sidebar-tab="triage">/);
  assert.ok(triageTabMatch, 'triage tab is active by default');
});

test('empty task list shows Add Task and Seed Tasks CTAs', () => {
  const html = buildDashboardHtml(defaultState(), 'empty-tasks');

  assert.ok(html.includes('No tasks yet'), 'empty message');
  assert.ok(html.includes('ralphCodex.addTask'), 'add task CTA');
  assert.ok(html.includes('ralphCodex.seedTasksFromFeatureRequest'), 'seed tasks CTA');
});

test('sidebar preserves seed-tasks webview message path', () => {
  const html = buildDashboardHtml(defaultState(), 'seed-path');

  assert.ok(html.includes('data-seed-request="sidebar"'), 'seed request textarea');
  assert.ok(html.includes('data-seed-submit="sidebar"'), 'seed submit button');
  assert.ok(html.includes("vscode.postMessage({ type: 'seed-tasks', requestText: requestText, source: source })"), 'seed-tasks postMessage');
  assert.ok(html.includes("document.querySelectorAll('[data-seed-submit=\"' + msg.source + '\"]')"), 'seed-tasks-result handler');
});

test('search filters by task ID, title, status, and priority in JS', () => {
  const html = buildDashboardHtml(defaultState(), 'search-js');

  // Verify data attributes are present for filtering
  assert.ok(html.includes('data-task-status'), 'status data attr for filtering');
  assert.ok(html.includes('data-task-priority'), 'priority data attr for filtering');
  assert.ok(html.includes('data-task-blocker'), 'blocker data attr for filtering');
  // Verify JS search logic covers all fields
  assert.ok(html.includes("id.toLowerCase().indexOf(currentSearch)"), 'JS searches by ID');
  assert.ok(html.includes("titleText.toLowerCase().indexOf(currentSearch)"), 'JS searches by title');
  assert.ok(html.includes("status.toLowerCase().indexOf(currentSearch)"), 'JS searches by status');
  assert.ok(html.includes("priority.toLowerCase().indexOf(currentSearch)"), 'JS searches by priority');
  assert.ok(html.includes("blocker.toLowerCase().indexOf(currentSearch)"), 'JS searches by blocker');
});
