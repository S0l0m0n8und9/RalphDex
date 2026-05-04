import type { RalphDashboardState } from './uiTypes';
import {
  buildBaseCss,
  buildProgressBar,
  esc,
  LOOP_STATE_LABEL
} from './htmlHelpers';

// ---------------------------------------------------------------------------
// Sidebar-specific CSS (compact operator surface)
// ---------------------------------------------------------------------------

function buildSidebarCss(): string {
  return `
${buildBaseCss()}

body {
  font-family: var(--font-ui);
  font-size: 12px;
  line-height: 1.5;
  color: var(--fg);
  background: var(--vscode-sideBar-background);
  padding: 8px;
  overflow-x: hidden;
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

/* Compact run controls */
.sidebar-run-controls {
  margin-top: 10px;
  display: grid;
  gap: 8px;
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

.btn-setup {
  background: color-mix(in srgb, var(--warn) 18%, transparent);
  color: var(--warn);
  border-color: color-mix(in srgb, var(--warn) 48%, var(--border));
  font-weight: 600;
}

.btn-spinner {
  display: none;
  width: 10px;
  height: 10px;
  border: 2px solid var(--dim);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

.btn.loading .btn-label { opacity: 0.5; }
.btn.loading .btn-spinner { display: inline-block; }

@keyframes spin {
  to { transform: rotate(360deg); }
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

.sidebar-status {
  text-align: center;
  padding: 6px 0;
}

.sidebar-status-text {
  font-size: 12px;
  color: var(--dim);
}

.sidebar-status-text.warn {
  color: var(--warn);
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
`;
}

// ---------------------------------------------------------------------------
// Sidebar HTML — compact launcher/status surface
// ---------------------------------------------------------------------------

function buildCurrentTaskCard(state: RalphDashboardState): string {
  const currentTask = state.tasks.find((t) => t.isCurrent) ?? state.tasks[0] ?? null;
  const snapshot = state.dashboardSnapshot;
  const taskBoard = snapshot?.taskBoard ?? null;
  const failureEntry = snapshot?.failureFeed.entries[0] ?? null;
  const recoveryEntry = snapshot?.deadLetter.entries[0] ?? null;
  const agentRow = snapshot?.agentGrid.rows[0] ?? null;

  const id = currentTask?.id ?? taskBoard?.selectedTaskId ?? null;
  const title = currentTask?.title ?? taskBoard?.selectedTaskTitle ?? null;
  const blockedCount = taskBoard?.counts?.blocked ?? 0;
  const recoveryCount = taskBoard?.deadLetterCount ?? 0;

  if (!state.prdExists && !id && !taskBoard) {
    return `<div class="current-task-card blocked">
      <div class="current-task-kicker">Setup Required</div>
      <div class="current-task-title">Create a PRD before running RalphDex.</div>
      <div class="current-task-meta">The PRD wizard will create the objective and starting backlog.</div>
    </div>`;
  }

  return `<div class="current-task-card${blockedCount > 0 || recoveryCount > 0 ? ' blocked' : ''}">
    <div class="current-task-kicker">Current Work</div>
    ${id ? `<div class="current-task-id">Selected ${esc(id)}</div>` : ''}
    ${title ? `<div class="current-task-title">${esc(title)}</div>` : ''}
    ${taskBoard ? `<div class="snapshot-chip-row">
      <span class="pill">Blocked ${blockedCount}</span>
      <span class="pill">Recovery Queue ${recoveryCount}</span>
      <span class="pill">Next ${taskBoard.nextIteration}</span>
    </div>` : ''}
    ${failureEntry ? `<div class="current-task-failure">⚠ ${esc(failureEntry.category)} · ${esc(failureEntry.confidence)}</div>` : ''}
    ${recoveryEntry ? `<div class="current-task-meta">Recovery: ${esc(recoveryEntry.taskTitle)}</div>` : ''}
    ${agentRow ? `<div class="current-task-meta">${esc(agentRow.agentId)}</div>` : ''}
    ${!id && !taskBoard ? '<div class="current-task-empty">No task selected</div>' : ''}
  </div>`;
}

function buildRunControl(state: RalphDashboardState): string {
  if (state.loopState === 'running') {
    return `<button class="btn btn-danger" data-command="ralphCodex.stopLoop"><span class="btn-label">■ Stop Loop</span><span class="btn-spinner"></span></button>`;
  }

  if (!state.prdExists) {
    return `<button class="btn btn-setup" data-command="ralphCodex.openPrdWizard"><span class="btn-label">Open PRD Wizard</span><span class="btn-spinner"></span></button>`;
  }

  return `<button class="btn btn-primary" data-command="ralphCodex.runRalphLoop"><span class="btn-label">▸ Run Loop</span><span class="btn-spinner"></span></button>`;
}

function buildSidebarStatusText(state: RalphDashboardState, stateLabel: string): string {
  if (state.loopState === 'running') {
    return `<div class="sidebar-status-text">Ralph is working — ${esc(stateLabel)}</div>`;
  }

  if (!state.prdExists) {
    return '<div class="sidebar-status-text warn">PRD required before running</div>';
  }

  if (!state.preflightReady) {
    return `<div class="sidebar-status-text warn">Readiness blocked — ${esc(state.preflightSummary)}</div>`;
  }

  return '<div class="sidebar-status-text">Ready to start</div>';
}

export function buildDashboardHtml(state: RalphDashboardState, nonce: string): string {
  const stateLabel = LOOP_STATE_LABEL[state.loopState];
  const isRunning = state.loopState === 'running';

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
<body>

  <div class="header">
    <div class="header-title">Ralphdex</div>
    <div class="header-state">
      <span class="state-dot ${isRunning ? 'running' : state.loopState}"></span>
      ${esc(state.workspaceName)} · ${esc(state.agentRole)}
    </div>
  </div>

  ${phaseIndicator}
  ${state.taskCounts ? buildProgressBar(state.taskCounts) : ''}

  <div class="sidebar-status">
    ${buildSidebarStatusText(state, stateLabel)}
  </div>

  <div class="sidebar-run-controls">
    ${buildRunControl(state)}
  </div>

  ${buildCurrentTaskCard(state)}

  <button class="open-dashboard" data-command="ralphCodex.openDashboard">Open Dashboard</button>

  <script nonce="${nonce}">
    (function() {
      var vscode = acquireVsCodeApi();
      var ackTimeouts = new WeakMap();

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

      document.addEventListener('click', function(e) {
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
      });
    })();
  </script>
</body>
</html>`;
}
