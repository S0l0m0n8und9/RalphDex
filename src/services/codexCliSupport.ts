import * as fs from 'fs/promises';
import * as path from 'path';
import { getCliProviderLabel } from '../config/providers';
import { CliProviderId, CodexHandoffMode } from '../config/types';

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
    await fs.access(commandPath, process.platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function pathEntryExists(candidatePath: string): Promise<boolean> {
  try {
    await fs.access(candidatePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function candidateExtensionsForLookup(commandPath: string): string[] {
  if (process.platform !== 'win32') {
    return [''];
  }

  const ext = path.extname(commandPath);
  if (ext) {
    return [''];
  }

  const pathExt = (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD;.PS1')
    .split(';')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return ['', ...pathExt];
}

async function resolveCommandFromPath(commandPath: string): Promise<string | null> {
  const pathValue = process.env.PATH ?? '';
  const pathEntries = pathValue
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  for (const entry of pathEntries) {
    for (const extension of candidateExtensionsForLookup(commandPath)) {
      const candidatePath = path.join(entry, `${commandPath}${extension}`);
      if (!(await pathEntryExists(candidatePath))) {
        continue;
      }

      if (await isExecutable(candidatePath)) {
        return candidatePath;
      }
    }
  }

  return null;
}

export async function inspectCodexCliSupport(commandPath: string): Promise<CodexCliSupport> {
  if (!usesExplicitPath(commandPath)) {
    const resolvedPath = await resolveCommandFromPath(commandPath);
    if (resolvedPath) {
      return {
        commandPath: resolvedPath,
        configuredAs: 'pathLookup',
        check: 'pathVerifiedExecutable',
        confidence: 'verified'
      };
    }

    return {
      commandPath,
      configuredAs: 'pathLookup',
      check: 'pathMissing',
      confidence: 'blocked'
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

export interface CliSupportResult extends CodexCliSupport {
  provider: CliProviderId;
  configKey: string;
}

export async function inspectCliSupport(
  provider: CliProviderId,
  commandPath: string
): Promise<CliSupportResult> {
  const base = await inspectCodexCliSupport(commandPath);
  const configKey = provider === 'claude'
    ? 'ralphCodex.claudeCommandPath'
    : provider === 'copilot'
      ? 'ralphCodex.copilotCommandPath'
      : provider === 'copilot-foundry'
        ? 'ralphCodex.copilotFoundry.commandPath'
        : provider === 'azure-foundry'
          ? 'ralphCodex.azureFoundry.commandPath'
          : 'ralphCodex.codexCommandPath';
  return {
    ...base,
    provider,
    configKey
  };
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
