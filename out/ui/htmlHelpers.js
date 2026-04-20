"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PHASE_LABELS = exports.LOOP_STATE_LABEL = exports.CLASSIFICATION_CHAR = exports.STATUS_CHAR = void 0;
exports.esc = esc;
exports.buildProgressBar = buildProgressBar;
exports.buildTaskRow = buildTaskRow;
exports.buildPhaseTracker = buildPhaseTracker;
exports.buildIterationRow = buildIterationRow;
exports.buildAgentLanes = buildAgentLanes;
exports.buildDiagnostics = buildDiagnostics;
exports.buildBaseCss = buildBaseCss;
// ---------------------------------------------------------------------------
// Text escaping — prevent XSS from task titles/notes
// ---------------------------------------------------------------------------
function esc(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
// ---------------------------------------------------------------------------
// Status glyphs
// ---------------------------------------------------------------------------
exports.STATUS_CHAR = {
    todo: '░',
    in_progress: '▓',
    done: '█',
    blocked: '▒'
};
exports.CLASSIFICATION_CHAR = {
    complete: '█',
    partial_progress: '▓',
    no_progress: '░',
    blocked: '▒',
    failed: '✗',
    needs_human_review: '?'
};
const CLASSIFICATION_COLOR = {
    complete: 'var(--ok)',
    partial_progress: 'var(--accent)',
    no_progress: 'var(--dim)',
    blocked: 'var(--warn)',
    failed: 'var(--bad)',
    needs_human_review: 'var(--cyan)',
};
function getRoleBorderColor(agentId) {
    const lower = agentId.toLowerCase();
    if (lower.includes('reviewer'))
        return 'var(--ok)';
    if (lower.includes('watchdog'))
        return 'var(--warn)';
    if (lower.includes('scm'))
        return 'var(--cyan)';
    return 'var(--accent)';
}
exports.LOOP_STATE_LABEL = {
    idle: '● idle',
    running: '▸ running',
    stopped: '■ stopped'
};
exports.PHASE_LABELS = [
    'inspect', 'select', 'prompt', 'execute', 'verify', 'classify', 'persist'
];
// ---------------------------------------------------------------------------
// Shared section builders
// ---------------------------------------------------------------------------
function buildProgressBar(counts) {
    if (!counts) {
        return '<div class="empty">No task data</div>';
    }
    const total = counts.todo + counts.in_progress + counts.blocked + counts.done;
    if (total === 0) {
        return '<div class="empty">No tasks</div>';
    }
    const pct = Math.round((counts.done / total) * 100);
    const barLen = 16;
    const filled = Math.round((counts.done / total) * barLen);
    const inProgress = Math.round((counts.in_progress / total) * barLen);
    const bar = '█'.repeat(filled) + '▓'.repeat(inProgress) + '░'.repeat(Math.max(0, barLen - filled - inProgress));
    return `<div class="progress-bar">
    <span class="progress-bar-track">${bar}</span>
    <span class="progress-pct">${counts.done}/${total} done · ${pct}%</span>
  </div>`;
}
function buildTaskRow(task, isRunning) {
    const glyph = exports.STATUS_CHAR[task.status] ?? '?';
    const statusClass = task.status === 'done' ? 'done' : task.status === 'blocked' ? 'blocked' : '';
    const currentClass = task.isCurrent ? (isRunning ? 'current running' : 'current') : '';
    const check = task.status === 'done' ? '✓' : '';
    const detailId = `detail-${task.id}`;
    return `<button type="button" class="task-row ${statusClass} ${currentClass}" data-task-id="${esc(task.id)}" aria-expanded="false" aria-controls="${esc(detailId)}">
    <span class="task-glyph">${glyph}</span>
    <span class="task-id">${esc(task.id)}</span>
    <span class="task-title">${esc(task.title)}</span>
    <span class="task-check">${check}</span>
  </button>
  <div class="task-detail" id="${esc(detailId)}" hidden>
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
function buildPhaseTracker(currentPhase, currentIteration) {
    if (currentPhase === null || currentIteration === null) {
        return '';
    }
    const activeIdx = exports.PHASE_LABELS.indexOf(currentPhase);
    const steps = exports.PHASE_LABELS.map((label, i) => {
        const isDone = i < activeIdx;
        const isActive = i === activeIdx;
        const cls = isDone ? 'done' : isActive ? 'active' : '';
        const prefix = isDone
            ? '<span class="phase-check">✓</span>'
            : isActive
                ? '<span class="phase-pulse"></span>'
                : '';
        const sep = i < exports.PHASE_LABELS.length - 1 ? '<span class="phase-sep" aria-hidden="true">—</span>' : '';
        return `<span class="phase-step ${cls}">${prefix}${label}</span>${sep}`;
    }).join('');
    return `<div class="section-label">Iteration ${currentIteration}</div>
    <div class="phase-tracker">${steps}</div>`;
}
function buildIterationRow(iter) {
    const taskLabel = iter.taskId ?? '—';
    const agentLabel = iter.agentId ? `<span class="iter-agent">${esc(iter.agentId)}</span>` : '<span class="iter-agent">—</span>';
    const dotColor = CLASSIFICATION_COLOR[iter.classification] ?? 'var(--dim)';
    return `<button type="button" class="iter-row" data-artifact-dir="${esc(iter.artifactDir)}" title="Open iteration artifact">
    <span class="iter-num">#${iter.iteration}</span>
    ${agentLabel}
    <span class="iter-task">${esc(taskLabel)}</span>
    <span class="iter-class">
      <span class="iter-class-dot" style="background:${dotColor};"></span>
      ${esc(iter.classification.replace(/_/g, ' '))}
    </span>
    <span class="iter-cost">—</span>
  </button>`;
}
function buildAgentLanes(lanes) {
    if (lanes.length === 0) {
        return '';
    }
    if (lanes.length === 1) {
        const lane = lanes[0];
        return `
      ${buildPhaseTracker(lane.phase, lane.iteration)}
      ${lane.message ? `<div class="agent-message">${esc(lane.message)}</div>` : ''}
    `;
    }
    return lanes.map((lane) => {
        const roleColor = getRoleBorderColor(lane.agentId);
        return `<div class="agent-lane" data-agent-id="${esc(lane.agentId)}" style="border-left: 3px solid ${roleColor}; padding-left: 10px; margin-left: 0;">
      <div style="display:flex; justify-content:space-between; align-items:center; gap: 8px;">
        <span class="agent-lane-id" style="color:${roleColor};">${esc(lane.agentId)}</span>
        ${buildPhaseTracker(lane.phase, lane.iteration)}
      </div>
      ${lane.message ? `<div class="agent-message-block">${esc(lane.message)}</div>` : ''}
    </div>`;
    }).join('\n');
}
function buildDiagnostics(state) {
    if (state.preflightReady && state.diagnostics.length === 0) {
        return '<div class="diag-ok">✓ ready</div>';
    }
    if (state.diagnostics.length === 0) {
        return `<div class="diag-item warning">${esc(state.preflightSummary)}</div>`;
    }
    return state.diagnostics
        .slice(0, 5)
        .map((d) => `<div class="diag-item ${esc(d.severity)}">${esc(d.severity)} · ${esc(d.message)}</div>`)
        .join('\n');
}
// ---------------------------------------------------------------------------
// Shared base CSS
// ---------------------------------------------------------------------------
function buildBaseCss() {
    return `
/* Geist Sans and Mono — Nonce-safe inline stack fallback below if @import is blocked by CSP */
@import url("https://cdn.jsdelivr.net/npm/geist@1.3.0/dist/fonts/geist-sans/style.css");
@import url("https://cdn.jsdelivr.net/npm/geist@1.3.0/dist/fonts/geist-mono/style.css");

:root {
  /* UXrefresh Design Tokens */
  --accent: #f5b041;
  --ok: #5bd69c;
  --warn: #f5a14d;
  --bad: #eb5e5e;
  --cyan: #6fc3df;
  --surface: #1e1e22;
  --surface-2: #2a2a2e;
  --border: rgba(255, 255, 255, 0.08);
  --fg: var(--vscode-foreground, #cccccc);
  --dim: color-mix(in srgb, var(--fg) 55%, transparent);
  --font-ui: "Geist", var(--vscode-font-family), "Inter", "Outfit", "Segoe UI", sans-serif;
  --font-mono: "Geist Mono", var(--vscode-editor-font-family), "Berkeley Mono", "Cascadia Code", "Courier New", monospace;

  /* Glass tokens */
  --glass-bg: rgba(30, 30, 35, 0.35);
  --glass-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3);

  /* Legacy Aliases (preserved for compatibility) */
  --ralph-amber: var(--accent);
  --ralph-green: var(--ok);
  --ralph-orange: var(--warn);
  --ralph-red: var(--bad);
  --ralph-cyan: var(--cyan);
  --ralph-dim: var(--dim);
  --ralph-font: var(--font-ui);
  --ralph-border: var(--border);
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: var(--font-ui);
  background: var(--vscode-editor-background);
  color: var(--fg);
  line-height: 1.4;
}

/* Base Components */
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-radius: 12px;
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

.status-pill, .pill {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--dim);
  transition: all 0.2s ease;
  white-space: nowrap;
}

.status-pill.ok, .pill.ok { border-color: var(--ok); color: var(--ok); background: color-mix(in srgb, var(--ok) 8%, var(--surface-2)); }
.status-pill.warn, .pill.warn { border-color: var(--warn); color: var(--warn); background: color-mix(in srgb, var(--warn) 8%, var(--surface-2)); }
.status-pill.bad, .pill.bad { border-color: var(--bad); color: var(--bad); background: color-mix(in srgb, var(--bad) 8%, var(--surface-2)); }
.status-pill.cyan, .pill.cyan { border-color: var(--cyan); color: var(--cyan); background: color-mix(in srgb, var(--cyan) 8%, var(--surface-2)); }
.status-pill.active, .pill.active { border-color: var(--accent); color: var(--accent); background: color-mix(in srgb, var(--accent) 8%, var(--surface-2)); }

.btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 14px;
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 600;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--fg);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 6px rgba(0,0,0,0.15);
}

.btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent) 12%, var(--surface-2));
  border-color: var(--accent);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(245, 176, 65, 0.25);
}

.btn:active:not(:disabled) { transform: translateY(0); }

.btn:disabled {
  opacity: 0.4;
  cursor: default;
  transform: none;
  box-shadow: none;
}

.btn.primary {
  background: var(--accent);
  color: #1e1e22;
  border-color: var(--accent);
}

.btn.primary:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent) 85%, white);
}

/* Layout Utilities */
.header {
  background: var(--glass-bg);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 14px 18px;
  margin-bottom: 16px;
  text-align: center;
  box-shadow: var(--glass-shadow);
}

.header-title {
  font-size: 16px;
  font-weight: 800;
  letter-spacing: 4px;
  text-transform: uppercase;
  background: linear-gradient(135deg, var(--accent), var(--cyan));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.header-state {
  font-size: 11px;
  font-weight: 500;
  color: var(--dim);
  margin-top: 4px;
  letter-spacing: 0.5px;
}

.section-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--dim);
  margin: 16px 0 6px 0;
}

.section-rule {
  border: none;
  border-top: 1px solid var(--border);
  margin-bottom: 8px;
}

/* Specific UI Rows */
.task-row {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 8px 12px;
  margin-bottom: 6px;
  cursor: pointer;
  border-radius: 10px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  color: inherit;
  text-align: left;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.task-row:hover {
  background: color-mix(in srgb, var(--accent) 5%, var(--surface-2));
  border-color: color-mix(in srgb, var(--accent) 30%, var(--border));
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.task-row.current {
  background: color-mix(in srgb, var(--accent) 10%, var(--surface-2));
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
}

@keyframes pulse-glass {
  0%, 100% { box-shadow: 0 0 0 0 rgba(245, 176, 65, 0); }
  50% { box-shadow: 0 0 12px 2px rgba(245, 176, 65, 0.2); }
}

.task-row.current.running {
  animation: pulse-glass 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  border-color: var(--accent);
}

.task-row.done { 
  color: var(--dim);
  opacity: 0.8;
}

.task-row.blocked { 
  color: var(--warn); 
  border-color: color-mix(in srgb, var(--warn) 30%, var(--border));
}

.task-glyph {
  width: 20px;
  flex-shrink: 0;
  text-align: center;
  font-family: var(--font-mono);
}

.task-id {
  width: 70px;
  flex-shrink: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--accent);
}

.task-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  padding-left: 4px;
}

.task-check {
  width: 20px;
  flex-shrink: 0;
  text-align: center;
  color: var(--ok);
  font-weight: bold;
}

.task-detail {
  padding: 6px 12px 10px 32px;
  font-size: 11px;
  color: var(--dim);
  border-left: 2px solid var(--border);
  margin-bottom: 8px;
  background: rgba(0, 0, 0, 0.1);
  border-radius: 0 0 8px 8px;
  margin-top: -6px;
}

.task-detail dt { font-weight: 700; color: var(--fg); margin-top: 4px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; }
.task-detail dd { margin-left: 0; margin-bottom: 6px; line-height: 1.4; }

.btn-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  margin-bottom: 6px;
}

.iter-row {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 4px 8px;
  font-size: 11px;
  cursor: pointer;
  transition: background 0.15s ease;
  background: transparent;
  color: inherit;
  border: none;
  text-align: left;
  border-radius: 4px;
}

.iter-row:hover {
  background: rgba(255, 255, 255, 0.05);
}

.iter-num { width: 32px; flex-shrink: 0; color: var(--dim); font-family: var(--font-mono); }
.iter-agent { width: 80px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10px; color: var(--accent); font-weight: 600; }
.iter-tier { width: 70px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10px; color: var(--ok); text-align: right; margin-right: 8px; font-weight: 600; font-family: var(--font-mono); }
.iter-task { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.iter-class { display: inline-flex; align-items: center; gap: 5px; flex: 1; font-size: 10px; color: var(--dim); font-weight: 500; overflow: hidden; }

.agent-lane {
  margin-bottom: 10px;
}

.agent-lane-id {
  display: inline-block;
  font-size: 10px;
  color: var(--accent);
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: uppercase;
  width: 90px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
  margin-right: 6px;
}

.agent-message, .agent-message-block {
  font-size: 11px;
  color: var(--dim);
  font-family: var(--font-ui);
  background: rgba(0, 0, 0, 0.25);
  border-left: 3px solid var(--accent);
  padding: 6px 10px;
  margin-top: 6px;
  border-radius: 0 6px 6px 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.phase-tracker {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  margin-bottom: 4px;
  flex-wrap: wrap;
  vertical-align: middle;
}

.phase-step {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--dim);
  transition: all 0.2s ease;
  font-weight: 400;
  letter-spacing: 0.3px;
  text-transform: lowercase;
}

.phase-step.active {
  border-color: color-mix(in srgb, var(--accent) 50%, transparent);
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  font-weight: 600;
}

.phase-step.done {
  border-color: var(--border);
  color: var(--fg);
  background: var(--surface-2);
}

.phase-check {
  font-size: 9px;
  opacity: 0.7;
}

@keyframes ralph-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.phase-pulse {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  animation: ralph-blink 1.1s ease-in-out infinite;
  flex-shrink: 0;
}

.phase-sep {
  color: var(--border);
  font-size: 9px;
  user-select: none;
  flex-shrink: 0;
}

.iter-class-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
  vertical-align: middle;
}

.iter-cost {
  width: 52px;
  flex-shrink: 0;
  text-align: right;
  font-size: 10px;
  color: var(--dim);
  font-family: var(--font-mono);
}

.diag-ok { color: var(--ok); font-size: 11px; font-weight: 600; }
.diag-item { font-size: 11px; margin: 4px 0; padding: 2px 0; }
.diag-item.warning { color: var(--warn); }
.diag-item.error { color: var(--bad); }
.diag-item.info { color: var(--dim); }

.empty {
  color: var(--dim);
  font-size: 11px;
  font-style: italic;
  padding: 8px;
  text-align: center;
}

.task-row:focus-visible,
.iter-row:focus-visible,
.btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
`;
}
//# sourceMappingURL=htmlHelpers.js.map