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
exports.analyzeTaskShape = analyzeTaskShape;
exports.isDedicatedPlanningFallbackSingleAgent = isDedicatedPlanningFallbackSingleAgent;
exports.shouldRequireTaskPlanForSelection = shouldRequireTaskPlanForSelection;
exports.shouldRunInlinePlanningPassForConfig = shouldRunInlinePlanningPassForConfig;
exports.parsePlanningResponse = parsePlanningResponse;
exports.writeTaskPlan = writeTaskPlan;
exports.readTaskPlan = readTaskPlan;
exports.formatTaskPlanContext = formatTaskPlanContext;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const BROAD_SCOPE_PATTERNS = [
    { pattern: /\bbuild\s+the\s+app\b/i, label: 'build the app' },
    { pattern: /\bcreate\s+(?:the\s+)?platform\b/i, label: 'create platform' },
    { pattern: /\bimplement\s+foundation\b/i, label: 'implement foundation' },
    { pattern: /\bfull\s+scaffold\b/i, label: 'full scaffold' },
    { pattern: /\bend-to-end\b/i, label: 'end-to-end' },
    { pattern: /\beverything\b/i, label: 'everything' },
    { pattern: /\bset\s+up\b.*\b(?:auth|authentication)\b.*\b(?:database|routing|tests?|deployment)\b/i, label: 'set up auth/database/routing/tests/deployment' }
];
const COMPOUND_SCOPE_PATTERNS = [
    /\band\b/i,
    /\bthen\b/i,
    /\bplus\b/i,
    /\bfrom\b.+\bthrough\b/i
];
function addFinding(findings, finding) {
    if (findings.some((existing) => existing.code === finding.code && existing.message === finding.message)) {
        return;
    }
    findings.push(finding);
}
function hasAcceptance(input) {
    return (input.task.acceptance ?? []).some((entry) => entry.trim().length > 0)
        || (input.suggestedAcceptance ?? []).some((entry) => entry.trim().length > 0);
}
function selectedValidationCommand(input) {
    return input.task.validation?.trim()
        || input.plannerSuggestedValidationCommand?.trim()
        || input.effectiveValidationCommand?.trim()
        || null;
}
function isLargeCommaSeparatedScope(text) {
    return text.split(',').filter((part) => part.trim().length > 0).length >= 4;
}
function hasPlanningScaffoldImplementationTestDocsDeploymentMix(text) {
    const groups = [
        /\b(plan|design|define|conventions?)\b/i,
        /\b(scaffold|bootstrap|foundation|setup|set up)\b/i,
        /\b(implement|build|create|add)\b/i,
        /\b(test|tests|validation|validate)\b/i,
        /\b(doc|docs|documentation|deploy|deployment)\b/i
    ];
    return groups.filter((pattern) => pattern.test(text)).length >= 4;
}
function isGreenfieldLike(scan) {
    if (!scan) {
        return false;
    }
    const sourceRoots = scan.sourceRoots ?? [];
    const tests = scan.tests ?? [];
    const projectMarkers = scan.projectMarkers ?? [];
    const manifests = scan.manifests ?? [];
    const onlyManifestSignals = projectMarkers.length <= 1 && manifests.length <= 1;
    return sourceRoots.length === 0 && tests.length === 0 && onlyManifestSignals;
}
function packageScriptReferencedBy(command) {
    const trimmed = command.trim();
    const npmRun = /^(?:npm|pnpm|bun)\s+run\s+([A-Za-z0-9:_-]+)/.exec(trimmed);
    if (npmRun) {
        return npmRun[1];
    }
    const npmShortcut = /^(?:npm|pnpm|yarn)\s+(test|build|validate|lint|typecheck)\b/.exec(trimmed);
    if (npmShortcut) {
        return npmShortcut[1];
    }
    const yarnRun = /^yarn\s+([A-Za-z0-9:_-]+)/.exec(trimmed);
    if (yarnRun && yarnRun[1] !== 'run') {
        return yarnRun[1];
    }
    return null;
}
function analyzeTaskShape(input) {
    const findings = [];
    const taskText = `${input.task.title} ${input.task.notes ?? ''}`.trim();
    const validation = selectedValidationCommand(input);
    if (!hasAcceptance(input)) {
        addFinding(findings, {
            code: 'missing_acceptance',
            severity: 'warning',
            message: 'Selected task has no acceptance criteria.'
        });
    }
    if (!validation) {
        addFinding(findings, {
            code: 'missing_validation',
            severity: 'warning',
            message: 'No task-level, planner-suggested, or effective validation command is available.'
        });
    }
    const broadLabels = BROAD_SCOPE_PATTERNS
        .filter(({ pattern }) => pattern.test(taskText))
        .map(({ label }) => label);
    if (broadLabels.length > 0 || hasPlanningScaffoldImplementationTestDocsDeploymentMix(taskText)) {
        addFinding(findings, {
            code: 'broad_scope',
            severity: 'blocking',
            message: `Task scope appears broad (${broadLabels.join(', ') || 'multiple lifecycle concerns'}).`
        });
    }
    const compoundSignals = COMPOUND_SCOPE_PATTERNS.some((pattern) => pattern.test(taskText)) || isLargeCommaSeparatedScope(taskText);
    if (compoundSignals) {
        addFinding(findings, {
            code: 'compound_title',
            severity: 'warning',
            message: 'Task title or notes appear to combine multiple clauses or scopes.'
        });
    }
    if (isGreenfieldLike(input.workspaceScan) && findings.some((finding) => finding.code === 'broad_scope' || finding.code === 'compound_title')) {
        addFinding(findings, {
            code: 'greenfield_bootstrap_risk',
            severity: 'blocking',
            message: 'Repository appears greenfield or near-empty while the selected first task is broad.'
        });
    }
    const referencedScript = validation ? packageScriptReferencedBy(validation) : null;
    const scriptNames = input.workspaceScan?.packageJson?.scriptNames ?? [];
    if (referencedScript && input.workspaceScan?.packageJson && !scriptNames.includes(referencedScript)) {
        addFinding(findings, {
            code: 'missing_package_script',
            severity: 'blocking',
            message: `Validation command references missing package script "${referencedScript}".`
        });
    }
    const hasBroad = findings.some((finding) => finding.code === 'broad_scope');
    const hasCompound = findings.some((finding) => finding.code === 'compound_title');
    const hasGreenfieldRisk = findings.some((finding) => finding.code === 'greenfield_bootstrap_risk');
    const hasBlockingValidation = findings.some((finding) => finding.code === 'missing_package_script');
    const atomicity = hasGreenfieldRisk || hasBroad
        ? 'epic'
        : hasCompound
            ? 'compound'
            : findings.some((finding) => finding.code === 'missing_acceptance' || finding.code === 'missing_validation')
                ? 'unknown'
                : 'atomic';
    const recommendedAction = hasBlockingValidation
        ? 'block_or_review'
        : hasGreenfieldRisk || hasBroad
            ? 'decompose'
            : findings.length > 0
                ? 'warn'
                : 'execute';
    return {
        atomicity,
        findings,
        recommendedAction
    };
}
function isImplementerLikeRole(agentRole) {
    return agentRole === 'implementer' || agentRole === 'build';
}
function isDedicatedPlanningFallbackSingleAgent(config) {
    return config.planningPass.enabled
        && config.planningPass.mode === 'dedicated'
        && isImplementerLikeRole(config.agentRole)
        && config.agentCount <= 1;
}
function shouldRequireTaskPlanForSelection(config) {
    return config.planningPass.enabled
        && config.planningPass.mode === 'dedicated'
        && isImplementerLikeRole(config.agentRole)
        && !isDedicatedPlanningFallbackSingleAgent(config);
}
function shouldRunInlinePlanningPassForConfig(config) {
    if (!config.planningPass.enabled || !isImplementerLikeRole(config.agentRole)) {
        return false;
    }
    return config.planningPass.mode === 'inline' || isDedicatedPlanningFallbackSingleAgent(config);
}
/**
 * Extracts a TaskPlanArtifact from a planning-prompt response.
 *
 * The planner agent is expected to write the artifact itself, but Ralph also
 * parses the response text as a fallback so the inline planning pass can build
 * the artifact from the agent's output without requiring a separate file write.
 *
 * Accepts two formats:
 * 1. A fenced ```json block containing the task-plan object.
 * 2. The raw JSON object at the top level of the text.
 */
function parsePlanningResponse(text) {
    // Try to extract a fenced json block first.
    const fencedMatch = /```json\s*([\s\S]*?)```/.exec(text);
    const jsonText = fencedMatch ? fencedMatch[1].trim() : text.trim();
    let parsed;
    try {
        parsed = JSON.parse(jsonText);
    }
    catch {
        return null;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return null;
    }
    const record = parsed;
    const reasoning = typeof record.reasoning === 'string' ? record.reasoning.trim() : '';
    const approach = typeof record.approach === 'string' ? record.approach.trim() : '';
    const steps = Array.isArray(record.steps)
        ? record.steps.filter((s) => typeof s === 'string')
        : [];
    const risks = Array.isArray(record.risks)
        ? record.risks.filter((r) => typeof r === 'string')
        : [];
    const suggestedValidationCommand = typeof record.suggestedValidationCommand === 'string' && record.suggestedValidationCommand.trim()
        ? record.suggestedValidationCommand.trim()
        : undefined;
    const readiness = normalizeTaskReadiness(record.readiness);
    const readinessReason = typeof record.readinessReason === 'string' && record.readinessReason.trim()
        ? record.readinessReason.trim()
        : undefined;
    const suggestedChildTasks = parseSuggestedChildTasks(record.suggestedChildTasks);
    const suggestedAcceptance = parseOptionalStringArray(record.suggestedAcceptance);
    const suggestedConstraints = parseOptionalStringArray(record.suggestedConstraints);
    const skillsOrInputsUsed = parseOptionalStringArray(record.skillsOrInputsUsed);
    const atomicity = normalizeTaskAtomicity(record.atomicity);
    const estimatedTaskCount = typeof record.estimatedTaskCount === 'number' && Number.isFinite(record.estimatedTaskCount)
        ? Math.max(1, Math.floor(record.estimatedTaskCount))
        : undefined;
    const acceptedByRalph = typeof record.acceptedByRalph === 'boolean' ? record.acceptedByRalph : undefined;
    const nextAction = normalizeTaskPlanNextAction(record.nextAction);
    const planningDocPath = normalizeNullableString(record.planningDocPath);
    const planningDocSectionId = normalizeNullableString(record.planningDocSectionId);
    const planningInput = parsePlanningInput(record.planningInput);
    // Require at minimum reasoning or approach to be non-empty.
    const hasMeaningfulPlan = Boolean(reasoning || approach || steps.length > 0);
    if (!hasMeaningfulPlan) {
        return null;
    }
    return {
        reasoning,
        approach,
        steps,
        risks,
        suggestedValidationCommand,
        readiness: readiness ?? 'ready',
        readinessReason,
        atomicity,
        estimatedTaskCount,
        acceptedByRalph,
        nextAction,
        planningDocPath,
        planningDocSectionId,
        ...(planningInput ? { planningInput } : {}),
        ...(suggestedChildTasks !== undefined ? { suggestedChildTasks } : {}),
        ...(suggestedAcceptance ? { suggestedAcceptance } : {}),
        ...(suggestedConstraints ? { suggestedConstraints } : {}),
        ...(skillsOrInputsUsed ? { skillsOrInputsUsed } : {})
    };
}
function parsePlanningInput(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return undefined;
    }
    const record = value;
    if (typeof record.selectedTaskId !== 'string' || !record.selectedTaskId.trim()) {
        return undefined;
    }
    if (typeof record.taskFingerprint !== 'string' || !record.taskFingerprint.trim()) {
        return undefined;
    }
    return {
        selectedTaskId: record.selectedTaskId.trim(),
        taskFingerprint: record.taskFingerprint.trim(),
        gateMode: typeof record.gateMode === 'string' ? record.gateMode : 'off',
        mutationCount: typeof record.mutationCount === 'number' && Number.isFinite(record.mutationCount)
            ? Math.floor(record.mutationCount)
            : null,
        createdAt: typeof record.createdAt === 'string' ? record.createdAt : ''
    };
}
function normalizeTaskReadiness(candidate) {
    if (candidate !== 'ready'
        && candidate !== 'needs_decomposition'
        && candidate !== 'blocked'
        && candidate !== 'needs_human_review') {
        return undefined;
    }
    return candidate;
}
function normalizeTaskAtomicity(candidate) {
    return candidate === 'atomic' || candidate === 'compound' || candidate === 'epic' || candidate === 'unknown'
        ? candidate
        : undefined;
}
function normalizeTaskPlanNextAction(candidate) {
    return candidate === 'execute_selected_task'
        || candidate === 'warn_and_execute'
        || candidate === 'apply_child_tasks_and_stop'
        || candidate === 'mark_blocked_and_stop'
        || candidate === 'request_human_review'
        || candidate === 'skip_planning'
        ? candidate
        : undefined;
}
function normalizeNullableString(value) {
    if (value === null) {
        return null;
    }
    return typeof value === 'string'
        ? (value.trim() || null)
        : undefined;
}
function parseOptionalStringArray(value) {
    if (!Array.isArray(value)) {
        return undefined;
    }
    const normalized = value
        .filter((entry) => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
    return normalized.length > 0 ? normalized : undefined;
}
function parseTier(value) {
    return value === 'simple' || value === 'medium' || value === 'complex'
        ? value
        : undefined;
}
function parseSuggestedChildTasks(candidate) {
    if (!Array.isArray(candidate)) {
        return undefined;
    }
    const tasks = candidate
        .map(parseSuggestedChildTask)
        .filter((task) => task !== null);
    return tasks.length > 0 ? tasks : undefined;
}
function parseSuggestedChildTask(candidate) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
        return null;
    }
    const record = candidate;
    const id = typeof record.id === 'string' ? record.id.trim() : '';
    const title = typeof record.title === 'string' ? record.title.trim() : '';
    const parentId = typeof record.parentId === 'string' ? record.parentId.trim() : '';
    const rationale = typeof record.rationale === 'string' ? record.rationale.trim() : '';
    if (!id || !title || !parentId || !rationale) {
        return null;
    }
    const dependsOn = Array.isArray(record.dependsOn)
        ? record.dependsOn
            .map((dependency) => {
            if (!dependency || typeof dependency !== 'object' || Array.isArray(dependency)) {
                return null;
            }
            const dependencyRecord = dependency;
            if (typeof dependencyRecord.taskId !== 'string' || !dependencyRecord.taskId.trim()) {
                return null;
            }
            if (dependencyRecord.reason !== 'blocks_sequence' && dependencyRecord.reason !== 'inherits_parent_dependency') {
                return null;
            }
            return {
                taskId: dependencyRecord.taskId.trim(),
                reason: dependencyRecord.reason
            };
        })
            .filter((dependency) => dependency !== null)
        : [];
    if (record.validation !== null && record.validation !== undefined && typeof record.validation !== 'string') {
        return null;
    }
    return {
        id,
        title,
        parentId,
        dependsOn,
        validation: typeof record.validation === 'string' ? record.validation.trim() : null,
        rationale,
        acceptance: parseOptionalStringArray(record.acceptance),
        constraints: parseOptionalStringArray(record.constraints),
        context: parseOptionalStringArray(record.context),
        tier: parseTier(record.tier)
    };
}
/** Writes a task-plan.json artifact under `.ralph/artifacts/<taskId>/`. */
async function writeTaskPlan(artifactsDir, taskId, plan) {
    const taskArtifactDir = path.join(artifactsDir, taskId);
    await fs.mkdir(taskArtifactDir, { recursive: true });
    const filePath = path.join(taskArtifactDir, 'task-plan.json');
    await fs.writeFile(filePath, JSON.stringify(plan, null, 2), 'utf8');
    return filePath;
}
/** Reads task-plan.json for a task. Returns null when the file does not exist or is malformed. */
async function readTaskPlan(artifactsDir, taskId) {
    const filePath = path.join(artifactsDir, taskId, 'task-plan.json');
    try {
        const text = await fs.readFile(filePath, 'utf8');
        return parsePlanningResponse(text);
    }
    catch {
        return null;
    }
}
/**
 * Builds a concise "Task Plan" context snippet for injection into the
 * implementer prompt. Returns an empty string when the plan has no content.
 */
function formatTaskPlanContext(plan) {
    const lines = [];
    if (plan.reasoning) {
        lines.push(`- Reasoning: ${plan.reasoning}`);
    }
    if (plan.approach) {
        lines.push(`- Approach: ${plan.approach}`);
    }
    if (plan.steps.length > 0) {
        lines.push(`- Steps: ${plan.steps.slice(0, 5).join(' → ')}`);
    }
    if (plan.risks.length > 0) {
        lines.push(`- Risks: ${plan.risks.slice(0, 3).join('; ')}`);
    }
    if (plan.suggestedValidationCommand) {
        lines.push(`- Suggested validation: ${plan.suggestedValidationCommand}`);
    }
    if (plan.readiness && plan.readiness !== 'ready') {
        lines.push(`- Readiness advisory: ${plan.readiness}${plan.readinessReason ? ` (${plan.readinessReason})` : ''}`);
    }
    if (plan.acceptedByRalph) {
        lines.push('- Plan status: accepted by Ralph readiness gate');
        lines.push('- Execution rule: follow this accepted plan unless repository evidence shows it is unsafe; explain any divergence in completion report.');
    }
    return lines.join('\n');
}
//# sourceMappingURL=planningPass.js.map