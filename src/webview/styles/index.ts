/**
 * Exports the shared Ralphdex webview stylesheet as an inline string so it
 * can be embedded inside a `<style nonce="…">` tag in generated webview HTML.
 *
 * Keep this file in sync with `shared.css` (the CSS source lives next to this
 * file for editor tooling; the string here is the runtime copy).
 */
export const SHARED_WEBVIEW_CSS = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--vscode-font-family);font-size:var(--vscode-font-size);font-weight:var(--vscode-font-weight);color:var(--vscode-editor-foreground);background-color:var(--vscode-editor-background);line-height:1.4;padding:8px 12px}
h1,h2,h3{font-weight:600;margin-bottom:6px}
h1{font-size:1.15em}h2{font-size:1.05em}h3{font-size:0.95em}
a{color:var(--vscode-textLink-foreground);text-decoration:none}
a:hover{text-decoration:underline;color:var(--vscode-textLink-activeForeground)}
button{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;border-radius:2px;padding:4px 10px;font-size:var(--vscode-font-size);font-family:var(--vscode-font-family);cursor:pointer}
button:hover{background:var(--vscode-button-hoverBackground)}
button:focus{outline:1px solid var(--vscode-focusBorder);outline-offset:2px}
input,textarea{background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border,transparent);border-radius:2px;padding:3px 6px;font-size:var(--vscode-font-size);font-family:var(--vscode-font-family)}
select{background:var(--vscode-dropdown-background, var(--vscode-input-background));color:var(--vscode-dropdown-foreground, var(--vscode-input-foreground));border:1px solid var(--vscode-input-border,transparent);border-radius:2px;padding:3px 6px;font-size:var(--vscode-font-size);font-family:var(--vscode-font-family)}
select option{background:var(--vscode-dropdown-background, var(--vscode-input-background));color:var(--vscode-dropdown-foreground, var(--vscode-input-foreground))}
select option:checked{background:var(--vscode-list-activeSelectionBackground, var(--vscode-dropdown-background));color:var(--vscode-list-activeSelectionForeground, var(--vscode-dropdown-foreground))}
input:focus,select:focus,textarea:focus{outline:1px solid var(--vscode-focusBorder);border-color:var(--vscode-focusBorder)}
.empty{color:var(--vscode-descriptionForeground);font-style:italic;padding:4px 0}
.section{margin-bottom:12px}
.section-title{font-size:.85em;text-transform:uppercase;letter-spacing:.04em;color:var(--vscode-descriptionForeground);margin-bottom:4px}
`.trim();
