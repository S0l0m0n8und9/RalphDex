import assert from 'node:assert/strict';
import * as vscode from 'vscode';

function closeNotificationsSoon(): NodeJS.Timeout {
  return setTimeout(() => {
    void vscode.commands.executeCommand('workbench.action.closeMessages');
  }, 750);
}

async function invokeStatusCommand(): Promise<void> {
  const timer = closeNotificationsSoon();
  try {
    await Promise.race([
      vscode.commands.executeCommand('ralphCodex.showRalphStatus'),
      new Promise<never>((_resolve, reject) => {
        setTimeout(() => reject(new Error('Timed out waiting for ralphCodex.showRalphStatus to finish.')), 10000);
      })
    ]);
  } finally {
    clearTimeout(timer);
    await vscode.commands.executeCommand('workbench.action.closeMessages');
  }
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
    'ralphCodex.showRalphStatus',
    'ralphCodex.openLatestRalphSummary',
    'ralphCodex.openLatestProvenanceBundle',
    'ralphCodex.revealLatestProvenanceBundleDirectory'
  ]) {
    assert.ok(commands.includes(commandId), `Expected command ${commandId} to be registered.`);
  }

  await invokeStatusCommand();
}
