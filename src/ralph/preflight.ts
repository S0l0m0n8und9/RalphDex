import * as fs from 'fs/promises';
import * as path from 'path';
import { AzureAuthReadiness, inspectAzureAuthReadiness } from '../codex/azureAuthResolver';
import { getCliProviderLabel } from '../config/providers';
import { RalphCodexConfig } from '../config/types';
import { CodexCliSupport, CodexIdeCommandSupport } from '../services/codexCliSupport';
import { pathExists, readJsonRecord } from '../util/fs';
import { RalphWorkspaceFileStatus } from './stateManager';
import { RalphTaskClaimGraphInspection, RalphTaskFileInspection } from './taskFile';
import {
  inspectGeneratedArtifactRetention,
  inspectProvenanceBundleRetention,
  PROTECTED_GENERATED_LATEST_POINTER_REFERENCES,
  resolveLatestArtifactPaths
} from './artifactStore';
import {
  DEFAULT_RALPH_AGENT_ID,
  RalphHandoff,
  RalphPreflightCategory,
  RalphPreflightDiagnostic,
  RalphPreflightReport,
  RalphPromptSessionHandoff,
  RalphSummarizationMode,
  RalphTask,
  RalphTaskCounts,
  RalphValidationCommandReadiness
} from './types';
import { DEFAULT_CLAIM_TTL_MS, selectNextTask } from './taskFile';
import { isDedicatedPlanningFallbackSingleAgent } from './planningPass';
import { isHandoffExpired, resolveHandoffDir } from './handoffManager';
import { getEffectivePolicy } from './rolePolicy';

const CATEGORY_LABELS: Record<RalphPreflightCategory, string> = {
  taskGraph: 'Task graph',
  claimGraph: 'Claim graph',
  workspaceRuntime: 'Workspace/runtime',
  codexAdapter: 'Codex adapter',
  validationVerifier: 'Validation/verifier',
  agentHealth: 'Agent Health'
};

const DEFAULT_STALE_LOCK_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

function createDiagnostic(
  category: RalphPreflightCategory,
  severity: RalphPreflightDiagnostic['severity'],
  code: string,
  message: string,
  details: Pick<RalphPreflightDiagnostic, 'taskId' | 'relatedTaskIds' | 'location' | 'relatedLocations'> = {}
): RalphPreflightDiagnostic {
  return {
    category,
    severity,
    code,
    message,
    ...details
  };
}

function relativePath(rootPath: string, target: string): string {
  return path.relative(rootPath, target) || '.';
}

function sectionSummary(category: RalphPreflightCategory, diagnostics: RalphPreflightDiagnostic[]): string {
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length;
  const warnings = diagnostics.filter((diagnostic) => diagnostic.severity === 'warning').length;
  const infos = diagnostics.filter((diagnostic) => diagnostic.severity === 'info').length;
  const parts: string[] = [];

  if (errors > 0) {
    parts.push(`${errors} error${errors === 1 ? '' : 's'}`);
  }
  if (warnings > 0) {
    parts.push(`${warnings} warning${warnings === 1 ? '' : 's'}`);
  }
  if (infos > 0) {
    parts.push(`${infos} info`);
  }

  return `${CATEGORY_LABELS[category]}: ${parts.join(', ') || 'ok'}`;
}

function sortDiagnostics(diagnostics: RalphPreflightDiagnostic[]): RalphPreflightDiagnostic[] {
  const severityRank = new Map<RalphPreflightDiagnostic['severity'], number>([
    ['error', 0],
    ['warning', 1],
    ['info', 2]
  ]);

  return [...diagnostics].sort((left, right) => {
    const leftRank = severityRank.get(left.severity) ?? 99;
    const rightRank = severityRank.get(right.severity) ?? 99;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    if (left.category !== right.category) {
      return left.category.localeCompare(right.category);
    }

    return left.message.localeCompare(right.message);
  });
}

function summarizeTaskSelection(
  selectedTask: RalphTask | null,
  diagnostics: readonly RalphPreflightDiagnostic[]
): string {
  if (selectedTask) {
    return `Selected task ${selectedTask.id}.`;
  }

  const taskLedgerDrift = diagnostics.find((diagnostic) => (
    diagnostic.category === 'taskGraph' && diagnostic.severity === 'error'
  ));

  if (taskLedgerDrift) {
    return `No task selected because task-ledger drift blocks safe selection: ${taskLedgerDrift.message}`;
  }

  return 'No task selected.';
}

function buildTaskTitleLookup(tasks: readonly RalphTask[] | undefined): Map<string, string> {
  const titles = new Map<string, string>();
  for (const task of tasks ?? []) {
    titles.set(task.id, task.title);
  }
  return titles;
}

function formatActiveClaimLabel(
  claim: RalphTaskClaimGraphInspection['claimFile']['claims'][number],
  stale: boolean,
  taskTitles: ReadonlyMap<string, string>
): string {
  const title = taskTitles.get(claim.taskId);
  return `${claim.taskId}${title ? ` - ${title}` : ''} @ ${claim.claimedAt} (${stale ? 'stale' : 'fresh'})`;
}

export function summarizeActiveClaimsByAgent(
  claimGraph: RalphTaskClaimGraphInspection | null | undefined,
  taskTitles: ReadonlyMap<string, string>
): string {
  const groupedClaims = new Map<string, string[]>();

  for (const entry of claimGraph?.tasks ?? []) {
    for (const activeClaim of entry.activeClaims) {
      const labels = groupedClaims.get(activeClaim.claim.agentId) ?? [];
      labels.push(formatActiveClaimLabel(activeClaim.claim, activeClaim.stale, taskTitles));
      groupedClaims.set(activeClaim.claim.agentId, labels);
    }
  }

  if (groupedClaims.size === 0) {
    return 'none';
  }

  return [...groupedClaims.entries()]
    .sort(([leftAgentId], [rightAgentId]) => leftAgentId.localeCompare(rightAgentId))
    .map(([agentId, claims]) => `${agentId}: ${claims.join(', ')}`)
    .join('; ');
}

export interface RalphPreflightInput {
  rootPath: string;
  workspaceTrusted: boolean;
  config: RalphCodexConfig;
  taskInspection: RalphTaskFileInspection;
  taskCounts: RalphTaskCounts | null;
  selectedTask: RalphTask | null;
  currentProvenanceId?: string | null;
  claimGraph?: RalphTaskClaimGraphInspection | null;
  taskValidationHint: string | null;
  validationCommand: string | null;
  normalizedValidationCommandFrom: string | null;
  validationCommandReadiness: RalphValidationCommandReadiness;
  fileStatus: RalphWorkspaceFileStatus;
  createdPaths?: string[];
  structureDefinitionGeneration?: RalphPreflightStructureDefinitionGeneration | null;
  codexCliSupport?: CodexCliSupport | null;
  ideCommandSupport?: CodexIdeCommandSupport | null;
  providerReadinessDiagnostics?: RalphPreflightDiagnostic[];
  artifactReadinessDiagnostics?: RalphPreflightExternalDiagnostic[];
  agentHealthDiagnostics?: RalphPreflightExternalDiagnostic[];
  sessionHandoff?: RalphPromptSessionHandoff | null;
  /** Summarization mode from the most recent iteration; used to emit an info diagnostic when fallback is active. */
  lastSummarizationMode?: RalphSummarizationMode | null;
  /** How the active role policy was determined (preset | crew | explicit). Defaults to 'preset' when absent. */
  rolePolicySource?: 'preset' | 'crew' | 'explicit';
}

export interface RalphProviderReadinessInput {
  config: RalphCodexConfig;
  codexCliSupport?: CodexCliSupport | null;
  ideCommandSupport?: CodexIdeCommandSupport | null;
  azureAuthReadiness?: Partial<Record<'azure-foundry', AzureAuthReadiness>>;
  authFailureSeverity?: Extract<RalphPreflightDiagnostic['severity'], 'warning' | 'error'>;
}

export interface RalphPreflightExternalDiagnostic {
  severity: RalphPreflightDiagnostic['severity'];
  code: string;
  message: string;
}

export interface RalphPreflightStructureDefinitionGeneration {
  path: string;
  written: boolean;
  reason: string;
}

export interface RalphPreflightArtifactReadinessInput {
  rootPath: string;
  artifactRootDir: string;
  promptDir: string;
  runDir: string;
  stateFilePath: string;
  generatedArtifactRetentionCount: number;
  provenanceBundleRetentionCount: number;
}

interface IterationResultSignal {
  provenanceId: string | null;
  selectedTaskId: string | null;
  finishedAtMs: number | null;
  mtimeMs: number;
}

interface StateRunSignal {
  agentId: string | null;
  provenanceId: string | null;
  selectedTaskId: string | null;
  finishedAtMs: number | null;
}

function readStringField(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readTimestampMs(value: unknown): number | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }

  const timestampMs = new Date(value).getTime();
  return Number.isNaN(timestampMs) ? null : timestampMs;
}

export function collectProviderReadinessDiagnostics(input: RalphProviderReadinessInput): RalphPreflightDiagnostic[] {
  const diagnostics: RalphPreflightDiagnostic[] = [];
  const authFailureSeverity = input.authFailureSeverity ?? 'warning';

  if (input.codexCliSupport) {
    const cliSupport = input.codexCliSupport as CodexCliSupport & { provider?: string; configKey?: string };
    const providerLabel = getCliProviderLabel((cliSupport.provider as typeof input.config.cliProvider | undefined) ?? 'codex');
    const configKey = cliSupport.configKey ?? 'ralphCodex.codexCommandPath';
    if (input.codexCliSupport.check === 'pathMissing') {
      diagnostics.push(createDiagnostic(
        'codexAdapter',
        'error',
        'codex_cli_missing',
        input.codexCliSupport.configuredAs === 'pathLookup'
          ? `${providerLabel} CLI command could not be resolved from PATH: ${input.codexCliSupport.commandPath}. Install the CLI or update ${configKey} to an explicit executable path.`
          : `Configured ${providerLabel} CLI path does not exist: ${input.codexCliSupport.commandPath}. Update ${configKey}.`
      ));
    } else if (input.codexCliSupport.check === 'pathNotExecutable') {
      diagnostics.push(createDiagnostic(
        'codexAdapter',
        'error',
        'codex_cli_not_executable',
        `Configured ${providerLabel} CLI path is not executable: ${input.codexCliSupport.commandPath}.`
      ));
    } else if (input.codexCliSupport.check === 'pathLookupAssumed') {
      diagnostics.push(createDiagnostic(
        'codexAdapter',
        'warning',
        'codex_cli_path_lookup_assumed',
        `${providerLabel} CLI will be resolved from PATH at runtime: ${input.codexCliSupport.commandPath}. Availability is assumed until execution starts.`
      ));
    } else if (input.codexCliSupport.check === 'pathVerifiedExecutable') {
      diagnostics.push(createDiagnostic(
        'codexAdapter',
        'info',
        'codex_cli_path_verified',
        input.codexCliSupport.configuredAs === 'pathLookup'
          ? `${providerLabel} CLI was resolved from PATH and verified: ${input.codexCliSupport.commandPath}.`
          : `Configured ${providerLabel} CLI executable was verified: ${input.codexCliSupport.commandPath}.`
      ));
    }
  }

  if (input.ideCommandSupport?.status === 'unavailable') {
    const missingCommands = input.ideCommandSupport.missingCommandIds
      .filter((commandId) => commandId && commandId !== 'none');
    diagnostics.push(createDiagnostic(
      'codexAdapter',
      'warning',
      'ide_command_strategy_unavailable',
      missingCommands.length > 0
        ? `Configured IDE command strategy is unavailable. Missing VS Code commands: ${missingCommands.join(', ')}. Clipboard handoff can still fall back.`
        : 'Configured IDE command strategy is unavailable because no usable VS Code command ids were configured. Clipboard handoff can still fall back.'
    ));
  } else if (input.ideCommandSupport?.status === 'available') {
    diagnostics.push(createDiagnostic(
      'codexAdapter',
      'info',
      'ide_command_strategy_available',
      `Configured IDE command strategy is available via ${input.ideCommandSupport.openSidebarCommandId} and ${input.ideCommandSupport.newChatCommandId}.`
    ));
  }

  if (input.config.cliProvider === 'azure-foundry') {
    diagnostics.push(...collectAzureFoundryReadinessDiagnostics(
      input.config,
      input.azureAuthReadiness?.['azure-foundry'],
      authFailureSeverity
    ));
  }

  if (input.config.cliProvider === 'copilot-foundry' || input.config.cliProvider === 'copilot-byok') {
    diagnostics.push(...collectCopilotByokReadinessDiagnostics(input.config));
  }

  return diagnostics;
}

export async function inspectProviderReadinessDiagnostics(
  input: RalphProviderReadinessInput
): Promise<RalphPreflightDiagnostic[]> {
  const azureAuthReadiness = { ...input.azureAuthReadiness };

  if (input.config.cliProvider === 'azure-foundry') {
    azureAuthReadiness['azure-foundry'] = await inspectAzureAuthReadiness(input.config.azureFoundry.auth);
  }

  return collectProviderReadinessDiagnostics({
    ...input,
    azureAuthReadiness
  });
}

function collectAzureFoundryReadinessDiagnostics(
  config: RalphCodexConfig,
  authReadiness?: AzureAuthReadiness,
  authFailureSeverity: Extract<RalphPreflightDiagnostic['severity'], 'warning' | 'error'> = 'warning'
): RalphPreflightDiagnostic[] {
  const diagnostics: RalphPreflightDiagnostic[] = [];
  if (!config.azureFoundry.endpointUrl.trim()) {
    diagnostics.push(createDiagnostic(
      'codexAdapter',
      'error',
      'azure_foundry_endpoint_missing',
      'cliProvider is set to azure-foundry but ralphCodex.azureFoundry.endpointUrl is not configured.'
    ));
  }

  diagnostics.push(...collectAzureAuthReadinessDiagnostics(
    'azure-foundry',
    config.azureFoundry.auth,
    authReadiness,
    {
      envPrefix: 'ralphCodex.azureFoundry.auth',
      bearerInfoCode: 'azure_foundry_auth_az_bearer',
      bearerInfoMessage: 'Azure AI Foundry will resolve a bearer token via Azure Identity at runtime. Ensure the selected tenant is available to DefaultAzureCredential or Managed Identity before execution.',
      apiKeyInfoCode: 'azure_foundry_auth_api_key_active'
    },
    authFailureSeverity
  ));

  return diagnostics;
}

function collectCopilotByokReadinessDiagnostics(config: RalphCodexConfig): RalphPreflightDiagnostic[] {
  const diagnostics: RalphPreflightDiagnostic[] = [];
  const cfg = config.copilotFoundry;
  const providerId = config.cliProvider; // 'copilot-byok' or 'copilot-foundry'
  // Mirror the runtime behaviour: copilot-foundry always forces azure regardless of config
  const effectiveProviderType = providerId === 'copilot-foundry' ? 'azure' : cfg.providerType;

  // Check base URL is resolvable
  const hasOverride = !!cfg.baseUrlOverride.trim();
  const hasAzureResourceDeployment = !!cfg.azure.resourceName.trim() && !!cfg.azure.deployment.trim();
  if (effectiveProviderType === 'azure') {
    const baseUrlResolvable = providerId === 'copilot-foundry'
      ? hasAzureResourceDeployment
      : hasOverride || hasAzureResourceDeployment;
    if (!baseUrlResolvable) {
      diagnostics.push(createDiagnostic(
        'codexAdapter',
        'error',
        'copilot_byok_base_url_missing',
        providerId === 'copilot-foundry'
          ? 'cliProvider is set to copilot-foundry but ralphCodex.copilotFoundry.azure.resourceName and ralphCodex.copilotFoundry.azure.deployment are not both configured.'
          : `cliProvider is set to ${providerId} but neither ralphCodex.copilotFoundry.baseUrlOverride nor both ralphCodex.copilotFoundry.azure.resourceName and ralphCodex.copilotFoundry.azure.deployment are configured.`
      ));
    }
  } else if (!hasOverride) {
    diagnostics.push(createDiagnostic(
      'codexAdapter',
      'error',
      'copilot_byok_base_url_missing',
      `cliProvider is set to ${providerId} with providerType "${cfg.providerType}" but ralphCodex.copilotFoundry.baseUrlOverride is not configured. A base URL is required for non-azure provider types.`
    ));
  }

  // Check model is configured (for azure, deployment is a fallback model identifier)
  if (!cfg.model.trim() && !(effectiveProviderType === 'azure' && cfg.azure.deployment.trim())) {
    diagnostics.push(createDiagnostic(
      'codexAdapter',
      'warning',
      'copilot_byok_model_missing',
      `cliProvider is set to ${providerId} but ralphCodex.copilotFoundry.model is not configured. COPILOT_MODEL will not be set in the child process environment.`
    ));
  }

  // Check API key env var presence (sync, presence check only — no value read)
  const envVarName = cfg.requiredApiKeyEnvVar.trim();
  if (envVarName) {
    const isPresent = !!(process.env[envVarName]);
    if (isPresent) {
      diagnostics.push(createDiagnostic(
        'codexAdapter',
        'info',
        'copilot_byok_api_key_present',
        `copilot-byok: Required API key env var ${envVarName} is present in the current process environment.`
      ));
    } else {
      diagnostics.push(createDiagnostic(
        'codexAdapter',
        'warning',
        'copilot_byok_api_key_absent',
        `copilot-byok: Required API key env var ${envVarName} is not set. The child process must inherit it from the operator environment before launch.`
      ));
    }
  }

  return diagnostics;
}

function collectAzureAuthReadinessDiagnostics(
  providerId: 'azure-foundry',
  auth: RalphCodexConfig['azureFoundry']['auth'],
  authReadiness: AzureAuthReadiness | undefined,
  options: {
    envPrefix: string;
    bearerInfoCode: string;
    bearerInfoMessage: string;
    apiKeyInfoCode: string;
  },
  authFailureSeverity: Extract<RalphPreflightDiagnostic['severity'], 'warning' | 'error'>
): RalphPreflightDiagnostic[] {
  if (authReadiness) {
    if (authReadiness.status === 'ready') {
      return [createDiagnostic(
        'codexAdapter',
        'info',
        auth.mode === 'az-bearer'
          ? options.bearerInfoCode
          : `${providerId.replace(/-/g, '_')}_auth_api_key_ready`,
        auth.mode === 'az-bearer'
          ? `${providerId} bearer-token readiness confirmed via ${authReadiness.redactedSource}.`
          : `${providerId} API-key readiness confirmed via ${authReadiness.redactedSource}.`
      )];
    }

    if (authReadiness.status === 'misconfigured') {
      return [createDiagnostic(
        'codexAdapter',
        'error',
        `${providerId.replace(/-/g, '_')}_auth_misconfigured`,
        `${providerId} auth is misconfigured: ${authReadiness.detail}`
      )];
    }

    return [createDiagnostic(
      'codexAdapter',
      authFailureSeverity,
      `${providerId.replace(/-/g, '_')}_auth_readiness_failed`,
      auth.mode === 'az-bearer'
        ? `${providerId} bearer-token readiness probe failed via ${authReadiness.redactedSource}: ${authReadiness.detail}`
        : `${providerId} API-key readiness failed via ${authReadiness.redactedSource}: ${authReadiness.detail}`
    )];
  }

  if (auth.mode === 'env-api-key') {
    if (!auth.apiKeyEnvVar.trim()) {
      return [createDiagnostic(
        'codexAdapter',
        'error',
        `${providerId.replace(/-/g, '_')}_api_key_env_missing`,
        `${providerId} auth mode is env-api-key but ${options.envPrefix}.apiKeyEnvVar is not configured.`
      )];
    }

    return [createDiagnostic(
      'codexAdapter',
      'info',
      options.apiKeyInfoCode,
      `${providerId} will resolve its API key from environment variable ${auth.apiKeyEnvVar.trim()} at runtime.`
    )];
  }

  if (auth.mode === 'vscode-secret') {
    if (!auth.secretStorageKey.trim()) {
      return [createDiagnostic(
        'codexAdapter',
        'error',
        `${providerId.replace(/-/g, '_')}_secret_storage_key_missing`,
        `${providerId} auth mode is vscode-secret but ${options.envPrefix}.secretStorageKey is not configured.`
      )];
    }

    return [createDiagnostic(
      'codexAdapter',
      'info',
      options.apiKeyInfoCode,
      `${providerId} will resolve its API key from VS Code secret key ${auth.secretStorageKey.trim()} at runtime.`
    )];
  }

  return [createDiagnostic(
    'codexAdapter',
    'info',
    options.bearerInfoCode,
    options.bearerInfoMessage
  )];
}

function claimMatchesSignal(
  claim: Record<string, unknown>,
  signal: {
    agentId?: string | null;
    provenanceId: string | null;
    selectedTaskId: string | null;
  }
): boolean {
  const claimTaskId = readStringField(claim, 'taskId');
  const claimProvenanceId = readStringField(claim, 'provenanceId');
  const claimAgentId = readStringField(claim, 'agentId');

  if (claimProvenanceId && signal.provenanceId && claimProvenanceId === signal.provenanceId) {
    return true;
  }

  if (claimTaskId && signal.selectedTaskId && claimTaskId === signal.selectedTaskId) {
    if (!signal.agentId || !claimAgentId || signal.agentId === claimAgentId) {
      return true;
    }
  }

  return false;
}

function pathOverlaps(left: string, right: string): boolean {
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  const leftRelative = path.relative(normalizedLeft, normalizedRight);
  const rightRelative = path.relative(normalizedRight, normalizedLeft);

  return (!leftRelative.startsWith('..') && !path.isAbsolute(leftRelative))
    || (!rightRelative.startsWith('..') && !path.isAbsolute(rightRelative));
}

function derivedPromptEvidenceReferences(record: Record<string, unknown> | null, dirs: {
  artifactRootDir: string;
  promptDir: string;
}): string[] {
  const kind = typeof record?.kind === 'string' ? record.kind : null;
  const iteration = typeof record?.iteration === 'number' && Number.isFinite(record.iteration) && record.iteration >= 1
    ? Math.floor(record.iteration)
    : null;
  if (!kind || iteration === null) {
    return [];
  }

  const paddedIteration = String(iteration).padStart(3, '0');
  return [
    path.join(dirs.artifactRootDir, `iteration-${paddedIteration}`),
    path.join(dirs.promptDir, `${kind}-${paddedIteration}.prompt.md`)
  ];
}

function basenameList(rootPath: string, targets: string[]): string {
  return targets
    .map((target) => relativePath(rootPath, target))
    .join(', ');
}

export interface CheckStaleStateInput {
  stateFilePath: string;
  taskFilePath: string;
  claimFilePath: string;
  artifactDir: string;
  staleLockThresholdMs?: number;
  staleClaimTtlMs?: number;
  now?: Date;
}

export async function checkStaleState(
  input: CheckStaleStateInput
): Promise<RalphPreflightExternalDiagnostic[]> {
  const diagnostics: RalphPreflightExternalDiagnostic[] = [];
  const now = input.now ?? new Date();
  const staleLockThresholdMs = input.staleLockThresholdMs ?? DEFAULT_STALE_LOCK_THRESHOLD_MS;
  const staleClaimTtlMs = input.staleClaimTtlMs ?? DEFAULT_CLAIM_TTL_MS;

  // (1) Check state.lock
  const stateLockPath = path.join(path.dirname(input.stateFilePath), 'state.lock');
  try {
    const stat = await fs.stat(stateLockPath);
    const ageMs = now.getTime() - stat.mtimeMs;
    if (ageMs > staleLockThresholdMs) {
      const ageSec = Math.round(ageMs / 1000);
      diagnostics.push({
        severity: 'warning',
        code: 'stale_state_lock',
        message: `state.lock is ${ageSec}s old (threshold ${Math.round(staleLockThresholdMs / 1000)}s). Remove it manually if no iteration is in progress.`
      });
    }
  } catch {
    // lock file absent — expected during normal operation
  }

  // (2) Check tasks.lock
  const tasksLockPath = path.join(path.dirname(input.taskFilePath), 'tasks.lock');
  try {
    const stat = await fs.stat(tasksLockPath);
    const ageMs = now.getTime() - stat.mtimeMs;
    if (ageMs > staleLockThresholdMs) {
      const ageSec = Math.round(ageMs / 1000);
      diagnostics.push({
        severity: 'warning',
        code: 'stale_tasks_lock',
        message: `tasks.lock is ${ageSec}s old (threshold ${Math.round(staleLockThresholdMs / 1000)}s). Remove it manually if no iteration is in progress.`
      });
    }
  } catch {
    // lock file absent — expected during normal operation
  }

  // Read claims.json for active-claim checks
  const claimsRecord = await readJsonRecord(input.claimFilePath);
  if (!claimsRecord) {
    return diagnostics;
  }

  const rawClaims = Array.isArray(claimsRecord.claims) ? claimsRecord.claims : [];
  const activeClaims = rawClaims.filter(
    (c): c is Record<string, unknown> =>
      typeof c === 'object' && c !== null && (c as Record<string, unknown>).status === 'active'
  );

  if (activeClaims.length === 0) {
    return diagnostics;
  }

  // Load iteration-result.json records so stale-claim checks can match claim-specific evidence.
  const iterationSignals: IterationResultSignal[] = [];
  try {
    const entries = await fs.readdir(input.artifactDir, { withFileTypes: true });
    await Promise.all(
      entries
        .filter((e) => e.isDirectory() && e.name.startsWith('iteration-'))
        .map(async (e) => {
          const resultPath = path.join(input.artifactDir, e.name, 'iteration-result.json');
          try {
            const stat = await fs.stat(resultPath);
            const record = await readJsonRecord(resultPath);
            iterationSignals.push({
              provenanceId: readStringField(record, 'provenanceId'),
              selectedTaskId: readStringField(record, 'selectedTaskId'),
              finishedAtMs: readTimestampMs(record?.finishedAt),
              mtimeMs: stat.mtimeMs
            });
          } catch {
            // no result file in this dir
          }
        })
    );
  } catch {
    // artifactDir absent or unreadable
  }

  // Read state.json run and iteration history for claim-specific offline detection.
  const stateRecord = await readJsonRecord(input.stateFilePath);
  const stateSignals: StateRunSignal[] = [];
  const pushStateSignal = (record: Record<string, unknown> | null): void => {
    if (!record) {
      return;
    }

    stateSignals.push({
      agentId: readStringField(record, 'agentId'),
      provenanceId: readStringField(record, 'provenanceId'),
      selectedTaskId: readStringField(record, 'selectedTaskId'),
      finishedAtMs: readTimestampMs(record.finishedAt)
    });
  };
  const lastRunRecord = typeof stateRecord?.lastRun === 'object' && stateRecord.lastRun !== null
    ? stateRecord.lastRun as Record<string, unknown>
    : null;
  pushStateSignal(lastRunRecord);
  const runHistory = Array.isArray(stateRecord?.runHistory) ? stateRecord.runHistory : [];
  for (const entry of runHistory) {
    if (typeof entry === 'object' && entry !== null) {
      pushStateSignal(entry as Record<string, unknown>);
    }
  }
  const lastIterationRecord = typeof stateRecord?.lastIteration === 'object' && stateRecord.lastIteration !== null
    ? stateRecord.lastIteration as Record<string, unknown>
    : null;
  pushStateSignal(lastIterationRecord);
  const iterationHistory = Array.isArray(stateRecord?.iterationHistory) ? stateRecord.iterationHistory : [];
  for (const entry of iterationHistory) {
    if (typeof entry === 'object' && entry !== null) {
      pushStateSignal(entry as Record<string, unknown>);
    }
  }

  for (const claim of activeClaims) {
    const claimedAt = typeof claim.claimedAt === 'string' ? claim.claimedAt : null;
    const agentId = typeof claim.agentId === 'string' ? claim.agentId : 'unknown';
    const taskId = typeof claim.taskId === 'string' ? claim.taskId : 'unknown';

    if (!claimedAt) {
      continue;
    }

    const claimTimeMs = new Date(claimedAt).getTime();
    if (isNaN(claimTimeMs)) {
      continue;
    }

    const claimAgeMs = now.getTime() - claimTimeMs;
    if (claimAgeMs <= staleClaimTtlMs) {
      continue; // claim is within TTL — not stale
    }

    const claimAgeSec = Math.round(claimAgeMs / 1000);

    // (3) No matching iteration result found after claim time
    const hasResultAfterClaim = iterationSignals.some((signal) =>
      signal.mtimeMs > claimTimeMs
      && claimMatchesSignal(claim, signal)
    );
    if (!hasResultAfterClaim) {
      diagnostics.push({
        severity: 'warning',
        code: 'stale_active_claim_no_result',
        message: `Active claim by ${agentId} on task ${taskId} is ${claimAgeSec}s old (since ${claimedAt}) with no iteration result found after claim time.`
      });
    }

    // (4) No recent matching state signal — agent may be offline
    const hasRecentStateSignal = stateSignals.some((signal) =>
      signal.finishedAtMs !== null
      && signal.finishedAtMs > claimTimeMs
      && claimMatchesSignal(claim, signal)
    );
    if (!hasRecentStateSignal) {
      diagnostics.push({
        severity: 'warning',
        code: 'stale_active_claim_agent_offline',
        message: `Active claim by ${agentId} on task ${taskId} is ${claimAgeSec}s old with no matching state.json run after claim time; agent may be offline.`
      });
    }
  }

  return diagnostics;
}

export async function inspectPreflightArtifactReadiness(
  input: RalphPreflightArtifactReadinessInput
): Promise<RalphPreflightExternalDiagnostic[]> {
  const diagnostics: RalphPreflightExternalDiagnostic[] = [];
  const latestPaths = resolveLatestArtifactPaths(input.artifactRootDir);
  const [
    latestResultRecord,
    latestPreflightRecord,
    latestPromptEvidenceRecord,
    latestExecutionPlanRecord,
    latestCliInvocationRecord,
    latestProvenanceBundleRecord,
    latestProvenanceFailureRecord,
    latestSummaryExists,
    latestPreflightSummaryExists,
    latestProvenanceSummaryExists,
    generatedArtifactRetention,
    provenanceBundleRetention
  ] = await Promise.all([
    readJsonRecord(latestPaths.latestResultPath),
    readJsonRecord(latestPaths.latestPreflightReportPath),
    readJsonRecord(latestPaths.latestPromptEvidencePath),
    readJsonRecord(latestPaths.latestExecutionPlanPath),
    readJsonRecord(latestPaths.latestCliInvocationPath),
    readJsonRecord(latestPaths.latestProvenanceBundlePath),
    readJsonRecord(latestPaths.latestProvenanceFailurePath),
    pathExists(latestPaths.latestSummaryPath),
    pathExists(latestPaths.latestPreflightSummaryPath),
    pathExists(latestPaths.latestProvenanceSummaryPath),
    inspectGeneratedArtifactRetention({
      artifactRootDir: input.artifactRootDir,
      promptDir: input.promptDir,
      runDir: input.runDir,
      stateFilePath: input.stateFilePath,
      retentionCount: input.generatedArtifactRetentionCount
    }),
    inspectProvenanceBundleRetention({
      artifactRootDir: input.artifactRootDir,
      retentionCount: input.provenanceBundleRetentionCount
    })
  ]);

  const staleLatestArtifactPaths: string[] = [];
  if (latestResultRecord && !latestSummaryExists) {
    staleLatestArtifactPaths.push(latestPaths.latestSummaryPath);
  }
  if (latestPreflightRecord && !latestPreflightSummaryExists) {
    staleLatestArtifactPaths.push(latestPaths.latestPreflightSummaryPath);
  }
  if (latestProvenanceBundleRecord && !latestProvenanceSummaryExists) {
    staleLatestArtifactPaths.push(latestPaths.latestProvenanceSummaryPath);
  }
  if (staleLatestArtifactPaths.length > 0) {
    diagnostics.push({
      severity: 'warning',
      code: 'latest_artifact_surfaces_stale',
      message: `Latest artifact surfaces are stale or missing: ${basenameList(input.rootPath, staleLatestArtifactPaths)}.`
    });
  }

  const latestRecords: Array<{
    latestArtifactPath: string;
    record: Record<string, unknown> | null;
    fields: readonly string[];
  }> = [
    {
      latestArtifactPath: latestPaths.latestResultPath,
      record: latestResultRecord,
      fields: PROTECTED_GENERATED_LATEST_POINTER_REFERENCES['latest-result.json']
    },
    {
      latestArtifactPath: latestPaths.latestPreflightReportPath,
      record: latestPreflightRecord,
      fields: PROTECTED_GENERATED_LATEST_POINTER_REFERENCES['latest-preflight-report.json']
    },
    {
      latestArtifactPath: latestPaths.latestExecutionPlanPath,
      record: latestExecutionPlanRecord,
      fields: PROTECTED_GENERATED_LATEST_POINTER_REFERENCES['latest-execution-plan.json']
    },
    {
      latestArtifactPath: latestPaths.latestCliInvocationPath,
      record: latestCliInvocationRecord,
      fields: PROTECTED_GENERATED_LATEST_POINTER_REFERENCES['latest-cli-invocation.json']
    },
    {
      latestArtifactPath: latestPaths.latestProvenanceBundlePath,
      record: latestProvenanceBundleRecord,
      fields: PROTECTED_GENERATED_LATEST_POINTER_REFERENCES['latest-provenance-bundle.json']
    },
    {
      latestArtifactPath: latestPaths.latestProvenanceFailurePath,
      record: latestProvenanceFailureRecord,
      fields: PROTECTED_GENERATED_LATEST_POINTER_REFERENCES['latest-provenance-failure.json']
    }
  ];
  const missingPointerTargets: string[] = [];
  await Promise.all(latestRecords.map(async ({ latestArtifactPath, record, fields }) => {
    if (!record) {
      return;
    }

    const targetPaths = fields
      .map((field) => record[field])
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
    const missingTargets = (await Promise.all(targetPaths.map(async (targetPath) =>
      await pathExists(targetPath) ? null : targetPath
    ))).filter((value): value is string => value !== null);
    if (missingTargets.length > 0) {
      missingPointerTargets.push(
        `${path.basename(latestArtifactPath)} -> ${basenameList(input.rootPath, missingTargets)}`
      );
    }
  }));
  const promptEvidenceTargets = derivedPromptEvidenceReferences(latestPromptEvidenceRecord, {
    artifactRootDir: input.artifactRootDir,
    promptDir: input.promptDir
  });
  const missingPromptEvidenceTargets = (await Promise.all(promptEvidenceTargets.map(async (targetPath) =>
    await pathExists(targetPath) ? null : targetPath
  ))).filter((value): value is string => value !== null);
  if (missingPromptEvidenceTargets.length > 0) {
    missingPointerTargets.push(
      `latest-prompt-evidence.json -> ${basenameList(input.rootPath, missingPromptEvidenceTargets)}`
    );
  }
  if (missingPointerTargets.length > 0) {
    diagnostics.push({
      severity: 'warning',
      code: 'latest_artifact_pointer_targets_missing',
      message: `Latest artifact pointers reference missing files: ${missingPointerTargets.join(' | ')}.`
    });
  }

  const overlappingRoots = [
    ['artifact retention', input.artifactRootDir, 'prompt', input.promptDir],
    ['artifact retention', input.artifactRootDir, 'run', input.runDir]
  ].filter((entry) => pathOverlaps(entry[1], entry[3]));
  if (overlappingRoots.length > 0) {
    diagnostics.push({
      severity: 'warning',
      code: 'artifact_cleanup_root_overlap',
      message: `Artifact cleanup roots overlap and cleanup cannot prune safely: ${overlappingRoots
        .map(([leftLabel, leftPath, rightLabel, rightPath]) =>
          `${leftLabel} ${relativePath(input.rootPath, leftPath)} with ${rightLabel} ${relativePath(input.rootPath, rightPath)}`)
        .join(' | ')}.`
    });
  }

  if (input.generatedArtifactRetentionCount <= 0
    && (generatedArtifactRetention.retainedIterationDirectories.length > 0
      || generatedArtifactRetention.retainedPromptFiles.length > 0
      || generatedArtifactRetention.retainedRunArtifactBaseNames.length > 0)) {
    diagnostics.push({
      severity: 'warning',
      code: 'generated_artifact_retention_disabled',
      message: `Generated-artifact cleanup is disabled, so older prompts, runs, and iteration directories will accumulate under ${relativePath(input.rootPath, input.artifactRootDir)} and .ralph until removed manually.`
    });
  }

  if (input.provenanceBundleRetentionCount <= 0 && provenanceBundleRetention.retainedBundleIds.length > 0) {
    diagnostics.push({
      severity: 'warning',
      code: 'provenance_bundle_retention_disabled',
      message: 'Provenance-bundle cleanup is disabled, so older run bundles will accumulate until removed manually.'
    });
  }

  if (input.generatedArtifactRetentionCount > 0
    && (generatedArtifactRetention.protectedRetainedIterationDirectories.length > 0
      || generatedArtifactRetention.protectedRetainedPromptFiles.length > 0
      || generatedArtifactRetention.protectedRetainedRunArtifactBaseNames.length > 0)) {
    diagnostics.push({
      severity: 'info',
      code: 'generated_artifact_retention_protected_overflow',
      message: `Generated-artifact retention currently keeps older protected references beyond the newest ${input.generatedArtifactRetentionCount}: iterations ${generatedArtifactRetention.protectedRetainedIterationDirectories.length}, prompts ${generatedArtifactRetention.protectedRetainedPromptFiles.length}, runs ${generatedArtifactRetention.protectedRetainedRunArtifactBaseNames.length}.`
    });
  }

  if (input.provenanceBundleRetentionCount > 0 && provenanceBundleRetention.protectedBundleIds.length > 0) {
    diagnostics.push({
      severity: 'info',
      code: 'provenance_bundle_retention_protected_overflow',
      message: `Bundle retention currently keeps ${provenanceBundleRetention.protectedBundleIds.length} older protected run bundle${provenanceBundleRetention.protectedBundleIds.length === 1 ? '' : 's'} beyond the newest ${input.provenanceBundleRetentionCount}.`
    });
  }

  return diagnostics;
}

export interface CheckHandoffHealthInput {
  ralphRoot: string;
  now?: Date;
}

/**
 * Scan `.ralph/handoffs/*.json` for expired or contested handoffs and return
 * Agent Health diagnostics.
 *
 * - `proposed` or `accepted` handoffs past their `expiresAt` → warning
 * - `contested` handoffs → error (requires operator or watchdog resolution)
 */
export async function checkHandoffHealth(
  input: CheckHandoffHealthInput
): Promise<RalphPreflightExternalDiagnostic[]> {
  const diagnostics: RalphPreflightExternalDiagnostic[] = [];
  const now = input.now ?? new Date();
  const handoffDir = resolveHandoffDir(input.ralphRoot);

  let entries: string[];
  try {
    const dirEntries = await fs.readdir(handoffDir);
    entries = dirEntries.filter((name) => name.endsWith('.json'));
  } catch {
    // handoffs dir absent — no-op
    return diagnostics;
  }

  await Promise.all(entries.map(async (name) => {
    const filePath = path.join(handoffDir, name);
    let handoff: RalphHandoff;
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      handoff = JSON.parse(raw) as RalphHandoff;
    } catch {
      return; // skip unreadable or malformed files
    }

    const { handoffId, fromAgentId, taskId, status } = handoff;

    if (status === 'contested') {
      diagnostics.push({
        severity: 'error',
        code: 'contested_handoff',
        message: `Handoff ${handoffId} (task ${taskId}, from ${fromAgentId}) is contested. Operator or watchdog must resolve it before the loop can safely proceed.`
      });
      return;
    }

    if ((status === 'proposed' || status === 'accepted') && isHandoffExpired(handoff, now)) {
      diagnostics.push({
        severity: 'warning',
        code: 'expired_handoff_unresolved',
        message: `Handoff ${handoffId} (task ${taskId}, from ${fromAgentId}) expired at ${handoff.expiresAt} but is still in status "${status}". Resolve or remove it to keep the handoff log clean.`
      });
    }
  }));

  return diagnostics;
}

export function buildPreflightReport(input: RalphPreflightInput): RalphPreflightReport {
  const diagnostics: RalphPreflightDiagnostic[] = [...input.taskInspection.diagnostics];
  const taskTitles = buildTaskTitleLookup(input.taskInspection.taskFile?.tasks);
  const activeClaimSummary = summarizeActiveClaimsByAgent(input.claimGraph, taskTitles);
  const currentProvenanceId = input.currentProvenanceId?.trim() || null;
  const defaultAgentClaims = input.claimGraph?.claimFile.claims.filter((claim) => (
    claim.status === 'active'
    && claim.agentId === DEFAULT_RALPH_AGENT_ID
    && (currentProvenanceId === null || claim.provenanceId !== currentProvenanceId)
  )) ?? [];

  if (input.config.agentId === DEFAULT_RALPH_AGENT_ID && defaultAgentClaims.length > 0) {
    diagnostics.push(createDiagnostic(
      'claimGraph',
      'warning',
      'default_agent_id_collision',
      `Configured agentId is "${DEFAULT_RALPH_AGENT_ID}" while another active "${DEFAULT_RALPH_AGENT_ID}" claim already exists (${defaultAgentClaims
        .map((claim) => `${claim.taskId}/${claim.provenanceId}`)
        .join(', ')}). Set ralphCodex.agentId to a unique value for each concurrent loop instance.`
    ));
  }

  for (const claimEntry of input.claimGraph?.tasks ?? []) {
    if (claimEntry.contested) {
      diagnostics.push(createDiagnostic(
        'claimGraph',
        'warning',
        'task_claim_contested',
        `Task ${claimEntry.taskId} has contested active claims: ${claimEntry.activeClaims
          .map((activeClaim) => `${activeClaim.claim.agentId}/${activeClaim.claim.provenanceId}`)
          .join(', ')}.`,
        { taskId: claimEntry.taskId }
      ));
    }

    const canonicalClaim = claimEntry.canonicalClaim;
    if (!canonicalClaim) {
      continue;
    }

    if (canonicalClaim.stale) {
      diagnostics.push(createDiagnostic(
        'claimGraph',
        'warning',
        'task_claim_stale',
        `Task ${claimEntry.taskId} is held by ${canonicalClaim.claim.agentId}/${canonicalClaim.claim.provenanceId} but the active claim is stale from ${canonicalClaim.claim.claimedAt}.`,
        { taskId: claimEntry.taskId }
      ));
    }

    if (currentProvenanceId && canonicalClaim.claim.provenanceId !== currentProvenanceId) {
      diagnostics.push(createDiagnostic(
        'claimGraph',
        'info',
        'task_claim_provenance_mismatch',
        `Task ${claimEntry.taskId} is currently claimed by ${canonicalClaim.claim.agentId}/${canonicalClaim.claim.provenanceId}, not the current iteration provenance ${currentProvenanceId}.`,
        { taskId: claimEntry.taskId }
      ));
    }
  }

  if (input.claimGraph?.latestResolvedClaim?.claim.resolvedAt && input.claimGraph.latestResolvedClaim.claim.resolutionReason) {
    const resolvedClaim = input.claimGraph.latestResolvedClaim.claim;
    diagnostics.push(createDiagnostic(
      'claimGraph',
      'info',
      'stale_claim_resolved',
      `Task ${resolvedClaim.taskId} claim ${resolvedClaim.agentId}/${resolvedClaim.provenanceId} was marked ${resolvedClaim.status} at ${resolvedClaim.resolvedAt} because ${resolvedClaim.resolutionReason}.`,
      { taskId: resolvedClaim.taskId }
    ));
  }

  for (const diagnostic of input.artifactReadinessDiagnostics ?? []) {
    diagnostics.push(createDiagnostic(
      'workspaceRuntime',
      diagnostic.severity,
      diagnostic.code,
      diagnostic.message
    ));
  }

  for (const diagnostic of input.agentHealthDiagnostics ?? []) {
    diagnostics.push(createDiagnostic(
      'agentHealth',
      diagnostic.severity,
      diagnostic.code,
      diagnostic.message
    ));
  }

  diagnostics.push(createDiagnostic(
    'agentHealth',
    'info',
    'configured_agent_count',
    `Configured parallelism: ralphCodex.agentCount = ${input.config.agentCount}${input.config.agentCount > 1 ? ` (${input.config.agentCount} concurrent agent instances expected)` : ' (single-agent mode)'}.`
  ));

  const effectivePolicy = getEffectivePolicy(input.config.agentRole);
  const policySource = input.rolePolicySource ?? 'preset';
  diagnostics.push(createDiagnostic(
    'agentHealth',
    'info',
    'role_policy_effective',
    `Role policy effective: role=${effectivePolicy.role} source=${policySource} allowedNodeKinds=[${effectivePolicy.allowedNodeKinds.join(',')}] allowedTaskStateMutations=[${effectivePolicy.allowedTaskStateMutations.join(',')}] humanGateRequired=${effectivePolicy.humanGateRequired}`
  ));

  if (isDedicatedPlanningFallbackSingleAgent(input.config)) {
    diagnostics.push(createDiagnostic(
      'workspaceRuntime',
      'warning',
      'dedicated_planning_fallback_single_agent',
      'Planning pass is set to dedicated, but this run has no planner capacity in single-agent mode. Ralph will fall back to inline planning for implementer task selection and execution.'
    ));
  }

  if (!input.workspaceTrusted) {
    diagnostics.push(createDiagnostic(
      'workspaceRuntime',
      'info',
      'workspace_untrusted',
      'Workspace is not trusted; only read-only Ralph status inspection is supported.'
    ));
  }

  const missingFiles = [
    input.fileStatus.prdPath ? null : 'PRD',
    input.fileStatus.progressPath ? null : 'progress log',
    input.fileStatus.taskFilePath ? null : 'task file'
  ].filter((value): value is string => value !== null);

  if (missingFiles.length > 0) {
    diagnostics.push(createDiagnostic(
      'workspaceRuntime',
      'warning',
      'ralph_files_missing',
      `Missing Ralph workspace files: ${missingFiles.join(', ')}.`
    ));
  }

  if ((input.createdPaths ?? []).length > 0) {
    diagnostics.push(createDiagnostic(
      'workspaceRuntime',
      'info',
      'workspace_paths_initialized',
      `Initialized Ralph paths: ${input.createdPaths!.map((target) => relativePath(input.rootPath, target)).join(', ')}.`
    ));
  }

  if (input.structureDefinitionGeneration?.written) {
    diagnostics.push(createDiagnostic(
      'workspaceRuntime',
      'info',
      'structure_definition_generated',
      `Generated structure definition at ${relativePath(input.rootPath, input.structureDefinitionGeneration.path)} during workspace preflight.`
    ));
  }

  if (input.sessionHandoff) {
    diagnostics.push(createDiagnostic(
      'workspaceRuntime',
      'info',
      'session_handoff_available',
      `Resuming from handoff note ${input.sessionHandoff.agentId}-${String(input.sessionHandoff.iteration).padStart(3, '0')}.json: ${input.sessionHandoff.humanSummary}`
    ));
  }

  if (input.taskInspection.taskFile && input.selectedTask === null) {
    const counts = input.taskCounts;
    const nextActionableTask = selectNextTask(input.taskInspection.taskFile);
    if (nextActionableTask === null && counts && (counts.todo > 0 || counts.in_progress > 0 || counts.blocked > 0)) {
      diagnostics.push(createDiagnostic(
        'workspaceRuntime',
        'warning',
        'no_actionable_task',
        'No actionable task is currently selectable. Check blocked tasks and incomplete dependencies.'
      ));
    }
  }

  if (input.lastSummarizationMode === 'fallback_summary') {
    diagnostics.push(createDiagnostic(
      'workspaceRuntime',
      'info',
      'memory_summarization_fallback',
      'Memory summarization used a static fallback instead of the active provider. The provider\'s summarizeText call failed or is not implemented. Check provider connectivity.'
    ));
  }

  diagnostics.push(...(input.providerReadinessDiagnostics ?? collectProviderReadinessDiagnostics({
    config: input.config,
    codexCliSupport: input.codexCliSupport,
    ideCommandSupport: input.ideCommandSupport
  })));

  if (input.config.verifierModes.includes('validationCommand')) {
    if (!input.validationCommand) {
      diagnostics.push(createDiagnostic(
        'validationVerifier',
        'warning',
        'validation_command_missing',
        'Validation-command verifier is enabled but no validation command was selected for this iteration.'
      ));
    } else if (input.validationCommandReadiness.status === 'executableConfirmed') {
      diagnostics.push(createDiagnostic(
        'validationVerifier',
        'info',
        'validation_command_executable_confirmed',
        `Validation command executable token was confirmed before execution: ${input.validationCommandReadiness.executable ?? input.validationCommand}.`
      ));
    } else if (input.validationCommandReadiness.status === 'executableNotConfirmed') {
      diagnostics.push(createDiagnostic(
        'validationVerifier',
        'warning',
        'validation_command_executable_not_confirmed',
        `Validation command was selected but its executable token could not be confirmed before execution: ${input.validationCommandReadiness.executable ?? input.validationCommand}.`
      ));
    } else {
      diagnostics.push(createDiagnostic(
        'validationVerifier',
        'info',
        'validation_command_selected_not_confirmed',
        `Validation command was selected but preflight could not confirm its executable cheaply: ${input.validationCommand}.`
      ));
    }
  }

  if (input.normalizedValidationCommandFrom && input.validationCommand) {
    diagnostics.push(createDiagnostic(
      'validationVerifier',
      'info',
      'validation_command_normalized',
      `Normalized the selected validation command from "${input.normalizedValidationCommandFrom}" to "${input.validationCommand}" because the verifier root already matches the nested repo target.`
    ));
  }

  if (input.config.verifierModes.length === 0) {
    diagnostics.push(createDiagnostic(
      'validationVerifier',
      'info',
      'no_verifiers_enabled',
      'No post-iteration verifiers are enabled.'
    ));
  }

  const orderedDiagnostics = sortDiagnostics(diagnostics);
  const ready = !orderedDiagnostics.some((diagnostic) => diagnostic.severity === 'error');
  const byCategory = (category: RalphPreflightCategory) => orderedDiagnostics.filter((diagnostic) => diagnostic.category === category);
  const scopeSummary = [
    sectionSummary('taskGraph', byCategory('taskGraph')),
    sectionSummary('claimGraph', byCategory('claimGraph')),
    sectionSummary('workspaceRuntime', byCategory('workspaceRuntime')),
    sectionSummary('codexAdapter', byCategory('codexAdapter')),
    sectionSummary('validationVerifier', byCategory('validationVerifier')),
    sectionSummary('agentHealth', byCategory('agentHealth'))
  ].join(' | ');
  const selectionSummary = summarizeTaskSelection(input.selectedTask, orderedDiagnostics);
  const validationSummary = input.validationCommand
    ? [
      `Validation ${input.validationCommand}.`,
      input.validationCommandReadiness.status === 'executableConfirmed'
        ? 'Executable token confirmed.'
        : input.validationCommandReadiness.status === 'executableNotConfirmed'
          ? 'Executable token not confirmed.'
          : input.validationCommandReadiness.status === 'selected'
            ? 'Executable not checked.'
            : 'No validation command selected.'
    ].join(' ')
    : 'Validation none.';

  return {
    ready,
    summary: `Preflight ${ready ? 'ready' : 'blocked'}: ${selectionSummary} ${validationSummary} Active claims ${activeClaimSummary}. ${scopeSummary}`,
    activeClaimSummary,
    diagnostics: orderedDiagnostics
  };
}

export function renderPreflightReport(report: RalphPreflightReport): string {
  const renderDiagnostic = (diagnostic: RalphPreflightDiagnostic): string =>
    `- ${diagnostic.severity} [${diagnostic.code}]: ${diagnostic.message}`;
  const sections = (Object.keys(CATEGORY_LABELS) as RalphPreflightCategory[]).map((category) => {
    const diagnostics = report.diagnostics.filter((diagnostic) => diagnostic.category === category);
    return [
      `## ${CATEGORY_LABELS[category]}`,
      diagnostics.length > 0
        ? diagnostics.map(renderDiagnostic).join('\n')
        : '- ok'
    ].join('\n');
  });

  return [
    '# Ralph Preflight',
    '',
    `- Ready: ${report.ready ? 'yes' : 'no'}`,
    `- Summary: ${report.summary}`,
    `- Active claim state: ${report.activeClaimSummary ?? 'none'}`,
    '',
    ...sections
  ].join('\n');
}

export function buildBlockingPreflightMessage(report: RalphPreflightReport): string {
  const blockingDiagnostics = report.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
  const firstReason = blockingDiagnostics[0]?.message ?? 'Unknown preflight failure.';
  return `Ralph preflight blocked iteration start. ${firstReason}`;
}
