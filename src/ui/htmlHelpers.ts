import type { RalphTaskCounts } from '../ralph/types';
import type {
  RalphAgentLaneState,
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
  const agentLabel = iter.agentId ? `<span class="iter-agent">${esc(iter.agentId)}</span>` : '';
  const tierLabel = iter.effectiveTier && iter.effectiveTier !== 'default' 
    ? `<span class="iter-tier" title="Model: ${esc(iter.selectedModel ?? 'Unknown')}">T: ${esc(iter.effectiveTier)}</span>` : '';

  return `<button type="button" class="iter-row" data-artifact-dir="${esc(iter.artifactDir)}" title="Open iteration artifact">
    <span class="iter-num">#${iter.iteration}</span>
    ${agentLabel}
    ${tierLabel}
    <span class="iter-task">${esc(taskLabel)}</span>
    <span class="iter-class">${iter.classification.replace(/_/g, ' ')}</span>
    <span class="iter-glyph">${glyph}</span>
  </button>`;
}

export function buildAgentLanes(lanes: RalphAgentLaneState[]): string {
  if (lanes.length === 0) {
    return '';
  }
  if (lanes.length === 1) {
    const lane = lanes[0]!;
    return `
      ${buildPhaseTracker(lane.phase, lane.iteration)}
      ${lane.message ? `<div class="agent-message">${esc(lane.message)}</div>` : ''}
    `;
  }
  return lanes.map((lane) => `<div class="agent-lane" data-agent-id="${esc(lane.agentId)}">
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <span class="agent-lane-id">${esc(lane.agentId)}</span>
      ${buildPhaseTracker(lane.phase, lane.iteration)}
    </div>
    ${lane.message ? `<div class="agent-message-block">${esc(lane.message)}</div>` : ''}
  </div>`).join('\n');
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
  --ralph-amber: #f59e0b;
  --ralph-green: #10b981;
  --ralph-orange: #f97316;
  --ralph-red: #ef4444;
  --ralph-cyan: #06b6d4;
  --ralph-dim: color-mix(in srgb, var(--vscode-foreground) 50%, transparent);
  --ralph-font: "Inter", "Outfit", "Berkeley Mono", "Cascadia Code", var(--vscode-editor-font-family), sans-serif;
  --ralph-border: rgba(255, 255, 255, 0.08); /* glass border */
  --glass-bg: rgba(30, 30, 35, 0.35); /* glass background */
  --glass-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3);
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: var(--ralph-font);
  background: var(--vscode-editor-background);
  color: var(--vscode-foreground);
}

.header {
  background: var(--glass-bg);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--ralph-border);
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 16px;
  text-align: center;
  box-shadow: var(--glass-shadow);
}

.header-title {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 3px;
  text-transform: uppercase;
  background: linear-gradient(135deg, var(--ralph-amber), var(--ralph-cyan));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
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
  align-items: center;
  width: 100%;
  padding: 6px 8px;
  margin-bottom: 4px;
  cursor: pointer;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid transparent;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  color: inherit;
  text-align: left;
}

.task-row:hover {
  background: rgba(255, 255, 255, 0.05);
  transform: translateY(-1px);
}

.task-row.current {
  background: rgba(245, 158, 11, 0.08); /* slight amber */
  border-color: rgba(245, 158, 11, 0.3);
}

@keyframes pulse-glass {
  0%, 100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
  50% { box-shadow: 0 0 8px 1px rgba(245, 158, 11, 0.3); }
}

.task-row.current.running {
  animation: pulse-glass 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  border-color: var(--ralph-amber);
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
  gap: 6px;
  padding: 6px 12px;
  font-family: var(--ralph-font);
  font-size: 11px;
  font-weight: 500;
  border-radius: 6px;
  border: 1px solid var(--ralph-border);
  background: var(--glass-bg);
  backdrop-filter: blur(4px);
  color: var(--vscode-foreground);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.btn:hover {
  background: rgba(245, 158, 11, 0.15); /* amber tint */
  border-color: var(--ralph-amber);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.2);
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
  width: 100%;
  padding: 2px 4px;
  font-size: 11px;
  cursor: pointer;
  transition: background 0.15s ease;
  background: transparent;
  color: inherit;
  border: none;
  text-align: left;
}

.iter-row:hover {
  background: color-mix(in srgb, var(--vscode-foreground) 8%, transparent);
}

.iter-num { width: 28px; flex-shrink: 0; color: var(--ralph-dim); }
.iter-agent { width: 72px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10px; color: var(--ralph-amber); }
.iter-tier { width: 65px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10px; color: var(--ralph-green); text-align: right; margin-right: 8px; font-weight: 500; }
.iter-task { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.iter-class { width: 100px; flex-shrink: 0; text-align: right; font-size: 10px; color: var(--ralph-dim); }
.iter-glyph { width: 16px; flex-shrink: 0; text-align: center; }

/* Agent swim lanes */
.agent-lane {
  margin-bottom: 6px;
}

.agent-lane-id {
  display: inline-block;
  font-size: 10px;
  color: var(--ralph-amber);
  letter-spacing: 0.5px;
  width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
  margin-right: 4px;
}

.agent-message, .agent-message-block {
  font-size: 10px;
  color: var(--ralph-dim);
  font-family: var(--ralph-font);
  background: rgba(0, 0, 0, 0.2);
  border-left: 2px solid var(--ralph-amber);
  padding: 4px 8px;
  margin-top: 4px;
  border-radius: 0 4px 4px 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Phase tracker */
.phase-tracker {
  display: inline-flex;
  gap: 2px;
  font-size: 10px;
  margin-bottom: 2px;
  flex-wrap: wrap;
  vertical-align: middle;
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

.task-row:focus-visible,
.iter-row:focus-visible,
.btn:focus-visible {
  outline: 1px solid var(--ralph-amber);
  outline-offset: 2px;
}
`;
}
