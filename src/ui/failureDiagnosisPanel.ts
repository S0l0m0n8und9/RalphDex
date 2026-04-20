import * as vscode from 'vscode';
import type { DiagnosisSection } from '../webview/dashboardSnapshot';
import type { WebviewPanelManager } from '../webview/WebviewPanelManager';

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderFailureDiagnosisHtml(diagnosis: DiagnosisSection): string {
  const nonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const payload = JSON.stringify(diagnosis)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Failure Diagnosis</title>
  <style nonce="${nonce}">
    :root {
      color-scheme: light dark;
      --bg: #1e1e22;
      --panel: #1e1e22;
      --panel-alt: #2a2a2e;
      --text: var(--vscode-foreground, #cccccc);
      --muted: color-mix(in srgb, var(--text) 55%, transparent);
      --accent: #f5b041;
      --ok: #5bd69c;
      --warn: #f5a14d;
      --bad: #eb5e5e;
      --border: rgba(255, 255, 255, 0.08);
    }
    body {
      margin: 0;
      padding: 24px;
      font-family: var(--vscode-editor-font-family, Consolas, 'Courier New', monospace);
      background: radial-gradient(circle at top right, rgba(245, 176, 65, 0.15), transparent 40%), var(--bg);
      color: var(--text);
    }
    .shell {
      max-width: 880px;
      margin: 0 auto;
      display: grid;
      gap: 16px;
    }
    .card {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 18px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.25);
    }
    .eyebrow {
      color: var(--accent);
      text-transform: uppercase;
      letter-spacing: 0.12em;
      font-size: 11px;
      font-weight: 700;
      margin-bottom: 8px;
    }
    h1 {
      margin: 0 0 10px;
      font-size: 24px;
      line-height: 1.2;
      font-weight: 800;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      color: var(--muted);
      font-size: 11px;
    }
    .pill {
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 4px 12px;
      background: var(--panel-alt);
      color: var(--muted);
      font-weight: 600;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 14px;
    }
    .label {
      color: var(--muted);
      font-size: 12px;
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .value {
      font-size: 15px;
      line-height: 1.5;
      white-space: pre-wrap;
    }
    .paths {
      font-size: 13px;
      color: var(--muted);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    button {
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--panel-alt);
      color: var(--text);
      padding: 10px 14px;
      cursor: pointer;
      font: inherit;
    }
    button.primary {
      border-color: rgba(125, 211, 252, 0.45);
      color: var(--accent);
    }
    .warning {
      color: var(--warn);
    }
  </style>
</head>
<body>
  <div class="shell">
    <section class="card">
      <div class="eyebrow">Focused Diagnosis</div>
      <h1>${esc(diagnosis.taskId)} · ${esc(diagnosis.taskTitle)}</h1>
      <div class="meta">
        <span class="pill">Category ${esc(diagnosis.category)}</span>
        <span class="pill">Confidence ${esc(diagnosis.confidence)}</span>
        <span class="pill">Recovery attempts ${diagnosis.recoveryAttemptCount ?? 0}</span>
      </div>
    </section>
    <section class="grid">
      <div class="card">
        <div class="label">Cause</div>
        <div class="value">${esc(diagnosis.summary)}</div>
      </div>
      <div class="card">
        <div class="label">Suggested Action</div>
        <div class="value">${esc(diagnosis.suggestedAction)}</div>
      </div>
      <div class="card">
        <div class="label">Remediation Context</div>
        <div class="value">${esc(diagnosis.remediationSummary ?? 'No remediation summary recorded yet.')}</div>
      </div>
      <div class="card">
        <div class="label">Retry Prompt Addendum</div>
        <div class="value">${esc(diagnosis.retryPromptAddendum ?? 'No retry addendum recorded.')}</div>
      </div>
    </section>
    <section class="card">
      <div class="label">Durable Evidence</div>
      <div class="paths">failure-analysis.json: ${esc(diagnosis.failureAnalysisPath ?? 'none')}</div>
      <div class="paths">recovery-state.json: ${esc(diagnosis.recoveryStatePath ?? 'none')}</div>
    </section>
    <section class="card">
      <div class="label">Recovery Actions</div>
      <div class="actions">
        <button class="primary" data-command="ralphCodex.autoRecoverTask">Auto-Recover</button>
        <button data-command="ralphCodex.skipTask">Skip Task</button>
        <button data-command="ralphCodex.showDashboard">Open Dashboard</button>
      </div>
      <div class="paths warning" style="margin-top:12px;">Auto-Recover reuses Ralph's existing retry or remediation routes. Skip Task marks the selected task blocked while preserving the recorded failure evidence.</div>
    </section>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const DIAGNOSIS = ${payload};
    for (const button of document.querySelectorAll('button[data-command]')) {
      button.addEventListener('click', () => {
        const command = button.getAttribute('data-command');
        if (!command) {
          return;
        }
        vscode.postMessage({ type: 'command', command, taskId: DIAGNOSIS.taskId });
      });
    }
  </script>
</body>
</html>`;
}

export class FailureDiagnosisPanel implements vscode.Disposable {
  public static readonly viewType = 'ralphCodex.failureDiagnosisPanel';
  public static currentPanel: FailureDiagnosisPanel | undefined;

  private constructor(private readonly panel: vscode.WebviewPanel, diagnosis: DiagnosisSection) {
    this.panel.webview.options = { enableScripts: true };
    this.setDiagnosis(diagnosis);
    this.panel.webview.onDidReceiveMessage(async (message: { type?: string; command?: string; taskId?: string }) => {
      if (message.type !== 'command' || !message.command) {
        return;
      }
      await vscode.commands.executeCommand(message.command, message.taskId);
    });
    this.panel.onDidDispose(() => this.dispose());
  }

  public static createOrReveal(manager: WebviewPanelManager, diagnosis: DiagnosisSection): void {
    const panel = manager.createOrReveal('failure-diagnosis', {
      viewType: FailureDiagnosisPanel.viewType,
      title: `Failure Diagnosis: ${diagnosis.taskId}`,
      viewColumn: vscode.ViewColumn.Beside,
      options: { enableScripts: true, retainContextWhenHidden: true }
    });

    if (FailureDiagnosisPanel.currentPanel) {
      FailureDiagnosisPanel.currentPanel.panel.title = `Failure Diagnosis: ${diagnosis.taskId}`;
      FailureDiagnosisPanel.currentPanel.setDiagnosis(diagnosis);
      return;
    }

    FailureDiagnosisPanel.currentPanel = new FailureDiagnosisPanel(panel, diagnosis);
  }

  private setDiagnosis(diagnosis: DiagnosisSection): void {
    this.panel.webview.html = renderFailureDiagnosisHtml(diagnosis);
  }

  public dispose(): void {
    FailureDiagnosisPanel.currentPanel = undefined;
  }
}
