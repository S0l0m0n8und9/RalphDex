import * as vscode from 'vscode';
import { DEFAULT_CONFIG } from './defaults';
import { getDefaultNewChatCommandId, getDefaultOpenSidebarCommandId } from './providers';
import {
  AutoApplyRemediationAction,
  ClaudePermissionMode,
  CliProviderId,
  CopilotApprovalMode,
  CodexApprovalMode,
  CodexHandoffMode,
  CodexReasoningEffort,
  CodexSandboxMode,
  FailureDiagnosticsMode,
  MemoryStrategy,
  OperatorMode,
  PlanningPassMode,
  PromptCachingMode,
  RalphCodexConfig,
  RalphAutonomyMode,
  RalphGitCheckpointMode,
  RalphHooksConfig,
  RalphModelTierConfig,
  RalphModelTieringConfig,
  RalphPlanningPassConfig,
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

const CLI_PROVIDER_IDS: readonly CliProviderId[] = ['codex', 'claude', 'copilot', 'azure-foundry'];

interface OperatorPreset {
  autonomyMode: RalphAutonomyMode;
  agentCount: number;
  preferredHandoffMode: CodexHandoffMode;
  modelTieringEnabled: boolean;
  ralphIterationCap: number;
  stopOnHumanReviewNeeded: boolean;
  scmStrategy: RalphScmStrategy;
  memoryStrategy: MemoryStrategy;
  autoReplenishBacklog: boolean;
  pipelineHumanGates: boolean;
  autoReviewOnParentDone?: boolean;
  autoWatchdogOnStall?: boolean;
  autoApplyRemediation?: AutoApplyRemediationAction[];
}

const OPERATOR_PRESETS: Record<OperatorMode, OperatorPreset> = {
  simple: {
    autonomyMode: 'supervised',
    agentCount: 1,
    preferredHandoffMode: 'ideCommand',
    modelTieringEnabled: false,
    ralphIterationCap: 20,
    stopOnHumanReviewNeeded: true,
    scmStrategy: 'none',
    memoryStrategy: 'verbatim',
    autoReplenishBacklog: false,
    pipelineHumanGates: true
  },
  'multi-agent': {
    autonomyMode: 'autonomous',
    agentCount: 3,
    preferredHandoffMode: 'cliExec',
    modelTieringEnabled: true,
    ralphIterationCap: DEFAULT_CONFIG.ralphIterationCap,
    stopOnHumanReviewNeeded: DEFAULT_CONFIG.stopOnHumanReviewNeeded,
    scmStrategy: 'branch-per-task',
    memoryStrategy: 'sliding-window',
    autoReplenishBacklog: true,
    pipelineHumanGates: true,
    autoReviewOnParentDone: true,
    autoWatchdogOnStall: true
  },
  hardcore: {
    autonomyMode: 'autonomous',
    agentCount: 3,
    preferredHandoffMode: 'cliExec',
    modelTieringEnabled: true,
    ralphIterationCap: 100,
    stopOnHumanReviewNeeded: DEFAULT_CONFIG.stopOnHumanReviewNeeded,
    scmStrategy: 'branch-per-task',
    memoryStrategy: 'summary',
    autoReplenishBacklog: true,
    pipelineHumanGates: false,
    autoReviewOnParentDone: true,
    autoWatchdogOnStall: true,
    autoApplyRemediation: ['decompose_task', 'mark_blocked']
  }
};

function readTierConfig(raw: unknown, fallback: RalphModelTierConfig): RalphModelTierConfig {
  // Accept a plain string (backward-compat: old flat `simpleModel` format).
  if (typeof raw === 'string' && raw.trim()) {
    return { model: raw.trim() };
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return fallback;
  }

  const record = raw as Record<string, unknown>;
  const model = typeof record.model === 'string' && record.model.trim()
    ? record.model.trim()
    : fallback.model;
  const provider = typeof record.provider === 'string' && CLI_PROVIDER_IDS.includes(record.provider as CliProviderId)
    ? (record.provider as CliProviderId)
    : undefined;

  return provider ? { provider, model } : { model };
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

  // Backward-compat: accept old flat `simpleModel`/`mediumModel`/`complexModel` strings.
  const simple = record.simple !== undefined
    ? readTierConfig(record.simple, fallback.simple)
    : typeof record.simpleModel === 'string' && record.simpleModel.trim()
      ? { model: record.simpleModel.trim() }
      : fallback.simple;

  const medium = record.medium !== undefined
    ? readTierConfig(record.medium, fallback.medium)
    : typeof record.mediumModel === 'string' && record.mediumModel.trim()
      ? { model: record.mediumModel.trim() }
      : fallback.medium;

  const complex = record.complex !== undefined
    ? readTierConfig(record.complex, fallback.complex)
    : typeof record.complexModel === 'string' && record.complexModel.trim()
      ? { model: record.complexModel.trim() }
      : fallback.complex;

  return {
    enabled: typeof record.enabled === 'boolean' ? record.enabled : fallback.enabled,
    simple,
    medium,
    complex,
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

function readPlanningPass(
  config: vscode.WorkspaceConfiguration,
  fallback: RalphPlanningPassConfig
): RalphPlanningPassConfig {
  const raw = config.get<unknown>('planningPass');
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return fallback;
  }

  const record = raw as Record<string, unknown>;
  const enabled = typeof record.enabled === 'boolean' ? record.enabled : fallback.enabled;
  const PLANNING_PASS_MODES: readonly PlanningPassMode[] = ['dedicated', 'inline'];
  const mode = typeof record.mode === 'string' && PLANNING_PASS_MODES.includes(record.mode as PlanningPassMode)
    ? (record.mode as PlanningPassMode)
    : fallback.mode;

  return { enabled, mode };
}

export interface OperatorModeSettingProvenance {
  key: string;
  value: string;
  source: 'preset' | 'explicit';
}

/**
 * Returns per-setting provenance for all preset-affected keys when an operator mode is active.
 * Returns null when no operator mode is set.
 * For each setting, `source` is 'explicit' when the user has a workspace or global override,
 * and 'preset' when the resolved value came from the preset fallback.
 */
export function resolveOperatorModeProvenance(
  config: vscode.WorkspaceConfiguration,
  resolvedConfig: RalphCodexConfig,
  operatorMode: OperatorMode | undefined
): OperatorModeSettingProvenance[] | null {
  if (operatorMode === undefined) {
    return null;
  }

  const checkKey = (key: string, resolvedValue: string): OperatorModeSettingProvenance => {
    const inspect = config.inspect<unknown>(key);
    const hasExplicit = inspect?.workspaceValue !== undefined || inspect?.globalValue !== undefined;
    return { key, value: resolvedValue, source: hasExplicit ? 'explicit' : 'preset' };
  };

  const entries: OperatorModeSettingProvenance[] = [
    checkKey('autonomyMode', resolvedConfig.autonomyMode),
    checkKey('agentCount', String(resolvedConfig.agentCount)),
    checkKey('preferredHandoffMode', resolvedConfig.preferredHandoffMode),
    checkKey('ralphIterationCap', String(resolvedConfig.ralphIterationCap)),
    checkKey('stopOnHumanReviewNeeded', String(resolvedConfig.stopOnHumanReviewNeeded)),
    checkKey('scmStrategy', resolvedConfig.scmStrategy),
    checkKey('memoryStrategy', resolvedConfig.memoryStrategy),
    checkKey('autoReplenishBacklog', String(resolvedConfig.autoReplenishBacklog)),
    checkKey('pipelineHumanGates', String(resolvedConfig.pipelineHumanGates)),
    checkKey('autoReviewOnParentDone', String(resolvedConfig.autoReviewOnParentDone)),
    checkKey('autoWatchdogOnStall', String(resolvedConfig.autoWatchdogOnStall)),
    checkKey('autoApplyRemediation', resolvedConfig.autoApplyRemediation.join(', ') || 'none')
  ];

  // modelTiering.enabled needs special handling since it's nested and has a flat legacy key
  const tieringInspect = config.inspect<unknown>('modelTiering');
  const tieringRecord = (tieringInspect?.workspaceValue ?? tieringInspect?.globalValue) as Record<string, unknown> | undefined;
  const enableInspect = config.inspect<boolean>('enableModelTiering');
  const modelTieringExplicit = typeof tieringRecord?.enabled === 'boolean'
    || enableInspect?.workspaceValue !== undefined
    || enableInspect?.globalValue !== undefined;
  entries.push({
    key: 'modelTiering.enabled',
    value: String(resolvedConfig.modelTiering.enabled),
    source: modelTieringExplicit ? 'explicit' : 'preset'
  });

  return entries;
}

export function readConfig(workspaceFolder: vscode.WorkspaceFolder): RalphCodexConfig {
  const config = vscode.workspace.getConfiguration('ralphCodex', workspaceFolder.uri);

  const rawOperatorMode = config.get<string>('operatorMode');
  const operatorMode: OperatorMode | undefined =
    rawOperatorMode === 'simple' || rawOperatorMode === 'multi-agent' || rawOperatorMode === 'hardcore'
      ? rawOperatorMode
      : undefined;
  const preset = operatorMode !== undefined ? OPERATOR_PRESETS[operatorMode] : undefined;

  const cliProvider = readEnum<CliProviderId>(
    config,
    'cliProvider',
    ['codex', 'claude', 'copilot', 'azure-foundry'],
    DEFAULT_CONFIG.cliProvider
  );
  const autonomyMode = readEnum<RalphAutonomyMode>(
    config,
    'autonomyMode',
    ['supervised', 'autonomous'],
    preset?.autonomyMode ?? DEFAULT_CONFIG.autonomyMode
  );
  const openSidebarFallback = getDefaultOpenSidebarCommandId(cliProvider);
  const newChatFallback = getDefaultNewChatCommandId(cliProvider);
  const autoReplenishBacklog = readBoolean(
    config,
    'autoReplenishBacklog',
    preset?.autoReplenishBacklog ?? DEFAULT_CONFIG.autoReplenishBacklog
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
    preset?.autoApplyRemediation ?? DEFAULT_CONFIG.autoApplyRemediation
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
    copilotCommandPath: readString(config, 'copilotCommandPath', DEFAULT_CONFIG.copilotCommandPath),
    azureFoundryCommandPath: readString(config, 'azureFoundryCommandPath', DEFAULT_CONFIG.azureFoundryCommandPath),
    azureFoundryEndpointUrl: readString(config, 'azureFoundryEndpointUrl', DEFAULT_CONFIG.azureFoundryEndpointUrl),
    azureFoundryApiKey: readString(config, 'azureFoundryApiKey', DEFAULT_CONFIG.azureFoundryApiKey),
    azureFoundryModelDeployment: readString(config, 'azureFoundryModelDeployment', DEFAULT_CONFIG.azureFoundryModelDeployment),
    azureFoundryApiVersion: readString(config, 'azureFoundryApiVersion', DEFAULT_CONFIG.azureFoundryApiVersion),
    claudeMaxTurns: readNumber(config, 'claudeMaxTurns', DEFAULT_CONFIG.claudeMaxTurns, 1),
    copilotMaxAutopilotContinues: readNumber(config, 'copilotMaxAutopilotContinues', DEFAULT_CONFIG.copilotMaxAutopilotContinues, 1),
    claudePermissionMode: readEnum<ClaudePermissionMode>(
      config,
      'claudePermissionMode',
      ['dangerously-skip-permissions', 'default'],
      DEFAULT_CONFIG.claudePermissionMode
    ),
    copilotApprovalMode: readEnum<CopilotApprovalMode>(
      config,
      'copilotApprovalMode',
      ['allow-all', 'allow-tools-only', 'interactive'],
      DEFAULT_CONFIG.copilotApprovalMode
    ),
    agentId: readString(config, 'agentId', DEFAULT_CONFIG.agentId),
    agentRole: readEnum(
      config,
      'agentRole',
      ['build', 'review', 'watchdog', 'scm', 'planner', 'implementer', 'reviewer'],
      DEFAULT_CONFIG.agentRole
    ),
    preferredHandoffMode: readEnum<CodexHandoffMode>(
      config,
      'preferredHandoffMode',
      ['ideCommand', 'clipboard', 'cliExec'],
      preset?.preferredHandoffMode ?? DEFAULT_CONFIG.preferredHandoffMode
    ),
    inspectionRootOverride: readString(
      config,
      'inspectionRootOverride',
      DEFAULT_CONFIG.inspectionRootOverride
    ),
    ralphIterationCap: readNumber(config, 'ralphIterationCap', preset?.ralphIterationCap ?? DEFAULT_CONFIG.ralphIterationCap, 1, ['maxIterations']),
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
      preset?.scmStrategy ?? DEFAULT_CONFIG.scmStrategy
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
      preset?.stopOnHumanReviewNeeded ?? DEFAULT_CONFIG.stopOnHumanReviewNeeded
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
    agentCount: readNumber(config, 'agentCount', preset?.agentCount ?? DEFAULT_CONFIG.agentCount, 1),
    modelTiering: (() => {
      const tiering = readModelTiering(config, DEFAULT_CONFIG.modelTiering);
      // Flat ralphCodex.enableModelTiering takes precedence over modelTiering.enabled,
      // but only if explicitly set by the user (workspace or global scope).
      // Using inspect() avoids treating the package.json default (false) as a user choice.
      const enableInspect = config.inspect<boolean>('enableModelTiering');
      const enableOverride = enableInspect?.workspaceValue ?? enableInspect?.globalValue;
      if (typeof enableOverride === 'boolean') {
        tiering.enabled = enableOverride;
      } else if (preset?.modelTieringEnabled !== undefined) {
        // Apply preset value when modelTiering.enabled was not explicitly set.
        const tieringInspect = config.inspect<unknown>('modelTiering');
        const tieringRecord = (tieringInspect?.workspaceValue ?? tieringInspect?.globalValue) as Record<string, unknown> | undefined;
        if (typeof tieringRecord?.enabled !== 'boolean') {
          tiering.enabled = preset.modelTieringEnabled;
        }
      }
      return tiering;
    })(),
    hooks: readHooks(config, DEFAULT_CONFIG.hooks),
    autoWatchdogOnStall: readBoolean(config, 'autoWatchdogOnStall', preset?.autoWatchdogOnStall ?? DEFAULT_CONFIG.autoWatchdogOnStall),
    autoReviewOnParentDone: readBoolean(config, 'autoReviewOnParentDone', preset?.autoReviewOnParentDone ?? DEFAULT_CONFIG.autoReviewOnParentDone),
    autoReviewOnLoopComplete: readBoolean(config, 'autoReviewOnLoopComplete', DEFAULT_CONFIG.autoReviewOnLoopComplete),
    autoScmOnConflict: readBoolean(config, 'autoScmOnConflict', DEFAULT_CONFIG.autoScmOnConflict),
    scmConflictRetryLimit: readNumber(config, 'scmConflictRetryLimit', DEFAULT_CONFIG.scmConflictRetryLimit, 1),
    pipelineHumanGates: readBoolean(config, 'pipelineHumanGates', preset?.pipelineHumanGates ?? DEFAULT_CONFIG.pipelineHumanGates),
    cliExecutionTimeoutMs: readNumber(config, 'cliExecutionTimeoutMs', DEFAULT_CONFIG.cliExecutionTimeoutMs, 0),
    promptCaching: readEnum<PromptCachingMode>(
      config,
      'promptCaching',
      ['auto', 'force', 'off'],
      DEFAULT_CONFIG.promptCaching
    ),
    memoryStrategy: readEnum<MemoryStrategy>(
      config,
      'memoryStrategy',
      ['verbatim', 'sliding-window', 'summary'],
      preset?.memoryStrategy ?? DEFAULT_CONFIG.memoryStrategy
    ),
    memoryWindowSize: readNumber(config, 'memoryWindowSize', DEFAULT_CONFIG.memoryWindowSize, 1),
    memorySummaryThreshold: readNumber(config, 'memorySummaryThreshold', DEFAULT_CONFIG.memorySummaryThreshold, 1),
    operatorMode,
    prdGenerationTemplate: readString(config, 'prdGenerationTemplate', DEFAULT_CONFIG.prdGenerationTemplate),
    planningPass: readPlanningPass(config, DEFAULT_CONFIG.planningPass),
    failureDiagnostics: readEnum<FailureDiagnosticsMode>(
      config,
      'failureDiagnostics',
      ['auto', 'off'],
      DEFAULT_CONFIG.failureDiagnostics
    ),
    maxRecoveryAttempts: readNumber(config, 'maxRecoveryAttempts', DEFAULT_CONFIG.maxRecoveryAttempts, 1)
  };
}
