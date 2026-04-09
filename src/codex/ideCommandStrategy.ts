import * as path from 'path';
import * as vscode from 'vscode';
import { CodexActionResult, CodexStrategy, PromptHandoffRequest } from './types';

async function runVsCodeCommand(
  commandId: string,
  availableCommands: Set<string>,
  warnings: string[],
  warningText: string
): Promise<void> {
  if (!commandId || commandId === 'none') {
    return;
  }

  if (!availableCommands.has(commandId)) {
    warnings.push(warningText);
    return;
  }

  try {
    await vscode.commands.executeCommand(commandId);
  } catch {
    warnings.push(warningText);
  }
}

export class IdeCommandCodexStrategy implements CodexStrategy {
  public readonly id = 'ideCommand' as const;

  public async handoffPrompt(request: PromptHandoffRequest): Promise<CodexActionResult> {
    const warnings: string[] = [];
    const availableCommands = new Set(await vscode.commands.getCommands(true));

    if (request.copyToClipboard) {
      await vscode.env.clipboard.writeText(request.prompt);
    } else {
      warnings.push('Clipboard auto-copy is disabled, so you will need to paste the generated prompt manually.');
    }

    await runVsCodeCommand(
      request.openSidebarCommandId,
      availableCommands,
      warnings,
      `The configured Codex sidebar command (${request.openSidebarCommandId}) was not available.`
    );
    await runVsCodeCommand(
      request.newChatCommandId,
      availableCommands,
      warnings,
      `The configured Codex new-chat command (${request.newChatCommandId}) was not available.`
    );

    const success = warnings.length === 0;

    return {
      strategy: this.id,
      success,
      message: success
        ? `Prompt ready at ${path.basename(request.promptPath)}.`
        : `Prompt copied to the clipboard from ${path.basename(request.promptPath)}. Open Codex manually and paste it.`,
      warnings
    };
  }
}
