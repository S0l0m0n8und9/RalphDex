"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.summarizeActiveClaimsByAgent = summarizeActiveClaimsByAgent;
exports.collectProviderReadinessDiagnostics = collectProviderReadinessDiagnostics;
exports.checkStaleState = checkStaleState;
exports.inspectPreflightArtifactReadiness = inspectPreflightArtifactReadiness;
exports.checkHandoffHealth = checkHandoffHealth;
exports.buildPreflightReport = buildPreflightReport;
exports.renderPreflightReport = renderPreflightReport;
exports.buildBlockingPreflightMessage = buildBlockingPreflightMessage;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const providers_1 = require("../config/providers");
const fs_1 = require("../util/fs");
const artifactStore_1 = require("./artifactStore");
const types_1 = require("./types");
const taskFile_1 = require("./taskFile");
const planningPass_1 = require("./planningPass");
const handoffManager_1 = require("./handoffManager");
const CATEGORY_LABELS = {
    taskGraph: 'Task graph',
    claimGraph: 'Claim graph',
    workspaceRuntime: 'Workspace/runtime',
    codexAdapter: 'Codex adapter',
    validationVerifier: 'Validation/verifier',
    agentHealth: 'Agent Health'
};
const DEFAULT_STALE_LOCK_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
function createDiagnostic(category, severity, code, message, details = {}) {
    return {
        category,
        severity,
        code,
        message,
        ...details
    };
}
function relativePath(rootPath, target) {
    return path.relative(rootPath, target) || '.';
}
function sectionSummary(category, diagnostics) {
    const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length;
    const warnings = diagnostics.filter((diagnostic) => diagnostic.severity === 'warning').length;
    const infos = diagnostics.filter((diagnostic) => diagnostic.severity === 'info').length;
    const parts = [];
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
function sortDiagnostics(diagnostics) {
    const severityRank = new Map([
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
function summarizeTaskSelection(selectedTask, diagnostics) {
    if (selectedTask) {
        return `Selected task ${selectedTask.id}.`;
    }
    const taskLedgerDrift = diagnostics.find((diagnostic) => (diagnostic.category === 'taskGraph' && diagnostic.severity === 'error'));
    if (taskLedgerDrift) {
        return `No task selected because task-ledger drift blocks safe selection: ${taskLedgerDrift.message}`;
    }
    return 'No task selected.';
}
function buildTaskTitleLookup(tasks) {
    const titles = new Map();
    for (const task of tasks ?? []) {
        titles.set(task.id, task.title);
    }
    return titles;
}
function formatActiveClaimLabel(claim, stale, taskTitles) {
    const title = taskTitles.get(claim.taskId);
    return `${claim.taskId}${title ? ` - ${title}` : ''} @ ${claim.claimedAt} (${stale ? 'stale' : 'fresh'})`;
}
function summarizeActiveClaimsByAgent(claimGraph, taskTitles) {
    const groupedClaims = new Map();
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
function readStringField(record, key) {
    const value = record?.[key];
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
}
function readTimestampMs(value) {
    if (typeof value !== 'string' || value.trim().length === 0) {
        return null;
    }
    const timestampMs = new Date(value).getTime();
    return Number.isNaN(timestampMs) ? null : timestampMs;
}
function collectProviderReadinessDiagnostics(input) {
    const diagnostics = [];
    if (input.codexCliSupport) {
        const cliSupport = input.codexCliSupport;
        const providerLabel = (0, providers_1.getCliProviderLabel)(cliSupport.provider ?? 'codex');
        const configKey = cliSupport.configKey ?? 'ralphCodex.codexCommandPath';
        if (input.codexCliSupport.check === 'pathMissing') {
            diagnostics.push(createDiagnostic('codexAdapter', 'error', 'codex_cli_missing', input.codexCliSupport.configuredAs === 'pathLookup'
                ? `${providerLabel} CLI command could not be resolved from PATH: ${input.codexCliSupport.commandPath}. Install the CLI or update ${configKey} to an explicit executable path.`
                : `Configured ${providerLabel} CLI path does not exist: ${input.codexCliSupport.commandPath}. Update ${configKey}.`));
        }
        else if (input.codexCliSupport.check === 'pathNotExecutable') {
            diagnostics.push(createDiagnostic('codexAdapter', 'error', 'codex_cli_not_executable', `Configured ${providerLabel} CLI path is not executable: ${input.codexCliSupport.commandPath}.`));
        }
        else if (input.codexCliSupport.check === 'pathLookupAssumed') {
            diagnostics.push(createDiagnostic('codexAdapter', 'warning', 'codex_cli_path_lookup_assumed', `${providerLabel} CLI will be resolved from PATH at runtime: ${input.codexCliSupport.commandPath}. Availability is assumed until execution starts.`));
        }
        else if (input.codexCliSupport.check === 'pathVerifiedExecutable') {
            diagnostics.push(createDiagnostic('codexAdapter', 'info', 'codex_cli_path_verified', input.codexCliSupport.configuredAs === 'pathLookup'
                ? `${providerLabel} CLI was resolved from PATH and verified: ${input.codexCliSupport.commandPath}.`
                : `Configured ${providerLabel} CLI executable was verified: ${input.codexCliSupport.commandPath}.`));
        }
    }
    if (input.ideCommandSupport?.status === 'unavailable') {
        const missingCommands = input.ideCommandSupport.missingCommandIds
            .filter((commandId) => commandId && commandId !== 'none');
        diagnostics.push(createDiagnostic('codexAdapter', 'warning', 'ide_command_strategy_unavailable', missingCommands.length > 0
            ? `Configured IDE command strategy is unavailable. Missing VS Code commands: ${missingCommands.join(', ')}. Clipboard handoff can still fall back.`
            : 'Configured IDE command strategy is unavailable because no usable VS Code command ids were configured. Clipboard handoff can still fall back.'));
    }
    else if (input.ideCommandSupport?.status === 'available') {
        diagnostics.push(createDiagnostic('codexAdapter', 'info', 'ide_command_strategy_available', `Configured IDE command strategy is available via ${input.ideCommandSupport.openSidebarCommandId} and ${input.ideCommandSupport.newChatCommandId}.`));
    }
    if (input.config.cliProvider === 'azure-foundry') {
        diagnostics.push(...collectAzureFoundryReadinessDiagnostics(input.config));
    }
    if (input.config.cliProvider === 'copilot-foundry') {
        diagnostics.push(...collectCopilotFoundryReadinessDiagnostics(input.config));
    }
    return diagnostics;
}
function collectAzureFoundryReadinessDiagnostics(config) {
    const diagnostics = [];
    if (!config.azureFoundry.endpointUrl.trim()) {
        diagnostics.push(createDiagnostic('codexAdapter', 'error', 'azure_foundry_endpoint_missing', 'cliProvider is set to azure-foundry but ralphCodex.azureFoundry.endpointUrl is not configured.'));
    }
    diagnostics.push(...collectAzureAuthReadinessDiagnostics('azure-foundry', config.azureFoundry.auth, {
        envPrefix: 'ralphCodex.azureFoundry.auth',
        bearerInfoCode: 'azure_foundry_auth_az_bearer',
        bearerInfoMessage: 'Azure AI Foundry will resolve a bearer token from Azure CLI at runtime. Ensure `az login` succeeds for the selected tenant and subscription before execution.',
        apiKeyInfoCode: 'azure_foundry_auth_api_key_active'
    }));
    return diagnostics;
}
function collectCopilotFoundryReadinessDiagnostics(config) {
    const diagnostics = [];
    if (!config.copilotFoundry.azure.baseUrlOverride.trim() && !config.copilotFoundry.azure.resourceName.trim()) {
        diagnostics.push(createDiagnostic('codexAdapter', 'error', 'copilot_foundry_base_url_missing', 'cliProvider is set to copilot-foundry but neither ralphCodex.copilotFoundry.azure.resourceName nor ralphCodex.copilotFoundry.azure.baseUrlOverride is configured.'));
    }
    if (!config.copilotFoundry.model.deployment.trim()) {
        diagnostics.push(createDiagnostic('codexAdapter', 'error', 'copilot_foundry_model_missing', 'cliProvider is set to copilot-foundry but ralphCodex.copilotFoundry.model.deployment is not configured.'));
    }
    diagnostics.push(...collectAzureAuthReadinessDiagnostics('copilot-foundry', config.copilotFoundry.auth, {
        envPrefix: 'ralphCodex.copilotFoundry.auth',
        bearerInfoCode: 'copilot_foundry_auth_az_bearer',
        bearerInfoMessage: 'Copilot Foundry will resolve a bearer token from Azure CLI at runtime and pass it to Copilot via COPILOT_PROVIDER_BEARER_TOKEN.',
        apiKeyInfoCode: 'copilot_foundry_auth_api_key_active'
    }));
    return diagnostics;
}
function collectAzureAuthReadinessDiagnostics(providerId, auth, options) {
    if (auth.mode === 'env-api-key') {
        if (!auth.apiKeyEnvVar.trim()) {
            return [createDiagnostic('codexAdapter', 'error', `${providerId.replace(/-/g, '_')}_api_key_env_missing`, `${providerId} auth mode is env-api-key but ${options.envPrefix}.apiKeyEnvVar is not configured.`)];
        }
        return [createDiagnostic('codexAdapter', 'info', options.apiKeyInfoCode, `${providerId} will resolve its API key from environment variable ${auth.apiKeyEnvVar.trim()} at runtime.`)];
    }
    if (auth.mode === 'vscode-secret') {
        if (!auth.secretStorageKey.trim()) {
            return [createDiagnostic('codexAdapter', 'error', `${providerId.replace(/-/g, '_')}_secret_storage_key_missing`, `${providerId} auth mode is vscode-secret but ${options.envPrefix}.secretStorageKey is not configured.`)];
        }
        return [createDiagnostic('codexAdapter', 'info', options.apiKeyInfoCode, `${providerId} will resolve its API key from VS Code secret key ${auth.secretStorageKey.trim()} at runtime.`)];
    }
    return [createDiagnostic('codexAdapter', 'info', options.bearerInfoCode, options.bearerInfoMessage)];
}
function claimMatchesSignal(claim, signal) {
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
function pathOverlaps(left, right) {
    const normalizedLeft = path.resolve(left);
    const normalizedRight = path.resolve(right);
    const leftRelative = path.relative(normalizedLeft, normalizedRight);
    const rightRelative = path.relative(normalizedRight, normalizedLeft);
    return (!leftRelative.startsWith('..') && !path.isAbsolute(leftRelative))
        || (!rightRelative.startsWith('..') && !path.isAbsolute(rightRelative));
}
function derivedPromptEvidenceReferences(record, dirs) {
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
function basenameList(rootPath, targets) {
    return targets
        .map((target) => relativePath(rootPath, target))
        .join(', ');
}
async function checkStaleState(input) {
    const diagnostics = [];
    const now = input.now ?? new Date();
    const staleLockThresholdMs = input.staleLockThresholdMs ?? DEFAULT_STALE_LOCK_THRESHOLD_MS;
    const staleClaimTtlMs = input.staleClaimTtlMs ?? taskFile_1.DEFAULT_CLAIM_TTL_MS;
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
    }
    catch {
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
    }
    catch {
        // lock file absent — expected during normal operation
    }
    // Read claims.json for active-claim checks
    const claimsRecord = await (0, fs_1.readJsonRecord)(input.claimFilePath);
    if (!claimsRecord) {
        return diagnostics;
    }
    const rawClaims = Array.isArray(claimsRecord.claims) ? claimsRecord.claims : [];
    const activeClaims = rawClaims.filter((c) => typeof c === 'object' && c !== null && c.status === 'active');
    if (activeClaims.length === 0) {
        return diagnostics;
    }
    // Load iteration-result.json records so stale-claim checks can match claim-specific evidence.
    const iterationSignals = [];
    try {
        const entries = await fs.readdir(input.artifactDir, { withFileTypes: true });
        await Promise.all(entries
            .filter((e) => e.isDirectory() && e.name.startsWith('iteration-'))
            .map(async (e) => {
            const resultPath = path.join(input.artifactDir, e.name, 'iteration-result.json');
            try {
                const stat = await fs.stat(resultPath);
                const record = await (0, fs_1.readJsonRecord)(resultPath);
                iterationSignals.push({
                    provenanceId: readStringField(record, 'provenanceId'),
                    selectedTaskId: readStringField(record, 'selectedTaskId'),
                    finishedAtMs: readTimestampMs(record?.finishedAt),
                    mtimeMs: stat.mtimeMs
                });
            }
            catch {
                // no result file in this dir
            }
        }));
    }
    catch {
        // artifactDir absent or unreadable
    }
    // Read state.json run and iteration history for claim-specific offline detection.
    const stateRecord = await (0, fs_1.readJsonRecord)(input.stateFilePath);
    const stateSignals = [];
    const pushStateSignal = (record) => {
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
        ? stateRecord.lastRun
        : null;
    pushStateSignal(lastRunRecord);
    const runHistory = Array.isArray(stateRecord?.runHistory) ? stateRecord.runHistory : [];
    for (const entry of runHistory) {
        if (typeof entry === 'object' && entry !== null) {
            pushStateSignal(entry);
        }
    }
    const lastIterationRecord = typeof stateRecord?.lastIteration === 'object' && stateRecord.lastIteration !== null
        ? stateRecord.lastIteration
        : null;
    pushStateSignal(lastIterationRecord);
    const iterationHistory = Array.isArray(stateRecord?.iterationHistory) ? stateRecord.iterationHistory : [];
    for (const entry of iterationHistory) {
        if (typeof entry === 'object' && entry !== null) {
            pushStateSignal(entry);
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
        const hasResultAfterClaim = iterationSignals.some((signal) => signal.mtimeMs > claimTimeMs
            && claimMatchesSignal(claim, signal));
        if (!hasResultAfterClaim) {
            diagnostics.push({
                severity: 'warning',
                code: 'stale_active_claim_no_result',
                message: `Active claim by ${agentId} on task ${taskId} is ${claimAgeSec}s old (since ${claimedAt}) with no iteration result found after claim time.`
            });
        }
        // (4) No recent matching state signal — agent may be offline
        const hasRecentStateSignal = stateSignals.some((signal) => signal.finishedAtMs !== null
            && signal.finishedAtMs > claimTimeMs
            && claimMatchesSignal(claim, signal));
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
async function inspectPreflightArtifactReadiness(input) {
    const diagnostics = [];
    const latestPaths = (0, artifactStore_1.resolveLatestArtifactPaths)(input.artifactRootDir);
    const [latestResultRecord, latestPreflightRecord, latestPromptEvidenceRecord, latestExecutionPlanRecord, latestCliInvocationRecord, latestProvenanceBundleRecord, latestProvenanceFailureRecord, latestSummaryExists, latestPreflightSummaryExists, latestProvenanceSummaryExists, generatedArtifactRetention, provenanceBundleRetention] = await Promise.all([
        (0, fs_1.readJsonRecord)(latestPaths.latestResultPath),
        (0, fs_1.readJsonRecord)(latestPaths.latestPreflightReportPath),
        (0, fs_1.readJsonRecord)(latestPaths.latestPromptEvidencePath),
        (0, fs_1.readJsonRecord)(latestPaths.latestExecutionPlanPath),
        (0, fs_1.readJsonRecord)(latestPaths.latestCliInvocationPath),
        (0, fs_1.readJsonRecord)(latestPaths.latestProvenanceBundlePath),
        (0, fs_1.readJsonRecord)(latestPaths.latestProvenanceFailurePath),
        (0, fs_1.pathExists)(latestPaths.latestSummaryPath),
        (0, fs_1.pathExists)(latestPaths.latestPreflightSummaryPath),
        (0, fs_1.pathExists)(latestPaths.latestProvenanceSummaryPath),
        (0, artifactStore_1.inspectGeneratedArtifactRetention)({
            artifactRootDir: input.artifactRootDir,
            promptDir: input.promptDir,
            runDir: input.runDir,
            stateFilePath: input.stateFilePath,
            retentionCount: input.generatedArtifactRetentionCount
        }),
        (0, artifactStore_1.inspectProvenanceBundleRetention)({
            artifactRootDir: input.artifactRootDir,
            retentionCount: input.provenanceBundleRetentionCount
        })
    ]);
    const staleLatestArtifactPaths = [];
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
    const latestRecords = [
        {
            latestArtifactPath: latestPaths.latestResultPath,
            record: latestResultRecord,
            fields: artifactStore_1.PROTECTED_GENERATED_LATEST_POINTER_REFERENCES['latest-result.json']
        },
        {
            latestArtifactPath: latestPaths.latestPreflightReportPath,
            record: latestPreflightRecord,
            fields: artifactStore_1.PROTECTED_GENERATED_LATEST_POINTER_REFERENCES['latest-preflight-report.json']
        },
        {
            latestArtifactPath: latestPaths.latestExecutionPlanPath,
            record: latestExecutionPlanRecord,
            fields: artifactStore_1.PROTECTED_GENERATED_LATEST_POINTER_REFERENCES['latest-execution-plan.json']
        },
        {
            latestArtifactPath: latestPaths.latestCliInvocationPath,
            record: latestCliInvocationRecord,
            fields: artifactStore_1.PROTECTED_GENERATED_LATEST_POINTER_REFERENCES['latest-cli-invocation.json']
        },
        {
            latestArtifactPath: latestPaths.latestProvenanceBundlePath,
            record: latestProvenanceBundleRecord,
            fields: artifactStore_1.PROTECTED_GENERATED_LATEST_POINTER_REFERENCES['latest-provenance-bundle.json']
        },
        {
            latestArtifactPath: latestPaths.latestProvenanceFailurePath,
            record: latestProvenanceFailureRecord,
            fields: artifactStore_1.PROTECTED_GENERATED_LATEST_POINTER_REFERENCES['latest-provenance-failure.json']
        }
    ];
    const missingPointerTargets = [];
    await Promise.all(latestRecords.map(async ({ latestArtifactPath, record, fields }) => {
        if (!record) {
            return;
        }
        const targetPaths = fields
            .map((field) => record[field])
            .filter((value) => typeof value === 'string' && value.trim().length > 0);
        const missingTargets = (await Promise.all(targetPaths.map(async (targetPath) => await (0, fs_1.pathExists)(targetPath) ? null : targetPath))).filter((value) => value !== null);
        if (missingTargets.length > 0) {
            missingPointerTargets.push(`${path.basename(latestArtifactPath)} -> ${basenameList(input.rootPath, missingTargets)}`);
        }
    }));
    const promptEvidenceTargets = derivedPromptEvidenceReferences(latestPromptEvidenceRecord, {
        artifactRootDir: input.artifactRootDir,
        promptDir: input.promptDir
    });
    const missingPromptEvidenceTargets = (await Promise.all(promptEvidenceTargets.map(async (targetPath) => await (0, fs_1.pathExists)(targetPath) ? null : targetPath))).filter((value) => value !== null);
    if (missingPromptEvidenceTargets.length > 0) {
        missingPointerTargets.push(`latest-prompt-evidence.json -> ${basenameList(input.rootPath, missingPromptEvidenceTargets)}`);
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
                .map(([leftLabel, leftPath, rightLabel, rightPath]) => `${leftLabel} ${relativePath(input.rootPath, leftPath)} with ${rightLabel} ${relativePath(input.rootPath, rightPath)}`)
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
/**
 * Scan `.ralph/handoffs/*.json` for expired or contested handoffs and return
 * Agent Health diagnostics.
 *
 * - `proposed` or `accepted` handoffs past their `expiresAt` → warning
 * - `contested` handoffs → error (requires operator or watchdog resolution)
 */
async function checkHandoffHealth(input) {
    const diagnostics = [];
    const now = input.now ?? new Date();
    const handoffDir = (0, handoffManager_1.resolveHandoffDir)(input.ralphRoot);
    let entries;
    try {
        const dirEntries = await fs.readdir(handoffDir);
        entries = dirEntries.filter((name) => name.endsWith('.json'));
    }
    catch {
        // handoffs dir absent — no-op
        return diagnostics;
    }
    await Promise.all(entries.map(async (name) => {
        const filePath = path.join(handoffDir, name);
        let handoff;
        try {
            const raw = await fs.readFile(filePath, 'utf8');
            handoff = JSON.parse(raw);
        }
        catch {
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
        if ((status === 'proposed' || status === 'accepted') && (0, handoffManager_1.isHandoffExpired)(handoff, now)) {
            diagnostics.push({
                severity: 'warning',
                code: 'expired_handoff_unresolved',
                message: `Handoff ${handoffId} (task ${taskId}, from ${fromAgentId}) expired at ${handoff.expiresAt} but is still in status "${status}". Resolve or remove it to keep the handoff log clean.`
            });
        }
    }));
    return diagnostics;
}
function buildPreflightReport(input) {
    const diagnostics = [...input.taskInspection.diagnostics];
    const taskTitles = buildTaskTitleLookup(input.taskInspection.taskFile?.tasks);
    const activeClaimSummary = summarizeActiveClaimsByAgent(input.claimGraph, taskTitles);
    const currentProvenanceId = input.currentProvenanceId?.trim() || null;
    const defaultAgentClaims = input.claimGraph?.claimFile.claims.filter((claim) => (claim.status === 'active'
        && claim.agentId === types_1.DEFAULT_RALPH_AGENT_ID
        && (currentProvenanceId === null || claim.provenanceId !== currentProvenanceId))) ?? [];
    if (input.config.agentId === types_1.DEFAULT_RALPH_AGENT_ID && defaultAgentClaims.length > 0) {
        diagnostics.push(createDiagnostic('claimGraph', 'warning', 'default_agent_id_collision', `Configured agentId is "${types_1.DEFAULT_RALPH_AGENT_ID}" while another active "${types_1.DEFAULT_RALPH_AGENT_ID}" claim already exists (${defaultAgentClaims
            .map((claim) => `${claim.taskId}/${claim.provenanceId}`)
            .join(', ')}). Set ralphCodex.agentId to a unique value for each concurrent loop instance.`));
    }
    for (const claimEntry of input.claimGraph?.tasks ?? []) {
        if (claimEntry.contested) {
            diagnostics.push(createDiagnostic('claimGraph', 'warning', 'task_claim_contested', `Task ${claimEntry.taskId} has contested active claims: ${claimEntry.activeClaims
                .map((activeClaim) => `${activeClaim.claim.agentId}/${activeClaim.claim.provenanceId}`)
                .join(', ')}.`, { taskId: claimEntry.taskId }));
        }
        const canonicalClaim = claimEntry.canonicalClaim;
        if (!canonicalClaim) {
            continue;
        }
        if (canonicalClaim.stale) {
            diagnostics.push(createDiagnostic('claimGraph', 'warning', 'task_claim_stale', `Task ${claimEntry.taskId} is held by ${canonicalClaim.claim.agentId}/${canonicalClaim.claim.provenanceId} but the active claim is stale from ${canonicalClaim.claim.claimedAt}.`, { taskId: claimEntry.taskId }));
        }
        if (currentProvenanceId && canonicalClaim.claim.provenanceId !== currentProvenanceId) {
            diagnostics.push(createDiagnostic('claimGraph', 'info', 'task_claim_provenance_mismatch', `Task ${claimEntry.taskId} is currently claimed by ${canonicalClaim.claim.agentId}/${canonicalClaim.claim.provenanceId}, not the current iteration provenance ${currentProvenanceId}.`, { taskId: claimEntry.taskId }));
        }
    }
    if (input.claimGraph?.latestResolvedClaim?.claim.resolvedAt && input.claimGraph.latestResolvedClaim.claim.resolutionReason) {
        const resolvedClaim = input.claimGraph.latestResolvedClaim.claim;
        diagnostics.push(createDiagnostic('claimGraph', 'info', 'stale_claim_resolved', `Task ${resolvedClaim.taskId} claim ${resolvedClaim.agentId}/${resolvedClaim.provenanceId} was marked ${resolvedClaim.status} at ${resolvedClaim.resolvedAt} because ${resolvedClaim.resolutionReason}.`, { taskId: resolvedClaim.taskId }));
    }
    for (const diagnostic of input.artifactReadinessDiagnostics ?? []) {
        diagnostics.push(createDiagnostic('workspaceRuntime', diagnostic.severity, diagnostic.code, diagnostic.message));
    }
    for (const diagnostic of input.agentHealthDiagnostics ?? []) {
        diagnostics.push(createDiagnostic('agentHealth', diagnostic.severity, diagnostic.code, diagnostic.message));
    }
    diagnostics.push(createDiagnostic('agentHealth', 'info', 'configured_agent_count', `Configured parallelism: ralphCodex.agentCount = ${input.config.agentCount}${input.config.agentCount > 1 ? ` (${input.config.agentCount} concurrent agent instances expected)` : ' (single-agent mode)'}.`));
    if ((0, planningPass_1.isDedicatedPlanningFallbackSingleAgent)(input.config)) {
        diagnostics.push(createDiagnostic('workspaceRuntime', 'warning', 'dedicated_planning_fallback_single_agent', 'Planning pass is set to dedicated, but this run has no planner capacity in single-agent mode. Ralph will fall back to inline planning for implementer task selection and execution.'));
    }
    if (!input.workspaceTrusted) {
        diagnostics.push(createDiagnostic('workspaceRuntime', 'info', 'workspace_untrusted', 'Workspace is not trusted; only read-only Ralph status inspection is supported.'));
    }
    const missingFiles = [
        input.fileStatus.prdPath ? null : 'PRD',
        input.fileStatus.progressPath ? null : 'progress log',
        input.fileStatus.taskFilePath ? null : 'task file'
    ].filter((value) => value !== null);
    if (missingFiles.length > 0) {
        diagnostics.push(createDiagnostic('workspaceRuntime', 'warning', 'ralph_files_missing', `Missing Ralph workspace files: ${missingFiles.join(', ')}.`));
    }
    if ((input.createdPaths ?? []).length > 0) {
        diagnostics.push(createDiagnostic('workspaceRuntime', 'info', 'workspace_paths_initialized', `Initialized Ralph paths: ${input.createdPaths.map((target) => relativePath(input.rootPath, target)).join(', ')}.`));
    }
    if (input.sessionHandoff) {
        diagnostics.push(createDiagnostic('workspaceRuntime', 'info', 'session_handoff_available', `Resuming from handoff note ${input.sessionHandoff.agentId}-${String(input.sessionHandoff.iteration).padStart(3, '0')}.json: ${input.sessionHandoff.humanSummary}`));
    }
    if (input.taskInspection.taskFile && input.selectedTask === null) {
        const counts = input.taskCounts;
        const nextActionableTask = (0, taskFile_1.selectNextTask)(input.taskInspection.taskFile);
        if (nextActionableTask === null && counts && (counts.todo > 0 || counts.in_progress > 0 || counts.blocked > 0)) {
            diagnostics.push(createDiagnostic('workspaceRuntime', 'warning', 'no_actionable_task', 'No actionable task is currently selectable. Check blocked tasks and incomplete dependencies.'));
        }
    }
    if (input.lastSummarizationMode === 'fallback_summary') {
        diagnostics.push(createDiagnostic('workspaceRuntime', 'info', 'memory_summarization_fallback', 'Memory summarization used a static fallback instead of the active provider. The provider\'s summarizeText call failed or is not implemented. Check provider connectivity.'));
    }
    diagnostics.push(...collectProviderReadinessDiagnostics({
        config: input.config,
        codexCliSupport: input.codexCliSupport,
        ideCommandSupport: input.ideCommandSupport
    }));
    if (input.config.verifierModes.includes('validationCommand')) {
        if (!input.validationCommand) {
            diagnostics.push(createDiagnostic('validationVerifier', 'warning', 'validation_command_missing', 'Validation-command verifier is enabled but no validation command was selected for this iteration.'));
        }
        else if (input.validationCommandReadiness.status === 'executableConfirmed') {
            diagnostics.push(createDiagnostic('validationVerifier', 'info', 'validation_command_executable_confirmed', `Validation command executable token was confirmed before execution: ${input.validationCommandReadiness.executable ?? input.validationCommand}.`));
        }
        else if (input.validationCommandReadiness.status === 'executableNotConfirmed') {
            diagnostics.push(createDiagnostic('validationVerifier', 'warning', 'validation_command_executable_not_confirmed', `Validation command was selected but its executable token could not be confirmed before execution: ${input.validationCommandReadiness.executable ?? input.validationCommand}.`));
        }
        else {
            diagnostics.push(createDiagnostic('validationVerifier', 'info', 'validation_command_selected_not_confirmed', `Validation command was selected but preflight could not confirm its executable cheaply: ${input.validationCommand}.`));
        }
    }
    if (input.normalizedValidationCommandFrom && input.validationCommand) {
        diagnostics.push(createDiagnostic('validationVerifier', 'info', 'validation_command_normalized', `Normalized the selected validation command from "${input.normalizedValidationCommandFrom}" to "${input.validationCommand}" because the verifier root already matches the nested repo target.`));
    }
    if (input.config.verifierModes.length === 0) {
        diagnostics.push(createDiagnostic('validationVerifier', 'info', 'no_verifiers_enabled', 'No post-iteration verifiers are enabled.'));
    }
    const orderedDiagnostics = sortDiagnostics(diagnostics);
    const ready = !orderedDiagnostics.some((diagnostic) => diagnostic.severity === 'error');
    const byCategory = (category) => orderedDiagnostics.filter((diagnostic) => diagnostic.category === category);
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
function renderPreflightReport(report) {
    const renderDiagnostic = (diagnostic) => `- ${diagnostic.severity} [${diagnostic.code}]: ${diagnostic.message}`;
    const sections = Object.keys(CATEGORY_LABELS).map((category) => {
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
function buildBlockingPreflightMessage(report) {
    const blockingDiagnostics = report.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
    const firstReason = blockingDiagnostics[0]?.message ?? 'Unknown preflight failure.';
    return `Ralph preflight blocked iteration start. ${firstReason}`;
}
//# sourceMappingURL=preflight.js.map