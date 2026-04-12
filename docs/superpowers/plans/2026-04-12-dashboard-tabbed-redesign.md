# Dashboard Tabbed Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-screen Ralphdex dashboard panel with a tabbed Overview/Work/Diagnostics/Settings experience that preserves every current command path, adds explicit refresh/error state handling, and fixes misleading work-tab interactions.

**Architecture:** Keep the existing `DashboardHost` + webview renderer split, add explicit dashboard snapshot-status state in host-managed data, and move panel content into tab-focused render helpers. Preserve the current command IDs and config-sync path, but add one additive webview message for row-specific iteration artifact opening so the Work tab can open the clicked row rather than the latest global summary.

**Tech Stack:** TypeScript, VS Code webviews, Node test runner, existing `test/register-vscode-stub.cjs` harness, `npm run check:docs`, `npm run validate`

---

## File Map

- Create: `src/ui/panelTabs.ts`
  - Own per-tab markup builders: `buildOverviewTab`, `buildWorkTab`, `buildDiagnosticsTab`, `buildSettingsTab`
  - Consume existing dashboard state and section helpers so `panelHtml.ts` can shrink to shell + script + CSS
- Modify: `src/ui/uiTypes.ts:91-218`
  - Add dashboard snapshot-phase types
  - Add additive webview command for row-specific iteration artifact opening
  - Extend `RalphDashboardState` with snapshot refresh/error state
- Modify: `src/ui/sidebarViewProvider.ts:65-123`
  - Initialize new dashboard state fields in `defaultDashboardState()`
- Modify: `src/webview/dashboardHost.ts:1-220`
  - Track `loading` / `refreshing` / `ready` / `error`
  - Preserve the last successful snapshot on refresh failure
  - Handle the additive row-specific artifact-open webview message
- Modify: `src/ui/htmlHelpers.ts:58-160,261-390`
  - Convert task and iteration rows to semantic controls
  - Add focus and responsive-friendly styles used by the panel
- Modify: `src/ui/panelHtml.ts:21-1139`
  - Add tab shell, tab script, and responsive CSS
  - Route tab content through `panelTabs.ts`
  - Consolidate duplicate action groups into Overview/Diagnostics/Settings placements
- Test: `test/webview/dashboardHost.test.ts:1-275`
  - Cover snapshot-state transitions and artifact-open message handling
- Test: `test/ui/panelHtml.test.ts:1-486`
  - Cover tab shell, moved content, semantic controls, and responsive CSS hooks
- Modify: `README.md:64-99`
  - Update dashboard description to mention tabbed panel and where common actions live
- Modify: `docs/workflows.md:401-409`
  - Update “Show Status” and “Inspect State” wording to reflect tabs

### Task 1: Host State Plumbing And Row-Specific Artifact Opening

**Files:**
- Modify: `src/ui/uiTypes.ts:91-218`
- Modify: `src/ui/sidebarViewProvider.ts:65-80`
- Modify: `src/webview/dashboardHost.ts:1-220`
- Test: `test/webview/dashboardHost.test.ts:1-275`

- [ ] **Step 1: Write the failing host-state tests**

Add these tests to `test/webview/dashboardHost.test.ts` after the existing constructor/update tests:

```ts
test('DashboardHost: refresh failure preserves last successful snapshot and exposes error phase', async () => {
  const wv = makeMockWebview();
  const broadcaster = new IterationBroadcaster();
  let callCount = 0;

  const snapshot = {
    workspaceName: 'test-ws',
    pipeline: null,
    taskBoard: null,
    agentGrid: { rows: [] },
    failureFeed: { entries: [] },
    deadLetter: { entries: [] },
    quickActions: { hasDeadLetterEntries: false, hasBlockedTasks: false, canAttemptLoop: false },
    cost: { executionCostUsd: null, diagnosticCostUsd: null, promptCacheStats: null, hasAnyCostData: false }
  } as const;

  const host = new DashboardHost(
    wv as unknown as import('vscode').Webview,
    broadcaster,
    (state, _nonce) =>
      `<html>${state.snapshotStatus.phase}:${state.snapshotStatus.errorMessage ?? 'none'}:${state.dashboardSnapshot?.workspaceName ?? 'none'}</html>` as never,
    async () => {
      callCount++;
      if (callCount === 1) {
        return snapshot as never;
      }
      throw new Error('snapshot boom');
    }
  );

  await new Promise((resolve) => setImmediate(resolve));
  const deadline = Date.now() + 110;
  while (Date.now() < deadline) { /* spin */ }

  await host.refreshDashboardSnapshot();

  assert.ok(wv.html.includes('error:snapshot boom:test-ws'));
  broadcaster.dispose();
});

test('DashboardHost: open-iteration-artifact opens the clicked iteration summary path', async () => {
  const wv = makeMockWebview();
  const broadcaster = new IterationBroadcaster();
  const host = new DashboardHost(
    wv as unknown as import('vscode').Webview,
    broadcaster,
    makeSimpleRenderFn('panel') as never
  );

  const artifactDir = 'C:/tmp/iteration-004';
  const vscodeApi = await import('vscode');
  const openedBefore = (vscodeApi.workspace as unknown as { openedTextDocuments?: string[] }).openedTextDocuments ?? [];
  openedBefore.length = 0;

  webviewSends(wv, { type: 'open-iteration-artifact', artifactDir });
  await new Promise((resolve) => setImmediate(resolve));

  const openedAfter = (vscodeApi.workspace as unknown as { openedTextDocuments?: string[] }).openedTextDocuments ?? [];
  assert.ok(openedAfter.some((entry) => entry.includes('summary.md')));

  host.dispose();
  broadcaster.dispose();
});
```

- [ ] **Step 2: Run the targeted host tests and verify they fail**

Run:

```bash
npm run compile:tests && node --require ./test/register-vscode-stub.cjs --test ./out-test/test/webview/dashboardHost.test.js
```

Expected: FAIL because `snapshotStatus` and `open-iteration-artifact` do not exist yet.

- [ ] **Step 3: Add the dashboard snapshot-status and additive webview command types**

Update `src/ui/uiTypes.ts` with these additions:

```ts
export type RalphDashboardSnapshotPhase = 'idle' | 'loading' | 'refreshing' | 'ready' | 'error';

export interface RalphDashboardSnapshotStatus {
  phase: RalphDashboardSnapshotPhase;
  errorMessage: string | null;
}

export interface RalphDashboardState {
  workspaceName: string;
  loopState: RalphUiLoopState;
  agentRole: string;
  nextIteration: number;
  iterationCap: number;
  taskCounts: RalphTaskCounts | null;
  tasks: RalphDashboardTask[];
  recentIterations: RalphDashboardIteration[];
  preflightReady: boolean;
  preflightSummary: string;
  diagnostics: Array<{ severity: string; message: string }>;
  agentLanes: RalphAgentLaneState[];
  config: RalphDashboardConfigSnapshot | null;
  dashboardSnapshot: DashboardSnapshot | null;
  snapshotStatus: RalphDashboardSnapshotStatus;
}

export type RalphWebviewCommand =
  | { type: 'command'; command: string }
  | { type: 'expand-task'; taskId: string }
  | { type: 'update-setting'; key: string; value: unknown }
  | { type: 'open-iteration-artifact'; artifactDir: string };
```

Update `src/ui/sidebarViewProvider.ts` so `defaultDashboardState()` initializes the new field:

```ts
export function defaultDashboardState(): import('./uiTypes').RalphDashboardState {
  return {
    workspaceName: 'workspace',
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
    dashboardSnapshot: null,
    snapshotStatus: {
      phase: 'idle',
      errorMessage: null
    }
  };
}
```

- [ ] **Step 4: Implement refresh-state tracking and row-specific artifact opening in the host**

Update `src/webview/dashboardHost.ts`:

```ts
import * as path from 'path';
```

Inside the message handler:

```ts
      if (msg.type === 'open-iteration-artifact') {
        await this.openIterationArtifact(msg.artifactDir);
      }
```

When reassembling state in `updateFromWatchedState`, preserve the snapshot status:

```ts
    this.latestState = {
      workspaceName: workspaceFolder?.name ?? 'unknown',
      loopState: this.latestState.loopState === 'running' ? 'running' : (ws?.lastIteration?.stopReason ? 'stopped' : 'idle'),
      agentRole: config?.agentRole ?? 'build',
      nextIteration: ws?.nextIteration ?? 1,
      iterationCap: config?.ralphIterationCap ?? 5,
      taskCounts,
      tasks,
      recentIterations,
      preflightReady: true,
      preflightSummary: 'ok',
      diagnostics: [],
      agentLanes: this.getLanes(),
      config: config ? snapshotConfig(config) : null,
      dashboardSnapshot: this.latestState.dashboardSnapshot,
      snapshotStatus: this.latestState.snapshotStatus
    };
```

Replace `refreshDashboardSnapshot()` with stateful transitions:

```ts
  async refreshDashboardSnapshot(): Promise<void> {
    if (!this.loadSnapshot) {
      return;
    }

    const generation = ++this.snapshotLoadGeneration;
    const hadSnapshot = this.latestState.dashboardSnapshot !== null;
    this.latestState = {
      ...this.latestState,
      snapshotStatus: {
        phase: hadSnapshot ? 'refreshing' : 'loading',
        errorMessage: null
      }
    };
    this.fullRender();

    try {
      const snapshot = await this.loadSnapshot();
      if (generation !== this.snapshotLoadGeneration) {
        return;
      }
      this.latestState = {
        ...this.latestState,
        dashboardSnapshot: snapshot,
        snapshotStatus: {
          phase: 'ready',
          errorMessage: null
        }
      };
      this.fullRender();
    } catch (error) {
      if (generation !== this.snapshotLoadGeneration) {
        return;
      }
      this.latestState = {
        ...this.latestState,
        snapshotStatus: {
          phase: 'error',
          errorMessage: error instanceof Error ? error.message : 'Dashboard snapshot refresh failed.'
        }
      };
      this.fullRender();
    }
  }
```

Add the helper:

```ts
  private async openIterationArtifact(artifactDir: string): Promise<void> {
    const candidates = [
      path.join(artifactDir, 'summary.md'),
      path.join(artifactDir, 'preflight-summary.md')
    ];

    for (const candidate of candidates) {
      try {
        const uri = vscode.Uri.file(candidate);
        await vscode.workspace.fs.stat(uri);
        const document = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(document, { preview: false });
        return;
      } catch {
        // try the next candidate
      }
    }
  }
```

- [ ] **Step 5: Extend the VS Code stub if the new host test needs explicit tracking**

If `test/register-vscode-stub.cjs` does not already expose opened text documents, add a shared array and push file paths from `openTextDocument`:

```js
const openedTextDocuments = [];

const workspace = {
  async openTextDocument(uriOrPath) {
    const fsPath = typeof uriOrPath === 'string'
      ? uriOrPath
      : (uriOrPath && uriOrPath.fsPath) || '';
    openedTextDocuments.push(fsPath);
    return { uri: typeof uriOrPath === 'string' ? { fsPath } : uriOrPath, getText: async () => '' };
  },
  openedTextDocuments
};
```

- [ ] **Step 6: Re-run the targeted host tests and verify they pass**

Run:

```bash
npm run compile:tests && node --require ./test/register-vscode-stub.cjs --test ./out-test/test/webview/dashboardHost.test.js
```

Expected: PASS for the new snapshot-state and artifact-open tests, with no regressions in the existing host tests.

- [ ] **Step 7: Commit the host-state slice**

```bash
git add src/ui/uiTypes.ts src/ui/sidebarViewProvider.ts src/webview/dashboardHost.ts test/webview/dashboardHost.test.ts test/register-vscode-stub.cjs
git commit -m "feat: add dashboard host refresh state plumbing"
```

### Task 2: Build The Tabbed Panel Shell And Rehome Existing Sections

**Files:**
- Create: `src/ui/panelTabs.ts`
- Modify: `src/ui/panelHtml.ts:21-1139`
- Test: `test/ui/panelHtml.test.ts:1-486`

- [ ] **Step 1: Write the failing panel-shell tests**

Add these tests to `test/ui/panelHtml.test.ts` near the existing layout and populated-dashboard assertions:

```ts
test('buildPanelDashboardHtml renders overview, work, diagnostics, and settings tabs', () => {
  const html = buildPanelDashboardHtml(defaultState({ dashboardSnapshot: populatedDashboardSnapshot() }), 'tabs');
  assert.ok(html.includes('data-tab="overview"'));
  assert.ok(html.includes('data-tab="work"'));
  assert.ok(html.includes('data-tab="diagnostics"'));
  assert.ok(html.includes('data-tab="settings"'));
  assert.ok(html.includes('aria-selected="true"'));
});

test('buildPanelDashboardHtml moves settings and diagnostics sections behind tab panels', () => {
  const html = buildPanelDashboardHtml(defaultState({ config: fullConfig(), dashboardSnapshot: populatedDashboardSnapshot() }), 'tab-panels');
  assert.ok(html.includes('data-panel="overview"'));
  assert.ok(html.includes('data-panel="work"'));
  assert.ok(html.includes('data-panel="diagnostics"'));
  assert.ok(html.includes('data-panel="settings"'));
  assert.ok(html.includes('Common Actions'));
  assert.ok(html.includes('Pipeline Strip'));
  assert.ok(html.includes('Settings'));
});

test('buildPanelDashboardHtml includes the responsive tabbed-layout media query', () => {
  const html = buildPanelDashboardHtml(defaultState(), 'responsive-tabs');
  assert.ok(html.includes('@media (max-width: 960px)'));
  assert.ok(html.includes('.dashboard-tabs'));
  assert.ok(html.includes('.dashboard-tab-panel'));
});

test('buildPanelDashboardHtml preserves content while showing refresh and error banners', () => {
  const html = buildPanelDashboardHtml(defaultState({
    dashboardSnapshot: populatedDashboardSnapshot(),
    snapshotStatus: { phase: 'error', errorMessage: 'snapshot boom' }
  }), 'snapshot-banner');

  assert.ok(html.includes('Dashboard snapshot refresh failed: snapshot boom'));
  assert.ok(html.includes('pipeline-001'));
});

test('buildPanelDashboardHtml persists the selected tab in webview state', () => {
  const html = buildPanelDashboardHtml(defaultState(), 'tab-state');
  assert.ok(html.includes('state.selectedTab'));
  assert.ok(html.includes('restoreSelectedTab'));
  assert.ok(html.includes('activateTab'));
});
```

- [ ] **Step 2: Run the targeted panel tests and verify they fail**

Run:

```bash
npm run compile:tests && node --require ./test/register-vscode-stub.cjs --test ./out-test/test/ui/panelHtml.test.js
```

Expected: FAIL because the panel does not render any tabs or responsive tab shell yet.

- [ ] **Step 3: Create focused tab builders in `src/ui/panelTabs.ts`**

Create `src/ui/panelTabs.ts` with the per-tab builders. Start with this structure:

```ts
import type { RalphDashboardState } from './uiTypes';
import {
  buildDiagnostics,
  buildIterationRow,
  buildProgressBar,
  buildTaskRow,
  esc
} from './htmlHelpers';

export interface PanelTabRenderInput {
  state: RalphDashboardState;
  activeTasks: RalphDashboardState['tasks'];
  doneTasks: RalphDashboardState['tasks'];
  allDone: boolean;
  isRunning: boolean;
  loopDisabled: string;
  buildPipelineSection: (state: RalphDashboardState) => string;
  buildTaskBoardSection: (state: RalphDashboardState) => string;
  buildFailureFeedSection: (state: RalphDashboardState) => string;
  buildAgentGridSection: (state: RalphDashboardState) => string;
  buildDeadLetterSection: (state: RalphDashboardState) => string;
  buildCostTickerSection: (state: RalphDashboardState) => string;
  buildSettingsSection: (cfg: NonNullable<RalphDashboardState['config']>) => string;
}

export function buildOverviewTab(input: PanelTabRenderInput): string {
  const { state, loopDisabled, buildFailureFeedSection, buildTaskBoardSection } = input;
  return `<section class="dashboard-tab-panel is-active" data-panel="overview">
    <div class="dashboard-summary-grid">
      ${buildTaskBoardSection(state)}
      ${buildFailureFeedSection(state)}
      <div class="dashboard-summary-card">
        <div class="card-title">Recent Activity</div>
        ${state.recentIterations.length > 0
          ? state.recentIterations.slice(0, 5).map(buildIterationRow).join('\\n')
          : '<div class="empty">No iterations yet</div>'}
      </div>
      <div class="dashboard-summary-card">
        <div class="card-title">Common Actions</div>
        <div class="btn-grid">
          <button class="btn" data-command="ralphCodex.runRalphLoop"${loopDisabled}><span class="btn-label">Run Loop</span><span class="btn-spinner"></span></button>
          <button class="btn" data-command="ralphCodex.runMultiAgentLoop"${loopDisabled}><span class="btn-label">Run Multi-Agent</span><span class="btn-spinner"></span></button>
          <button class="btn" data-command="ralphCodex.runRalphIteration"${loopDisabled}><span class="btn-label">Run Iteration</span><span class="btn-spinner"></span></button>
          <button class="btn" data-command="ralphCodex.generatePrompt"><span class="btn-label">Prepare Prompt</span><span class="btn-spinner"></span></button>
          <button class="btn" data-command="ralphCodex.resumePipeline"><span class="btn-label">Resume Pipeline</span><span class="btn-spinner"></span></button>
          <button class="btn" data-command="ralphCodex.approveHumanReview"><span class="btn-label">Approve Review</span><span class="btn-spinner"></span></button>
        </div>
      </div>
    </div>
  </section>`;
}

export function buildWorkTab(input: PanelTabRenderInput): string {
  const { state, activeTasks, doneTasks, allDone, isRunning } = input;
  return `<section class="dashboard-tab-panel" data-panel="work">
    <div class="card">
      <div class="card-title">Task Board</div>
      ${buildProgressBar(state.taskCounts)}
      ${allDone
        ? `<div class="all-done-card"><div class="check">✓</div><div class="label">All ${doneTasks.length} tasks completed</div></div>`
        : activeTasks.length > 0
          ? activeTasks.map((task) => buildTaskRow(task, isRunning)).join('\\n')
          : '<div class="empty">No tasks yet — run Initialize Workspace</div>'}
      ${!allDone && doneTasks.length > 0
        ? `<details><summary class="completed-toggle">Completed (${doneTasks.length})</summary>${doneTasks.map((task) => buildTaskRow(task, isRunning)).join('\\n')}</details>`
        : ''}
    </div>
    <div class="card">
      <div class="card-title">History</div>
      ${state.recentIterations.length > 0
        ? state.recentIterations.map(buildIterationRow).join('\\n')
        : '<div class="empty">No iterations yet</div>'}
    </div>
  </section>`;
}

export function buildDiagnosticsTab(input: PanelTabRenderInput): string {
  const {
    state,
    buildPipelineSection,
    buildFailureFeedSection,
    buildAgentGridSection,
    buildDeadLetterSection,
    buildCostTickerSection
  } = input;
  return `<section class="dashboard-tab-panel" data-panel="diagnostics">
    <div class="dashboard-summary-grid">
      ${buildPipelineSection(state)}
      ${buildFailureFeedSection(state)}
      ${buildAgentGridSection(state)}
      ${buildDeadLetterSection(state)}
      ${buildCostTickerSection(state)}
      <div class="dashboard-summary-card">
        <div class="card-title">Artifact Tools</div>
        <div class="btn-grid">
          <button class="btn" data-command="ralphCodex.openLatestPipelineRun"><span class="btn-label">Open Pipeline</span><span class="btn-spinner"></span></button>
          <button class="btn" data-command="ralphCodex.openLatestProvenanceBundle"><span class="btn-label">Open Provenance</span><span class="btn-spinner"></span></button>
          <button class="btn" data-command="ralphCodex.openLatestPromptEvidence"><span class="btn-label">Prompt Evidence</span><span class="btn-spinner"></span></button>
          <button class="btn" data-command="ralphCodex.openLatestCliTranscript"><span class="btn-label">CLI Transcript</span><span class="btn-spinner"></span></button>
          <button class="btn" data-command="ralphCodex.showRalphStatus"><span class="btn-label">Refresh Status</span><span class="btn-spinner"></span></button>
        </div>
      </div>
      <div class="dashboard-summary-card">
        <div class="card-title">Preflight</div>
        ${buildDiagnostics(state)}
      </div>
    </div>
  </section>`;
}

export function buildSettingsTab(input: PanelTabRenderInput): string {
  const { state } = input;
  return `<section class="dashboard-tab-panel" data-panel="settings">
    <div class="card">
      <div class="card-title">Settings</div>
      ${state.config
        ? input.buildSettingsSection(state.config)
        : '<div class="empty">Config not loaded — reload window</div>'}
    </div>
    <div class="card">
      <div class="card-title">Agent Actions</div>
      <div class="btn-grid">
        <button class="btn" data-command="ralphCodex.runReviewAgent"><span class="btn-label">Run Review Agent</span><span class="btn-spinner"></span></button>
        <button class="btn" data-command="ralphCodex.runWatchdogAgent"><span class="btn-label">Run Watchdog Agent</span><span class="btn-spinner"></span></button>
        <button class="btn" data-command="ralphCodex.runScmAgent"><span class="btn-label">Run SCM Agent</span><span class="btn-spinner"></span></button>
      </div>
    </div>
    <div class="card">
      <div class="card-title">Projects</div>
      <div class="btn-grid">
        <button class="btn" data-command="ralphCodex.initializeWorkspace"><span class="btn-label">Initialize Workspace</span><span class="btn-spinner"></span></button>
        <button class="btn" data-command="ralphCodex.newProject"><span class="btn-label">New Project</span><span class="btn-spinner"></span></button>
        <button class="btn" data-command="ralphCodex.switchProject"><span class="btn-label">Switch Project</span><span class="btn-spinner"></span></button>
        <button class="btn" data-command="workbench.action.openSettings"><span class="btn-label">Open VS Code Settings</span><span class="btn-spinner"></span></button>
      </div>
    </div>
  </section>`;
}
```

- [ ] **Step 4: Refactor `panelHtml.ts` to render the tab shell**

In `src/ui/panelHtml.ts`:

1. Import the tab builders:

```ts
import {
  buildDiagnosticsTab,
  buildOverviewTab,
  buildSettingsTab,
  buildWorkTab
} from './panelTabs';
```

2. Add tab CSS:

```ts
.dashboard-status-banner {
  margin-bottom: 12px;
  padding: 8px 10px;
  border: 1px solid var(--ralph-border);
  font-size: 11px;
}

.dashboard-status-banner.loading,
.dashboard-status-banner.refreshing {
  border-color: var(--ralph-amber);
  color: var(--ralph-amber);
}

.dashboard-status-banner.error {
  border-color: var(--ralph-red);
  color: var(--ralph-red);
}

.dashboard-shell {
  margin-top: 12px;
}

.dashboard-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}

.dashboard-tab {
  padding: 6px 10px;
  border: 1px solid var(--ralph-border);
  background: transparent;
  color: var(--vscode-foreground);
  font-family: var(--ralph-font);
  font-size: 11px;
  cursor: pointer;
}

.dashboard-tab[aria-selected="true"] {
  border-color: var(--ralph-amber);
  color: var(--ralph-amber);
}

.dashboard-tab-panel {
  display: none;
}

.dashboard-tab-panel.is-active {
  display: block;
}

@media (max-width: 960px) {
  .dashboard-grid,
  .dashboard-summary-grid,
  .metric-grid,
  .settings-grid,
  .btn-grid {
    grid-template-columns: 1fr;
  }

  .dashboard-grid {
    gap: 12px;
  }
}
```

3. Replace the current `<div class="dashboard-grid">...</div>` body with a tab shell:

```ts
  ${buildSnapshotStatusBanner(state)}
  <div class="dashboard-shell">
    <div class="dashboard-tabs" role="tablist" aria-label="Dashboard sections">
      <button class="dashboard-tab" type="button" role="tab" data-tab="overview" aria-selected="true" aria-controls="panel-overview">Overview</button>
      <button class="dashboard-tab" type="button" role="tab" data-tab="work" aria-selected="false" aria-controls="panel-work">Work</button>
      <button class="dashboard-tab" type="button" role="tab" data-tab="diagnostics" aria-selected="false" aria-controls="panel-diagnostics">Diagnostics</button>
      <button class="dashboard-tab" type="button" role="tab" data-tab="settings" aria-selected="false" aria-controls="panel-settings">Settings</button>
    </div>
    <div class="dashboard-tab-panels">
      <div id="panel-overview">${buildOverviewTab({ state, activeTasks, doneTasks, allDone, isRunning, loopDisabled, buildPipelineSection, buildTaskBoardSection, buildFailureFeedSection, buildAgentGridSection, buildDeadLetterSection, buildCostTickerSection, buildSettingsSection })}</div>
      <div id="panel-work">${buildWorkTab({ state, activeTasks, doneTasks, allDone, isRunning, loopDisabled, buildPipelineSection, buildTaskBoardSection, buildFailureFeedSection, buildAgentGridSection, buildDeadLetterSection, buildCostTickerSection, buildSettingsSection })}</div>
      <div id="panel-diagnostics">${buildDiagnosticsTab({ state, activeTasks, doneTasks, allDone, isRunning, loopDisabled, buildPipelineSection, buildTaskBoardSection, buildFailureFeedSection, buildAgentGridSection, buildDeadLetterSection, buildCostTickerSection, buildSettingsSection })}</div>
      <div id="panel-settings">${buildSettingsTab({ state, activeTasks, doneTasks, allDone, isRunning, loopDisabled, buildPipelineSection, buildTaskBoardSection, buildFailureFeedSection, buildAgentGridSection, buildDeadLetterSection, buildCostTickerSection, buildSettingsSection })}</div>
    </div>
  </div>
```

Add the banner helper in `panelHtml.ts` above `buildPanelDashboardHtml`:

```ts
function buildSnapshotStatusBanner(state: RalphDashboardState): string {
  switch (state.snapshotStatus.phase) {
    case 'loading':
      return '<div class="dashboard-status-banner loading">Loading dashboard snapshot…</div>';
    case 'refreshing':
      return '<div class="dashboard-status-banner refreshing">Refreshing dashboard snapshot…</div>';
    case 'error':
      return `<div class="dashboard-status-banner error">Dashboard snapshot refresh failed: ${esc(state.snapshotStatus.errorMessage ?? 'unknown error')}</div>`;
    default:
      return '';
  }
}
```

Update the snapshot-dependent summary builders so they honor `snapshotStatus` when `dashboardSnapshot` is missing instead of always rendering generic empties. For example:

```ts
function buildSnapshotPlaceholder(title: string, state: RalphDashboardState, emptyCopy: string): string {
  if (state.snapshotStatus.phase === 'loading') {
    return `<div class="dashboard-summary-card"><div class="card-title">${esc(title)}</div><div class="empty">Loading dashboard snapshot…</div></div>`;
  }
  if (state.snapshotStatus.phase === 'error') {
    return `<div class="dashboard-summary-card"><div class="card-title">${esc(title)}</div><div class="empty">Dashboard snapshot refresh failed.</div></div>`;
  }
  return `<div class="dashboard-summary-card"><div class="card-title">${esc(title)}</div><div class="empty">${esc(emptyCopy)}</div></div>`;
}
```

Then use `buildSnapshotPlaceholder(...)` from `buildTaskBoardSection`, `buildFailureFeedSection`, `buildAgentGridSection`, `buildDeadLetterSection`, and `buildCostTickerSection` whenever `dashboardSnapshot` data is unavailable.

- [ ] **Step 5: Add tab-selection persistence to the existing panel script**

Extend the `panelHtml.ts` webview script with explicit tab persistence:

```ts
      function activateTab(tabId) {
        var state = vscode.getState() || {};
        state.selectedTab = tabId;
        vscode.setState(state);

        document.querySelectorAll('.dashboard-tab').forEach(function(el) {
          var selected = el.getAttribute('data-tab') === tabId;
          el.setAttribute('aria-selected', selected ? 'true' : 'false');
        });

        document.querySelectorAll('.dashboard-tab-panel').forEach(function(el) {
          var active = el.getAttribute('data-panel') === tabId;
          el.classList.toggle('is-active', active);
        });
      }

      function restoreSelectedTab() {
        var state = vscode.getState() || {};
        activateTab(state.selectedTab || 'overview');
      }

      restoreSelectedTab();
```

And hook tab clicks:

```ts
        var tab = e.target.closest('.dashboard-tab[data-tab]');
        if (tab) {
          activateTab(tab.getAttribute('data-tab'));
          return;
        }
```

- [ ] **Step 6: Re-run the targeted panel tests and verify they pass**

Run:

```bash
npm run compile:tests && node --require ./test/register-vscode-stub.cjs --test ./out-test/test/ui/panelHtml.test.js
```

Expected: PASS for the new tab-shell tests and existing panel tests that still apply.

- [ ] **Step 7: Commit the tab-shell slice**

```bash
git add src/ui/panelTabs.ts src/ui/panelHtml.ts test/ui/panelHtml.test.ts
git commit -m "feat: add tabbed dashboard panel shell"
```

### Task 3: Make The Work Tab Accessible And Honest

**Files:**
- Modify: `src/ui/htmlHelpers.ts:58-160,261-390`
- Modify: `src/ui/panelHtml.ts:928-1137`
- Test: `test/ui/panelHtml.test.ts:1-486`

- [ ] **Step 1: Write the failing accessibility and row-specific interaction tests**

Add these tests to `test/ui/panelHtml.test.ts`:

```ts
test('buildPanelDashboardHtml renders task rows as semantic disclosure buttons', () => {
  const html = buildPanelDashboardHtml(defaultState({
    tasks: [{
      id: 'T1',
      title: 'Semantic task',
      status: 'todo',
      isCurrent: true,
      priority: 'normal',
      childIds: [],
      dependsOn: []
    }],
    taskCounts: { todo: 1, in_progress: 0, blocked: 0, done: 0 }
  }), 'semantic-task');

  assert.ok(html.includes('<button type="button" class="task-row'));
  assert.ok(html.includes('aria-expanded="false"'));
  assert.ok(html.includes('aria-controls="detail-T1"'));
});

test('buildPanelDashboardHtml posts row-specific iteration artifact messages', () => {
  const html = buildPanelDashboardHtml(defaultState({
    recentIterations: [
      { iteration: 8, taskId: 'T8', taskTitle: 'Clicked row', classification: 'complete', stopReason: null, artifactDir: '/tmp/iteration-008' }
    ]
  }), 'iter-open');

  assert.ok(html.includes('data-artifact-dir="/tmp/iteration-008"'));
  assert.ok(html.includes("type: 'open-iteration-artifact'"));
});
```

- [ ] **Step 2: Run the panel tests and verify they fail**

Run:

```bash
npm run compile:tests && node --require ./test/register-vscode-stub.cjs --test ./out-test/test/ui/panelHtml.test.js
```

Expected: FAIL because task rows are still `div`s and history clicks still post `ralphCodex.openLatestRalphSummary`.

- [ ] **Step 3: Convert task and iteration rows to semantic controls**

Update `src/ui/htmlHelpers.ts`:

```ts
export function buildTaskRow(task: RalphDashboardTask, isRunning: boolean): string {
  const glyph = STATUS_CHAR[task.status] ?? '?';
  const statusClass = task.status === 'done' ? 'done' : task.status === 'blocked' ? 'blocked' : '';
  const currentClass = task.isCurrent ? (isRunning ? 'current running' : 'current') : '';
  const check = task.status === 'done' ? '✓' : '';

  return `<button type="button" class="task-row ${statusClass} ${currentClass}" data-task-id="${esc(task.id)}" aria-expanded="false" aria-controls="detail-${esc(task.id)}">
    <span class="task-glyph">${glyph}</span>
    <span class="task-id">${esc(task.id)}</span>
    <span class="task-title">${esc(task.title)}</span>
    <span class="task-check">${check}</span>
  </button>
  <div class="task-detail" id="detail-${esc(task.id)}" hidden>
    <dl>
      ${task.notes ? `<dt>Notes</dt><dd>${esc(task.notes)}</dd>` : ''}
      ${task.blocker ? `<dt>Blocker</dt><dd>${esc(task.blocker)}</dd>` : ''}
      ${task.validation ? `<dt>Validation</dt><dd>${esc(task.validation)}</dd>` : ''}
      ${task.parentId ? `<dt>Parent</dt><dd>${esc(task.parentId)}</dd>` : ''}
      ${task.childIds.length > 0 ? `<dt>Children</dt><dd>${task.childIds.map(esc).join(', ')}</dd>` : ''}
      ${task.dependsOn.length > 0 ? `<dt>Depends on</dt><dd>${task.dependsOn.map(esc).join(', ')}</dd>` : ''}
      <dt>Priority</dt><dd>${esc(task.priority)}</dd>
    </dl>
  </div>`;
}

export function buildIterationRow(iter: RalphDashboardIteration): string {
  const glyph = CLASSIFICATION_CHAR[iter.classification] ?? '?';
  const taskLabel = iter.taskId ?? '—';
  const agentLabel = iter.agentId ? `<span class="iter-agent">${esc(iter.agentId)}</span>` : '';

  return `<button type="button" class="iter-row" data-artifact-dir="${esc(iter.artifactDir)}">
    <span class="iter-num">#${iter.iteration}</span>
    ${agentLabel}
    <span class="iter-task">${esc(taskLabel)}</span>
    <span class="iter-class">${iter.classification.replace(/_/g, ' ')}</span>
    <span class="iter-glyph">${glyph}</span>
  </button>`;
}
```

Add visible focus styling:

```ts
.task-row:focus-visible,
.iter-row:focus-visible,
.btn:focus-visible,
.dashboard-tab:focus-visible {
  outline: 1px solid var(--ralph-amber);
  outline-offset: 2px;
}
```

- [ ] **Step 4: Update the panel script to toggle semantic disclosure state and post row-specific artifact messages**

Update the click handling in `src/ui/panelHtml.ts`:

```ts
        var taskRow = e.target.closest('.task-row[data-task-id]');
        if (taskRow) {
          var taskId = taskRow.getAttribute('data-task-id');
          var detail = document.getElementById('detail-' + taskId);
          if (detail) {
            var expanded = taskRow.getAttribute('aria-expanded') === 'true';
            taskRow.setAttribute('aria-expanded', expanded ? 'false' : 'true');
            detail.hidden = expanded;
          }
          return;
        }

        var iterRow = e.target.closest('.iter-row[data-artifact-dir]');
        if (iterRow) {
          vscode.postMessage({
            type: 'open-iteration-artifact',
            artifactDir: iterRow.getAttribute('data-artifact-dir')
          });
          return;
        }
```

Also remove any dependency on inline `style.display = 'none'` for task details, because the new semantic disclosure uses `hidden`.

- [ ] **Step 5: Re-run the panel tests and verify they pass**

Run:

```bash
npm run compile:tests && node --require ./test/register-vscode-stub.cjs --test ./out-test/test/ui/panelHtml.test.js
```

Expected: PASS for the new semantic-control tests and existing task/history coverage.

- [ ] **Step 6: Commit the accessible-work slice**

```bash
git add src/ui/htmlHelpers.ts src/ui/panelHtml.ts test/ui/panelHtml.test.ts
git commit -m "fix: make dashboard work tab accessible"
```

### Task 4: Align Docs And Run The Full Validation Gate

**Files:**
- Modify: `README.md:64-99`
- Modify: `docs/workflows.md:401-409`
- Test: repository validation commands

- [ ] **Step 1: Update README to describe the tabbed dashboard**

Edit the day-to-day inspection section in `README.md` so it says:

```md
1. `Ralphdex: Show Status` opens or focuses the dashboard with a fresh snapshot. The `Overview` tab is the status-first landing surface; `Work`, `Diagnostics`, and `Settings` expose deeper task, troubleshooting, and configuration detail. The raw status report is also written to the `Ralphdex` output channel for audit and debugging.
```

- [ ] **Step 2: Update workflows docs to describe the new tabs**

Edit `docs/workflows.md` in the `Show Status` / `Inspect State` area:

```md
- `Show Status`: "What is Ralph doing now, what did the last few iterations do, and did retention or latest-surface repair change anything?" Opens or focuses the dashboard with a fresh snapshot. Use `Overview` for current state and common actions, `Work` for tasks and iteration history, `Diagnostics` for failures/dead-letter/agent and pipeline detail, and `Settings` for configuration. The raw text report is also written to the output channel for audit.

- `Ralphdex: Show Status` opens or focuses the dashboard panel with a fresh snapshot. The raw status report is also written to the `Ralphdex` output channel for audit and debugging; choose "Show Output" in the notification to bring it forward.
```

- [ ] **Step 3: Run the docs check**

Run:

```bash
npm run check:docs
```

Expected: PASS with no missing headings, required files, or broken guardrails.

- [ ] **Step 4: Run the full validation gate**

Run:

```bash
npm run validate
```

Expected: PASS for compile, docs, ledger, prompt-budget, lint, and the full test suite.

- [ ] **Step 5: Commit the docs and validation slice**

```bash
git add README.md docs/workflows.md
git commit -m "docs: describe tabbed dashboard workflow"
```
