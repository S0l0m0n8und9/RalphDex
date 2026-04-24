import type { RalphDashboardState } from './uiTypes';
import {
  buildBaseCss,
  buildProgressBar,
  esc,
  LOOP_STATE_LABEL,
  PHASE_LABELS
} from './htmlHelpers';

// ---------------------------------------------------------------------------
// Sidebar-specific CSS (compact launcher)
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
}

.sidebar-tab {
  font-family: inherit;
  font-size: 11px;
  padding: 5px 10px;
  border: none;
  background: transparent;
  color: var(--dim);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.15s ease;
  margin-bottom: -1px;
}

.sidebar-tab.active {
  color: var(--fg);
  border-bottom-color: var(--accent);
}

.sidebar-tab-panel { display: none; }
.sidebar-tab-panel.active { display: block; }

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
`;
}

// ---------------------------------------------------------------------------
// Sidebar HTML — UXrefresh launcher with mode switcher + current-task card
// ---------------------------------------------------------------------------

function buildCurrentTaskCard(state: RalphDashboardState): string {
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
    ${id ? `<div class="current-task-id">Selected ${esc(id)}</div>` : ''}
    ${title ? `<div class="current-task-title">${esc(title)}</div>` : ''}
    ${taskBoard ? `<div class="snapshot-chip-row">
      <span class="pill">Blocked ${taskBoard.counts?.blocked ?? 0}</span>
      <span class="pill">Dead-Letter ${taskBoard.deadLetterCount}</span>
      <span class="pill">Next ${taskBoard.nextIteration}</span>
    </div>` : ''}
    ${failureEntry ? `<div class="current-task-failure">⚠ ${esc(failureEntry.category)} · ${esc(failureEntry.confidence)}</div>` : ''}
    ${deadLetterEntry ? `<div class="current-task-meta">Dead-letter: ${esc(deadLetterEntry.taskTitle)}</div>` : ''}
    ${agentRow ? `<div class="current-task-meta">${esc(agentRow.agentId)}</div>` : ''}
    ${!id && !taskBoard ? '<div class="current-task-empty">No task selected</div>' : ''}
  </div>`;
}

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

  const seedResult = state.taskSeeding.phase !== 'idle' && state.taskSeeding.message
    ? `<div class="seed-result ${state.taskSeeding.phase === 'success' ? 'success' : state.taskSeeding.phase === 'error' ? 'error' : ''}">${esc(state.taskSeeding.message)}</div>`
    : '';

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
      <span class="state-dot ${isRunning ? 'running' : state.loopState}"></span>
      ${esc(state.workspaceName)} · ${esc(state.agentRole)}
    </div>
  </div>

  ${phaseIndicator}

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
    ${buildProgressBar(state.taskCounts)}
  </div>

  <!-- Simple mode: start/status at a glance -->
  <div class="mode-section mode-simple">
    <div class="simple-status">
      ${isRunning
        ? `<div class="simple-status-text">Ralph is working — ${esc(stateLabel)}</div>`
        : `<div class="simple-status-text">Ready to start</div>`}
    </div>
    <div class="btn-grid" style="margin-top: 8px;">
      ${isRunning
        ? `<button class="btn btn-danger" data-command="ralphCodex.stopLoop" style="grid-column: 1/-1;"><span class="btn-label">■ Stop Loop</span><span class="btn-spinner"></span></button>`
        : `<button class="btn btn-primary" data-command="ralphCodex.runRalphLoop" style="grid-column: 1/-1;"><span class="btn-label">▸ Start Loop</span><span class="btn-spinner"></span></button>`}
    </div>
  </div>

  <!-- Tab nav (shown in advanced mode) -->
  <div class="mode-section mode-advanced">
    <div class="sidebar-tabs">
      <button class="sidebar-tab active" data-sidebar-tab="run">Run</button>
      <button class="sidebar-tab" data-sidebar-tab="agents">Agents</button>
      <button class="sidebar-tab" data-sidebar-tab="seed">Seed</button>
    </div>
  </div>

  <!-- Run tab panel -->
  <div class="sidebar-tab-panel active mode-section mode-advanced" data-sidebar-panel="run">
    <div class="section-label">Loop Controls</div>
    <div class="btn-grid">
      <button class="btn" data-command="ralphCodex.runRalphLoop"><span class="btn-label">▸ Run Loop</span><span class="btn-spinner"></span></button>
      <button class="btn" data-command="ralphCodex.runMultiAgentLoop"><span class="btn-label">▸ Multi</span><span class="btn-spinner"></span></button>
      <button class="btn" data-command="ralphCodex.runRalphIteration"><span class="btn-label">▸ Iteration</span><span class="btn-spinner"></span></button>
      <button class="btn" data-command="ralphCodex.generatePrompt"><span class="btn-label">⎙ Prompt</span><span class="btn-spinner"></span></button>
    </div>

    <div class="section-label" style="margin-top: 10px;">Quick Actions</div>
    <div class="quick-actions">
      <button class="quick-action" data-command="ralphCodex.showRalphStatus">
        <span>Show Status</span><span class="quick-shortcut">◫</span>
      </button>
      <button class="quick-action" data-command="ralphCodex.showTasks">
        <span>Open Tasks</span><span class="quick-shortcut">⌘T</span>
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
    <div class="seed-block">
      <textarea data-seed-request="sidebar" placeholder="Describe the epic...">${esc(state.taskSeeding.requestText)}</textarea>
      <div class="btn-grid" style="margin-top: 8px;">
        <button class="btn" data-seed-submit="sidebar"><span class="btn-label">Seed Tasks</span><span class="btn-spinner"></span></button>
        <button class="btn" data-command="ralphCodex.showTasks"><span class="btn-label">Open Tasks</span><span class="btn-spinner"></span></button>
      </div>
      ${seedResult}
    </div>
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
