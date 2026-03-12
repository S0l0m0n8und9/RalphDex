import * as vscode from 'vscode';
import { DEFAULT_CONFIG } from './defaults';
import {
  CodexApprovalMode,
  CodexHandoffMode,
  CodexReasoningEffort,
  CodexSandboxMode,
  RalphCodexConfig,
  RalphGitCheckpointMode,
  RalphVerifierMode
} from './types';

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

function readEnumArray<T extends string>(
  config: vscode.WorkspaceConfiguration,
  key: string,
  allowed: readonly T[],
  fallback: readonly T[]
): T[] {
  const value = config.get<unknown>(key);
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  const normalized = value.filter((item): item is T => typeof item === 'string' && allowed.includes(item as T));
  return normalized.length > 0 ? normalized : [...fallback];
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
    inspectionRootOverride: readString(
      config,
      'inspectionRootOverride',
      DEFAULT_CONFIG.inspectionRootOverride
    ),
    ralphIterationCap: readNumber(config, 'ralphIterationCap', DEFAULT_CONFIG.ralphIterationCap, 1, ['maxIterations']),
    verifierModes: readEnumArray<RalphVerifierMode>(
      config,
      'verifierModes',
      ['validationCommand', 'gitDiff', 'taskState'],
      DEFAULT_CONFIG.verifierModes
    ),
    noProgressThreshold: readNumber(
      config,
      'noProgressThreshold',
      DEFAULT_CONFIG.noProgressThreshold,
      1
    ),
    repeatedFailureThreshold: readNumber(
      config,
      'repeatedFailureThreshold',
      DEFAULT_CONFIG.repeatedFailureThreshold,
      1
    ),
    artifactRetentionPath: readString(
      config,
      'artifactRetentionPath',
      DEFAULT_CONFIG.artifactRetentionPath
    ),
    generatedArtifactRetentionCount: readNumber(
      config,
      'generatedArtifactRetentionCount',
      DEFAULT_CONFIG.generatedArtifactRetentionCount,
      0
    ),
    provenanceBundleRetentionCount: readNumber(
      config,
      'provenanceBundleRetentionCount',
      DEFAULT_CONFIG.provenanceBundleRetentionCount,
      0
    ),
    gitCheckpointMode: readEnum<RalphGitCheckpointMode>(
      config,
      'gitCheckpointMode',
      ['off', 'snapshot', 'snapshotAndDiff'],
      DEFAULT_CONFIG.gitCheckpointMode
    ),
    validationCommandOverride: readString(
      config,
      'validationCommandOverride',
      DEFAULT_CONFIG.validationCommandOverride
    ),
    stopOnHumanReviewNeeded: readBoolean(
      config,
      'stopOnHumanReviewNeeded',
      DEFAULT_CONFIG.stopOnHumanReviewNeeded
    ),
    ralphTaskFilePath: readString(config, 'ralphTaskFilePath', DEFAULT_CONFIG.ralphTaskFilePath),
    prdPath: readString(config, 'prdPath', DEFAULT_CONFIG.prdPath),
    progressPath: readString(config, 'progressPath', DEFAULT_CONFIG.progressPath),
    promptTemplateDirectory: readString(
      config,
      'promptTemplateDirectory',
      DEFAULT_CONFIG.promptTemplateDirectory
    ),
    promptIncludeVerifierFeedback: readBoolean(
      config,
      'promptIncludeVerifierFeedback',
      DEFAULT_CONFIG.promptIncludeVerifierFeedback
    ),
    promptPriorContextBudget: readNumber(
      config,
      'promptPriorContextBudget',
      DEFAULT_CONFIG.promptPriorContextBudget,
      1
    ),
    clipboardAutoCopy: readBoolean(config, 'clipboardAutoCopy', DEFAULT_CONFIG.clipboardAutoCopy),
    model: readString(config, 'model', DEFAULT_CONFIG.model),
    reasoningEffort: readEnum<CodexReasoningEffort>(
      config,
      'reasoningEffort',
      ['medium', 'high'],
      DEFAULT_CONFIG.reasoningEffort
    ),
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
