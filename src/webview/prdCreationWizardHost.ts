import * as path from 'path';
import * as vscode from 'vscode';
import { MessageBridge } from './MessageBridge';
import { SHARED_WEBVIEW_CSS } from './styles';
import { ProjectGenerationError, type RecommendedSkill } from '../ralph/projectGenerator';
import type { RalphTaskStatus } from '../ralph/types';
import type { RalphNewTaskInput } from '../ralph/taskNormalization';
import type { CliProviderId, OperatorMode } from '../config/types';

export type PrdWizardMode = 'new' | 'regenerate';
export type PrdWizardStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface PrdWizardTaskDraft extends RalphNewTaskInput {
  status: RalphTaskStatus;
}

export interface PrdWizardGenerateResult {
  prdText: string;
  tasks: PrdWizardTaskDraft[];
  recommendedSkills: RecommendedSkill[];
  taskCountWarning?: string;
}

export interface PrdWizardSkillSelection extends RecommendedSkill {
  selected: boolean;
}

export type PrdWizardConfigKey = 'operatorMode' | 'cliProvider';

export interface PrdWizardConfigSelection {
  key: PrdWizardConfigKey;
  label: string;
  value: OperatorMode | CliProviderId;
  description: string;
  rationale: string;
  selected: boolean;
}

export interface PrdWizardDraftBundle {
  prdText: string;
  tasks: PrdWizardTaskDraft[];
  recommendedSkills: PrdWizardSkillSelection[];
  configSelections: PrdWizardConfigSelection[];
}

export interface PrdWizardWriteResult {
  filesWritten: string[];
  settingsUpdated?: string[];
  settingsSkipped?: string[];
}

export interface PrdWizardPaths {
  prdPath: string;
  tasksPath: string;
  recommendedSkillsPath?: string;
}

export interface PrdCreationWizardHostOptions {
  webview: vscode.Webview;
  initialMode: PrdWizardMode;
  initialPaths: PrdWizardPaths;
  initialProjectType?: string;
  initialObjective?: string;
  initialConstraints?: string;
  initialNonGoals?: string;
  initialStep?: PrdWizardStep;
  initialPrdPreview?: string;
  configSelections?: PrdWizardConfigSelection[];
  generateDraft: (input: {
    mode: PrdWizardMode;
    projectType: string;
    objective: string;
    constraints: string;
    nonGoals: string;
  }) => Promise<PrdWizardGenerateResult>;
  writeDraft: (draft: PrdWizardDraftBundle) => Promise<PrdWizardWriteResult>;
  onWriteComplete?: (result: PrdWizardWriteResult) => Promise<void>;
}

type StructuredField = 'projectType' | 'objective' | 'techStack' | 'outOfScope' | 'existingConventions';

type WizardInboundMessage =
  | { type: 'set-step'; step: PrdWizardStep }
  | { type: 'update-field'; field: StructuredField; value: string }
  | { type: 'update-draft-prd-text'; value: string }
  | { type: 'update-task-title'; taskId: string; title: string }
  | { type: 'update-task-tier'; taskId: string; tier: '' | 'simple' | 'medium' | 'complex' }
  | { type: 'move-task'; taskId: string; direction: 'up' | 'down' }
  | { type: 'delete-task'; taskId: string }
  | { type: 'toggle-config-selection'; key: PrdWizardConfigKey }
  | { type: 'toggle-skill'; skillName: string }
  | { type: 'generate-draft' }
  | { type: 'confirm-write' };

type WizardOutboundMessage =
  | { type: 'state'; state: WizardState }
  | { type: 'busy'; value: boolean };

interface WizardState {
  mode: PrdWizardMode;
  step: PrdWizardStep;
  projectType: string;
  objective: string;
  techStack: string;
  outOfScope: string;
  existingConventions: string;
  draft: PrdWizardDraftBundle | null;
  warning: string | null;
  error: string | null;
  currentPrdPreview: string | null;
  comparisonSummary?: string | null;
  writeSummary: PrdWizardWriteResult | null;
  configSelections: PrdWizardConfigSelection[];
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
      title: 'Expand PRD into a full product requirements document',
      status: 'todo'
    },
    {
      id: 'T2',
      title: 'Create a starter backlog from the expanded PRD',
      status: 'todo'
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
  existingConventions: string,
  configSelections: PrdWizardConfigSelection[]
): PrdWizardDraftBundle {
  const constraintSummary = buildConstraintSummary(techStack, existingConventions);
  const lines = [
    '# Product / project brief',
    '',
    `## Project Type`,
    '',
    getProjectTypeMeta(projectType).title,
    '',
    '## Objective',
    '',
    objective.trim() || 'Describe the project objective here.',
    '',
    '## Constraints',
    '',
    constraintSummary || 'None recorded yet.',
    '',
    '## Non-Goals',
    '',
    outOfScope.trim() || 'None recorded yet.'
  ];

  return {
    prdText: `${lines.join('\n')}\n`,
    tasks: bootstrapSeedTasks(),
    recommendedSkills: [],
    configSelections: cloneConfigSelections(configSelections)
  };
}

function normalizeRecommendedSkills(skills: RecommendedSkill[]): PrdWizardSkillSelection[] {
  return skills.map((skill) => ({ ...skill, selected: true }));
}

function cloneConfigSelections(configSelections: PrdWizardConfigSelection[]): PrdWizardConfigSelection[] {
  return configSelections.map((selection) => ({ ...selection }));
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

function createComparisonDraft(prdPreview: string): PrdWizardDraftBundle {
  return {
    prdText: prdPreview,
    tasks: [],
    recommendedSkills: [],
    configSelections: []
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
      configSelections: options.configSelections,
      generateDraft: options.generateDraft,
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

  public replaceContext(context: Partial<Omit<PrdCreationWizardHostOptions, 'webview' | 'generateDraft' | 'writeDraft' | 'onWriteComplete'>>): void {
    const currentPrdPreview = context.initialPrdPreview ?? this.state.currentPrdPreview;
    const nextMode = context.initialMode ?? this.state.mode;
    this.state = {
      ...this.state,
      mode: nextMode,
      step: context.initialStep ?? (context.initialMode === 'regenerate' ? 4 : 1),
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
        ? {
          ...createComparisonDraft(context.initialPrdPreview),
          configSelections: cloneConfigSelections(context.configSelections ?? this.state.configSelections)
        }
        : (nextMode === 'regenerate' && currentPrdPreview && !this.state.draft
          ? {
            ...createComparisonDraft(currentPrdPreview),
            configSelections: cloneConfigSelections(context.configSelections ?? this.state.configSelections)
          }
          : this.state.draft),
      currentPrdPreview,
      paths: context.initialPaths ?? this.state.paths,
      configSelections: cloneConfigSelections(context.configSelections ?? this.state.configSelections),
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
      step: this.options.initialStep ?? (mode === 'regenerate' ? 4 : 1),
      projectType: coerceProjectType(this.options.initialProjectType),
      objective: this.options.initialObjective ?? '',
      ...structuredInputs,
      draft: this.options.initialPrdPreview
        ? {
          ...createComparisonDraft(this.options.initialPrdPreview),
          configSelections: cloneConfigSelections(this.options.configSelections ?? [])
        }
        : null,
      warning: null,
      error: null,
      currentPrdPreview: this.options.initialPrdPreview ?? null,
      writeSummary: null,
      configSelections: cloneConfigSelections(this.options.configSelections ?? []),
      paths: this.options.initialPaths
    };
  }

  private emitState(): void {
    this.bridge.send({
      type: 'state',
      state: {
        ...this.state,
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
        this.state = {
          ...this.state,
          draft: this.state.draft
            ? {
              ...this.state.draft,
              prdText: message.value
            }
            : {
              prdText: message.value,
              tasks: [],
              recommendedSkills: [],
              configSelections: cloneConfigSelections(this.state.configSelections)
            },
          warning: null,
          error: null
        };
        this.emitState();
        return;
      case 'update-task-title':
        this.state = {
          ...this.state,
          draft: updateDraftTasks(this.state.draft, (tasks) => tasks.map((task) => (
            task.id === message.taskId
              ? { ...task, title: message.title }
              : task
          ))),
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
          warning: null,
          error: null
        };
        this.emitState();
        return;
      case 'move-task':
        this.state = {
          ...this.state,
          draft: updateDraftTasks(this.state.draft, (tasks) => moveTask(tasks, message.taskId, message.direction)),
          warning: null,
          error: null
        };
        this.emitState();
        return;
      case 'delete-task':
        this.state = {
          ...this.state,
          draft: updateDraftTasks(this.state.draft, (tasks) => tasks.filter((task) => task.id !== message.taskId)),
          warning: null,
          error: null
        };
        this.emitState();
        return;
      case 'toggle-config-selection':
        this.state = {
          ...this.state,
          configSelections: this.state.configSelections.map((selection) => selection.key === message.key
            ? { ...selection, selected: !selection.selected }
            : selection),
          draft: this.state.draft
            ? {
              ...this.state.draft,
              configSelections: this.state.draft.configSelections.map((selection) => selection.key === message.key
                ? { ...selection, selected: !selection.selected }
                : selection)
            }
            : null,
          warning: null,
          error: null
        };
        this.emitState();
        return;
      case 'toggle-skill':
        this.state = {
          ...this.state,
          draft: this.state.draft
            ? {
              ...this.state.draft,
              recommendedSkills: this.state.draft.recommendedSkills.map((skill) => skill.name === message.skillName
                ? { ...skill, selected: !skill.selected }
                : skill)
            }
            : null
        };
        this.emitState();
        return;
      case 'generate-draft':
        await this.generateDraft();
        return;
      case 'confirm-write':
        await this.confirmWrite();
        return;
    }
  }

  private async generateDraft(): Promise<void> {
    const objective = this.state.objective.trim();
    if (!objective) {
      this.state = { ...this.state, error: 'Add an objective or existing PRD text before generating a draft.' };
      this.emitState();
      return;
    }

    this.bridge.send({ type: 'busy', value: true });
    try {
      const generated = await this.options.generateDraft({
        mode: this.state.mode,
        projectType: this.state.projectType,
        objective: this.state.objective,
        constraints: buildConstraintSummary(this.state.techStack, this.state.existingConventions),
        nonGoals: this.state.outOfScope
      });
      this.state = {
        ...this.state,
        step: 4,
        draft: {
          prdText: generated.prdText,
          tasks: generated.tasks,
          recommendedSkills: normalizeRecommendedSkills(generated.recommendedSkills),
          configSelections: cloneConfigSelections(this.state.configSelections)
        },
        warning: generated.taskCountWarning ?? null,
        error: null,
        writeSummary: null
      };
    } catch (error) {
      const reason = error instanceof ProjectGenerationError || error instanceof Error
        ? error.message
        : String(error);
      this.state = {
        ...this.state,
        step: 4,
        draft: createFallbackDraft(
          this.state.projectType,
          this.state.objective,
          this.state.techStack,
          this.state.outOfScope,
          this.state.existingConventions,
          this.state.configSelections
        ),
        warning: `Generation fell back to a bootstrap draft. ${reason}`,
        error: null,
        writeSummary: null
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

    const taskValidationError = validateReviewedTasks(this.state.draft.tasks);
    if (taskValidationError) {
      this.state = {
        ...this.state,
        warning: taskValidationError,
        error: null
      };
      this.emitState();
      return;
    }

    this.bridge.send({ type: 'busy', value: true });
    try {
      const result = await this.options.writeDraft(this.state.draft);
      this.state = {
        ...this.state,
        step: 7,
        warning: null,
        error: null,
        writeSummary: result
      };
      this.emitState();
      await this.options.onWriteComplete?.(result);
    } catch (error) {
      this.state = {
        ...this.state,
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

body {
  padding: 0;
}

.wizard-shell {
  max-width: 1200px;
  margin: 0 auto;
  padding: 16px;
}

.wizard-header,
.wizard-step,
.wizard-summary,
.task-card,
.skill-row,
.config-choice {
  border: 1px solid var(--vscode-panel-border, var(--vscode-editorWidget-border));
  background: var(--vscode-sideBar-background, var(--vscode-editor-background));
}

.wizard-header {
  padding: 16px;
  margin-bottom: 16px;
}

.wizard-header p {
  color: var(--vscode-descriptionForeground);
  margin-top: 4px;
}

.wizard-steps {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 8px;
  margin-top: 16px;
}

.wizard-step-button {
  text-align: left;
  background: var(--vscode-editor-background);
  color: var(--vscode-editor-foreground);
  border: 1px solid var(--vscode-panel-border, var(--vscode-editorWidget-border));
  padding: 10px;
}

.wizard-step-button.is-active {
  border-color: var(--vscode-focusBorder);
}

.wizard-layout {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr);
  gap: 16px;
}

.wizard-main {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.wizard-step {
  padding: 16px;
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

.field-meta {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: var(--vscode-descriptionForeground);
  font-size: 0.92em;
}

.picker-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
}

.picker-card {
  border: 1px solid var(--vscode-panel-border, var(--vscode-editorWidget-border));
  padding: 12px;
  background: var(--vscode-editor-background);
}

.picker-card.is-selected {
  border-color: var(--vscode-focusBorder);
}

.picker-card button {
  width: 100%;
  text-align: left;
  background: transparent;
  color: inherit;
  padding: 0;
}

.note,
.warning,
.error {
  margin-top: 12px;
  padding: 10px 12px;
  border-left: 3px solid var(--vscode-focusBorder);
  background: var(--vscode-textBlockQuote-background, transparent);
}

.warning {
  border-left-color: var(--vscode-inputValidation-warningBorder);
}

.error {
  border-left-color: var(--vscode-inputValidation-errorBorder);
}

.preview {
  border: 1px solid var(--vscode-panel-border, var(--vscode-editorWidget-border));
  background: var(--vscode-textCodeBlock-background, var(--vscode-editor-background));
  padding: 12px;
  min-height: 260px;
  overflow: auto;
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

.task-list,
.skill-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.task-card,
.skill-row,
.wizard-summary {
  padding: 12px;
}

.task-card header,
.skill-row header {
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

.config-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.config-choice {
  padding: 12px;
}

.config-choice header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: start;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--vscode-panel-border, var(--vscode-editorWidget-border));
  color: var(--vscode-descriptionForeground);
  font-size: 12px;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
}

.actions .secondary {
  background: var(--vscode-button-secondaryBackground, var(--vscode-editor-background));
  color: var(--vscode-button-secondaryForeground, var(--vscode-editor-foreground));
  border: 1px solid var(--vscode-panel-border, var(--vscode-editorWidget-border));
}

.muted {
  color: var(--vscode-descriptionForeground);
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

@media (max-width: 900px) {
  .wizard-layout {
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
        1: 'Project Type',
        2: 'Objective',
        3: 'Constraints',
        4: 'Generate',
        5: 'Tasks',
        6: 'Config & Skills',
        7: 'Confirm'
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
        return '<button class="wizard-step-button' + active + '" data-action="set-step" data-step="' + step + '">' +
          '<strong>' + step + '</strong><div>' + stepLabels[step] + '</div></button>';
      }

      const projectTypeOptions = ${JSON.stringify(PROJECT_TYPE_OPTIONS)};

      function projectTypeMeta(projectType) {
        return projectTypeOptions.find((option) => option.value === projectType) || projectTypeOptions[0];
      }

      function pickerCard(option) {
        const value = option.value;
        const selected = state.projectType === value ? ' is-selected' : '';
        return '<div class="picker-card' + selected + '">' +
          '<button data-action="project-type" data-value="' + escapeHtml(value) + '">' +
          '<strong>' + escapeHtml(option.title) + '</strong>' +
          '<div class="muted">' + escapeHtml(option.description) + '</div>' +
          '</button></div>';
      }

      function taskList() {
        if (!state.draft || state.draft.tasks.length === 0) {
          return '<p class="empty">Generate a draft to review task cards.</p>';
        }
        return '<div class="task-list">' + state.draft.tasks.map((task) =>
          '<article class="task-card">' +
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
                  '<button class="secondary" data-action="move-task" data-task-id="' + escapeHtml(task.id) + '" data-direction="up">Move Up</button>' +
                  '<button class="secondary" data-action="move-task" data-task-id="' + escapeHtml(task.id) + '" data-direction="down">Move Down</button>' +
                '</div>' +
                '<div class="task-delete-row">' +
                  '<button class="secondary" data-action="delete-task" data-task-id="' + escapeHtml(task.id) + '">Delete</button>' +
                '</div>' +
              '</div>' +
            '</header>' +
            '<div class="muted">' + escapeHtml(task.validation || 'No task-specific validation hint') + '</div>' +
          '</article>'
        ).join('') + '</div>';
      }

      function skillList() {
        if (!state.draft || state.draft.recommendedSkills.length === 0) {
          return '<p class="empty">No recommended skills are selected for this draft.</p>';
        }
        return '<div class="skill-list">' + state.draft.recommendedSkills.map((skill) =>
          '<label class="skill-row"><header><div><strong>' + escapeHtml(skill.name) + '</strong><div class="muted">' + escapeHtml(skill.description) + '</div></div>' +
          '<input type="checkbox" data-action="toggle-skill" data-skill-name="' + escapeHtml(skill.name) + '"' + (skill.selected ? ' checked' : '') + ' /></header>' +
          '<div class="muted">' + escapeHtml(skill.rationale) + '</div></label>'
        ).join('') + '</div>';
      }

      function configSelectionList() {
        const selections = state.configSelections || [];
        if (selections.length === 0) {
          return '<p class="empty">No configuration recommendations are available for this draft.</p>';
        }
        return '<div class="config-list">' + selections.map((selection) =>
          '<label class="config-choice"><header><div><strong>' + escapeHtml(selection.label) + '</strong>' +
          '<div class="muted"><code>ralphCodex.' + escapeHtml(selection.key) + '</code> = <code>' + escapeHtml(selection.value) + '</code></div>' +
          '</div><div><span class="status-pill">' + (selection.selected ? 'Selected' : 'Skipped') + '</span> ' +
          '<input type="checkbox" data-action="toggle-config-selection" data-config-key="' + escapeHtml(selection.key) + '"' + (selection.selected ? ' checked' : '') + ' /></div></header>' +
          '<div class="muted">' + escapeHtml(selection.description) + '</div>' +
          '<div class="muted">' + escapeHtml(selection.rationale) + '</div></label>'
        ).join('') + '</div>';
      }

      function writeSummary() {
        if (!state.writeSummary) {
          return '<p class="empty">Confirm the write to persist <code>prd.md</code> and <code>tasks.json</code>.</p>';
        }
        const filesWritten = state.writeSummary.filesWritten || [];
        const settingsUpdated = state.writeSummary.settingsUpdated || [];
        const settingsSkipped = state.writeSummary.settingsSkipped || [];
        return '<div class="wizard-summary"><strong>Files written</strong><ul>' +
          filesWritten.map((file) => '<li><code>' + escapeHtml(file) + '</code></li>').join('') +
          '</ul>' +
          '<strong>Configuration updates</strong><ul>' +
          (settingsUpdated.length > 0
            ? settingsUpdated.map((entry) => '<li>' + escapeHtml(entry) + '</li>').join('')
            : '<li>No configuration changes applied.</li>') +
          '</ul>' +
          '<strong>Skipped recommendations</strong><ul>' +
          (settingsSkipped.length > 0
            ? settingsSkipped.map((entry) => '<li>' + escapeHtml(entry) + '</li>').join('')
            : '<li>No recommendations were skipped.</li>') +
          '</ul></div>';
      }

      function render() {
        if (!state) {
          return;
        }
        const currentPreview = state.currentPrdPreview || '';
        const editableDraft = state.draft?.prdText || '';
        const projectType = projectTypeMeta(state.projectType);
        const objectiveLength = state.objective.length;
        const warning = state.warning ? '<div class="warning">' + escapeHtml(state.warning) + '</div>' : '';
        const error = state.error ? '<div class="error">' + escapeHtml(state.error) + '</div>' : '';
        const comparisonSummary = state.comparisonSummary
          ? '<div class="note"><strong>Comparison</strong><div>' + escapeHtml(state.comparisonSummary) + '</div></div>'
          : '';
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
        document.getElementById('app').innerHTML = '' +
          '<div class="wizard-shell">' +
            '<section class="wizard-header">' +
              '<h1>PRD Creation Wizard</h1>' +
              '<p>' + (state.mode === 'regenerate'
                ? 'Resume from the generate step with the current PRD preloaded, refine the draft, then write the updated files.'
                : 'Capture project intent, preview the PRD before writing, review the task backlog, and confirm every file Ralph will persist.') + '</p>' +
              '<div class="wizard-steps">' +
                stepButton(1) + stepButton(2) + stepButton(3) + stepButton(4) + stepButton(5) + stepButton(6) + stepButton(7) +
              '</div>' +
              warning + error +
            '</section>' +
            '<div class="wizard-layout">' +
              '<main class="wizard-main">' +
                '<section class="wizard-step">' +
                  '<h2>1. Project Type</h2>' +
                  '<div class="picker-grid">' + projectTypeOptions.map((option) => pickerCard(option)).join('') + '</div>' +
                '</section>' +
                '<section class="wizard-step">' +
                  '<h2>2. Objective</h2>' +
                  '<label class="field"><span>Objective or PRD source</span><textarea data-field="objective" placeholder="Describe the outcome Ralph should turn into a draft.">' + escapeHtml(state.objective) + '</textarea></label>' +
                  '<div class="field-meta"><span>Objective example: ' + escapeHtml(projectType.objectiveExample) + '</span><span>Characters: ' + objectiveLength + '</span></div>' +
                  '<div class="note"><strong>What good looks like</strong><ul class="guidance-list">' +
                    '<li>' + escapeHtml(projectType.objectiveHint) + '</li>' +
                    '<li>Keep the outcome concrete enough that Ralph can derive tasks without guessing at scope.</li>' +
                    '<li>For regeneration, the current PRD text can stay here and act as the source material.</li>' +
                  '</ul></div>' +
                '</section>' +
                '<section class="wizard-step">' +
                  '<h2>3. Constraints</h2>' +
                  '<label class="field"><span>Tech stack</span><textarea data-field="techStack" placeholder="Languages, frameworks, runtime targets, or integration surfaces Ralph should assume.">' + escapeHtml(state.techStack) + '</textarea></label>' +
                  '<label class="field"><span>Out-of-scope</span><textarea data-field="outOfScope" placeholder="What this draft should explicitly avoid, defer, or refuse to redesign.">' + escapeHtml(state.outOfScope) + '</textarea></label>' +
                  '<label class="field"><span>Existing conventions</span><textarea data-field="existingConventions" placeholder="Repository patterns, architecture rules, or operator expectations the draft must preserve.">' + escapeHtml(state.existingConventions) + '</textarea></label>' +
                '</section>' +
                '<section class="wizard-step">' +
                  '<h2>4. Generate With Inline Preview</h2>' +
                  comparisonSummary +
                  '<div class="preview-grid">' +
                    draftEditor +
                    regenerateComparison +
                  '</div>' +
                  (!editableDraft && !(state.mode === 'regenerate' && currentPreview)
                    ? '<div class="note">No draft generated yet. Use generate to seed the editable PRD before writing files.</div>'
                    : '') +
                  '<div class="actions">' +
                    '<button data-action="generate-draft"' + (busy ? ' disabled' : '') + '>' + (state.mode === 'regenerate' ? 'Regenerate Draft' : 'Generate Draft') + '</button>' +
                    '<button class="secondary" data-action="set-step" data-step="5">Review Tasks</button>' +
                  '</div>' +
                '</section>' +
                '<section class="wizard-step">' +
                  '<h2>5. Task Review Cards</h2>' +
                  taskList() +
                '</section>' +
                '<section class="wizard-step">' +
                  '<h2>6. Configuration And Recommended Skills</h2>' +
                  configSelectionList() +
                  '<div class="actions"><button class="secondary" data-action="set-step" data-step="7">Go To Confirm</button></div>' +
                  '<h3 style="margin-top:16px;">Recommended Skills</h3>' +
                  skillList() +
                '</section>' +
              '</main>' +
              '<aside class="wizard-main">' +
                '<section class="wizard-step">' +
                  '<h2>7. Confirm And Write Summary</h2>' +
                  '<div class="wizard-summary"><strong>Targets</strong><ul>' +
                    '<li><code>' + escapeHtml(state.paths.prdPath) + '</code></li>' +
                    '<li><code>' + escapeHtml(state.paths.tasksPath) + '</code></li>' +
                    (state.paths.recommendedSkillsPath ? '<li><code>' + escapeHtml(state.paths.recommendedSkillsPath) + '</code></li>' : '') +
                  '</ul></div>' +
                  writeSummary() +
                  '<div class="actions">' +
                    '<button data-action="confirm-write"' + ((!state.draft || busy) ? ' disabled' : '') + '>Write Files</button>' +
                    '<button class="secondary" data-action="set-step" data-step="4">Back To Preview</button>' +
                  '</div>' +
                '</section>' +
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

        for (const checkbox of document.querySelectorAll('input[data-action="toggle-skill"]')) {
          checkbox.addEventListener('change', () => {
            vscode.postMessage({ type: 'toggle-skill', skillName: checkbox.getAttribute('data-skill-name') });
          });
        }

        for (const checkbox of document.querySelectorAll('input[data-action="toggle-config-selection"]')) {
          checkbox.addEventListener('change', () => {
            vscode.postMessage({ type: 'toggle-config-selection', key: checkbox.getAttribute('data-config-key') });
          });
        }

        const generate = document.querySelector('[data-action="generate-draft"]');
        if (generate) {
          generate.addEventListener('click', () => vscode.postMessage({ type: 'generate-draft' }));
        }

        const confirm = document.querySelector('[data-action="confirm-write"]');
        if (confirm) {
          confirm.addEventListener('click', () => vscode.postMessage({ type: 'confirm-write' }));
        }
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
    'Task path': paths.tasksPath,
    ...(paths.recommendedSkillsPath ? { 'Recommended skills': paths.recommendedSkillsPath } : {})
  };
}

export function relativeWizardWriteSummary(rootPath: string, result: PrdWizardWriteResult): PrdWizardWriteResult {
  return {
    filesWritten: result.filesWritten.map((target) => path.relative(rootPath, target) || path.basename(target)),
    settingsUpdated: result.settingsUpdated,
    settingsSkipped: result.settingsSkipped
  };
}
