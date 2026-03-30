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
  gap: 24px;
  margin-top: 18px;
}

.card {
  border: 1px solid var(--ralph-border);
  padding: 14px 16px;
  margin-bottom: 18px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--ralph-amber) 2%, transparent);
}

.card-title {
  font-size: 14px;
  font-weight: bold;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--ralph-amber);
  margin-bottom: 10px;
  background: color-mix(in srgb, var(--ralph-amber) 7%, transparent);
  padding: 6px 8px 4px 0;
  border-radius: 4px;
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

/* Legacy group title — kept for compatibility */
.settings-group-title {
  font-size: 10px;
  font-weight: bold;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--ralph-amber);
  margin: 8px 0 4px 0;
  grid-column: 1 / -1;
}

/* Key-value editor */
.kv-editor { display: flex; flex-direction: column; gap: 4px; }
.kv-row { display: flex; gap: 4px; align-items: center; }
.kv-row input.kv-key { flex: 1; }
.kv-row input.kv-value { width: 60px; }
.kv-remove, .kv-add {
  font-family: var(--ralph-font);
  font-size: 10px;
  background: transparent;
  border: 1px solid var(--ralph-border);
  color: var(--ralph-dim);
  cursor: pointer;
  padding: 2px 6px;
}
.kv-remove:hover, .kv-add:hover {
  border-color: var(--ralph-amber);
  color: var(--ralph-amber);
}

/* Collapsible settings sections */
.settings-section { border-bottom: 1px solid var(--ralph-border); }
.settings-section:last-child { border-bottom: none; }

.settings-section-toggle {
  font-family: var(--ralph-font);
  font-size: 10px;
  font-weight: bold;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--ralph-amber);
  cursor: pointer;
  padding: 6px 0;
  list-style: none;
}
.settings-section-toggle::-webkit-details-marker { display: none; }
.settings-section-toggle::before { content: '▸ '; font-size: 10px; }
details[open] > .settings-section-toggle::before { content: '▾ '; }

.settings-section > .settings-grid {
  padding: 4px 0 8px 0;
}

/* Advanced section (same styling, dimmer) */
.settings-advanced-toggle {
  font-family: var(--ralph-font);
  font-size: 10px;
  color: var(--ralph-dim);
  cursor: pointer;
  padding: 6px 0;
  list-style: none;
  letter-spacing: 1px;
  text-transform: uppercase;
}
.settings-advanced-toggle::-webkit-details-marker { display: none; }
.settings-advanced-toggle::before { content: '▸ '; font-size: 10px; }
details[open] > .settings-advanced-toggle::before { content: '▾ '; }
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

function multiCheckbox(key: string, selected: string[], allOptions: readonly string[]): string {
  return allOptions.map((opt) => {
    const checked = selected.includes(opt) ? ' checked' : '';
    return `<label class="setting-check">
      <input type="checkbox" data-setting-multi="${esc(key)}" value="${esc(opt)}"${checked}> ${esc(opt)}
    </label>`;
  }).join('');
}

function keyValueEditor(key: string, map: Partial<Record<string, number>>): string {
  const entries = Object.entries(map);
  const rows = entries.map(([k, v]) =>
    `<div class="kv-row" data-setting-kv="${esc(key)}">
      <input type="text" class="kv-key" value="${esc(k)}" placeholder="key">
      <input type="number" class="kv-value" value="${v}" min="0">
      <button class="kv-remove" title="Remove">✕</button>
    </div>`
  ).join('');
  return `<div class="kv-editor" data-setting-kv-group="${esc(key)}">
    ${rows}
    <button class="kv-add" data-setting-kv-add="${esc(key)}">+ Add entry</button>
  </div>`;
}

function nestedInput(parentKey: string, subKey: string, type: 'text' | 'number' | 'checkbox', value: string | number | boolean, label?: string): string {
  const fullKey = `${parentKey}.${subKey}`;
  if (type === 'checkbox') {
    return `<label class="setting-check">
      <input type="checkbox" data-setting-nested="${esc(fullKey)}"${value ? ' checked' : ''}> ${esc(label ?? subKey)}
    </label>`;
  }
  if (type === 'number') {
    return `<input type="number" data-setting-nested="${esc(fullKey)}" value="${value}">`;
  }
  return `<input type="text" data-setting-nested="${esc(fullKey)}" value="${esc(String(value))}">`;
}

function buildSettingsSection(cfg: RalphDashboardConfigSnapshot): string {
  function group(title: string, content: string, open = false): string {
    const sectionId = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return `<details class="settings-section" data-section="${esc(sectionId)}"${open ? ' open' : ''}>
      <summary class="settings-section-toggle">${esc(title)}</summary>
      <div class="settings-grid">${content}</div>
    </details>`;
  }

  function row(label: string, control: string, full = false): string {
    return `<div class="setting-row"${full ? ' style="grid-column: 1 / -1"' : ''}>
      <span class="setting-label">${esc(label)}</span>
      <div class="setting-control">${control}</div>
    </div>`;
  }

  function checkRow(control: string): string {
    return `<div class="setting-row" style="grid-column: 1 / -1">${control}</div>`;
  }

  const sections = [
    group('Provider & Model', [
      row('CLI Provider', select('cliProvider', cfg.cliProvider, ['codex', 'claude'])),
      row('Model', textInput('model', cfg.model)),
      row('Reasoning Effort', select('reasoningEffort', cfg.reasoningEffort, ['medium', 'high'])),
      row('Prompt Budget', select('promptBudgetProfile', cfg.promptBudgetProfile, ['codex', 'claude', 'custom']))
    ].join('\n'), true),

    group('Agent', [
      row('Role', select('agentRole', cfg.agentRole, ['build', 'review', 'watchdog', 'scm'])),
      row('Agent ID', textInput('agentId', cfg.agentId)),
      row('Agent Count', numberInput('agentCount', cfg.agentCount, 1, 20)),
      row('Autonomy', select('autonomyMode', cfg.autonomyMode, ['supervised', 'autonomous']))
    ].join('\n'), true),

    group('Execution', [
      row('Iteration Cap', numberInput('ralphIterationCap', cfg.ralphIterationCap, 1, 100)),
      row('Handoff Mode', select('preferredHandoffMode', cfg.preferredHandoffMode, ['ideCommand', 'clipboard', 'cliExec'])),
      row('No-Progress Stop', numberInput('noProgressThreshold', cfg.noProgressThreshold, 1, 20)),
      row('Failure Stop', numberInput('repeatedFailureThreshold', cfg.repeatedFailureThreshold, 1, 20))
    ].join('\n')),

    group('Claude CLI', [
      row('Max Turns', numberInput('claudeMaxTurns', cfg.claudeMaxTurns, 1, 500)),
      row('Permission Mode', select('claudePermissionMode', cfg.claudePermissionMode, ['dangerously-skip-permissions', 'default']))
    ].join('\n')),

    group('Codex CLI', [
      row('Approval Mode', select('approvalMode', cfg.approvalMode, ['never', 'on-request', 'untrusted'])),
      row('Sandbox Mode', select('sandboxMode', cfg.sandboxMode, ['read-only', 'workspace-write', 'danger-full-access']))
    ].join('\n')),

    group('SCM & Git', [
      row('SCM Strategy', select('scmStrategy', cfg.scmStrategy, ['none', 'commit-on-done', 'branch-per-task'])),
      row('Git Checkpoint', select('gitCheckpointMode', cfg.gitCheckpointMode, ['off', 'snapshot', 'snapshotAndDiff'])),
      checkRow(checkbox('scmPrOnParentDone', cfg.scmPrOnParentDone, 'Create PR on parent done'))
    ].join('\n')),

    group('Behaviour', [
      checkRow(checkbox('stopOnHumanReviewNeeded', cfg.stopOnHumanReviewNeeded, 'Stop on human review needed')),
      checkRow(checkbox('clipboardAutoCopy', cfg.clipboardAutoCopy, 'Auto-copy prompts to clipboard')),
      checkRow(checkbox('autoReplenishBacklog', cfg.autoReplenishBacklog, 'Auto-replenish backlog')),
      checkRow(checkbox('autoReloadOnControlPlaneChange', cfg.autoReloadOnControlPlaneChange, 'Auto-reload on control plane change'))
    ].join('\n')),

    group('Paths', [
      row('Codex Command Path', textInput('codexCommandPath', cfg.codexCommandPath)),
      row('Claude Command Path', textInput('claudeCommandPath', cfg.claudeCommandPath)),
      row('Inspection Root Override', textInput('inspectionRootOverride', cfg.inspectionRootOverride)),
      row('Artifact Retention Path', textInput('artifactRetentionPath', cfg.artifactRetentionPath)),
      row('Task File Path', textInput('ralphTaskFilePath', cfg.ralphTaskFilePath)),
      row('PRD Path', textInput('prdPath', cfg.prdPath)),
      row('Progress Path', textInput('progressPath', cfg.progressPath)),
      row('Prompt Template Directory', textInput('promptTemplateDirectory', cfg.promptTemplateDirectory))
    ].join('\n')),

    group('Verifier', [
      row('Verifier Modes', multiCheckbox('verifierModes', cfg.verifierModes, ['validationCommand', 'gitDiff', 'taskState']), true),
      row('Validation Command Override', textInput('validationCommandOverride', cfg.validationCommandOverride))
    ].join('\n')),

    group('Prompt', [
      row('Prior Context Budget', numberInput('promptPriorContextBudget', cfg.promptPriorContextBudget, 0, 100000)),
      checkRow(checkbox('promptIncludeVerifierFeedback', cfg.promptIncludeVerifierFeedback, 'Include verifier feedback')),
      row('Custom Prompt Budget', keyValueEditor('customPromptBudget', cfg.customPromptBudget), true)
    ].join('\n')),

    group('Retention', [
      row('Artifact Retention Count', numberInput('generatedArtifactRetentionCount', cfg.generatedArtifactRetentionCount, 0, 100)),
      row('Provenance Bundle Count', numberInput('provenanceBundleRetentionCount', cfg.provenanceBundleRetentionCount, 0, 100))
    ].join('\n')),

    group('Timing', [
      row('Watchdog Stale TTL (ms)', numberInput('watchdogStaleTtlMs', cfg.watchdogStaleTtlMs, 0, 604800000)),
      row('Claim TTL (hours)', numberInput('claimTtlHours', cfg.claimTtlHours, 1, 720)),
      row('Stale Lock Threshold (min)', numberInput('staleLockThresholdMinutes', cfg.staleLockThresholdMinutes, 1, 1440))
    ].join('\n')),

    group('Remediation', [
      row('Auto-Apply Remediation', multiCheckbox('autoApplyRemediation', cfg.autoApplyRemediation, ['decompose_task', 'mark_blocked']), true)
    ].join('\n')),

    group('Model Tiering', [
      checkRow(nestedInput('modelTiering', 'enabled', 'checkbox', cfg.modelTiering.enabled, 'Enable model tiering')),
      row('Simple Model', nestedInput('modelTiering', 'simpleModel', 'text', cfg.modelTiering.simpleModel)),
      row('Medium Model', nestedInput('modelTiering', 'mediumModel', 'text', cfg.modelTiering.mediumModel)),
      row('Complex Model', nestedInput('modelTiering', 'complexModel', 'text', cfg.modelTiering.complexModel)),
      row('Simple Threshold', nestedInput('modelTiering', 'simpleThreshold', 'number', cfg.modelTiering.simpleThreshold)),
      row('Complex Threshold', nestedInput('modelTiering', 'complexThreshold', 'number', cfg.modelTiering.complexThreshold))
    ].join('\n')),

    group('Hooks', [
      row('Before Iteration', nestedInput('hooks', 'beforeIteration', 'text', cfg.hooks.beforeIteration ?? '')),
      row('After Iteration', nestedInput('hooks', 'afterIteration', 'text', cfg.hooks.afterIteration ?? '')),
      row('On Task Complete', nestedInput('hooks', 'onTaskComplete', 'text', cfg.hooks.onTaskComplete ?? '')),
      row('On Stop', nestedInput('hooks', 'onStop', 'text', cfg.hooks.onStop ?? '')),
      row('On Failure', nestedInput('hooks', 'onFailure', 'text', cfg.hooks.onFailure ?? ''))
    ].join('\n')),

    group('Advanced', [
      row('Open Sidebar Command ID', textInput('openSidebarCommandId', cfg.openSidebarCommandId)),
      row('New Chat Command ID', textInput('newChatCommandId', cfg.newChatCommandId))
    ].join('\n'), false)
  ];

  return sections.join('\n');
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
  <div class="header" style="display: flex; align-items: center; justify-content: space-between;">
    <div>
      <div class="header-title">Ralph Codex</div>
      <div class="header-state">${esc(state.workspaceName)} · ${stateLabel} · ${esc(state.agentRole)}</div>
    </div>
    <button class="help-btn" title="Help & Onboarding" style="background: none; border: none; cursor: pointer; font-size: 18px; color: var(--ralph-amber);" onclick="window.open('https://github.com/ralph-codex/docs','_blank')" aria-label="Help and onboarding">
      ?
    </button>
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
      <details class="card" data-section="settings">
        <summary class="card-title" style="cursor: pointer;">Settings</summary>
        ${state.config
          ? buildSettingsSection(state.config)
          : '<div class="empty">Config not loaded — reload window</div>'}
      </details>
    </div>

    <div class="panel-right">
      <div class="card">
        <div class="card-title">Agents</div>
        <div class="btn-grid">
          <button class="btn" data-command="ralphCodex.runRalphLoop" title="Run the main build agent (◆ Build)"><span class="btn-label">◆ Build</span><span class="btn-spinner"></span></button>
          <button class="btn" data-command="ralphCodex.runReviewAgent" title="Run the review agent (◇ Review)"><span class="btn-label">◇ Review</span><span class="btn-spinner"></span></button>
          <button class="btn" data-command="ralphCodex.runWatchdogAgent" title="Run the watchdog agent (⬡ Watch)"><span class="btn-label">⬡ Watch</span><span class="btn-spinner"></span></button>
          <button class="btn" data-command="ralphCodex.runScmAgent" title="Run the SCM agent (⎔ SCM)"><span class="btn-label">⎔ SCM</span><span class="btn-spinner"></span></button>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Actions</div>
        <div class="btn-grid">
          <button class="btn" data-command="ralphCodex.runRalphLoop"${loopDisabled} title="Run the full agent loop (▸ Run Loop)"><span class="btn-label">▸ Run Loop</span><span class="btn-spinner"></span></button>
          <button class="btn" data-command="ralphCodex.runRalphIteration"${loopDisabled} title="Run a single agent iteration (▸ Run Iter)"><span class="btn-label">▸ Run Iter</span><span class="btn-spinner"></span></button>
          <button class="btn" data-command="ralphCodex.generatePrompt" title="Prepare the next prompt (⎙ Prep Prompt)"><span class="btn-label">⎙ Prep Prompt</span><span class="btn-spinner"></span></button>
          <button class="btn" data-command="ralphCodex.initializeWorkspace" title="Initialize the workspace (⏻ Init)"><span class="btn-label">⏻ Init</span><span class="btn-spinner"></span></button>
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

      // Persist <details> open/close state across re-renders
      function saveDetailsState() {
        var state = vscode.getState() || {};
        var openSections = {};
        document.querySelectorAll('details[data-section]').forEach(function(el) {
          openSections[el.getAttribute('data-section')] = el.open;
        });
        state.openSections = openSections;
        vscode.setState(state);
      }

      function restoreDetailsState() {
        var state = vscode.getState();
        if (!state || !state.openSections) return;
        document.querySelectorAll('details[data-section]').forEach(function(el) {
          var key = el.getAttribute('data-section');
          if (key in state.openSections) {
            el.open = state.openSections[key];
          }
        });
      }

      restoreDetailsState();

      document.addEventListener('toggle', function(e) {
        if (e.target.matches('details[data-section]')) {
          saveDetailsState();
        }
      }, true);

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

        // Multi-select checkbox group
        var multiKey = el.getAttribute('data-setting-multi');
        if (multiKey) {
          var checkboxes = document.querySelectorAll('[data-setting-multi="' + multiKey + '"]');
          var selected = [];
          checkboxes.forEach(function(cb) { if (cb.checked) selected.push(cb.value); });
          vscode.postMessage({ type: 'update-setting', key: multiKey, value: selected });
          return;
        }

        // Nested object field
        var nestedKey = el.getAttribute('data-setting-nested');
        if (nestedKey) {
          var value;
          if (el.type === 'checkbox') { value = el.checked; }
          else if (el.type === 'number') { value = parseInt(el.value, 10); if (isNaN(value)) return; }
          else { value = el.value; }
          vscode.postMessage({ type: 'update-setting', key: nestedKey, value: value });
          return;
        }

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

        var kvAdd = e.target.closest('[data-setting-kv-add]');
        if (kvAdd) {
          var groupKey = kvAdd.getAttribute('data-setting-kv-add');
          var container = document.querySelector('[data-setting-kv-group="' + groupKey + '"]');
          if (container) {
            var row = document.createElement('div');
            row.className = 'kv-row';
            row.setAttribute('data-setting-kv', groupKey);
            row.innerHTML = '<input type="text" class="kv-key" value="" placeholder="key">' +
              '<input type="number" class="kv-value" value="0" min="0">' +
              '<button class="kv-remove" title="Remove">✕</button>';
            container.insertBefore(row, kvAdd);
          }
          return;
        }

        var kvRemove = e.target.closest('.kv-remove');
        if (kvRemove) {
          var kvRow = kvRemove.closest('.kv-row');
          if (kvRow) {
            var kvGroup = kvRow.getAttribute('data-setting-kv');
            kvRow.remove();
            collectAndSendKv(kvGroup);
          }
          return;
        }

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

      function collectAndSendKv(groupKey) {
        var container = document.querySelector('[data-setting-kv-group="' + groupKey + '"]');
        if (!container) return;
        var rows = container.querySelectorAll('[data-setting-kv="' + groupKey + '"]');
        var map = {};
        rows.forEach(function(row) {
          var k = row.querySelector('.kv-key').value.trim();
          var v = parseInt(row.querySelector('.kv-value').value, 10);
          if (k && !isNaN(v) && v >= 0) map[k] = v;
        });
        vscode.postMessage({ type: 'update-setting', key: groupKey, value: map });
      }

      document.addEventListener('input', function(e) {
        var kvRow = e.target.closest('.kv-row[data-setting-kv]');
        if (kvRow) {
          collectAndSendKv(kvRow.getAttribute('data-setting-kv'));
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
