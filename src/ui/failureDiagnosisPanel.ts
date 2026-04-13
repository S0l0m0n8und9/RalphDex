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
      --bg: #0f172a;
      --panel: #111827;
      --panel-alt: #172033;
      --text: #e5eefc;
      --muted: #9db0cc;
      --accent: #7dd3fc;
      --warn: #fbbf24;
      --border: rgba(157, 176, 204, 0.22);
    }
    body {
      margin: 0;
      padding: 24px;
      font-family: Consolas, 'Courier New', monospace;
      background: radial-gradient(circle at top right, rgba(125, 211, 252, 0.18), transparent 32%), var(--bg);
      color: var(--text);
    }
    .shell {
      max-width: 880px;
      margin: 0 auto;
      display: grid;
      gap: 16px;
    }
    .card {
      background: linear-gradient(180deg, rgba(23, 32, 51, 0.95), rgba(15, 23, 42, 0.95));
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 18px;
      box-shadow: 0 16px 36px rgba(0, 0, 0, 0.24);
    }
    .eyebrow {
      color: var(--accent);
      text-transform: uppercase;
      letter-spacing: 0.12em;
      font-size: 12px;
      margin-bottom: 8px;
    }
    h1 {
      margin: 0 0 10px;
      font-size: 26px;
      line-height: 1.2;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      color: var(--muted);
      font-size: 13px;
    }
    .pill {
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 6px 10px;
      background: rgba(17, 24, 39, 0.7);
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
