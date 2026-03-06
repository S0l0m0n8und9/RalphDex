import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { getConfig } from './config';
import { runLoop, runSingleExec } from './loopRunner';
import { buildBootstrapPrompt, buildIterationPrompt } from './promptFactory';
import { scanWorkspace } from './repoScanner';

async function ensureRalphFiles(root: string): Promise<void> {
  const dir = path.join(root, '.ralph');
  await fs.mkdir(path.join(dir, 'prompts'), { recursive: true });

  const defaults: Record<string, string> = {
    [path.join(dir, 'prd.md')]: '# Product / project brief\n\nDescribe the project objective here.\n',
    [path.join(dir, 'progress.md')]: '# Progress\n\n- Initialised Ralph loop files.\n',
    [path.join(dir, 'tasks.json')]: JSON.stringify({ tasks: [{ id: 'T1', title: 'Replace this placeholder task', status: 'todo', notes: 'Seed the real task list before starting the loop.' }] }, null, 2) + '\n'
  };

  for (const [file, content] of Object.entries(defaults)) {
    try {
      await fs.access(file);
    } catch {
      await fs.writeFile(file, content, 'utf8');
    }
  }
}

async function promptForObjective(): Promise<string | undefined> {
  return vscode.window.showInputBox({
    prompt: 'What should Codex work on?',
    placeHolder: 'Example: build the first 5 Codex skills for this repo and document them in AGENTS.md'
  });
}

async function copyPrompt(prompt: string, label: string): Promise<void> {
  await vscode.env.clipboard.writeText(prompt);
  void vscode.window.showInformationMessage(`${label} copied to clipboard.`);
}

async function openCodexUiIfConfigured(): Promise<void> {
  const config = getConfig();
  if (!config.autoOpenCodexSidebar) return;

  try {
    await vscode.commands.executeCommand('chatgpt.openSidebar');
  } catch {
    // Swallow. The extension should still be useful without the Codex IDE extension installed.
  }
}

function buildWorkbenchHtml(summaryText: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Ralph Codex Workbench</title>
  <style>
    body { font-family: var(--vscode-font-family); padding: 16px; color: var(--vscode-editor-foreground); }
    button { margin-right: 8px; margin-bottom: 8px; }
    pre { white-space: pre-wrap; background: var(--vscode-textBlockQuote-background); padding: 12px; border-radius: 6px; }
  </style>
</head>
<body>
  <h2>Ralph Codex Workbench</h2>
  <p>This starter does two things:</p>
  <ol>
    <li>Creates repo-aware prompts and copies them to your clipboard for the Codex IDE extension.</li>
    <li>Runs Codex CLI in a Ralph-style fresh-iteration loop.</li>
  </ol>
  <p>
    <button onclick="send('bootstrap')">Copy bootstrap prompt</button>
    <button onclick="send('iteration')">Copy iteration prompt</button>
    <button onclick="send('singleExec')">Run single codex exec</button>
    <button onclick="send('loop')">Run Ralph loop</button>
  </p>
  <h3>Workspace scan</h3>
  <pre>${summaryText}</pre>
  <script>
    const vscode = acquireVsCodeApi();
    function send(command) { vscode.postMessage({ command }); }
  </script>
</body>
</html>`;
}

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('Ralph Codex');

  context.subscriptions.push(vscode.commands.registerCommand('ralphCodex.scanWorkspace', async () => {
    const summary = await scanWorkspace();
    const text = JSON.stringify(summary, null, 2);
    output.show(true);
    output.appendLine(text);
    void vscode.window.showInformationMessage('Workspace scan written to Ralph Codex output channel.');
  }));

  context.subscriptions.push(vscode.commands.registerCommand('ralphCodex.copyBootstrapPrompt', async () => {
    const objective = await promptForObjective();
    if (!objective) return;
    const summary = await scanWorkspace();
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) return;
    await ensureRalphFiles(folder.uri.fsPath);
    const prompt = buildBootstrapPrompt(summary, objective);
    await copyPrompt(prompt, 'Bootstrap prompt');
    await openCodexUiIfConfigured();
  }));

  context.subscriptions.push(vscode.commands.registerCommand('ralphCodex.copyIterationPrompt', async () => {
    const objective = await promptForObjective();
    if (!objective) return;
    const summary = await scanWorkspace();
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) return;
    await ensureRalphFiles(folder.uri.fsPath);
    const progressText = await fs.readFile(path.join(folder.uri.fsPath, '.ralph', 'progress.md'), 'utf8').catch(() => '');
    const tasksText = await fs.readFile(path.join(folder.uri.fsPath, '.ralph', 'tasks.json'), 'utf8').catch(() => '');
    const prompt = buildIterationPrompt({
      summary,
      objective,
      iteration: 1,
      progressText,
      tasksText
    });
    await copyPrompt(prompt, 'Iteration prompt');
    await openCodexUiIfConfigured();
  }));

  context.subscriptions.push(vscode.commands.registerCommand('ralphCodex.openCodexSidebar', async () => {
    try {
      await vscode.commands.executeCommand('chatgpt.openSidebar');
    } catch {
      void vscode.window.showWarningMessage('Codex sidebar command was not available. Install the Codex IDE extension first.');
    }
  }));

  context.subscriptions.push(vscode.commands.registerCommand('ralphCodex.newCodexThread', async () => {
    try {
      await vscode.commands.executeCommand('chatgpt.newChat');
    } catch {
      void vscode.window.showWarningMessage('Codex new thread command was not available. Install the Codex IDE extension first.');
    }
  }));

  context.subscriptions.push(vscode.commands.registerCommand('ralphCodex.runSingleExec', async () => {
    const objective = await promptForObjective();
    if (!objective) return;
    const config = getConfig();
    output.show(true);
    output.appendLine('Running single codex exec...');
    const result = await runSingleExec(config, objective, 1);
    output.appendLine(`Exit code: ${result.code}`);
    output.appendLine(`Prompt file: ${result.promptPath}`);
    if (result.transcriptPath) output.appendLine(`Transcript: ${result.transcriptPath}`);
    if (result.stdout.trim()) output.appendLine(result.stdout.trim());
    if (result.stderr.trim()) output.appendLine(result.stderr.trim());
    if (result.code !== 0) {
      throw new Error('codex exec failed. See output channel for details.');
    }
    void vscode.window.showInformationMessage('Single codex exec completed.');
  }));

  context.subscriptions.push(vscode.commands.registerCommand('ralphCodex.runLoop', async () => {
    const objective = await promptForObjective();
    if (!objective) return;
    const config = getConfig();
    output.show(true);
    await runLoop(config, {
      maxIterations: config.maxIterations,
      model: config.model,
      objective,
      approvalMode: config.approvalMode,
      sandboxMode: config.sandboxMode
    }, output);
    void vscode.window.showInformationMessage('Ralph loop completed.');
  }));

  context.subscriptions.push(vscode.commands.registerCommand('ralphCodex.openWorkbench', async () => {
    const panel = vscode.window.createWebviewPanel('ralphCodexWorkbench', 'Ralph Codex Workbench', vscode.ViewColumn.Beside, {
      enableScripts: true
    });

    const summary = await scanWorkspace().catch((error: unknown) => ({ error: error instanceof Error ? error.message : String(error) }));
    panel.webview.html = buildWorkbenchHtml(JSON.stringify(summary, null, 2));

    panel.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'bootstrap':
          await vscode.commands.executeCommand('ralphCodex.copyBootstrapPrompt');
          break;
        case 'iteration':
          await vscode.commands.executeCommand('ralphCodex.copyIterationPrompt');
          break;
        case 'singleExec':
          await vscode.commands.executeCommand('ralphCodex.runSingleExec');
          break;
        case 'loop':
          await vscode.commands.executeCommand('ralphCodex.runLoop');
          break;
        default:
          break;
      }
    });
  }));
}

export function deactivate(): void {
  // no-op
}
