import * as vscode from 'vscode';
import { DEFAULT_CONFIG } from './defaults';
import { CodexApprovalMode, CodexHandoffMode, CodexSandboxMode, RalphCodexConfig } from './types';

function readString(
  config: vscode.WorkspaceConfiguration,
  key: string,
  fallback: string,
  legacyKeys: string[] = []
): string {
  const value = config.get<string>(key);
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  for (const legacyKey of legacyKeys) {
    const legacyValue = config.get<string>(legacyKey);
    if (typeof legacyValue === 'string' && legacyValue.trim()) {
      return legacyValue.trim();
    }
  }

  return fallback;
}

function readBoolean(
  config: vscode.WorkspaceConfiguration,
  key: string,
  fallback: boolean,
  legacyKeys: string[] = []
): boolean {
  const value = config.get<boolean>(key);
  if (typeof value === 'boolean') {
    return value;
  }

  for (const legacyKey of legacyKeys) {
    const legacyValue = config.get<boolean>(legacyKey);
    if (typeof legacyValue === 'boolean') {
      return legacyValue;
    }
  }

  return fallback;
}

function readNumber(
  config: vscode.WorkspaceConfiguration,
  key: string,
  fallback: number,
  minimum: number,
  legacyKeys: string[] = []
): number {
  const value = config.get<number>(key);
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(minimum, Math.floor(value));
  }

  for (const legacyKey of legacyKeys) {
    const legacyValue = config.get<number>(legacyKey);
    if (typeof legacyValue === 'number' && Number.isFinite(legacyValue)) {
      return Math.max(minimum, Math.floor(legacyValue));
    }
  }

  return fallback;
}

function readEnum<T extends string>(
  config: vscode.WorkspaceConfiguration,
  key: string,
  allowed: readonly T[],
  fallback: T,
  legacyKeys: string[] = []
): T {
  const value = config.get<string>(key);
  if (typeof value === 'string' && allowed.includes(value as T)) {
    return value as T;
  }

  for (const legacyKey of legacyKeys) {
    const legacyValue = config.get<string>(legacyKey);
    if (typeof legacyValue === 'string' && allowed.includes(legacyValue as T)) {
      return legacyValue as T;
    }
  }

  return fallback;
}

export function readConfig(workspaceFolder: vscode.WorkspaceFolder): RalphCodexConfig {
  const config = vscode.workspace.getConfiguration('ralphCodex', workspaceFolder.uri);

  return {
    codexCommandPath: readString(config, 'codexCommandPath', DEFAULT_CONFIG.codexCommandPath, ['codexExecutable']),
    preferredHandoffMode: readEnum<CodexHandoffMode>(
      config,
      'preferredHandoffMode',
      ['ideCommand', 'clipboard', 'cliExec'],
      DEFAULT_CONFIG.preferredHandoffMode
    ),
    ralphIterationCap: readNumber(config, 'ralphIterationCap', DEFAULT_CONFIG.ralphIterationCap, 1, ['maxIterations']),
    ralphTaskFilePath: readString(config, 'ralphTaskFilePath', DEFAULT_CONFIG.ralphTaskFilePath),
    prdPath: readString(config, 'prdPath', DEFAULT_CONFIG.prdPath),
    progressPath: readString(config, 'progressPath', DEFAULT_CONFIG.progressPath),
    clipboardAutoCopy: readBoolean(config, 'clipboardAutoCopy', DEFAULT_CONFIG.clipboardAutoCopy),
    model: readString(config, 'model', DEFAULT_CONFIG.model),
    approvalMode: readEnum<CodexApprovalMode>(
      config,
      'approvalMode',
      ['never', 'on-request', 'untrusted'],
      DEFAULT_CONFIG.approvalMode
    ),
    sandboxMode: readEnum<CodexSandboxMode>(
      config,
      'sandboxMode',
      ['read-only', 'workspace-write', 'danger-full-access'],
      DEFAULT_CONFIG.sandboxMode
    ),
    openSidebarCommandId: readString(config, 'openSidebarCommandId', DEFAULT_CONFIG.openSidebarCommandId),
    newChatCommandId: readString(config, 'newChatCommandId', DEFAULT_CONFIG.newChatCommandId)
  };
}
