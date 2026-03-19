import * as vscode from 'vscode';
import { registerCommands } from './commands/registerCommands';
import { readConfig } from './config/readConfig';
import { Logger } from './services/logger';

export function activate(context: vscode.ExtensionContext): void {
  const logger = new Logger(vscode.window.createOutputChannel('Ralph Codex'));
  context.subscriptions.push(logger);
  registerCommands(context, logger);
  logger.info('Activated Ralph Codex Workbench extension.', {
    workspaceTrusted: vscode.workspace.isTrusted,
    activationMode: vscode.workspace.isTrusted ? 'full' : 'limited'
  });

  if (!vscode.workspace.workspaceFolders?.length) {
    logger.info('Effective Ralph autonomy configuration unavailable at activation because no workspace folder is open.');
    return;
  }

  for (const workspaceFolder of vscode.workspace.workspaceFolders) {
    const config = readConfig(workspaceFolder);
    logger.info('Effective Ralph autonomy configuration.', {
      workspaceFolder: workspaceFolder.name,
      autonomyMode: config.autonomyMode,
      autoReloadOnControlPlaneChange: config.autoReloadOnControlPlaneChange,
      autoApplyRemediation: config.autoApplyRemediation,
      autoReplenishBacklog: config.autoReplenishBacklog
    });
  }
}

export function deactivate(): void {
  // no-op
}
