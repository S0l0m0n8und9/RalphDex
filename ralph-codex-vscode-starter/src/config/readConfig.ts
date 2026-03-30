import * as vscode from 'vscode';
import { DEFAULT_CONFIG } from './defaults';
import {
  AutoApplyRemediationAction,
  ClaudePermissionMode,
  CliProviderId,
  CodexApprovalMode,
  CodexHandoffMode,
  CodexReasoningEffort,
  CodexSandboxMode,
  RalphCodexConfig,
  RalphAutonomyMode,
  RalphGitCheckpointMode,
  RalphHooksConfig,
  RalphModelTieringConfig,
  RalphScmStrategy,
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

function readPromptBudgetOverrideMap(
  config: vscode.WorkspaceConfiguration,
  key: string
): Record<string, number> {
  const value = config.get<unknown>(key);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const normalized: Record<string, number> = {};
  for (const [entryKey, entryValue] of Object.entries(value)) {
    if (typeof entryValue !== 'number' || !Number.isFinite(entryValue) || entryValue <= 0) {
      continue;
    }

    const trimmedKey = entryKey.trim();
    if (!trimmedKey) {
      continue;
    }

    normalized[trimmedKey] = Math.floor(entryValue);
  }

  return normalized;
}

function readModelTiering(
  config: vscode.WorkspaceConfiguration,
  fallback: RalphModelTieringConfig
): RalphModelTieringConfig {
  const raw = config.get<unknown>('modelTiering');
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return fallback;
  }

  const record = raw as Record<string, unknown>;
  return {
    enabled: typeof record.enabled === 'boolean' ? record.enabled : fallback.enabled,
    simpleModel: typeof record.simpleModel === 'string' && record.simpleModel.trim()
      ? record.simpleModel.trim()
      : fallback.simpleModel,
    mediumModel: typeof record.mediumModel === 'string' && record.mediumModel.trim()
      ? record.mediumModel.trim()
      : fallback.mediumModel,
    complexModel: typeof record.complexModel === 'string' && record.complexModel.trim()
      ? record.complexModel.trim()
      : fallback.complexModel,
    simpleThreshold: typeof record.simpleThreshold === 'number' && Number.isFinite(record.simpleThreshold)
      ? Math.floor(record.simpleThreshold)
      : fallback.simpleThreshold,
    complexThreshold: typeof record.complexThreshold === 'number' && Number.isFinite(record.complexThreshold)
      ? Math.floor(record.complexThreshold)
      : fallback.complexThreshold
  };
}

function readHooks(
  config: vscode.WorkspaceConfiguration,
  fallback: RalphHooksConfig
): RalphHooksConfig {
  const raw = config.get<unknown>('hooks');
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return fallback;
  }

  const record = raw as Record<string, unknown>;
  const hooks: RalphHooksConfig = {};

  for (const key of ['beforeIteration', 'afterIteration', 'onTaskComplete', 'onStop', 'onFailure'] as const) {
    if (typeof record[key] === 'string' && record[key].trim()) {
      hooks[key] = record[key].trim();
    }
  }

  return hooks;
}

export function readConfig(workspaceFolder: vscode.WorkspaceFolder): RalphCodexConfig {
  const config = vscode.workspace.getConfiguration('ralphCodex', workspaceFolder.uri);

  const cliProvider = readEnum<CliProviderId>(
    config,
    'cliProvider',
    ['codex', 'claude'],
    DEFAULT_CONFIG.cliProvider
  );
  const autonomyMode = readEnum<RalphAutonomyMode>(
    config,
    'autonomyMode',
    ['supervised', 'autonomous'],
    DEFAULT_CONFIG.autonomyMode
  );
  const openSidebarFallback = cliProvider === 'claude' ? 'claude.openSidebar' : 'chatgpt.openSidebar';
  const newChatFallback = cliProvider === 'claude' ? 'claude.newChat' : 'chatgpt.newChat';
  const autoReplenishBacklog = readBoolean(
    config,
    'autoReplenishBacklog',
    DEFAULT_CONFIG.autoReplenishBacklog
  );
  const autoReloadOnControlPlaneChange = readBoolean(
    config,
    'autoReloadOnControlPlaneChange',
    DEFAULT_CONFIG.autoReloadOnControlPlaneChange
  );
  const autoApplyRemediation = readEnumArray<AutoApplyRemediationAction>(
    config,
    'autoApplyRemediation',
    ['decompose_task', 'mark_blocked'],
    DEFAULT_CONFIG.autoApplyRemediation
  );
  const effectiveAutonomy = autonomyMode === 'autonomous'
    ? {
        autoReplenishBacklog: true,
        autoReloadOnControlPlaneChange: true,
        autoApplyRemediation: ['decompose_task', 'mark_blocked'] as AutoApplyRemediationAction[]
      }
    : {
        autoReplenishBacklog,
        autoReloadOnControlPlaneChange,
        autoApplyRemediation
      };

  return {
    cliProvider,
    codexCommandPath: readString(config, 'codexCommandPath', DEFAULT_CONFIG.codexCommandPath, ['codexExecutable']),
    claudeCommandPath: readString(config, 'claudeCommandPath', DEFAULT_CONFIG.claudeCommandPath),
    claudeMaxTurns: readNumber(config, 'claudeMaxTurns', DEFAULT_CONFIG.claudeMaxTurns, 1),
    claudePermissionMode: readEnum<ClaudePermissionMode>(
      config,
      'claudePermissionMode',
      ['dangerously-skip-permissions', 'default'],
      DEFAULT_CONFIG.claudePermissionMode
    ),
    agentId: readString(config, 'agentId', DEFAULT_CONFIG.agentId),
    agentRole: readEnum(
      config,
      'agentRole',
      ['build', 'review', 'watchdog', 'scm'],
      DEFAULT_CONFIG.agentRole
    ),
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
    scmStrategy: readEnum<RalphScmStrategy>(
      config,
      'scmStrategy',
      ['none', 'commit-on-done', 'branch-per-task'],
      DEFAULT_CONFIG.scmStrategy
    ),
    scmPrOnParentDone: readBoolean(
      config,
      'scmPrOnParentDone',
      DEFAULT_CONFIG.scmPrOnParentDone
    ),
    watchdogStaleTtlMs: readNumber(
      config,
      'watchdogStaleTtlMs',
      DEFAULT_CONFIG.watchdogStaleTtlMs,
      0
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
    autonomyMode,
    autoReplenishBacklog: effectiveAutonomy.autoReplenishBacklog,
    autoReloadOnControlPlaneChange: effectiveAutonomy.autoReloadOnControlPlaneChange,
    autoApplyRemediation: effectiveAutonomy.autoApplyRemediation,
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
    promptBudgetProfile: readEnum(
      config,
      'promptBudgetProfile',
      ['codex', 'claude', 'custom'],
      DEFAULT_CONFIG.promptBudgetProfile
    ),
    customPromptBudget: readPromptBudgetOverrideMap(config, 'customPromptBudget'),
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
    openSidebarCommandId: readString(config, 'openSidebarCommandId', openSidebarFallback),
    newChatCommandId: readString(config, 'newChatCommandId', newChatFallback),
    claimTtlHours: readNumber(config, 'claimTtlHours', DEFAULT_CONFIG.claimTtlHours, 1),
    staleLockThresholdMinutes: readNumber(config, 'staleLockThresholdMinutes', DEFAULT_CONFIG.staleLockThresholdMinutes, 1),
    agentCount: readNumber(config, 'agentCount', DEFAULT_CONFIG.agentCount, 1),
    modelTiering: readModelTiering(config, DEFAULT_CONFIG.modelTiering),
    hooks: readHooks(config, DEFAULT_CONFIG.hooks)
  };
}
