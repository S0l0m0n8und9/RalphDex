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
exports.getSettingsSurfaceMetadata = getSettingsSurfaceMetadata;
exports.buildSettingsSurfaceSnapshot = buildSettingsSurfaceSnapshot;
exports.buildSettingsDiscoveryState = buildSettingsDiscoveryState;
exports.collectNewSettingsNotice = collectNewSettingsNotice;
exports.readSettingsDiscoveryState = readSettingsDiscoveryState;
exports.writeSettingsDiscoveryState = writeSettingsDiscoveryState;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const defaults_1 = require("./defaults");
const autonomyManagedKeys_1 = require("./autonomyManagedKeys");
const SETTINGS_DISCOVERY_STATE_KEY = 'ralphCodex.settingsSurfaceDiscovery';
const SECTION_METADATA = [
    {
        id: 'provider',
        title: 'Provider Setup',
        description: 'Choose the active provider and command-path wiring.'
    },
    {
        id: 'model-reasoning',
        title: 'Model & Reasoning',
        description: 'Default model, reasoning effort, prompt caching, and model-tier routing.'
    },
    {
        id: 'loop-dynamics',
        title: 'Loop & Autonomy',
        description: 'Iteration caps, autonomy posture, recovery thresholds, and stop behaviour.'
    },
    {
        id: 'planning',
        title: 'Planning & Gates',
        description: 'Planning-pass behavior and pre-execution readiness gating.'
    },
    {
        id: 'validation-scm',
        title: 'Verification & SCM',
        description: 'Verifier orchestration, checkpointing, and source-control behavior.'
    },
    {
        id: 'memory',
        title: 'Prompt & Memory',
        description: 'Prompt templates, budget controls, and cross-iteration memory behavior.'
    },
    {
        id: 'operator-mode',
        title: 'Paths & Artifacts',
        description: 'Workspace file paths and artifact/provenance retention controls.'
    },
    {
        id: 'advanced',
        title: 'Handoff & Execution',
        description: 'Approval/sandbox posture, IDE handoff command IDs, and low-level loop controls.'
    },
    {
        id: 'copilot-foundry',
        title: 'Copilot BYOK',
        description: 'Copilot CLI + BYOK provider settings. Auth credentials are inherited from the operator process environment.'
    },
    {
        id: 'azure-foundry',
        title: 'Azure Foundry',
        description: 'Grouped Azure AI Foundry direct-provider controls.'
    },
];
const SETTINGS_SURFACE_REGISTRY = [
    { key: 'cliProvider', manifestKey: 'ralphCodex.cliProvider', sectionId: 'provider', title: 'CLI Provider', control: 'enum', description: 'Primary language-model CLI backend for the agent loop.', options: ['claude', 'codex', 'copilot', 'copilot-byok', 'copilot-foundry', 'azure-foundry', 'gemini'] },
    { key: 'codexCommandPath', manifestKey: 'ralphCodex.codexCommandPath', sectionId: 'provider', title: 'Codex Command Path', control: 'string', description: 'Path or command name for the Codex CLI executable.' },
    { key: 'claudeCommandPath', manifestKey: 'ralphCodex.claudeCommandPath', sectionId: 'provider', title: 'Claude Command Path', control: 'string', description: 'Path or command name for the Claude CLI executable.' },
    { key: 'copilotCommandPath', manifestKey: 'ralphCodex.copilotCommandPath', sectionId: 'provider', title: 'Copilot Command Path', control: 'string', description: 'Path or command name for the GitHub Copilot CLI executable.' },
    { key: 'geminiCommandPath', manifestKey: 'ralphCodex.geminiCommandPath', sectionId: 'provider', title: 'Gemini Command Path', control: 'string', description: 'Path or command name for the Google Gemini CLI executable.' },
    { key: 'model', manifestKey: 'ralphCodex.model', sectionId: 'model-reasoning', title: 'Default Model', control: 'suggested-string', description: 'Fallback model used when model tiering is disabled.' },
    { key: 'reasoningEffort', manifestKey: 'ralphCodex.reasoningEffort', sectionId: 'model-reasoning', title: 'Reasoning Effort', control: 'enum', description: 'Global reasoning effort default for provider runs. Set empty to omit explicit reasoning-effort flags.', options: ['', 'medium', 'high'] },
    { key: 'promptCaching', manifestKey: 'ralphCodex.promptCaching', sectionId: 'model-reasoning', title: 'Prompt Caching', control: 'enum', description: 'Prompt caching mode for providers that support explicit cache controls.', options: ['auto', 'force', 'off'] },
    { key: 'modelTiering.enabled', manifestKey: 'ralphCodex.modelTiering', sectionId: 'model-reasoning', title: 'Enable Model Tiering', control: 'boolean', description: 'Route tasks to different models dynamically based on task properties.' },
    { key: 'modelTiering.simpleThreshold', manifestKey: 'ralphCodex.modelTiering', sectionId: 'model-reasoning', title: 'Tier Threshold: Simple', control: 'number', description: 'Score strictly below this threshold maps to Simple.' },
    { key: 'modelTiering.complexThreshold', manifestKey: 'ralphCodex.modelTiering', sectionId: 'model-reasoning', title: 'Tier Threshold: Complex', control: 'number', description: 'Score at or above this threshold maps to Complex.' },
    { key: 'modelTiering.simple.model', manifestKey: 'ralphCodex.modelTiering', sectionId: 'model-reasoning', title: 'Simple Tier: Model', control: 'suggested-string', description: 'Model identifier for the Simple tier.' },
    { key: 'modelTiering.simple.provider', manifestKey: 'ralphCodex.modelTiering', sectionId: 'model-reasoning', title: 'Simple Tier: Provider', control: 'enum', description: 'Optional provider override for the Simple tier.', options: ['claude', 'codex', 'copilot', 'copilot-byok', 'copilot-foundry', 'azure-foundry', 'gemini'] },
    { key: 'modelTiering.simple.reasoningEffort', manifestKey: 'ralphCodex.modelTiering', sectionId: 'model-reasoning', title: 'Simple Tier: Reasoning Effort', control: 'enum', description: 'Optional reasoning-effort override for the Simple tier. Falls back to global reasoningEffort when omitted.', options: ['', 'medium', 'high'] },
    { key: 'modelTiering.medium.model', manifestKey: 'ralphCodex.modelTiering', sectionId: 'model-reasoning', title: 'Medium Tier: Model', control: 'suggested-string', description: 'Model identifier for the Medium tier.' },
    { key: 'modelTiering.medium.provider', manifestKey: 'ralphCodex.modelTiering', sectionId: 'model-reasoning', title: 'Medium Tier: Provider', control: 'enum', description: 'Optional provider override for the Medium tier.', options: ['claude', 'codex', 'copilot', 'copilot-byok', 'copilot-foundry', 'azure-foundry', 'gemini'] },
    { key: 'modelTiering.medium.reasoningEffort', manifestKey: 'ralphCodex.modelTiering', sectionId: 'model-reasoning', title: 'Medium Tier: Reasoning Effort', control: 'enum', description: 'Optional reasoning-effort override for the Medium tier. Falls back to global reasoningEffort when omitted.', options: ['', 'medium', 'high'] },
    { key: 'modelTiering.complex.model', manifestKey: 'ralphCodex.modelTiering', sectionId: 'model-reasoning', title: 'Complex Tier: Model', control: 'suggested-string', description: 'Model identifier for the Complex tier.' },
    { key: 'modelTiering.complex.provider', manifestKey: 'ralphCodex.modelTiering', sectionId: 'model-reasoning', title: 'Complex Tier: Provider', control: 'enum', description: 'Optional provider override for the Complex tier.', options: ['claude', 'codex', 'copilot', 'copilot-byok', 'copilot-foundry', 'azure-foundry', 'gemini'] },
    { key: 'modelTiering.complex.reasoningEffort', manifestKey: 'ralphCodex.modelTiering', sectionId: 'model-reasoning', title: 'Complex Tier: Reasoning Effort', control: 'enum', description: 'Optional reasoning-effort override for the Complex tier. Falls back to global reasoningEffort when omitted.', options: ['', 'medium', 'high'] },
    { key: 'ralphIterationCap', manifestKey: 'ralphCodex.ralphIterationCap', sectionId: 'loop-dynamics', title: 'Iteration Cap', control: 'number', description: 'Maximum iterations before the loop stops.' },
    { key: 'autonomyMode', manifestKey: 'ralphCodex.autonomyMode', sectionId: 'loop-dynamics', title: 'Autonomy Mode', control: 'enum', description: 'Shorthand for supervised or autonomous loop behaviour.' },
    { key: 'autoReplenishBacklog', manifestKey: 'ralphCodex.autoReplenishBacklog', sectionId: 'loop-dynamics', title: 'Auto Replenish Backlog', control: 'boolean', description: 'Automatically request backlog replenishment when work runs out.' },
    { key: 'stopOnHumanReviewNeeded', manifestKey: 'ralphCodex.stopOnHumanReviewNeeded', sectionId: 'loop-dynamics', title: 'Stop On Human Review', control: 'boolean', description: 'Stop loop when human-review is requested by execution outcomes.' },
    { key: 'noProgressThreshold', manifestKey: 'ralphCodex.noProgressThreshold', sectionId: 'loop-dynamics', title: 'No-Progress Threshold', control: 'number', description: 'Consecutive no-progress iterations before recovery logic escalates.' },
    { key: 'repeatedFailureThreshold', manifestKey: 'ralphCodex.repeatedFailureThreshold', sectionId: 'loop-dynamics', title: 'Repeated-Failure Threshold', control: 'number', description: 'Consecutive failures before escalation/stop behavior applies.' },
    { key: 'maxRecoveryAttempts', manifestKey: 'ralphCodex.maxRecoveryAttempts', sectionId: 'loop-dynamics', title: 'Max Recovery Attempts', control: 'number', description: 'Maximum auto-recovery attempts for a failing task.' },
    { key: 'maxReplansPerParent', manifestKey: 'ralphCodex.maxReplansPerParent', sectionId: 'loop-dynamics', title: 'Max Replans Per Parent', control: 'number', description: 'Maximum decomposition/replan attempts per parent task.' },
    { key: 'maxGeneratedChildren', manifestKey: 'ralphCodex.maxGeneratedChildren', sectionId: 'loop-dynamics', title: 'Max Generated Children', control: 'number', description: 'Upper bound on generated child tasks per decomposition event.' },
    { key: 'failureDiagnostics', manifestKey: 'ralphCodex.failureDiagnostics', sectionId: 'loop-dynamics', title: 'Failure Diagnostics', control: 'enum', description: 'Enable or suppress failure-diagnosis capture.', options: ['auto', 'off'] },
    { key: 'taskReadinessGate', manifestKey: 'ralphCodex.taskReadinessGate', sectionId: 'planning', title: 'Task Readiness Gate', control: 'enum', description: 'Optional pre-execution gate that can warn, block, or auto-decompose broad tasks.', options: ['off', 'warn', 'auto', 'strict'] },
    { key: 'planningPass.enabled', manifestKey: 'ralphCodex.planningPass', sectionId: 'planning', title: 'Planning Pass Enabled', control: 'boolean', description: 'Enable the pre-execution planning pass.' },
    { key: 'planningPass.mode', manifestKey: 'ralphCodex.planningPass', sectionId: 'planning', title: 'Planning Pass Mode', control: 'enum', description: 'Choose inline or dedicated planning execution.', options: ['dedicated', 'inline'] },
    { key: 'verifierModes', manifestKey: 'ralphCodex.verifierModes', sectionId: 'validation-scm', title: 'Verifier Modes', control: 'string-array', description: 'Enabled verifier stages for each iteration.' },
    { key: 'validationCommandOverride', manifestKey: 'ralphCodex.validationCommandOverride', sectionId: 'validation-scm', title: 'Validation Command Override', control: 'string', description: 'Explicit validation command override used by validation verifier.' },
    { key: 'promptIncludeVerifierFeedback', manifestKey: 'ralphCodex.promptIncludeVerifierFeedback', sectionId: 'validation-scm', title: 'Include Verifier Feedback In Prompt', control: 'boolean', description: 'Include verifier findings in follow-up prompts.' },
    { key: 'gitCheckpointMode', manifestKey: 'ralphCodex.gitCheckpointMode', sectionId: 'validation-scm', title: 'Git Checkpoint Mode', control: 'enum', description: 'Checkpoint strategy used around iteration execution.', options: ['off', 'snapshot', 'snapshotAndDiff'] },
    { key: 'scmStrategy', manifestKey: 'ralphCodex.scmStrategy', sectionId: 'validation-scm', title: 'SCM Strategy', control: 'enum', description: 'SCM automation strategy for task completion workflows.', options: ['none', 'commit-on-done', 'branch-per-task'] },
    { key: 'scmPrOnParentDone', manifestKey: 'ralphCodex.scmPrOnParentDone', sectionId: 'validation-scm', title: 'Open PR On Parent Done', control: 'boolean', description: 'Open PR when parent task is completed under SCM strategy.' },
    { key: 'autoScmOnConflict', manifestKey: 'ralphCodex.autoScmOnConflict', sectionId: 'validation-scm', title: 'Auto SCM On Conflict', control: 'boolean', description: 'Automatically run SCM resolution behavior on loop conflict outcomes.' },
    { key: 'scmConflictRetryLimit', manifestKey: 'ralphCodex.scmConflictRetryLimit', sectionId: 'validation-scm', title: 'SCM Conflict Retry Limit', control: 'number', description: 'Retry count for SCM conflict recovery flow.' },
    { key: 'memoryStrategy', manifestKey: 'ralphCodex.memoryStrategy', sectionId: 'memory', title: 'Memory Strategy', control: 'enum', description: 'Controls how Ralph carries context between iterations.' },
    { key: 'memoryWindowSize', manifestKey: 'ralphCodex.memoryWindowSize', sectionId: 'memory', title: 'Memory Window Size', control: 'number', description: 'Number of recent iterations included in sliding-window memory.' },
    { key: 'memorySummaryThreshold', manifestKey: 'ralphCodex.memorySummaryThreshold', sectionId: 'memory', title: 'Memory Summary Threshold', control: 'number', description: 'Iteration count before summary mode starts condensing history.' },
    { key: 'promptBudgetProfile', manifestKey: 'ralphCodex.promptBudgetProfile', sectionId: 'memory', title: 'Prompt Budget Profile', control: 'enum', description: 'Prompt-budget calibration profile used when shaping prompts.' },
    { key: 'promptPriorContextBudget', manifestKey: 'ralphCodex.promptPriorContextBudget', sectionId: 'memory', title: 'Prompt Prior Context Budget', control: 'number', description: 'Maximum prior-context entries injected into prompt context.' },
    { key: 'promptTemplateDirectory', manifestKey: 'ralphCodex.promptTemplateDirectory', sectionId: 'memory', title: 'Prompt Template Directory', control: 'string', description: 'Optional prompt template directory override.' },
    { key: 'customPromptBudget', manifestKey: 'ralphCodex.customPromptBudget', sectionId: 'memory', title: 'Custom Prompt Budget', control: 'string', description: 'Advanced per-prompt budget overrides (key/value map).' },
    { key: 'ralphTaskFilePath', manifestKey: 'ralphCodex.ralphTaskFilePath', sectionId: 'operator-mode', title: 'Task File Path', control: 'string', description: 'Workspace-relative task graph path.' },
    { key: 'prdPath', manifestKey: 'ralphCodex.prdPath', sectionId: 'operator-mode', title: 'PRD Path', control: 'string', description: 'Workspace-relative PRD path.' },
    { key: 'progressPath', manifestKey: 'ralphCodex.progressPath', sectionId: 'operator-mode', title: 'Progress Path', control: 'string', description: 'Workspace-relative progress report path.' },
    { key: 'structureDefinitionPath', manifestKey: 'ralphCodex.structureDefinitionPath', sectionId: 'operator-mode', title: 'Structure Definition Path', control: 'string', description: 'Workspace-relative structure definition path.' },
    { key: 'artifactRetentionPath', manifestKey: 'ralphCodex.artifactRetentionPath', sectionId: 'operator-mode', title: 'Artifact Retention Path', control: 'string', description: 'Root directory for generated run artifacts.' },
    { key: 'generatedArtifactRetentionCount', manifestKey: 'ralphCodex.generatedArtifactRetentionCount', sectionId: 'operator-mode', title: 'Generated Artifact Retention Count', control: 'number', description: 'Number of generated artifacts to keep before cleanup.' },
    { key: 'provenanceBundleRetentionCount', manifestKey: 'ralphCodex.provenanceBundleRetentionCount', sectionId: 'operator-mode', title: 'Provenance Bundle Retention Count', control: 'number', description: 'Number of provenance bundles to retain.' },
    { key: 'preferredHandoffMode', manifestKey: 'ralphCodex.preferredHandoffMode', sectionId: 'advanced', title: 'Preferred Handoff', control: 'enum', description: 'Preferred way to hand a generated prompt to Codex.' },
    { key: 'approvalMode', manifestKey: 'ralphCodex.approvalMode', sectionId: 'advanced', title: 'Approval Mode', control: 'enum', description: 'Approval posture for command execution.', options: ['never', 'on-request', 'untrusted'] },
    { key: 'sandboxMode', manifestKey: 'ralphCodex.sandboxMode', sectionId: 'advanced', title: 'Sandbox Mode', control: 'enum', description: 'Filesystem sandbox mode for execution.', options: ['read-only', 'workspace-write', 'danger-full-access'] },
    { key: 'openSidebarCommandId', manifestKey: 'ralphCodex.openSidebarCommandId', sectionId: 'advanced', title: 'Open Sidebar Command ID', control: 'string', description: 'Command ID used to open the provider sidebar.' },
    { key: 'newChatCommandId', manifestKey: 'ralphCodex.newChatCommandId', sectionId: 'advanced', title: 'New Chat Command ID', control: 'string', description: 'Command ID used to open a new provider chat.' },
    { key: 'clipboardAutoCopy', manifestKey: 'ralphCodex.clipboardAutoCopy', sectionId: 'advanced', title: 'Clipboard Auto Copy', control: 'boolean', description: 'Automatically copy generated prompts to clipboard.' },
    { key: 'agentCount', manifestKey: 'ralphCodex.agentCount', sectionId: 'advanced', title: 'Agent Count', control: 'number', description: 'Number of concurrent Ralph agents configured for the workspace.' },
    { key: 'agentRole', manifestKey: 'ralphCodex.agentRole', sectionId: 'advanced', title: 'Agent Role', control: 'enum', description: 'Default agent role for single-agent execution.', options: ['build', 'review', 'watchdog', 'scm', 'planner', 'implementer', 'reviewer'] },
    { key: 'cliExecutionTimeoutMs', manifestKey: 'ralphCodex.cliExecutionTimeoutMs', sectionId: 'advanced', title: 'CLI Execution Timeout (ms)', control: 'number', description: 'Execution timeout for provider invocations (0 disables timeout).' },
    { key: 'claimTtlHours', manifestKey: 'ralphCodex.claimTtlHours', sectionId: 'advanced', title: 'Claim TTL Hours', control: 'number', description: 'Task-claim time-to-live before stale detection.' },
    { key: 'staleLockThresholdMinutes', manifestKey: 'ralphCodex.staleLockThresholdMinutes', sectionId: 'advanced', title: 'Stale Lock Threshold Minutes', control: 'number', description: 'Lock-file stale threshold for auto-recovery logic.' },
    { key: 'watchdogStaleTtlMs', manifestKey: 'ralphCodex.watchdogStaleTtlMs', sectionId: 'advanced', title: 'Watchdog Stale TTL (ms)', control: 'number', description: 'Staleness threshold used by watchdog diagnostics.' },
    { key: 'autoWatchdogOnStall', manifestKey: 'ralphCodex.autoWatchdogOnStall', sectionId: 'advanced', title: 'Auto Watchdog On Stall', control: 'boolean', description: 'Automatically invoke watchdog diagnostics on stalls.' },
    { key: 'autoReviewOnParentDone', manifestKey: 'ralphCodex.autoReviewOnParentDone', sectionId: 'advanced', title: 'Auto Review On Parent Done', control: 'boolean', description: 'Automatically run review agent when parent tasks complete.' },
    { key: 'autoReviewOnLoopComplete', manifestKey: 'ralphCodex.autoReviewOnLoopComplete', sectionId: 'advanced', title: 'Auto Review On Loop Complete', control: 'boolean', description: 'Automatically run review agent when loop completes.' },
    { key: 'inspectionRootOverride', manifestKey: 'ralphCodex.inspectionRootOverride', sectionId: 'advanced', title: 'Inspection Root Override', control: 'string', description: 'Override workspace root used for validation discovery.' },
    { key: 'prdGenerationTemplate', manifestKey: 'ralphCodex.prdGenerationTemplate', sectionId: 'advanced', title: 'PRD Generation Template', control: 'string', description: 'Optional template override used for PRD generation.' },
    { key: 'autoApplyRemediation', manifestKey: 'ralphCodex.autoApplyRemediation', sectionId: 'advanced', title: 'Auto Apply Remediation', control: 'string-array', description: 'Allowed auto-remediation actions.' },
    { key: 'copilotFoundry.commandPath', manifestKey: 'ralphCodex.copilotFoundry', sectionId: 'copilot-foundry', title: 'Command Path', control: 'string', description: 'Path or command name for the Copilot CLI executable.' },
    { key: 'copilotFoundry.approvalMode', manifestKey: 'ralphCodex.copilotFoundry', sectionId: 'copilot-foundry', title: 'Approval Mode', control: 'enum', description: 'Approval posture used by the Copilot CLI harness.', options: ['allow-all', 'allow-tools-only', 'interactive'] },
    { key: 'copilotFoundry.maxAutopilotContinues', manifestKey: 'ralphCodex.copilotFoundry', sectionId: 'copilot-foundry', title: 'Max Autopilot Continues', control: 'number', description: 'Maximum number of autopilot continuation turns per Copilot CLI invocation.' },
    { key: 'copilotFoundry.providerType', manifestKey: 'ralphCodex.copilotFoundry', sectionId: 'copilot-foundry', title: 'Provider Type', control: 'enum', description: 'Target LLM provider type for BYOK routing.', options: ['azure', 'openai', 'anthropic'] },
    { key: 'copilotFoundry.baseUrlOverride', manifestKey: 'ralphCodex.copilotFoundry', sectionId: 'copilot-foundry', title: 'Base URL Override', control: 'string', description: 'Full base URL override. Required for non-azure provider types.' },
    { key: 'copilotFoundry.model', manifestKey: 'ralphCodex.copilotFoundry', sectionId: 'copilot-foundry', title: 'Model', control: 'string', description: 'Model name passed as COPILOT_MODEL to the child process.' },
    { key: 'copilotFoundry.azure.resourceName', manifestKey: 'ralphCodex.copilotFoundry', sectionId: 'copilot-foundry', title: 'Azure Resource Name', control: 'string', description: 'Azure OpenAI resource name used to derive the base URL.' },
    { key: 'copilotFoundry.azure.deployment', manifestKey: 'ralphCodex.copilotFoundry', sectionId: 'copilot-foundry', title: 'Azure Deployment', control: 'string', description: 'Azure deployment name, appended to the base URL path.' },
    { key: 'copilotFoundry.offline', manifestKey: 'ralphCodex.copilotFoundry', sectionId: 'copilot-foundry', title: 'Offline Mode', control: 'boolean', description: 'When true, sets COPILOT_OFFLINE=true in the child process.' },
    { key: 'copilotFoundry.requiredApiKeyEnvVar', manifestKey: 'ralphCodex.copilotFoundry', sectionId: 'copilot-foundry', title: 'Required API Key Env Var', control: 'string', description: 'Name of the env var that must be set by the operator. Used for preflight readiness checks only; secret values are never stored or logged.' },
    { key: 'azureFoundry.commandPath', manifestKey: 'ralphCodex.azureFoundry', sectionId: 'azure-foundry', title: 'Command Path', control: 'string', description: 'Path or command name for the Azure AI Foundry CLI executable.' },
    { key: 'azureFoundry.endpointUrl', manifestKey: 'ralphCodex.azureFoundry', sectionId: 'azure-foundry', title: 'Endpoint URL', control: 'string', description: 'Azure AI Foundry endpoint URL.' },
    { key: 'azureFoundry.modelDeployment', manifestKey: 'ralphCodex.azureFoundry', sectionId: 'azure-foundry', title: 'Model Deployment', control: 'string', description: 'Azure AI Foundry model deployment name.' },
    { key: 'azureFoundry.apiVersion', manifestKey: 'ralphCodex.azureFoundry', sectionId: 'azure-foundry', title: 'API Version', control: 'string', description: 'Azure OpenAI API version used by Azure AI Foundry.' },
    { key: 'azureFoundry.auth.mode', manifestKey: 'ralphCodex.azureFoundry', sectionId: 'azure-foundry', title: 'Auth Mode', control: 'enum', description: 'How the Azure AI Foundry provider resolves Azure credentials.', options: ['az-bearer', 'env-api-key', 'vscode-secret'] },
    { key: 'azureFoundry.auth.tenantId', manifestKey: 'ralphCodex.azureFoundry', sectionId: 'azure-foundry', title: 'Auth Tenant Id', control: 'string', description: 'Azure tenant identifier used for bearer-token auth.' },
    { key: 'azureFoundry.auth.subscriptionId', manifestKey: 'ralphCodex.azureFoundry', sectionId: 'azure-foundry', title: 'Auth Subscription Id', control: 'string', description: 'Azure subscription identifier used for readiness diagnostics.' },
    { key: 'azureFoundry.auth.apiKeyEnvVar', manifestKey: 'ralphCodex.azureFoundry', sectionId: 'azure-foundry', title: 'Auth API Key Env Var', control: 'string', description: 'Environment variable name used when the API key is sourced externally.' },
    { key: 'azureFoundry.auth.secretStorageKey', manifestKey: 'ralphCodex.azureFoundry', sectionId: 'azure-foundry', title: 'Auth SecretStorage Key', control: 'string', description: 'SecretStorage key used when the API key is sourced from VS Code secrets.' }
];
const PROVIDER_MODELS = {
    claude: ['claude-3-7-sonnet-20250219', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
    codex: ['gpt-4o', 'gpt-4o-mini', 'o1', 'o3-mini'],
    copilot: ['gpt-4o', 'gpt-4o-mini', 'o1', 'o3-mini', 'claude-3.5-sonnet'],
    'copilot-byok': [],
    'copilot-foundry': [],
    'azure-foundry': [],
    gemini: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-1.5-pro', 'gemini-1.5-flash']
};
let cachedManifest = null;
let cachedMetadata = null;
function resolvePackageManifestPath() {
    const candidates = [
        path.resolve(__dirname, '..', '..', 'package.json'),
        path.resolve(__dirname, '..', '..', '..', 'package.json')
    ];
    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }
    return candidates[0];
}
function loadPackageManifest() {
    if (cachedManifest) {
        return cachedManifest;
    }
    const manifestPath = resolvePackageManifestPath();
    cachedManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return cachedManifest;
}
function manifestProperties() {
    return loadPackageManifest().contributes?.configuration?.properties ?? {};
}
function getConfigValue(config, key) {
    return key.split('.').reduce((current, segment) => {
        if (current === null || current === undefined || typeof current !== 'object') {
            return undefined;
        }
        return current[segment];
    }, config);
}
function getDefaultValueFromConfig(key) {
    return getConfigValue(defaults_1.DEFAULT_CONFIG, key);
}
function getSettingsSurfaceMetadata() {
    if (cachedMetadata) {
        return cachedMetadata;
    }
    const properties = manifestProperties();
    const entries = SETTINGS_SURFACE_REGISTRY.map((entry) => {
        const manifestProperty = properties[entry.manifestKey];
        const defaultValue = entry.key.includes('.')
            ? getDefaultValueFromConfig(entry.key)
            : manifestProperty?.default ?? getDefaultValueFromConfig(entry.key);
        const options = entry.options ?? manifestProperty?.enum;
        return {
            ...entry,
            description: entry.description || manifestProperty?.description || '',
            defaultValue,
            ...(options ? { options } : {})
        };
    });
    cachedMetadata = {
        sections: [...SECTION_METADATA],
        entries
    };
    return cachedMetadata;
}
const AUTONOMY_MANAGED_KEY_SET = new Set(autonomyManagedKeys_1.AUTONOMY_MANAGED_KEYS);
/**
 * If a setting's resolved value is force-derived from another setting, return an
 * operator-facing note explaining why it cannot be edited directly. Mirrors the
 * forcing logic in readConfig (effectiveAutonomy; the enableModelTiering alias).
 */
function computeManagedNote(config, key) {
    if (AUTONOMY_MANAGED_KEY_SET.has(key) && config.autonomyMode === 'autonomous') {
        return 'Managed by Autonomy Mode (autonomous). Set Autonomy Mode to Supervised to edit this directly.';
    }
    if (key === 'modelTiering.enabled' && config.modelTieringEnableConflict) {
        const flatValue = config.modelTieringEnableConflict.flatValue;
        return `Overridden by ralphCodex.enableModelTiering (=${flatValue}). Change or remove that setting to edit model tiering here.`;
    }
    return null;
}
function buildSettingsSurfaceSnapshot(config, options) {
    const metadata = getSettingsSurfaceMetadata();
    const newSettingKeys = new Set(options?.newSettingKeys ?? []);
    return {
        sections: metadata.sections.map((section) => {
            const entries = metadata.entries
                .filter((entry) => entry.sectionId === section.id)
                .map((entry) => {
                let options = entry.options;
                if (entry.control === 'suggested-string') {
                    let activeProvider = String(getConfigValue(config, 'cliProvider') ?? 'codex');
                    if (entry.key.startsWith('modelTiering.')) {
                        const tier = entry.key.split('.')[1];
                        const overrideProvider = getConfigValue(config, `modelTiering.${tier}.provider`);
                        if (overrideProvider) {
                            activeProvider = String(overrideProvider);
                        }
                    }
                    options = PROVIDER_MODELS[activeProvider] ?? [];
                }
                return {
                    ...entry,
                    value: getConfigValue(config, entry.key),
                    isNew: newSettingKeys.has(entry.key),
                    managedNote: computeManagedNote(config, entry.key),
                    ...(options && options.length > 0 ? { options } : {})
                };
            });
            return {
                ...section,
                entries,
                hasNewSettings: entries.some((entry) => entry.isNew)
            };
        })
    };
}
function buildSettingsDiscoveryState(seenSettingKeys) {
    return {
        seenSettingKeys: [...new Set(seenSettingKeys)].sort()
    };
}
function collectNewSettingsNotice(metadata, state) {
    const seen = new Set(state?.seenSettingKeys ?? []);
    const newSettingKeys = metadata.entries
        .map((entry) => entry.key)
        .filter((key) => !seen.has(key));
    if (newSettingKeys.length === 0) {
        return null;
    }
    return {
        message: `Ralphdex: ${newSettingKeys.length} new settings available`,
        newSettingKeys,
        focusSettingKey: newSettingKeys[0]
    };
}
async function readSettingsDiscoveryState(state) {
    const raw = state.get(SETTINGS_DISCOVERY_STATE_KEY);
    if (!raw || !Array.isArray(raw.seenSettingKeys)) {
        return null;
    }
    return buildSettingsDiscoveryState(raw.seenSettingKeys);
}
async function writeSettingsDiscoveryState(state, metadata) {
    await state.update(SETTINGS_DISCOVERY_STATE_KEY, buildSettingsDiscoveryState(metadata.entries.map((entry) => entry.key)));
}
//# sourceMappingURL=settingsSurface.js.map