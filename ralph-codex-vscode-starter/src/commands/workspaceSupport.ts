import * as vscode from 'vscode';
import { RalphCodexConfig } from '../config/types';

export interface IdeCommandSupport {
  commandId: string;
  configured: boolean;
  available: boolean;
}

function isConfiguredCommand(commandId: string): boolean {
  return commandId.trim().length > 0 && commandId !== 'none';
}

export function requireTrustedWorkspace(commandLabel: string): void {
  if (!vscode.workspace.isTrusted) {
    throw new Error(
      `${commandLabel} requires a trusted workspace. Trust this workspace to allow Ralph file writes, VS Code command handoff, and Codex CLI execution.`
    );
  }
}

export async function inspectIdeCommandSupport(config: Pick<RalphCodexConfig, 'openSidebarCommandId' | 'newChatCommandId'>): Promise<{
  openSidebar: IdeCommandSupport;
  newChat: IdeCommandSupport;
}> {
  const availableCommands = new Set(await vscode.commands.getCommands(true));

  const openSidebar = {
    commandId: config.openSidebarCommandId,
    configured: isConfiguredCommand(config.openSidebarCommandId),
    available: isConfiguredCommand(config.openSidebarCommandId) && availableCommands.has(config.openSidebarCommandId)
  };

  const newChat = {
    commandId: config.newChatCommandId,
    configured: isConfiguredCommand(config.newChatCommandId),
    available: isConfiguredCommand(config.newChatCommandId) && availableCommands.has(config.newChatCommandId)
  };

  return { openSidebar, newChat };
}
