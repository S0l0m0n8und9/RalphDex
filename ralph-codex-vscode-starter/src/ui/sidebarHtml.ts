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
  font-family: var(--ralph-font);
  font-size: 12px;
  line-height: 1.5;
  color: var(--vscode-foreground);
  background: var(--vscode-sideBar-background);
  padding: 8px;
  overflow-x: hidden;
}

.open-dashboard {
  display: block;
  width: 100%;
  padding: 6px 8px;
  margin-top: 8px;
  font-family: var(--ralph-font);
  font-size: 11px;
  border: 1px solid var(--ralph-amber);
  background: color-mix(in srgb, var(--ralph-amber) 10%, transparent);
  color: var(--ralph-amber);
  cursor: pointer;
  text-align: center;
  letter-spacing: 1px;
  text-transform: uppercase;
  transition: background 0.15s ease;
}

.open-dashboard:hover {
  background: color-mix(in srgb, var(--ralph-amber) 25%, transparent);
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

/* Phase indicator (compact) */
.phase-indicator {
  font-size: 10px;
  color: var(--ralph-amber);
  margin-bottom: 6px;
  text-align: center;
}
`;
}

// ---------------------------------------------------------------------------
// Sidebar HTML — lightweight launcher
// ---------------------------------------------------------------------------

export function buildDashboardHtml(state: RalphDashboardState, nonce: string): string {
  const stateLabel = LOOP_STATE_LABEL[state.loopState];

  // Compact phase indicator (single line when running)
  let phaseIndicator = '';
  if (state.currentPhase !== null && state.currentIteration !== null) {
    phaseIndicator = `<div class="phase-indicator">iter ${state.currentIteration} · ${state.currentPhase}</div>`;
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
    <div class="header-title">Ralph Codex</div>
    <div class="header-state">${esc(state.workspaceName)} · ${stateLabel} · ${esc(state.agentRole)}</div>
  </div>

  ${phaseIndicator}

  ${buildProgressBar(state.taskCounts)}

  <div class="section-label">Agents</div>
  <hr class="section-rule">
  <div class="btn-grid">
    <button class="btn" data-command="ralphCodex.runRalphLoop" onclick="runCommand(this)"><span class="btn-label">◆ Build</span><span class="btn-spinner"></span></button>
    <button class="btn" data-command="ralphCodex.runReviewAgent" onclick="runCommand(this)"><span class="btn-label">◇ Review</span><span class="btn-spinner"></span></button>
    <button class="btn" data-command="ralphCodex.runWatchdogAgent" onclick="runCommand(this)"><span class="btn-label">⬡ Watch</span><span class="btn-spinner"></span></button>
    <button class="btn" data-command="ralphCodex.runScmAgent" onclick="runCommand(this)"><span class="btn-label">⎔ SCM</span><span class="btn-spinner"></span></button>
  </div>

  <div class="section-label">Actions</div>
  <hr class="section-rule">
  <div class="btn-grid">
    <button class="btn" data-command="ralphCodex.runRalphLoop" onclick="runCommand(this)"><span class="btn-label">▸ Run Loop</span><span class="btn-spinner"></span></button>
    <button class="btn" data-command="ralphCodex.runRalphIteration" onclick="runCommand(this)"><span class="btn-label">▸ Run Iter</span><span class="btn-spinner"></span></button>
    <button class="btn" data-command="ralphCodex.generatePrompt" onclick="runCommand(this)"><span class="btn-label">⎙ Prep Prompt</span><span class="btn-spinner"></span></button>
    <button class="btn" data-command="ralphCodex.initializeWorkspace" onclick="runCommand(this)"><span class="btn-label">⏻ Init</span><span class="btn-spinner"></span></button>
  </div>

  <button class="open-dashboard" onclick="runCommand(this)" data-command="ralphCodex.openDashboard">Open Dashboard</button>

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

    window.addEventListener('message', function(event) {
      var msg = event.data;
      if (msg.type === 'phase') {
        var indicator = document.querySelector('.phase-indicator');
        if (indicator) {
          indicator.textContent = 'iter ' + msg.iteration + ' · ' + msg.phase;
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
  </script>
</body>
</html>`;
}
