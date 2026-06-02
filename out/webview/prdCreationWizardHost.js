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
exports.PrdCreationWizardHost = void 0;
exports.summarizeWizardPaths = summarizeWizardPaths;
exports.relativeWizardWriteSummary = relativeWizardWriteSummary;
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const MessageBridge_1 = require("./MessageBridge");
const webviewSmokeDiagnostics_1 = require("./webviewSmokeDiagnostics");
const projectGenerator_1 = require("../ralph/projectGenerator");
const taskGenerationReview_1 = require("../ralph/taskGenerationReview");
const prdReadiness_1 = require("../ralph/prdReadiness");
const integrity_1 = require("../ralph/integrity");
function escapeBootstrapJson(value) {
    return JSON.stringify(value)
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/&/g, '\\u0026')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
}
function bootstrapSeedTasks() {
    return [
        {
            id: 'T1',
            title: 'Define project envelope',
            status: 'todo',
            notes: 'Convert the objective into a bounded PRD envelope with conventions, non-goals, and a smallest useful first slice.',
            acceptance: [
                'PRD records project type, scope, non-goals, and implementation conventions',
                'PRD identifies the smallest useful vertical slice'
            ],
            constraints: ['Do not design the full product backlog in this task'],
            context: ['.ralph/prd.md'],
            validation: 'Review .ralph/prd.md for required sections',
            tier: 'simple'
        },
        {
            id: 'T2',
            title: 'Create minimal runnable scaffold',
            status: 'todo',
            dependsOn: ['T1'],
            notes: 'Add only the files and commands needed to run the project shell for the selected stack.',
            acceptance: [
                'Repository has a minimal scaffold that starts or builds with one documented command',
                'No feature behavior beyond the project shell is implemented'
            ],
            constraints: ['Avoid authentication, persistence, deployment, or multiple feature routes'],
            context: ['package.json'],
            validation: 'Run the scaffold start or build command documented in package.json',
            tier: 'medium'
        },
        {
            id: 'T3',
            title: 'Add first smoke test',
            status: 'todo',
            dependsOn: ['T2'],
            notes: 'Create the smallest test that proves the scaffold can start or render its initial shell.',
            acceptance: [
                'A smoke test fails when the scaffold startup path breaks',
                'The smoke test command is documented on the task'
            ],
            constraints: ['Do not broaden into full unit or integration coverage yet'],
            validation: 'Run the smoke test command',
            tier: 'simple'
        },
        {
            id: 'T4',
            title: 'Implement smallest vertical slice',
            status: 'todo',
            dependsOn: ['T3'],
            notes: 'Implement the first user-visible or API-visible behavior identified in the PRD envelope.',
            acceptance: [
                'The smallest PRD slice is usable end to end',
                'Smoke test or focused validation covers the slice'
            ],
            constraints: ['Stop at one vertical slice and leave later capabilities as separate tasks'],
            validation: 'Run the focused slice validation command',
            tier: 'medium'
        }
    ];
}
function bootstrapDocumentationSeedTasks() {
    return [
        {
            id: 'T1',
            title: 'Document the current repository structure and owned surfaces',
            status: 'todo',
            mode: 'documentation',
            acceptance: ['Repository structure documentation names owned source, test, and runtime artifact surfaces'],
            constraints: ['Do not change source behavior'],
            validation: 'Review the generated documentation against the current repository tree',
            tier: 'simple'
        },
        {
            id: 'T2',
            title: 'Document the current workflows, commands, and operational boundaries',
            status: 'todo',
            mode: 'documentation',
            acceptance: ['Workflow documentation lists command entry points and operational boundaries'],
            constraints: ['Do not invent unsupported commands or APIs'],
            validation: 'Review documented commands against package.json and extension contributions',
            tier: 'simple'
        }
    ];
}
const PROJECT_TYPE_OPTIONS = [
    {
        value: 'web-app',
        title: 'Web App',
        description: 'Browser-based product with routed screens, UI flows, and deployed frontends.',
        objectiveExample: 'Build a customer portal that lets operators review task state, inspect provenance, and approve blocked work.',
        objectiveHint: 'Name the primary user, the workflow they need, and the concrete outcome they should reach.'
    },
    {
        value: 'cli-tool',
        title: 'CLI Tool',
        description: 'Command-line utility focused on repeatable local or CI automation.',
        objectiveExample: 'Create a CLI that validates Ralph runtime artifacts, summarizes failures, and exits non-zero on ledger drift.',
        objectiveHint: 'Call out the operator, the input surface, and the deterministic output or exit behavior.'
    },
    {
        value: 'library',
        title: 'Library',
        description: 'Reusable package, SDK, or module intended to be consumed by other code.',
        objectiveExample: 'Ship a TypeScript library that exposes durable task-graph helpers with explicit validation and serialization APIs.',
        objectiveHint: 'Describe the consumer, the API surface they need, and the reliability guarantees the package should provide.'
    },
    {
        value: 'service',
        title: 'Service',
        description: 'Long-running backend, API, worker, or integration service.',
        objectiveExample: 'Implement a service that accepts PRD fragments, produces Ralph task proposals, and stores every run with provenance.',
        objectiveHint: 'Specify the caller, the request/response boundary, and the operational behavior the service must preserve.'
    },
    {
        value: 'data-pipeline',
        title: 'Data Pipeline',
        description: 'Batch or streaming workflow that transforms, validates, or enriches data.',
        objectiveExample: 'Build a pipeline that ingests Codex transcripts, normalizes completion reports, and emits verifier-ready evidence bundles.',
        objectiveHint: 'Define the source data, the transformation, and the artifact or dataset produced at the end.'
    },
    {
        value: 'mobile-app',
        title: 'Mobile App',
        description: 'Native or cross-platform application optimized for handheld interaction.',
        objectiveExample: 'Create a mobile companion that surfaces Ralph status, recent blockers, and approval actions for on-call operators.',
        objectiveHint: 'Describe the user on the move, the decision they need to make quickly, and the moment the app should support.'
    },
    {
        value: 'documentation',
        title: 'Documentation',
        description: 'Document the repository as it exists today without proposing or making code changes.',
        objectiveExample: 'Document the current repository structure, workflows, and operator-facing commands in the format requested by the team.',
        objectiveHint: 'Describe what repo behavior or structure should be documented and what form the resulting documentation should take.'
    },
    {
        value: 'other',
        title: 'Other',
        description: 'Use when the work does not fit the standard product shapes above.',
        objectiveExample: 'Describe the system shape, the operator goal, and the durable outputs Ralph should produce.',
        objectiveHint: 'Be explicit about the domain and success criteria so the generated draft does not have to guess.'
    }
];
const DEFAULT_PROJECT_TYPE = PROJECT_TYPE_OPTIONS[0].value;
function getProjectTypeMeta(projectType) {
    return PROJECT_TYPE_OPTIONS.find((option) => option.value === projectType) ?? PROJECT_TYPE_OPTIONS[0];
}
function coerceProjectType(projectType) {
    return getProjectTypeMeta(projectType ?? DEFAULT_PROJECT_TYPE).value;
}
function buildConstraintSummary(techStack, existingConventions) {
    const sections = [];
    if (techStack.trim()) {
        sections.push('Tech stack:', techStack.trim());
    }
    if (existingConventions.trim()) {
        if (sections.length > 0) {
            sections.push('');
        }
        sections.push('Existing conventions:', existingConventions.trim());
    }
    return sections.join('\n');
}
function createFallbackDraft(projectType, objective, techStack, outOfScope, existingConventions) {
    if (projectType === 'documentation') {
        const constraintSummary = buildConstraintSummary(techStack, existingConventions);
        const lines = [
            '# Repository documentation brief',
            '',
            '## Overview',
            '',
            objective.trim() || 'Describe what should be documented from the current repository state.',
            '',
            '## Documentation Scope',
            '',
            'Document the repository as it exists today. Do not change repo code or behavior; inspect current files, workflows, and operator surfaces only.',
            '',
            '## Constraints',
            '',
            constraintSummary || 'Keep the work documentation-only and grounded in the current repository state.',
            '',
            '## Non-Goals',
            '',
            outOfScope.trim() || 'Do not implement features, refactor code, or propose speculative future-state behavior.',
            '',
            '## Success Criteria',
            '',
            'The resulting PRD and tasks should direct Ralphdex to inspect the repository and produce documentation in the requested format.'
        ];
        return {
            prdText: `${lines.join('\n')}\n`,
            tasks: []
        };
    }
    const constraintSummary = buildConstraintSummary(techStack, existingConventions);
    const objectiveText = objective.trim() || 'Create a bounded, locally verifiable software project from the captured operator objective.';
    const nonGoalText = outOfScope.trim() || 'Do not expand beyond the smallest useful first slice until the initial workflow is validated.';
    const lines = [
        '# Product / project brief',
        '',
        '## Overview',
        '',
        `${objectiveText} This fallback draft was generated locally because the configured provider could not return a draft.`,
        '',
        '## Goals',
        '',
        '- Define the smallest useful first slice.',
        '- Preserve the captured project type, constraints, and repository conventions.',
        '- Keep implementation tasks independently verifiable.',
        '',
        '## Scope',
        '',
        `Project type: ${getProjectTypeMeta(projectType).title}. ${constraintSummary || 'Use the current repository conventions and keep the initial implementation local and testable.'}`,
        '',
        '## Non-Goals',
        '',
        nonGoalText,
        '',
        '## Success Criteria',
        '',
        '- A reviewer can understand the intended first slice from this PRD without chat context.',
        '- Generated tasks can be validated with focused local commands or explicit manual checks.',
        '- Acceptance criteria identify observable behavior rather than broad implementation themes.',
        '',
        '## Initial Work Area',
        '',
        'Turn the captured objective into one small runnable or inspectable workflow. Start with the minimum files and behavior needed to demonstrate the core outcome, then validate that workflow before adding adjacent capabilities.',
        '',
        '## Validation',
        '',
        'Validate the first slice with the repository standard test, build, or review command before marking generated tasks complete.'
    ];
    return {
        prdText: `${lines.join('\n')}\n`,
        tasks: []
    };
}
function mapLegacyInputs(initialConstraints, initialNonGoals) {
    return {
        techStack: initialConstraints ?? '',
        outOfScope: initialNonGoals ?? '',
        existingConventions: ''
    };
}
function createNonce() {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
function normalizeStep(step, mode) {
    if (step === undefined) {
        return mode === 'regenerate' ? 2 : 1;
    }
    switch (step) {
        case 1:
        case 2:
        case 3:
        case 4:
        case 5:
        case 6:
            return step;
        case 7:
            return 6;
    }
}
function createComparisonDraft(prdPreview) {
    return {
        prdText: prdPreview,
        prdHash: (0, integrity_1.hashText)(prdPreview),
        tasks: []
    };
}
function updateDraftTasks(draft, transform) {
    if (!draft) {
        return null;
    }
    return {
        ...draft,
        tasks: transform(draft.tasks)
    };
}
function moveTask(tasks, taskId, direction) {
    const currentIndex = tasks.findIndex((task) => task.id === taskId);
    if (currentIndex < 0) {
        return tasks;
    }
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= tasks.length) {
        return tasks;
    }
    const reordered = [...tasks];
    const [task] = reordered.splice(currentIndex, 1);
    reordered.splice(targetIndex, 0, task);
    return reordered;
}
function partitionTasksForWrite(tasks) {
    const writable = [];
    const dropped = [];
    for (const task of tasks) {
        if (!task.id.trim()) {
            dropped.push({ task, reason: 'missing id' });
            continue;
        }
        if (!task.title.trim()) {
            dropped.push({ task, reason: 'missing title' });
            continue;
        }
        writable.push(task);
    }
    return { writable, dropped };
}
const PLACEHOLDER_PATTERN = /\b(?:tbd|todo|placeholder|lorem ipsum|coming soon|fill in)\b/i;
const VAGUE_WORD_PATTERN = /\b(?:stuff|things|various|misc(?:ellaneous)?|somehow|maybe|soon|improve|better|handle)\b/i;
const TASK_TITLE_STOP_WORDS = new Set(['a', 'an', 'and', 'for', 'in', 'of', 'the', 'to', 'now']);
const TASK_ID_LIKE_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]*$/;
const VALIDATION_COMMAND_PATTERN = /^(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?[A-Za-z0-9:_-]+|^(?:pytest|go\s+test|cargo\s+test|dotnet\s+test|npx|node|python|uv\s+run)\b/i;
const GENERIC_VALIDATION_PATTERN = /^(?:test|check|verify)(?:\s+(?:it|this|works?|behavior))?$/i;
const EPIC_TITLE_PATTERNS = [
    /\bimplement\s+dashboard\b/i,
    /\bimprove\s+ui\s*\/?\s*ux\b/i,
    /\bbuild\s+(?:the\s+)?(?:platform|foundation)\b/i,
    /\bset\s+up\s+infrastructure\b/i,
    /\bimplement\s+authentication\s+and\s+authorization\b/i,
    /\bcreate\s+full\s+workflow\b/i
];
function analyzePrdReviewFindings(prdText) {
    if (!prdText?.trim()) {
        return [{
                kind: 'blocker',
                message: 'PRD review needs draft content before it can assess title, sections, and wording.'
            }];
    }
    const readiness = (0, prdReadiness_1.analyzePrdReadiness)(prdText);
    return [
        ...readiness.blockers.map((message) => ({ kind: 'blocker', message })),
        ...readiness.warnings.map((message) => ({ kind: 'warning', message }))
    ];
}
function normalizeTaskTitle(title) {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((token) => token && !TASK_TITLE_STOP_WORDS.has(token))
        .join(' ');
}
function hasWeakValidationDetail(validation) {
    const text = validation?.trim() ?? '';
    if (!text) {
        return true;
    }
    if (VALIDATION_COMMAND_PATTERN.test(text)) {
        return false;
    }
    return GENERIC_VALIDATION_PATTERN.test(text);
}
function getTaskDependencyDetails(task) {
    const rawDependencies = task.dependsOn ?? task.dependencies;
    if (!Array.isArray(rawDependencies)) {
        return [];
    }
    return rawDependencies
        .map((dependency) => {
        if (typeof dependency === 'string') {
            return dependency;
        }
        if (dependency && typeof dependency === 'object' && 'taskId' in dependency && typeof dependency.taskId === 'string') {
            return dependency.taskId;
        }
        return '';
    })
        .filter((dependency) => dependency.length > 0);
}
function hasWeakDependencyDetail(task) {
    const dependencies = getTaskDependencyDetails(task);
    if (dependencies.length === 0) {
        return false;
    }
    return dependencies.every((dependency) => {
        const detail = dependency.trim();
        if (TASK_ID_LIKE_PATTERN.test(detail)) {
            return false;
        }
        return /\bdepends on\b/i.test(detail) || detail.length < 6;
    });
}
function analyzeTaskReviewFindings(tasks) {
    const findings = [];
    if (tasks.length === 0) {
        findings.push({
            kind: 'blocker',
            message: 'Task review cannot write an empty task list.'
        });
        return findings;
    }
    for (const finding of (0, taskGenerationReview_1.reviewGeneratedTaskShapeDetailed)({ tasks })) {
        findings.push({
            kind: finding.severity === 'blocking' ? 'blocker' : 'warning',
            message: `Task ${finding.taskId} "${finding.taskTitle.trim()}": ${finding.message}`
        });
    }
    const duplicatePairs = new Set();
    for (let index = 0; index < tasks.length; index += 1) {
        const left = tasks[index];
        const leftTitle = left.title.trim();
        if (!left.id.trim()) {
            findings.push({
                kind: 'blocker',
                message: 'Each reviewed task must keep a non-empty id before writing.'
            });
        }
        if (!leftTitle) {
            findings.push({
                kind: 'blocker',
                message: `Task ${left.id || '(missing id)'} must keep a non-empty title before writing.`
            });
            continue;
        }
        if (EPIC_TITLE_PATTERNS.some((pattern) => pattern.test(leftTitle))) {
            findings.push({
                kind: 'blocker',
                message: `Task ${left.id} uses a broad starter title ("${leftTitle}") and must be decomposed.`
            });
        }
        if (leftTitle.split(/\s+/).length < 3 || VAGUE_WORD_PATTERN.test(leftTitle)) {
            findings.push({
                kind: 'warning',
                message: `Task ${left.id} has a vague title: "${leftTitle}".`
            });
        }
        const acceptance = (left.acceptance ?? []).map((entry) => entry.trim()).filter(Boolean);
        if (acceptance.length === 0) {
            findings.push({
                kind: 'blocker',
                message: `Task ${left.id} lacks concrete acceptance criteria.`
            });
        }
        else if (acceptance.every((entry) => entry.split(/\s+/).length < 4 || /(improve|handle|support|works?)/i.test(entry))) {
            findings.push({
                kind: 'blocker',
                message: `Task ${left.id} acceptance criteria are too vague for one-iteration execution.`
            });
        }
        if (hasWeakValidationDetail(left.validation)) {
            findings.push({
                kind: 'warning',
                message: `Task ${left.id} needs stronger validation detail than "${left.validation?.trim() || 'none'}".`
            });
        }
        if (hasWeakDependencyDetail(left)) {
            findings.push({
                kind: 'warning',
                message: `Task ${left.id} needs clearer dependency detail or an explicit "none" note.`
            });
        }
        const leftNormalized = normalizeTaskTitle(leftTitle);
        for (let compareIndex = index + 1; compareIndex < tasks.length; compareIndex += 1) {
            const right = tasks[compareIndex];
            const rightNormalized = normalizeTaskTitle(right.title.trim());
            if (!leftNormalized || !rightNormalized) {
                continue;
            }
            if (leftNormalized === rightNormalized ||
                leftNormalized.includes(rightNormalized) ||
                rightNormalized.includes(leftNormalized)) {
                duplicatePairs.add(`${left.id}/${right.id}`);
            }
        }
    }
    for (const pair of duplicatePairs) {
        const [leftId, rightId] = pair.split('/');
        findings.push({
            kind: 'warning',
            message: `Tasks ${leftId} and ${rightId} have duplicate or near-duplicate titles.`
        });
    }
    return findings;
}
function countChangedLines(currentText, draftText) {
    const currentLines = currentText.split(/\r?\n/);
    const draftLines = draftText.split(/\r?\n/);
    const lineCount = Math.max(currentLines.length, draftLines.length);
    let changed = 0;
    for (let index = 0; index < lineCount; index += 1) {
        if ((currentLines[index] ?? '') !== (draftLines[index] ?? '')) {
            changed += 1;
        }
    }
    return changed;
}
function buildComparisonSummary(mode, currentPrdPreview, draftText) {
    if (mode !== 'regenerate' || !currentPrdPreview) {
        return null;
    }
    if (draftText === null) {
        return 'Current PRD loaded. Generate a new draft to compare changes.';
    }
    if (draftText === currentPrdPreview) {
        return 'Draft matches the current PRD.';
    }
    const changedLines = countChangedLines(currentPrdPreview, draftText);
    return `${changedLines} changed lines vs current PRD.`;
}
class PrdCreationWizardHost {
    bridge;
    options;
    state;
    isDisposed = false;
    constructor(options) {
        this.options = {
            initialMode: options.initialMode,
            initialPaths: options.initialPaths,
            initialProjectType: options.initialProjectType,
            initialObjective: options.initialObjective,
            initialConstraints: options.initialConstraints,
            initialNonGoals: options.initialNonGoals,
            initialStep: options.initialStep,
            initialPrdPreview: options.initialPrdPreview,
            generatePrdDraft: options.generatePrdDraft,
            generateTasks: options.generateTasks,
            writeDraft: options.writeDraft,
            onWriteComplete: options.onWriteComplete
        };
        this.bridge = new MessageBridge_1.MessageBridge(options.webview);
        this.state = this.buildInitialState();
        options.webview.html = renderWizardHtml(createNonce(), options.webview, this.state);
        this.bridge.onMessage((message) => {
            void this.handleMessage(message);
        });
        this.emitState();
    }
    replaceContext(context) {
        const currentPrdPreview = context.initialPrdPreview ?? this.state.currentPrdPreview;
        const nextMode = context.initialMode ?? this.state.mode;
        this.state = {
            ...this.state,
            mode: nextMode,
            step: normalizeStep(context.initialStep, nextMode),
            projectType: context.initialProjectType ? coerceProjectType(context.initialProjectType) : this.state.projectType,
            objective: context.initialObjective ?? this.state.objective,
            ...(context.initialConstraints !== undefined || context.initialNonGoals !== undefined
                ? mapLegacyInputs(context.initialConstraints, context.initialNonGoals)
                : {
                    techStack: this.state.techStack,
                    outOfScope: this.state.outOfScope,
                    existingConventions: this.state.existingConventions
                }),
            draft: context.initialPrdPreview !== undefined
                ? createComparisonDraft(context.initialPrdPreview)
                : (nextMode === 'regenerate' && currentPrdPreview && !this.state.draft
                    ? createComparisonDraft(currentPrdPreview)
                    : this.state.draft),
            currentPrdPreview,
            paths: context.initialPaths ?? this.state.paths,
            generationState: context.initialPrdPreview !== undefined ? 'idle' : this.state.generationState,
            generationMessage: context.initialPrdPreview !== undefined ? null : this.state.generationMessage,
            prdReadiness: context.initialPrdPreview !== undefined ? null : this.state.prdReadiness,
            taskGenerationStatus: context.initialPrdPreview !== undefined ? 'idle' : this.state.taskGenerationStatus,
            taskGenerationMessage: context.initialPrdPreview !== undefined ? null : this.state.taskGenerationMessage,
            tasksStale: context.initialPrdPreview !== undefined ? true : this.state.tasksStale,
            operationStatus: context.initialPrdPreview !== undefined ? 'idle' : this.state.operationStatus,
            operationMessage: context.initialPrdPreview !== undefined ? null : this.state.operationMessage,
            warning: null,
            error: null,
            writeSummary: null
        };
        this.emitState();
    }
    dispose() {
        if (this.isDisposed) {
            return;
        }
        this.isDisposed = true;
        this.bridge.dispose();
    }
    buildInitialState() {
        const mode = this.options.initialMode;
        const structuredInputs = mapLegacyInputs(this.options.initialConstraints, this.options.initialNonGoals);
        return {
            mode,
            step: normalizeStep(this.options.initialStep, mode),
            projectType: coerceProjectType(this.options.initialProjectType),
            objective: this.options.initialObjective ?? '',
            ...structuredInputs,
            draft: this.options.initialPrdPreview
                ? createComparisonDraft(this.options.initialPrdPreview)
                : null,
            prdReadiness: null,
            taskGenerationStatus: 'idle',
            taskGenerationMessage: null,
            tasksStale: true,
            generationState: 'idle',
            generationMessage: null,
            operationStatus: 'idle',
            operationMessage: null,
            warning: null,
            error: null,
            currentPrdPreview: this.options.initialPrdPreview ?? null,
            writeSummary: null,
            paths: this.options.initialPaths
        };
    }
    emitState() {
        const prdReadiness = this.state.draft?.prdText?.trim()
            ? (0, prdReadiness_1.analyzePrdReadiness)(this.state.draft.prdText)
            : null;
        const prdReviewFindings = analyzePrdReviewFindings(this.state.draft?.prdText ?? null);
        const taskReviewFindings = analyzeTaskReviewFindings(this.state.draft?.tasks ?? []);
        this.bridge.send({
            type: 'state',
            state: {
                ...this.state,
                prdReadiness,
                prdReviewFindings,
                taskReviewFindings,
                comparisonSummary: buildComparisonSummary(this.state.mode, this.state.currentPrdPreview, this.state.draft?.prdText ?? null)
            }
        });
    }
    async handleMessage(message) {
        if (message.type === 'webview-ready') {
            webviewSmokeDiagnostics_1.activationSmokeDiagnostics.recordReady('prd-wizard', message);
            return;
        }
        switch (message.type) {
            case 'set-step':
                this.state = { ...this.state, step: message.step, warning: null, error: null };
                this.emitState();
                return;
            case 'update-field':
                this.state = {
                    ...this.state,
                    [message.field]: message.value,
                    warning: null,
                    error: null
                };
                this.emitState();
                return;
            case 'update-draft-prd-text':
                {
                    const nextPrdText = message.value;
                    const nextPrdHash = nextPrdText.trim() ? (0, integrity_1.hashText)(nextPrdText) : undefined;
                    const existingPrdHash = this.state.draft?.prdHash;
                    const shouldMarkTasksStale = Boolean(this.state.draft?.tasks.length
                        && existingPrdHash
                        && nextPrdHash
                        && existingPrdHash !== nextPrdHash);
                    this.state = {
                        ...this.state,
                        draft: this.state.draft
                            ? {
                                ...this.state.draft,
                                prdText: nextPrdText,
                                ...(nextPrdHash ? { prdHash: nextPrdHash } : {}),
                                ...(shouldMarkTasksStale
                                    ? {
                                        taskGenerationPlan: undefined
                                    }
                                    : {})
                            }
                            : {
                                prdText: nextPrdText,
                                ...(nextPrdHash ? { prdHash: nextPrdHash } : {}),
                                tasks: []
                            },
                        ...(shouldMarkTasksStale
                            ? {
                                tasksStale: true,
                                taskGenerationStatus: 'idle',
                                taskGenerationMessage: 'PRD changed after task generation. Regenerate tasks before writing.'
                            }
                            : {}),
                        warning: null,
                        error: null
                    };
                    this.emitState();
                    return;
                }
            case 'update-task-title':
                this.state = {
                    ...this.state,
                    draft: updateDraftTask(this.state.draft, message.taskId, (task) => ({ ...task, title: message.title })),
                    taskGenerationStatus: this.state.taskGenerationStatus === 'generated' ? 'weak' : this.state.taskGenerationStatus,
                    warning: null,
                    error: null
                };
                this.emitState();
                return;
            case 'update-task-dependencies':
                this.state = {
                    ...this.state,
                    draft: updateDraftTask(this.state.draft, message.taskId, (task) => ({
                        ...task,
                        dependsOn: parseMultilineList(message.value)
                    })),
                    taskGenerationStatus: this.state.taskGenerationStatus === 'generated' ? 'weak' : this.state.taskGenerationStatus,
                    warning: null,
                    error: null
                };
                this.emitState();
                return;
            case 'update-task-notes':
                this.state = {
                    ...this.state,
                    draft: updateDraftTask(this.state.draft, message.taskId, (task) => ({
                        ...task,
                        notes: message.value
                    })),
                    taskGenerationStatus: this.state.taskGenerationStatus === 'generated' ? 'weak' : this.state.taskGenerationStatus,
                    warning: null,
                    error: null
                };
                this.emitState();
                return;
            case 'update-task-acceptance':
                this.state = {
                    ...this.state,
                    draft: updateDraftTask(this.state.draft, message.taskId, (task) => ({
                        ...task,
                        acceptance: parseMultilineList(message.value)
                    })),
                    taskGenerationStatus: this.state.taskGenerationStatus === 'generated' ? 'weak' : this.state.taskGenerationStatus,
                    warning: null,
                    error: null
                };
                this.emitState();
                return;
            case 'update-task-tier':
                this.state = {
                    ...this.state,
                    draft: updateDraftTasks(this.state.draft, (tasks) => tasks.map((task) => (task.id === message.taskId
                        ? { ...task, ...(message.tier ? { tier: message.tier } : { tier: undefined }) }
                        : task))),
                    taskGenerationStatus: this.state.taskGenerationStatus === 'generated' ? 'weak' : this.state.taskGenerationStatus,
                    warning: null,
                    error: null
                };
                this.emitState();
                return;
            case 'move-task':
                this.state = {
                    ...this.state,
                    draft: updateDraftTasks(this.state.draft, (tasks) => moveTask(tasks, message.taskId, message.direction)),
                    taskGenerationStatus: this.state.taskGenerationStatus === 'generated' ? 'weak' : this.state.taskGenerationStatus,
                    warning: null,
                    error: null
                };
                this.emitState();
                return;
            case 'delete-task':
                this.state = {
                    ...this.state,
                    draft: updateDraftTasks(this.state.draft, (tasks) => tasks.filter((task) => task.id !== message.taskId)),
                    taskGenerationStatus: this.state.taskGenerationStatus === 'generated' ? 'weak' : this.state.taskGenerationStatus,
                    warning: null,
                    error: null
                };
                this.emitState();
                return;
            case 'generate-prd-draft':
                await this.generatePrdDraft();
                return;
            case 'generate-tasks':
                await this.generateTasks();
                return;
            case 'confirm-write':
                await this.confirmWrite();
                return;
        }
    }
    async generatePrdDraft() {
        const objective = this.state.objective.trim();
        if (!objective) {
            this.state = { ...this.state, error: 'Add an objective or existing PRD text before generating a draft.' };
            this.emitState();
            return;
        }
        this.bridge.send({ type: 'busy', value: true });
        this.state = {
            ...this.state,
            operationStatus: 'running',
            operationMessage: 'Draft generation started. Waiting for provider response.',
            warning: null,
            error: null,
            writeSummary: null
        };
        this.emitState();
        try {
            const generated = await this.options.generatePrdDraft({
                mode: this.state.mode,
                projectType: this.state.projectType,
                objective: this.state.objective,
                constraints: buildConstraintSummary(this.state.techStack, this.state.existingConventions),
                nonGoals: this.state.outOfScope
            });
            const prdHash = (0, integrity_1.hashText)(generated.prdText);
            this.state = {
                ...this.state,
                step: 3,
                draft: {
                    prdText: generated.prdText,
                    prdHash,
                    tasks: [],
                    taskGenerationPlan: undefined
                },
                tasksStale: true,
                taskGenerationStatus: 'idle',
                taskGenerationMessage: null,
                generationState: generated.generationWarnings?.length ? 'weak' : 'generated',
                generationMessage: generated.generationWarnings?.join(' ') ?? 'Provider-backed PRD draft generated successfully.',
                operationStatus: 'succeeded',
                operationMessage: 'Draft generation completed.',
                warning: null,
                error: null,
                writeSummary: null
            };
        }
        catch (error) {
            const reason = error instanceof projectGenerator_1.ProjectGenerationError || error instanceof Error
                ? error.message
                : String(error);
            this.state = {
                ...this.state,
                step: 3,
                draft: createFallbackDraft(this.state.projectType, this.state.objective, this.state.techStack, this.state.outOfScope, this.state.existingConventions),
                tasksStale: true,
                taskGenerationStatus: 'idle',
                taskGenerationMessage: 'Fallback PRD generated. Review findings, edit as needed, then generate tasks.',
                generationState: 'fallback',
                generationMessage: `Generation fell back to a bootstrap draft. ${reason}`,
                operationStatus: 'succeeded',
                operationMessage: `Fallback draft generated after provider failure. ${reason}`,
                warning: null,
                error: null,
                writeSummary: null
            };
        }
        finally {
            this.bridge.send({ type: 'busy', value: false });
            this.emitState();
        }
    }
    async generateTasks() {
        const prdText = this.state.draft?.prdText?.trim() ?? '';
        if (!prdText) {
            this.state = { ...this.state, error: 'Generate and review a PRD draft before generating tasks.' };
            this.emitState();
            return;
        }
        const readiness = (0, prdReadiness_1.analyzePrdReadiness)(prdText);
        const readinessGuidance = readiness.blockers.length > 0
            ? `PRD readiness has blockers — task generation will proceed but the results may need rework. ${readiness.blockers[0]}`
            : null;
        this.bridge.send({ type: 'busy', value: true });
        this.state = {
            ...this.state,
            operationStatus: 'running',
            operationMessage: readinessGuidance
                ? `Task generation started despite PRD readiness blockers. ${readiness.blockers[0]}`
                : 'Task generation started from approved PRD.',
            warning: readinessGuidance,
            error: null
        };
        this.emitState();
        try {
            const prdHash = this.state.draft?.prdHash ?? (0, integrity_1.hashText)(prdText);
            const generated = await this.options.generateTasks({
                prdText,
                prdHash,
                projectType: this.state.projectType,
                constraints: buildConstraintSummary(this.state.techStack, this.state.existingConventions)
            });
            this.state = {
                ...this.state,
                step: 5,
                draft: this.state.draft
                    ? {
                        ...this.state.draft,
                        prdHash,
                        tasks: generated.tasks,
                        taskGenerationPlan: generated.planArtifact
                    }
                    : {
                        prdText,
                        prdHash,
                        tasks: generated.tasks,
                        taskGenerationPlan: generated.planArtifact
                    },
                tasksStale: false,
                taskGenerationStatus: generated.taskCountWarning ? 'weak' : 'generated',
                taskGenerationMessage: generated.taskCountWarning ?? 'Tasks generated from reviewed PRD.',
                operationStatus: 'succeeded',
                operationMessage: readinessGuidance
                    ? `Task generation completed despite PRD readiness blockers. ${readiness.blockers[0]}`
                    : 'Task generation completed.',
                warning: readinessGuidance,
                error: null
            };
        }
        catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            this.state = {
                ...this.state,
                taskGenerationStatus: 'idle',
                taskGenerationMessage: `Task generation failed. ${reason}`,
                operationStatus: 'failed',
                operationMessage: `Task generation failed. ${reason}`,
                warning: null,
                error: null
            };
        }
        finally {
            this.bridge.send({ type: 'busy', value: false });
            this.emitState();
        }
    }
    async confirmWrite() {
        if (!this.state.draft) {
            this.state = { ...this.state, error: 'Generate a draft before writing files.' };
            this.emitState();
            return;
        }
        const draft = this.state.draft;
        const guidance = [];
        const readiness = (0, prdReadiness_1.analyzePrdReadiness)(draft.prdText);
        for (const blocker of readiness.blockers) {
            guidance.push(`PRD readiness: ${blocker}`);
        }
        if (this.state.tasksStale) {
            guidance.push('Tasks are stale because PRD text changed after task generation. The previously generated tasks will be written as-is unless you regenerate them first.');
        }
        const partition = partitionTasksForWrite(draft.tasks);
        for (const drop of partition.dropped) {
            const label = drop.task.id.trim() || drop.task.title.trim() || '(unnamed)';
            guidance.push(`Skipped task "${label}" (${drop.reason}); fix or remove it to include it in tasks.json.`);
        }
        const taskBlockers = analyzeTaskReviewFindings(partition.writable).filter((finding) => finding.kind === 'blocker');
        for (const blocker of taskBlockers) {
            guidance.push(`Task readiness: ${blocker.message}`);
        }
        if (partition.writable.length === 0 && draft.tasks.length > 0) {
            guidance.push('No tasks had a non-empty id and title; tasks.json will not be rewritten.');
        }
        else if (partition.writable.length === 0) {
            guidance.push('No tasks generated yet; tasks.json will be left untouched and only prd.md will be written.');
        }
        const draftToWrite = {
            ...draft,
            tasks: partition.writable
        };
        this.bridge.send({ type: 'busy', value: true });
        const guidancePrefix = guidance.length > 0 ? `${guidance.length} guidance item(s); ` : '';
        this.state = {
            ...this.state,
            operationStatus: 'running',
            operationMessage: `${guidancePrefix}File write started.`,
            warning: guidance.length > 0 ? guidance.join('\n') : null,
            error: null
        };
        this.emitState();
        try {
            const result = await this.options.writeDraft(draftToWrite);
            const writtenCount = result.filesWritten.length;
            const summaryLine = writtenCount === 0
                ? 'No files written.'
                : `Wrote ${writtenCount} file(s): ${result.filesWritten.join(', ')}.`;
            this.state = {
                ...this.state,
                step: 6,
                warning: guidance.length > 0 ? guidance.join('\n') : null,
                error: null,
                writeSummary: result,
                operationStatus: 'succeeded',
                operationMessage: guidance.length > 0
                    ? `${summaryLine} ${guidance.length} guidance item(s) recorded.`
                    : summaryLine
            };
            this.emitState();
            await this.options.onWriteComplete?.(result);
        }
        catch (error) {
            this.state = {
                ...this.state,
                operationStatus: 'failed',
                operationMessage: `File write failed. ${error instanceof Error ? error.message : String(error)}`,
                error: error instanceof Error ? error.message : String(error)
            };
            this.emitState();
        }
        finally {
            this.bridge.send({ type: 'busy', value: false });
        }
    }
}
exports.PrdCreationWizardHost = PrdCreationWizardHost;
function renderWizardHtml(nonce, webview, state) {
    const scriptPath = vscode.Uri.file(path.join(__dirname, '..', 'webview-ui', 'main.js'));
    const stylePath = vscode.Uri.file(path.join(__dirname, '..', 'webview-ui', 'main.css'));
    const scriptUri = webview.asWebviewUri(scriptPath);
    const styleUri = webview.asWebviewUri(stylePath);
    const bootstrap = escapeBootstrapJson({
        mode: 'prd-wizard',
        state
    });
    const csp = [
        "default-src 'none'",
        `img-src ${webview.cspSource} data:`,
        `font-src ${webview.cspSource}`,
        `style-src ${webview.cspSource} 'nonce-${nonce}'`,
        `script-src 'nonce-${nonce}'`
    ].join('; ');
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PRD Creation Wizard</title>
  <link nonce="${nonce}" rel="stylesheet" href="${styleUri.toString()}">
</head>
<body>
  <div id="root" data-ralph-mode="prd-wizard">Loading PRD Creation Wizard...</div>
  <script id="ralph-webview-bootstrap" type="application/json" nonce="${nonce}">${bootstrap}</script>
  <script nonce="${nonce}" src="${scriptUri.toString()}" defer></script>
</body>
</html>`;
}
function summarizeWizardPaths(paths) {
    return {
        'PRD path': paths.prdPath,
        'Task path': paths.tasksPath
    };
}
function relativeWizardWriteSummary(rootPath, result) {
    return {
        filesWritten: result.filesWritten.map((target) => path.relative(rootPath, target) || path.basename(target))
    };
}
function updateDraftTask(draft, taskId, transform) {
    return updateDraftTasks(draft, (tasks) => tasks.map((task) => (task.id === taskId ? transform(task) : task)));
}
function parseMultilineList(value) {
    return value
        .split(/\r?\n|,/)
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
}
//# sourceMappingURL=prdCreationWizardHost.js.map