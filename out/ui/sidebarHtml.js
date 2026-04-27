"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDashboardHtml = buildDashboardHtml;
const htmlHelpers_1 = require("./htmlHelpers");
// ---------------------------------------------------------------------------
// Sidebar-specific CSS (compact triage surface)
// ---------------------------------------------------------------------------
function buildSidebarCss() {
    return `
${(0, htmlHelpers_1.buildBaseCss)()}

body {
  font-family: var(--font-ui);
  font-size: 12px;
  line-height: 1.5;
  color: var(--fg);
  background: var(--vscode-sideBar-background);
  padding: 8px;
  overflow-x: hidden;
}

/* Mode-driven visibility */
.mode-section { display: block; }
body[data-mode="simple"] .mode-advanced { display: none; }
body[data-mode="advanced"] .mode-simple { display: none; }

/* Mode switcher */
.mode-switcher {
  margin: 6px 0 10px;
}

.mode-switcher-label {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 1.4px;
  color: var(--dim);
  font-weight: 700;
  margin-bottom: 5px;
}

.mode-switcher-pills {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 3px;
  padding: 3px;
  background: rgba(0, 0, 0, 0.15);
  border: 1px solid var(--border);
  border-radius: 6px;
}

.mode-pill {
  font-family: inherit;
  font-size: 11px;
  font-weight: 400;
  padding: 5px 4px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  background: transparent;
  color: var(--dim);
  transition: all 0.15s ease;
  text-align: center;
}

.mode-pill.active {
  background: var(--accent);
  color: #15131a;
  font-weight: 600;
}

.mode-pill:not(.active):hover {
  background: rgba(255,255,255,0.06);
  color: var(--fg);
}

/* Tab nav within sidebar */
.sidebar-tabs {
  display: flex;
  gap: 2px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.sidebar-tab {
  font-family: inherit;
  font-size: 11px;
  padding: 5px 8px;
  border: none;
  background: transparent;
  color: var(--dim);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.15s ease;
  margin-bottom: -1px;
  white-space: nowrap;
}

.sidebar-tab.active {
  color: var(--fg);
  border-bottom-color: var(--accent);
}

.sidebar-tab-panel { display: none; }
.sidebar-tab-panel.active { display: block; }

/* Alerts banner */
.alerts-banner {
  padding: 6px 8px;
  margin-bottom: 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 6px;
}

.alerts-banner.warn {
  background: color-mix(in srgb, var(--warn) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--warn) 40%, var(--border));
  color: var(--warn);
}

.alerts-banner.bad {
  background: color-mix(in srgb, var(--bad) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--bad) 40%, var(--border));
  color: var(--bad);
}

/* Overview counts strip */
.overview-counts {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.count-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--dim);
  cursor: pointer;
  transition: all 0.15s ease;
}

.count-chip:hover, .count-chip[aria-pressed="true"] {
  border-color: var(--accent);
  color: var(--fg);
  background: color-mix(in srgb, var(--accent) 10%, var(--surface-2));
}

.count-chip.warn { border-color: color-mix(in srgb, var(--warn) 40%, var(--border)); color: var(--warn); }
.count-chip.bad { border-color: color-mix(in srgb, var(--bad) 40%, var(--border)); color: var(--bad); }
.count-chip.ok { border-color: color-mix(in srgb, var(--ok) 40%, var(--border)); color: var(--ok); }

/* Search */
.task-search-wrap {
  position: relative;
  margin-bottom: 6px;
}

.task-search {
  width: 100%;
  padding: 5px 28px 5px 8px;
  font: inherit;
  font-size: 11px;
  color: var(--vscode-input-foreground, var(--fg));
  background: rgba(0, 0, 0, 0.18);
  border: 1px solid var(--border);
  border-radius: 6px;
}

.task-search:focus {
  outline: none;
  border-color: var(--accent);
}

.task-search-clear {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: var(--dim);
  cursor: pointer;
  font-size: 12px;
  padding: 2px 4px;
  display: none;
}

.task-search-wrap.has-value .task-search-clear { display: block; }

/* Filter tabs */
.filter-tabs {
  display: flex;
  gap: 2px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}

.filter-tab {
  font-family: inherit;
  font-size: 10px;
  padding: 3px 7px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: transparent;
  color: var(--dim);
  cursor: pointer;
  transition: all 0.12s ease;
}

.filter-tab[aria-pressed="true"] {
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  border-color: var(--accent);
  color: var(--fg);
  font-weight: 600;
}

.filter-tab:hover:not([aria-pressed="true"]) {
  background: rgba(255,255,255,0.04);
  color: var(--fg);
}

/* Compact sidebar task rows */
.sb-task-row {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 5px 8px;
  margin-bottom: 3px;
  cursor: pointer;
  border-radius: 6px;
  background: transparent;
  border: 1px solid transparent;
  transition: all 0.15s ease;
  color: inherit;
  text-align: left;
  font-family: inherit;
  font-size: 11px;
}

.sb-task-row:hover {
  background: rgba(255,255,255,0.04);
  border-color: var(--border);
}

.sb-task-row[aria-selected="true"] {
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
}

.sb-task-row.blocked {
  color: var(--warn);
}

.sb-task-row.done {
  color: var(--dim);
  opacity: 0.75;
}

.sb-task-glyph {
  width: 14px;
  flex-shrink: 0;
  font-family: var(--font-mono);
  font-size: 10px;
  text-align: center;
}

.sb-task-id {
  width: 40px;
  flex-shrink: 0;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  color: var(--accent);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sb-task-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding-left: 4px;
}

.sb-task-priority {
  flex-shrink: 0;
  font-size: 9px;
  font-family: var(--font-mono);
  color: var(--dim);
  margin-left: 4px;
}

.sb-task-marker {
  flex-shrink: 0;
  width: 14px;
  text-align: center;
  font-size: 10px;
}

.sb-task-marker.current { color: var(--accent); }
.sb-task-marker.blocker { color: var(--warn); }
.sb-task-marker.has-children { color: var(--cyan); }

/* Task detail (expanded inline) */
.sb-task-detail {
  padding: 4px 8px 6px 22px;
  font-size: 10px;
  color: var(--dim);
  border-left: 2px solid var(--border);
  margin-bottom: 4px;
  background: rgba(0, 0, 0, 0.08);
  border-radius: 0 0 6px 6px;
  margin-top: -3px;
}

.sb-task-detail dt { font-weight: 700; color: var(--fg); margin-top: 3px; font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; }
.sb-task-detail dd { margin-left: 0; margin-bottom: 4px; line-height: 1.3; word-break: break-word; }

/* Quick actions */
.quick-actions {
  display: grid;
  gap: 1px;
}

.quick-action {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 5px 8px;
  font-family: inherit;
  font-size: 11px;
  background: transparent;
  color: var(--dim);
  border: none;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.12s ease;
  text-align: left;
  width: 100%;
}

.quick-action:hover {
  background: rgba(255,255,255,0.05);
  color: var(--fg);
}

.quick-action:disabled {
  opacity: 0.4;
  cursor: default;
}

.quick-shortcut {
  font-family: var(--font-mono);
  font-size: 10px;
  opacity: 0.5;
}

/* State dot */
.state-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--dim);
  margin-right: 4px;
  vertical-align: middle;
}

.state-dot.running {
  background: var(--ok);
  animation: ralph-blink 1.5s ease-in-out infinite;
}

.state-dot.stopped {
  background: var(--warn);
}

/* Current task card */
.current-task-card {
  margin: 12px 0 6px;
  padding: 10px 12px;
  background: rgba(0, 0, 0, 0.15);
  border: 1px solid var(--border);
  border-radius: 8px;
}

.current-task-card.blocked {
  border-color: color-mix(in srgb, var(--warn) 40%, var(--border));
}

.current-task-kicker {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 1.4px;
  color: var(--dim);
  font-weight: 700;
  margin-bottom: 5px;
}

.current-task-id {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--accent);
  font-weight: 600;
  margin-bottom: 3px;
}

.current-task-title {
  font-size: 12px;
  line-height: 1.4;
  margin-bottom: 4px;
}

.current-task-empty {
  font-size: 11px;
  color: var(--dim);
  font-style: italic;
}

.current-task-failure {
  font-size: 10px;
  color: var(--warn);
  margin-top: 4px;
}

.current-task-meta {
  font-size: 10px;
  color: var(--dim);
  margin-top: 2px;
  font-family: var(--font-mono);
}

/* Simple mode status */
.simple-status {
  text-align: center;
  padding: 6px 0;
}

.simple-status-text {
  font-size: 12px;
  color: var(--dim);
}

.btn-primary {
  background: var(--accent);
  color: #15131a;
  border-color: var(--accent);
  font-weight: 600;
}

.btn-primary:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent) 85%, white);
}

.btn-danger {
  background: color-mix(in srgb, var(--bad) 15%, transparent);
  color: var(--bad);
  border-color: color-mix(in srgb, var(--bad) 40%, var(--border));
}

.open-dashboard {
  display: block;
  width: 100%;
  padding: 8px 10px;
  margin-top: 8px;
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 600;
  border: 1px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  color: var(--accent);
  cursor: pointer;
  text-align: center;
  letter-spacing: 1px;
  text-transform: uppercase;
  transition: all 0.15s ease;
  border-radius: 8px;
}

.open-dashboard:hover {
  background: color-mix(in srgb, var(--accent) 25%, transparent);
  transform: translateY(-1px);
}

/* Phase indicator (compact) */
.phase-indicator {
  font-size: 10px;
  color: var(--accent);
  margin-bottom: 6px;
  text-align: center;
  font-weight: 600;
}

/* Seed form */
.seed-block {
  margin-top: 10px;
}

.seed-block textarea {
  width: 100%;
  min-height: 76px;
  resize: vertical;
  padding: 8px;
  font: inherit;
  color: var(--vscode-input-foreground, #ccc);
  background: rgba(0, 0, 0, 0.18);
  border: 1px solid var(--border);
  border-radius: 8px;
}

.seed-block textarea:focus {
  outline: none;
  border-color: var(--accent);
}

.seed-validation {
  font-size: 10px;
  color: var(--warn);
  margin-top: 3px;
  min-height: 14px;
}

.seed-result {
  margin-top: 8px;
  font-size: 11px;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
}

.seed-result.success {
  border-color: var(--ok);
  color: var(--ok);
}

.seed-result.error {
  border-color: var(--warn);
  color: var(--warn);
}

.seed-success-actions {
  margin-top: 6px;
  display: flex;
  gap: 4px;
}

/* Dead-letter section */
.dl-entry {
  padding: 6px 8px;
  margin-bottom: 4px;
  border: 1px solid color-mix(in srgb, var(--bad) 30%, var(--border));
  border-radius: 6px;
  background: color-mix(in srgb, var(--bad) 5%, transparent);
  font-size: 11px;
}

.dl-entry-header {
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: 600;
}

.dl-entry-reason {
  font-size: 10px;
  color: var(--dim);
  margin-top: 2px;
}

.dl-actions {
  display: flex;
  gap: 4px;
  margin-top: 4px;
}

.dl-positive-empty {
  font-size: 11px;
  color: var(--ok);
  padding: 6px 8px;
  text-align: center;
}

/* Recent outputs */
.recent-outputs { margin-top: 6px; }

/* Focus visible for keyboard nav */
.sb-task-row:focus-visible,
.filter-tab:focus-visible,
.count-chip:focus-visible,
.task-search:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* Reduced-motion */
@media (prefers-reduced-motion: reduce) {
  .state-dot.running { animation: none; }
  .sb-task-row, .filter-tab, .count-chip, .btn, .quick-action, .mode-pill, .sidebar-tab { transition: none; }
}
`;
}
// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------
function buildAlertsBanner(state) {
    const snapshot = state.dashboardSnapshot;
    const blockedCount = state.taskCounts?.blocked ?? snapshot?.taskBoard.counts?.blocked ?? 0;
    const dlCount = snapshot?.deadLetter.entries.length ?? 0;
    if (blockedCount === 0 && dlCount === 0)
        return '';
    const parts = [];
    if (blockedCount > 0)
        parts.push(`${blockedCount} blocked`);
    if (dlCount > 0)
        parts.push(`${dlCount} dead-letter`);
    const severity = dlCount > 0 ? 'bad' : 'warn';
    return `<div class="alerts-banner ${severity}" role="alert">
    <span aria-hidden="true">${dlCount > 0 ? '✗' : '⚠'}</span>
    <span>${parts.join(' · ')} — needs attention</span>
  </div>`;
}
function buildOverviewCounts(state) {
    const counts = state.taskCounts;
    const snapshot = state.dashboardSnapshot;
    const active = counts?.in_progress ?? snapshot?.taskBoard.counts?.in_progress ?? 0;
    const queued = counts?.todo ?? snapshot?.taskBoard.counts?.todo ?? 0;
    const blocked = counts?.blocked ?? snapshot?.taskBoard.counts?.blocked ?? 0;
    const done = counts?.done ?? snapshot?.taskBoard.counts?.done ?? 0;
    const dl = snapshot?.deadLetter.entries.length ?? 0;
    return `<div class="overview-counts" role="group" aria-label="Task overview counts">
    <button type="button" class="count-chip" data-filter="in_progress" aria-pressed="false" aria-label="Active: ${active}">▓ ${active} Active</button>
    <button type="button" class="count-chip" data-filter="todo" aria-pressed="false" aria-label="Queued: ${queued}">░ ${queued} Queued</button>
    <button type="button" class="count-chip ${blocked > 0 ? 'warn' : ''}" data-filter="blocked" aria-pressed="false" aria-label="Blocked: ${blocked}">▒ ${blocked} Blocked</button>
    <button type="button" class="count-chip ok" data-filter="done" aria-pressed="false" aria-label="Done: ${done}">█ ${done} Done</button>
    ${dl > 0 ? `<button type="button" class="count-chip bad" data-filter="dead-letter" aria-pressed="false" aria-label="Dead-letter: ${dl}">✗ ${dl} Dead</button>` : ''}
  </div>`;
}
function buildTaskSearch() {
    return `<div class="task-search-wrap">
    <input type="text" class="task-search" data-task-search placeholder="Search tasks…" aria-label="Search tasks by ID, title, status, or priority">
    <button type="button" class="task-search-clear" data-search-clear aria-label="Clear search">✕</button>
  </div>`;
}
function buildFilterTabs() {
    return `<div class="filter-tabs" role="tablist" aria-label="Task status filter">
    <button type="button" class="filter-tab" role="tab" data-filter="all" aria-pressed="true">All</button>
    <button type="button" class="filter-tab" role="tab" data-filter="in_progress" aria-pressed="false">Active</button>
    <button type="button" class="filter-tab" role="tab" data-filter="todo" aria-pressed="false">Queued</button>
    <button type="button" class="filter-tab" role="tab" data-filter="blocked" aria-pressed="false">Blocked</button>
    <button type="button" class="filter-tab" role="tab" data-filter="done" aria-pressed="false">Done</button>
  </div>`;
}
function buildSidebarTaskRow(task) {
    const glyph = htmlHelpers_1.STATUS_CHAR[task.status] ?? '?';
    const statusClass = task.status === 'done' ? 'done' : task.status === 'blocked' ? 'blocked' : '';
    const detailId = `sb-detail-${task.id}`;
    // Markers: current, blocker, children/deps
    let markers = '';
    if (task.isCurrent)
        markers += '<span class="sb-task-marker current" aria-label="Current task">▸</span>';
    if (task.blocker)
        markers += '<span class="sb-task-marker blocker" aria-label="Blocked">▒</span>';
    if (task.childIds.length > 0)
        markers += '<span class="sb-task-marker has-children" aria-label="Has subtasks">⊞</span>';
    if (task.dependsOn.length > 0 && !task.childIds.length)
        markers += '<span class="sb-task-marker" aria-label="Has dependencies">⊟</span>';
    return `<button type="button" class="sb-task-row ${statusClass}" data-task-id="${(0, htmlHelpers_1.esc)(task.id)}" data-task-status="${(0, htmlHelpers_1.esc)(task.status)}" data-task-priority="${(0, htmlHelpers_1.esc)(task.priority)}" data-task-blocker="${task.blocker ? (0, htmlHelpers_1.esc)(task.blocker) : ''}" aria-selected="${task.isCurrent ? 'true' : 'false'}" aria-expanded="false" aria-controls="${(0, htmlHelpers_1.esc)(detailId)}" tabindex="0">
    <span class="sb-task-glyph" aria-hidden="true">${glyph}</span>
    <span class="sb-task-id">${(0, htmlHelpers_1.esc)(task.id)}</span>
    <span class="sb-task-title">${(0, htmlHelpers_1.esc)(task.title)}</span>
    ${task.priority !== 'medium' ? `<span class="sb-task-priority">${(0, htmlHelpers_1.esc)(task.priority)}</span>` : ''}
    ${markers}
  </button>
  <div class="sb-task-detail" id="${(0, htmlHelpers_1.esc)(detailId)}" hidden>
    <dl>
      <dt>Status</dt><dd>${(0, htmlHelpers_1.esc)(task.status)}</dd>
      <dt>Priority</dt><dd>${(0, htmlHelpers_1.esc)(task.priority)}</dd>
      ${task.notes ? `<dt>Notes</dt><dd>${(0, htmlHelpers_1.esc)(task.notes)}</dd>` : ''}
      ${task.blocker ? `<dt>Blocker</dt><dd>${(0, htmlHelpers_1.esc)(task.blocker)}</dd>` : ''}
      ${task.validation ? `<dt>Validation</dt><dd>${(0, htmlHelpers_1.esc)(task.validation)}</dd>` : ''}
      ${task.parentId ? `<dt>Parent</dt><dd>${(0, htmlHelpers_1.esc)(task.parentId)}</dd>` : ''}
      ${task.childIds.length > 0 ? `<dt>Children</dt><dd>${task.childIds.map(htmlHelpers_1.esc).join(', ')}</dd>` : ''}
      ${task.dependsOn.length > 0 ? `<dt>Depends on</dt><dd>${task.dependsOn.map(htmlHelpers_1.esc).join(', ')}</dd>` : ''}
    </dl>
  </div>`;
}
function buildTaskList(state) {
    if (state.tasks.length === 0) {
        return `<div class="empty">No tasks yet</div>
      <div class="btn-grid" style="margin-top: 6px;">
        <button class="btn" data-command="ralphCodex.addTask"><span class="btn-label">Add Task</span><span class="btn-spinner"></span></button>
        <button class="btn" data-command="ralphCodex.seedTasksFromFeatureRequest"><span class="btn-label">Seed Tasks</span><span class="btn-spinner"></span></button>
      </div>`;
    }
    const rows = state.tasks.map((t) => buildSidebarTaskRow(t)).join('\n');
    return `<div class="sb-task-list" role="listbox" aria-label="Task list">${rows}</div>`;
}
function buildDeadLetterSection(state) {
    const snapshot = state.dashboardSnapshot;
    const entries = snapshot?.deadLetter.entries ?? [];
    if (entries.length === 0) {
        return `<div class="section-label">Dead-Letter</div>
      <div class="dl-positive-empty">✓ No tasks in dead-letter queue</div>`;
    }
    const rows = entries.slice(0, 5).map((e) => {
        const reason = e.diagnosticHistory.length > 0
            ? e.diagnosticHistory[e.diagnosticHistory.length - 1]?.category ?? 'unknown'
            : 'unknown';
        return `<div class="dl-entry">
      <div class="dl-entry-header">
        <span style="color:var(--bad);">✗</span>
        <span>${(0, htmlHelpers_1.esc)(e.taskId)}</span>
        <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${(0, htmlHelpers_1.esc)(e.taskTitle)}</span>
      </div>
      <div class="dl-entry-reason">${(0, htmlHelpers_1.esc)(reason)} · ${e.recoveryAttemptCount} attempts</div>
      <div class="dl-actions">
        <button class="btn" style="padding:3px 8px; font-size:10px;" data-command="ralphCodex.requeueDeadLetterTask"><span class="btn-label">Requeue</span></button>
        <button class="btn" style="padding:3px 8px; font-size:10px;" data-command="ralphCodex.openFailureDiagnosis"><span class="btn-label">Diagnose</span></button>
        <button class="btn" style="padding:3px 8px; font-size:10px;" data-command="ralphCodex.autoRecoverTask"><span class="btn-label">Auto-Recover</span></button>
      </div>
    </div>`;
    }).join('\n');
    return `<div class="section-label">Dead-Letter (${entries.length})</div>${rows}`;
}
function buildRecentOutputs(state) {
    const iters = state.recentIterations.slice(0, 5);
    if (iters.length === 0) {
        return `<div class="section-label">Recent Outputs</div>
      <div class="empty">No iterations recorded yet</div>`;
    }
    const rows = iters.map((iter) => (0, htmlHelpers_1.buildIterationRow)(iter)).join('\n');
    return `<div class="section-label">Recent Outputs</div>
    <div class="recent-outputs">${rows}</div>`;
}
function buildSeedForm(state) {
    const seedResult = buildSeedResult(state);
    return `<div class="seed-block">
      <textarea data-seed-request="sidebar" placeholder="Describe the epic…">${(0, htmlHelpers_1.esc)(state.taskSeeding.requestText)}</textarea>
      <div class="seed-validation" data-seed-validation></div>
      <div class="btn-grid" style="margin-top: 4px;">
        <button class="btn" data-seed-submit="sidebar"><span class="btn-label">Seed Tasks</span><span class="btn-spinner"></span></button>
        <button class="btn" data-command="ralphCodex.showTasks"><span class="btn-label">Open Tasks</span><span class="btn-spinner"></span></button>
      </div>
      ${seedResult}
    </div>`;
}
function buildSeedResult(state) {
    if (state.taskSeeding.phase === 'idle' || !state.taskSeeding.message)
        return '';
    const cls = state.taskSeeding.phase === 'success' ? 'success' : state.taskSeeding.phase === 'error' ? 'error' : '';
    let extra = '';
    if (state.taskSeeding.phase === 'success') {
        const count = state.taskSeeding.createdTaskCount;
        const path = state.taskSeeding.artifactPath;
        extra = `<div class="seed-success-actions">
      ${count !== null ? `<span style="font-size:10px; color:var(--ok);">Created ${count} task(s)</span>` : ''}
      ${path ? `<span style="font-size:10px; color:var(--dim); margin-left:auto;" title="${(0, htmlHelpers_1.esc)(path)}">${(0, htmlHelpers_1.esc)(path)}</span>` : ''}
    </div>
    <div class="seed-success-actions">
      <button class="btn" style="padding:3px 8px; font-size:10px;" data-command="ralphCodex.showTasks"><span class="btn-label">View Tasks</span></button>
      <button class="btn" style="padding:3px 8px; font-size:10px;" data-command="ralphCodex.runRalphLoop"><span class="btn-label">Run Loop</span></button>
    </div>`;
    }
    return `<div class="seed-result ${cls}">${(0, htmlHelpers_1.esc)(state.taskSeeding.message)}${extra}</div>`;
}
// ---------------------------------------------------------------------------
// Current task card (always visible, moved from live snapshot to true card)
// ---------------------------------------------------------------------------
function buildCurrentTaskCard(state) {
    const currentTask = state.tasks.find((t) => t.isCurrent) ?? state.tasks[0] ?? null;
    const snapshot = state.dashboardSnapshot;
    const taskBoard = snapshot?.taskBoard ?? null;
    const failureEntry = snapshot?.failureFeed.entries[0] ?? null;
    const deadLetterEntry = snapshot?.deadLetter.entries[0] ?? null;
    const agentRow = snapshot?.agentGrid.rows[0] ?? null;
    const id = currentTask?.id ?? taskBoard?.selectedTaskId ?? null;
    const title = currentTask?.title ?? taskBoard?.selectedTaskTitle ?? null;
    return `<div class="current-task-card">
    <div class="current-task-kicker">Live Snapshot</div>
    ${id ? `<div class="current-task-id">Selected ${(0, htmlHelpers_1.esc)(id)}</div>` : ''}
    ${title ? `<div class="current-task-title">${(0, htmlHelpers_1.esc)(title)}</div>` : ''}
    ${taskBoard ? `<div class="snapshot-chip-row">
      <span class="pill">Blocked ${taskBoard.counts?.blocked ?? 0}</span>
      <span class="pill">Dead-Letter ${taskBoard.deadLetterCount}</span>
      <span class="pill">Next ${taskBoard.nextIteration}</span>
    </div>` : ''}
    ${failureEntry ? `<div class="current-task-failure">⚠ ${(0, htmlHelpers_1.esc)(failureEntry.category)} · ${(0, htmlHelpers_1.esc)(failureEntry.confidence)}</div>` : ''}
    ${deadLetterEntry ? `<div class="current-task-meta">Dead-letter: ${(0, htmlHelpers_1.esc)(deadLetterEntry.taskTitle)}</div>` : ''}
    ${agentRow ? `<div class="current-task-meta">${(0, htmlHelpers_1.esc)(agentRow.agentId)}</div>` : ''}
    ${!id && !taskBoard ? `<div class="current-task-empty">No task selected</div>
      <button class="btn" style="margin-top:6px; width:100%;" data-command="ralphCodex.addTask"><span class="btn-label">Add Task</span><span class="btn-spinner"></span></button>` : ''}
  </div>`;
}
// ---------------------------------------------------------------------------
// Sidebar HTML — triage surface with mode switcher + task list + filters
// ---------------------------------------------------------------------------
function buildDashboardHtml(state, nonce) {
    const stateLabel = htmlHelpers_1.LOOP_STATE_LABEL[state.loopState];
    const isRunning = state.loopState === 'running';
    // Phase indicator for running lane
    let phaseIndicator = '';
    if (state.agentLanes.length > 0) {
        const lines = state.agentLanes
            .filter((lane) => lane.phase !== null && lane.iteration !== null)
            .map((lane) => {
            const prefix = state.agentLanes.length > 1 ? `${lane.agentId} · ` : '';
            return `iter ${lane.iteration} · ${prefix}${lane.phase}`;
        });
        if (lines.length > 0) {
            phaseIndicator = lines.map((l) => `<div class="phase-indicator">${l}</div>`).join('');
        }
    }
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style nonce="${nonce}">${buildSidebarCss()}</style>
</head>
<body data-mode="simple">

  <!-- Header: workspace + loop state -->
  <div class="header">
    <div class="header-title">Ralphdex</div>
    <div class="header-state">
      <span class="state-dot ${isRunning ? 'running' : state.loopState}" aria-label="Loop state: ${(0, htmlHelpers_1.esc)(stateLabel)}"></span>
      ${(0, htmlHelpers_1.esc)(state.workspaceName)} · ${(0, htmlHelpers_1.esc)(state.agentRole)}
    </div>
  </div>

  ${phaseIndicator}

  <!-- Alerts banner (blocked/dead-letter) — always visible above fold -->
  ${buildAlertsBanner(state)}

  <!-- Mode switcher -->
  <div class="mode-switcher">
    <div class="mode-switcher-label">Mode</div>
    <div class="mode-switcher-pills">
      <button class="mode-pill active" data-mode="simple">Simple</button>
      <button class="mode-pill" data-mode="advanced">Advanced</button>
    </div>
  </div>

  <!-- Progress bar (shown in advanced mode) -->
  <div class="mode-section mode-advanced">
    ${(0, htmlHelpers_1.buildProgressBar)(state.taskCounts)}
  </div>

  <!-- Simple mode: start/status at a glance + overview counts + task list -->
  <div class="mode-section mode-simple">
    <div class="simple-status">
      ${isRunning
        ? `<div class="simple-status-text">Ralph is working — ${(0, htmlHelpers_1.esc)(stateLabel)}</div>`
        : `<div class="simple-status-text">Ready to start</div>`}
    </div>
    <div class="btn-grid" style="margin-top: 8px;">
      ${isRunning
        ? `<button class="btn btn-danger" data-command="ralphCodex.stopLoop" style="grid-column: 1/-1;"><span class="btn-label">■ Stop Loop</span><span class="btn-spinner"></span></button>`
        : `<button class="btn btn-primary" data-command="ralphCodex.runRalphLoop" style="grid-column: 1/-1;"><span class="btn-label">▸ Start Loop</span><span class="btn-spinner"></span></button>`}
      <button class="btn" data-command="ralphCodex.openPrdWizard" ${!state.prdExists ? '' : 'style="display:none;"'}><span class="btn-label">Open PRD wizard</span><span class="btn-spinner"></span></button>
      <button class="btn" data-command="ralphCodex.addTask"><span class="btn-label">Add Task</span><span class="btn-spinner"></span></button>
    </div>

    <!-- Overview counts (simple mode) -->
    ${buildOverviewCounts(state)}

    <!-- Task list in simple mode -->
    ${buildTaskSearch()}
    ${buildFilterTabs()}
    ${buildTaskList(state)}
  </div>

  <!-- Tab nav (shown in advanced mode) -->
  <div class="mode-section mode-advanced">
    <div class="sidebar-tabs">
      <button class="sidebar-tab active" data-sidebar-tab="triage">Triage</button>
      <button class="sidebar-tab" data-sidebar-tab="run">Run</button>
      <button class="sidebar-tab" data-sidebar-tab="agents">Agents</button>
      <button class="sidebar-tab" data-sidebar-tab="seed">Seed</button>
    </div>
  </div>

  <!-- Triage tab panel (advanced) -->
  <div class="sidebar-tab-panel active mode-section mode-advanced" data-sidebar-panel="triage">
    ${buildOverviewCounts(state)}
    ${buildTaskSearch()}
    ${buildFilterTabs()}
    ${buildTaskList(state)}

    ${buildDeadLetterSection(state)}
    ${buildRecentOutputs(state)}
  </div>

  <!-- Run tab panel -->
  <div class="sidebar-tab-panel mode-section mode-advanced" data-sidebar-panel="run">
    <div class="section-label">Loop Controls</div>
    <div class="btn-grid">
      <button class="btn" data-command="ralphCodex.runRalphLoop"><span class="btn-label">▸ Run Loop</span><span class="btn-spinner"></span></button>
      <button class="btn" data-command="ralphCodex.runMultiAgentLoop"><span class="btn-label">▸ Multi</span><span class="btn-spinner"></span></button>
      <button class="btn" data-command="ralphCodex.runRalphIteration"><span class="btn-label">▸ Iteration</span><span class="btn-spinner"></span></button>
      <button class="btn" data-command="ralphCodex.generatePrompt"><span class="btn-label">⎙ Prompt</span><span class="btn-spinner"></span></button>
    </div>

    <div class="section-label" style="margin-top: 10px;">Quick Actions</div>
    <div class="quick-actions">
      <button class="quick-action" data-command="ralphCodex.addTask">
        <span>Add Task</span><span class="quick-shortcut">+</span>
      </button>
      <button class="quick-action" data-command="ralphCodex.showRalphStatus">
        <span>Show Status</span><span class="quick-shortcut">◫</span>
      </button>
      <button class="quick-action" data-command="ralphCodex.showTasks">
        <span>Open Tasks</span><span class="quick-shortcut">⌘T</span>
      </button>
      <button class="quick-action" data-command="ralphCodex.openLatestRalphSummary">
        <span>Open Summary</span><span class="quick-shortcut">◫</span>
      </button>
      <button class="quick-action" data-command="ralphCodex.openLatestPipelineRun">
        <span>Latest Run</span><span class="quick-shortcut">◫</span>
      </button>
      <button class="quick-action" data-command="ralphCodex.openSettings">
        <span>Settings</span><span class="quick-shortcut">⌘,</span>
      </button>
    </div>

    <!-- Advanced-only actions -->
    <div class="mode-section mode-advanced">
      <div class="section-label" style="margin-top: 10px;">Advanced</div>
      <div class="btn-grid">
        <button class="btn" data-command="ralphCodex.openPrdWizard"><span class="btn-label">PRD Wizard</span><span class="btn-spinner"></span></button>
        <button class="btn" data-command="ralphCodex.openLatestProvenanceBundle"><span class="btn-label">Provenance</span><span class="btn-spinner"></span></button>
      </div>
    </div>
  </div>

  <!-- Agents tab panel -->
  <div class="sidebar-tab-panel mode-section mode-advanced" data-sidebar-panel="agents">
    <div class="section-label">Agent Roles</div>
    <div class="btn-grid">
      <button class="btn" data-command="ralphCodex.runRalphLoop"><span class="btn-label">◆ Build</span><span class="btn-spinner"></span></button>
      <button class="btn" data-command="ralphCodex.runReviewAgent"><span class="btn-label">◇ Review</span><span class="btn-spinner"></span></button>
      <button class="btn" data-command="ralphCodex.runWatchdogAgent"><span class="btn-label">⬡ Watch</span><span class="btn-spinner"></span></button>
      <button class="btn" data-command="ralphCodex.runScmAgent"><span class="btn-label">⎔ SCM</span><span class="btn-spinner"></span></button>
    </div>
  </div>

  <!-- Seed tab panel -->
  <div class="sidebar-tab-panel mode-section mode-advanced" data-sidebar-panel="seed">
    ${buildSeedForm(state)}
  </div>

  <!-- Current task card (always visible) -->
  ${buildCurrentTaskCard(state)}

  <button class="open-dashboard" data-command="ralphCodex.openDashboard">Open Dashboard</button>

  <script nonce="${nonce}">
    (function() {
      var vscode = acquireVsCodeApi();
      var ackTimeouts = new WeakMap();

      // --- Mode switcher ---
      var savedMode = (function() {
        try { return localStorage.getItem('ralph-sidebar-mode') || 'simple'; } catch(e) { return 'simple'; }
      })();
      setMode(savedMode);

      document.querySelectorAll('.mode-pill').forEach(function(pill) {
        pill.addEventListener('click', function() {
          setMode(pill.getAttribute('data-mode'));
        });
      });

      function setMode(mode) {
        document.body.setAttribute('data-mode', mode);
        document.querySelectorAll('.mode-pill').forEach(function(p) {
          p.classList.toggle('active', p.getAttribute('data-mode') === mode);
        });
        try { localStorage.setItem('ralph-sidebar-mode', mode); } catch(e) {}
      }

      // --- Tab nav ---
      document.querySelectorAll('.sidebar-tab').forEach(function(tab) {
        tab.addEventListener('click', function() {
          var target = tab.getAttribute('data-sidebar-tab');
          document.querySelectorAll('.sidebar-tab').forEach(function(t) { t.classList.remove('active'); });
          document.querySelectorAll('.sidebar-tab-panel').forEach(function(p) { p.classList.remove('active'); });
          tab.classList.add('active');
          var panel = document.querySelector('[data-sidebar-panel="' + target + '"]');
          if (panel) panel.classList.add('active');
        });
      });

      // --- Task filtering and search ---
      var currentFilter = 'all';
      var currentSearch = '';

      function applyFilters() {
        var rows = document.querySelectorAll('.sb-task-row');
        var details = {};
        document.querySelectorAll('.sb-task-detail').forEach(function(d) { details[d.id] = d; });

        rows.forEach(function(row) {
          var status = row.getAttribute('data-task-status');
          var id = row.getAttribute('data-task-id') || '';
          var title = row.querySelector('.sb-task-title');
          var titleText = title ? title.textContent : '';
          var priority = row.getAttribute('data-task-priority') || '';
          var blocker = row.getAttribute('data-task-blocker') || '';

          var matchesFilter = currentFilter === 'all' || status === currentFilter;
          var matchesSearch = !currentSearch ||
            id.toLowerCase().indexOf(currentSearch) !== -1 ||
            titleText.toLowerCase().indexOf(currentSearch) !== -1 ||
            status.toLowerCase().indexOf(currentSearch) !== -1 ||
            priority.toLowerCase().indexOf(currentSearch) !== -1 ||
            blocker.toLowerCase().indexOf(currentSearch) !== -1;

          var visible = matchesFilter && matchesSearch;
          row.style.display = visible ? '' : 'none';

          var detailEl = details['sb-detail-' + id];
          if (detailEl && !visible) {
            detailEl.hidden = true;
            row.setAttribute('aria-expanded', 'false');
          }
        });

        // Save filter state
        try { localStorage.setItem('ralph-sidebar-filter', currentFilter); } catch(e) {}
        try { localStorage.setItem('ralph-sidebar-search', currentSearch); } catch(e) {}
      }

      // Filter tabs
      document.querySelectorAll('.filter-tab').forEach(function(tab) {
        tab.addEventListener('click', function() {
          currentFilter = tab.getAttribute('data-filter');
          document.querySelectorAll('.filter-tab').forEach(function(t) { t.setAttribute('aria-pressed', 'false'); });
          tab.setAttribute('aria-pressed', 'true');
          // Sync count chips
          document.querySelectorAll('.count-chip').forEach(function(c) {
            c.setAttribute('aria-pressed', c.getAttribute('data-filter') === currentFilter ? 'true' : 'false');
          });
          applyFilters();
        });
      });

      // Count chips also set filter
      document.querySelectorAll('.count-chip').forEach(function(chip) {
        chip.addEventListener('click', function() {
          currentFilter = chip.getAttribute('data-filter');
          document.querySelectorAll('.filter-tab').forEach(function(t) {
            t.setAttribute('aria-pressed', t.getAttribute('data-filter') === currentFilter ? 'true' : 'false');
          });
          document.querySelectorAll('.count-chip').forEach(function(c) {
            c.setAttribute('aria-pressed', c.getAttribute('data-filter') === currentFilter ? 'true' : 'false');
          });
          applyFilters();
        });
      });

      // Search input
      document.querySelectorAll('[data-task-search]').forEach(function(input) {
        input.addEventListener('input', function() {
          currentSearch = input.value.trim().toLowerCase();
          input.closest('.task-search-wrap').classList.toggle('has-value', input.value.length > 0);
          applyFilters();
        });
      });

      // Search clear
      document.querySelectorAll('[data-search-clear]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var wrap = btn.closest('.task-search-wrap');
          var input = wrap.querySelector('[data-task-search]');
          input.value = '';
          currentSearch = '';
          wrap.classList.remove('has-value');
          applyFilters();
        });
      });

      // Restore filter/search state
      try {
        var savedFilter = localStorage.getItem('ralph-sidebar-filter');
        if (savedFilter) {
          currentFilter = savedFilter;
          document.querySelectorAll('.filter-tab').forEach(function(t) {
            t.setAttribute('aria-pressed', t.getAttribute('data-filter') === currentFilter ? 'true' : 'false');
          });
        }
        var savedSearch = localStorage.getItem('ralph-sidebar-search');
        if (savedSearch) {
          currentSearch = savedSearch;
          document.querySelectorAll('[data-task-search]').forEach(function(input) {
            input.value = savedSearch;
            input.closest('.task-search-wrap').classList.toggle('has-value', savedSearch.length > 0);
          });
          applyFilters();
        }
      } catch(e) {}

      // --- Task row expand/collapse ---
      document.addEventListener('click', function(e) {
        var taskRow = e.target.closest('.sb-task-row');
        if (taskRow) {
          var detailId = taskRow.getAttribute('aria-controls');
          var detail = document.getElementById(detailId);
          if (detail) {
            var expanded = taskRow.getAttribute('aria-expanded') === 'true';
            taskRow.setAttribute('aria-expanded', expanded ? 'false' : 'true');
            detail.hidden = expanded;
            // Update selection
            document.querySelectorAll('.sb-task-row').forEach(function(r) { r.setAttribute('aria-selected', 'false'); });
            taskRow.setAttribute('aria-selected', 'true');
          }
          return;
        }

        // Iteration row open artifact
        var iterRow = e.target.closest('.iter-row');
        if (iterRow) {
          var artifactDir = iterRow.getAttribute('data-artifact-dir');
          if (artifactDir) {
            vscode.postMessage({ type: 'open-iteration-artifact', artifactDir: artifactDir });
          }
          return;
        }
      });

      // Keyboard navigation for task rows
      document.addEventListener('keydown', function(e) {
        var focused = document.activeElement;
        if (!focused || !focused.classList.contains('sb-task-row')) return;

        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          focused.click();
          return;
        }

        var rows = Array.from(document.querySelectorAll('.sb-task-row')).filter(function(r) { return r.style.display !== 'none'; });
        var idx = rows.indexOf(focused);
        if (idx === -1) return;

        if (e.key === 'ArrowDown' && idx < rows.length - 1) {
          e.preventDefault();
          rows[idx + 1].focus();
        } else if (e.key === 'ArrowUp' && idx > 0) {
          e.preventDefault();
          rows[idx - 1].focus();
        }
      });

      // --- Seed form validation ---
      document.querySelectorAll('[data-seed-request]').forEach(function(textarea) {
        textarea.addEventListener('input', function() {
          var validation = textarea.closest('.seed-block').querySelector('[data-seed-validation]');
          if (!validation) return;
          var val = textarea.value;
          if (val.length === 0) {
            validation.textContent = '';
          } else if (val.trim().length === 0) {
            validation.textContent = 'Input cannot be whitespace only';
          } else if (val.trim().length < 3) {
            validation.textContent = 'Description is too short';
          } else {
            validation.textContent = '';
          }
        });
      });

      // --- Command buttons ---
      function runCommand(el) {
        var cmd = el.getAttribute('data-command');
        if (!cmd || el.disabled) return;
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

        // Client-side validation
        var validation = el.closest('.seed-block').querySelector('[data-seed-validation]');
        if (requestText.trim().length === 0) {
          if (validation) validation.textContent = requestText.length === 0 ? 'Please enter a description' : 'Input cannot be whitespace only';
          return;
        }
        if (requestText.trim().length < 3) {
          if (validation) validation.textContent = 'Description is too short';
          return;
        }
        if (validation) validation.textContent = '';

        el.classList.add('loading');
        el.disabled = true;
        vscode.postMessage({ type: 'seed-tasks', requestText: requestText, source: source });
        var t = setTimeout(function() { resetButton(el); }, 15000);
        ackTimeouts.set(el, t);
      }

      document.addEventListener('click', function(e) {
        var seedBtn = e.target.closest('[data-seed-submit]');
        if (seedBtn) { runSeedTasks(seedBtn); return; }
        var btn = e.target.closest('[data-command]');
        if (btn) { runCommand(btn); }
      });

      window.addEventListener('message', function(event) {
        var msg = event.data;
        if (msg.type === 'phase') {
          var indicators = document.querySelectorAll('.phase-indicator');
          if (indicators.length === 1) {
            indicators[0].textContent = 'iter ' + msg.iteration + ' \u00b7 ' + msg.phase;
          }
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
//# sourceMappingURL=sidebarHtml.js.map