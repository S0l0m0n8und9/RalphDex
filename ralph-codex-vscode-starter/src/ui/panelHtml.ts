import type {
  RalphDashboardConfigSnapshot,
  RalphDashboardState
} from './uiTypes';
import {
  buildBaseCss,
  buildDiagnostics,
  buildIterationRow,
  buildPhaseTracker,
  buildProgressBar,
  buildTaskRow,
  esc,
  LOOP_STATE_LABEL,
  PHASE_LABELS
} from './htmlHelpers';

// ---------------------------------------------------------------------------
// Panel-specific CSS (extends base)
// ---------------------------------------------------------------------------

function buildPanelCss(): string {
  return `
${buildBaseCss()}

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

.settings-group-title {
  font-size: 10px;
  font-weight: bold;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--ralph-amber);
  margin: 8px 0 4px 0;
  grid-column: 1 / -1;
}

.settings-group-title:first-child {
  margin-top: 0;
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

function numberInput(key: string, value: number, min: number, max: number): string {
  return `<input type="number" data-setting="${esc(key)}" value="${value}" min="${min}" max="${max}">`;
}

function textInput(key: string, value: string): string {
  return `<input type="text" data-setting="${esc(key)}" value="${esc(value)}">`;
}

function checkbox(key: string, value: boolean, label: string): string {
  return `<label class="setting-check"><input type="checkbox" data-setting="${esc(key)}"${value ? ' checked' : ''}> ${esc(label)}</label>`;
}

function buildSettingsSection(cfg: RalphDashboardConfigSnapshot): string {
  return `
    <div class="settings-grid">
      <div class="settings-group-title">Provider & Model</div>
      <div class="setting-row">
        <span class="setting-label">CLI Provider</span>
        <div class="setting-control">${select('cliProvider', cfg.cliProvider, ['codex', 'claude'])}</div>
      </div>
      <div class="setting-row">
        <span class="setting-label">Model</span>
        <div class="setting-control">${textInput('model', cfg.model)}</div>
      </div>
      <div class="setting-row">
        <span class="setting-label">Reasoning Effort</span>
        <div class="setting-control">${select('reasoningEffort', cfg.reasoningEffort, ['medium', 'high'])}</div>
      </div>
      <div class="setting-row">
        <span class="setting-label">Prompt Budget</span>
        <div class="setting-control">${select('promptBudgetProfile', cfg.promptBudgetProfile, ['codex', 'claude', 'custom'])}</div>
      </div>

      <div class="settings-group-title">Agent</div>
      <div class="setting-row">
        <span class="setting-label">Role</span>
        <div class="setting-control">${select('agentRole', cfg.agentRole, ['build', 'review', 'watchdog', 'scm'])}</div>
      </div>
      <div class="setting-row">
        <span class="setting-label">Agent ID</span>
        <div class="setting-control">${textInput('agentId', cfg.agentId)}</div>
      </div>
      <div class="setting-row">
        <span class="setting-label">Agent Count</span>
        <div class="setting-control">${numberInput('agentCount', cfg.agentCount, 1, 20)}</div>
      </div>
      <div class="setting-row">
        <span class="setting-label">Autonomy</span>
        <div class="setting-control">${select('autonomyMode', cfg.autonomyMode, ['supervised', 'autonomous'])}</div>
      </div>

      <div class="settings-group-title">Execution</div>
      <div class="setting-row">
        <span class="setting-label">Iteration Cap</span>
        <div class="setting-control">${numberInput('ralphIterationCap', cfg.ralphIterationCap, 1, 100)}</div>
      </div>
      <div class="setting-row">
        <span class="setting-label">Handoff Mode</span>
        <div class="setting-control">${select('preferredHandoffMode', cfg.preferredHandoffMode, ['ideCommand', 'clipboard', 'cliExec'])}</div>
      </div>
      <div class="setting-row">
        <span class="setting-label">No-Progress Stop</span>
        <div class="setting-control">${numberInput('noProgressThreshold', cfg.noProgressThreshold, 1, 20)}</div>
      </div>
      <div class="setting-row">
        <span class="setting-label">Failure Stop</span>
        <div class="setting-control">${numberInput('repeatedFailureThreshold', cfg.repeatedFailureThreshold, 1, 20)}</div>
      </div>

      <div class="settings-group-title">Claude CLI</div>
      <div class="setting-row">
        <span class="setting-label">Max Turns</span>
        <div class="setting-control">${numberInput('claudeMaxTurns', cfg.claudeMaxTurns, 1, 500)}</div>
      </div>
      <div class="setting-row">
        <span class="setting-label">Permission Mode</span>
        <div class="setting-control">${select('claudePermissionMode', cfg.claudePermissionMode, ['dangerously-skip-permissions', 'default'])}</div>
      </div>

      <div class="settings-group-title">Codex CLI</div>
      <div class="setting-row">
        <span class="setting-label">Approval Mode</span>
        <div class="setting-control">${select('approvalMode', cfg.approvalMode, ['never', 'on-request', 'untrusted'])}</div>
      </div>
      <div class="setting-row">
        <span class="setting-label">Sandbox Mode</span>
        <div class="setting-control">${select('sandboxMode', cfg.sandboxMode, ['read-only', 'workspace-write', 'danger-full-access'])}</div>
      </div>

      <div class="settings-group-title">SCM & Git</div>
      <div class="setting-row">
        <span class="setting-label">SCM Strategy</span>
        <div class="setting-control">${select('scmStrategy', cfg.scmStrategy, ['none', 'commit-on-done', 'branch-per-task'])}</div>
      </div>
      <div class="setting-row">
        <span class="setting-label">Git Checkpoint</span>
        <div class="setting-control">${select('gitCheckpointMode', cfg.gitCheckpointMode, ['off', 'snapshot', 'snapshotAndDiff'])}</div>
      </div>

      <div class="settings-group-title">Behaviour</div>
      <div class="setting-row" style="grid-column: 1 / -1">
        ${checkbox('stopOnHumanReviewNeeded', cfg.stopOnHumanReviewNeeded, 'Stop on human review needed')}
      </div>
      <div class="setting-row" style="grid-column: 1 / -1">
        ${checkbox('clipboardAutoCopy', cfg.clipboardAutoCopy, 'Auto-copy prompts to clipboard')}
      </div>
      <div class="setting-row" style="grid-column: 1 / -1">
        ${checkbox('autoReplenishBacklog', cfg.autoReplenishBacklog, 'Auto-replenish backlog')}
      </div>
      <div class="setting-row" style="grid-column: 1 / -1">
        ${checkbox('autoReloadOnControlPlaneChange', cfg.autoReloadOnControlPlaneChange, 'Auto-reload on control plane change')}
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Panel HTML builder
// ---------------------------------------------------------------------------

export function buildPanelDashboardHtml(state: RalphDashboardState, nonce: string): string {
  const isRunning = state.loopState === 'running';
  const stateLabel = LOOP_STATE_LABEL[state.loopState];

  // Split tasks into active vs done
  const statusOrder: Record<string, number> = { in_progress: 0, todo: 1, blocked: 2, done: 3 };
  const sorted = [...state.tasks].sort((a, b) => {
    if (a.isCurrent && !b.isCurrent) return -1;
    if (!a.isCurrent && b.isCurrent) return 1;
    return (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
  });

  const activeTasks = sorted.filter((t) => t.status !== 'done');
  const doneTasks = sorted.filter((t) => t.status === 'done');
  const allDone = activeTasks.length === 0 && doneTasks.length > 0;

  // Disable loop/iteration buttons when running
  const loopDisabled = isRunning ? ' disabled' : '';

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
  <div class="header">
    <div class="header-title">Ralph Codex</div>
    <div class="header-state">${esc(state.workspaceName)} · ${stateLabel} · ${esc(state.agentRole)}</div>
  </div>

  ${buildPhaseTracker(state.currentPhase, state.currentIteration)}
  ${buildProgressBar(state.taskCounts)}

  <div class="dashboard-grid">
    <div class="panel-left">
      <div class="card">
        <div class="card-title">Tasks${state.taskCounts ? ` · ${state.taskCounts.done}/${state.taskCounts.todo + state.taskCounts.in_progress + state.taskCounts.blocked + state.taskCounts.done}` : ''}</div>
        ${allDone
          ? `<div class="all-done-card">
              <div class="check">✓</div>
              <div class="label">All ${doneTasks.length} tasks completed</div>
            </div>`
          : activeTasks.length > 0
            ? activeTasks.map((t) => buildTaskRow(t, isRunning)).join('\n')
            : '<div class="empty">No tasks yet — run Initialize Workspace</div>'}
        ${!allDone && doneTasks.length > 0
          ? `<details>
              <summary class="completed-toggle">Completed (${doneTasks.length})</summary>
              ${doneTasks.map((t) => buildTaskRow(t, isRunning)).join('\n')}
            </details>`
          : ''}
      </div>
      ${state.config ? `<div class="card">
        <div class="card-title">Settings</div>
        ${buildSettingsSection(state.config)}
      </div>` : ''}
    </div>

    <div class="panel-right">
      <div class="card">
        <div class="card-title">Agents</div>
        <div class="btn-grid">
          <button class="btn" data-command="ralphCodex.runRalphLoop"><span class="btn-label">◆ Build</span><span class="btn-spinner"></span></button>
          <button class="btn" data-command="ralphCodex.runReviewAgent"><span class="btn-label">◇ Review</span><span class="btn-spinner"></span></button>
          <button class="btn" data-command="ralphCodex.runWatchdogAgent"><span class="btn-label">⬡ Watch</span><span class="btn-spinner"></span></button>
          <button class="btn" data-command="ralphCodex.runScmAgent"><span class="btn-label">⎔ SCM</span><span class="btn-spinner"></span></button>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Actions</div>
        <div class="btn-grid">
          <button class="btn" data-command="ralphCodex.runRalphLoop"${loopDisabled}><span class="btn-label">▸ Run Loop</span><span class="btn-spinner"></span></button>
          <button class="btn" data-command="ralphCodex.runRalphIteration"${loopDisabled}><span class="btn-label">▸ Run Iter</span><span class="btn-spinner"></span></button>
          <button class="btn" data-command="ralphCodex.generatePrompt"><span class="btn-label">⎙ Prep Prompt</span><span class="btn-spinner"></span></button>
          <button class="btn" data-command="ralphCodex.initializeWorkspace"><span class="btn-label">⏻ Init</span><span class="btn-spinner"></span></button>
        </div>
      </div>

      <div class="card">
        <div class="card-title">History</div>
        ${state.recentIterations.length > 0
          ? state.recentIterations.map(buildIterationRow).join('\n')
          : '<div class="empty">No iterations yet</div>'}
      </div>

      <div class="card">
        <div class="card-title">Preflight</div>
        ${buildDiagnostics(state)}
      </div>
    </div>
  </div>

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

      // Settings change handler
      document.addEventListener('change', function(e) {
        var el = e.target;
        var key = el.getAttribute('data-setting');
        if (!key) return;
        var value;
        if (el.type === 'checkbox') {
          value = el.checked;
        } else if (el.type === 'number') {
          value = parseInt(el.value, 10);
          if (isNaN(value)) return;
        } else {
          value = el.value;
        }
        vscode.postMessage({ type: 'update-setting', key: key, value: value });
      });

      // Event delegation — no inline handlers needed (CSP blocks onclick)
      document.addEventListener('click', function(e) {
        var btn = e.target.closest('[data-command]');
        if (btn) { runCommand(btn); return; }

        var taskRow = e.target.closest('.task-row[data-task-id]');
        if (taskRow) {
          var taskId = taskRow.getAttribute('data-task-id');
          var detail = document.getElementById('detail-' + taskId);
          if (detail) {
            detail.style.display = detail.style.display === 'none' ? 'block' : 'none';
          }
          return;
        }

        var iterRow = e.target.closest('.iter-row[data-artifact-dir]');
        if (iterRow) {
          vscode.postMessage({ type: 'command', command: 'ralphCodex.openLatestRalphSummary' });
          return;
        }
      });

      window.addEventListener('message', function(event) {
        var msg = event.data;
        if (msg.type === 'phase') {
          var steps = document.querySelectorAll('.phase-step');
          var phases = ${JSON.stringify(PHASE_LABELS)};
          var activeIdx = phases.indexOf(msg.phase);
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
