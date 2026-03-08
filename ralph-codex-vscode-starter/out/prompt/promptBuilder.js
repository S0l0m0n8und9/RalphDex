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
exports.resolvePromptTemplateDirectory = resolvePromptTemplateDirectory;
exports.decidePromptKind = decidePromptKind;
exports.choosePromptKind = choosePromptKind;
exports.createPromptFileName = createPromptFileName;
exports.createArtifactBaseName = createArtifactBaseName;
exports.buildPrompt = buildPrompt;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const taskFile_1 = require("../ralph/taskFile");
const DEFAULT_TEMPLATE_DIR_CANDIDATES = [
    path.resolve(__dirname, '../../prompt-templates'),
    path.resolve(__dirname, '../../../prompt-templates'),
    path.resolve(process.cwd(), 'prompt-templates')
];
const TEMPLATE_FILE_BY_KIND = {
    bootstrap: 'bootstrap.md',
    iteration: 'iteration.md',
    'fix-failure': 'fix-failure.md',
    'continue-progress': 'continue-progress.md',
    'human-review-handoff': 'human-review-handoff.md'
};
const PROMPT_INTRO_BY_KIND = {
    bootstrap: 'You are starting a fresh Ralph-guided Codex run inside an existing repository. Treat the repository and durable Ralph files as the source of truth.',
    iteration: 'You are continuing Ralph work from durable repository state, not from chat memory. Re-inspect the repo and selected task before editing.',
    'fix-failure': 'A prior Ralph iteration failed, stalled, or produced a blocking verifier signal. Repair the concrete cause instead of repeating the same attempt.',
    'continue-progress': 'A prior Ralph iteration made partial progress. Resume from that durable state and finish the next coherent slice without redoing settled work.',
    'human-review-handoff': 'A prior Ralph iteration surfaced a blocker that may need human review. Preserve deterministic evidence, do not fake closure, and make the next safe move explicit.'
};
function formatOptional(value) {
    return value && value.trim().length > 0 ? value.trim() : 'none';
}
function toRelativePath(rootPath, target) {
    if (!target) {
        return 'none';
    }
    return path.relative(rootPath, target) || '.';
}
function clipText(text, maximumLines, maximumChars, fromEnd = false) {
    const lines = text
        .split('\n')
        .map((line) => line.trimEnd())
        .filter((line, index, source) => !(line.length === 0 && source[index - 1]?.length === 0));
    const selected = fromEnd ? lines.slice(-maximumLines) : lines.slice(0, maximumLines);
    let normalized = selected.join('\n').trim();
    if (!normalized) {
        return 'None.';
    }
    if (normalized.length > maximumChars) {
        normalized = `${normalized.slice(0, Math.max(0, maximumChars - 14)).trimEnd()}\n[trimmed for size]`;
    }
    else if (selected.length < lines.length) {
        normalized = `${normalized}\n[trimmed for size]`;
    }
    return normalized;
}
function compactList(values, limit) {
    if (values.length === 0) {
        return 'none';
    }
    const visible = values.slice(0, limit);
    const remaining = values.length - visible.length;
    return remaining > 0 ? `${visible.join(', ')} (+${remaining} more)` : visible.join(', ');
}
function trimContextLines(lines, budget) {
    if (budget <= 0 || lines.length <= budget) {
        return lines;
    }
    if (budget === 1) {
        return [`- Prior context trimmed: ${lines.length} signals available.`];
    }
    const visible = lines.slice(0, budget - 1);
    visible.push(`- Additional prior-context signals omitted: ${lines.length - visible.length}.`);
    return visible;
}
function taskDependencySummary(taskFile, task) {
    if (!task.dependsOn || task.dependsOn.length === 0) {
        return 'none';
    }
    return task.dependsOn
        .map((dependencyId) => {
        const dependency = (0, taskFile_1.findTaskById)(taskFile, dependencyId);
        return dependency ? `${dependency.id} (${dependency.status})` : `${dependencyId} (missing)`;
    })
        .join(', ');
}
function childTaskSummary(taskFile, task) {
    const children = taskFile.tasks.filter((candidate) => candidate.parentId === task.id);
    if (children.length === 0) {
        return 'none';
    }
    return compactList(children.map((child) => `${child.id} (${child.status})`), 4);
}
function buildStrategyContext(target, kind) {
    if (target === 'cliExec') {
        return [
            '- Target: Codex CLI execution via `codex exec`.',
            '- Operate autonomously inside the repository. Do not rely on interactive clarification to make forward progress.',
            '- Keep command usage deterministic and concise because Ralph will persist transcripts, verifier output, and stop signals.',
            kind === 'human-review-handoff'
                ? '- This prompt follows a human-review signal. If the blocker is still real, preserve it cleanly instead of masking it with speculative edits.'
                : '- End with a compact change summary Ralph can pair with verifier evidence.'
        ];
    }
    return [
        '- Target: manual Codex IDE handoff via clipboard plus VS Code commands.',
        '- A human may inspect or adjust the prompt before execution; keep blockers and review points easy to scan.',
        '- Do not assume `codex exec` transcript capture or automated verifier reruns inside the IDE handoff path.',
        kind === 'human-review-handoff'
            ? '- Focus on what the human needs to inspect, decide, or validate next.'
            : '- Still rely on repo files as the source of truth and update durable Ralph files when work meaningfully changes.'
    ];
}
function buildPreflightContext(report) {
    const lines = [
        `- Ready: ${report.ready ? 'yes' : 'no'}`,
        `- Summary: ${report.summary}`
    ];
    const salientDiagnostics = report.diagnostics
        .filter((diagnostic) => diagnostic.severity !== 'info')
        .slice(0, 3)
        .map((diagnostic) => `- ${diagnostic.category} ${diagnostic.severity}: ${diagnostic.message}`);
    return salientDiagnostics.length > 0 ? [...lines, ...salientDiagnostics] : lines;
}
function buildRepoContext(summary) {
    const lines = [
        `- Workspace: ${summary.workspaceName}`,
        `- Inspected root: ${summary.rootPath}`,
        `- Root selection: ${summary.rootSelection.summary}`,
        `- Manifests: ${compactList(summary.manifests, 5)}`,
        `- Source roots: ${compactList(summary.sourceRoots, 5)}`,
        `- Test roots: ${compactList(summary.tests, 5)}`,
        `- Package managers: ${compactList(summary.packageManagers, 4)}`,
        `- Package manager indicators: ${compactList(summary.packageManagerIndicators, 5)}`,
        `- Validation commands: ${compactList(summary.validationCommands, 4)}`,
        `- Lifecycle commands: ${compactList(summary.lifecycleCommands, 4)}`,
        `- CI files: ${compactList(summary.ciFiles, 4)}`,
        `- CI commands: ${compactList(summary.ciCommands, 4)}`,
        `- Docs: ${compactList(summary.docs, 4)}`,
        `- Test signals: ${compactList(summary.testSignals, 3)}`
    ];
    if (summary.workspaceRootPath !== summary.rootPath) {
        lines.push(`- Workspace root: ${summary.workspaceRootPath}`);
    }
    if (summary.packageJson?.name) {
        lines.push(`- package.json name: ${summary.packageJson.name}`);
    }
    if (summary.packageJson?.hasWorkspaces) {
        lines.push('- package.json workspaces: yes');
    }
    if (summary.notes.length > 0) {
        lines.push(`- Notes: ${compactList(summary.notes, 3)}`);
    }
    return lines;
}
function buildRuntimeContext(state, paths, iteration, target) {
    const lines = [
        `- Prompt target: ${target}`,
        `- Current iteration number: ${iteration}`,
        `- Next iteration recorded in state: ${state.nextIteration}`,
        `- Last prompt kind: ${state.lastPromptKind ?? 'none yet'}`,
        `- Last prompt path: ${toRelativePath(paths.rootPath, state.lastPromptPath)}`,
        `- Last run: ${state.lastRun ? `${state.lastRun.status} at iteration ${state.lastRun.iteration}` : 'none yet'}`,
        `- Last iteration outcome: ${state.lastIteration ? `${state.lastIteration.completionClassification} at iteration ${state.lastIteration.iteration}` : 'none yet'}`,
        `- PRD path: ${toRelativePath(paths.rootPath, paths.prdPath)}`,
        `- Progress path: ${toRelativePath(paths.rootPath, paths.progressPath)}`,
        `- Task file path: ${toRelativePath(paths.rootPath, paths.taskFilePath)}`,
        `- Runtime state path: ${toRelativePath(paths.rootPath, paths.stateFilePath)}`,
        `- Artifact root: ${toRelativePath(paths.rootPath, paths.artifactDir)}`
    ];
    if (state.lastIteration?.summary) {
        lines.push(`- Last iteration summary: ${state.lastIteration.summary}`);
    }
    return lines;
}
function buildTaskContext(taskFile, taskCounts, selectedTask, validationCommand) {
    const nextActionable = (0, taskFile_1.selectNextTask)(taskFile);
    const baseLines = [
        `- Backlog counts: todo ${taskCounts.todo}, in_progress ${taskCounts.in_progress}, blocked ${taskCounts.blocked}, done ${taskCounts.done}`,
        `- Next actionable task: ${nextActionable ? `${nextActionable.id} (${nextActionable.status})` : 'none'}`
    ];
    if (!selectedTask) {
        return [
            ...baseLines,
            '- No actionable Ralph task was selected.',
            '- Do not invent a task. Stop and explain why the loop cannot continue safely.'
        ];
    }
    const remainingChildren = (0, taskFile_1.remainingSubtasks)(taskFile, selectedTask.id)
        .map((task) => `${task.id} (${task.status})`);
    return [
        ...baseLines,
        `- Selected task id: ${selectedTask.id}`,
        `- Title: ${selectedTask.title}`,
        `- Status: ${selectedTask.status}`,
        `- Parent task: ${selectedTask.parentId ?? 'none'}`,
        `- Dependencies: ${taskDependencySummary(taskFile, selectedTask)}`,
        `- Direct children: ${childTaskSummary(taskFile, selectedTask)}`,
        `- Remaining descendants: ${remainingChildren.length > 0 ? compactList(remainingChildren, 4) : 'none'}`,
        `- Task validation hint: ${selectedTask.validation ?? 'none'}`,
        `- Selected validation command: ${validationCommand ?? 'none detected'}`,
        `- Notes: ${selectedTask.notes ?? 'none'}`,
        `- Blocker: ${selectedTask.blocker ?? 'none'}`
    ];
}
function buildPriorIterationContext(state, includeVerifierFeedback, budget, rootPath) {
    const prior = state.lastIteration;
    if (!prior) {
        return ['- No prior Ralph iteration has been recorded.'];
    }
    if (!includeVerifierFeedback) {
        return ['- Prior verifier feedback is disabled by configuration.'];
    }
    const lines = [
        `- Prior iteration: ${prior.iteration}`,
        `- Prior outcome classification: ${prior.completionClassification}`,
        `- Prior execution / verification: ${prior.executionStatus} / ${prior.verificationStatus}`,
        `- Prior follow-up action: ${prior.followUpAction}`,
        `- Prior summary: ${prior.summary}`,
        `- Prior stop reason: ${formatOptional(prior.stopReason)}`,
        `- Prior validation failure signature: ${formatOptional(prior.verification.validationFailureSignature)}`,
        `- Prior verifier statuses: ${prior.verification.verifiers.map((verifier) => `${verifier.verifier}=${verifier.status}`).join(', ') || 'none'}`,
        `- Prior no-progress signals: ${prior.noProgressSignals.join(', ') || 'none'}`,
        `- Prior prompt artifact: ${toRelativePath(rootPath, prior.promptPath)}`,
        `- Prior iteration artifact dir: ${toRelativePath(rootPath, prior.artifactDir)}`
    ];
    if (prior.diffSummary) {
        lines.push(`- Prior diff summary: ${prior.diffSummary.summary}`);
        if (prior.diffSummary.relevantChangedFiles.length > 0) {
            lines.push(`- Prior relevant changed files: ${compactList(prior.diffSummary.relevantChangedFiles, 5)}`);
        }
    }
    return trimContextLines(lines, budget);
}
function buildOperatingRules() {
    return [
        '- Read AGENTS.md plus the durable Ralph files before making non-trivial changes.',
        '- Do not invent unsupported Codex IDE APIs or hidden handoff channels.',
        '- Keep architecture thin, deterministic, and file-backed.',
        '- Make the smallest coherent change that materially advances the selected Ralph task.',
        '- Prefer the repository’s real validation commands when they exist.',
        '- Update durable Ralph progress/tasks when the task state materially changes.'
    ];
}
function buildExecutionContract(target) {
    const contract = [
        '1. Inspect the workspace facts and selected Ralph task before editing.',
        '2. Execute only the selected task, or explain deterministically why no safe task is available.',
        '3. Implement the smallest coherent improvement that advances the task.',
        '4. Update durable Ralph files when task state or progress changes.'
    ];
    if (target === 'cliExec') {
        contract.push('5. Run the selected validation command when available and report the concrete result.');
        contract.push('6. End with a compact result Ralph can pair with verifier and artifact evidence.');
    }
    else {
        contract.push('5. If a blocker needs human judgment, surface it plainly instead of burying it.');
        contract.push('6. End with the concrete next step a human can verify or run in the IDE.');
    }
    return contract;
}
function buildFinalResponseContract(target) {
    if (target === 'cliExec') {
        return [
            '- Changed files.',
            '- Validation results.',
            '- Assumptions or blockers.',
            '- Known limitations or follow-up work.'
        ];
    }
    return [
        '- Changed files or inspected files.',
        '- What is ready for human review.',
        '- Validation run or still needed.',
        '- The next concrete IDE or terminal step.'
    ];
}
function renderTemplate(template, values) {
    const missing = new Set();
    const rendered = template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, key) => {
        if (!(key in values)) {
            missing.add(key);
            return '';
        }
        return values[key];
    });
    if (missing.size > 0) {
        throw new Error(`Prompt template is missing renderer values for: ${Array.from(missing).sort().join(', ')}`);
    }
    return `${rendered.replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}
async function pathExists(target) {
    try {
        await fs.access(target);
        return true;
    }
    catch {
        return false;
    }
}
async function resolvePromptTemplateDirectory(rootPath, overrideDirectory) {
    if (overrideDirectory.trim()) {
        const resolved = path.isAbsolute(overrideDirectory)
            ? overrideDirectory
            : path.join(rootPath, overrideDirectory);
        if (await pathExists(resolved)) {
            return resolved;
        }
        throw new Error(`Configured Ralph prompt template directory does not exist: ${resolved}`);
    }
    for (const candidate of DEFAULT_TEMPLATE_DIR_CANDIDATES) {
        if (await pathExists(candidate)) {
            return candidate;
        }
    }
    throw new Error('Bundled Ralph prompt templates were not found.');
}
async function loadTemplate(kind, rootPath, overrideDirectory) {
    const directory = await resolvePromptTemplateDirectory(rootPath, overrideDirectory);
    const templatePath = path.join(directory, TEMPLATE_FILE_BY_KIND[kind]);
    const templateText = await fs.readFile(templatePath, 'utf8').catch((error) => {
        throw new Error(`Failed to read Ralph prompt template ${templatePath}: ${error instanceof Error ? error.message : String(error)}`);
    });
    return {
        templatePath,
        templateText
    };
}
function hasAnyPriorPrompt(state) {
    return Boolean(state.lastPromptPath || state.lastPromptKind || state.lastRun || state.lastIteration);
}
function decidePromptKind(state, target) {
    const lastIteration = state.lastIteration;
    if (!hasAnyPriorPrompt(state)) {
        return {
            kind: 'bootstrap',
            reason: 'No prior Ralph prompt or iteration has been recorded.'
        };
    }
    if (lastIteration?.completionClassification === 'needs_human_review'
        || lastIteration?.stopReason === 'human_review_needed') {
        return {
            kind: 'human-review-handoff',
            reason: target === 'ideHandoff'
                ? 'The previous iteration requested human review, so the next prompt should surface that handoff explicitly.'
                : 'The previous iteration requested human review, so the next prompt should preserve that blocker explicitly.'
        };
    }
    if (lastIteration?.completionClassification === 'partial_progress') {
        return {
            kind: 'continue-progress',
            reason: 'The previous iteration recorded partial progress, so the next prompt should continue from that durable state.'
        };
    }
    if (lastIteration
        && (lastIteration.executionStatus === 'failed'
            || lastIteration.verificationStatus === 'failed'
            || lastIteration.completionClassification === 'failed'
            || lastIteration.completionClassification === 'blocked'
            || lastIteration.completionClassification === 'no_progress'
            || Boolean(lastIteration.verification.validationFailureSignature))) {
        return {
            kind: 'fix-failure',
            reason: 'The previous iteration failed, stalled, or produced a blocking verifier signal, so the next prompt should focus on fixing that concrete issue.'
        };
    }
    return {
        kind: 'iteration',
        reason: 'A prior Ralph prompt exists and there is no stronger prior-iteration signal that requires a specialized follow-up prompt.'
    };
}
function choosePromptKind(state, target) {
    return decidePromptKind(state, target).kind;
}
function createPromptFileName(kind, iteration) {
    return `${kind}-${String(iteration).padStart(3, '0')}.prompt.md`;
}
function createArtifactBaseName(kind, iteration) {
    return `${kind}-${String(iteration).padStart(3, '0')}`;
}
async function buildPrompt(input) {
    const { templatePath, templateText } = await loadTemplate(input.kind, input.paths.rootPath, input.config.promptTemplateDirectory);
    const evidence = {
        schemaVersion: 1,
        iteration: input.iteration,
        kind: input.kind,
        target: input.target,
        templatePath,
        selectionReason: input.selectionReason,
        selectedTaskId: input.selectedTask?.id ?? null,
        validationCommand: input.validationCommand,
        inputs: {
            strategyContext: buildStrategyContext(input.target, input.kind),
            preflightContext: buildPreflightContext(input.preflightReport),
            objectiveContext: clipText(input.objectiveText, 14, 1600),
            repoContext: buildRepoContext(input.summary),
            repoContextSnapshot: input.summary,
            runtimeContext: buildRuntimeContext(input.state, input.paths, input.iteration, input.target),
            taskContext: buildTaskContext(input.taskFile, input.taskCounts, input.selectedTask, input.validationCommand),
            progressContext: clipText(input.progressText, 10, 1200, true)
                .split('\n')
                .map((line) => line.trimEnd())
                .filter((line) => line.length > 0),
            priorIterationContext: buildPriorIterationContext(input.state, input.config.promptIncludeVerifierFeedback, input.config.promptPriorContextBudget, input.paths.rootPath),
            operatingRules: buildOperatingRules(),
            executionContract: buildExecutionContract(input.target),
            finalResponseContract: buildFinalResponseContract(input.target)
        }
    };
    const prompt = renderTemplate(templateText, {
        prompt_title: `# Ralph Prompt: ${input.kind} (${input.target})`,
        prompt_intro: PROMPT_INTRO_BY_KIND[input.kind],
        strategy_context: evidence.inputs.strategyContext.join('\n'),
        preflight_context: evidence.inputs.preflightContext.join('\n'),
        objective_context: evidence.inputs.objectiveContext,
        repo_context: evidence.inputs.repoContext.join('\n'),
        runtime_context: evidence.inputs.runtimeContext.join('\n'),
        task_context: evidence.inputs.taskContext.join('\n'),
        progress_context: evidence.inputs.progressContext.join('\n'),
        prior_iteration_context: evidence.inputs.priorIterationContext.join('\n'),
        operating_rules: evidence.inputs.operatingRules.join('\n'),
        execution_contract: evidence.inputs.executionContract.join('\n'),
        final_response_contract: evidence.inputs.finalResponseContract.join('\n'),
        template_selection_reason: input.selectionReason
    });
    return {
        prompt,
        templatePath,
        evidence
    };
}
//# sourceMappingURL=promptBuilder.js.map