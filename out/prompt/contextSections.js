"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.collectTaskLocalCodeContext = collectTaskLocalCodeContext;
exports.buildStrategyContext = buildStrategyContext;
exports.buildTaskContext = buildTaskContext;
const taskFile_1 = require("../ralph/taskFile");
const promptText_1 = require("./promptText");
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
    return (0, promptText_1.compactList)(children.map((child) => `${child.id} (${child.status})`), 4);
}
function formatListOrNone(values) {
    return values.length > 0 ? (0, promptText_1.compactList)(values, 6) : 'none';
}
function collectTaskLocalCodeContext(selectedTask, _state) {
    if (!selectedTask) {
        return [];
    }
    return Array.from(new Set(selectedTask.context ?? []));
}
function buildPlannerTaskContext(input, baseLines, remainingChildren) {
    const { selectedTask, taskFile } = input;
    if (!selectedTask) {
        return baseLines;
    }
    return [
        ...baseLines,
        `- Selected task id: ${selectedTask.id}`,
        `- Title: ${selectedTask.title}`,
        `- Status: ${selectedTask.status}`,
        `- Parent task: ${selectedTask.parentId ?? 'none'}`,
        `- Dependencies: ${taskDependencySummary(taskFile, selectedTask)}`,
        `- Direct children: ${childTaskSummary(taskFile, selectedTask)}`,
        `- Remaining descendants: ${remainingChildren.length > 0 ? (0, promptText_1.compactList)(remainingChildren, 4) : 'none'}`,
        `- Acceptance criteria: ${selectedTask.acceptance ? selectedTask.acceptance.map((item, index) => `(${index + 1}) ${item}`).join(' ') : 'none'}`,
        `- Constraints: ${selectedTask.constraints ? selectedTask.constraints.map((item, index) => `(${index + 1}) ${item}`).join(' ') : 'none'}`
    ];
}
function buildImplementerTaskContext(input, baseLines, remainingChildren) {
    const { selectedTask } = input;
    if (!selectedTask) {
        return baseLines;
    }
    const taskLocalCodeContext = collectTaskLocalCodeContext(selectedTask, input.state);
    return [
        ...baseLines,
        `- Selected task id: ${selectedTask.id}`,
        `- Title: ${selectedTask.title}`,
        `- Status: ${selectedTask.status}`,
        `- Parent task: ${selectedTask.parentId ?? 'none'}`,
        `- Dependencies: ${taskDependencySummary(input.taskFile, selectedTask)}`,
        `- Direct children: ${childTaskSummary(input.taskFile, selectedTask)}`,
        `- Remaining descendants: ${remainingChildren.length > 0 ? (0, promptText_1.compactList)(remainingChildren, 4) : 'none'}`,
        `- Task validation hint: ${input.taskValidationHint ?? selectedTask.validation ?? 'none'}`,
        `- Effective validation command: ${input.effectiveValidationCommand ?? input.validationCommand ?? 'none detected'}`,
        `- Validation command normalized from: ${input.normalizedValidationCommandFrom ?? 'none'}`,
        `- Notes: ${selectedTask.notes ?? 'none'}`,
        `- Blocker: ${selectedTask.blocker ?? 'none'}`,
        `- Acceptance criteria: ${selectedTask.acceptance ? selectedTask.acceptance.map((item, index) => `(${index + 1}) ${item}`).join(' ') : 'none'}`,
        `- Constraints: ${selectedTask.constraints ? selectedTask.constraints.map((item, index) => `(${index + 1}) ${item}`).join(' ') : 'none'}`,
        `- Relevant files: ${selectedTask.context ? selectedTask.context.join(', ') : 'none'}`,
        ...(taskLocalCodeContext.length > 0
            ? [`- Task-local code context: ${formatListOrNone(taskLocalCodeContext)}`]
            : [])
    ];
}
function buildReviewerTaskContext(input, _baseLines) {
    const { selectedTask } = input;
    if (!selectedTask) {
        return _baseLines;
    }
    const prior = input.state.lastIteration;
    const relevantChangedFiles = prior?.diffSummary?.relevantChangedFiles ?? [];
    const verifierStatuses = prior?.verification.verifiers.map((verifier) => `${verifier.verifier}=${verifier.status}`) ?? [];
    return [
        `- Selected task id: ${selectedTask.id}`,
        `- Title: ${selectedTask.title}`,
        `- Status: ${selectedTask.status}`,
        `- Acceptance criteria: ${selectedTask.acceptance ? selectedTask.acceptance.map((item, index) => `(${index + 1}) ${item}`).join(' ') : 'none'}`,
        `- Review diff summary: ${prior?.diffSummary?.summary ?? 'none'}`,
        `- Review relevant changed files: ${formatListOrNone(relevantChangedFiles)}`,
        `- Prior verifier statuses: ${formatListOrNone(verifierStatuses)}`,
        `- Prior validation failure signature: ${(0, promptText_1.formatOptional)(prior?.verification.validationFailureSignature)}`
    ];
}
function buildScmTaskContext(input, _baseLines) {
    const { selectedTask, selectedTaskClaim } = input;
    if (!selectedTask) {
        return _baseLines;
    }
    return [
        `- Selected task id: ${selectedTask.id}`,
        `- Title: ${selectedTask.title}`,
        `- Base branch: ${selectedTaskClaim?.claim.baseBranch ?? 'none'}`,
        `- Integration branch: ${selectedTaskClaim?.claim.integrationBranch ?? 'none'}`,
        `- Feature branch: ${selectedTaskClaim?.claim.featureBranch ?? 'none'}`,
        `- Merge / PR metadata only: use branch and conflict state, not implementation context.`
    ];
}
function buildStrategyContext(target, kind, agentRole, taskLedgerDriftMessages = []) {
    if (agentRole === 'planner') {
        return [
            `- Target: ${target === 'cliExec' ? 'Codex CLI planning execution via `codex exec`.' : 'manual Codex IDE planning handoff.'}`,
            '- Operate in planning-only mode. Do not implement code changes.',
            '- Analyse the selected task, break it into sub-steps if needed, and write a `task-plan.json` artifact.',
            '- End with a completion report containing `proposedPlan`.'
        ];
    }
    if (agentRole === 'reviewer') {
        return [
            `- Target: ${target === 'cliExec' ? 'Codex CLI review execution via `codex exec`.' : 'manual Codex IDE review handoff.'}`,
            '- Operate in review-only mode. Do not implement code changes.',
            '- Inspect the done task\'s artifacts, validation history, and changed files for quality issues.',
            '- End with a completion report containing `reviewOutcome` and `reviewNotes`.'
        ];
    }
    if (agentRole === 'review') {
        return target === 'cliExec'
            ? [
                '- Target: Codex CLI review execution via `codex exec`.',
                '- Operate in review-only mode. Do not make code changes or edit durable Ralph files.',
                '- Run the selected validation command when available, then inspect the changed files since the last completed task.',
                '- Report missing test coverage, documentation gaps, or invariant violations as follow-up tasks in `suggestedChildTasks` instead of implementing fixes.'
            ]
            : [
                '- Target: manual Codex IDE review handoff via clipboard plus VS Code commands.',
                '- Stay review-only. Do not make code changes or mutate durable Ralph files during this review pass.',
                '- Validate first when practical, then inspect the changed files since the last completed task.',
                '- Surface missing test coverage, documentation gaps, or invariant violations as proposed follow-up tasks instead of implementation work.'
            ];
    }
    if (target === 'cliExec') {
        if (kind === 'replenish-backlog') {
            const backlogStateLine = taskLedgerDriftMessages.length > 0
                ? '- The task ledger is inconsistent; repair `.ralph/tasks.json` before treating this as clean backlog exhaustion.'
                : '- The current durable Ralph backlog is exhausted; this run should replenish `.ralph/tasks.json`, not start broad feature work.';
            return [
                '- Target: Codex CLI execution via `codex exec`.',
                backlogStateLine,
                '- Generate only the next coherent task slice grounded in the PRD, repo state, and recent durable progress.',
                '- Leave the task file explicit, flat, version 2, and immediately actionable.'
            ];
        }
        return [
            '- Target: Codex CLI execution via `codex exec`.',
            '- Operate autonomously inside the repository. Do not rely on interactive clarification to make forward progress.',
            '- Keep command usage deterministic and concise because Ralph will persist transcripts, verifier output, and stop signals.',
            kind === 'human-review-handoff'
                ? '- This prompt follows a human-review signal. If the blocker is still real, preserve it cleanly instead of masking it with speculative edits.'
                : '- End with a compact change summary Ralph can pair with verifier evidence.'
        ];
    }
    if (kind === 'replenish-backlog') {
        return [
            '- Target: manual Codex IDE handoff via clipboard plus VS Code commands.',
            '- The current durable Ralph backlog is exhausted; use this prompt to replenish `.ralph/tasks.json` from durable repo state.',
            '- Add only explicit next tasks and keep the file flat, inspectable, and version 2.',
            '- Make the next actionable task obvious for the following Ralph iteration.'
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
function buildTaskContext(input) {
    const { kind, taskFile, taskCounts, selectedTask, preflightReport } = input;
    const nextActionable = (0, taskFile_1.selectNextTask)(taskFile);
    const taskGraphErrors = preflightReport.diagnostics.filter((diagnostic) => (diagnostic.category === 'taskGraph' && diagnostic.severity === 'error'));
    const taskLedgerDriftMessages = taskGraphErrors
        .slice(0, 2)
        .map((diagnostic) => diagnostic.message);
    const baseLines = [
        `- Backlog counts: todo ${taskCounts.todo}, in_progress ${taskCounts.in_progress}, blocked ${taskCounts.blocked}, done ${taskCounts.done}`,
        `- Next actionable task: ${nextActionable ? `${nextActionable.id} (${nextActionable.status})` : 'none'}`
    ];
    if (kind === 'replenish-backlog') {
        const driftLines = taskLedgerDriftMessages.length > 0
            ? [
                '- The durable task ledger is inconsistent. Do not treat this as clean backlog exhaustion.',
                ...taskLedgerDriftMessages.map((message) => `- Task-ledger drift: ${message}`),
                '- Repair the task-ledger drift in `.ralph/tasks.json` before adding new follow-up tasks.'
            ]
            : [
                '- The actionable backlog is exhausted. Create the next coherent Ralph tasks directly in `.ralph/tasks.json`.'
            ];
        return [
            ...baseLines,
            ...driftLines,
            '- Preserve done-task history and keep the task file at version 2 with explicit `id`, `title`, `status`, and optional `acceptance` (string[]), `parentId`, `dependsOn`, `notes`, and `validation`.',
            '- Do not duplicate already-completed work or mark speculative tasks done.',
            '- Leave at least one actionable `todo` or `in_progress` task when the repo state supports it.',
            `- Validation command: ${input.effectiveValidationCommand ?? input.validationCommand ?? 'none selected for backlog replenishment'}`
        ];
    }
    if (!selectedTask) {
        if (taskLedgerDriftMessages.length > 0) {
            return [
                ...baseLines,
                '- No actionable Ralph task was selected because the durable task ledger is inconsistent.',
                ...taskLedgerDriftMessages.map((message) => `- Task-ledger drift: ${message}`),
                '- Repair the task-ledger drift instead of inventing a new task.'
            ];
        }
        return [
            ...baseLines,
            '- No actionable Ralph task was selected.',
            '- Do not invent a task. Stop and explain why the loop cannot continue safely.'
        ];
    }
    const remainingChildren = (0, taskFile_1.remainingSubtasks)(taskFile, selectedTask.id)
        .map((task) => `${task.id} (${task.status})`);
    switch ((0, promptText_1.roleContextProfile)(input.agentRole)) {
        case 'planner':
            return buildPlannerTaskContext(input, baseLines, remainingChildren);
        case 'reviewer':
            return buildReviewerTaskContext(input, baseLines);
        case 'scm':
            return buildScmTaskContext(input, baseLines);
        default:
            return buildImplementerTaskContext(input, baseLines, remainingChildren);
    }
}
//# sourceMappingURL=contextSections.js.map