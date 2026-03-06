import * as vscode from 'vscode';
import { registerCommands } from './commands/registerCommands';
import { Logger } from './services/logger';

export function activate(context: vscode.ExtensionContext): void {
  const logger = new Logger(vscode.window.createOutputChannel('Ralph Codex'));
  context.subscriptions.push(logger);
  registerCommands(context, logger);
  logger.info('Activated Ralph Codex Workbench extension.');
}

export function deactivate(): void {
  // no-op
}
