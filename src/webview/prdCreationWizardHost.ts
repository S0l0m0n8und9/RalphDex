import * as path from 'path';
import * as vscode from 'vscode';
import { MessageBridge } from './MessageBridge';
import { SHARED_WEBVIEW_CSS } from './styles';
import { ProjectGenerationError, type RecommendedSkill } from '../ralph/projectGenerator';
import type { RalphTask } from '../ralph/types';

export type PrdWizardMode = 'new' | 'regenerate';
export type PrdWizardStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface PrdWizardTaskDraft extends Pick<RalphTask, 'id' | 'title' | 'status'> {
  validation?: string;
  tier?: 'simple' | 'medium' | 'complex';
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

export interface PrdWizardDraftBundle {
  prdText: string;
  tasks: PrdWizardTaskDraft[];
  recommendedSkills: PrdWizardSkillSelection[];
}

export interface PrdWizardWriteResult {
  filesWritten: string[];
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
  configSummary?: Record<string, string>;
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
  | { type: 'update-task-tier'; taskId: string; tier: '' | 'simple' | 'medium' | 'complex' }
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
  writeSummary: PrdWizardWriteResult | null;
  configSummary: Record<string, string>;
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
  existingConventions: string
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
    recommendedSkills: []
  };
}

function normalizeRecommendedSkills(skills: RecommendedSkill[]): PrdWizardSkillSelection[] {
  return skills.map((skill) => ({ ...skill, selected: true }));
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
      configSummary: options.configSummary,
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
    this.state = {
      ...this.state,
      mode: context.initialMode ?? this.state.mode,
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
      currentPrdPreview: context.initialPrdPreview ?? this.state.currentPrdPreview,
      paths: context.initialPaths ?? this.state.paths,
      configSummary: context.configSummary ?? this.state.configSummary,
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
          prdText: this.options.initialPrdPreview,
          tasks: [],
          recommendedSkills: []
        }
        : null,
      warning: null,
      error: null,
      currentPrdPreview: this.options.initialPrdPreview ?? null,
      writeSummary: null,
      configSummary: this.options.configSummary ?? {},
      paths: this.options.initialPaths
    };
  }

  private emitState(): void {
    this.bridge.send({ type: 'state', state: this.state });
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
          error: null,
          ...(message.field === 'objective' && this.state.mode === 'regenerate'
            ? { currentPrdPreview: message.value }
            : {})
        };
        this.emitState();
        return;
      case 'update-task-tier':
        this.state = {
          ...this.state,
          draft: this.state.draft
            ? {
              ...this.state.draft,
              tasks: this.state.draft.tasks.map((task) => task.id === message.taskId
                ? { ...task, ...(message.tier ? { tier: message.tier } : { tier: undefined }) }
                : task)
            }
            : null
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
          recommendedSkills: normalizeRecommendedSkills(generated.recommendedSkills)
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
          this.state.existingConventions
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

    this.bridge.send({ type: 'busy', value: true });
    try {
      const result = await this.options.writeDraft(this.state.draft);
      this.state = {
        ...this.state,
        step: 7,
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
.config-grid {
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
  white-space: pre-wrap;
  border: 1px solid var(--vscode-panel-border, var(--vscode-editorWidget-border));
  background: var(--vscode-textCodeBlock-background, var(--vscode-editor-background));
  padding: 12px;
  min-height: 260px;
  overflow: auto;
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

.config-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1px;
}

.config-grid div {
  padding: 12px;
  background: var(--vscode-editor-background);
}

.config-grid dt {
  color: var(--vscode-descriptionForeground);
  margin-bottom: 4px;
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
            '<header><div><strong>' + escapeHtml(task.id) + '</strong><div>' + escapeHtml(task.title) + '</div></div>' +
            '<label>Tier <select data-action="task-tier" data-task-id="' + escapeHtml(task.id) + '">' +
              '<option value=""' + (!task.tier ? ' selected' : '') + '>Auto</option>' +
              '<option value="simple"' + (task.tier === 'simple' ? ' selected' : '') + '>Simple</option>' +
              '<option value="medium"' + (task.tier === 'medium' ? ' selected' : '') + '>Medium</option>' +
              '<option value="complex"' + (task.tier === 'complex' ? ' selected' : '') + '>Complex</option>' +
            '</select></label></header>' +
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

      function configSummary() {
        const entries = Object.entries(state.configSummary || {});
        if (entries.length === 0) {
          return '<p class="empty">No config summary available.</p>';
        }
        return '<dl class="config-grid">' + entries.map(([key, value]) =>
          '<div><dt>' + escapeHtml(key) + '</dt><dd>' + escapeHtml(value) + '</dd></div>'
        ).join('') + '</dl>';
      }

      function writeSummary() {
        if (!state.writeSummary) {
          return '<p class="empty">Confirm the write to persist <code>prd.md</code> and <code>tasks.json</code>.</p>';
        }
        return '<div class="wizard-summary"><strong>Files written</strong><ul>' +
          state.writeSummary.filesWritten.map((file) => '<li><code>' + escapeHtml(file) + '</code></li>').join('') +
          '</ul></div>';
      }

      function render() {
        if (!state) {
          return;
        }
        const currentPreview = state.draft?.prdText || state.currentPrdPreview || '';
        const projectType = projectTypeMeta(state.projectType);
        const objectiveLength = state.objective.length;
        const warning = state.warning ? '<div class="warning">' + escapeHtml(state.warning) + '</div>' : '';
        const error = state.error ? '<div class="error">' + escapeHtml(state.error) + '</div>' : '';
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
                  '<div class="preview">' + escapeHtml(currentPreview || 'No draft generated yet.') + '</div>' +
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
                  configSummary() +
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

        for (const select of document.querySelectorAll('select[data-action="task-tier"]')) {
          select.addEventListener('change', () => {
            vscode.postMessage({
              type: 'update-task-tier',
              taskId: select.getAttribute('data-task-id'),
              tier: select.value
            });
          });
        }

        for (const checkbox of document.querySelectorAll('input[data-action="toggle-skill"]')) {
          checkbox.addEventListener('change', () => {
            vscode.postMessage({ type: 'toggle-skill', skillName: checkbox.getAttribute('data-skill-name') });
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
    filesWritten: result.filesWritten.map((target) => path.relative(rootPath, target) || path.basename(target))
  };
}
