import * as fs from 'fs/promises';
import * as path from 'path';
import { CodexHandoffMode } from '../config/types';

export interface CodexCliSupport {
  commandPath: string;
  configuredAs: 'explicitPath' | 'pathLookup';
  check: 'pathLookupAssumed' | 'pathVerifiedExecutable' | 'pathMissing' | 'pathNotExecutable';
  confidence: 'assumed' | 'verified' | 'blocked';
}

export interface CodexIdeCommandSupport {
  preferredHandoffMode: CodexHandoffMode;
  status: 'available' | 'unavailable' | 'notRequired';
  openSidebarCommandId: string;
  newChatCommandId: string;
  missingCommandIds: string[];
}

function usesExplicitPath(commandPath: string): boolean {
  return path.isAbsolute(commandPath) || commandPath.includes(path.sep) || commandPath.includes('/');
}

async function isExecutable(commandPath: string): Promise<boolean> {
  try {
    await fs.access(commandPath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export async function inspectCodexCliSupport(commandPath: string): Promise<CodexCliSupport> {
  if (!usesExplicitPath(commandPath)) {
    return {
      commandPath,
      configuredAs: 'pathLookup',
      check: 'pathLookupAssumed',
      confidence: 'assumed'
    };
  }

  try {
    await fs.access(commandPath);
    if (!(await isExecutable(commandPath))) {
      return {
        commandPath,
        configuredAs: 'explicitPath',
        check: 'pathNotExecutable',
        confidence: 'blocked'
      };
    }

    return {
      commandPath,
      configuredAs: 'explicitPath',
      check: 'pathVerifiedExecutable',
      confidence: 'verified'
    };
  } catch {
    return {
      commandPath,
      configuredAs: 'explicitPath',
      check: 'pathMissing',
      confidence: 'blocked'
    };
  }
}

function commandIsDisabled(commandId: string): boolean {
  return !commandId || commandId === 'none';
}

export function inspectIdeCommandSupport(input: {
  preferredHandoffMode: CodexHandoffMode;
  openSidebarCommandId: string;
  newChatCommandId: string;
  availableCommands: readonly string[];
}): CodexIdeCommandSupport {
  if (input.preferredHandoffMode !== 'ideCommand') {
    return {
      preferredHandoffMode: input.preferredHandoffMode,
      status: 'notRequired',
      openSidebarCommandId: input.openSidebarCommandId,
      newChatCommandId: input.newChatCommandId,
      missingCommandIds: []
    };
  }

  const availableCommands = new Set(input.availableCommands);
  const candidateCommandIds = [input.openSidebarCommandId, input.newChatCommandId]
    .filter((commandId) => !commandIsDisabled(commandId));
  const missingCommandIds = candidateCommandIds.filter((commandId) => !availableCommands.has(commandId));
  const configuredCommandCount = candidateCommandIds.length;

  return {
    preferredHandoffMode: input.preferredHandoffMode,
    status: configuredCommandCount > 0 && missingCommandIds.length === 0 ? 'available' : 'unavailable',
    openSidebarCommandId: input.openSidebarCommandId,
    newChatCommandId: input.newChatCommandId,
    missingCommandIds: configuredCommandCount > 0
      ? missingCommandIds
      : [input.openSidebarCommandId, input.newChatCommandId].filter((commandId) => commandIsDisabled(commandId) || !availableCommands.has(commandId))
  };
}
