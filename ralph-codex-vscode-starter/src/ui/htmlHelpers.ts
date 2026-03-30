import type { RalphTaskCounts } from '../ralph/types';
import type {
  RalphDashboardIteration,
  RalphDashboardState,
  RalphDashboardTask,
  RalphIterationPhase,
  RalphUiLoopState
} from './uiTypes';

// ---------------------------------------------------------------------------
// Text escaping — prevent XSS from task titles/notes
// ---------------------------------------------------------------------------

export function esc(text: string): string {
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

export const STATUS_CHAR: Record<string, string> = {
  todo: '░',
  in_progress: '▓',
  done: '█',
  blocked: '▒'
};

export const CLASSIFICATION_CHAR: Record<string, string> = {
  complete: '█',
  partial_progress: '▓',
  no_progress: '░',
  blocked: '▒',
  failed: '✗',
  needs_human_review: '?'
};

export const LOOP_STATE_LABEL: Record<RalphUiLoopState, string> = {
  idle: '● idle',
  running: '▸ running',
  stopped: '■ stopped'
};

export const PHASE_LABELS: RalphIterationPhase[] = [
  'inspect', 'select', 'prompt', 'execute', 'verify', 'classify', 'persist'
];

// ---------------------------------------------------------------------------
// Shared section builders
// ---------------------------------------------------------------------------

export function buildProgressBar(counts: RalphTaskCounts | null): string {
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

export function buildTaskRow(task: RalphDashboardTask, isRunning: boolean): string {
  const glyph = STATUS_CHAR[task.status] ?? '?';
  const statusClass = task.status === 'done' ? 'done' : task.status === 'blocked' ? 'blocked' : '';
  const currentClass = task.isCurrent ? (isRunning ? 'current running' : 'current') : '';
  const check = task.status === 'done' ? '✓' : '';

  return `<div class="task-row ${statusClass} ${currentClass}" data-task-id="${esc(task.id)}">
    <span class="task-glyph">${glyph}</span>
    <span class="task-id">${esc(task.id)}</span>
    <span class="task-title">${esc(task.title)}</span>
    <span class="task-check">${check}</span>
  </div>
  <div class="task-detail" id="detail-${esc(task.id)}" style="display:none">
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

export function buildPhaseTracker(currentPhase: RalphIterationPhase | null, currentIteration: number | null): string {
  if (currentPhase === null || currentIteration === null) {
    return '';
  }

  const activeIdx = PHASE_LABELS.indexOf(currentPhase);
  const steps = PHASE_LABELS.map((label, i) => {
    const cls = i < activeIdx ? 'done' : i === activeIdx ? 'active' : '';
    return `<span class="phase-step ${cls}">${label}</span>`;
  }).join(' ');

  return `<div class="section-label">Iteration ${currentIteration}</div>
    <div class="phase-tracker">${steps}</div>`;
}

export function buildIterationRow(iter: RalphDashboardIteration): string {
  const glyph = CLASSIFICATION_CHAR[iter.classification] ?? '?';
  const taskLabel = iter.taskId ?? '—';

  return `<div class="iter-row" data-artifact-dir="${esc(iter.artifactDir)}">
    <span class="iter-num">#${iter.iteration}</span>
    <span class="iter-task">${esc(taskLabel)}</span>
    <span class="iter-class">${iter.classification.replace(/_/g, ' ')}</span>
    <span class="iter-glyph">${glyph}</span>
  </div>`;
}

export function buildDiagnostics(state: RalphDashboardState): string {
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

export function buildBaseCss(): string {
  return `
:root {
  --ralph-amber: #e8a838;
  --ralph-green: #5faa5f;
  --ralph-orange: #cc7832;
  --ralph-red: #bc4b4b;
  --ralph-dim: color-mix(in srgb, var(--vscode-foreground) 50%, transparent);
  --ralph-font: "Berkeley Mono", "Cascadia Code", "Fira Code", var(--vscode-editor-font-family), monospace;
  --ralph-border: var(--vscode-panel-border, #333);
}

* { box-sizing: border-box; margin: 0; padding: 0; }

.header {
  border: 1px solid var(--ralph-border);
  padding: 8px 10px;
  margin-bottom: 10px;
  text-align: center;
  box-shadow: inset 0 0 0 1px var(--ralph-border);
}

.header-title {
  font-size: 13px;
  font-weight: bold;
  letter-spacing: 2px;
  text-transform: uppercase;
}

.header-state {
  font-size: 11px;
  color: var(--ralph-dim);
  margin-top: 2px;
}

.section-label {
  font-size: 11px;
  font-weight: bold;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--ralph-dim);
  margin: 12px 0 4px 0;
}

.section-rule {
  border: none;
  border-top: 1px solid var(--ralph-border);
  margin-bottom: 6px;
}

/* Progress bar */
.progress-bar {
  font-size: 11px;
  margin-bottom: 6px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.progress-bar-track {
  letter-spacing: 1px;
}

.progress-pct {
  color: var(--ralph-dim);
  font-size: 10px;
}

/* Task list */
.task-row {
  display: flex;
  align-items: flex-start;
  padding: 3px 4px;
  cursor: pointer;
  border-left: 3px solid transparent;
  border-radius: 2px;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.task-row:hover {
  background: color-mix(in srgb, var(--vscode-foreground) 8%, transparent);
}

.task-row.current {
  border-left-color: var(--ralph-amber);
}

@keyframes pulse-border {
  0%, 100% { border-left-color: var(--ralph-amber); }
  50% { border-left-color: transparent; }
}

.task-row.current.running {
  animation: pulse-border 2s ease-in-out infinite;
}

.task-row.done { color: var(--ralph-dim); }
.task-row.blocked { color: var(--ralph-orange); }

.task-glyph {
  width: 16px;
  flex-shrink: 0;
  text-align: center;
}

.task-id {
  width: 64px;
  flex-shrink: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
}

.task-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
}

.task-check {
  width: 16px;
  flex-shrink: 0;
  text-align: center;
  color: var(--ralph-green);
}

/* Task detail (inline expand) */
.task-detail {
  padding: 4px 8px 6px 23px;
  font-size: 11px;
  color: var(--ralph-dim);
  border-left: 3px solid var(--ralph-border);
  margin-bottom: 2px;
}

.task-detail dt { font-weight: bold; color: var(--vscode-foreground); }
.task-detail dd { margin-left: 8px; margin-bottom: 3px; }

/* Buttons */
.btn-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  margin-bottom: 4px;
}

.btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 5px 8px;
  font-family: var(--ralph-font);
  font-size: 11px;
  border: 1px solid var(--ralph-border);
  background: transparent;
  color: var(--vscode-foreground);
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.btn:hover {
  background: color-mix(in srgb, var(--ralph-amber) 15%, transparent);
  border-color: var(--ralph-amber);
}

.btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.btn:disabled:hover {
  background: transparent;
  border-color: var(--ralph-border);
}

/* Iteration history */
.iter-row {
  display: flex;
  align-items: center;
  padding: 2px 4px;
  font-size: 11px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.iter-row:hover {
  background: color-mix(in srgb, var(--vscode-foreground) 8%, transparent);
}

.iter-num { width: 28px; flex-shrink: 0; color: var(--ralph-dim); }
.iter-task { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.iter-class { width: 100px; flex-shrink: 0; text-align: right; font-size: 10px; color: var(--ralph-dim); }
.iter-glyph { width: 16px; flex-shrink: 0; text-align: center; }

/* Phase tracker */
.phase-tracker {
  display: flex;
  gap: 2px;
  font-size: 10px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.phase-step {
  padding: 2px 5px;
  border: 1px solid var(--ralph-border);
  color: var(--ralph-dim);
  transition: all 0.2s ease;
}

.phase-step.active {
  border-color: var(--ralph-amber);
  color: var(--ralph-amber);
  font-weight: bold;
}

.phase-step.done {
  border-color: var(--ralph-green);
  color: var(--ralph-green);
}

/* Diagnostics */
.diag-ok { color: var(--ralph-green); font-size: 11px; }
.diag-item { font-size: 11px; margin: 2px 0; }
.diag-item.warning { color: var(--ralph-orange); }
.diag-item.error { color: var(--ralph-red); }
.diag-item.info { color: var(--ralph-dim); }

/* Empty state */
.empty {
  color: var(--ralph-dim);
  font-size: 11px;
  font-style: italic;
  padding: 4px;
}
`;
}
