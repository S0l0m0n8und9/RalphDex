import * as vscode from 'vscode';
import * as fs from 'node:fs';
import type { RalphDashboardState } from '../ui/uiTypes';

export type WebviewUiMode = 'dashboard' | 'sidebar';

export interface BuildWebviewUiHtmlInput {
  mode: WebviewUiMode;
  state: RalphDashboardState;
  nonce: string;
  webview: Pick<vscode.Webview, 'asWebviewUri' | 'cspSource'>;
  extensionUri: vscode.Uri;
  fallbackHtml?: (state: RalphDashboardState, nonce: string) => string;
}

function escapeBootstrapJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function buildWebviewUiHtml(input: BuildWebviewUiHtmlInput): string {
  const scriptPath = vscode.Uri.joinPath(input.extensionUri, 'out', 'webview-ui', 'main.js');
  const stylePath = vscode.Uri.joinPath(input.extensionUri, 'out', 'webview-ui', 'main.css');

  if ((!fs.existsSync(scriptPath.fsPath) || !fs.existsSync(stylePath.fsPath)) && input.fallbackHtml) {
    return input.fallbackHtml(input.state, input.nonce);
  }

  const scriptUri = input.webview.asWebviewUri(scriptPath);
  const styleUri = input.webview.asWebviewUri(stylePath);
  const bootstrap = escapeBootstrapJson({
    mode: input.mode,
    state: input.state
  });
  const csp = [
    "default-src 'none'",
    `img-src ${input.webview.cspSource} data:`,
    `font-src ${input.webview.cspSource}`,
    `style-src ${input.webview.cspSource} 'nonce-${input.nonce}'`,
    `script-src 'nonce-${input.nonce}'`
  ].join('; ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link nonce="${input.nonce}" rel="stylesheet" href="${styleUri.toString()}">
</head>
<body>
  <div id="root" data-ralph-mode="${input.mode}">Loading Ralphdex...</div>
  <script id="ralph-webview-bootstrap" type="application/json" nonce="${input.nonce}">${bootstrap}</script>
  <script nonce="${input.nonce}" src="${scriptUri.toString()}" defer></script>
</body>
</html>`;
}
