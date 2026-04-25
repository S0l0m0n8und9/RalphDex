import assert from 'node:assert/strict';
import * as vscode from 'vscode';

const THEME_MATRIX = [
  'Default Light Modern',
  'Default Dark Modern',
  'High Contrast'
] as const;

function closeNotificationsSoon(): NodeJS.Timeout {
  return setTimeout(() => {
    void vscode.commands.executeCommand('workbench.action.closeMessages');
  }, 750);
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
    await vscode.commands.executeCommand('workbench.action.closeMessages');
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
  await invokeCommandWithTimeout('ralphCodex.showDashboard', { activeTab: 'settings' });
  await invokeCommandWithTimeout('ralphCodex.openPrdWizard');
  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
}

export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension('starter.ralph-codex-workbench');
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
    'ralphCodex.revealLatestProvenanceBundleDirectory'
  ]) {
    assert.ok(commands.includes(commandId), `Expected command ${commandId} to be registered.`);
  }

  await invokeCommandWithTimeout('ralphCodex.showRalphStatus');

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
