import type { RalphDashboardState } from './uiTypes';
import {
  buildBaseCss,
  buildProgressBar,
  esc,
  LOOP_STATE_LABEL,
} from './htmlHelpers';

// ---------------------------------------------------------------------------
// Sidebar-specific CSS (compact status surface)
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
  margin: 10px 0 6px;
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

.current-task-meta {
  font-size: 10px;
  color: var(--dim);
  margin-top: 2px;
  font-family: var(--font-mono);
}

/* Primary action */
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

/* Reduced-motion */
@media (prefers-reduced-motion: reduce) {
  .state-dot.running { animation: none; }
  .btn, .open-dashboard { transition: none; }
}
`;
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

function buildAlertsBanner(state: RalphDashboardState): string {
  const snapshot = state.dashboardSnapshot;
  const blockedCount = state.taskCounts?.blocked ?? snapshot?.taskBoard.counts?.blocked ?? 0;
  const dlCount = snapshot?.deadLetter.entries.length ?? 0;

  if (blockedCount === 0 && dlCount === 0) return '';

  const parts: string[] = [];
  if (blockedCount > 0) parts.push(`${blockedCount} blocked`);
  if (dlCount > 0) parts.push(`${dlCount} dead-letter`);
  const severity = dlCount > 0 ? 'bad' : 'warn';

  return `<div class="alerts-banner ${severity}" role="alert">
    <span aria-hidden="true">${dlCount > 0 ? '✗' : '⚠'}</span>
    <span>${parts.join(' · ')} — needs attention</span>
  </div>`;
}

function buildCurrentTaskCard(state: RalphDashboardState): string {
  const currentTask = state.tasks.find((t) => t.isCurrent) ?? state.tasks[0] ?? null;
  const snapshot = state.dashboardSnapshot;
  const taskBoard = snapshot?.taskBoard ?? null;

  const id = currentTask?.id ?? taskBoard?.selectedTaskId ?? null;
  const title = currentTask?.title ?? taskBoard?.selectedTaskTitle ?? null;
  const status = currentTask?.status ?? (taskBoard?.selectedTaskId ? 'in_progress' : null);
  const blocker = currentTask?.blocker ?? null;

  const counts = state.taskCounts ?? taskBoard?.counts ?? null;
  const total = counts ? counts.todo + counts.in_progress + counts.blocked + counts.done : 0;
  const countLine = counts ? `${counts.done}/${total} done${counts.blocked > 0 ? ` · ${counts.blocked} blocked` : ''}` : '';

  const cardClass = status === 'blocked' ? ' blocked' : '';

  return `<div class="current-task-card${cardClass}">
    <div class="current-task-kicker">Current Task</div>
    ${id ? `<div class="current-task-id">${esc(id)}</div>` : ''}
    ${title ? `<div class="current-task-title">${esc(title)}</div>` : ''}
    ${status ? `<div class="current-task-meta">${esc(status.replace(/_/g, ' '))}${blocker ? ` · ${esc(blocker)}` : ''}</div>` : ''}
    ${countLine ? `<div class="current-task-meta">${esc(countLine)}</div>` : ''}
    ${!id ? '<div class="current-task-empty">No task selected</div>' : ''}
  </div>`;
}

// ---------------------------------------------------------------------------
// Sidebar HTML — compact status surface
// ---------------------------------------------------------------------------

export function buildDashboardHtml(state: RalphDashboardState, nonce: string): string {
  const stateLabel = LOOP_STATE_LABEL[state.loopState];
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
<body>

  <!-- Header: workspace + loop state -->
  <div class="header">
    <div class="header-title">Ralphdex</div>
    <div class="header-state">
      <span class="state-dot ${isRunning ? 'running' : state.loopState}" aria-label="Loop state: ${esc(stateLabel)}"></span>
      ${esc(state.workspaceName)} · ${esc(state.agentRole)}
    </div>
  </div>

  ${phaseIndicator}

  <!-- Alerts banner (blocked/dead-letter) -->
  ${buildAlertsBanner(state)}

  <!-- Primary action -->
  <div class="btn-grid">
    ${isRunning
      ? `<button class="btn btn-danger" data-command="ralphCodex.stopLoop" style="grid-column: 1/-1;"><span class="btn-label">■ Stop Loop</span><span class="btn-spinner"></span></button>`
      : `<button class="btn btn-primary" data-command="ralphCodex.runRalphLoop" style="grid-column: 1/-1;"><span class="btn-label">▸ Run Loop</span><span class="btn-spinner"></span></button>`}
  </div>

  <!-- Progress bar -->
  ${buildProgressBar(state.taskCounts)}

  <!-- Current task card -->
  ${buildCurrentTaskCard(state)}

  <button class="open-dashboard" data-command="ralphCodex.openDashboard">Open Dashboard</button>

  <script nonce="${nonce}">
    (function() {
      var vscode = acquireVsCodeApi();
      var ackTimeouts = new WeakMap();

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

      document.addEventListener('click', function(e) {
        var btn = e.target.closest('[data-command]');
        if (btn) { runCommand(btn); }
      });

      window.addEventListener('message', function(event) {
        var msg = event.data;
        if (msg.type === 'phase') {
          var indicators = document.querySelectorAll('.phase-indicator');
          if (indicators.length === 1) {
            indicators[0].textContent = 'iter ' + msg.iteration + ' \\u00b7 ' + msg.phase;
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
