import type {
  RalphDashboardState
} from './uiTypes';
import {
  buildAgentLanes,
  buildBaseCss,
  buildDiagnostics,
  buildIterationRow,
  buildProgressBar,
  buildTaskRow,
  esc,
  LOOP_STATE_LABEL,
  PHASE_LABELS
} from './htmlHelpers';
import type { CliProviderId } from '../config/types';

type DashboardTabId = 'overview' | 'work' | 'diagnostics' | 'orchestration' | 'settings';

const DASHBOARD_TABS: Array<{ id: DashboardTabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'work', label: 'Work' },
  { id: 'diagnostics', label: 'Diagnostics' },
  { id: 'orchestration', label: 'Orchestration' },
  { id: 'settings', label: 'Settings' }
];

// ---------------------------------------------------------------------------
// Panel-specific CSS (extends base)
// ---------------------------------------------------------------------------

function buildPanelCss(): string {
  return `
${buildBaseCss()}

body {
  font-family: var(--font-ui);
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
  background: var(--glass-bg);
  border: 1px solid var(--border);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-radius: 8px;
  padding: 16px 20px;
  margin-bottom: 20px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
}

.card-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--accent);
  margin-bottom: 12px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 6px;
}

.dashboard-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.dashboard-summary-card {
  background: var(--glass-bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  min-height: 120px;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.dashboard-summary-card.full {
  grid-column: 1 / -1;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 10px;
}

.metric {
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 10px 12px;
  text-align: center;
}

.metric-label {
  display: block;
  font-size: 10px;
  color: var(--dim);
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.metric-value {
  display: block;
  font-size: 12px;
  margin-top: 2px;
}

.metric-value.warn { color: var(--warn); }
.metric-value.ok { color: var(--ok); }

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

/* Rich failure card */
.rich-failure-card {
  border-color: color-mix(in srgb, var(--bad) 40%, var(--border));
  background: color-mix(in srgb, var(--bad) 4%, var(--glass-bg));
  padding: 16px 18px;
}

.rich-failure-eyebrow {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 1.2px;
  text-transform: uppercase;
  color: var(--bad);
  margin-bottom: 10px;
}

.rich-failure-header {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 10px;
}

.rich-failure-task-id {
  font-family: var(--font-mono);
  font-size: 11px;
  padding: 2px 6px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 3px;
  color: var(--accent);
}

.rich-failure-task-title {
  font-size: 14px;
  font-weight: 500;
  flex: 1;
}

.rich-failure-meta {
  font-size: 11px;
  color: var(--dim);
  width: 100%;
}

.rich-failure-block {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 10px 12px;
  margin-bottom: 8px;
}

.rich-failure-block-suggested {
  border-color: color-mix(in srgb, var(--accent) 35%, transparent);
  background: color-mix(in srgb, var(--accent) 6%, transparent);
}

.rich-failure-block-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 1.2px;
  font-weight: 600;
  color: var(--dim);
  margin-bottom: 4px;
}

.rich-failure-block-text {
  font-size: 13px;
  line-height: 1.55;
  margin: 0;
  color: var(--fg);
}

.agent-card {
  border: 1px solid var(--border);
  padding: 8px 10px;
}

.agent-card.stuck {
  border-color: var(--warn);
}

.agent-card-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.agent-badge {
  color: var(--accent);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.agent-stuck {
  color: var(--warn);
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
  border: 1px solid var(--border);
  padding: 8px 10px;
}

.pill-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}

.pill {
  border: 1px solid var(--border);
  padding: 2px 6px;
  font-size: 10px;
  color: var(--dim);
}

.pill.warn {
  border-color: var(--warn);
  color: var(--warn);
}

.pill.ok {
  border-color: var(--ok);
  color: var(--ok);
}

/* Wider task ID in panel */
.dashboard-grid .task-id {
  width: 100px;
}

/* Completed tasks collapsible */
.completed-toggle {
  font-family: var(--font-ui);
  font-size: 11px;
  color: var(--dim);
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
  background: rgba(16, 185, 129, 0.05); /* Greenish tint */
  border: 1px solid var(--ok);
  border-radius: 8px;
  padding: 24px 20px;
  text-align: center;
  color: var(--ok);
  box-shadow: 0 4px 16px rgba(16, 185, 129, 0.1);
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
  border: 2px solid var(--dim);
  border-top-color: var(--accent);
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
  color: var(--dim);
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.setting-control select,
.setting-control input[type="text"],
.setting-control input[type="number"] {
  width: 100%;
  padding: 6px 10px;
  font-family: var(--font-ui);
  font-size: 11px;
  background: rgba(0, 0, 0, 0.2);
  color: var(--vscode-input-foreground, #ccc);
  border: 1px solid var(--border);
  border-radius: 4px;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.setting-control select:focus,
.setting-control input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.2);
}

.setting-control.invalid select,
.setting-control.invalid input {
  border-color: var(--bad);
}

span.setting-label.error-text {
  color: var(--bad);
}

div.error-text {
  color: var(--bad);
  font-weight: bold;
  margin-bottom: 2px;
}

.setting-control input[type="checkbox"] {
  accent-color: var(--accent);
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
  color: var(--accent);
  margin: 8px 0 4px 0;
  grid-column: 1 / -1;
}

/* Key-value editor */
.kv-editor { display: flex; flex-direction: column; gap: 4px; }
.kv-row { display: flex; gap: 4px; align-items: center; }
.kv-row input.kv-key { flex: 1; }
.kv-row input.kv-value { width: 60px; }
.kv-remove, .kv-add {
  font-family: var(--font-ui);
  font-size: 10px;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--dim);
  cursor: pointer;
  padding: 2px 6px;
}
.kv-remove:hover, .kv-add:hover {
  border-color: var(--accent);
  color: var(--accent);
}

/* Collapsible settings sections */
.settings-section { border-bottom: 1px solid var(--border); }
.settings-section:last-child { border-bottom: none; }

.settings-section-toggle {
  font-family: var(--font-ui);
  font-size: 10px;
  font-weight: bold;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--accent);
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
  color: var(--dim);
  font-size: 11px;
  margin: 0 0 8px 0;
  grid-column: 1 / -1;
}

.settings-entry-meta {
  color: var(--dim);
  font-size: 10px;
  line-height: 1.4;
}

.settings-badge {
  border: 1px solid var(--accent);
  color: var(--accent);
  font-size: 9px;
  letter-spacing: 1px;
  padding: 1px 5px;
  text-transform: uppercase;
}

/* Advanced section (same styling, dimmer) */
.settings-advanced-toggle {
  font-family: var(--font-ui);
  font-size: 10px;
  color: var(--dim);
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
  background: var(--glass-bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 12px 14px;
  font-size: 11px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  display: flex;
  align-items: center;
  gap: 8px;
}

.snapshot-banner.loading,
.snapshot-banner.refreshing {
  border-color: var(--accent);
  background: rgba(245, 158, 11, 0.05);
  color: var(--accent);
}

.snapshot-banner.error {
  border-color: var(--warn);
  background: rgba(249, 115, 22, 0.05);
  color: var(--warn);
}

.seed-card textarea {
  width: 100%;
  min-height: 110px;
  resize: vertical;
  padding: 10px 12px;
  font: inherit;
  color: var(--vscode-input-foreground, #ccc);
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid var(--border);
  border-radius: 6px;
}

.seed-card textarea:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.15);
}

.seed-card-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.seed-result {
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.02);
}

.seed-result.success {
  border-color: var(--ok);
  background: rgba(16, 185, 129, 0.08);
}

.seed-result.error {
  border-color: var(--warn);
  background: rgba(249, 115, 22, 0.08);
}

.seed-result.submitting {
  border-color: var(--accent);
  background: rgba(245, 158, 11, 0.08);
}

.seed-result-meta {
  color: var(--dim);
  font-size: 11px;
  margin-top: 4px;
}

.tab-layout {
  display: grid;
  gap: 12px;
}

.tab-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 4px;
}

.tab-button {
  appearance: none;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--dim);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  padding: 8px 0 6px;
}

.tab-button[aria-selected="true"] {
  border-bottom-color: var(--accent);
  color: var(--vscode-foreground);
}

.tab-button:focus-visible {
  outline: 1px solid var(--accent);
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
  color: var(--dim);
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

.dashboard-app {
  display: grid;
  grid-template-columns: minmax(220px, 260px) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.dashboard-sidebar {
  display: grid;
  gap: 12px;
  position: sticky;
  top: 0;
  align-self: start;
}

.dashboard-sidebar-panel,
.dashboard-main,
.hero-card,
.hero-health-cell {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.01)),
    var(--glass-bg);
  border: 1px solid var(--border);
  box-shadow: var(--glass-shadow);
}

.dashboard-sidebar-panel {
  border-radius: 12px;
  padding: 14px;
}

.dashboard-main {
  border-radius: 16px;
  padding: 18px;
  display: grid;
  gap: 14px;
}

.dashboard-brand {
  display: grid;
  gap: 6px;
}

.dashboard-brand-kicker,
.hero-kicker,
.rail-section-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.4px;
  text-transform: uppercase;
  color: var(--dim);
}

.dashboard-brand-title {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.3px;
}

.dashboard-brand-meta {
  color: var(--dim);
  font-size: 11px;
}

.dashboard-main .tab-layout {
  gap: 16px;
}

.dashboard-sidebar .tab-bar {
  display: grid;
  gap: 4px;
  border-bottom: none;
  padding-bottom: 0;
}

.dashboard-sidebar .tab-button {
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 10px 12px;
  text-align: left;
  background: transparent;
}

.dashboard-sidebar .tab-button[aria-selected="true"] {
  border-color: rgba(245, 158, 11, 0.28);
  background: rgba(245, 158, 11, 0.1);
}

.dashboard-sidebar-actions,
.rail-current-task,
.hero-actions,
.hero-phase {
  display: grid;
  gap: 8px;
}

.hero-card {
  border-radius: 16px;
  padding: 20px;
  display: grid;
  gap: 18px;
}

.hero-topline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.hero-headline {
  display: grid;
  gap: 8px;
}

.hero-status-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.hero-state-pill,
.hero-inline-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 4px 9px;
  font-size: 10px;
  letter-spacing: 0.7px;
  text-transform: uppercase;
}

.hero-state-pill.running {
  border-color: rgba(245, 158, 11, 0.35);
  color: var(--accent);
  background: rgba(245, 158, 11, 0.08);
}

.hero-state-pill.idle {
  color: var(--dim);
}

.hero-state-pill.stopped {
  border-color: rgba(249, 115, 22, 0.35);
  color: var(--warn);
  background: rgba(249, 115, 22, 0.08);
}

.hero-title {
  font-size: 24px;
  line-height: 1.2;
  letter-spacing: -0.4px;
}

.hero-summary {
  color: var(--dim);
  font-size: 13px;
  max-width: 70ch;
}

.hero-health-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.hero-health-cell {
  border-radius: 10px;
  padding: 14px;
  display: grid;
  gap: 5px;
}

.hero-health-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 1.2px;
  color: var(--dim);
}

.hero-health-value {
  font-size: 21px;
  font-weight: 700;
  letter-spacing: -0.3px;
}

.hero-health-sub {
  font-size: 11px;
  color: var(--dim);
}

.hero-health-track {
  height: 4px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.08);
}

.hero-health-fill {
  height: 100%;
  border-radius: inherit;
  background: var(--accent);
}

.overview-shell,
.work-shell,
.diagnostics-shell,
.orchestration-shell,
.settings-shell {
  display: grid;
  gap: 14px;
}

.overview-body {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(320px, 0.75fr);
  gap: 14px;
  align-items: start;
}

.overview-column {
  display: grid;
  gap: 14px;
}

.section-stack {
  display: grid;
  gap: 12px;
}

.rail-command {
  justify-content: flex-start;
  width: 100%;
}

@media (max-width: 980px) {
  .dashboard-app,
  .overview-body,
  .hero-health-grid {
    grid-template-columns: 1fr;
  }

  .dashboard-sidebar {
    position: static;
  }

  .dashboard-main {
    padding: 14px;
  }
}
`;
}

// ---------------------------------------------------------------------------
// Settings section builder
// ---------------------------------------------------------------------------

function select(key: string, value: string, options: readonly string[]): string {
  const opts = options.map((o) =>
    `<option value="${esc(o)}"${o === value ? ' selected' : ''}>${esc(o)}</option>`
  ).join('');
  return `<select data-setting="${esc(key)}">${opts}</select>`;
}

function numberInput(key: string, value: number): string {
  return `<input type="number" data-setting="${esc(key)}" value="${value}">`;
}

function textInput(key: string, value: string): string {
  return `<input type="text" data-setting="${esc(key)}" value="${esc(value)}">`;
}

function suggestedInput(key: string, value: string, options: readonly string[]): string {
  const listId = `suggestions-${esc(key)}`;
  const datalist = `<datalist id="${listId}">` + options.map((opt) => `<option value="${esc(opt)}"></option>`).join('') + `</datalist>`;
  return `<input type="text" data-setting="${esc(key)}" value="${esc(value)}" list="${listId}">` + datalist;
}

function checkbox(key: string, value: boolean): string {
  return `<label class="setting-check"><input type="checkbox" data-setting="${esc(key)}"${value ? ' checked' : ''}></label>`;
}

function stringArrayCheckboxes(key: string, value: unknown, options: readonly string[]): string {
  const values = Array.isArray(value) ? value : [];
  return options.map((opt) => {
    const isChecked = values.includes(opt);
    return `<label class="setting-check" style="margin-right:8px; display:inline-flex;"><input type="checkbox" data-setting-multi="${esc(key)}" value="${esc(opt)}"${isChecked ? ' checked' : ''}> ${esc(opt)}</label>`;
  }).join('');
}

function renderSettingControl(entry: NonNullable<RalphDashboardState['settingsSurface']>['sections'][number]['entries'][number]): string {
  if (entry.control === 'boolean') {
    return checkbox(entry.key, Boolean(entry.value));
  }

  if (entry.control === 'number') {
    return numberInput(entry.key, Number(entry.value ?? 0));
  }

  if (entry.control === 'enum') {
    return select(entry.key, String(entry.value ?? ''), entry.options ?? []);
  }

  if (entry.control === 'string-array') {
    return stringArrayCheckboxes(entry.key, entry.value, entry.options ?? []);
  }

  if (entry.control === 'suggested-string') {
    return suggestedInput(entry.key, String(entry.value ?? ''), entry.options ?? []);
  }

  return textInput(entry.key, String(entry.value ?? ''));
}

function getCurrentCliProvider(settingsSurface: NonNullable<RalphDashboardState['settingsSurface']>): CliProviderId {
  const providerEntry = settingsSurface.sections
    .flatMap((section) => section.entries)
    .find((entry) => entry.key === 'cliProvider');
  const providerValue = providerEntry?.value;
  return providerValue === 'claude' || providerValue === 'copilot' || providerValue === 'copilot-foundry' || providerValue === 'azure-foundry' || providerValue === 'gemini'
      ? providerValue
      : 'codex';
}

function getProviderTestLabel(provider: CliProviderId): string {
  switch (provider) {
    case 'claude':
      return 'Test Claude Connection';
    case 'copilot':
      return 'Test GitHub Copilot Connection';
    case 'copilot-foundry':
      return 'Test Copilot Foundry Connection';
    case 'azure-foundry':
      return 'Test Azure AI Foundry Connection';
    case 'gemini':
      return 'Test Gemini Connection';
    default:
      return 'Test Codex Connection';
  }
}

function buildSettingsSection(state: RalphDashboardState): string {
  const settingsSurface = state.settingsSurface;
  if (!settingsSurface) {
    return '<div class="empty">Config not loaded — reload window</div>';
  }

  const currentProvider = getCurrentCliProvider(settingsSurface);
  
  const allEntries = settingsSurface.sections.flatMap(s => s.entries);
  const getValue = (key: string) => allEntries.find((e) => e.key === key)?.value;
  
  const simpleThreshold = Number(getValue('modelTiering.simpleThreshold') ?? 0);
  const complexThreshold = Number(getValue('modelTiering.complexThreshold') ?? 0);
  const isTieringInvalid = simpleThreshold >= complexThreshold;

  const coreSections = settingsSurface.sections.filter(s => s.id === 'operator-mode' || s.id === 'provider');
  const advancedSections = settingsSurface.sections.filter(s => s.id !== 'operator-mode' && s.id !== 'provider');

  const renderSection = (section: typeof settingsSurface.sections[number], isOpen = false) => `
    <details class="settings-section" data-section="settings-${esc(section.id)}"${isOpen ? ' open' : ''}>
      <summary class="settings-section-toggle">
        <span class="settings-section-head">
          <span>${esc(section.title)}</span>
          ${section.hasNewSettings ? '<span class="settings-badge">NEW</span>' : ''}
        </span>
      </summary>
      <div class="settings-grid">
        <div class="settings-section-desc">${esc(section.description)}</div>
        ${section.id === 'provider' ? `
          <div class="inline-actions" style="grid-column: 1 / -1; margin-top: -2px; margin-bottom: 4px;">
            <button class="btn" data-command="ralphCodex.testCurrentProviderConnection"><span class="btn-label">${esc(getProviderTestLabel(currentProvider))}</span><span class="btn-spinner"></span></button>
          </div>
        ` : ''}
        ${section.entries.map((entry) => {
          let errorMsg = '';
          let isEntryInvalid = false;
          
          if (entry.key.includes('CommandPath') && typeof entry.value === 'string' && entry.value.trim() === '') {
            errorMsg = 'Command path cannot be empty.';
            isEntryInvalid = true;
          }
          if ((entry.key === 'modelTiering.simpleThreshold' || entry.key === 'modelTiering.complexThreshold') && isTieringInvalid) {
            errorMsg = 'Simple threshold must be strictly less than complex threshold.';
            isEntryInvalid = true;
          }

          return `
          <div class="setting-row" data-setting-entry="${esc(entry.key)}">
            <span class="setting-label${isEntryInvalid ? ' error-text' : ''}">${esc(entry.title)}${entry.isNew ? ' <span class="settings-badge">NEW</span>' : ''}</span>
            <div class="setting-control${isEntryInvalid ? ' invalid' : ''}">${renderSettingControl(entry)}</div>
            <div class="settings-entry-meta">
              ${errorMsg ? `<div class="error-text">⚠ ${esc(errorMsg)}</div>` : ''}
              <div>${esc(entry.description)}</div>
              <div>Default: ${esc(String(entry.defaultValue ?? ''))}</div>
            </div>
          </div>
        `}).join('\n')}
      </div>
    </details>
  `;

  const coreHtml = coreSections.map((section, index) => renderSection(section, index === 0)).join('\n');
  
  const hasAdvancedNew = advancedSections.some(s => s.hasNewSettings);
  const advancedHtml = advancedSections.length > 0 ? `
    <details class="settings-advanced-group">
      <summary class="settings-advanced-toggle">
        Advanced Configuration
        ${hasAdvancedNew ? '<span class="settings-badge" style="margin-left: 8px;">NEW</span>' : ''}
      </summary>
      <div style="margin-top: 8px; margin-left: 8px; border-left: 1px solid var(--border); padding-left: 12px;">
        ${advancedSections.map(s => renderSection(s, false)).join('\n')}
      </div>
    </details>
  ` : '';

  return coreHtml + '\n' + advancedHtml;
}

function formatUtc(value: string | null): string {
  if (!value) {
    return 'none';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return esc(value);
  }

  return esc(date.toISOString().replace('.000Z', 'Z'));
}

function formatElapsed(start: string, end: string | null): string {
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

function buildPipelineSection(state: RalphDashboardState): string {
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
      <div><strong>Run</strong> ${esc(pipeline.runId)} · ${esc(pipeline.status)}${pipeline.phase ? ` · phase ${esc(pipeline.phase)}` : ''}</div>
      <div><strong>Elapsed</strong> ${esc(formatElapsed(pipeline.loopStartTime, pipeline.loopEndTime))}</div>
      <div><strong>Root Task</strong> ${esc(pipeline.rootTaskId)} · ${pipeline.decomposedTaskCount} child task(s)</div>
      <div><strong>Started</strong> ${formatUtc(pipeline.loopStartTime)}${pipeline.loopEndTime ? ` · <strong>Ended</strong> ${formatUtc(pipeline.loopEndTime)}` : ''}</div>
      <div><strong>Last Stop</strong> ${esc(pipeline.lastStopReason ?? 'none')}</div>
      <div><strong>PR</strong> ${pipeline.prUrl ? esc(pipeline.prUrl) : 'none'}</div>
    </div>
    <div class="inline-actions">
      <button class="btn" data-command="ralphCodex.openLatestPipelineRun"><span class="btn-label">Open Pipeline</span><span class="btn-spinner"></span></button>
    </div>
  </div>`;
}

function buildTaskBoardSection(state: RalphDashboardState): string {
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
    ${buildProgressBar(taskBoard.counts)}
    <div class="metric-grid">
      <div class="metric"><span class="metric-label">Todo</span><span class="metric-value">${taskBoard.counts?.todo ?? 0}</span></div>
      <div class="metric"><span class="metric-label">In Progress</span><span class="metric-value">${taskBoard.counts?.in_progress ?? 0}</span></div>
      <div class="metric"><span class="metric-label">Done</span><span class="metric-value ok">${taskBoard.counts?.done ?? 0}</span></div>
      <div class="metric"><span class="metric-label">Blocked</span><span class="metric-value warn">${taskBoard.counts?.blocked ?? 0}</span></div>
      <div class="metric"><span class="metric-label">Dead-Letter</span><span class="metric-value warn">${taskBoard.deadLetterCount}</span></div>
    </div>
    <div class="pill-row">
      <span class="pill">Selected ${esc(taskBoard.selectedTaskId ?? 'none')}</span>
      <span class="pill">Next iteration ${taskBoard.nextIteration}</span>
    </div>
    ${taskBoard.selectedTaskTitle ? `<div class="dead-letter-meta" style="margin-top:8px;"><div><strong>Selected task</strong> ${esc(taskBoard.selectedTaskTitle)}</div></div>` : ''}
  </div>`;
}

function buildFailureFeedSection(state: RalphDashboardState): string {
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
      <div><strong>${esc(entry.taskId)}</strong> · ${esc(entry.taskTitle)}</div>
      <div><strong>Category</strong> ${esc(entry.category)} · <strong>Confidence</strong> ${esc(entry.confidence)}</div>
      <div><strong>Summary</strong> ${esc(entry.summary)}</div>
      <div><strong>Suggested action</strong> ${esc(entry.suggestedAction)}</div>
      <div><strong>Recovery attempts</strong> ${entry.recoveryAttemptCount ?? 0} · <strong>Human review</strong> ${entry.humanReviewRecommended ? 'recommended' : 'not requested'}</div>
      ${entry.remediationSummary ? `<div><strong>Remediation</strong> ${esc(entry.remediationSummary)}</div>` : ''}
      <div class="inline-actions">
        <button class="btn" data-command="ralphCodex.openFailureDiagnosis"><span class="btn-label">View Diagnosis</span><span class="btn-spinner"></span></button>
        <button class="btn" data-command="ralphCodex.autoRecoverTask"><span class="btn-label">Auto-Recover</span><span class="btn-spinner"></span></button>
        <button class="btn" data-command="ralphCodex.skipTask"><span class="btn-label">Skip Task</span><span class="btn-spinner"></span></button>
      </div>
    </div>`).join('\n')}
  </div>`;
}

function buildRichFailureCard(state: RalphDashboardState): string {
  const entry = state.dashboardSnapshot?.failureFeed.entries[0] ?? null;
  if (!entry) {
    return '';
  }

  const confidenceClass = entry.confidence === 'high' ? 'bad' : entry.confidence === 'medium' ? 'warn' : 'dim';

  return `<div class="card rich-failure-card">
    <div class="rich-failure-eyebrow">
      <span style="color:var(--bad); margin-right:6px;">⚠</span>
      <span>Needs Attention · Failure Diagnosis</span>
      <span class="pill ${confidenceClass}" style="margin-left: auto;">${esc(entry.confidence)} confidence</span>
    </div>
    <div class="rich-failure-header">
      <span class="rich-failure-task-id">${esc(entry.taskId)}</span>
      <span class="rich-failure-task-title">${esc(entry.taskTitle)}</span>
      <span class="rich-failure-meta">
        ${entry.recoveryAttemptCount ? `attempt ${entry.recoveryAttemptCount} · ` : ''}category <strong>${esc(entry.category.replace(/_/g, ' '))}</strong>
      </span>
    </div>
    <div class="rich-failure-block">
      <div class="rich-failure-block-label">What went wrong</div>
      <p class="rich-failure-block-text">${esc(entry.summary)}</p>
    </div>
    <div class="rich-failure-block rich-failure-block-suggested">
      <div class="rich-failure-block-label" style="color:var(--accent);">Suggested fix</div>
      <p class="rich-failure-block-text">${esc(entry.suggestedAction)}</p>
    </div>
    ${entry.remediationSummary ? `<div class="rich-failure-block">
      <div class="rich-failure-block-label">Remediation</div>
      <p class="rich-failure-block-text">${esc(entry.remediationSummary)}</p>
    </div>` : ''}
    <div class="inline-actions" style="margin-top: 12px; flex-wrap: wrap;">
      <button class="btn primary" data-command="ralphCodex.autoRecoverTask"><span class="btn-label">Auto-recover task</span><span class="btn-spinner"></span></button>
      <button class="btn" data-command="ralphCodex.openFailureDiagnosis"><span class="btn-label">Open diagnosis</span><span class="btn-spinner"></span></button>
      <button class="btn" data-command="ralphCodex.skipTask"><span class="btn-label">Skip task</span><span class="btn-spinner"></span></button>
      ${entry.humanReviewRecommended
        ? `<button class="btn" data-command="ralphCodex.requeueDeadLetterTask"><span class="btn-label">Dead-letter</span><span class="btn-spinner"></span></button>`
        : ''}
    </div>
  </div>`;
}

function buildDiagnosisSection(state: RalphDashboardState): string {
  const diagnosis = state.dashboardSnapshot?.diagnosis ?? null;
  if (!diagnosis) {
    return `<div class="dashboard-summary-card">
      <div class="card-title">Focused Diagnosis</div>
      <div class="empty">No focused diagnosis is available for the selected task.</div>
    </div>`;
  }

  return `<div class="dashboard-summary-card">
    <div class="card-title">Focused Diagnosis</div>
    <div class="failure-meta">
      <div><strong>${esc(diagnosis.taskId)}</strong> · ${esc(diagnosis.taskTitle)}</div>
      <div><strong>Category</strong> ${esc(diagnosis.category)} · <strong>Confidence</strong> ${esc(diagnosis.confidence)}</div>
      <div><strong>Cause</strong> ${esc(diagnosis.summary)}</div>
      <div><strong>Suggested action</strong> ${esc(diagnosis.suggestedAction)}</div>
      <div><strong>Recovery attempts</strong> ${diagnosis.recoveryAttemptCount ?? 0}</div>
      ${diagnosis.remediationSummary ? `<div><strong>Remediation</strong> ${esc(diagnosis.remediationSummary)}</div>` : ''}
      ${diagnosis.retryPromptAddendum ? `<div><strong>Retry addendum</strong> ${esc(diagnosis.retryPromptAddendum)}</div>` : ''}
      <div><strong>failure-analysis.json</strong> ${esc(diagnosis.failureAnalysisPath ?? 'none')}</div>
      <div><strong>recovery-state.json</strong> ${esc(diagnosis.recoveryStatePath ?? 'none')}</div>
      <div class="inline-actions">
        <button class="btn" data-command="ralphCodex.openFailureDiagnosis"><span class="btn-label">Open Focused View</span><span class="btn-spinner"></span></button>
        <button class="btn" data-command="ralphCodex.autoRecoverTask"><span class="btn-label">Auto-Recover</span><span class="btn-spinner"></span></button>
        <button class="btn" data-command="ralphCodex.skipTask"><span class="btn-label">Skip Task</span><span class="btn-spinner"></span></button>
      </div>
    </div>
  </div>`;
}

function buildAgentGridSection(state: RalphDashboardState): string {
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
          <span class="agent-badge">${esc(row.agentId)}</span>
          ${row.isStuck ? `<span class="agent-stuck">stuck ${row.stuckScore}</span>` : ''}
        </div>
        <div class="dead-letter-meta">
          <div><strong>First Seen</strong> ${formatUtc(row.firstSeenAt)}</div>
          <div><strong>Claim</strong> ${esc(row.activeClaimTaskId ?? 'idle')}</div>
          <div><strong>Completed</strong> ${row.completedTaskCount}</div>
          <div><strong>Latest</strong> ${esc(row.latestHandoffClassification ?? 'none')} · iter ${row.latestHandoffIteration ?? 'none'}</div>
          <div><strong>Heatmap</strong> ${esc(row.noProgressHeatmap || '[none]')}</div>
        </div>
      </div>`).join('\n')}
    </div>
  </div>`;
}

function buildDeadLetterSection(state: RalphDashboardState): string {
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
          <div><strong>${esc(entry.taskId)}</strong> · ${esc(entry.taskTitle)}</div>
          <div class="dead-letter-meta">
            <div><strong>Dead-lettered</strong> ${formatUtc(entry.deadLetteredAt)}</div>
            <div><strong>Attempts</strong> ${entry.recoveryAttemptCount} · <strong>Last category</strong> ${esc(latestCategory)}</div>
          </div>
        </div>`;
      }).join('\n')}
    </div>
    <div class="inline-actions">
      <button class="btn" data-command="ralphCodex.requeueDeadLetterTask"><span class="btn-label">Requeue</span><span class="btn-spinner"></span></button>
    </div>
  </div>`;
}

function buildCostTickerSection(state: RalphDashboardState): string {
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
      <div class="metric"><span class="metric-label">Execution cost</span><span class="metric-value">${esc(execCost)}</span></div>
      <div class="metric"><span class="metric-label">Diagnostic cost</span><span class="metric-value">${esc(diagCost)}</span></div>
      <div class="metric"><span class="metric-label">Prompt cache</span><span class="metric-value">${esc(cacheLabel)}</span></div>
      <div class="metric"><span class="metric-label">Cache prefix</span><span class="metric-value">${cost.promptCacheStats !== null ? `${cost.promptCacheStats.staticPrefixBytes.toLocaleString()} B` : 'unavailable'}</span></div>
    </div>
  </div>`;
}

function buildQuickActionsSection(state: RalphDashboardState): string {
  const quick = state.dashboardSnapshot?.quickActions ?? null;
  return `<div class="dashboard-summary-card">
    <div class="card-title">Quick Actions</div>
    <div class="btn-grid">
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

function buildSnapshotStatusBanner(state: RalphDashboardState): string {
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
    return `<div class="snapshot-banner error">Showing last successful dashboard snapshot. Refresh failed: ${esc(status.errorMessage ?? 'unknown error')}</div>`;
  }
  return `<div class="snapshot-banner error">Dashboard snapshot unavailable. ${esc(status.errorMessage ?? 'unknown error')}</div>`;
}

function buildTaskSeedingResult(state: RalphDashboardState): string {
  const seeding = state.taskSeeding;
  if (seeding.phase === 'idle' || !seeding.message) {
    return '';
  }

  const resultClass = seeding.phase === 'success'
    ? 'success'
    : seeding.phase === 'error'
      ? 'error'
      : 'submitting';
  const followUp = seeding.phase === 'success'
    ? `<div class="inline-actions">
        <button class="btn" data-command="ralphCodex.showTasks"><span class="btn-label">Open Tasks</span><span class="btn-spinner"></span></button>
        <button class="btn" data-command="ralphCodex.refreshDashboard"><span class="btn-label">Refresh Dashboard</span><span class="btn-spinner"></span></button>
      </div>`
    : '';
  const meta = seeding.artifactPath
    ? `<div class="seed-result-meta">Artifact: ${esc(seeding.artifactPath)}</div>`
    : '';

  return `<div class="seed-result ${resultClass}">
    <div>${esc(seeding.message)}</div>
    ${meta}
    ${followUp}
  </div>`;
}

function buildTaskSeedingCard(state: RalphDashboardState): string {
  return `<div class="card seed-card">
    <div class="card-title">Seed Tasks From Epic</div>
    <div class="card-subtitle">Enter a high-level feature request and append generated backlog tasks through the shared seeding pipeline.</div>
    <textarea data-seed-request="panel" placeholder="Describe the epic, goal, and constraints...">${esc(state.taskSeeding.requestText)}</textarea>
    <div class="seed-card-actions">
      <button class="btn" data-seed-submit="panel"><span class="btn-label">Seed Tasks</span><span class="btn-spinner"></span></button>
    </div>
    ${buildTaskSeedingResult(state)}
  </div>`;
}

function buildTaskCollections(state: RalphDashboardState): {
  activeTasks: RalphDashboardState['tasks'];
  doneTasks: RalphDashboardState['tasks'];
  allDone: boolean;
} {
  const statusOrder: Record<string, number> = { in_progress: 0, todo: 1, blocked: 2, done: 3 };
  const sorted = [...state.tasks].sort((a, b) => {
    if (a.isCurrent && !b.isCurrent) return -1;
    if (!a.isCurrent && b.isCurrent) return 1;
    return (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
  });

  const activeTasks = sorted.filter((task) => task.status !== 'done');
  const doneTasks = sorted.filter((task) => task.status === 'done');
  return { activeTasks, doneTasks, allDone: activeTasks.length === 0 && doneTasks.length > 0 };
}

function formatCostLabel(amount: number | null): string {
  return amount === null ? 'Unavailable' : `$${amount.toFixed(4)}`;
}

function buildHeroHealthCell(
  label: string,
  value: string,
  subtitle: string,
  fillPercent?: number,
  fillColor = 'var(--accent)'
): string {
  return `<div class="hero-health-cell">
    <div class="hero-health-label">${esc(label)}</div>
    <div class="hero-health-value">${esc(value)}</div>
    <div class="hero-health-sub">${esc(subtitle)}</div>
    ${typeof fillPercent === 'number'
      ? `<div class="hero-health-track"><div class="hero-health-fill" style="width:${Math.max(0, Math.min(100, fillPercent))}%; background:${fillColor};"></div></div>`
      : ''}
  </div>`;
}

function buildHeroCard(state: RalphDashboardState): string {
  const snapshot = state.dashboardSnapshot;
  const taskBoard = snapshot?.taskBoard ?? null;
  const currentTask = state.tasks.find((task) => task.isCurrent)
    ?? state.tasks[0]
    ?? (taskBoard?.selectedTaskId
      ? {
          id: taskBoard.selectedTaskId,
          title: taskBoard.selectedTaskTitle ?? 'Selected task',
          status: 'todo' as const,
          isCurrent: true,
          priority: 'normal',
          childIds: [],
          dependsOn: []
        }
      : null);
  const agentLane = state.agentLanes[0] ?? null;
  const counts = taskBoard?.counts ?? state.taskCounts;
  const totalCount = counts ? counts.todo + counts.in_progress + counts.blocked + counts.done : 0;
  const doneCount = counts?.done ?? 0;
  const progressPercent = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
  const blockedCount = counts?.blocked ?? 0;
  const deadLetterCount = taskBoard?.deadLetterCount ?? snapshot?.deadLetter.entries.length ?? 0;
  const attentionCount = blockedCount + deadLetterCount;
  const iterationValue = `${taskBoard?.nextIteration ?? state.nextIteration}/${state.iterationCap}`;
  const iterationPercent = state.iterationCap > 0
    ? Math.round(((taskBoard?.nextIteration ?? state.nextIteration) / state.iterationCap) * 100)
    : 0;
  const stateClass = state.loopState;
  const stateLabel = state.loopState === 'running'
    ? 'Loop running'
    : state.loopState === 'stopped'
      ? 'Loop stopped'
      : 'Loop idle';
  const title = currentTask ? `${currentTask.id} · ${currentTask.title}` : 'No active task selected';
  const summary = currentTask
    ? state.loopState === 'running'
      ? `${esc(state.workspaceName)} is executing ${esc(currentTask.id)} with the ${esc(state.agentRole)} role. Durable snapshot data remains live across overview, work, diagnostics, orchestration, and settings.`
      : `${esc(state.workspaceName)} is ready for the next loop. Resume when you want Ralph to continue ${esc(currentTask.id)}.`
    : 'No task is selected yet. Seed or regenerate work to populate the dashboard.';
  const loopDisabled = state.loopState === 'running' ? ' disabled title="Loop already running"' : '';

  return `<section class="hero-card">
    <div class="hero-topline">
      <div class="hero-headline">
        <div class="hero-kicker">Now</div>
        <div class="hero-status-row">
          <span class="hero-state-pill ${stateClass}">${esc(stateLabel)}</span>
          <span class="hero-inline-pill">${esc(state.workspaceName)}</span>
          <span class="hero-inline-pill">${esc(state.agentRole)}</span>
          ${taskBoard?.selectedTaskId ? `<span class="hero-inline-pill">Selected ${esc(taskBoard.selectedTaskId)}</span>` : ''}
        </div>
        <div class="hero-title">${esc(title)}</div>
        <div class="hero-summary">${summary}</div>
      </div>
      <div class="hero-actions">
        <button class="btn" data-command="ralphCodex.runRalphLoop"${loopDisabled}><span class="btn-label">Run Loop</span><span class="btn-spinner"></span></button>
        <button class="btn" data-command="ralphCodex.runRalphIteration"${loopDisabled}><span class="btn-label">Run Iteration</span><span class="btn-spinner"></span></button>
      </div>
    </div>
    <div class="hero-phase">
      ${buildAgentLanes(state.agentLanes)}
    </div>
    <div class="hero-health-grid">
      ${buildHeroHealthCell('Progress', counts ? `${doneCount}/${totalCount}` : 'No tasks', counts ? `${progressPercent}% done` : 'No task data', progressPercent, 'var(--ok)')}
      ${buildHeroHealthCell('Iteration', iterationValue, `cap ${state.iterationCap}`, iterationPercent, 'var(--accent)')}
      ${buildHeroHealthCell('Attention', `${attentionCount}`, `${blockedCount} blocked · ${deadLetterCount} dead-letter`)}
      ${buildHeroHealthCell('Cost', formatCostLabel(snapshot?.cost.executionCostUsd ?? null), `diag ${formatCostLabel(snapshot?.cost.diagnosticCostUsd ?? null)}`)}
    </div>
  </section>`;
}

function buildDashboardSidebar(state: RalphDashboardState): string {
  const currentTask = state.tasks.find((task) => task.isCurrent) ?? state.tasks[0] ?? null;

  return `<aside class="dashboard-sidebar">
    <div class="dashboard-sidebar-panel">
      <div class="dashboard-brand">
        <div class="dashboard-brand-kicker">Ralphdex</div>
        <div class="dashboard-brand-title">${esc(state.workspaceName)}</div>
        <div class="dashboard-brand-meta">${esc(LOOP_STATE_LABEL[state.loopState])} · ${esc(state.agentRole)}</div>
      </div>
    </div>

    <div class="dashboard-sidebar-panel">
      <div class="rail-section-label">Navigate</div>
      <div class="tab-bar" role="tablist" aria-label="Dashboard sections">
        ${DASHBOARD_TABS.map((tab, index) => `<button id="tab-button-${tab.id}" class="tab-button" type="button" role="tab" data-tab="${tab.id}" aria-selected="${index === 0 ? 'true' : 'false'}" aria-controls="tab-${tab.id}" tabindex="${index === 0 ? '0' : '-1'}">${tab.label}</button>`).join('')}
      </div>
    </div>

    <div class="dashboard-sidebar-panel">
      <div class="rail-section-label">Quick Actions</div>
      <div class="dashboard-sidebar-actions">
        <button class="btn rail-command" data-command="ralphCodex.generatePrompt"><span class="btn-label">Prepare Prompt</span><span class="btn-spinner"></span></button>
        <button class="btn rail-command" data-command="ralphCodex.showRalphStatus"><span class="btn-label">Show Status</span><span class="btn-spinner"></span></button>
        <button class="btn rail-command" data-command="ralphCodex.showMultiAgentStatus"><span class="btn-label">Agent Status</span><span class="btn-spinner"></span></button>
        <button class="btn rail-command" data-command="ralphCodex.showTasks"><span class="btn-label">Open Tasks</span><span class="btn-spinner"></span></button>
        <button class="btn rail-command" data-command="ralphCodex.openLatestPipelineRun"><span class="btn-label">Latest Run</span><span class="btn-spinner"></span></button>
        <button class="btn rail-command" data-command="workbench.action.openSettings"><span class="btn-label">Open Settings</span><span class="btn-spinner"></span></button>
      </div>
    </div>

    <div class="dashboard-sidebar-panel">
      <div class="rail-section-label">Current Task</div>
      <div class="rail-current-task">
        ${currentTask
          ? `<div><strong>${esc(currentTask.id)}</strong> · ${esc(currentTask.title)}</div>
             <div class="dashboard-brand-meta">${esc(currentTask.status.replace(/_/g, ' '))}${currentTask.validation ? ` · ${esc(currentTask.validation)}` : ''}</div>`
          : '<div class="dashboard-brand-meta">No task selected.</div>'}
      </div>
    </div>
  </aside>`;
}

function buildOverviewTab(state: RalphDashboardState): string {
  const taskBoard = state.dashboardSnapshot?.taskBoard ?? null;
  const quick = state.dashboardSnapshot?.quickActions ?? null;
  const currentTask = state.tasks.find((task) => task.isCurrent) ?? state.tasks[0] ?? null;
  const failure = state.dashboardSnapshot?.failureFeed.entries[0] ?? null;
  const loopDisabled = state.loopState === 'running' ? ' disabled title="Loop already running"' : '';
  const total = state.taskCounts
    ? state.taskCounts.todo + state.taskCounts.in_progress + state.taskCounts.blocked + state.taskCounts.done
    : 0;

  return `<div class="overview-shell">
    ${buildHeroCard(state)}
    <div class="overview-body">
      <div class="overview-column">
        <div class="card">
          <div class="card-title">Health</div>
          <div class="metric-grid">
            <div class="metric"><span class="metric-label">Loop State</span><span class="metric-value">${esc(LOOP_STATE_LABEL[state.loopState])}</span></div>
            <div class="metric"><span class="metric-label">Role</span><span class="metric-value">${esc(state.agentRole)}</span></div>
            <div class="metric"><span class="metric-label">Selected Task</span><span class="metric-value">${esc(taskBoard?.selectedTaskId ?? 'none')}</span></div>
            <div class="metric"><span class="metric-label">Next Iteration</span><span class="metric-value">${taskBoard?.nextIteration ?? state.nextIteration}</span></div>
            <div class="metric"><span class="metric-label">Preflight</span><span class="metric-value ${state.preflightReady ? 'ok' : 'warn'}">${state.preflightReady ? 'ready' : 'attention needed'}</span></div>
            <div class="metric"><span class="metric-label">Progress</span><span class="metric-value">${state.taskCounts ? `${state.taskCounts.done}/${total}` : 'none'}</span></div>
          </div>
          <div style="margin-top:8px;">${buildProgressBar(taskBoard?.counts ?? state.taskCounts)}</div>
        </div>

        <div class="card">
          <div class="card-title">Attention</div>
          <div class="attention-list">
            ${failure ? `<div>Latest failure: ${esc(failure.taskId)} · ${esc(failure.category)}</div>` : ''}
            ${quick?.hasBlockedTasks ? '<div>Blocked tasks need review before the next clean run.</div>' : ''}
            ${quick?.hasDeadLetterEntries ? '<div>Dead-letter contains parked work that may need requeue.</div>' : ''}
            ${!state.preflightReady ? `<div>${esc(state.preflightSummary)}</div>` : ''}
            ${!failure && !quick?.hasBlockedTasks && !quick?.hasDeadLetterEntries && state.preflightReady ? '<div>No immediate interruptions.</div>' : ''}
          </div>
        </div>

        ${buildPipelineSection(state)}

        <div class="card">
          <div class="card-title">Recent Activity</div>
          <div class="history-list">
            ${state.recentIterations.length > 0
              ? state.recentIterations.slice(0, 5).map(buildIterationRow).join('\n')
              : '<div class="empty">No iterations yet.</div>'}
          </div>
        </div>
      </div>

      <div class="overview-column">
        ${buildTaskBoardSection(state)}
        ${buildRichFailureCard(state)}
        <div class="card">
          <div class="card-title">Current Work</div>
          ${currentTask
            ? `<div class="task-summary-list">
                <div><strong>${esc(currentTask.id)}</strong> · ${esc(currentTask.title)}</div>
                <div><strong>Status</strong> ${esc(currentTask.status.replace(/_/g, ' '))}</div>
                ${currentTask.blocker ? `<div><strong>Blocker</strong> ${esc(currentTask.blocker)}</div>` : ''}
                ${currentTask.validation ? `<div><strong>Validation</strong> ${esc(currentTask.validation)}</div>` : ''}
                <div><strong>Next Step</strong> ${esc(currentTask.blocker ? 'Resolve blocker before starting another loop.' : currentTask.validation ? `Validate with ${currentTask.validation}.` : 'Start the next iteration when ready.')}</div>
              </div>`
            : (state.snapshotStatus?.phase === 'loading' || state.snapshotStatus?.phase === 'refreshing'
                ? '<div class="empty">Loading workspace data...</div>'
                : '<div class="empty" style="margin-bottom: 6px;">No tasks yet.</div><button class="btn" data-command="ralphCodex.regeneratePrd"><span class="btn-label">Initialize Workspace</span><span class="btn-spinner"></span></button>')}
        </div>

        <div class="card">
          <div class="card-title">Common Actions</div>
          <div class="btn-grid">
            <button class="btn" data-command="ralphCodex.runRalphLoop"${loopDisabled}><span class="btn-label">Run Loop</span><span class="btn-spinner"></span></button>
            <button class="btn" data-command="ralphCodex.runMultiAgentLoop"${loopDisabled}><span class="btn-label">Run Multi</span><span class="btn-spinner"></span></button>
            <button class="btn" data-command="ralphCodex.runRalphIteration"${loopDisabled}><span class="btn-label">Run Iteration</span><span class="btn-spinner"></span></button>
            <button class="btn" data-command="ralphCodex.generatePrompt"><span class="btn-label">Prepare Prompt</span><span class="btn-spinner"></span></button>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

function buildWorkTab(state: RalphDashboardState): string {
  const { activeTasks, doneTasks, allDone } = buildTaskCollections(state);
  const total = state.taskCounts
    ? state.taskCounts.todo + state.taskCounts.in_progress + state.taskCounts.blocked + state.taskCounts.done
    : 0;

  return `<div class="work-shell">
    <div class="work-grid">
      <div class="card">
        <div class="card-title">Tasks${state.taskCounts ? ` · ${state.taskCounts.done}/${total}` : ''}</div>
        ${allDone
          ? `<div class="all-done-card">
              <div class="check">✓</div>
              <div class="label">All ${doneTasks.length} tasks completed</div>
            </div>`
          : activeTasks.length > 0
            ? activeTasks.map((task) => buildTaskRow(task, state.loopState === 'running')).join('\n')
            : (state.snapshotStatus?.phase === 'loading' || state.snapshotStatus?.phase === 'refreshing'
                ? '<div class="empty">Loading workspace data...</div>'
                : '<div class="empty" style="margin-bottom: 6px;">No tasks yet.</div><button class="btn" data-command="ralphCodex.regeneratePrd"><span class="btn-label">Initialize Workspace</span><span class="btn-spinner"></span></button>')}
        ${!allDone && doneTasks.length > 0
          ? `<details data-section="completed-tasks">
              <summary class="completed-toggle">Completed (${doneTasks.length})</summary>
              ${doneTasks.map((task) => buildTaskRow(task, state.loopState === 'running')).join('\n')}
            </details>`
          : ''}
      </div>

      <div class="card">
        <div class="card-title">History</div>
        <div class="history-list">
          ${state.recentIterations.length > 0
            ? state.recentIterations.map(buildIterationRow).join('\n')
            : '<div class="empty">No iterations yet</div>'}
        </div>
      </div>

      ${buildTaskSeedingCard(state)}
    </div>
  </div>`;
}

function buildDiagnosticsTab(state: RalphDashboardState): string {
  return `<div class="diagnostics-shell">
    <div class="diagnostics-grid">
      ${buildPipelineSection(state)}
      ${buildTaskBoardSection(state)}
      ${buildDiagnosisSection(state)}
      ${buildFailureFeedSection(state)}
      ${buildAgentGridSection(state)}
      ${buildDeadLetterSection(state)}
      ${buildCostTickerSection(state)}
      <div class="card">
        <div class="card-title">Preflight</div>
        ${buildDiagnostics(state)}
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
    </div>
  </div>`;
}

function buildOrchestrationTab(state: RalphDashboardState): string {
  const orch = state.dashboardSnapshot?.orchestration ?? null;

  if (!orch) {
    return `<div class="orchestration-shell">
      <div class="diagnostics-grid">
        <div class="dashboard-summary-card full">
          <div class="card-title">Orchestration</div>
          <div class="empty">No orchestration data recorded for the latest pipeline run. Start a pipeline to populate this panel.</div>
        </div>
      </div>
    </div>`;
  }

  // Fan-in status badge
  const fanInBadgeClass = orch.fanInStatus === 'passed' ? 'ok' : orch.fanInStatus === 'failed' ? 'warn' : '';
  const fanInLabel = orch.fanInStatus === 'absent' ? 'not evaluated' : orch.fanInStatus;

  // Completed nodes with span detail
  const completedNodesHtml = orch.completedNodes.length > 0
    ? orch.completedNodes.map((node) => `<div class="dead-letter-item">
        <div><strong>${esc(node.nodeId)}</strong> · ${esc(node.label)}</div>
        <div class="dead-letter-meta">
          <div><strong>Outcome</strong> ${esc(node.outcome)}${node.finishedAt ? ` · <strong>At</strong> ${formatUtc(node.finishedAt)}` : ''}</div>
          ${node.agentRole ? `<div><strong>Role</strong> ${esc(node.agentRole)}</div>` : ''}
          ${node.stopClassification ? `<div><strong>Stop</strong> ${esc(node.stopClassification)}</div>` : ''}
        </div>
      </div>`).join('\n')
    : '<div class="empty">No nodes completed yet.</div>';

  // Pending branch nodes
  const pendingNodesHtml = orch.pendingBranchNodes.length > 0
    ? orch.pendingBranchNodes.map((node) => `<span class="pill">${esc(node.nodeId)} · ${esc(node.label)}</span>`).join('\n')
    : '<div class="empty">No pending branches.</div>';

  // Replan history
  const replanHtml = orch.replanHistory.length > 0
    ? orch.replanHistory.map((r) => `<div class="failure-meta">
        <div><strong>Replan ${r.replanIndex}</strong> · triggers: ${esc(r.triggerEvidenceClass.join(', '))}</div>
        <div><strong>Details</strong> ${esc(r.triggerDetails)}</div>
        <div><strong>Diff</strong> +${r.taskGraphDiff.addedTaskIds.length} added · -${r.taskGraphDiff.removedTaskIds.length} removed · ~${r.taskGraphDiff.modifiedTaskIds.length} modified</div>
      </div>`).join('\n')
    : '<div class="empty">No replanning recorded.</div>';

  // Human gate artifacts
  const humanGatesHtml = orch.humanGates.length > 0
    ? orch.humanGates.map((gate) => `<div class="failure-meta">
        <div><strong>${esc(gate.gateType)}</strong> · ${formatUtc(gate.createdAt)}</div>
        <div><strong>Reason</strong> ${esc(gate.triggerReason)}</div>
        <div><strong>Affected tasks</strong> ${esc(gate.affectedTaskIds.join(', ') || 'none')}</div>
      </div>`).join('\n')
    : '<div class="empty">No human gate artifacts blocking.</div>';

  return `<div class="orchestration-shell">
    <div class="diagnostics-grid">
      <div class="dashboard-summary-card full">
        <div class="card-title">Graph State</div>
        <div class="pipeline-meta">
          <div><strong>Active node</strong> ${esc(orch.activeNodeId ?? 'none')}${orch.activeNodeLabel ? ` · ${esc(orch.activeNodeLabel)}` : ''}</div>
          <div><strong>Fan-in</strong> <span class="metric-value ${fanInBadgeClass}">${esc(fanInLabel)}</span>${orch.fanInErrors.length > 0 ? ` · ${esc(orch.fanInErrors.join('; '))}` : ''}</div>
        </div>
        <div class="card-title" style="margin-top:12px;">Pending Branches</div>
        <div class="pill-row">${pendingNodesHtml}</div>
      </div>

      <div class="dashboard-summary-card">
        <div class="card-title">Completed Nodes</div>
        ${completedNodesHtml}
      </div>

      <div class="dashboard-summary-card">
        <div class="card-title">Human Gates</div>
        ${humanGatesHtml}
      </div>

      <div class="dashboard-summary-card">
        <div class="card-title">Replan History</div>
        ${replanHtml}
      </div>
    </div>
  </div>`;
}

function buildSettingsTab(state: RalphDashboardState): string {
  return `<div class="settings-shell">
    <div class="card">
      <div class="card-title">Project Actions</div>
      <div class="btn-grid">
        <button class="btn" data-command="ralphCodex.initializeWorkspace"><span class="btn-label">Initialize Workspace</span><span class="btn-spinner"></span></button>
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

export function buildPanelDashboardHtml(state: RalphDashboardState, nonce: string): string {
  const stateLabel = LOOP_STATE_LABEL[state.loopState];

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
    <div class="dashboard-app">
      ${buildDashboardSidebar(state)}

      <main class="dashboard-main">
        <div class="header">
          <div class="header-title">Ralphdex</div>
          <div class="header-state">${esc(state.workspaceName)} · ${stateLabel} · ${esc(state.agentRole)}</div>
        </div>

        ${buildSnapshotStatusBanner(state)}

        <div class="tab-layout">
          <div id="tab-overview" class="tab-panel" role="tabpanel" aria-labelledby="tab-button-overview">
            ${buildOverviewTab(state)}
          </div>
          <div id="tab-work" class="tab-panel" role="tabpanel" aria-labelledby="tab-button-work" hidden>
            ${buildWorkTab(state)}
          </div>
          <div id="tab-diagnostics" class="tab-panel" role="tabpanel" aria-labelledby="tab-button-diagnostics" hidden>
            ${buildDiagnosticsTab(state)}
          </div>
          <div id="tab-orchestration" class="tab-panel" role="tabpanel" aria-labelledby="tab-button-orchestration" hidden>
            ${buildOrchestrationTab(state)}
          </div>
          <div id="tab-settings" class="tab-panel" role="tabpanel" aria-labelledby="tab-button-settings" hidden>
            ${buildSettingsTab(state)}
          </div>
        </div>
      </main>
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

      function runSeedTasks(el) {
        var source = el.getAttribute('data-seed-submit');
        if (!source || el.disabled) return;
        var field = document.querySelector('[data-seed-request="' + source + '"]');
        var requestText = field ? field.value : '';
        el.classList.add('loading');
        el.disabled = true;
        vscode.postMessage({ type: 'seed-tasks', requestText: requestText, source: source });
        var t = setTimeout(function() { resetButton(el); }, 15000);
        ackTimeouts.set(el, t);
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

        var seedBtn = e.target.closest('[data-seed-submit]');
        if (seedBtn) { runSeedTasks(seedBtn); return; }

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
          var phases = ${JSON.stringify(PHASE_LABELS)};
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
        if (msg.type === 'seed-tasks-result') {
          var seedButtons = document.querySelectorAll('[data-seed-submit="' + msg.source + '"]');
          seedButtons.forEach(function(btn) {
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
