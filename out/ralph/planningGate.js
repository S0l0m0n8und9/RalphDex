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
exports.PlanningGate = void 0;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const providers_1 = require("../config/providers");
const planningPass_1 = require("./planningPass");
const integrity_1 = require("./integrity");
const taskCreation_1 = require("./taskCreation");
/**
 * Pre-execution planning gate. Decides, before any provider execution, whether
 * the selected task is ready to run, should be decomposed into child tasks,
 * blocked, or escalated for human review. Extracted from RalphIterationEngine
 * so the engine stays a thin orchestrator; it collaborates with the CLI
 * strategy registry (to run an inline planning turn) and a logger only.
 */
class PlanningGate {
    strategies;
    logger;
    constructor(strategies, logger) {
        this.strategies = strategies;
        this.logger = logger;
    }
    async evaluate(prepared) {
        if (!prepared.selectedTask) {
            return { outcome: 'skipped', plan: null, warnings: [] };
        }
        const gateMode = prepared.config.taskReadinessGate;
        const planningEnabled = (0, planningPass_1.shouldRunInlinePlanningPassForConfig)(prepared.config);
        let diagnostics = (0, planningPass_1.analyzeTaskShape)({
            task: prepared.selectedTask,
            workspaceScan: prepared.summary,
            effectiveValidationCommand: prepared.effectiveValidationCommand
        });
        if (!planningEnabled && gateMode === 'off') {
            return { outcome: 'skipped', plan: null, warnings: [] };
        }
        if ((gateMode === 'auto' || gateMode === 'strict') && diagnostics.recommendedAction === 'execute') {
            const atomicPlan = {
                reasoning: 'Selected task already appears atomic and executable.',
                approach: 'Execute directly with bounded acceptance and available validation.',
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
        if (gateMode !== 'off' && plan && !this.isPlanFreshForSelectedTask(prepared, plan)) {
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
            plan = await this.runInlinePlanningPass(prepared.rootPath, prepared.paths.artifactDir, prepared.selectedTask.id, prepared.selectedTask.title, prepared.selectedTask.acceptance ?? [], prepared.effectiveValidationCommand, diagnostics, prepared.summary.validationCommands, prepared.summary.packageJson?.scriptNames ?? [], execStrategy, (0, providers_1.getCliCommandPath)(prepared.config), prepared.config);
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
            atomicity: plan.atomicity ?? diagnostics.atomicity,
            estimatedTaskCount: plan.estimatedTaskCount ?? Math.max(1, plan.suggestedChildTasks?.length ?? 1),
            nextAction: plan.nextAction ?? 'execute_selected_task'
        };
        diagnostics = (0, planningPass_1.analyzeTaskShape)({
            task: prepared.selectedTask,
            workspaceScan: prepared.summary,
            effectiveValidationCommand: prepared.effectiveValidationCommand,
            plannerSuggestedValidationCommand: normalizedPlan.suggestedValidationCommand,
            suggestedAcceptance: normalizedPlan.suggestedAcceptance
        });
        normalizedPlan.atomicity = normalizedPlan.atomicity ?? diagnostics.atomicity;
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
        const diagnosticWarningSummary = diagnostics.findings.length > 0
            ? diagnostics.findings.map((finding) => `${finding.code}: ${finding.message}`).join(' ')
            : '';
        if (gateMode === 'warn' && (readiness !== 'ready' || diagnostics.findings.length > 0)) {
            warnings.push(`Planning gate warning recorded; execution continued${diagnosticWarningSummary ? `: ${diagnosticWarningSummary}` : `: ${readiness} (${reason})`}`);
            return { outcome: 'warn_and_proceed', plan: normalizedPlan, warnings };
        }
        if ((gateMode === 'auto' || gateMode === 'strict') && diagnostics.recommendedAction === 'block_or_review') {
            return {
                outcome: 'blocked_and_stop',
                plan: normalizedPlan,
                warnings: [...warnings, ...diagnostics.findings.map((finding) => finding.message)],
                summary: `Planning gate blocked task before provider execution: ${diagnostics.findings.map((finding) => finding.message).join(' ')}`
            };
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
                    summary: `Planning gate decomposed broad task before provider execution: ${reason}`
                };
            }
            warnings.push('Planning gate received needs_decomposition but no valid suggestedChildTasks were provided.');
            if (gateMode === 'auto') {
                return { outcome: 'warn_and_proceed', plan: normalizedPlan, warnings };
            }
        }
        if (gateMode === 'auto' && readiness === 'blocked') {
            return { outcome: 'blocked_and_stop', plan: normalizedPlan, warnings, summary: `Planning gate blocked task before provider execution: ${reason}` };
        }
        if (gateMode === 'auto' && readiness === 'needs_human_review') {
            return { outcome: 'human_review_and_stop', plan: normalizedPlan, warnings, summary: `Planning gate requested human review before provider execution: ${reason}` };
        }
        if (gateMode === 'strict') {
            const strictFindings = this.assessStrictReadiness(prepared.selectedTask, normalizedPlan, diagnostics);
            if (strictFindings.length > 0) {
                return {
                    outcome: readiness === 'needs_human_review' ? 'human_review_and_stop' : 'blocked_and_stop',
                    plan: normalizedPlan,
                    warnings: [...warnings, ...strictFindings],
                    summary: readiness === 'needs_human_review'
                        ? `Planning gate requested human review before provider execution: ${strictFindings.join(' ')}`
                        : `Planning gate blocked task before provider execution: ${strictFindings.join(' ')}`
                };
            }
        }
        return warnings.length > 0
            ? { outcome: 'warn_and_proceed', plan: normalizedPlan, warnings }
            : { outcome: 'proceed', plan: normalizedPlan, warnings: [] };
    }
    async runInlinePlanningPass(workspaceRoot, artifactsDir, taskId, taskTitle, taskAcceptance, effectiveValidationCommand, diagnostics, workspaceValidationCommands, packageScripts, execStrategy, commandPath, config) {
        const diagnosticLines = diagnostics.findings.length > 0
            ? diagnostics.findings.map((finding) => `- ${finding.severity}: ${finding.code}: ${finding.message}`)
            : ['- none'];
        const planningPrompt = [
            'You are a planning/readiness agent. Analyse the task below and return JSON only.',
            '',
            `Task ID: ${taskId}`,
            `Task Title: ${taskTitle}`,
            taskAcceptance.length > 0 ? `Acceptance criteria:\n${taskAcceptance.map((a) => `- ${a}`).join('\n')}` : '',
            `Effective validation command: ${effectiveValidationCommand ?? 'none detected'}`,
            workspaceValidationCommands.length > 0 ? `Discovered validation commands:\n${workspaceValidationCommands.map((command) => `- ${command}`).join('\n')}` : 'Discovered validation commands: none',
            packageScripts.length > 0 ? `package.json scripts:\n${packageScripts.map((script) => `- ${script}`).join('\n')}` : 'package.json scripts: none detected',
            'Deterministic task-shape diagnostics:',
            ...diagnosticLines,
            '',
            'Assess readiness before execution:',
            '- Is the task executable in one bounded iteration?',
            '- Is there a concrete validation command?',
            '- Are acceptance criteria clear?',
            '- Is this task too broad / greenfield and should be decomposed?',
            '- For greenfield/bootstrap risk, prefer atomic child tasks such as defining project envelope/conventions, creating a minimal runnable scaffold, adding a first smoke test, implementing the smallest vertical slice, or promoting to a full validation gate.',
            '- Do not blindly generate all possible greenfield children. Generate only the smallest useful next sequence, capped by maxGeneratedChildren.',
            '- Child task titles must avoid "and", "then", and "plus"; each child needs one concern, acceptance criteria, and validation where reasonably knowable.',
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
            // Planning turns use global reasoning effort, not the tier-specific override.
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
    assessStrictReadiness(task, plan, diagnostics) {
        const findings = [];
        const validation = (task.validation ?? plan.suggestedValidationCommand ?? '').trim();
        if (!validation) {
            const hasEffectiveValidation = !diagnostics.findings.some((finding) => finding.code === 'missing_validation');
            if (!hasEffectiveValidation) {
                findings.push('Selected task is missing a concrete validation command.');
            }
        }
        if ((task.acceptance ?? []).length === 0 && (plan.suggestedAcceptance ?? []).length === 0) {
            findings.push('Selected task has no acceptance criteria.');
        }
        for (const finding of diagnostics.findings) {
            if (finding.code === 'broad_scope' || finding.code === 'greenfield_bootstrap_risk' || finding.code === 'missing_package_script') {
                findings.push(finding.message);
            }
        }
        if (plan.readiness && plan.readiness !== 'ready') {
            findings.push(`Planner readiness is ${plan.readiness}.`);
        }
        return findings;
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
}
exports.PlanningGate = PlanningGate;
//# sourceMappingURL=planningGate.js.map