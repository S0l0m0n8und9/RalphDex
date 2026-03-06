import * as path from 'path';
import * as vscode from 'vscode';
import { CodexActionResult, CodexStrategy, PromptHandoffRequest } from './types';

async function runVsCodeCommand(commandId: string, warnings: string[], warningText: string): Promise<void> {
  if (!commandId || commandId === 'none') {
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

    if (request.copyToClipboard) {
      await vscode.env.clipboard.writeText(request.prompt);
    } else {
      warnings.push('Clipboard auto-copy is disabled, so you will need to paste the generated prompt manually.');
    }

    await runVsCodeCommand(
      request.openSidebarCommandId,
      warnings,
      `The configured Codex sidebar command (${request.openSidebarCommandId}) was not available.`
    );
    await runVsCodeCommand(
      request.newChatCommandId,
      warnings,
      `The configured Codex new-chat command (${request.newChatCommandId}) was not available.`
    );

    return {
      strategy: this.id,
      success: true,
      message: `Prompt ready at ${path.basename(request.promptPath)}.`,
      warnings
    };
  }
}
