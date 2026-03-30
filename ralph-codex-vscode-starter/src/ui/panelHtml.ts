import type {
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
`;
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
    </div>

    <div class="panel-right">
      <div class="card">
        <div class="card-title">Agents</div>
        <div class="btn-grid">
          <button class="btn" data-command="ralphCodex.runRalphLoop" onclick="runCommand(this)"><span class="btn-label">◆ Build</span><span class="btn-spinner"></span></button>
          <button class="btn" data-command="ralphCodex.runReviewAgent" onclick="runCommand(this)"><span class="btn-label">◇ Review</span><span class="btn-spinner"></span></button>
          <button class="btn" data-command="ralphCodex.runWatchdogAgent" onclick="runCommand(this)"><span class="btn-label">⬡ Watch</span><span class="btn-spinner"></span></button>
          <button class="btn" data-command="ralphCodex.runScmAgent" onclick="runCommand(this)"><span class="btn-label">⎔ SCM</span><span class="btn-spinner"></span></button>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Actions</div>
        <div class="btn-grid">
          <button class="btn" data-command="ralphCodex.runRalphLoop" onclick="runCommand(this)"${loopDisabled}><span class="btn-label">▸ Run Loop</span><span class="btn-spinner"></span></button>
          <button class="btn" data-command="ralphCodex.runRalphIteration" onclick="runCommand(this)"${loopDisabled}><span class="btn-label">▸ Run Iter</span><span class="btn-spinner"></span></button>
          <button class="btn" data-command="ralphCodex.generatePrompt" onclick="runCommand(this)"><span class="btn-label">⎙ Prep Prompt</span><span class="btn-spinner"></span></button>
          <button class="btn" data-command="ralphCodex.initializeWorkspace" onclick="runCommand(this)"><span class="btn-label">⏻ Init</span><span class="btn-spinner"></span></button>
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
    const vscode = acquireVsCodeApi();

    function runCommand(el) {
      const cmd = el.getAttribute('data-command');
      if (!cmd || el.disabled) return;
      el.classList.add('loading');
      el.disabled = true;
      vscode.postMessage({ type: 'command', command: cmd });
      // Timeout fallback: re-enable after 10s if no ack
      el._ackTimeout = setTimeout(function() { resetButton(el); }, 10000);
    }

    function resetButton(el) {
      el.classList.remove('loading');
      el.disabled = false;
      if (el._ackTimeout) { clearTimeout(el._ackTimeout); el._ackTimeout = null; }
    }

    function toggleTask(taskId) {
      var el = document.getElementById('detail-' + taskId);
      if (el) {
        el.style.display = el.style.display === 'none' ? 'block' : 'none';
      }
    }

    function openArtifact(dir) {
      vscode.postMessage({ type: 'command', command: 'ralphCodex.openLatestRalphSummary' });
    }

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
        var btns = document.querySelectorAll('.btn[data-command="' + msg.command + '"]');
        btns.forEach(function(btn) {
          if (msg.status === 'done' || msg.status === 'error') {
            resetButton(btn);
          }
        });
      }
    });
  </script>
</body>
</html>`;
}
