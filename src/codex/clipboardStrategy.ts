import * as path from 'path';
import * as vscode from 'vscode';
import { CodexActionResult, CodexStrategy, PromptHandoffRequest } from './types';

export class ClipboardCodexStrategy implements CodexStrategy {
  public readonly id = 'clipboard' as const;

  public async handoffPrompt(request: PromptHandoffRequest): Promise<CodexActionResult> {
    const warnings: string[] = [];

    if (request.copyToClipboard) {
      await vscode.env.clipboard.writeText(request.prompt);
    } else {
      warnings.push('Clipboard auto-copy is disabled, so the prompt was only written to disk.');
    }

    return {
      strategy: this.id,
      success: true,
      message: `Prompt ready at ${path.basename(request.promptPath)}.`,
      warnings
    };
  }
}
