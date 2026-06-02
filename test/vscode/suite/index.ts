import assert from 'node:assert/strict';
import * as vscode from 'vscode';

const THEME_MATRIX = [
  'Default Light Modern',
  'Default Dark Modern',
  'High Contrast'
] as const;

function closeNotificationsSoon(): NodeJS.Timeout {
  return setTimeout(() => {
    void executeOptionalCommand('workbench.action.closeMessages');
  }, 750);
}

async function executeOptionalCommand(commandId: string): Promise<void> {
  try {
    await vscode.commands.executeCommand(commandId);
  } catch {
    // Best-effort cleanup only; command availability varies across VS Code builds.
  }
}

async function invokeCommandWithTimeout(commandId: string, ...args: unknown[]): Promise<void> {
  const timer = closeNotificationsSoon();
  try {
    await Promise.race([
      vscode.commands.executeCommand(commandId, ...args),
      new Promise<never>((_resolve, reject) => {
        setTimeout(() => reject(new Error(`Timed out waiting for ${commandId} to finish.`)), 10000);
      })
    ]);
  } finally {
    clearTimeout(timer);
    await executeOptionalCommand('workbench.action.closeMessages');
  }
}

async function invokeCommandForResultWithTimeout<T>(commandId: string, ...args: unknown[]): Promise<T> {
  const timer = closeNotificationsSoon();
  try {
    return await Promise.race([
      vscode.commands.executeCommand<T>(commandId, ...args),
      new Promise<never>((_resolve, reject) => {
        setTimeout(() => reject(new Error(`Timed out waiting for ${commandId} to finish.`)), 15000);
      })
    ]);
  } finally {
    clearTimeout(timer);
    await executeOptionalCommand('workbench.action.closeMessages');
  }
}

async function setColorTheme(themeName: string): Promise<void> {
  await vscode.workspace
    .getConfiguration('workbench')
    .update('colorTheme', themeName, vscode.ConfigurationTarget.Global);
  await new Promise((resolve) => setTimeout(resolve, 250));
}

async function exerciseThemeSensitiveRalphSurfaces(themeName: string): Promise<void> {
  await setColorTheme(themeName);
  await invokeCommandWithTimeout('ralphCodex.__activationSmoke.resetWebviewDiagnostics');
  await invokeCommandWithTimeout('ralphCodex.showDashboard', { activeTab: 'settings' });
  const dashboardReady = await invokeCommandForResultWithTimeout<{ mode: string; mountedText: string }>(
    'ralphCodex.__activationSmoke.awaitWebviewReady',
    'dashboard'
  );
  assert.equal(dashboardReady.mode, 'dashboard');
  assert.match(dashboardReady.mountedText, /dashboard/i);
  await executeOptionalCommand('workbench.action.closeActiveEditor');

  await invokeCommandWithTimeout('ralphCodex.__activationSmoke.resetWebviewDiagnostics');
  await invokeCommandWithTimeout('ralphCodex.openPrdWizard');
  const wizardReady = await invokeCommandForResultWithTimeout<{ mode: string; mountedText: string }>(
    'ralphCodex.__activationSmoke.awaitWebviewReady',
    'prd-wizard'
  );
  assert.equal(wizardReady.mode, 'prd-wizard');
  assert.match(wizardReady.mountedText, /wizard/i);

  await executeOptionalCommand('workbench.action.closeActiveEditor');
}

export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension('s0l0m0n8und9.ralphdex')
    ?? vscode.extensions.all.find((candidate) => candidate.packageJSON?.name === 'ralphdex');
  assert.ok(extension, 'Extension should be discoverable in the Extension Development Host.');

  await extension.activate();
  assert.equal(extension.isActive, true);

  const commands = await vscode.commands.getCommands(true);
  for (const commandId of [
    'ralphCodex.initializeWorkspace',
    'ralphCodex.generatePrompt',
    'ralphCodex.runRalphIteration',
    'ralphCodex.runRalphLoop',
    'ralphCodex.showDashboard',
    'ralphCodex.openPrdWizard',
    'ralphCodex.showRalphStatus',
    'ralphCodex.openLatestRalphSummary',
    'ralphCodex.openLatestProvenanceBundle',
    'ralphCodex.revealLatestProvenanceBundleDirectory',
    'ralphCodex.__activationSmoke.awaitWebviewReady',
    'ralphCodex.__activationSmoke.resetWebviewDiagnostics'
  ]) {
    assert.ok(commands.includes(commandId), `Expected command ${commandId} to be registered.`);
  }

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(workspaceFolder, 'Activation smoke should run against a seeded workspace folder.');
  const seededTasks = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(workspaceFolder.uri, '.ralph', 'tasks.json'));
  assert.match(Buffer.from(seededTasks).toString('utf8'), /Render seeded dashboard state/);

  const originalTheme = vscode.workspace
    .getConfiguration('workbench')
    .get<string>('colorTheme');

  try {
    for (const themeName of THEME_MATRIX) {
      await exerciseThemeSensitiveRalphSurfaces(themeName);
    }
  } finally {
    if (originalTheme) {
      await setColorTheme(originalTheme);
    }
  }
}
