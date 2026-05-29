"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildWebviewUiHtml = buildWebviewUiHtml;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("node:fs"));
/**
 * Static page shown only when the bundled webview UI is absent from disk
 * (`out/webview-ui/main.{js,css}`). In a shipped extension the bundle is always
 * present — it is committed and rebuilt by `vscode:prepublish` — so reaching
 * this means the build step did not run. There is intentionally no string-
 * template UI fallback: the React tree under `src/webview-ui/` is the single
 * renderer. See docs/architecture.md (UI ownership).
 */
function buildMissingBundleHtml(mode, nonce) {
    const csp = [
        "default-src 'none'",
        `style-src 'nonce-${nonce}'`
    ].join('; ');
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style nonce="${nonce}">
    body { font-family: var(--vscode-font-family, sans-serif); color: var(--vscode-foreground); padding: 1.25rem; line-height: 1.5; }
    h1 { font-size: 1rem; margin: 0 0 .5rem; }
    code { font-family: var(--vscode-editor-font-family, monospace); background: var(--vscode-textCodeBlock-background); padding: .1rem .3rem; border-radius: 3px; }
  </style>
</head>
<body data-ralph-mode="${mode}">
  <h1>Ralphdex UI failed to load</h1>
  <p>The webview bundle (<code>out/webview-ui/main.js</code>) is missing. Run <code>npm run compile</code> to rebuild it, then reopen this view.</p>
</body>
</html>`;
}
function escapeBootstrapJson(value) {
    return JSON.stringify(value)
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/&/g, '\\u0026')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
}
function buildWebviewUiHtml(input) {
    const scriptPath = vscode.Uri.joinPath(input.extensionUri, 'out', 'webview-ui', 'main.js');
    const stylePath = vscode.Uri.joinPath(input.extensionUri, 'out', 'webview-ui', 'main.css');
    if (!fs.existsSync(scriptPath.fsPath) || !fs.existsSync(stylePath.fsPath)) {
        return buildMissingBundleHtml(input.mode, input.nonce);
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
//# sourceMappingURL=reactWebviewHtml.js.map