import * as path from 'path';
import * as vscode from 'vscode';
import { MessageBridge } from './MessageBridge';
import { SHARED_WEBVIEW_CSS } from './styles';
import { ProjectGenerationError } from '../ralph/projectGenerator';
import type { RalphTaskStatus } from '../ralph/types';
import type { RalphNewTaskInput } from '../ralph/taskNormalization';
import { reviewGeneratedTaskShapeDetailed } from '../ralph/taskGenerationReview';
import {
  analyzePrdReadiness,
  type PrdReadinessResult,
  type TaskGenerationPlanArtifact
} from '../ralph/prdReadiness';
import { hashText } from '../ralph/integrity';
import { buildBaseCss } from '../ui/htmlHelpers';

export type PrdWizardMode = 'new' | 'regenerate';
export type PrdWizardStep = 1 | 2 | 3 | 4 | 5 | 6;
type PrdWizardLegacyStep = PrdWizardStep | 7;

export interface PrdWizardTaskDraft extends RalphNewTaskInput {
  status: RalphTaskStatus;
}

export interface PrdWizardPrdGenerateResult {
  prdText: string;
  generationWarnings?: string[];
}

export interface PrdWizardTaskGenerateResult {
  tasks: PrdWizardTaskDraft[];
  taskCountWarning?: string;
  planArtifact: TaskGenerationPlanArtifact;
}

export interface PrdWizardDraftBundle {
  prdText: string;
  tasks: PrdWizardTaskDraft[];
  prdHash?: string;
  taskGenerationPlan?: TaskGenerationPlanArtifact;
}

export interface PrdWizardWriteResult {
  filesWritten: string[];
}

export interface PrdWizardPaths {
  prdPath: string;
  tasksPath: string;
}

export interface PrdCreationWizardHostOptions {
  webview: vscode.Webview;
  initialMode: PrdWizardMode;
  initialPaths: PrdWizardPaths;
  initialProjectType?: string;
  initialObjective?: string;
  initialConstraints?: string;
  initialNonGoals?: string;
  initialStep?: PrdWizardLegacyStep;
  initialPrdPreview?: string;
  generatePrdDraft: (input: {
    mode: PrdWizardMode;
    projectType: string;
    objective: string;
    constraints: string;
    nonGoals: string;
  }) => Promise<PrdWizardPrdGenerateResult>;
  generateTasks: (input: {
    prdText: string;
    prdHash: string;
    projectType: string;
    constraints: string;
  }) => Promise<PrdWizardTaskGenerateResult>;
  writeDraft: (draft: PrdWizardDraftBundle) => Promise<PrdWizardWriteResult>;
  onWriteComplete?: (result: PrdWizardWriteResult) => Promise<void>;
}

type StructuredField = 'projectType' | 'objective' | 'techStack' | 'outOfScope' | 'existingConventions';

type WizardInboundMessage =
  | { type: 'set-step'; step: PrdWizardStep }
  | { type: 'update-field'; field: StructuredField; value: string }
  | { type: 'update-draft-prd-text'; value: string }
  | { type: 'update-task-title'; taskId: string; title: string }
  | { type: 'update-task-dependencies'; taskId: string; value: string }
  | { type: 'update-task-notes'; taskId: string; value: string }
  | { type: 'update-task-acceptance'; taskId: string; value: string }
  | { type: 'update-task-tier'; taskId: string; tier: '' | 'simple' | 'medium' | 'complex' }
  | { type: 'move-task'; taskId: string; direction: 'up' | 'down' }
  | { type: 'delete-task'; taskId: string }
  | { type: 'generate-prd-draft' }
  | { type: 'generate-tasks' }
  | { type: 'confirm-write' };

type WizardOutboundMessage =
  | { type: 'state'; state: WizardState }
  | { type: 'busy'; value: boolean };

interface ReviewFinding {
  kind: 'warning' | 'blocker';
  message: string;
}

type GenerationState = 'idle' | 'generated' | 'weak' | 'fallback';
type OperationStatus = 'idle' | 'running' | 'succeeded' | 'failed';
type TaskGenerationStatus = 'idle' | 'generated' | 'weak';

interface WizardState {
  mode: PrdWizardMode;
  step: PrdWizardStep;
  projectType: string;
  objective: string;
  techStack: string;
  outOfScope: string;
  existingConventions: string;
  draft: PrdWizardDraftBundle | null;
  prdReadiness: PrdReadinessResult | null;
  taskGenerationStatus: TaskGenerationStatus;
  taskGenerationMessage: string | null;
  tasksStale: boolean;
  generationState: GenerationState;
  generationMessage: string | null;
  operationStatus: OperationStatus;
  operationMessage: string | null;
  warning: string | null;
  error: string | null;
  currentPrdPreview: string | null;
  comparisonSummary?: string | null;
  prdReviewFindings?: ReviewFinding[];
  taskReviewFindings?: ReviewFinding[];
  writeSummary: PrdWizardWriteResult | null;
  paths: PrdWizardPaths;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function bootstrapSeedTasks(): PrdWizardTaskDraft[] {
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

function bootstrapDocumentationSeedTasks(): PrdWizardTaskDraft[] {
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
] as const;

const DEFAULT_PROJECT_TYPE = PROJECT_TYPE_OPTIONS[0].value;

function getProjectTypeMeta(projectType: string) {
  return PROJECT_TYPE_OPTIONS.find((option) => option.value === projectType) ?? PROJECT_TYPE_OPTIONS[0];
}

function coerceProjectType(projectType: string | undefined): string {
  return getProjectTypeMeta(projectType ?? DEFAULT_PROJECT_TYPE).value;
}

function buildConstraintSummary(techStack: string, existingConventions: string): string {
  const sections: string[] = [];

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

function createFallbackDraft(
  projectType: string,
  objective: string,
  techStack: string,
  outOfScope: string,
  existingConventions: string
): PrdWizardDraftBundle {
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

function mapLegacyInputs(initialConstraints: string | undefined, initialNonGoals: string | undefined): Pick<WizardState, 'techStack' | 'outOfScope' | 'existingConventions'> {
  return {
    techStack: initialConstraints ?? '',
    outOfScope: initialNonGoals ?? '',
    existingConventions: ''
  };
}

function createNonce(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeStep(step: PrdWizardLegacyStep | undefined, mode: PrdWizardMode): PrdWizardStep {
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

function createComparisonDraft(prdPreview: string): PrdWizardDraftBundle {
  return {
    prdText: prdPreview,
    prdHash: hashText(prdPreview),
    tasks: []
  };
}

function updateDraftTasks(
  draft: PrdWizardDraftBundle | null,
  transform: (tasks: PrdWizardTaskDraft[]) => PrdWizardTaskDraft[]
): PrdWizardDraftBundle | null {
  if (!draft) {
    return null;
  }

  return {
    ...draft,
    tasks: transform(draft.tasks)
  };
}

function moveTask(tasks: PrdWizardTaskDraft[], taskId: string, direction: 'up' | 'down'): PrdWizardTaskDraft[] {
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

function validateReviewedTasks(tasks: PrdWizardTaskDraft[]): string | null {
  if (tasks.length === 0) {
    return 'Review at least one task before writing files.';
  }

  for (const task of tasks) {
    if (!task.id.trim()) {
      return 'Each reviewed task must keep a non-empty id before writing files.';
    }

    if (!task.title.trim()) {
      return `Task ${task.id} must have a non-empty title before writing files.`;
    }
  }

  return null;
}

const PLACEHOLDER_PATTERN = /\b(?:tbd|todo|placeholder|lorem ipsum|coming soon|fill in)\b/i;
const VAGUE_WORD_PATTERN = /\b(?:stuff|things|various|misc(?:ellaneous)?|somehow|maybe|soon|improve|better|handle)\b/i;
const TASK_TITLE_STOP_WORDS = new Set(['a', 'an', 'and', 'for', 'in', 'of', 'the', 'to', 'now']);
const TASK_ID_LIKE_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]*$/;
const VALIDATION_COMMAND_PATTERN = /^(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?[A-Za-z0-9:_-]+|^(?:pytest|go\s+test|cargo\s+test|dotnet\s+test|npx|node|python|uv\s+run)\b/i;
const GENERIC_VALIDATION_PATTERN = /^(?:test|check|verify)(?:\s+(?:it|this|works?|behavior))?$/i;
const EPIC_TITLE_PATTERNS: RegExp[] = [
  /\bimplement\s+dashboard\b/i,
  /\bimprove\s+ui\s*\/?\s*ux\b/i,
  /\bbuild\s+(?:the\s+)?(?:platform|foundation)\b/i,
  /\bset\s+up\s+infrastructure\b/i,
  /\bimplement\s+authentication\s+and\s+authorization\b/i,
  /\bcreate\s+full\s+workflow\b/i
];

function analyzePrdReviewFindings(prdText: string | null): ReviewFinding[] {
  if (!prdText?.trim()) {
    return [{
      kind: 'blocker',
      message: 'PRD review needs draft content before it can assess title, sections, and wording.'
    }];
  }
  const readiness = analyzePrdReadiness(prdText);
  return [
    ...readiness.blockers.map((message) => ({ kind: 'blocker' as const, message })),
    ...readiness.warnings.map((message) => ({ kind: 'warning' as const, message }))
  ];
}

function normalizeTaskTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token && !TASK_TITLE_STOP_WORDS.has(token))
    .join(' ');
}

function hasWeakValidationDetail(validation: string | null | undefined): boolean {
  const text = validation?.trim() ?? '';
  if (!text) {
    return true;
  }

  if (VALIDATION_COMMAND_PATTERN.test(text)) {
    return false;
  }

  return GENERIC_VALIDATION_PATTERN.test(text);
}

function getTaskDependencyDetails(task: PrdWizardTaskDraft): string[] {
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

function hasWeakDependencyDetail(task: PrdWizardTaskDraft): boolean {
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

function analyzeTaskReviewFindings(tasks: PrdWizardTaskDraft[]): ReviewFinding[] {
  const findings: ReviewFinding[] = [];

  if (tasks.length === 0) {
    findings.push({
      kind: 'blocker',
      message: 'Task review cannot write an empty task list.'
    });
    return findings;
  }

  for (const finding of reviewGeneratedTaskShapeDetailed({ tasks })) {
    findings.push({
      kind: finding.severity === 'blocking' ? 'blocker' : 'warning',
      message: `Task ${finding.taskId} "${finding.taskTitle.trim()}": ${finding.message}`
    });
  }

  const duplicatePairs = new Set<string>();
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
    } else if (acceptance.every((entry) => entry.split(/\s+/).length < 4 || /(improve|handle|support|works?)/i.test(entry))) {
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
      if (
        leftNormalized === rightNormalized ||
        leftNormalized.includes(rightNormalized) ||
        rightNormalized.includes(leftNormalized)
      ) {
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

function countChangedLines(currentText: string, draftText: string): number {
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

function buildComparisonSummary(
  mode: PrdWizardMode,
  currentPrdPreview: string | null,
  draftText: string | null
): string | null {
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

export class PrdCreationWizardHost implements vscode.Disposable {
  private readonly bridge: MessageBridge<WizardOutboundMessage, WizardInboundMessage>;
  private readonly options: Omit<PrdCreationWizardHostOptions, 'webview'>;
  private state: WizardState;
  private isDisposed = false;

  public constructor(options: PrdCreationWizardHostOptions) {
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
    this.bridge = new MessageBridge<WizardOutboundMessage, WizardInboundMessage>(options.webview);
    this.state = this.buildInitialState();
    options.webview.html = renderWizardHtml(createNonce());
    this.bridge.onMessage((message) => {
      void this.handleMessage(message);
    });
    this.emitState();
  }

  public replaceContext(context: Partial<Omit<PrdCreationWizardHostOptions, 'webview' | 'generatePrdDraft' | 'generateTasks' | 'writeDraft' | 'onWriteComplete'>>): void {
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

  public dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this.isDisposed = true;
    this.bridge.dispose();
  }

  private buildInitialState(): WizardState {
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

  private emitState(): void {
    const prdReadiness = this.state.draft?.prdText?.trim()
      ? analyzePrdReadiness(this.state.draft.prdText)
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
        comparisonSummary: buildComparisonSummary(
          this.state.mode,
          this.state.currentPrdPreview,
          this.state.draft?.prdText ?? null
        )
      }
    });
  }

  private async handleMessage(message: WizardInboundMessage): Promise<void> {
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
          const nextPrdHash = nextPrdText.trim() ? hashText(nextPrdText) : undefined;
          const existingPrdHash = this.state.draft?.prdHash;
          const shouldMarkTasksStale = Boolean(
            this.state.draft?.tasks.length
            && existingPrdHash
            && nextPrdHash
            && existingPrdHash !== nextPrdHash
          );
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
              taskGenerationStatus: 'idle' as const,
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
          draft: updateDraftTasks(this.state.draft, (tasks) => tasks.map((task) => (
            task.id === message.taskId
              ? { ...task, ...(message.tier ? { tier: message.tier } : { tier: undefined }) }
              : task
          ))),
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

  private async generatePrdDraft(): Promise<void> {
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
      const prdHash = hashText(generated.prdText);
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
    } catch (error) {
      const reason = error instanceof ProjectGenerationError || error instanceof Error
        ? error.message
        : String(error);
      this.state = {
        ...this.state,
        step: 3,
        draft: createFallbackDraft(
          this.state.projectType,
          this.state.objective,
          this.state.techStack,
          this.state.outOfScope,
          this.state.existingConventions
        ),
        tasksStale: true,
        taskGenerationStatus: 'idle',
        taskGenerationMessage: 'Fallback PRD generated. Review and generate tasks after readiness passes.',
        generationState: 'fallback',
        generationMessage: `Generation fell back to a bootstrap draft. ${reason}`,
        operationStatus: 'succeeded',
        operationMessage: `Fallback draft generated after provider failure. ${reason}`,
        warning: null,
        error: null,
        writeSummary: null
      };
    } finally {
      this.bridge.send({ type: 'busy', value: false });
      this.emitState();
    }
  }

  private async generateTasks(): Promise<void> {
    const prdText = this.state.draft?.prdText?.trim() ?? '';
    if (!prdText) {
      this.state = { ...this.state, error: 'Generate and review a PRD draft before generating tasks.' };
      this.emitState();
      return;
    }

    const readiness = analyzePrdReadiness(prdText);
    if (readiness.blockers.length > 0) {
      this.state = {
        ...this.state,
        warning: 'PRD readiness has blockers. Resolve blockers before generating tasks.',
        error: null
      };
      this.emitState();
      return;
    }

    this.bridge.send({ type: 'busy', value: true });
    this.state = {
      ...this.state,
      operationStatus: 'running',
      operationMessage: 'Task generation started from approved PRD.',
      warning: null,
      error: null
    };
    this.emitState();

    try {
      const prdHash = this.state.draft?.prdHash ?? hashText(prdText);
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
        taskGenerationMessage: generated.taskCountWarning ?? 'Tasks generated from approved PRD.',
        operationStatus: 'succeeded',
        operationMessage: 'Task generation completed.',
        warning: null,
        error: null
      };
    } catch (error) {
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
    } finally {
      this.bridge.send({ type: 'busy', value: false });
      this.emitState();
    }
  }

  private async confirmWrite(): Promise<void> {
    if (!this.state.draft) {
      this.state = { ...this.state, error: 'Generate a draft before writing files.' };
      this.emitState();
      return;
    }

    const draft = this.state.draft;
    const readiness = analyzePrdReadiness(draft.prdText);
    if (readiness.blockers.length > 0) {
      this.state = {
        ...this.state,
        warning: 'PRD readiness blockers remain. Resolve blockers before writing files.',
        error: null
      };
      this.emitState();
      return;
    }

    if (this.state.tasksStale) {
      this.state = {
        ...this.state,
        warning: 'Generated tasks are stale because PRD text changed. Regenerate tasks before writing.',
        error: null
      };
      this.emitState();
      return;
    }

    const taskValidationError = validateReviewedTasks(draft.tasks);
    if (taskValidationError) {
      this.state = {
        ...this.state,
        warning: taskValidationError,
        error: null
      };
      this.emitState();
      return;
    }

    const taskBlockers = analyzeTaskReviewFindings(draft.tasks).filter((finding) => finding.kind === 'blocker');
    if (taskBlockers.length > 0) {
      this.state = {
        ...this.state,
        warning: `Task readiness blockers remain. ${taskBlockers[0].message}`,
        error: null
      };
      this.emitState();
      return;
    }

    this.bridge.send({ type: 'busy', value: true });
    this.state = {
      ...this.state,
      operationStatus: 'running',
      operationMessage: 'File write started. Writing prd.md and tasks.json.',
      warning: null,
      error: null
    };
    this.emitState();
    try {
      const result = await this.options.writeDraft(draft);
      this.state = {
        ...this.state,
        step: 6,
        warning: null,
        error: null,
        writeSummary: result,
        operationStatus: 'succeeded',
        operationMessage: 'File write completed.'
      };
      this.emitState();
      await this.options.onWriteComplete?.(result);
    } catch (error) {
      this.state = {
        ...this.state,
        operationStatus: 'failed',
        operationMessage: `File write failed. ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error)
      };
      this.emitState();
    } finally {
      this.bridge.send({ type: 'busy', value: false });
    }
  }
}

function renderWizardHtml(nonce: string): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PRD Creation Wizard</title>
    <style nonce="${nonce}">
${SHARED_WEBVIEW_CSS}
${buildBaseCss()}

body {
  padding: 0;
  background: var(--vscode-editor-background);
}

.wizard-shell {
  max-width: 1280px;
  margin: 0 auto;
  padding: 16px 18px 20px;
}

.wizard-header {
  text-align: center;
  margin-bottom: 14px;
}

.wizard-header.header {
  padding: 22px 24px 18px;
}

.wizard-header .header-title {
  font-size: 14px;
  letter-spacing: 5px;
  text-transform: uppercase;
  color: var(--accent);
  -webkit-text-fill-color: var(--accent);
  background: none;
}

.wizard-header p {
  color: var(--dim);
  margin-top: 6px;
  max-width: 80ch;
  margin-left: auto;
  margin-right: auto;
}

.wizard-step-panel,
.wizard-step-nav,
.step-summary-card,
.wizard-summary,
.task-card {
  margin-bottom: 0;
}

.wizard-frame {
  display: grid;
  grid-template-columns: minmax(220px, 260px) minmax(0, 1fr) minmax(260px, 320px);
  gap: 14px;
  align-items: start;
}

.wizard-step-nav,
.wizard-side-column {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.wizard-step-nav {
  padding: 10px;
}

.wizard-steps {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.wizard-step-button {
  text-align: left;
  padding: 10px 12px;
  display: grid;
  gap: 2px;
  justify-content: start;
  box-shadow: none;
}

.wizard-step-button.is-active {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, var(--surface-2));
  color: var(--fg);
}

.wizard-step-button.is-complete {
  border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
}

.wizard-step-index {
  color: var(--dim);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.2px;
  text-transform: uppercase;
}

.wizard-main,
.wizard-side-column {
  min-width: 0;
}

.wizard-step-panel {
  padding: 18px;
}

.wizard-step-panel > h2 {
  margin-bottom: 12px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--accent);
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border);
}

.step-summary-card {
  padding: 12px;
  display: grid;
  gap: 8px;
}

.step-summary-card header {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: baseline;
}

.step-summary-card header strong {
  color: var(--fg);
}

.step-summary-card.is-active {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 5%, var(--glass-bg));
}

.step-summary-card.is-locked {
  opacity: 0.8;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.field textarea {
  min-height: 96px;
  resize: vertical;
}

.field.compact textarea {
  min-height: 72px;
}

.field-meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: var(--dim);
  font-size: 0.92em;
}

.picker-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
}

.picker-card {
  padding: 12px;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
  box-shadow: none;
  min-height: 156px;
  display: flex;
}

.picker-card.is-selected {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, var(--glass-bg));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 30%, transparent);
}

.picker-card button {
  width: 100%;
  text-align: left;
  background: transparent;
  color: inherit;
  padding: 0;
  display: grid;
  gap: 8px;
  align-content: start;
  justify-items: start;
}

.picker-header {
  width: 100%;
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
}

.picker-title {
  font-size: 13px;
  font-weight: 600;
}

.picker-selection {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--border));
  background: color-mix(in srgb, var(--accent) 10%, var(--surface-2));
  color: var(--accent);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: uppercase;
}

.picker-description {
  color: var(--dim);
  line-height: 1.5;
}

.note,
.warning,
.error {
  margin-top: 12px;
  padding: 10px 12px;
  border-left: 3px solid var(--accent);
  background: rgba(0, 0, 0, 0.14);
  border-radius: 0 8px 8px 0;
}

.warning {
  border-left-color: var(--warn);
}

.error {
  border-left-color: var(--bad);
}

.findings-panel {
  margin-top: 12px;
  padding: 12px;
}

.findings-panel ul {
  margin: 8px 0 0;
}

.finding-blocker {
  color: var(--vscode-inputValidation-errorForeground, var(--vscode-editor-foreground));
}

.finding-warning {
  color: var(--vscode-inputValidation-warningForeground, var(--vscode-editor-foreground));
}

.preview {
  border: 1px solid var(--border);
  background: rgba(0, 0, 0, 0.14);
  padding: 12px;
  min-height: 260px;
  overflow: auto;
  border-radius: 8px;
}

.preview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 12px;
}

.preview-pane {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.preview-pane textarea {
  min-height: 320px;
  resize: vertical;
}

.preview-pane .preview {
  white-space: pre-wrap;
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.task-card,
.wizard-summary {
  padding: 12px;
}

.task-card header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: start;
}

.task-card header {
  align-items: stretch;
}

.task-card-main {
  flex: 1 1 auto;
}

.task-card-main input,
.task-card-main select {
  width: 100%;
}

.task-card-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
  margin-top: 12px;
}

.task-card-body textarea {
  min-height: 82px;
}

.task-card-meta {
  display: grid;
  gap: 8px;
}

.task-inline-note {
  padding: 8px 10px;
  border: 1px solid var(--border);
  background: rgba(0, 0, 0, 0.12);
  border-radius: 8px;
}

.task-card-controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 150px;
}

.task-move-buttons,
.task-delete-row {
  display: flex;
  gap: 8px;
}

.task-move-buttons button,
.task-delete-row button {
  flex: 1 1 0;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
}

.btn.secondary {
  background: var(--surface-2);
  color: var(--fg);
  border-color: var(--border);
}

.btn.secondary:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent) 12%, var(--surface-2));
}

.wizard-step-nav.card {
  padding: 10px;
}

.field span:first-child,
.task-card-controls label {
  color: var(--dim);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: uppercase;
}

.wizard-side-column .step-summary-card,
.wizard-main .wizard-step-panel,
.wizard-main .task-card,
.wizard-main .findings-panel,
.wizard-main .picker-card,
.wizard-main .wizard-summary {
  background: var(--glass-bg);
  border-color: var(--border);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-radius: 8px;
}

.wizard-main textarea,
.wizard-main input {
  background: rgba(0, 0, 0, 0.18);
  border-color: var(--border);
  color: var(--fg);
  border-radius: 8px;
  padding: 8px 10px;
}

.wizard-main select {
  background: var(--vscode-dropdown-background, var(--vscode-input-background));
  border-color: var(--border);
  color: var(--vscode-dropdown-foreground, var(--vscode-input-foreground));
  border-radius: 8px;
  padding: 8px 10px;
}

.wizard-main select option {
  background: var(--vscode-dropdown-background, var(--vscode-input-background));
  color: var(--vscode-dropdown-foreground, var(--vscode-input-foreground));
}

.wizard-main select option:checked {
  background: var(--vscode-list-activeSelectionBackground, var(--vscode-dropdown-background));
  color: var(--vscode-list-activeSelectionForeground, var(--vscode-dropdown-foreground));
}

.muted {
  color: var(--dim);
}

.guidance-list {
  padding-left: 18px;
  display: grid;
  gap: 6px;
}

ul {
  padding-left: 18px;
}

code {
  font-family: var(--vscode-editor-font-family, monospace);
}

@media (max-width: 1080px) {
  .wizard-frame {
    grid-template-columns: 1fr;
  }

  .wizard-steps {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  }
}

@media (max-width: 900px) {
  .task-card-body {
    grid-template-columns: 1fr;
  }
}
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      let state = null;
      let busy = false;

      const stepLabels = {
        1: 'Project Shape',
        2: 'Draft Generation',
        3: 'PRD Review',
        4: 'Task Generation',
        5: 'Task Review',
        6: 'Confirm Write'
      };

      function escapeHtml(value) {
        return String(value ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }

      function stepButton(step) {
        const active = state.step === step ? ' is-active' : '';
        const complete = state.step > step ? ' is-complete' : '';
        return '<button class="wizard-step-button btn' + active + complete + '" data-action="set-step" data-step="' + step + '">' +
          '<span class="wizard-step-index">Step ' + step + '</span>' +
          '<strong>' + stepLabels[step] + '</strong>' +
          '</button>';
      }

      const projectTypeOptions = ${JSON.stringify(PROJECT_TYPE_OPTIONS)};

      function projectTypeMeta(projectType) {
        return projectTypeOptions.find((option) => option.value === projectType) || projectTypeOptions[0];
      }

      function pickerCard(option) {
        const value = option.value;
        const selected = state.projectType === value ? ' is-selected' : '';
        const selectedBadge = state.projectType === value
          ? '<span class="picker-selection">Selected</span>'
          : '';
        return '<div class="picker-card card' + selected + '">' +
          '<button data-action="project-type" data-value="' + escapeHtml(value) + '">' +
          '<div class="picker-header"><strong class="picker-title">' + escapeHtml(option.title) + '</strong>' + selectedBadge + '</div>' +
          '<div class="picker-description">' + escapeHtml(option.description) + '</div>' +
          '</button></div>';
      }

      function findingsPanel(title, findings, emptyMessage) {
        const items = Array.isArray(findings) ? findings : [];
        const body = items.length === 0
          ? '<p class="muted">' + escapeHtml(emptyMessage) + '</p>'
          : '<ul>' + items.map((finding) =>
            '<li class="finding-' + escapeHtml(finding.kind || 'warning') + '">' + escapeHtml(finding.message || '') + '</li>'
          ).join('') + '</ul>';
        return '<div class="findings-panel"><strong>' + escapeHtml(title) + '</strong>' + body + '</div>';
      }

      function stepSummaryCard(step, title, summary, options) {
        const isActive = state.step === step;
        const isLocked = !options.clickable;
        const classes = 'step-summary-card' + (isActive ? ' is-active' : '') + (isLocked ? ' is-locked' : '');
        const actionAttrs = options.clickable ? ' data-action="set-step" data-step="' + step + '"' : '';
        const footer = options.meta
          ? '<div class="muted">' + escapeHtml(options.meta) + '</div>'
          : '';
        return '<section class="' + classes + ' card">' +
          '<header><strong>' + escapeHtml(title) + '</strong><span class="muted">Step ' + step + '</span></header>' +
          '<div>' + escapeHtml(summary) + '</div>' +
          footer +
          (options.clickable ? '<div><button class="btn secondary"' + actionAttrs + '>Open</button></div>' : '') +
        '</section>';
      }

      function taskList() {
        if (!state.draft || state.draft.tasks.length === 0) {
          return '<p class="empty">Generate tasks from the approved PRD to review task cards.</p>';
        }
        return '<div class="task-list">' + state.draft.tasks.map((task) =>
          '<article class="task-card card">' +
            '<header>' +
              '<div class="task-card-main">' +
                '<strong>' + escapeHtml(task.id) + '</strong>' +
                '<label class="field"><span>Title</span><input data-action="task-title" data-task-id="' + escapeHtml(task.id) + '" value="' + escapeHtml(task.title) + '" /></label>' +
              '</div>' +
              '<div class="task-card-controls">' +
                '<label>Tier <select data-action="task-tier" data-task-id="' + escapeHtml(task.id) + '">' +
                  '<option value=""' + (!task.tier ? ' selected' : '') + '>Auto</option>' +
                  '<option value="simple"' + (task.tier === 'simple' ? ' selected' : '') + '>Simple</option>' +
                  '<option value="medium"' + (task.tier === 'medium' ? ' selected' : '') + '>Medium</option>' +
                  '<option value="complex"' + (task.tier === 'complex' ? ' selected' : '') + '>Complex</option>' +
                '</select></label>' +
                '<div class="task-move-buttons">' +
                  '<button class="btn secondary" data-action="move-task" data-task-id="' + escapeHtml(task.id) + '" data-direction="up">Move Up</button>' +
                  '<button class="btn secondary" data-action="move-task" data-task-id="' + escapeHtml(task.id) + '" data-direction="down">Move Down</button>' +
                '</div>' +
                '<div class="task-delete-row">' +
                  '<button class="btn secondary" data-action="delete-task" data-task-id="' + escapeHtml(task.id) + '">Delete</button>' +
                '</div>' +
              '</div>' +
            '</header>' +
            '<div class="task-card-body">' +
              '<div class="task-card-meta">' +
                '<label class="field compact"><span>Dependencies</span><textarea data-action="task-dependencies" data-task-id="' + escapeHtml(task.id) + '" placeholder="One task id per line.">' + escapeHtml((task.dependsOn || task.dependencies || []).join('\\n')) + '</textarea></label>' +
                '<label class="field compact"><span>Notes</span><textarea data-action="task-notes" data-task-id="' + escapeHtml(task.id) + '" placeholder="Execution notes, rationale, or repo-specific constraints.">' + escapeHtml(task.notes || '') + '</textarea></label>' +
              '</div>' +
              '<div class="task-card-meta">' +
                '<label class="field compact"><span>Acceptance</span><textarea data-action="task-acceptance" data-task-id="' + escapeHtml(task.id) + '" placeholder="One acceptance criterion per line.">' + escapeHtml((task.acceptance || []).join('\\n')) + '</textarea></label>' +
                '<div class="task-inline-note"><strong>Validation</strong><div class="muted">' + escapeHtml(task.validation || 'No task-specific validation hint') + '</div></div>' +
              '</div>' +
            '</div>' +
          '</article>'
        ).join('') + '</div>';
      }

      function writeSummary() {
        if (!state.writeSummary) {
          return '<p class="empty">Confirm the write to persist <code>prd.md</code> and <code>tasks.json</code>. No workspace settings will be changed.</p>';
        }
        const filesWritten = state.writeSummary.filesWritten || [];
        return '<div class="wizard-summary card"><strong>Files written</strong><ul>' +
          filesWritten.map((file) => '<li><code>' + escapeHtml(file) + '</code></li>').join('') +
          '</ul><div class="note">Only <code>prd.md</code> and <code>tasks.json</code> were updated. No workspace settings were changed.</div></div>';
      }

      function generationStatus() {
        const generationState = state.generationState || 'idle';
        if (generationState === 'idle') {
          return '<div class="note"><strong>Status</strong><div>No draft generated yet.</div></div>';
        }
        const title = generationState === 'fallback'
          ? 'Fallback Draft'
          : generationState === 'weak'
            ? 'Weak Draft'
            : 'Generated Draft';
        const cssClass = generationState === 'fallback'
          ? 'warning'
          : generationState === 'weak'
            ? 'note'
            : 'note';
        const body = state.generationMessage || '';
        return '<div class="' + cssClass + '"><strong>' + escapeHtml(title) + '</strong><div>' + escapeHtml(body) + '</div></div>';
      }

      function operationStatus() {
        if (!state.operationMessage) {
          return '';
        }
        const title = state.operationStatus === 'running'
          ? 'In Progress'
          : state.operationStatus === 'failed'
            ? 'Action Failed'
            : 'Action Complete';
        const cssClass = state.operationStatus === 'failed' ? 'warning' : 'note';
        return '<div class="' + cssClass + '"><strong>' + escapeHtml(title) + '</strong><div>' + escapeHtml(state.operationMessage) + '</div></div>';
      }

      function captureEditableState() {
        const active = document.activeElement;
        if (!active || !(active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement)) {
          return null;
        }

        const taskId = active.getAttribute('data-task-id');
        const dataField = active.getAttribute('data-field');
        const dataAction = active.getAttribute('data-action');
        if (!taskId && !dataField && !dataAction) {
          return null;
        }

        return {
          tagName: active.tagName,
          taskId,
          dataField,
          dataAction,
          selectionStart: typeof active.selectionStart === 'number' ? active.selectionStart : null,
          selectionEnd: typeof active.selectionEnd === 'number' ? active.selectionEnd : null
        };
      }

      function restoreEditableState(snapshot) {
        if (!snapshot) {
          return;
        }

        let selector = '';
        if (snapshot.taskId && snapshot.dataAction) {
          selector = snapshot.tagName.toLowerCase() + '[data-action="' + snapshot.dataAction + '"][data-task-id="' + snapshot.taskId + '"]';
        } else if (snapshot.dataField) {
          selector = snapshot.tagName.toLowerCase() + '[data-field="' + snapshot.dataField + '"]';
        } else if (snapshot.dataAction) {
          selector = snapshot.tagName.toLowerCase() + '[data-action="' + snapshot.dataAction + '"]';
        }

        if (!selector) {
          return;
        }

        const next = document.querySelector(selector);
        if (!next || !(next instanceof HTMLTextAreaElement || next instanceof HTMLInputElement)) {
          return;
        }

        next.focus();
        if (typeof snapshot.selectionStart === 'number' && typeof snapshot.selectionEnd === 'number') {
          next.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
        }
      }

      function render() {
        if (!state) {
          return;
        }
        const preservedEditable = captureEditableState();
        const currentPreview = state.currentPrdPreview || '';
        const editableDraft = state.draft?.prdText || '';
        const projectType = projectTypeMeta(state.projectType);
        const objectiveLength = state.objective.length;
        const warning = state.warning ? '<div class="warning">' + escapeHtml(state.warning) + '</div>' : '';
        const error = state.error ? '<div class="error">' + escapeHtml(state.error) + '</div>' : '';
        const comparisonSummary = state.comparisonSummary
          ? '<div class="note"><strong>Comparison</strong><div>' + escapeHtml(state.comparisonSummary) + '</div></div>'
          : '';
        const generation = generationStatus();
        const operation = operationStatus();
        const prdBlockers = (state.prdReviewFindings || []).filter((finding) => finding.kind === 'blocker').length;
        const regenerateComparison = state.mode === 'regenerate' && currentPreview
          ? '<div class="preview-pane">' +
              '<strong>Current PRD</strong>' +
              '<div class="preview">' + escapeHtml(currentPreview) + '</div>' +
            '</div>'
          : '';
        const draftEditor = '<div class="preview-pane">' +
            '<strong>' + (state.mode === 'regenerate' ? 'Editable regenerated draft' : 'Editable generated draft') + '</strong>' +
            '<textarea data-action="draft-prd-text" placeholder="Generate a draft, then refine the PRD text here before writing files.">' + escapeHtml(editableDraft) + '</textarea>' +
          '</div>';
        const stepOnePanel = '' +
          '<section class="wizard-step-panel card">' +
            '<h2>1. Project Shape</h2>' +
            '<div class="picker-grid">' + projectTypeOptions.map((option) => pickerCard(option)).join('') + '</div>' +
            '<label class="field"><span>Objective or PRD source</span><textarea data-field="objective" placeholder="Describe the outcome Ralph should turn into a draft.">' + escapeHtml(state.objective) + '</textarea></label>' +
            '<div class="field-meta"><span>Objective example: ' + escapeHtml(projectType.objectiveExample) + '</span><span>Characters: ' + objectiveLength + '</span></div>' +
            '<label class="field"><span>Tech stack</span><textarea data-field="techStack" placeholder="Languages, frameworks, runtime targets, or integration surfaces Ralph should assume.">' + escapeHtml(state.techStack) + '</textarea></label>' +
            '<label class="field"><span>Out-of-scope</span><textarea data-field="outOfScope" placeholder="What this draft should explicitly avoid, defer, or refuse to redesign.">' + escapeHtml(state.outOfScope) + '</textarea></label>' +
            '<label class="field"><span>Existing conventions</span><textarea data-field="existingConventions" placeholder="Repository patterns, architecture rules, or operator expectations the draft must preserve.">' + escapeHtml(state.existingConventions) + '</textarea></label>' +
            '<div class="note"><strong>What good looks like</strong><ul class="guidance-list">' +
              '<li>' + escapeHtml(projectType.objectiveHint) + '</li>' +
              '<li>Keep the outcome concrete enough that Ralph can derive tasks without guessing at scope.</li>' +
              '<li>For regeneration, the current PRD text can stay here and act as the source material.</li>' +
            '</ul></div>' +
            '<div class="actions"><button class="btn secondary" data-action="set-step" data-step="2">Continue To Draft</button></div>' +
          '</section>';
        const stepTwoPanel = '' +
          '<section class="wizard-step-panel card">' +
            '<h2>2. Draft Generation</h2>' +
            '<div class="note">Generate a draft from the captured project shape. Ralph keeps the current PRD loaded for regenerate comparisons.</div>' +
            generation +
            operation +
            '<div class="actions">' +
              '<button class="btn primary" data-action="generate-prd-draft"' + (busy ? ' disabled' : '') + '>' + (state.mode === 'regenerate' ? 'Regenerate Draft' : 'Generate Draft') + '</button>' +
              '<button class="btn secondary" data-action="set-step" data-step="3">Review PRD</button>' +
            '</div>' +
          '</section>';
        const stepThreePanel = '' +
          '<section class="wizard-step-panel card">' +
            '<h2>3. PRD Review</h2>' +
            generation +
            operation +
            comparisonSummary +
            findingsPanel('PRD Findings', state.prdReviewFindings, 'No PRD findings yet.') +
            '<div class="preview-grid">' + draftEditor + regenerateComparison + '</div>' +
            (!editableDraft && !(state.mode === 'regenerate' && currentPreview)
              ? '<div class="note">No draft generated yet. Use generate to seed the editable PRD before writing files.</div>'
              : '') +
            '<div class="actions">' +
              '<button class="btn primary" data-action="generate-prd-draft"' + (busy ? ' disabled' : '') + '>' + (state.mode === 'regenerate' ? 'Regenerate Draft' : 'Generate Draft') + '</button>' +
              '<button class="btn secondary" data-action="set-step" data-step="4">Generate Tasks</button>' +
            '</div>' +
          '</section>';
        const stepFourPanel = '' +
          '<section class="wizard-step-panel card">' +
            '<h2>4. Generate Tasks</h2>' +
            findingsPanel('PRD Findings', state.prdReviewFindings, 'No PRD findings yet.') +
            '<div class="note">Tasks can be generated only when PRD readiness has no blockers.</div>' +
            '<div class="note"><strong>Task Generation Status</strong><div>' + escapeHtml(state.taskGenerationMessage || 'No tasks generated yet.') + '</div></div>' +
            operation +
            '<div class="actions">' +
              '<button class="btn primary" data-action="generate-tasks"' + ((busy || prdBlockers > 0 || !editableDraft) ? ' disabled' : '') + '>Generate Tasks</button>' +
              '<button class="btn secondary" data-action="set-step" data-step="5"' + ((state.draft && state.draft.tasks && state.draft.tasks.length > 0) ? '' : ' disabled') + '>Review Tasks</button>' +
            '</div>' +
          '</section>';
        const stepFivePanel = '' +
          '<section class="wizard-step-panel card">' +
            '<h2>5. Task Review</h2>' +
            findingsPanel('Task Findings', state.taskReviewFindings, 'No task findings yet.') +
            (state.tasksStale ? '<div class="warning">Tasks are stale because PRD text changed after generation. Regenerate tasks before writing.</div>' : '') +
            taskList() +
            '<div class="actions"><button class="btn secondary" data-action="set-step" data-step="6">Go To Confirm</button></div>' +
          '</section>';
        const confirmPanel = '' +
          '<section class="wizard-step-panel card">' +
            '<h2>6. Confirm Write</h2>' +
            '<div class="wizard-summary card"><strong>Targets</strong><ul>' +
              '<li><code>' + escapeHtml(state.paths.prdPath) + '</code></li>' +
              '<li><code>' + escapeHtml(state.paths.tasksPath) + '</code></li>' +
            '</ul><div class="note">This write replaces <code>tasks.json</code>, updates <code>prd.md</code>, and does not mutate unrelated workspace settings.</div></div>' +
            operation +
            writeSummary() +
            '<div class="actions">' +
              '<button class="btn primary" data-action="confirm-write"' + ((!state.draft || busy || state.tasksStale) ? ' disabled' : '') + '>Write Files</button>' +
              '<button class="btn secondary" data-action="set-step" data-step="5">Back To Task Review</button>' +
            '</div>' +
          '</section>';
        const mainPanelByStep = {
          1: stepOnePanel,
          2: stepTwoPanel,
          3: stepThreePanel,
          4: stepFourPanel,
          5: stepFivePanel,
          6: confirmPanel
        };
        const taskCount = state.draft?.tasks?.length || 0;
        document.getElementById('app').innerHTML = '' +
          '<div class="wizard-shell">' +
            '<section class="wizard-header header">' +
              '<h1 class="header-title">PRD Creation Wizard</h1>' +
              '<p>' + (state.mode === 'regenerate'
                ? 'Resume from the generate step with the current PRD preloaded, refine the draft, then write the updated files.'
                : 'Capture project intent, preview the PRD before writing, review the task backlog, and confirm every file Ralph will persist.') + '</p>' +
              warning + error +
            '</section>' +
            '<div class="wizard-frame">' +
              '<aside class="wizard-step-nav card">' +
                '<div class="wizard-steps">' + stepButton(1) + stepButton(2) + stepButton(3) + stepButton(4) + stepButton(5) + stepButton(6) + '</div>' +
              '</aside>' +
              '<main class="wizard-main">' +
                mainPanelByStep[state.step] +
              '</main>' +
              '<aside class="wizard-side-column">' +
                stepSummaryCard(1, 'Project Shape', state.objective.trim() || 'Objective not captured yet.', { clickable: true, meta: projectType.title }) +
                stepSummaryCard(2, 'Draft Generation', state.generationMessage || 'Generate a provider-backed draft or use the fallback bootstrap.', { clickable: true, meta: state.generationState || 'idle' }) +
                stepSummaryCard(3, 'PRD Review', editableDraft ? 'Draft text is available for editing.' : 'Waiting for draft text.', { clickable: !!editableDraft, meta: state.comparisonSummary || 'No comparison yet' }) +
                stepSummaryCard(4, 'Task Generation', prdBlockers > 0 ? 'PRD blockers must be resolved before task generation.' : (state.taskGenerationMessage || 'Generate tasks from approved PRD.'), { clickable: !!editableDraft, meta: state.taskGenerationStatus || 'idle' }) +
                stepSummaryCard(5, 'Task Review', taskCount > 0 ? 'Review ' + taskCount + ' task card(s).' : 'Waiting for generated tasks.', { clickable: taskCount > 0, meta: state.tasksStale ? 'Tasks are stale until regenerated.' : (taskCount > 0 ? 'Dependencies, notes, and acceptance stay visible here.' : 'No task cards yet') }) +
                (state.step === 6 || state.writeSummary ? confirmPanel : stepSummaryCard(6, 'Confirm Write', state.draft ? 'Ready to persist prd.md and tasks.json.' : 'Generate a draft before writing files.', { clickable: !!state.draft && taskCount > 0, meta: state.writeSummary ? 'Files written.' : 'No write yet' })) +
              '</aside>' +
            '</div>' +
          '</div>';

        for (const button of document.querySelectorAll('[data-action="set-step"]')) {
          button.addEventListener('click', () => {
            const step = Number(button.getAttribute('data-step'));
            vscode.postMessage({ type: 'set-step', step });
          });
        }

        for (const button of document.querySelectorAll('[data-action="project-type"]')) {
          button.addEventListener('click', () => {
            vscode.postMessage({ type: 'update-field', field: 'projectType', value: button.getAttribute('data-value') || '${DEFAULT_PROJECT_TYPE}' });
          });
        }

        for (const field of document.querySelectorAll('textarea[data-field]')) {
          field.addEventListener('input', () => {
            vscode.postMessage({ type: 'update-field', field: field.getAttribute('data-field'), value: field.value });
          });
        }

        for (const field of document.querySelectorAll('textarea[data-action="draft-prd-text"]')) {
          field.addEventListener('input', () => {
            vscode.postMessage({ type: 'update-draft-prd-text', value: field.value });
          });
        }

        for (const select of document.querySelectorAll('select[data-action="task-tier"]')) {
          select.addEventListener('change', () => {
            vscode.postMessage({
              type: 'update-task-tier',
              taskId: select.getAttribute('data-task-id'),
              tier: select.value
            });
          });
        }

        for (const input of document.querySelectorAll('input[data-action="task-title"]')) {
          input.addEventListener('input', () => {
            vscode.postMessage({
              type: 'update-task-title',
              taskId: input.getAttribute('data-task-id'),
              title: input.value
            });
          });
        }

        for (const textarea of document.querySelectorAll('textarea[data-action="task-dependencies"]')) {
          textarea.addEventListener('input', () => {
            vscode.postMessage({
              type: 'update-task-dependencies',
              taskId: textarea.getAttribute('data-task-id'),
              value: textarea.value
            });
          });
        }

        for (const textarea of document.querySelectorAll('textarea[data-action="task-notes"]')) {
          textarea.addEventListener('input', () => {
            vscode.postMessage({
              type: 'update-task-notes',
              taskId: textarea.getAttribute('data-task-id'),
              value: textarea.value
            });
          });
        }

        for (const textarea of document.querySelectorAll('textarea[data-action="task-acceptance"]')) {
          textarea.addEventListener('input', () => {
            vscode.postMessage({
              type: 'update-task-acceptance',
              taskId: textarea.getAttribute('data-task-id'),
              value: textarea.value
            });
          });
        }

        for (const button of document.querySelectorAll('button[data-action="move-task"]')) {
          button.addEventListener('click', () => {
            vscode.postMessage({
              type: 'move-task',
              taskId: button.getAttribute('data-task-id'),
              direction: button.getAttribute('data-direction')
            });
          });
        }

        for (const button of document.querySelectorAll('button[data-action="delete-task"]')) {
          button.addEventListener('click', () => {
            vscode.postMessage({
              type: 'delete-task',
              taskId: button.getAttribute('data-task-id')
            });
          });
        }

        const generatePrd = document.querySelector('[data-action="generate-prd-draft"]');
        if (generatePrd) {
          generatePrd.addEventListener('click', () => vscode.postMessage({ type: 'generate-prd-draft' }));
        }

        const generateTasks = document.querySelector('[data-action="generate-tasks"]');
        if (generateTasks) {
          generateTasks.addEventListener('click', () => vscode.postMessage({ type: 'generate-tasks' }));
        }

        const confirm = document.querySelector('[data-action="confirm-write"]');
        if (confirm) {
          confirm.addEventListener('click', () => vscode.postMessage({ type: 'confirm-write' }));
        }

        restoreEditableState(preservedEditable);
      }

      window.addEventListener('message', (event) => {
        const message = event.data;
        if (!message || typeof message !== 'object') {
          return;
        }
        if (message.type === 'state') {
          state = message.state;
          render();
          return;
        }
        if (message.type === 'busy') {
          busy = !!message.value;
          render();
        }
      });
    </script>
  </body>
</html>`;
}

export function summarizeWizardPaths(paths: PrdWizardPaths): Record<string, string> {
  return {
    'PRD path': paths.prdPath,
    'Task path': paths.tasksPath
  };
}

export function relativeWizardWriteSummary(rootPath: string, result: PrdWizardWriteResult): PrdWizardWriteResult {
  return {
    filesWritten: result.filesWritten.map((target) => path.relative(rootPath, target) || path.basename(target))
  };
}

function updateDraftTask(
  draft: PrdWizardDraftBundle | null,
  taskId: string,
  transform: (task: PrdWizardTaskDraft) => PrdWizardTaskDraft
): PrdWizardDraftBundle | null {
  return updateDraftTasks(draft, (tasks) => tasks.map((task) => (
    task.id === taskId ? transform(task) : task
  )));
}

function parseMultilineList(value: string): string[] {
  return value
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}
