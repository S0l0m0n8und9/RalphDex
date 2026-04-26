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
exports.RalphIterationEngine = void 0;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const providers_1 = require("../config/providers");
const promptBuilder_1 = require("../prompt/promptBuilder");
const error_1 = require("../util/error");
const iterationPreparation_1 = require("./iterationPreparation");
const types_1 = require("./types");
const taskFile_1 = require("./taskFile");
const planningPass_1 = require("./planningPass");
const failureDiagnostics_1 = require("./failureDiagnostics");
const integrity_1 = require("./integrity");
const loopLogic_1 = require("./loopLogic");
const complexityScorer_1 = require("./complexityScorer");
const hookRunner_1 = require("./hookRunner");
const verifier_1 = require("./verifier");
const taskCreation_1 = require("./taskCreation");
const reconciliation_1 = require("./reconciliation");
const provenancePersistence_1 = require("./provenancePersistence");
const ArtifactPersistenceService_1 = require("./iteration/ArtifactPersistenceService");
const IterationExecutor_1 = require("./iteration/IterationExecutor");
const LoopDecisionService_1 = require("./iteration/LoopDecisionService");
const OutcomeClassifier_1 = require("./iteration/OutcomeClassifier");
const RemediationCoordinator_1 = require("./iteration/RemediationCoordinator");
const ScmCoordinator_1 = require("./iteration/ScmCoordinator");
const VerificationRunner_1 = require("./iteration/VerificationRunner");
function runRecordFromIteration(mode, prepared, startedAt, result) {
    if (result.executionStatus === 'skipped') {
        return undefined;
    }
    return {
        agentId: result.agentId ?? types_1.DEFAULT_RALPH_AGENT_ID,
        provenanceId: prepared.provenanceId,
        iteration: prepared.iteration,
        mode,
        promptKind: prepared.promptKind,
        startedAt,
        finishedAt: result.finishedAt,
        status: result.executionStatus === 'succeeded' ? 'succeeded' : 'failed',
        exitCode: result.execution.exitCode,
        promptPath: prepared.promptPath,
        transcriptPath: result.execution.transcriptPath,
        lastMessagePath: result.execution.lastMessagePath,
        summary: result.summary
    };
}
class RalphIterationEngine {
    stateManager;
    strategies;
    logger;
    hooks;
    artifactPersistence;
    iterationExecutor;
    verificationRunner;
    outcomeClassifier;
    loopDecisionService;
    remediationCoordinator;
    scmCoordinator;
    constructor(stateManager, strategies, logger, hooks = {}) {
        this.stateManager = stateManager;
        this.strategies = strategies;
        this.logger = logger;
        this.hooks = hooks;
        this.artifactPersistence = new ArtifactPersistenceService_1.ArtifactPersistenceService(this.logger);
        this.iterationExecutor = new IterationExecutor_1.IterationExecutor(this.strategies, this.logger, this.artifactPersistence);
        this.verificationRunner = new VerificationRunner_1.VerificationRunner();
        this.outcomeClassifier = new OutcomeClassifier_1.OutcomeClassifier();
        this.loopDecisionService = new LoopDecisionService_1.LoopDecisionService();
        this.remediationCoordinator = new RemediationCoordinator_1.RemediationCoordinator(this.logger);
        this.scmCoordinator = new ScmCoordinator_1.ScmCoordinator(this.logger);
    }
    async preparePrompt(workspaceFolder, progress, options) {
        const prepared = await (0, iterationPreparation_1.prepareIterationContext)({
            workspaceFolder,
            progress,
            includeVerifierContext: false,
            configOverrides: options?.configOverrides,
            rolePolicySource: options?.rolePolicySource,
            stateManager: this.stateManager,
            logger: this.logger,
            cliProvider: this.strategies.getActiveCliProvider(),
            persistBlockedPreflightBundle: (input) => (0, provenancePersistence_1.persistBlockedPreflightBundle)(input, this.logger),
            persistPreparedProvenanceBundle: (preparedContext) => (0, provenancePersistence_1.persistPreparedProvenanceBundle)(preparedContext, this.logger)
        });
        return {
            ...prepared
        };
    }
    /**
     * Runs a lightweight planning CLI turn for the given task and writes task-plan.json.
     * Failures are logged but do not abort the main iteration — the planning pass is best-effort.
     */
    async runInlinePlanningPass(workspaceRoot, artifactsDir, taskId, taskTitle, taskAcceptance, execStrategy, commandPath, config) {
        const planningPrompt = [
            'You are a planning/readiness agent. Analyse the task below and return JSON only.',
            '',
            `Task ID: ${taskId}`,
            `Task Title: ${taskTitle}`,
            taskAcceptance.length > 0 ? `Acceptance criteria:\n${taskAcceptance.map((a) => `- ${a}`).join('\n')}` : '',
            '',
            'Assess readiness before execution:',
            '- Is the task executable in one bounded iteration?',
            '- Is there a concrete validation command?',
            '- Are acceptance criteria clear?',
            '- Is this task too broad / greenfield and should be decomposed?',
            '- For greenfield/bootstrap tasks, prefer decomposition into scaffold -> smoke test -> first vertical slice.',
            '- Use provider-native planning behavior and any available tools/skills, AGENTS.md instructions, Ralph docs/invariants/workflows, structure definitions, existing task context, and validation discovery.',
            '',
            'Respond with ONLY a valid JSON object (no markdown fences) in this schema:',
            '{',
            '  "reasoning": "<why this task matters and what the key challenge is>",',
            '  "approach": "<one-sentence implementation strategy>",',
            '  "steps": ["<step 1>", "<step 2>", ...],',
            '  "risks": ["<risk 1>", ...],',
            '  "suggestedValidationCommand": "<optional shell command to validate the work>",',
            '  "readiness": "ready" | "needs_decomposition" | "blocked" | "needs_human_review",',
            '  "readinessReason": "<short reason for readiness decision>",',
            '  "atomicity": "atomic" | "compound" | "epic" | "unknown",',
            '  "estimatedTaskCount": 1,',
            '  "acceptedByRalph": false,',
            '  "nextAction": "execute_selected_task" | "warn_and_execute" | "apply_child_tasks_and_stop" | "mark_blocked_and_stop" | "request_human_review" | "skip_planning",',
            '  "planningDocPath": "<relative path>" | null,',
            '  "planningDocSectionId": "<section anchor>" | null,',
            '  "skillsOrInputsUsed": ["<skills/inputs consulted>"],',
            '  "suggestedChildTasks": [',
            '    {',
            '      "id": "<task id>",',
            '      "title": "<task title>",',
            '      "parentId": "<selected parent task id>",',
            '      "dependsOn": [{"taskId":"<id>","reason":"blocks_sequence|inherits_parent_dependency"}],',
            '      "validation": "<command>" | null,',
            '      "rationale": "<why this child exists>",',
            '      "acceptance": ["<criterion>"],',
            '      "constraints": ["<guardrail>"],',
            '      "context": ["<pointer>"],',
            '      "tier": "simple" | "medium" | "complex"',
            '    }',
            '  ],',
            '  "suggestedAcceptance": ["<acceptance criterion for parent/next child>"],',
            '  "suggestedConstraints": ["<constraint/guardrail>"]',
            '}'
        ].filter(Boolean).join('\n');
        const taskArtifactDir = path.join(artifactsDir, taskId);
        await fs.mkdir(taskArtifactDir, { recursive: true });
        const promptPath = path.join(taskArtifactDir, 'task-plan-prompt.md');
        const transcriptPath = path.join(taskArtifactDir, 'task-plan-transcript.json');
        const lastMessagePath = path.join(taskArtifactDir, 'task-plan-last-message.txt');
        await fs.writeFile(promptPath, planningPrompt, 'utf8');
        try {
            const execResult = await execStrategy.runExec({
                commandPath,
                workspaceRoot,
                executionRoot: workspaceRoot,
                prompt: planningPrompt,
                promptPath,
                promptHash: (0, integrity_1.hashText)(planningPrompt),
                promptByteLength: (0, integrity_1.utf8ByteLength)(planningPrompt),
                transcriptPath,
                lastMessagePath,
                model: config.model,
                reasoningEffort: config.reasoningEffort,
                sandboxMode: config.sandboxMode,
                approvalMode: config.approvalMode,
                timeoutMs: config.cliExecutionTimeoutMs > 0 ? config.cliExecutionTimeoutMs : undefined,
                promptCaching: config.promptCaching
            });
            if (execResult.exitCode !== 0) {
                this.logger.warn('Inline planning pass exited non-zero; skipping task-plan.json.', {
                    taskId,
                    exitCode: execResult.exitCode
                });
                return null;
            }
            const plan = (0, planningPass_1.parsePlanningResponse)(execResult.lastMessage);
            if (!plan) {
                this.logger.warn('Inline planning pass produced no parseable plan; skipping task-plan.json.', { taskId });
                return null;
            }
            await (0, planningPass_1.writeTaskPlan)(artifactsDir, taskId, plan);
            this.logger.info('Inline planning pass wrote task-plan.json.', { taskId });
            return plan;
        }
        catch (err) {
            this.logger.warn('Inline planning pass failed; continuing without plan.', {
                taskId,
                error: String(err)
            });
            return null;
        }
    }
    assessStrictReadiness(task, plan) {
        const findings = [];
        const validation = (task.validation ?? plan.suggestedValidationCommand ?? '').trim();
        if (!validation) {
            findings.push('Selected task is missing a concrete validation command.');
        }
        if ((task.acceptance ?? []).length === 0 && (plan.suggestedAcceptance ?? []).length === 0) {
            findings.push('Selected task has no acceptance criteria.');
        }
        if (plan.readiness && plan.readiness !== 'ready') {
            findings.push(`Planner readiness is ${plan.readiness}.`);
        }
        return findings;
    }
    isLikelyAtomicTask(task) {
        const combined = `${task.title} ${task.notes ?? ''}`.toLowerCase();
        const broadSignals = [
            /\band\b/,
            /\bthen\b/,
            /\bplus\b/,
            /\bplatform\b/,
            /\bfoundation\b/,
            /\bend-to-end\b/,
            /\beverything\b/,
            /\bfrom\b.+\bthrough\b/,
            /,/
        ];
        if (broadSignals.some((pattern) => pattern.test(combined))) {
            return false;
        }
        return (task.acceptance?.length ?? 0) > 0 && Boolean(task.validation?.trim());
    }
    shouldWritePlanningDoc(task, plan) {
        if (plan.readiness && plan.readiness !== 'ready') {
            return true;
        }
        if (plan.atomicity === 'compound' || plan.atomicity === 'epic') {
            return true;
        }
        const combined = `${task.title} ${task.notes ?? ''}`.toLowerCase();
        return /\b(greenfield|bootstrap|architecture|ambiguous|risky)\b/.test(combined);
    }
    taskPlanningFingerprint(task) {
        return (0, integrity_1.hashText)(JSON.stringify({
            id: task.id,
            title: task.title,
            validation: task.validation ?? null,
            acceptance: task.acceptance ?? [],
            constraints: task.constraints ?? [],
            notes: task.notes ?? ''
        }));
    }
    buildPlanningInput(prepared, gateMode) {
        return {
            selectedTaskId: prepared.selectedTask?.id ?? '',
            taskFingerprint: prepared.selectedTask ? this.taskPlanningFingerprint(prepared.selectedTask) : '',
            gateMode,
            mutationCount: prepared.beforeCoreState.taskFile.mutationCount ?? null,
            createdAt: new Date().toISOString()
        };
    }
    isPlanFreshForSelectedTask(prepared, plan) {
        if (!prepared.selectedTask) {
            return false;
        }
        if (!plan.planningInput) {
            return false;
        }
        return plan.planningInput.selectedTaskId === prepared.selectedTask.id
            && plan.planningInput.taskFingerprint === this.taskPlanningFingerprint(prepared.selectedTask)
            && plan.planningInput.mutationCount === (prepared.beforeCoreState.taskFile.mutationCount ?? null);
    }
    async writePlanningDoc(rootPath, task, plan) {
        const safeTaskId = task.id.replace(/[^a-zA-Z0-9._-]/g, '-');
        const plansDir = path.join(rootPath, '.ralph', 'artifacts', 'plans', safeTaskId);
        await fs.mkdir(plansDir, { recursive: true });
        const planningDocPath = path.join(plansDir, 'plan.md');
        const sectionAnchors = (plan.suggestedChildTasks ?? []).map((_, index) => `task-${index + 1}`);
        const markdown = [
            `# Plan for ${task.id}: ${task.title}`,
            '',
            '## Atomicity Decision',
            `- Atomicity: ${plan.atomicity ?? 'unknown'}`,
            `- Readiness: ${plan.readiness ?? 'ready'}`,
            `- Reason: ${plan.readinessReason ?? 'n/a'}`,
            '',
            '## Skills / Inputs Considered',
            ...(plan.skillsOrInputsUsed?.map((entry) => `- ${entry}`) ?? ['- AGENTS.md / repo conventions / validation discovery']),
            '',
            '## Validation Ladder',
            `- Suggested validation: ${plan.suggestedValidationCommand ?? task.validation ?? 'none provided'}`,
            '',
            '## Proposed Breakdown',
            ...((plan.suggestedChildTasks ?? []).map((child, index) => `### ${sectionAnchors[index]}\n- ${child.id}: ${child.title}`)),
            '',
            '## Risks / Non-goals',
            ...(plan.risks.length > 0 ? plan.risks.map((risk) => `- ${risk}`) : ['- Keep scope bounded to next executable step.'])
        ].join('\n');
        await fs.writeFile(planningDocPath, `${markdown}\n`, 'utf8');
        return {
            planningDocPath: path.relative(rootPath, planningDocPath).replace(/\\/g, '/'),
            sectionAnchors
        };
    }
    async evaluatePlanningGate(prepared) {
        if (!prepared.selectedTask) {
            return { outcome: 'skipped', plan: null, warnings: [] };
        }
        const gateMode = prepared.config.taskReadinessGate;
        const planningEnabled = (0, planningPass_1.shouldRunInlinePlanningPassForConfig)(prepared.config);
        if (!planningEnabled && gateMode === 'off') {
            return { outcome: 'skipped', plan: null, warnings: [] };
        }
        if ((gateMode === 'auto' || gateMode === 'strict') && this.isLikelyAtomicTask(prepared.selectedTask)) {
            const atomicPlan = {
                reasoning: 'Selected task already appears atomic and executable.',
                approach: 'Execute directly with existing acceptance + validation.',
                steps: [prepared.selectedTask.title],
                risks: [],
                readiness: 'ready',
                readinessReason: 'Task has bounded scope, acceptance, and validation.',
                atomicity: 'atomic',
                estimatedTaskCount: 1,
                acceptedByRalph: true,
                nextAction: 'execute_selected_task',
                planningDocPath: null,
                planningDocSectionId: null,
                planningInput: this.buildPlanningInput(prepared, gateMode)
            };
            await (0, planningPass_1.writeTaskPlan)(prepared.paths.artifactDir, prepared.selectedTask.id, atomicPlan);
            return { outcome: 'proceed', plan: atomicPlan, warnings: [] };
        }
        let plan = await (0, planningPass_1.readTaskPlan)(prepared.paths.artifactDir, prepared.selectedTask.id);
        if (plan && !this.isPlanFreshForSelectedTask(prepared, plan)) {
            this.logger.info('Existing task-plan.json is stale for selected task; regenerating.', {
                taskId: prepared.selectedTask.id
            });
            plan = null;
        }
        if (!plan) {
            this.strategies.configureCliProvider(prepared.config);
            const execStrategy = this.strategies.getCliExecStrategyForProvider();
            if (!execStrategy.runExec) {
                return { outcome: 'skipped', plan: null, warnings: ['Planning pass strategy does not support exec; skipping readiness gate.'] };
            }
            plan = await this.runInlinePlanningPass(prepared.rootPath, prepared.paths.artifactDir, prepared.selectedTask.id, prepared.selectedTask.title, prepared.selectedTask.acceptance ?? [], execStrategy, (0, providers_1.getCliCommandPath)(prepared.config), prepared.config);
        }
        if (!plan) {
            return { outcome: 'skipped', plan: null, warnings: ['Planning pass did not produce a parseable task-plan artifact.'] };
        }
        if (gateMode === 'off') {
            return { outcome: 'proceed', plan, warnings: [] };
        }
        const warnings = [];
        let normalizedPlan = {
            ...plan,
            readiness: plan.readiness ?? 'ready',
            atomicity: plan.atomicity ?? (this.isLikelyAtomicTask(prepared.selectedTask) ? 'atomic' : 'unknown'),
            estimatedTaskCount: plan.estimatedTaskCount ?? Math.max(1, plan.suggestedChildTasks?.length ?? 1),
            nextAction: plan.nextAction ?? 'execute_selected_task'
        };
        normalizedPlan.planningInput = this.buildPlanningInput(prepared, gateMode);
        const readiness = normalizedPlan.readiness ?? 'ready';
        const reason = plan.readinessReason?.trim() || 'No readiness reason was provided.';
        normalizedPlan.acceptedByRalph = readiness === 'ready';
        if (this.shouldWritePlanningDoc(prepared.selectedTask, normalizedPlan)) {
            const doc = await this.writePlanningDoc(prepared.rootPath, prepared.selectedTask, normalizedPlan);
            normalizedPlan = {
                ...normalizedPlan,
                planningDocPath: doc.planningDocPath,
                planningDocSectionId: doc.sectionAnchors[0] ?? null
            };
        }
        await (0, planningPass_1.writeTaskPlan)(prepared.paths.artifactDir, prepared.selectedTask.id, normalizedPlan);
        if (gateMode === 'warn' && readiness !== 'ready') {
            warnings.push(`Planning readiness warning: ${readiness} (${reason})`);
            return { outcome: 'warn_and_proceed', plan: normalizedPlan, warnings };
        }
        if ((gateMode === 'auto' || gateMode === 'strict') && readiness === 'needs_decomposition') {
            const filteredChildren = (normalizedPlan.suggestedChildTasks ?? [])
                .filter((child) => child.parentId === prepared.selectedTask?.id)
                .map((child, index) => ({
                ...child,
                context: Array.from(new Set([
                    ...(child.context ?? []),
                    ...(normalizedPlan.planningDocPath ? [`${normalizedPlan.planningDocPath}#task-${index + 1}`] : [])
                ]))
            }))
                .slice(0, prepared.config.maxGeneratedChildren);
            if (filteredChildren.length > 0) {
                await (0, taskCreation_1.applySuggestedChildTasksToFile)(prepared.paths.taskFilePath, prepared.selectedTask.id, filteredChildren);
                const refreshedPlan = {
                    ...normalizedPlan,
                    suggestedChildTasks: filteredChildren
                };
                await (0, planningPass_1.writeTaskPlan)(prepared.paths.artifactDir, prepared.selectedTask.id, refreshedPlan);
                return {
                    outcome: 'decomposed_and_stop',
                    plan: refreshedPlan,
                    warnings,
                    summary: `Planning gate decomposed ${prepared.selectedTask.id}: ${reason}`
                };
            }
            warnings.push('Planning gate received needs_decomposition but no valid suggestedChildTasks were provided.');
            if (gateMode === 'auto') {
                return { outcome: 'warn_and_proceed', plan: normalizedPlan, warnings };
            }
        }
        if (gateMode === 'auto' && readiness === 'blocked') {
            return { outcome: 'blocked_and_stop', plan: normalizedPlan, warnings, summary: `Planning gate blocked execution: ${reason}` };
        }
        if (gateMode === 'auto' && readiness === 'needs_human_review') {
            return { outcome: 'human_review_and_stop', plan: normalizedPlan, warnings, summary: `Planning gate requested human review: ${reason}` };
        }
        if (gateMode === 'strict') {
            const strictFindings = this.assessStrictReadiness(prepared.selectedTask, normalizedPlan);
            if (strictFindings.length > 0) {
                return {
                    outcome: readiness === 'needs_human_review' ? 'human_review_and_stop' : 'blocked_and_stop',
                    plan: normalizedPlan,
                    warnings: [...warnings, ...strictFindings],
                    summary: `Strict readiness gate stopped execution: ${strictFindings.join(' ')}`
                };
            }
        }
        return warnings.length > 0
            ? { outcome: 'warn_and_proceed', plan: normalizedPlan, warnings }
            : { outcome: 'proceed', plan: normalizedPlan, warnings: [] };
    }
    /**
     * Runs a failure-diagnostic CLI turn when the loop stops due to a blocked task
     * or failed verifier. Writes failure-analysis.json. Best-effort: failures are
     * logged and never abort the main loop.
     */
    async maybeRunFailureDiagnostic(opts) {
        try {
            const { taskId, taskTitle, result, config, artifactRootDir, iterationHistory, workspaceRoot, lastIterationPrompt, lastMessage } = opts;
            if (!(0, loopLogic_1.shouldRunFailureDiagnostic)(result.completionClassification, result.verificationStatus, config.failureDiagnostics)) {
                return;
            }
            const failureSignal = result.verification.validationFailureSignature ?? result.summary ?? '';
            // Transient failures are classified without an LLM call.
            const transientCategory = (0, failureDiagnostics_1.classifyTransientFailure)(failureSignal);
            if (transientCategory) {
                const analysis = {
                    schemaVersion: 1,
                    kind: 'failureAnalysis',
                    taskId,
                    createdAt: new Date().toISOString(),
                    rootCauseCategory: transientCategory,
                    confidence: 'high',
                    summary: 'Failure classified as transient by pattern match.',
                    suggestedAction: 'Retry the task; the failure is likely due to a temporary infrastructure condition.'
                };
                await (0, failureDiagnostics_1.writeFailureAnalysis)(artifactRootDir, taskId, analysis);
                this.logger.info('Failure diagnostic: transient failure detected via pattern match.', { taskId });
                return;
            }
            this.strategies.configureCliProvider(config);
            const execStrategy = this.strategies.getCliExecStrategyForProvider();
            if (!execStrategy.runExec) {
                this.logger.warn('Failure diagnostic skipped: CLI strategy does not support exec.');
                return;
            }
            const recentHistory = iterationHistory.slice(-3).map((h) => ({
                iteration: h.iteration,
                completionClassification: h.completionClassification,
                verificationStatus: h.verificationStatus
            }));
            const diagnosticPrompt = (0, failureDiagnostics_1.buildFailureDiagnosticPrompt)({
                taskId,
                taskTitle,
                lastIterationPrompt,
                lastMessage,
                failureSignal,
                recentHistory
            });
            const taskArtifactDir = path.join(artifactRootDir, taskId);
            await fs.mkdir(taskArtifactDir, { recursive: true });
            const promptPath = path.join(taskArtifactDir, 'failure-diagnostic-prompt.md');
            const transcriptPath = path.join(taskArtifactDir, 'failure-diagnostic-transcript.json');
            const lastMessagePath = path.join(taskArtifactDir, 'failure-diagnostic-last-message.txt');
            await fs.writeFile(promptPath, diagnosticPrompt, 'utf8');
            const execResult = await execStrategy.runExec({
                commandPath: (0, providers_1.getCliCommandPath)(config),
                workspaceRoot,
                executionRoot: workspaceRoot,
                prompt: diagnosticPrompt,
                promptPath,
                promptHash: (0, integrity_1.hashText)(diagnosticPrompt),
                promptByteLength: (0, integrity_1.utf8ByteLength)(diagnosticPrompt),
                transcriptPath,
                lastMessagePath,
                model: config.model,
                reasoningEffort: config.reasoningEffort,
                sandboxMode: config.sandboxMode,
                approvalMode: config.approvalMode,
                timeoutMs: config.cliExecutionTimeoutMs > 0 ? config.cliExecutionTimeoutMs : undefined,
                promptCaching: config.promptCaching
            });
            if (execResult.exitCode !== 0) {
                this.logger.warn('Failure diagnostic exited non-zero; skipping failure-analysis.json.', {
                    taskId,
                    exitCode: execResult.exitCode
                });
                return;
            }
            const analysis = (0, failureDiagnostics_1.parseFailureDiagnosticResponse)(execResult.lastMessage);
            if (!analysis) {
                this.logger.warn('Failure diagnostic produced no parseable analysis; skipping failure-analysis.json.', { taskId });
                return;
            }
            const enriched = { ...analysis, taskId, createdAt: new Date().toISOString() };
            await (0, failureDiagnostics_1.writeFailureAnalysis)(artifactRootDir, taskId, enriched);
            this.logger.info('Failure diagnostic wrote failure-analysis.json.', {
                taskId,
                rootCauseCategory: enriched.rootCauseCategory,
                confidence: enriched.confidence
            });
        }
        catch (err) {
            this.logger.warn('maybeRunFailureDiagnostic encountered an unexpected error; continuing.', {
                error: String(err)
            });
        }
    }
    async runCliIteration(workspaceFolder, mode, progress, options) {
        const broadcaster = options.broadcaster;
        const earlyAgentId = options.configOverrides?.agentId;
        broadcaster?.emitPhase(0, 'inspect', earlyAgentId);
        let prepared = await (0, iterationPreparation_1.prepareIterationContext)({
            workspaceFolder,
            progress,
            includeVerifierContext: true,
            configOverrides: options.configOverrides,
            rolePolicySource: options.rolePolicySource,
            focusTaskId: options.focusTaskId,
            stateManager: this.stateManager,
            logger: this.logger,
            cliProvider: this.strategies.getActiveCliProvider(),
            persistBlockedPreflightBundle: (input) => (0, provenancePersistence_1.persistBlockedPreflightBundle)(input, this.logger),
            persistPreparedProvenanceBundle: (preparedContext) => (0, provenancePersistence_1.persistPreparedProvenanceBundle)(preparedContext, this.logger)
        });
        try {
            let artifactPaths = this.artifactPersistence.resolvePaths(prepared.paths.artifactDir, prepared.iteration);
            const startedAt = prepared.phaseSeed.inspectStartedAt;
            const phaseTimestamps = {
                inspectStartedAt: prepared.phaseSeed.inspectStartedAt,
                inspectFinishedAt: prepared.phaseSeed.inspectFinishedAt,
                taskSelectedAt: prepared.phaseSeed.taskSelectedAt,
                promptGeneratedAt: prepared.phaseSeed.promptGeneratedAt,
                resultCollectedAt: startedAt,
                verificationFinishedAt: startedAt,
                classifiedAt: startedAt
            };
            const planningGateDecision = await this.evaluatePlanningGate(prepared);
            if (planningGateDecision.warnings.length > 0) {
                this.logger.warn('Planning readiness gate produced warnings.', {
                    selectedTaskId: prepared.selectedTask?.id ?? null,
                    warnings: planningGateDecision.warnings
                });
            }
            if (planningGateDecision.outcome === 'decomposed_and_stop'
                || planningGateDecision.outcome === 'blocked_and_stop'
                || planningGateDecision.outcome === 'human_review_and_stop') {
                const now = new Date().toISOString();
                const stopReason = planningGateDecision.outcome === 'decomposed_and_stop'
                    ? 'planning_gate_decomposed'
                    : planningGateDecision.outcome === 'blocked_and_stop'
                        ? 'planning_gate_blocked'
                        : 'planning_gate_human_review';
                const completionClassification = planningGateDecision.outcome === 'human_review_and_stop' ? 'needs_human_review' : 'blocked';
                const taskArtifactDir = path.join(prepared.paths.artifactDir, prepared.selectedTask?.id ?? 'none');
                await fs.mkdir(taskArtifactDir, { recursive: true });
                const gateArtifactPath = path.join(taskArtifactDir, 'planning-gate-result.json');
                const iterationGateArtifactPath = path.join(artifactPaths.directory, 'planning-gate-result.json');
                await fs.writeFile(gateArtifactPath, JSON.stringify({
                    schemaVersion: 1,
                    kind: 'planningReadinessGate',
                    outcome: planningGateDecision.outcome,
                    selectedTaskId: prepared.selectedTask?.id ?? null,
                    selectedTaskTitle: prepared.selectedTask?.title ?? null,
                    summary: planningGateDecision.summary,
                    warnings: planningGateDecision.warnings,
                    plan: planningGateDecision.plan,
                    createdAt: now
                }, null, 2), 'utf8');
                await fs.mkdir(artifactPaths.directory, { recursive: true });
                await fs.copyFile(gateArtifactPath, iterationGateArtifactPath);
                const result = {
                    schemaVersion: 1,
                    agentId: prepared.config.agentId,
                    provenanceId: prepared.provenanceId,
                    iteration: prepared.iteration,
                    selectedTaskId: prepared.selectedTask?.id ?? null,
                    selectedTaskTitle: prepared.selectedTask?.title ?? null,
                    promptKind: prepared.promptKind,
                    promptPath: prepared.promptPath,
                    artifactDir: artifactPaths.directory,
                    adapterUsed: prepared.config.cliProvider,
                    executionIntegrity: null,
                    executionStatus: 'skipped',
                    verificationStatus: 'skipped',
                    completionClassification,
                    followUpAction: 'stop',
                    startedAt,
                    finishedAt: now,
                    phaseTimestamps: {
                        ...phaseTimestamps,
                        executionStartedAt: now,
                        executionFinishedAt: now,
                        resultCollectedAt: now,
                        verificationFinishedAt: now,
                        classifiedAt: now,
                        persistedAt: now
                    },
                    summary: planningGateDecision.summary,
                    warnings: planningGateDecision.warnings,
                    errors: [],
                    execution: {
                        exitCode: null,
                        message: planningGateDecision.summary
                    },
                    verification: {
                        taskValidationHint: prepared.taskValidationHint,
                        effectiveValidationCommand: prepared.effectiveValidationCommand,
                        normalizedValidationCommandFrom: prepared.normalizedValidationCommandFrom,
                        primaryCommand: null,
                        validationFailureSignature: null,
                        verifiers: []
                    },
                    backlog: {
                        remainingTaskCount: prepared.beforeCoreState.taskFile.tasks.filter((task) => task.status !== 'done').length,
                        actionableTaskAvailable: true
                    },
                    diffSummary: null,
                    noProgressSignals: [],
                    remediation: null,
                    completionReportStatus: 'missing',
                    stopReason,
                    selectedModel: prepared.config.model,
                    effectiveTier: 'planning_gate'
                };
                const loopDecision = {
                    shouldContinue: false,
                    stopReason,
                    message: planningGateDecision.summary
                };
                await this.artifactPersistence.persistIterationArtifacts({
                    prepared,
                    artifactPaths,
                    completionReport: {
                        schemaVersion: 1,
                        kind: 'completionReport',
                        status: 'missing',
                        rejectionReason: null,
                        selectedTaskId: prepared.selectedTask?.id ?? null,
                        report: null,
                        rawBlock: null,
                        parseError: null,
                        warnings: []
                    },
                    stdout: '',
                    stderr: '',
                    executionStatus: 'skipped',
                    exitCode: null,
                    executionMessage: planningGateDecision.summary,
                    stdinHash: null,
                    transcriptPath: undefined,
                    lastMessagePath: undefined,
                    lastMessage: planningGateDecision.summary,
                    invocation: undefined,
                    verifierResults: [],
                    diffSummary: null,
                    result,
                    remediationArtifact: null,
                    afterGit: prepared.beforeGit,
                    promptCacheStats: null,
                    executionCostUsd: null
                });
                const runRecord = runRecordFromIteration(mode, prepared, startedAt, result);
                await this.stateManager.recordIteration(prepared.rootPath, prepared.paths, prepared.state, result, prepared.objectiveText, runRecord);
                await (0, provenancePersistence_1.writeLoopTerminationHandoff)({
                    paths: prepared.paths,
                    result,
                    progressNote: null,
                    pendingBlocker: planningGateDecision.summary
                });
                return {
                    prepared,
                    result,
                    loopDecision,
                    createdPaths: prepared.createdPaths
                };
            }
            if ((planningGateDecision.outcome === 'proceed' || planningGateDecision.outcome === 'warn_and_proceed')
                && planningGateDecision.plan) {
                prepared = await (0, iterationPreparation_1.rerenderPreparedPromptContext)({
                    prepared,
                    stateManager: this.stateManager,
                    logger: this.logger,
                    rolePolicySource: options.rolePolicySource,
                    persistPreparedProvenanceBundle: (preparedContext) => (0, provenancePersistence_1.persistPreparedProvenanceBundle)(preparedContext, this.logger)
                });
            }
            broadcaster?.emitPhase(prepared.iteration, 'prompt', prepared.config.agentId);
            progress.report({
                message: `Executing Ralph iteration ${prepared.iteration}`
            });
            broadcaster?.emitPhase(prepared.iteration, 'execute', prepared.config.agentId);
            // Model tiering: select the appropriate model (and optional provider override)
            // based on task complexity. Adopted from Ruflo's smart task-routing pattern.
            const { model: selectedModel, provider: selectedProvider, score: complexityScore, tier: effectiveTier } = prepared.selectedTask
                ? (0, complexityScorer_1.selectModelForTask)({
                    task: prepared.selectedTask,
                    taskFile: prepared.beforeCoreState.taskFile,
                    iterationHistory: prepared.state.iterationHistory,
                    tiering: prepared.config.modelTiering,
                    fallbackModel: prepared.config.model
                })
                : { model: prepared.config.model, provider: undefined, score: null, tier: 'default' };
            if (complexityScore !== null) {
                this.logger.info('Model tiering selected model for task.', {
                    taskId: prepared.selectedTask?.id ?? null,
                    model: selectedModel,
                    provider: selectedProvider ?? prepared.config.cliProvider,
                    complexityScore: complexityScore.score,
                    signals: complexityScore.signals
                });
            }
            // Resolve the effective provider for this iteration. When the tier
            // specifies a provider override, use it; otherwise fall back to the
            // workspace default.
            const effectiveProvider = selectedProvider ?? prepared.config.cliProvider;
            const effectiveCommandPath = selectedProvider
                ? (0, providers_1.getCliCommandPathForProvider)(selectedProvider, prepared.config)
                : (0, providers_1.getCliCommandPath)(prepared.config);
            const shouldExecutePrompt = prepared.selectedTask !== null || prepared.promptKind === 'replenish-backlog';
            // Keep strategy support checks before hook execution.
            this.strategies.configureCliProvider(prepared.config);
            const precheckExecStrategy = this.strategies.getCliExecStrategyForProvider(selectedProvider);
            if (!precheckExecStrategy.runExec) {
                throw new Error('The configured CLI strategy does not support exec.');
            }
            if (shouldExecutePrompt) {
                // Run beforeIteration hook (adopted from Ruflo's hook system).
                const hookContext = {
                    agentId: prepared.config.agentId,
                    taskId: prepared.selectedTask?.id ?? null,
                    outcome: 'pending',
                    stopReason: null,
                    cwd: prepared.rootPath
                };
                const beforeHookResult = await (0, hookRunner_1.runHook)('beforeIteration', prepared.config.hooks, hookContext);
                if (!beforeHookResult.skipped && beforeHookResult.exitCode !== 0) {
                    this.logger.warn('beforeIteration hook exited non-zero.', {
                        command: beforeHookResult.command,
                        exitCode: beforeHookResult.exitCode,
                        stderr: beforeHookResult.stderr.slice(0, 500)
                    });
                }
            }
            const artifactBaseName = (0, promptBuilder_1.createArtifactBaseName)(prepared.promptKind, prepared.iteration);
            const runArtifacts = this.stateManager.runArtifactPaths(prepared.paths, artifactBaseName);
            const execution = await this.iterationExecutor.execute({
                prepared,
                mode,
                selectedModel,
                selectedProvider,
                effectiveProvider,
                effectiveCommandPath,
                artifactPaths,
                runArtifacts,
                beforeCliExecutionIntegrityCheck: this.hooks.beforeCliExecutionIntegrityCheck,
                prepareExecutionWorkspace: (preparedContext) => this.scmCoordinator.prepareExecutionWorkspace(preparedContext)
            });
            phaseTimestamps.executionStartedAt = execution.executionStartedAt;
            phaseTimestamps.executionFinishedAt = execution.executionFinishedAt;
            // Run afterIteration / onFailure hooks (adopted from Ruflo's hook system).
            if (shouldExecutePrompt) {
                const postHookContext = {
                    agentId: prepared.config.agentId,
                    taskId: prepared.selectedTask?.id ?? null,
                    outcome: execution.executionStatus,
                    stopReason: null,
                    cwd: prepared.rootPath
                };
                const afterHookResult = await (0, hookRunner_1.runHook)('afterIteration', prepared.config.hooks, postHookContext);
                if (!afterHookResult.skipped && afterHookResult.exitCode !== 0) {
                    this.logger.warn('afterIteration hook exited non-zero.', {
                        command: afterHookResult.command,
                        exitCode: afterHookResult.exitCode,
                        stderr: afterHookResult.stderr.slice(0, 500)
                    });
                }
                if (execution.executionStatus === 'failed') {
                    const failureHookResult = await (0, hookRunner_1.runHook)('onFailure', prepared.config.hooks, postHookContext);
                    if (!failureHookResult.skipped && failureHookResult.exitCode !== 0) {
                        this.logger.warn('onFailure hook exited non-zero.', {
                            command: failureHookResult.command,
                            exitCode: failureHookResult.exitCode,
                            stderr: failureHookResult.stderr.slice(0, 500)
                        });
                    }
                }
            }
            phaseTimestamps.resultCollectedAt = new Date().toISOString();
            broadcaster?.emitPhase(prepared.iteration, 'verify', prepared.config.agentId);
            progress.report({ message: 'Running Ralph verifiers' });
            const preliminaryVerification = await this.verificationRunner.runPreliminaryVerification({
                prepared,
                artifactPaths,
                executionStatus: execution.executionStatus
            });
            const completionReconciliation = await (0, reconciliation_1.reconcileCompletionReport)({
                prepared,
                selectedTask: prepared.selectedTask,
                verificationStatus: preliminaryVerification.preliminaryVerificationStatus,
                validationCommandStatus: preliminaryVerification.validationVerification.result.status,
                preliminaryClassification: preliminaryVerification.preliminaryOutcome.classification,
                lastMessage: execution.lastMessage,
                taskFilePath: prepared.paths.taskFilePath,
                logger: this.logger
            });
            const branchPerTask = await this.scmCoordinator.reconcileBranchPerTask({
                prepared,
                completionReconciliation,
                validationStatus: preliminaryVerification.validationVerification.result.status,
                runConflictResolverIteration: async (taskId) => {
                    const scmRun = await this.runCliIteration(workspaceFolder, 'singleExec', progress, {
                        reachedIterationCap: false,
                        configOverrides: { agentRole: 'scm', agentId: `scm-conflict-${taskId}` },
                        rolePolicySource: 'explicit',
                        focusTaskId: taskId
                    });
                    return {
                        executionStatus: scmRun.result.executionStatus,
                        selectedTaskId: scmRun.result.selectedTaskId,
                        completionReportStatus: scmRun.result.completionReportStatus
                    };
                }
            });
            const afterCoreState = await (0, verifier_1.captureCoreState)(prepared.paths);
            const taskStateVerification = await this.verificationRunner.runTaskStateVerification({
                prepared,
                artifactPaths,
                completionReconciliation,
                afterCoreState
            });
            phaseTimestamps.verificationFinishedAt = new Date().toISOString();
            broadcaster?.emitPhase(prepared.iteration, 'classify', prepared.config.agentId);
            const classified = this.outcomeClassifier.classify({
                prepared,
                artifactPaths,
                startedAt,
                phaseTimestamps,
                execution,
                validationVerification: preliminaryVerification.validationVerification,
                fileChangeVerification: preliminaryVerification.fileChangeVerification,
                effectiveFileChangeVerification: preliminaryVerification.effectiveFileChangeVerification,
                relevantFileChangesForOutcome: preliminaryVerification.relevantFileChangesForOutcome,
                completionReconciliation,
                taskStateVerification,
                afterCoreState,
                selectedModel,
                effectiveTier,
                branchPerTaskWarnings: branchPerTask.warnings
            });
            let result = classified.result;
            const loopEvaluation = this.loopDecisionService.evaluate({
                prepared,
                result,
                selectedTaskCompleted: taskStateVerification.selectedTaskCompleted,
                remainingSubtaskCount: classified.remainingSubtaskList.length,
                remainingTaskCount: classified.remainingTaskCount,
                hasActionableTask: Boolean(classified.nextActionableTask),
                reachedIterationCap: options.reachedIterationCap,
                completionReconciliation
            });
            const loopDecision = loopEvaluation.loopDecision;
            result = loopEvaluation.result;
            if (loopEvaluation.shouldBuildRemediation) {
                result = this.remediationCoordinator.attachStopRemediation({
                    result,
                    stopReason: loopDecision.stopReason,
                    previousIterations: prepared.state.iterationHistory,
                    taskFile: afterCoreState.taskFile
                });
            }
            if (!loopDecision.shouldContinue && result.selectedTaskId) {
                await this.maybeRunFailureDiagnostic({
                    taskId: result.selectedTaskId,
                    taskTitle: prepared.selectedTask?.title ?? result.selectedTaskId,
                    result,
                    config: prepared.config,
                    artifactRootDir: prepared.paths.artifactDir,
                    iterationHistory: prepared.state.iterationHistory,
                    workspaceRoot: prepared.rootPath,
                    lastIterationPrompt: prepared.prompt,
                    lastMessage: execution.lastMessage
                });
            }
            result = {
                ...result,
                phaseTimestamps: {
                    ...result.phaseTimestamps,
                    persistedAt: new Date().toISOString()
                }
            };
            const remediationOutcome = await this.remediationCoordinator.buildAndAutoApply({
                result,
                taskFile: afterCoreState.taskFile,
                previousIterations: prepared.state.iterationHistory,
                artifactPaths,
                taskFilePath: prepared.paths.taskFilePath,
                autoApplyRemediation: prepared.config.autoApplyRemediation,
                createdAt: result.phaseTimestamps.persistedAt
            });
            result = remediationOutcome.result;
            const remediationArtifact = remediationOutcome.remediationArtifact;
            remediationOutcome.effectiveTaskFile;
            // Run onStop hook when the loop will not continue (adopted from Ruflo's hook system).
            if (result.stopReason) {
                const stopHookContext = {
                    agentId: prepared.config.agentId,
                    taskId: result.selectedTaskId,
                    outcome: result.completionClassification,
                    stopReason: result.stopReason,
                    cwd: prepared.rootPath
                };
                const stopHookResult = await (0, hookRunner_1.runHook)('onStop', prepared.config.hooks, stopHookContext);
                if (!stopHookResult.skipped && stopHookResult.exitCode !== 0) {
                    this.logger.warn('onStop hook exited non-zero.', {
                        command: stopHookResult.command,
                        exitCode: stopHookResult.exitCode,
                        stderr: stopHookResult.stderr.slice(0, 500)
                    });
                }
            }
            try {
                await (0, provenancePersistence_1.updateAgentIdentityRecord)({
                    rootPath: prepared.rootPath,
                    agentId: prepared.config.agentId,
                    startedAt,
                    selectedTaskId: prepared.selectedTask?.id ?? null,
                    selectedTaskCompleted: taskStateVerification.selectedTaskCompleted,
                    diffSummary: preliminaryVerification.fileChangeVerification.diffSummary
                });
            }
            catch (error) {
                result.warnings.push(`Failed to update agent identity record for ${prepared.config.agentId}: ${(0, error_1.toErrorMessage)(error)}`);
            }
            // Run onTaskComplete hook when a task transitions to done (adopted from Ruflo's hook system).
            if (taskStateVerification.selectedTaskCompleted && prepared.selectedTask) {
                const taskCompleteHookContext = {
                    agentId: prepared.config.agentId,
                    taskId: prepared.selectedTask.id,
                    outcome: result.completionClassification,
                    stopReason: result.stopReason ?? '',
                    cwd: prepared.rootPath
                };
                const taskCompleteHookResult = await (0, hookRunner_1.runHook)('onTaskComplete', prepared.config.hooks, taskCompleteHookContext);
                if (!taskCompleteHookResult.skipped && taskCompleteHookResult.exitCode !== 0) {
                    this.logger.warn('onTaskComplete hook exited non-zero.', {
                        command: taskCompleteHookResult.command,
                        exitCode: taskCompleteHookResult.exitCode,
                        stderr: taskCompleteHookResult.stderr.slice(0, 500)
                    });
                }
            }
            const commitWarnings = await this.scmCoordinator.commitOnDoneIfNeeded({
                prepared,
                selectedTaskCompleted: taskStateVerification.selectedTaskCompleted,
                validationStatus: preliminaryVerification.validationVerification.result.status
            });
            if (commitWarnings.length > 0) {
                result.warnings.push(...commitWarnings);
            }
            broadcaster?.emitPhase(prepared.iteration, 'persist', prepared.config.agentId);
            await this.artifactPersistence.persistIterationArtifacts({
                prepared,
                artifactPaths,
                completionReport: completionReconciliation.artifact,
                stdout: execution.stdout,
                stderr: execution.stderr,
                executionStatus: execution.executionStatus,
                exitCode: execution.exitCode,
                executionMessage: execution.executionErrors[0] ?? null,
                stdinHash: execution.stdinHash,
                transcriptPath: execution.transcriptPath,
                lastMessagePath: execution.lastMessagePath,
                lastMessage: execution.lastMessage,
                invocation: execution.invocation,
                verifierResults: [...classified.verifierResults],
                diffSummary: preliminaryVerification.fileChangeVerification.diffSummary,
                result,
                remediationArtifact,
                afterGit: preliminaryVerification.afterGit,
                promptCacheStats: execution.promptCacheStats,
                executionCostUsd: execution.executionCostUsd
            });
            const runRecord = runRecordFromIteration(mode, prepared, startedAt, result);
            await this.stateManager.recordIteration(prepared.rootPath, prepared.paths, prepared.state, result, prepared.objectiveText, runRecord);
            await (0, provenancePersistence_1.writeLoopTerminationHandoff)({
                paths: prepared.paths,
                result,
                progressNote: completionReconciliation.artifact.report?.progressNote ?? null,
                pendingBlocker: classified.selectedTaskAfter?.blocker ?? completionReconciliation.artifact.report?.blocker ?? null
            });
            await (0, provenancePersistence_1.cleanupGeneratedArtifactsHelper)(prepared.paths, prepared.config.generatedArtifactRetentionCount, 'execution', this.logger);
            this.logger.info('Completed Ralph iteration.', {
                iteration: prepared.iteration,
                selectedTaskId: prepared.selectedTask?.id ?? null,
                executionStatus: result.executionStatus,
                verificationStatus: result.verificationStatus,
                completionClassification: result.completionClassification,
                stopReason: result.stopReason,
                promptPath: prepared.promptPath,
                promptArtifactPath: prepared.executionPlan.promptArtifactPath,
                promptHash: prepared.executionPlan.promptHash,
                executionPayloadMatched: result.executionIntegrity?.executionPayloadMatched ?? null,
                artifactDir: artifactPaths.directory,
                selectedTaskAfterStatus: classified.selectedTaskAfter?.status ?? null
            });
            return {
                prepared,
                result,
                loopDecision,
                createdPaths: prepared.createdPaths,
                autoReviewContext: branchPerTask.autoReviewContext
            };
        }
        finally {
            if (prepared.selectedTask) {
                await (0, taskFile_1.releaseClaim)(prepared.paths.claimFilePath, prepared.selectedTask.id, prepared.config.agentId).catch((error) => {
                    this.logger.warn('Failed to release Ralph task claim after iteration.', {
                        selectedTaskId: prepared.selectedTask?.id ?? null,
                        provenanceId: prepared.provenanceId,
                        error: (0, error_1.toErrorMessage)(error)
                    });
                });
            }
        }
    }
}
exports.RalphIterationEngine = RalphIterationEngine;
//# sourceMappingURL=iterationEngine.js.map