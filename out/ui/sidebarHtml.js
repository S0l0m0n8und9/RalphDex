"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDashboardHtml = buildDashboardHtml;
const htmlHelpers_1 = require("./htmlHelpers");
// ---------------------------------------------------------------------------
// Sidebar-specific CSS (compact launcher)
// ---------------------------------------------------------------------------
function buildSidebarCss() {
    return `
${(0, htmlHelpers_1.buildBaseCss)()}

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
  border: 1px solid var(--ralph-border);
  border-radius: 6px;
}

.seed-block textarea:focus {
  outline: none;
  border-color: var(--ralph-amber);
}

.seed-result {
  margin-top: 8px;
  font-size: 11px;
  padding: 8px;
  border: 1px solid var(--ralph-border);
  border-radius: 6px;
}

.seed-result.success {
  border-color: var(--ralph-green);
  color: var(--ralph-green);
}

.seed-result.error {
  border-color: var(--ralph-orange);
  color: var(--ralph-orange);
}
`;
}
// ---------------------------------------------------------------------------
// Sidebar HTML — lightweight launcher
// ---------------------------------------------------------------------------
function buildDashboardHtml(state, nonce) {
    const stateLabel = htmlHelpers_1.LOOP_STATE_LABEL[state.loopState];
    // Compact phase indicator (single line per active lane)
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
        ? `<div class="seed-result ${state.taskSeeding.phase === 'success' ? 'success' : state.taskSeeding.phase === 'error' ? 'error' : ''}">${(0, htmlHelpers_1.esc)(state.taskSeeding.message)}</div>`
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
<body>
  <div class="header">
    <div class="header-title">Ralphdex</div>
    <div class="header-state">${(0, htmlHelpers_1.esc)(state.workspaceName)} · ${stateLabel} · ${(0, htmlHelpers_1.esc)(state.agentRole)}</div>
  </div>

  ${phaseIndicator}

  ${(0, htmlHelpers_1.buildProgressBar)(state.taskCounts)}

  <div class="section-label">Agents</div>
  <hr class="section-rule">
  <div class="btn-grid">
    <button class="btn" data-command="ralphCodex.runRalphLoop"><span class="btn-label">◆ Build</span><span class="btn-spinner"></span></button>
    <button class="btn" data-command="ralphCodex.runReviewAgent"><span class="btn-label">◇ Review</span><span class="btn-spinner"></span></button>
    <button class="btn" data-command="ralphCodex.runWatchdogAgent"><span class="btn-label">⬡ Watch</span><span class="btn-spinner"></span></button>
    <button class="btn" data-command="ralphCodex.runScmAgent"><span class="btn-label">⎔ SCM</span><span class="btn-spinner"></span></button>
  </div>

  <div class="section-label">Actions</div>
  <hr class="section-rule">
  <div class="btn-grid">
    <button class="btn" data-command="ralphCodex.runRalphLoop"><span class="btn-label">▸ Run Loop</span><span class="btn-spinner"></span></button>
    <button class="btn" data-command="ralphCodex.runMultiAgentLoop"><span class="btn-label">▸ Run Multi</span><span class="btn-spinner"></span></button>
    <button class="btn" data-command="ralphCodex.runRalphIteration"><span class="btn-label">▸ Run Iter</span><span class="btn-spinner"></span></button>
    <button class="btn" data-command="ralphCodex.generatePrompt"><span class="btn-label">⎙ Prep Prompt</span><span class="btn-spinner"></span></button>
    <button class="btn" data-command="ralphCodex.showRalphStatus"><span class="btn-label">◫ Status</span><span class="btn-spinner"></span></button>
    <button class="btn" data-command="ralphCodex.showMultiAgentStatus"><span class="btn-label">◫ Agents</span><span class="btn-spinner"></span></button>
    <button class="btn" data-command="ralphCodex.openLatestPipelineRun"><span class="btn-label">◫ Pipeline</span><span class="btn-spinner"></span></button>
    <button class="btn" data-command="workbench.action.openSettings"><span class="btn-label">◫ Settings</span><span class="btn-spinner"></span></button>
    <button class="btn" data-command="ralphCodex.newProject"><span class="btn-label">⊞ New Project</span><span class="btn-spinner"></span></button>
    <button class="btn" data-command="ralphCodex.switchProject"><span class="btn-label">⊟ Switch Project</span><span class="btn-spinner"></span></button>
    <button class="btn" data-command="ralphCodex.initializeWorkspace"><span class="btn-label">⏻ Init</span><span class="btn-spinner"></span></button>
  </div>

  <div class="section-label">Seed Tasks</div>
  <hr class="section-rule">
  <div class="seed-block">
    <textarea data-seed-request="sidebar" placeholder="Describe the epic...">${(0, htmlHelpers_1.esc)(state.taskSeeding.requestText)}</textarea>
    <div class="btn-grid" style="margin-top: 8px;">
      <button class="btn" data-seed-submit="sidebar"><span class="btn-label">Seed Tasks</span><span class="btn-spinner"></span></button>
      <button class="btn" data-command="ralphCodex.showTasks"><span class="btn-label">Open Tasks</span><span class="btn-spinner"></span></button>
    </div>
    ${seedResult}
  </div>

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
//# sourceMappingURL=sidebarHtml.js.map