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
//# sourceMappingURL=reactWebviewHtml.js.map