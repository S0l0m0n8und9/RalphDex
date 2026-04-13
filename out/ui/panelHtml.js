"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildPanelDashboardHtml = buildPanelDashboardHtml;
const htmlHelpers_1 = require("./htmlHelpers");
const DASHBOARD_TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'work', label: 'Work' },
    { id: 'diagnostics', label: 'Diagnostics' },
    { id: 'settings', label: 'Settings' }
];
// ---------------------------------------------------------------------------
// Panel-specific CSS (extends base)
// ---------------------------------------------------------------------------
function buildPanelCss() {
    return `
${(0, htmlHelpers_1.buildBaseCss)()}

body {
  font-family: var(--ralph-font);
  font-size: 12px;
  line-height: 1.5;
  color: var(--vscode-foreground);
  background: var(--vscode-editor-background);
  padding: 16px 24px;
  overflow-x: hidden;
}

.dashboard-grid {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 20px;
  margin-top: 12px;
}

.card {
  border: 1px solid var(--ralph-border);
  padding: 10px 12px;
  margin-bottom: 12px;
}

.card-title {
  font-size: 11px;
  font-weight: bold;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--ralph-dim);
  margin-bottom: 6px;
}

.dashboard-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.dashboard-summary-card {
  border: 1px solid var(--ralph-border);
  padding: 8px 10px;
  min-height: 120px;
}

.dashboard-summary-card.full {
  grid-column: 1 / -1;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.metric {
  border: 1px solid var(--ralph-border);
  padding: 6px 8px;
}

.metric-label {
  display: block;
  font-size: 10px;
  color: var(--ralph-dim);
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.metric-value {
  display: block;
  font-size: 12px;
  margin-top: 2px;
}

.metric-value.warn { color: var(--ralph-orange); }
.metric-value.ok { color: var(--ralph-green); }

.pipeline-meta,
.failure-meta,
.dead-letter-meta {
  display: grid;
  gap: 4px;
  font-size: 11px;
}

.inline-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
}

.inline-actions .btn {
  flex: 1 1 140px;
}

.agent-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px;
}

.agent-card {
  border: 1px solid var(--ralph-border);
  padding: 8px 10px;
}

.agent-card.stuck {
  border-color: var(--ralph-orange);
}

.agent-card-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.agent-badge {
  color: var(--ralph-amber);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.agent-stuck {
  color: var(--ralph-orange);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.agent-list,
.dead-letter-list {
  display: grid;
  gap: 8px;
}

.dead-letter-item {
  border: 1px solid var(--ralph-border);
  padding: 8px 10px;
}

.pill-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}

.pill {
  border: 1px solid var(--ralph-border);
  padding: 2px 6px;
  font-size: 10px;
  color: var(--ralph-dim);
}

.pill.warn {
  border-color: var(--ralph-orange);
  color: var(--ralph-orange);
}

.pill.ok {
  border-color: var(--ralph-green);
  color: var(--ralph-green);
}

/* Wider task ID in panel */
.dashboard-grid .task-id {
  width: 100px;
}

/* Completed tasks collapsible */
.completed-toggle {
  font-family: var(--ralph-font);
  font-size: 11px;
  color: var(--ralph-dim);
  cursor: pointer;
  padding: 4px 0;
  list-style: none;
}

.completed-toggle::-webkit-details-marker { display: none; }
.completed-toggle::before {
  content: '▸ ';
  font-size: 10px;
}

details[open] > .completed-toggle::before {
  content: '▾ ';
}

/* All-done summary card */
.all-done-card {
  border: 1px solid var(--ralph-green);
  padding: 16px 20px;
  text-align: center;
  color: var(--ralph-green);
}

.all-done-card .check {
  font-size: 28px;
  margin-bottom: 4px;
}

.all-done-card .label {
  font-size: 13px;
  font-weight: bold;
  letter-spacing: 1px;
}

/* Button spinner */
.btn-spinner {
  display: inline-block;
  width: 10px;
  height: 10px;
  border: 2px solid var(--ralph-dim);
  border-top-color: var(--ralph-amber);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.btn .btn-spinner { display: none; }
.btn.loading .btn-label { opacity: 0.5; }
.btn.loading .btn-spinner { display: inline-block; }

/* Settings form */
.settings-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 12px;
}

.setting-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.setting-label {
  font-size: 10px;
  color: var(--ralph-dim);
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.setting-control select,
.setting-control input[type="text"],
.setting-control input[type="number"] {
  width: 100%;
  padding: 3px 6px;
  font-family: var(--ralph-font);
  font-size: 11px;
  background: var(--vscode-input-background, #1e1e1e);
  color: var(--vscode-input-foreground, #ccc);
  border: 1px solid var(--ralph-border);
  outline: none;
}

.setting-control select:focus,
.setting-control input:focus {
  border-color: var(--ralph-amber);
}

.setting-control input[type="checkbox"] {
  accent-color: var(--ralph-amber);
  margin-right: 4px;
}

.setting-check {
  display: flex;
  align-items: center;
  font-size: 11px;
  padding: 2px 0;
}

/* Legacy group title — kept for compatibility */
.settings-group-title {
  font-size: 10px;
  font-weight: bold;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--ralph-amber);
  margin: 8px 0 4px 0;
  grid-column: 1 / -1;
}

/* Key-value editor */
.kv-editor { display: flex; flex-direction: column; gap: 4px; }
.kv-row { display: flex; gap: 4px; align-items: center; }
.kv-row input.kv-key { flex: 1; }
.kv-row input.kv-value { width: 60px; }
.kv-remove, .kv-add {
  font-family: var(--ralph-font);
  font-size: 10px;
  background: transparent;
  border: 1px solid var(--ralph-border);
  color: var(--ralph-dim);
  cursor: pointer;
  padding: 2px 6px;
}
.kv-remove:hover, .kv-add:hover {
  border-color: var(--ralph-amber);
  color: var(--ralph-amber);
}

/* Collapsible settings sections */
.settings-section { border-bottom: 1px solid var(--ralph-border); }
.settings-section:last-child { border-bottom: none; }

.settings-section-toggle {
  font-family: var(--ralph-font);
  font-size: 10px;
  font-weight: bold;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--ralph-amber);
  cursor: pointer;
  padding: 6px 0;
  list-style: none;
}
.settings-section-toggle::-webkit-details-marker { display: none; }
.settings-section-toggle::before { content: '▸ '; font-size: 10px; }
details[open] > .settings-section-toggle::before { content: '▾ '; }

.settings-section > .settings-grid {
  padding: 4px 0 8px 0;
}

.settings-section-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.settings-section-desc {
  color: var(--ralph-dim);
  font-size: 11px;
  margin: 0 0 8px 0;
  grid-column: 1 / -1;
}

.settings-entry-meta {
  color: var(--ralph-dim);
  font-size: 10px;
  line-height: 1.4;
}

.settings-badge {
  border: 1px solid var(--ralph-amber);
  color: var(--ralph-amber);
  font-size: 9px;
  letter-spacing: 1px;
  padding: 1px 5px;
  text-transform: uppercase;
}

/* Advanced section (same styling, dimmer) */
.settings-advanced-toggle {
  font-family: var(--ralph-font);
  font-size: 10px;
  color: var(--ralph-dim);
  cursor: pointer;
  padding: 6px 0;
  list-style: none;
  letter-spacing: 1px;
  text-transform: uppercase;
}
.settings-advanced-toggle::-webkit-details-marker { display: none; }
.settings-advanced-toggle::before { content: '▸ '; font-size: 10px; }
details[open] > .settings-advanced-toggle::before { content: '▾ '; }

.dashboard-shell {
  display: grid;
  gap: 12px;
}

.snapshot-banner {
  border: 1px solid var(--ralph-border);
  padding: 8px 10px;
  font-size: 11px;
}

.snapshot-banner.loading,
.snapshot-banner.refreshing {
  border-color: var(--ralph-amber);
  color: var(--ralph-amber);
}

.snapshot-banner.error {
  border-color: var(--ralph-orange);
  color: var(--ralph-orange);
}

.tab-layout {
  display: grid;
  gap: 12px;
}

.tab-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  border-bottom: 1px solid var(--ralph-border);
  padding-bottom: 4px;
}

.tab-button {
  appearance: none;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--ralph-dim);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  padding: 8px 0 6px;
}

.tab-button[aria-selected="true"] {
  border-bottom-color: var(--ralph-amber);
  color: var(--vscode-foreground);
}

.tab-button:focus-visible {
  outline: 1px solid var(--ralph-amber);
  outline-offset: 2px;
}

.tab-panel[hidden] {
  display: none;
}

.overview-grid,
.diagnostics-grid,
.settings-shell {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.work-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.65fr) minmax(280px, 0.95fr);
  gap: 12px;
  align-items: start;
}

.card.span-2,
.dashboard-summary-card.full {
  grid-column: 1 / -1;
}

.card-subtitle {
  color: var(--ralph-dim);
  font-size: 11px;
  margin-bottom: 8px;
}

.history-list,
.attention-list,
.status-list,
.task-summary-list {
  display: grid;
  gap: 8px;
}

.history-list {
  gap: 0;
}

.task-list.compact .task-detail {
  display: none;
}

@media (max-width: 980px) {
  body {
    padding: 12px 16px 20px;
  }

  .dashboard-grid,
  .overview-grid,
  .diagnostics-grid,
  .settings-shell,
  .work-grid,
  .dashboard-summary-grid,
  .metric-grid,
  .settings-grid {
    grid-template-columns: 1fr;
  }
}
`;
}
// ---------------------------------------------------------------------------
// Settings section builder
// ---------------------------------------------------------------------------
function select(key, value, options) {
    const opts = options.map((o) => `<option value="${(0, htmlHelpers_1.esc)(o)}"${o === value ? ' selected' : ''}>${(0, htmlHelpers_1.esc)(o)}</option>`).join('');
    return `<select data-setting="${(0, htmlHelpers_1.esc)(key)}">${opts}</select>`;
}
function numberInput(key, value) {
    return `<input type="number" data-setting="${(0, htmlHelpers_1.esc)(key)}" value="${value}">`;
}
function textInput(key, value) {
    return `<input type="text" data-setting="${(0, htmlHelpers_1.esc)(key)}" value="${(0, htmlHelpers_1.esc)(value)}">`;
}
function checkbox(key, value) {
    return `<label class="setting-check"><input type="checkbox" data-setting="${(0, htmlHelpers_1.esc)(key)}"${value ? ' checked' : ''}></label>`;
}
function renderSettingControl(entry) {
    if (entry.control === 'boolean') {
        return checkbox(entry.key, Boolean(entry.value));
    }
    if (entry.control === 'number') {
        return numberInput(entry.key, Number(entry.value ?? 0));
    }
    if (entry.control === 'enum') {
        return select(entry.key, String(entry.value ?? ''), entry.options ?? []);
    }
    return textInput(entry.key, String(entry.value ?? ''));
}
function getCurrentCliProvider(settingsSurface) {
    const providerEntry = settingsSurface.sections
        .flatMap((section) => section.entries)
        .find((entry) => entry.key === 'cliProvider');
    const providerValue = providerEntry?.value;
    return providerValue === 'claude' || providerValue === 'copilot' || providerValue === 'copilot-foundry' || providerValue === 'azure-foundry'
        ? providerValue
        : 'codex';
}
function getProviderTestLabel(provider) {
    switch (provider) {
        case 'claude':
            return 'Test Claude Connection';
        case 'copilot':
            return 'Test GitHub Copilot Connection';
        case 'copilot-foundry':
            return 'Test Copilot Foundry Connection';
        case 'azure-foundry':
            return 'Test Azure AI Foundry Connection';
        default:
            return 'Test Codex Connection';
    }
}
function buildSettingsSection(state) {
    const settingsSurface = state.settingsSurface;
    if (!settingsSurface) {
        return '<div class="empty">Config not loaded — reload window</div>';
    }
    const currentProvider = getCurrentCliProvider(settingsSurface);
    return settingsSurface.sections.map((section, index) => `
    <details class="settings-section" data-section="settings-${(0, htmlHelpers_1.esc)(section.id)}"${index === 0 ? ' open' : ''}>
      <summary class="settings-section-toggle">
        <span class="settings-section-head">
          <span>${(0, htmlHelpers_1.esc)(section.title)}</span>
          ${section.hasNewSettings ? '<span class="settings-badge">NEW</span>' : ''}
        </span>
      </summary>
      <div class="settings-grid">
        <div class="settings-section-desc">${(0, htmlHelpers_1.esc)(section.description)}</div>
        ${section.id === 'provider' ? `
          <div class="inline-actions" style="grid-column: 1 / -1; margin-top: -2px; margin-bottom: 4px;">
            <button class="btn" data-command="ralphCodex.testCurrentProviderConnection"><span class="btn-label">${(0, htmlHelpers_1.esc)(getProviderTestLabel(currentProvider))}</span><span class="btn-spinner"></span></button>
          </div>
        ` : ''}
        ${section.entries.map((entry) => `
          <div class="setting-row" data-setting-entry="${(0, htmlHelpers_1.esc)(entry.key)}">
            <span class="setting-label">${(0, htmlHelpers_1.esc)(entry.title)}${entry.isNew ? ' <span class="settings-badge">NEW</span>' : ''}</span>
            <div class="setting-control">${renderSettingControl(entry)}</div>
            <div class="settings-entry-meta">
              <div>${(0, htmlHelpers_1.esc)(entry.description)}</div>
              <div>Default: ${(0, htmlHelpers_1.esc)(String(entry.defaultValue ?? ''))}</div>
            </div>
          </div>
        `).join('\n')}
      </div>
    </details>
  `).join('\n');
}
function formatUtc(value) {
    if (!value) {
        return 'none';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return (0, htmlHelpers_1.esc)(value);
    }
    return (0, htmlHelpers_1.esc)(date.toISOString().replace('.000Z', 'Z'));
}
function formatElapsed(start, end) {
    const startTime = new Date(start).getTime();
    const endTime = end ? new Date(end).getTime() : Date.now();
    if (Number.isNaN(startTime) || Number.isNaN(endTime) || endTime < startTime) {
        return 'unknown';
    }
    const totalSeconds = Math.round((endTime - startTime) / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes === 0) {
        return `${seconds}s`;
    }
    return `${minutes}m ${seconds}s`;
}
function buildPipelineSection(state) {
    const snapshot = state.dashboardSnapshot;
    if (!snapshot?.pipeline) {
        return `<div class="dashboard-summary-card full">
      <div class="card-title">Pipeline Strip</div>
      <div class="empty">No pipeline run artifact recorded yet.</div>
    </div>`;
    }
    const pipeline = snapshot.pipeline;
    return `<div class="dashboard-summary-card full">
    <div class="card-title">Pipeline Strip</div>
    <div class="pipeline-meta">
      <div><strong>Run</strong> ${(0, htmlHelpers_1.esc)(pipeline.runId)} · ${(0, htmlHelpers_1.esc)(pipeline.status)}${pipeline.phase ? ` · phase ${(0, htmlHelpers_1.esc)(pipeline.phase)}` : ''}</div>
      <div><strong>Elapsed</strong> ${(0, htmlHelpers_1.esc)(formatElapsed(pipeline.loopStartTime, pipeline.loopEndTime))}</div>
      <div><strong>Root Task</strong> ${(0, htmlHelpers_1.esc)(pipeline.rootTaskId)} · ${pipeline.decomposedTaskCount} child task(s)</div>
      <div><strong>Started</strong> ${formatUtc(pipeline.loopStartTime)}${pipeline.loopEndTime ? ` · <strong>Ended</strong> ${formatUtc(pipeline.loopEndTime)}` : ''}</div>
      <div><strong>Last Stop</strong> ${(0, htmlHelpers_1.esc)(pipeline.lastStopReason ?? 'none')}</div>
      <div><strong>PR</strong> ${pipeline.prUrl ? (0, htmlHelpers_1.esc)(pipeline.prUrl) : 'none'}</div>
    </div>
    <div class="inline-actions">
      <button class="btn" data-command="ralphCodex.openLatestPipelineRun"><span class="btn-label">Open Pipeline</span><span class="btn-spinner"></span></button>
      <button class="btn" data-command="ralphCodex.resumePipeline"><span class="btn-label">Resume</span><span class="btn-spinner"></span></button>
      <button class="btn" data-command="ralphCodex.approveHumanReview"><span class="btn-label">Approve Review</span><span class="btn-spinner"></span></button>
    </div>
  </div>`;
}
function buildTaskBoardSection(state) {
    const snapshot = state.dashboardSnapshot;
    const taskBoard = snapshot?.taskBoard ?? null;
    if (!taskBoard) {
        return `<div class="dashboard-summary-card">
      <div class="card-title">Task Board</div>
      <div class="empty">Task board unavailable until Ralph status is loaded.</div>
    </div>`;
    }
    return `<div class="dashboard-summary-card">
    <div class="card-title">Task Board</div>
    ${(0, htmlHelpers_1.buildProgressBar)(taskBoard.counts)}
    <div class="metric-grid">
      <div class="metric"><span class="metric-label">Todo</span><span class="metric-value">${taskBoard.counts?.todo ?? 0}</span></div>
      <div class="metric"><span class="metric-label">In Progress</span><span class="metric-value">${taskBoard.counts?.in_progress ?? 0}</span></div>
      <div class="metric"><span class="metric-label">Done</span><span class="metric-value ok">${taskBoard.counts?.done ?? 0}</span></div>
      <div class="metric"><span class="metric-label">Blocked</span><span class="metric-value warn">${taskBoard.counts?.blocked ?? 0}</span></div>
      <div class="metric"><span class="metric-label">Dead-Letter</span><span class="metric-value warn">${taskBoard.deadLetterCount}</span></div>
    </div>
    <div class="pill-row">
      <span class="pill">Selected ${(0, htmlHelpers_1.esc)(taskBoard.selectedTaskId ?? 'none')}</span>
      <span class="pill">Next iteration ${taskBoard.nextIteration}</span>
    </div>
    ${taskBoard.selectedTaskTitle ? `<div class="dead-letter-meta" style="margin-top:8px;"><div><strong>Selected task</strong> ${(0, htmlHelpers_1.esc)(taskBoard.selectedTaskTitle)}</div></div>` : ''}
  </div>`;
}
function buildFailureFeedSection(state) {
    const entries = state.dashboardSnapshot?.failureFeed.entries ?? [];
    if (entries.length === 0) {
        return `<div class="dashboard-summary-card">
      <div class="card-title">Failure Feed</div>
      <div class="empty">No failure-analysis artifact for the selected task.</div>
    </div>`;
    }
    return `<div class="dashboard-summary-card">
    <div class="card-title">Failure Feed</div>
    ${entries.map((entry) => `<div class="failure-meta">
      <div><strong>${(0, htmlHelpers_1.esc)(entry.taskId)}</strong> · ${(0, htmlHelpers_1.esc)(entry.taskTitle)}</div>
      <div><strong>Category</strong> ${(0, htmlHelpers_1.esc)(entry.category)} · <strong>Confidence</strong> ${(0, htmlHelpers_1.esc)(entry.confidence)}</div>
      <div><strong>Summary</strong> ${(0, htmlHelpers_1.esc)(entry.summary)}</div>
      <div><strong>Suggested action</strong> ${(0, htmlHelpers_1.esc)(entry.suggestedAction)}</div>
      <div><strong>Recovery attempts</strong> ${entry.recoveryAttemptCount ?? 0} · <strong>Human review</strong> ${entry.humanReviewRecommended ? 'recommended' : 'not requested'}</div>
      ${entry.remediationSummary ? `<div><strong>Remediation</strong> ${(0, htmlHelpers_1.esc)(entry.remediationSummary)}</div>` : ''}
      <div class="inline-actions">
        <button class="btn" data-command="ralphCodex.showRalphStatus"><span class="btn-label">View</span><span class="btn-spinner"></span></button>
        <button class="btn" data-command="ralphCodex.applyLatestTaskDecompositionProposal"><span class="btn-label">Recover</span><span class="btn-spinner"></span></button>
      </div>
    </div>`).join('\n')}
  </div>`;
}
function buildAgentGridSection(state) {
    const rows = state.dashboardSnapshot?.agentGrid.rows ?? [];
    if (rows.length === 0) {
        return `<div class="dashboard-summary-card">
      <div class="card-title">Agent Grid</div>
      <div class="empty">No durable agent identity records found yet.</div>
    </div>`;
    }
    return `<div class="dashboard-summary-card">
    <div class="card-title">Agent Grid</div>
    <div class="agent-grid">
      ${rows.map((row) => `<div class="agent-card${row.isStuck ? ' stuck' : ''}">
        <div class="agent-card-head">
          <span class="agent-badge">${(0, htmlHelpers_1.esc)(row.agentId)}</span>
          ${row.isStuck ? `<span class="agent-stuck">stuck ${row.stuckScore}</span>` : ''}
        </div>
        <div class="dead-letter-meta">
          <div><strong>First Seen</strong> ${formatUtc(row.firstSeenAt)}</div>
          <div><strong>Claim</strong> ${(0, htmlHelpers_1.esc)(row.activeClaimTaskId ?? 'idle')}</div>
          <div><strong>Completed</strong> ${row.completedTaskCount}</div>
          <div><strong>Latest</strong> ${(0, htmlHelpers_1.esc)(row.latestHandoffClassification ?? 'none')} · iter ${row.latestHandoffIteration ?? 'none'}</div>
          <div><strong>Heatmap</strong> ${(0, htmlHelpers_1.esc)(row.noProgressHeatmap || '[none]')}</div>
        </div>
      </div>`).join('\n')}
    </div>
  </div>`;
}
function buildDeadLetterSection(state) {
    const entries = state.dashboardSnapshot?.deadLetter.entries ?? [];
    if (entries.length === 0) {
        return `<div class="dashboard-summary-card">
      <div class="card-title">Dead-Letter</div>
      <div class="empty">No tasks are parked in dead-letter.</div>
    </div>`;
    }
    return `<div class="dashboard-summary-card">
    <div class="card-title">Dead-Letter</div>
    <div class="dead-letter-list">
      ${entries.map((entry) => {
        const latestCategory = entry.diagnosticHistory[entry.diagnosticHistory.length - 1]?.rootCauseCategory ?? 'unknown';
        return `<div class="dead-letter-item">
          <div><strong>${(0, htmlHelpers_1.esc)(entry.taskId)}</strong> · ${(0, htmlHelpers_1.esc)(entry.taskTitle)}</div>
          <div class="dead-letter-meta">
            <div><strong>Dead-lettered</strong> ${formatUtc(entry.deadLetteredAt)}</div>
            <div><strong>Attempts</strong> ${entry.recoveryAttemptCount} · <strong>Last category</strong> ${(0, htmlHelpers_1.esc)(latestCategory)}</div>
          </div>
        </div>`;
    }).join('\n')}
    </div>
    <div class="inline-actions">
      <button class="btn" data-command="ralphCodex.requeueDeadLetterTask"><span class="btn-label">Requeue</span><span class="btn-spinner"></span></button>
    </div>
  </div>`;
}
function buildCostTickerSection(state) {
    const cost = state.dashboardSnapshot?.cost ?? null;
    if (!cost || !cost.hasAnyCostData) {
        return `<div class="dashboard-summary-card">
      <div class="card-title">Cost Ticker</div>
      <div class="empty">No cost data reported by provider for the latest iteration.</div>
    </div>`;
    }
    const execCost = cost.executionCostUsd !== null
        ? `$${cost.executionCostUsd.toFixed(4)}`
        : 'unavailable';
    const diagCost = cost.diagnosticCostUsd !== null
        ? `$${cost.diagnosticCostUsd.toFixed(4)}`
        : 'none';
    let cacheLabel = 'unavailable';
    if (cost.promptCacheStats !== null) {
        cacheLabel = cost.promptCacheStats.cacheHit === true
            ? 'hit'
            : cost.promptCacheStats.cacheHit === false
                ? 'miss'
                : 'unknown';
    }
    return `<div class="dashboard-summary-card">
    <div class="card-title">Cost Ticker</div>
    <div class="metric-grid">
      <div class="metric"><span class="metric-label">Execution cost</span><span class="metric-value">${(0, htmlHelpers_1.esc)(execCost)}</span></div>
      <div class="metric"><span class="metric-label">Diagnostic cost</span><span class="metric-value">${(0, htmlHelpers_1.esc)(diagCost)}</span></div>
      <div class="metric"><span class="metric-label">Prompt cache</span><span class="metric-value">${(0, htmlHelpers_1.esc)(cacheLabel)}</span></div>
      <div class="metric"><span class="metric-label">Cache prefix</span><span class="metric-value">${cost.promptCacheStats !== null ? `${cost.promptCacheStats.staticPrefixBytes.toLocaleString()} B` : 'unavailable'}</span></div>
    </div>
  </div>`;
}
function buildQuickActionsSection(state) {
    const quick = state.dashboardSnapshot?.quickActions ?? null;
    return `<div class="dashboard-summary-card">
    <div class="card-title">Quick Actions</div>
    <div class="btn-grid">
      <button class="btn" data-command="ralphCodex.resumePipeline"><span class="btn-label">Resume</span><span class="btn-spinner"></span></button>
      <button class="btn" data-command="ralphCodex.approveHumanReview"><span class="btn-label">Approve Review</span><span class="btn-spinner"></span></button>
      <button class="btn" data-command="ralphCodex.openLatestPipelineRun"><span class="btn-label">Latest Run</span><span class="btn-spinner"></span></button>
      <button class="btn" data-command="ralphCodex.openLatestProvenanceBundle"><span class="btn-label">Provenance</span><span class="btn-spinner"></span></button>
      <button class="btn" data-command="ralphCodex.openLatestPromptEvidence"><span class="btn-label">Prompt Evidence</span><span class="btn-spinner"></span></button>
      <button class="btn" data-command="ralphCodex.openLatestCliTranscript"><span class="btn-label">Transcript</span><span class="btn-spinner"></span></button>
      <button class="btn" data-command="ralphCodex.showRalphStatus"><span class="btn-label">Show Status</span><span class="btn-spinner"></span></button>
      <button class="btn" data-command="workbench.action.openSettings"><span class="btn-label">Open Settings</span><span class="btn-spinner"></span></button>
      ${quick?.hasDeadLetterEntries ? `<button class="btn" data-command="ralphCodex.requeueDeadLetterTask"><span class="btn-label">Requeue Dead-Letter</span><span class="btn-spinner"></span></button>` : ''}
      ${quick?.canAttemptLoop ? `<button class="btn" data-command="ralphCodex.runRalphLoop"><span class="btn-label">Run Loop</span><span class="btn-spinner"></span></button>` : ''}
    </div>
  </div>`;
}
function buildSnapshotStatusBanner(state) {
    const status = state.snapshotStatus;
    if (status.phase === 'idle' || status.phase === 'ready') {
        return '';
    }
    if (status.phase === 'loading') {
        return `<div class="snapshot-banner loading">Loading dashboard snapshot...</div>`;
    }
    if (status.phase === 'refreshing') {
        return `<div class="snapshot-banner refreshing">Refreshing durable dashboard data...</div>`;
    }
    if (state.dashboardSnapshot) {
        return `<div class="snapshot-banner error">Showing last successful dashboard snapshot. Refresh failed: ${(0, htmlHelpers_1.esc)(status.errorMessage ?? 'unknown error')}</div>`;
    }
    return `<div class="snapshot-banner error">Dashboard snapshot unavailable. ${(0, htmlHelpers_1.esc)(status.errorMessage ?? 'unknown error')}</div>`;
}
function buildTaskCollections(state) {
    const statusOrder = { in_progress: 0, todo: 1, blocked: 2, done: 3 };
    const sorted = [...state.tasks].sort((a, b) => {
        if (a.isCurrent && !b.isCurrent)
            return -1;
        if (!a.isCurrent && b.isCurrent)
            return 1;
        return (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
    });
    const activeTasks = sorted.filter((task) => task.status !== 'done');
    const doneTasks = sorted.filter((task) => task.status === 'done');
    return { activeTasks, doneTasks, allDone: activeTasks.length === 0 && doneTasks.length > 0 };
}
function buildOverviewTab(state) {
    const taskBoard = state.dashboardSnapshot?.taskBoard ?? null;
    const quick = state.dashboardSnapshot?.quickActions ?? null;
    const currentTask = state.tasks.find((task) => task.isCurrent) ?? state.tasks[0] ?? null;
    const failure = state.dashboardSnapshot?.failureFeed.entries[0] ?? null;
    const loopDisabled = state.loopState === 'running' ? ' disabled title="Loop already running"' : '';
    const total = state.taskCounts
        ? state.taskCounts.todo + state.taskCounts.in_progress + state.taskCounts.blocked + state.taskCounts.done
        : 0;
    return `<div class="overview-grid">
    <div class="card">
      <div class="card-title">Health</div>
      <div class="metric-grid">
        <div class="metric"><span class="metric-label">Loop State</span><span class="metric-value">${(0, htmlHelpers_1.esc)(htmlHelpers_1.LOOP_STATE_LABEL[state.loopState])}</span></div>
        <div class="metric"><span class="metric-label">Role</span><span class="metric-value">${(0, htmlHelpers_1.esc)(state.agentRole)}</span></div>
        <div class="metric"><span class="metric-label">Selected Task</span><span class="metric-value">${(0, htmlHelpers_1.esc)(taskBoard?.selectedTaskId ?? 'none')}</span></div>
        <div class="metric"><span class="metric-label">Next Iteration</span><span class="metric-value">${taskBoard?.nextIteration ?? state.nextIteration}</span></div>
        <div class="metric"><span class="metric-label">Preflight</span><span class="metric-value ${state.preflightReady ? 'ok' : 'warn'}">${state.preflightReady ? 'ready' : 'attention needed'}</span></div>
        <div class="metric"><span class="metric-label">Progress</span><span class="metric-value">${state.taskCounts ? `${state.taskCounts.done}/${total}` : 'none'}</span></div>
      </div>
      <div style="margin-top:8px;">${(0, htmlHelpers_1.buildProgressBar)(taskBoard?.counts ?? state.taskCounts)}</div>
    </div>

    <div class="card">
      <div class="card-title">Attention</div>
      <div class="attention-list">
        ${failure ? `<div>Latest failure: ${(0, htmlHelpers_1.esc)(failure.taskId)} · ${(0, htmlHelpers_1.esc)(failure.category)}</div>` : ''}
        ${quick?.hasBlockedTasks ? '<div>Blocked tasks need review before the next clean run.</div>' : ''}
        ${quick?.hasDeadLetterEntries ? '<div>Dead-letter contains parked work that may need requeue.</div>' : ''}
        ${!state.preflightReady ? `<div>${(0, htmlHelpers_1.esc)(state.preflightSummary)}</div>` : ''}
        ${!failure && !quick?.hasBlockedTasks && !quick?.hasDeadLetterEntries && state.preflightReady ? '<div>No immediate interruptions.</div>' : ''}
      </div>
    </div>

    <div class="card">
      <div class="card-title">Current Work</div>
      ${currentTask
        ? `<div class="task-summary-list">
            <div><strong>${(0, htmlHelpers_1.esc)(currentTask.id)}</strong> · ${(0, htmlHelpers_1.esc)(currentTask.title)}</div>
            <div><strong>Status</strong> ${(0, htmlHelpers_1.esc)(currentTask.status.replace(/_/g, ' '))}</div>
            ${currentTask.blocker ? `<div><strong>Blocker</strong> ${(0, htmlHelpers_1.esc)(currentTask.blocker)}</div>` : ''}
            ${currentTask.validation ? `<div><strong>Validation</strong> ${(0, htmlHelpers_1.esc)(currentTask.validation)}</div>` : ''}
            <div><strong>Next Step</strong> ${(0, htmlHelpers_1.esc)(currentTask.blocker ? 'Resolve blocker before starting another loop.' : currentTask.validation ? `Validate with ${currentTask.validation}.` : 'Start the next iteration when ready.')}</div>
          </div>`
        : '<div class="empty">No tasks yet — run Initialize Workspace.</div>'}
    </div>

    <div class="card">
      <div class="card-title">Recent Activity</div>
      <div class="history-list">
        ${state.recentIterations.length > 0
        ? state.recentIterations.slice(0, 5).map(htmlHelpers_1.buildIterationRow).join('\n')
        : '<div class="empty">No iterations yet.</div>'}
      </div>
    </div>

    <div class="card span-2">
      <div class="card-title">Common Actions</div>
      <div class="btn-grid">
        <button class="btn" data-command="ralphCodex.runRalphLoop"${loopDisabled}><span class="btn-label">Run Loop</span><span class="btn-spinner"></span></button>
        <button class="btn" data-command="ralphCodex.runMultiAgentLoop"${loopDisabled}><span class="btn-label">Run Multi</span><span class="btn-spinner"></span></button>
        <button class="btn" data-command="ralphCodex.runRalphIteration"${loopDisabled}><span class="btn-label">Run Iteration</span><span class="btn-spinner"></span></button>
        <button class="btn" data-command="ralphCodex.generatePrompt"><span class="btn-label">Prepare Prompt</span><span class="btn-spinner"></span></button>
        <button class="btn" data-command="ralphCodex.resumePipeline"><span class="btn-label">Resume Pipeline</span><span class="btn-spinner"></span></button>
        <button class="btn" data-command="ralphCodex.approveHumanReview"><span class="btn-label">Approve Review</span><span class="btn-spinner"></span></button>
      </div>
    </div>
  </div>`;
}
function buildWorkTab(state) {
    const { activeTasks, doneTasks, allDone } = buildTaskCollections(state);
    const total = state.taskCounts
        ? state.taskCounts.todo + state.taskCounts.in_progress + state.taskCounts.blocked + state.taskCounts.done
        : 0;
    return `<div class="work-grid">
    <div class="card">
      <div class="card-title">Tasks${state.taskCounts ? ` · ${state.taskCounts.done}/${total}` : ''}</div>
      ${allDone
        ? `<div class="all-done-card">
            <div class="check">✓</div>
            <div class="label">All ${doneTasks.length} tasks completed</div>
          </div>`
        : activeTasks.length > 0
            ? activeTasks.map((task) => (0, htmlHelpers_1.buildTaskRow)(task, state.loopState === 'running')).join('\n')
            : '<div class="empty">No tasks yet — run Initialize Workspace</div>'}
      ${!allDone && doneTasks.length > 0
        ? `<details data-section="completed-tasks">
            <summary class="completed-toggle">Completed (${doneTasks.length})</summary>
            ${doneTasks.map((task) => (0, htmlHelpers_1.buildTaskRow)(task, state.loopState === 'running')).join('\n')}
          </details>`
        : ''}
    </div>

    <div class="card">
      <div class="card-title">History</div>
      <div class="history-list">
        ${state.recentIterations.length > 0
        ? state.recentIterations.map(htmlHelpers_1.buildIterationRow).join('\n')
        : '<div class="empty">No iterations yet</div>'}
      </div>
    </div>
  </div>`;
}
function buildDiagnosticsTab(state) {
    return `<div class="diagnostics-grid">
    ${buildPipelineSection(state)}
    ${buildTaskBoardSection(state)}
    ${buildFailureFeedSection(state)}
    ${buildAgentGridSection(state)}
    ${buildDeadLetterSection(state)}
    ${buildCostTickerSection(state)}
    <div class="card">
      <div class="card-title">Preflight</div>
      ${(0, htmlHelpers_1.buildDiagnostics)(state)}
    </div>
    <div class="card">
      <div class="card-title">Agent Controls</div>
      <div class="btn-grid">
        <button class="btn" data-command="ralphCodex.runReviewAgent"><span class="btn-label">Review Agent</span><span class="btn-spinner"></span></button>
        <button class="btn" data-command="ralphCodex.runWatchdogAgent"><span class="btn-label">Watchdog Agent</span><span class="btn-spinner"></span></button>
        <button class="btn" data-command="ralphCodex.runScmAgent"><span class="btn-label">SCM Agent</span><span class="btn-spinner"></span></button>
        <button class="btn" data-command="ralphCodex.showRalphStatus"><span class="btn-label">Show Status</span><span class="btn-spinner"></span></button>
      </div>
    </div>
  </div>`;
}
function buildSettingsTab(state) {
    return `<div class="settings-shell">
    <div class="card">
      <div class="card-title">Project Actions</div>
      <div class="btn-grid">
        <button class="btn" data-command="ralphCodex.initializeWorkspace"><span class="btn-label">Initialize Workspace</span><span class="btn-spinner"></span></button>
        <button class="btn" data-command="ralphCodex.newProject"><span class="btn-label">New Project</span><span class="btn-spinner"></span></button>
        <button class="btn" data-command="ralphCodex.switchProject"><span class="btn-label">Switch Project</span><span class="btn-spinner"></span></button>
        <button class="btn" data-command="workbench.action.openSettings"><span class="btn-label">Open Settings UI</span><span class="btn-spinner"></span></button>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Artifacts & Admin</div>
      <div class="btn-grid">
        <button class="btn" data-command="ralphCodex.openLatestPipelineRun"><span class="btn-label">Latest Pipeline Run</span><span class="btn-spinner"></span></button>
        <button class="btn" data-command="ralphCodex.openLatestProvenanceBundle"><span class="btn-label">Latest Provenance</span><span class="btn-spinner"></span></button>
        <button class="btn" data-command="ralphCodex.openLatestPromptEvidence"><span class="btn-label">Latest Prompt Evidence</span><span class="btn-spinner"></span></button>
        <button class="btn" data-command="ralphCodex.openLatestCliTranscript"><span class="btn-label">Latest Transcript</span><span class="btn-spinner"></span></button>
      </div>
    </div>

    <div class="card span-2">
      <div class="card-title">Settings</div>
      ${buildSettingsSection(state)}
    </div>
  </div>`;
}
// ---------------------------------------------------------------------------
// Panel HTML builder
// ---------------------------------------------------------------------------
function buildPanelDashboardHtml(state, nonce) {
    const stateLabel = htmlHelpers_1.LOOP_STATE_LABEL[state.loopState];
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style nonce="${nonce}">${buildPanelCss()}</style>
</head>
<body>
  <div class="dashboard-shell">
    <div class="header">
      <div class="header-title">Ralphdex</div>
      <div class="header-state">${(0, htmlHelpers_1.esc)(state.workspaceName)} · ${stateLabel} · ${(0, htmlHelpers_1.esc)(state.agentRole)}</div>
    </div>

    ${(0, htmlHelpers_1.buildAgentLanes)(state.agentLanes)}
    ${buildSnapshotStatusBanner(state)}

    <div class="tab-layout">
      <div class="tab-bar" role="tablist" aria-label="Dashboard sections">
        ${DASHBOARD_TABS.map((tab, index) => `<button id="tab-button-${tab.id}" class="tab-button" type="button" role="tab" data-tab="${tab.id}" aria-selected="${index === 0 ? 'true' : 'false'}" aria-controls="tab-${tab.id}" tabindex="${index === 0 ? '0' : '-1'}">${tab.label}</button>`).join('')}
      </div>

      <div id="tab-overview" class="tab-panel" role="tabpanel" aria-labelledby="tab-button-overview">
        ${buildOverviewTab(state)}
      </div>
      <div id="tab-work" class="tab-panel" role="tabpanel" aria-labelledby="tab-button-work" hidden>
        ${buildWorkTab(state)}
      </div>
      <div id="tab-diagnostics" class="tab-panel" role="tabpanel" aria-labelledby="tab-button-diagnostics" hidden>
        ${buildDiagnosticsTab(state)}
      </div>
      <div id="tab-settings" class="tab-panel" role="tabpanel" aria-labelledby="tab-button-settings" hidden>
        ${buildSettingsTab(state)}
      </div>
    </div>
  </div>

  <script nonce="${nonce}">
    (function() {
      var vscode = acquireVsCodeApi();
      var ackTimeouts = new WeakMap();
      var TAB_IDS = ${JSON.stringify(DASHBOARD_TABS.map((tab) => tab.id))};

      function getStoredState() {
        return vscode.getState() || {};
      }

      function saveStoredState(next) {
        var current = getStoredState();
        vscode.setState(Object.assign({}, current, next));
      }

      function saveDetailsState() {
        var openSections = {};
        document.querySelectorAll('details[data-section]').forEach(function(el) {
          openSections[el.getAttribute('data-section')] = el.open;
        });
        saveStoredState({ openSections: openSections });
      }

      function restoreDetailsState() {
        var state = getStoredState();
        if (!state.openSections) return;
        document.querySelectorAll('details[data-section]').forEach(function(el) {
          var key = el.getAttribute('data-section');
          if (key in state.openSections) {
            el.open = state.openSections[key];
          }
        });
      }

      function setActiveTab(tabId, shouldPersist) {
        TAB_IDS.forEach(function(id) {
          var button = document.querySelector('[data-tab="' + id + '"]');
          var panel = document.getElementById('tab-' + id);
          var selected = id === tabId;
          if (button) {
            button.setAttribute('aria-selected', selected ? 'true' : 'false');
            button.setAttribute('tabindex', selected ? '0' : '-1');
          }
          if (panel) {
            panel.hidden = !selected;
          }
        });
        if (shouldPersist) {
          saveStoredState({ activeTab: tabId });
        }
      }

      var VIEW_INTENT = ${JSON.stringify({
        activeTab: state.viewIntent?.activeTab ?? null,
        focusSettingKey: state.viewIntent?.focusSettingKey ?? null
    })};

      function restoreTabState() {
        var state = getStoredState();
        var tabId = TAB_IDS.indexOf(state.activeTab) >= 0
          ? state.activeTab
          : (VIEW_INTENT.activeTab && TAB_IDS.indexOf(VIEW_INTENT.activeTab) >= 0 ? VIEW_INTENT.activeTab : 'overview');
        setActiveTab(tabId, false);
      }

      function focusRequestedSetting() {
        if (!VIEW_INTENT.focusSettingKey) {
          return;
        }

        var target = document.querySelector('[data-setting-entry="' + VIEW_INTENT.focusSettingKey + '"]');
        if (!target) {
          return;
        }

        var details = target.closest('details[data-section]');
        if (details) {
          details.open = true;
        }

        var control = target.querySelector('[data-setting], [data-setting-nested], [data-setting-multi]');
        if (control && typeof control.focus === 'function') {
          control.focus();
        }
      }

      restoreDetailsState();
      restoreTabState();
      focusRequestedSetting();

      document.addEventListener('toggle', function(e) {
        if (e.target.matches('details[data-section]')) {
          saveDetailsState();
        }
      }, true);

      function runCommand(el) {
        var cmd = el.getAttribute('data-command');
        if (!cmd || el.disabled) return;
        if (document.activeElement && typeof document.activeElement.blur === 'function') {
          document.activeElement.blur();
        }
        el.classList.add('loading');
        el.disabled = true;
        vscode.postMessage({ type: 'command', command: cmd });
        var t = setTimeout(function() { resetButton(el); }, 10000);
        ackTimeouts.set(el, t);
      }

      function resetButton(el) {
        el.classList.remove('loading');
        el.disabled = false;
        var t = ackTimeouts.get(el);
        if (t) { clearTimeout(t); ackTimeouts.delete(el); }
      }

      function sendSettingUpdate(el) {
        if (!el || typeof el.getAttribute !== 'function') return false;

        var multiKey = el.getAttribute('data-setting-multi');
        if (multiKey) {
          var checkboxes = document.querySelectorAll('[data-setting-multi="' + multiKey + '"]');
          var selected = [];
          checkboxes.forEach(function(cb) { if (cb.checked) selected.push(cb.value); });
          vscode.postMessage({ type: 'update-setting', key: multiKey, value: selected });
          return true;
        }

        var nestedKey = el.getAttribute('data-setting-nested');
        if (nestedKey) {
          var nestedValue;
          if (el.type === 'checkbox') { nestedValue = el.checked; }
          else if (el.type === 'number') {
            nestedValue = parseInt(el.value, 10);
            if (isNaN(nestedValue)) return true;
          }
          else { nestedValue = el.value; }
          vscode.postMessage({ type: 'update-setting', key: nestedKey, value: nestedValue });
          return true;
        }

        var key = el.getAttribute('data-setting');
        if (!key) return false;
        var value;
        if (el.type === 'checkbox') {
          value = el.checked;
        } else if (el.type === 'number') {
          value = parseInt(el.value, 10);
          if (isNaN(value)) return true;
        } else {
          value = el.value;
        }
        vscode.postMessage({ type: 'update-setting', key: key, value: value });
        return true;
      }

      // Settings change handler
      document.addEventListener('change', function(e) {
        var el = e.target;
        sendSettingUpdate(el);
      });

      document.addEventListener('keydown', function(e) {
        var tab = e.target.closest('[data-tab]');
        if (!tab) {
          return;
        }

        var currentIdx = TAB_IDS.indexOf(tab.getAttribute('data-tab'));
        if (currentIdx < 0) {
          return;
        }

        var nextIdx = currentIdx;
        if (e.key === 'ArrowRight') {
          nextIdx = (currentIdx + 1) % TAB_IDS.length;
        } else if (e.key === 'ArrowLeft') {
          nextIdx = (currentIdx - 1 + TAB_IDS.length) % TAB_IDS.length;
        } else if (e.key === 'Home') {
          nextIdx = 0;
        } else if (e.key === 'End') {
          nextIdx = TAB_IDS.length - 1;
        } else {
          return;
        }

        e.preventDefault();
        var nextTabId = TAB_IDS[nextIdx];
        setActiveTab(nextTabId, true);
        var nextTab = document.querySelector('[data-tab="' + nextTabId + '"]');
        if (nextTab && typeof nextTab.focus === 'function') {
          nextTab.focus();
        }
      });

      // Event delegation — no inline handlers needed (CSP blocks onclick)
      document.addEventListener('click', function(e) {
        var tab = e.target.closest('[data-tab]');
        if (tab) {
          setActiveTab(tab.getAttribute('data-tab'), true);
          return;
        }

        var btn = e.target.closest('[data-command]');
        if (btn) { runCommand(btn); return; }

        var kvAdd = e.target.closest('[data-setting-kv-add]');
        if (kvAdd) {
          var groupKey = kvAdd.getAttribute('data-setting-kv-add');
          var container = document.querySelector('[data-setting-kv-group="' + groupKey + '"]');
          if (container) {
            var row = document.createElement('div');
            row.className = 'kv-row';
            row.setAttribute('data-setting-kv', groupKey);
            row.innerHTML = '<input type="text" class="kv-key" value="" placeholder="key">' +
              '<input type="number" class="kv-value" value="0" min="0">' +
              '<button class="kv-remove" title="Remove">✕</button>';
            container.insertBefore(row, kvAdd);
          }
          return;
        }

        var kvRemove = e.target.closest('.kv-remove');
        if (kvRemove) {
          var kvRow = kvRemove.closest('.kv-row');
          if (kvRow) {
            var kvGroup = kvRow.getAttribute('data-setting-kv');
            kvRow.remove();
            collectAndSendKv(kvGroup);
          }
          return;
        }

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
          vscode.postMessage({ type: 'open-iteration-artifact', artifactDir: iterRow.getAttribute('data-artifact-dir') });
          return;
        }
      });

      function collectAndSendKv(groupKey) {
        var container = document.querySelector('[data-setting-kv-group="' + groupKey + '"]');
        if (!container) return;
        var rows = container.querySelectorAll('[data-setting-kv="' + groupKey + '"]');
        var map = {};
        rows.forEach(function(row) {
          var k = row.querySelector('.kv-key').value.trim();
          var v = parseInt(row.querySelector('.kv-value').value, 10);
          if (k && !isNaN(v) && v >= 0) map[k] = v;
        });
        vscode.postMessage({ type: 'update-setting', key: groupKey, value: map });
      }

      var inputDebounceTimers = new Map();
      document.addEventListener('input', function(e) {
        var el = e.target;
        if (el.matches('input[data-setting], input[data-setting-nested]')) {
          clearTimeout(inputDebounceTimers.get(el));
          inputDebounceTimers.set(el, setTimeout(function() {
            inputDebounceTimers.delete(el);
            sendSettingUpdate(el);
          }, 600));
          return;
        }
        var kvRow = e.target.closest('.kv-row[data-setting-kv]');
        if (kvRow) {
          clearTimeout(inputDebounceTimers.get(kvRow));
          inputDebounceTimers.set(kvRow, setTimeout(function() {
            inputDebounceTimers.delete(kvRow);
            collectAndSendKv(kvRow.getAttribute('data-setting-kv'));
          }, 600));
        }
      });

      window.addEventListener('message', function(event) {
        var msg = event.data;
        if (msg.type === 'phase') {
          var phases = ${JSON.stringify(htmlHelpers_1.PHASE_LABELS)};
          var activeIdx = phases.indexOf(msg.phase);
          var scope = msg.agentId
            ? document.querySelector('.agent-lane[data-agent-id="' + msg.agentId + '"]')
            : (document.querySelector('.agent-lane') || document);
          var container = scope || document;
          var steps = container.querySelectorAll('.phase-step');
          steps.forEach(function(step, i) {
            step.className = 'phase-step' + (i < activeIdx ? ' done' : i === activeIdx ? ' active' : '');
          });
        }
        if (msg.type === 'command-ack') {
          var btns = document.querySelectorAll('[data-command="' + msg.command + '"]');
          btns.forEach(function(btn) {
            if (msg.status === 'done' || msg.status === 'error') {
              resetButton(btn);
            }
          });
        }
      });
    })();
  </script>
</body>
</html>`;
}
//# sourceMappingURL=panelHtml.js.map