import * as fs from 'fs/promises';
import * as path from 'path';
import { RalphCodexConfig } from '../config/types';
import { deriveRootPolicy } from '../ralph/rootPolicy';
import { RalphPaths } from '../ralph/pathResolver';
import { pathExists } from '../util/fs';
import { findTaskById, remainingSubtasks, selectNextTask } from '../ralph/taskFile';
import {
  RalphAgentRole,
  RalphPreflightDiagnostic,
  RalphPreflightReport,
  RalphPromptEvidence,
  RalphPromptSessionHandoff,
  RalphPromptKind,
  RalphPromptTarget,
  RalphTask,
  RalphTaskCounts,
  RalphTaskFile,
  RalphTaskMode,
  RalphWorkspaceState
} from '../ralph/types';
import { WorkspaceScan } from '../services/workspaceInspection';
import {
  type PromptSectionName,
  type PromptBudgetPolicy,
  buildPromptBudgetPolicy,
  estimateTokenCount,
  estimateTokenRange
} from './promptBudget';

export * from './promptBudget';

const DEFAULT_TEMPLATE_DIR_CANDIDATES = [
  path.resolve(__dirname, '../../prompt-templates'),
  path.resolve(__dirname, '../../../prompt-templates'),
  path.resolve(process.cwd(), 'prompt-templates')
];

const TEMPLATE_FILE_BY_KIND: Record<RalphPromptKind, string> = {
  bootstrap: 'bootstrap.md',
  iteration: 'iteration.md',
  'replenish-backlog': 'replenish-backlog.md',
  'fix-failure': 'fix-failure.md',
  'continue-progress': 'continue-progress.md',
  'human-review-handoff': 'human-review-handoff.md'
};

const REVIEW_AGENT_TEMPLATE_FILE = 'review-agent.md';
const WATCHDOG_AGENT_TEMPLATE_FILE = 'watchdog-agent.md';
const SCM_AGENT_TEMPLATE_FILE = 'scm-agent.md';

const PROMPT_INTRO_BY_KIND: Record<RalphPromptKind, string> = {
  bootstrap: 'You are starting a fresh Ralph-guided Codex run inside an existing repository. Treat the repository and durable Ralph files as the source of truth.',
  iteration: 'You are continuing Ralph work from durable repository state, not from chat memory. Re-inspect the repo and selected task before editing.',
  'replenish-backlog': 'The durable Ralph backlog is exhausted. Re-inspect the repository, PRD, and recent progress, then generate the next coherent tasks directly in the durable task file.',
  'fix-failure': 'A prior Ralph iteration failed, stalled, or produced a blocking verifier signal. Repair the concrete cause instead of repeating the same attempt.',
  'continue-progress': 'A prior Ralph iteration made partial progress. Resume from that durable state and finish the next coherent slice without redoing settled work.',
  'human-review-handoff': 'A prior Ralph iteration surfaced a blocker that may need human review. Preserve deterministic evidence, do not fake closure, and make the next safe move explicit.'
};

type PromptConfig = Pick<
RalphCodexConfig,
'promptTemplateDirectory' | 'promptIncludeVerifierFeedback' | 'promptPriorContextBudget'
> & Partial<Pick<RalphCodexConfig, 'promptBudgetProfile' | 'customPromptBudget' | 'agentRole'>>;

export interface PromptGenerationInput {
  kind: RalphPromptKind;
  target: RalphPromptTarget;
  iteration: number;
  selectionReason: string;
  objectiveText: string;
  progressText: string;
  taskCounts: RalphTaskCounts;
  summary: WorkspaceScan;
  state: RalphWorkspaceState;
  paths: RalphPaths;
  taskFile: RalphTaskFile;
  selectedTask: RalphTask | null;
  taskValidationHint: string | null;
  effectiveValidationCommand: string | null;
  normalizedValidationCommandFrom: string | null;
  validationCommand: string | null;
  preflightReport: RalphPreflightReport;
  sessionHandoff?: RalphPromptSessionHandoff | null;
  config: PromptConfig;
}

export interface PromptKindDecision {
  kind: RalphPromptKind;
  reason: string;
}

export interface PromptKindContext {
  selectedTask?: RalphTask | null;
  taskCounts?: RalphTaskCounts | null;
  taskInspectionDiagnostics?: RalphPreflightDiagnostic[];
}

export interface PromptRenderResult {
  prompt: string;
  templatePath: string;
  evidence: RalphPromptEvidence;
}

function formatOptional(value: string | null | undefined): string {
  return value && value.trim().length > 0 ? value.trim() : 'none';
}

function toRelativePath(rootPath: string, target: string | null | undefined): string {
  if (!target) {
    return 'none';
  }

  return (path.relative(rootPath, target) || '.').split(path.sep).join('/');
}

function clipText(text: string, maximumLines: number, maximumChars: number, fromEnd = false): string {
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
  } else if (selected.length < lines.length) {
    normalized = `${normalized}\n[trimmed for size]`;
  }

  return normalized;
}

function compactList(values: string[], limit: number): string {
  if (values.length === 0) {
    return 'none';
  }

  const visible = values.slice(0, limit);
  const remaining = values.length - visible.length;
  return remaining > 0 ? `${visible.join(', ')} (+${remaining} more)` : visible.join(', ');
}

function taskKeywords(task: RalphTask | null): string {
  return [
    task?.title ?? '',
    task?.notes ?? '',
    task?.validation ?? '',
    task?.blocker ?? '',
    ...(task?.acceptance ?? []),
    ...(task?.constraints ?? []),
    ...(task?.context ?? [])
  ].join(' ').toLowerCase();
}

function trimContextLines(lines: string[], budget: number): string[] {
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

function keywordTokens(value: string): string[] {
  return Array.from(new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 4)
  ));
}

function matchesTaskFocus(
  value: string | null | undefined,
  selectedTask: RalphTask | null,
  taskTokens: string[]
): boolean {
  if (!selectedTask || !value) {
    return Boolean(value);
  }

  const normalized = value.toLowerCase();
  if (normalized.includes(selectedTask.id.toLowerCase())) {
    return true;
  }

  return taskTokens.some((token) => normalized.includes(token));
}

function fileMatchesTaskFocus(
  filePath: string,
  selectedTask: RalphTask | null,
  taskTokens: string[]
): boolean {
  if (!selectedTask) {
    return true;
  }

  const normalized = filePath.toLowerCase();
  if (matchesTaskFocus(normalized, selectedTask, taskTokens)) {
    return true;
  }

  if ((taskTokens.includes('doc') || taskTokens.includes('docs') || taskTokens.includes('readme'))
    && (normalized.includes('docs/') || normalized.endsWith('readme.md') || normalized.endsWith('agents.md'))) {
    return true;
  }
  if ((taskTokens.includes('test') || taskTokens.includes('tests') || taskTokens.includes('validate') || taskTokens.includes('validation'))
    && (normalized.includes('test/') || normalized.includes('tests/') || normalized.includes('spec'))) {
    return true;
  }
  if ((taskTokens.includes('prompt') || taskTokens.includes('cli') || taskTokens.includes('code') || taskTokens.includes('typescript'))
    && normalized.includes('src/')) {
    return true;
  }

  return false;
}

function taskDependencySummary(taskFile: RalphTaskFile, task: RalphTask): string {
  if (!task.dependsOn || task.dependsOn.length === 0) {
    return 'none';
  }

  return task.dependsOn
    .map((dependencyId) => {
      const dependency = findTaskById(taskFile, dependencyId);
      return dependency ? `${dependency.id} (${dependency.status})` : `${dependencyId} (missing)`;
    })
    .join(', ');
}

function childTaskSummary(taskFile: RalphTaskFile, task: RalphTask): string {
  const children = taskFile.tasks.filter((candidate) => candidate.parentId === task.id);

  if (children.length === 0) {
    return 'none';
  }

  return compactList(children.map((child) => `${child.id} (${child.status})`), 4);
}

function taskLedgerDriftMessagesFromDiagnostics(
  diagnostics: readonly RalphPreflightDiagnostic[] | undefined,
  limit = 2
): string[] {
  if (!diagnostics) {
    return [];
  }

  return diagnostics
    .filter((diagnostic) => diagnostic.category === 'taskGraph' && diagnostic.severity === 'error')
    .slice(0, limit)
    .map((diagnostic) => diagnostic.message);
}

function isBacklogExhausted(context?: PromptKindContext): boolean {
  return context?.selectedTask === null
    && Boolean(context.taskCounts)
    && context.taskCounts!.todo === 0
    && context.taskCounts!.in_progress === 0
    && context.taskCounts!.blocked === 0;
}

function effectiveAgentRole(config: PromptConfig): RalphAgentRole {
  return config.agentRole ?? 'build';
}

function buildStrategyContext(
  target: RalphPromptTarget,
  kind: RalphPromptKind,
  agentRole: RalphAgentRole,
  taskLedgerDriftMessages: string[] = []
): string[] {
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

function buildPreflightContext(report: RalphPreflightReport): string[] {
  const lines = [
    `- Ready: ${report.ready ? 'yes' : 'no'}`,
    `- Summary: ${report.summary}`
  ];
  const salientDiagnostics = report.diagnostics
    .filter((diagnostic) => diagnostic.severity !== 'info')
    .slice(0, 3)
    .map((diagnostic) => `- ${diagnostic.category} ${diagnostic.severity}: ${diagnostic.message}`);

  const handoffDiagnostic = report.diagnostics.find((d) => d.code === 'session_handoff_available');
  const handoffLines = handoffDiagnostic ? [`- sessionHandoff: ${handoffDiagnostic.message}`] : [];

  return salientDiagnostics.length > 0 || handoffLines.length > 0
    ? [...lines, ...salientDiagnostics, ...handoffLines]
    : lines;
}

function buildRepoContext(
  summary: WorkspaceScan,
  kind: RalphPromptKind,
  target: RalphPromptTarget,
  selectedTask: RalphTask | null,
  detail: PromptBudgetPolicy['repoDetail']
): string[] {
  const rootPolicy = deriveRootPolicy(summary);
  const keywords = taskKeywords(selectedTask);
  const includeExpanded = detail === 'expanded' || kind === 'bootstrap' || kind === 'replenish-backlog';
  const includeDocs = includeExpanded
    || /doc|readme|agents|workflow|architecture|guide|prompt/.test(keywords);
  const includePackage = includeExpanded
    || kind === 'fix-failure'
    || /package|install|workspace|root|build|cli|extension|manifest|npm|node/.test(keywords);
  const includeSources = includeExpanded
    || /src|code|implement|refactor|feature|typescript|prompt|cli|codex|command|extension/.test(keywords);
  const includeValidation = includeExpanded
    || kind === 'fix-failure'
    || includeSources
    || /test|validat|verif|smoke|coverage|regression|failure|debug/.test(keywords);
  const lines = [
    `- Workspace: ${summary.workspaceName}`,
    `- Workspace root: ${summary.workspaceRootPath}`,
    `- Inspected root: ${summary.rootPath}`,
    `- Execution root: ${rootPolicy.executionRootPath}`,
    `- Verifier root: ${rootPolicy.verificationRootPath}`,
    `- Root selection: ${summary.rootSelection.summary}`,
    `- Root policy: ${rootPolicy.policySummary}`
  ];

  if (includePackage) {
    lines.push(`- Manifests: ${compactList(summary.manifests, 5)}`);
    lines.push(`- Package managers: ${compactList(summary.packageManagers, 4)}`);
    lines.push(`- Package manager indicators: ${compactList(summary.packageManagerIndicators, 5)}`);
  }
  if (includeSources) {
    lines.push(`- Source roots: ${compactList(summary.sourceRoots, 5)}`);
  }
  if (includeValidation) {
    lines.push(`- Test roots: ${compactList(summary.tests, 5)}`);
    lines.push(`- Validation commands: ${compactList(summary.validationCommands, 4)}`);
    if (detail !== 'minimal') {
      lines.push(`- Lifecycle commands: ${compactList(summary.lifecycleCommands, 4)}`);
      lines.push(`- CI files: ${compactList(summary.ciFiles, 4)}`);
      lines.push(`- CI commands: ${compactList(summary.ciCommands, 4)}`);
    }
    lines.push(`- Test signals: ${compactList(summary.testSignals, 3)}`);
  }
  if (includeDocs) {
    lines.push(`- Docs: ${compactList(summary.docs, 4)}`);
  }
  if (includePackage && summary.packageJson?.name) {
    lines.push(`- package.json name: ${summary.packageJson.name}`);
  }
  if (includePackage && summary.packageJson?.hasWorkspaces) {
    lines.push('- package.json workspaces: yes');
  }
  if (summary.notes.length > 0) {
    lines.push(`- Notes: ${compactList(summary.notes, 3)}`);
  }

  return lines;
}

function buildRuntimeContext(
  state: RalphWorkspaceState,
  paths: RalphPaths,
  iteration: number,
  target: RalphPromptTarget,
  detail: PromptBudgetPolicy['runtimeDetail']
): string[] {
  const lines = [
    `- Prompt target: ${target}`,
    `- Current iteration number: ${iteration}`,
    `- Next iteration recorded in state: ${state.nextIteration}`,
    `- Last prompt kind: ${state.lastPromptKind ?? 'none yet'}`,
    `- Last prompt path: ${toRelativePath(paths.rootPath, state.lastPromptPath)}`,
    `- Last run: ${state.lastRun ? `${state.lastRun.status} at iteration ${state.lastRun.iteration}` : 'none yet'}`,
    `- Last iteration outcome: ${state.lastIteration ? `${state.lastIteration.completionClassification} at iteration ${state.lastIteration.iteration}` : 'none yet'}`
  ];

  if (detail === 'standard') {
    lines.push(`- PRD path: ${toRelativePath(paths.rootPath, paths.prdPath)}`);
    lines.push(`- Progress path: ${toRelativePath(paths.rootPath, paths.progressPath)}`);
    lines.push(`- Task file path: ${toRelativePath(paths.rootPath, paths.taskFilePath)}`);
    lines.push(`- Runtime state path: ${toRelativePath(paths.rootPath, paths.stateFilePath)}`);
    lines.push(`- Artifact root: ${toRelativePath(paths.rootPath, paths.artifactDir)}`);
  }

  if (state.lastIteration?.summary) {
    lines.push(`- Last iteration summary: ${state.lastIteration.summary}`);
  }

  return lines;
}

function buildTaskContext(
  kind: RalphPromptKind,
  taskFile: RalphTaskFile,
  taskCounts: RalphTaskCounts,
  selectedTask: RalphTask | null,
  preflightReport: RalphPreflightReport,
  taskValidationHint: string | null,
  effectiveValidationCommand: string | null,
  normalizedValidationCommandFrom: string | null,
  validationCommand: string | null
): string[] {
  const nextActionable = selectNextTask(taskFile);
  const taskGraphErrors = preflightReport.diagnostics.filter((diagnostic) => (
    diagnostic.category === 'taskGraph' && diagnostic.severity === 'error'
  ));
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
      `- Validation command: ${effectiveValidationCommand ?? validationCommand ?? 'none selected for backlog replenishment'}`
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

  const remainingChildren = remainingSubtasks(taskFile, selectedTask.id)
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
    `- Task validation hint: ${taskValidationHint ?? selectedTask.validation ?? 'none'}`,
    `- Effective validation command: ${effectiveValidationCommand ?? validationCommand ?? 'none detected'}`,
    `- Validation command normalized from: ${normalizedValidationCommandFrom ?? 'none'}`,
    `- Notes: ${selectedTask.notes ?? 'none'}`,
    `- Blocker: ${selectedTask.blocker ?? 'none'}`,
    `- Acceptance criteria: ${selectedTask.acceptance ? selectedTask.acceptance.map((item, index) => `(${index + 1}) ${item}`).join(' ') : 'none'}`,
    `- Constraints: ${selectedTask.constraints ? selectedTask.constraints.map((item, index) => `(${index + 1}) ${item}`).join(' ') : 'none'}`,
    `- Relevant files: ${selectedTask.context ? selectedTask.context.join(', ') : 'none'}`
  ];
}

function buildPriorIterationContext(
  state: RalphWorkspaceState,
  includeVerifierFeedback: boolean,
  budget: number,
  rootPath: string,
  selectedTask: RalphTask | null,
  sessionHandoff: RalphPromptSessionHandoff | null
): string[] {
  const handoffLines = sessionHandoff
    ? [
      '### Session Handoff',
      `- Handoff summary: ${sessionHandoff.humanSummary}`,
      `- Handoff blocker: ${formatOptional(sessionHandoff.pendingBlocker)}`,
      `- Handoff validation failure signature: ${formatOptional(sessionHandoff.validationFailureSignature)}`,
      `- Remaining task count at handoff: ${sessionHandoff.remainingTaskCount !== null ? String(sessionHandoff.remainingTaskCount) : 'unknown'}`
    ]
    : [];
  const prior = state.lastIteration;

  if (!prior) {
    return handoffLines.length > 0
      ? trimContextLines(handoffLines, budget)
      : ['- No prior Ralph iteration has been recorded.'];
  }
  if (!includeVerifierFeedback) {
    return trimContextLines([
      ...handoffLines,
      '- Prior verifier feedback is disabled by configuration.'
    ], budget);
  }

  const taskTokens = keywordTokens(taskKeywords(selectedTask));
  const validationFocusedTask = taskTokens.some((token) => [
    'test',
    'tests',
    'validate',
    'validation',
    'verifier',
    'failure',
    'debug',
    'regression',
    'smoke'
  ].includes(token));
  const remediationRelevant = prior.remediation
    ? prior.remediation.taskId === null
      || !selectedTask
      || prior.remediation.taskId === selectedTask.id
      || matchesTaskFocus(prior.remediation.summary, selectedTask, taskTokens)
    : false;
  const failureSignatureRelevant = Boolean(prior.verification.validationFailureSignature)
    && (!selectedTask
      || validationFocusedTask
      || prior.executionStatus === 'failed'
      || (prior.verificationStatus === 'failed'
        && (prior.completionClassification === 'failed'
          || prior.completionClassification === 'blocked'
          || remediationRelevant))
      || matchesTaskFocus(prior.summary, selectedTask, taskTokens));
  const noProgressRelevant = prior.noProgressSignals.length > 0
    && (remediationRelevant || validationFocusedTask || !selectedTask);
  const relevantChangedFiles = prior.diffSummary?.relevantChangedFiles.filter((filePath) => (
    fileMatchesTaskFocus(filePath, selectedTask, taskTokens)
  )) ?? [];
  const diffRelevant = Boolean(prior.diffSummary)
    && (!selectedTask
      || matchesTaskFocus(prior.diffSummary?.summary, selectedTask, taskTokens)
      || relevantChangedFiles.length > 0);
  const lineEntries: Array<{ priority: number; text: string; }> = [
    { priority: 100, text: `- Prior iteration: ${prior.iteration}` },
    { priority: 95, text: `- Prior outcome classification: ${prior.completionClassification}` },
    { priority: 94, text: `- Prior execution / verification: ${prior.executionStatus} / ${prior.verificationStatus}` },
    { priority: 91, text: `- Prior summary: ${prior.summary}` }
  ];

  if (remediationRelevant) {
    lineEntries.push({ priority: 93, text: `- Prior remediation: ${prior.remediation?.summary ?? 'none'}` });
  }
  if (failureSignatureRelevant) {
    lineEntries.push({
      priority: 92,
      text: `- Prior validation failure signature: ${formatOptional(prior.verification.validationFailureSignature)}`
    });
  }
  if (prior.stopReason && (remediationRelevant || prior.completionClassification !== 'complete')) {
    lineEntries.push({ priority: 90, text: `- Prior stop reason: ${formatOptional(prior.stopReason)}` });
  }
  if (prior.followUpAction !== 'stop' || remediationRelevant) {
    lineEntries.push({ priority: 89, text: `- Prior follow-up action: ${prior.followUpAction}` });
  }
  if (prior.verification.verifiers.length > 0 && (failureSignatureRelevant || prior.verificationStatus === 'failed' || !selectedTask)) {
    lineEntries.push({
      priority: 88,
      text: `- Prior verifier statuses: ${prior.verification.verifiers.map((verifier) => `${verifier.verifier}=${verifier.status}`).join(', ')}`
    });
  }
  if (noProgressRelevant) {
    lineEntries.push({ priority: 87, text: `- Prior no-progress signals: ${prior.noProgressSignals.join(', ')}` });
  }
  if (diffRelevant && prior.diffSummary) {
    lineEntries.push({ priority: 72, text: `- Prior diff summary: ${prior.diffSummary.summary}` });
    if (relevantChangedFiles.length > 0) {
      lineEntries.push({
        priority: 71,
        text: `- Prior relevant changed files: ${compactList(relevantChangedFiles, 5)}`
      });
    }
  }
  if (!selectedTask || budget >= 8) {
    lineEntries.push({ priority: 20, text: `- Prior prompt artifact: ${toRelativePath(rootPath, prior.promptPath)}` });
    lineEntries.push({ priority: 19, text: `- Prior iteration artifact dir: ${toRelativePath(rootPath, prior.artifactDir)}` });
  }

  return trimContextLines([
    ...handoffLines,
    ...lineEntries
      .sort((left, right) => right.priority - left.priority)
      .map((entry) => entry.text)
  ], budget);
}

function buildOperatingRules(agentRole: RalphAgentRole, taskMode?: RalphTaskMode): string[] {
  if (agentRole === 'review') {
    return [
      '- Read AGENTS.md plus the durable Ralph files before making non-trivial review decisions.',
      '- Do not invent unsupported IDE APIs or hidden handoff channels.',
      '- Keep the review deterministic, file-backed, and evidence-driven.',
      '- Do not make implementation edits; this role reports review findings only.',
      '- Prefer the repository\'s real validation commands when they exist.',
      '- Do not edit `.ralph/tasks.json` or `.ralph/progress.md`; return review results through the structured completion report instead.'
    ];
  }

  if (taskMode === 'documentation') {
    return [
      '- Read AGENTS.md plus the durable Ralph files before making non-trivial changes.',
      '- Do not invent unsupported IDE APIs or hidden handoff channels.',
      '- Focus on reading existing code, understanding behavior, and producing clear documentation.',
      '- Do not make functional code changes unless the task specifically requires it.',
      '- Documentation files (.md, .txt, etc.) are the primary deliverable.',
      '- Verify documentation accuracy by reading the code it describes.',
      '- For normal CLI task execution, do not edit `.ralph/tasks.json` or `.ralph/progress.md` directly; return the structured completion report instead.',
      '- Update durable Ralph progress/tasks only when the prompt explicitly targets backlog replenishment.'
    ];
  }

  return [
    '- Read AGENTS.md plus the durable Ralph files before making non-trivial changes.',
    '- Do not invent unsupported IDE APIs or hidden handoff channels.',
    '- Keep architecture thin, deterministic, and file-backed.',
    '- Make the smallest coherent change that materially advances the selected Ralph task.',
    '- Prefer the repository\'s real validation commands when they exist.',
    '- For normal CLI task execution, do not edit `.ralph/tasks.json` or `.ralph/progress.md` directly; return the structured completion report instead.',
    '- Update durable Ralph progress/tasks only when the prompt explicitly targets backlog replenishment.'
  ];
}

function buildExecutionContract(target: RalphPromptTarget, kind: RalphPromptKind, agentRole: RalphAgentRole, taskMode?: RalphTaskMode): string[] {
  if (kind === 'replenish-backlog') {
    const contract = [
      '1. Inspect the PRD, durable progress log, and current repo state before editing the task file.',
      '2. Replenish `.ralph/tasks.json` with the next coherent tasks only; do not broaden into unrelated planning.',
      '3. Keep tasks explicit, flat, and dependency-aware so the next Ralph iteration can select deterministically.',
      '4. Update `.ralph/progress.md` with a short note explaining why backlog replenishment was needed and what was added.'
    ];

    if (target === 'cliExec') {
      contract.push('5. Do not run broad validation just for backlog generation unless you also changed runnable code.');
      contract.push('6. End with the generated task ids and the next actionable task.');
    } else {
      contract.push('5. Surface any ambiguity or blocker that prevented a safe next task from being generated.');
      contract.push('6. End with the concrete next task a human or later Ralph iteration should pick up.');
    }

    return contract;
  }

  if (agentRole === 'review') {
    if (target === 'cliExec') {
      return [
        '1. Inspect the workspace facts and selected Ralph task before reviewing.',
        '2. Run the selected validation command when available and report the concrete result.',
        '3. Inspect changed files since the last completed task and identify missing test coverage, documentation gaps, or invariant violations.',
        '4. Do not make code changes. Emit proposed follow-up tasks in `suggestedChildTasks` instead of editing files or the task ledger.',
        '5. Set `requestedStatus` to `done` when no gaps are found; otherwise keep the task open with `in_progress` or `blocked` and explain why.',
        '6. End with a fenced `json` completion report block using `selectedTaskId`, `requestedStatus`, optional `progressNote`, optional `blocker`, optional `validationRan`, optional `needsHumanReview`, and optional `suggestedChildTasks`.'
      ];
    }

    return [
      '1. Inspect the workspace facts and selected Ralph task before reviewing.',
      '2. Validate when practical, then inspect changed files since the last completed task.',
      '3. Identify missing test coverage, documentation gaps, or invariant violations.',
      '4. Do not make code changes. Propose follow-up tasks instead of implementation work.',
      '5. Make the next human review decision explicit when gaps or blockers remain.',
      '6. End with the concrete review outcome and the next verification step.'
    ];
  }

  if (taskMode === 'documentation') {
    const docContract = [
      '1. Inspect the workspace facts and selected Ralph task before editing.',
      '2. Read and understand the code, modules, or features that the task asks you to document.',
      '3. Write or update documentation files as specified by the task.',
      '4. Do not edit `.ralph/tasks.json` or `.ralph/progress.md` for normal task execution; Ralph will reconcile selected-task state from your completion report.'
    ];

    if (target === 'cliExec') {
      docContract.push('5. Verify the documentation is accurate by cross-referencing the code it describes.');
      docContract.push('6. End with a fenced `json` completion report block for the selected task using `selectedTaskId`, `requestedStatus`, optional `progressNote`, optional `blocker`, optional `validationRan`, and optional `needsHumanReview`.');
    } else {
      docContract.push('5. If a blocker needs human judgment, surface it plainly instead of burying it.');
      docContract.push('6. End with the concrete next step a human can verify or run in the IDE.');
    }

    return docContract;
  }

  const contract = [
    '1. Inspect the workspace facts and selected Ralph task before editing.',
    '2. Execute only the selected task, or explain deterministically why no safe task is available.',
    '3. Implement the smallest coherent improvement that advances the task.',
    '4. Do not edit `.ralph/tasks.json` or `.ralph/progress.md` for normal task execution; Ralph will reconcile selected-task state from your completion report.'
  ];

  if (target === 'cliExec') {
    contract.push('5. Run the selected validation command when available and report the concrete result.');
    contract.push('6. End with a fenced `json` completion report block for the selected task using `selectedTaskId`, `requestedStatus`, optional `progressNote`, optional `blocker`, optional `validationRan`, and optional `needsHumanReview`.');
  } else {
    contract.push('5. If a blocker needs human judgment, surface it plainly instead of burying it.');
    contract.push('6. End with the concrete next step a human can verify or run in the IDE.');
  }

  return contract;
}

function buildFinalResponseContract(target: RalphPromptTarget, kind: RalphPromptKind, agentRole: RalphAgentRole, taskMode?: RalphTaskMode): string[] {
  if (kind === 'replenish-backlog') {
    return [
      '- Generated or updated task ids.',
      '- Why those tasks are the next coherent slice.',
      '- Whether a new actionable task now exists.',
      '- Any blocker that prevented safe backlog replenishment.'
    ];
  }

  if (agentRole === 'review') {
    return target === 'cliExec'
      ? [
          '- Validation results.',
          '- Reviewed files or review scope.',
          '- Missing test coverage, documentation gaps, or invariant violations.',
          '- Suggested follow-up tasks when gaps remain.',
          '- End with a fenced `json` completion report block for the selected task.'
        ]
      : [
          '- Reviewed files or review scope.',
          '- Validation run or still needed.',
          '- Review findings and proposed follow-up tasks.',
          '- The next concrete IDE or terminal verification step.'
        ];
  }

  if (taskMode === 'documentation') {
    return target === 'cliExec'
      ? [
          '- Created or updated documentation files.',
          '- Key code areas documented and their accuracy.',
          '- Assumptions or areas where documentation may be incomplete.',
          '- End with a fenced `json` completion report block for the selected task.'
        ]
      : [
          '- Created or updated documentation files.',
          '- Key code areas documented and their accuracy.',
          '- What is ready for human review.',
          '- The next concrete IDE or terminal step.'
        ];
  }

  if (target === 'cliExec') {
    return [
      '- Changed files.',
      '- Validation results.',
      '- Assumptions or blockers.',
      '- Known limitations or follow-up work.',
      '- End with a fenced `json` completion report block for the selected task.'
    ];
  }

  return [
    '- Changed files or inspected files.',
    '- What is ready for human review.',
    '- Validation run or still needed.',
    '- The next concrete IDE or terminal step.'
  ];
}

function renderTemplate(template: string, values: Record<string, string>): string {
  const missing = new Set<string>();
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

export async function resolvePromptTemplateDirectory(
  rootPath: string,
  overrideDirectory: string
): Promise<string> {
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

async function loadTemplate(
  kind: RalphPromptKind,
  rootPath: string,
  overrideDirectory: string,
  agentRole: RalphAgentRole
): Promise<{
  templatePath: string;
  templateText: string;
}> {
  const directory = await resolvePromptTemplateDirectory(rootPath, overrideDirectory);
  const templateFile = agentRole === 'review'
    ? REVIEW_AGENT_TEMPLATE_FILE
    : agentRole === 'watchdog'
      ? WATCHDOG_AGENT_TEMPLATE_FILE
      : agentRole === 'scm'
        ? SCM_AGENT_TEMPLATE_FILE
        : TEMPLATE_FILE_BY_KIND[kind];
  const templatePath = path.join(directory, templateFile);
  const templateText = await fs.readFile(templatePath, 'utf8').catch((error: unknown) => {
    throw new Error(`Failed to read Ralph prompt template ${templatePath}: ${error instanceof Error ? error.message : String(error)}`);
  });

  return {
    templatePath,
    templateText
  };
}

function hasAnyPriorPrompt(state: RalphWorkspaceState): boolean {
  return Boolean(state.lastPromptPath || state.lastPromptKind || state.lastRun || state.lastIteration);
}

export function decidePromptKind(
  state: RalphWorkspaceState,
  target: RalphPromptTarget,
  context?: PromptKindContext
): PromptKindDecision {
  const lastIteration = state.lastIteration;
  const taskLedgerDriftMessages = taskLedgerDriftMessagesFromDiagnostics(context?.taskInspectionDiagnostics, 1);

  if (isBacklogExhausted(context)) {
    return {
      kind: 'replenish-backlog',
      reason: taskLedgerDriftMessages.length > 0
        ? `The durable Ralph backlog appears exhausted, but task-ledger drift blocks safe task selection first: ${taskLedgerDriftMessages[0]}`
        : 'The current durable Ralph backlog is exhausted, so the next prompt should replenish `.ralph/tasks.json` before normal task execution resumes.'
    };
  }

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

  if (lastIteration?.completionClassification === 'complete'
    && lastIteration.stopReason === 'no_actionable_task') {
    return {
      kind: 'iteration',
      reason: 'The previous iteration completed and stopped because no executable Ralph task remains, so no failure-focused follow-up prompt is needed.'
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

export function choosePromptKind(
  state: RalphWorkspaceState,
  target: RalphPromptTarget,
  context?: PromptKindContext
): RalphPromptKind {
  return decidePromptKind(state, target, context).kind;
}

export function createPromptFileName(kind: RalphPromptKind, iteration: number): string {
  return `${kind}-${String(iteration).padStart(3, '0')}.prompt.md`;
}

export function createArtifactBaseName(kind: RalphPromptKind, iteration: number): string {
  return `${kind}-${String(iteration).padStart(3, '0')}`;
}

/**
 * Marker that appears in the rendered prompt immediately before the first dynamic section.
 * Everything before this marker is the static prefix — stable for a given kind/target/agentRole
 * and therefore eligible for prompt caching.
 */
export const STATIC_PREFIX_BOUNDARY = '\n\n## Template Selection\n';

/**
 * Extracts the static prefix from a fully-rendered prompt.
 * The static prefix contains sections that do not vary by task input:
 * system prompt, persona (Prompt Strategy), project conventions (Operating Rules),
 * and completion report instructions (Execution Contract, Final Response Contract).
 */
export function extractStaticPrefix(prompt: string): string {
  const idx = prompt.indexOf(STATIC_PREFIX_BOUNDARY);
  return idx === -1 ? prompt : prompt.slice(0, idx + 1);
}

export async function buildPrompt(input: PromptGenerationInput): Promise<PromptRenderResult> {
  const agentRole = effectiveAgentRole(input.config);
  const { templatePath, templateText } = await loadTemplate(
    input.kind,
    input.paths.rootPath,
    input.config.promptTemplateDirectory,
    agentRole
  );

  const taskLedgerDriftMessages = taskLedgerDriftMessagesFromDiagnostics(input.preflightReport.diagnostics);
  const budgetPolicy = buildPromptBudgetPolicy(
    input.kind,
    input.target,
    input.config.promptBudgetProfile ?? 'codex',
    input.config.customPromptBudget ?? {}
  );
  // === Static sections: stable for a given kind/target/agentRole ===
  // These sections do not vary by task input and form the cacheable static prefix of the prompt.
  // They must be assembled before all per-iteration dynamic sections (see template order).
  const staticSectionBodies = {
    strategyContext: buildStrategyContext(input.target, input.kind, agentRole, taskLedgerDriftMessages),
    operatingRules: buildOperatingRules(agentRole, input.selectedTask?.mode),
    executionContract: buildExecutionContract(input.target, input.kind, agentRole, input.selectedTask?.mode),
    finalResponseContract: buildFinalResponseContract(input.target, input.kind, agentRole, input.selectedTask?.mode)
  };

  // === Dynamic sections: vary by task, state, or iteration ===
  // These sections follow the static prefix and carry per-iteration context.
  const dynamicSectionBodies = {
    preflightContext: buildPreflightContext(input.preflightReport),
    objectiveContext: clipText(input.objectiveText, budgetPolicy.objectiveLines, budgetPolicy.objectiveChars),
    repoContext: buildRepoContext(
      input.summary,
      input.kind,
      input.target,
      input.selectedTask,
      budgetPolicy.repoDetail
    ),
    runtimeContext: buildRuntimeContext(
      input.state,
      input.paths,
      input.iteration,
      input.target,
      budgetPolicy.runtimeDetail
    ),
    taskContext: buildTaskContext(
      input.kind,
      input.taskFile,
      input.taskCounts,
      input.selectedTask,
      input.preflightReport,
      input.taskValidationHint,
      input.effectiveValidationCommand,
      input.normalizedValidationCommandFrom,
      input.validationCommand
    ),
    progressContext: clipText(input.progressText, budgetPolicy.progressLines, budgetPolicy.progressChars, true)
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line) => line.length > 0),
    priorIterationContext: buildPriorIterationContext(
      input.state,
      input.config.promptIncludeVerifierFeedback,
      Math.min(input.config.promptPriorContextBudget, budgetPolicy.priorBudget),
      input.paths.rootPath,
      input.selectedTask,
      input.sessionHandoff ?? null
    )
  };

  const sectionBodies = { ...staticSectionBodies, ...dynamicSectionBodies };

  const omittedSections = new Set<PromptSectionName>();
  const placeholderFor = (name: PromptSectionName): string => {
    if (!omittedSections.has(name)) {
      const value = sectionBodies[name];
      return Array.isArray(value) ? value.join('\n') : value;
    }

    switch (name) {
      case 'repoContext':
        return '- Omitted by prompt budget policy after core root and task context were captured in prompt evidence.';
      case 'runtimeContext':
        return '- Omitted by prompt budget policy after stable runtime pointers were captured in prompt evidence.';
      case 'progressContext':
        return '- Omitted by prompt budget policy because recent progress did not fit within the target prompt budget.';
      case 'priorIterationContext':
        return '- Omitted by prompt budget policy after the current failure/task context was kept.';
      default:
        return '- Omitted by prompt budget policy.';
    }
  };

  const renderPrompt = (): string => renderTemplate(templateText, {
    prompt_title: `# Ralph Prompt: ${input.kind} (${input.target})`,
    prompt_intro: PROMPT_INTRO_BY_KIND[input.kind],
    strategy_context: placeholderFor('strategyContext'),
    preflight_context: placeholderFor('preflightContext'),
    objective_context: placeholderFor('objectiveContext'),
    repo_context: placeholderFor('repoContext'),
    runtime_context: placeholderFor('runtimeContext'),
    task_context: placeholderFor('taskContext'),
    progress_context: placeholderFor('progressContext'),
    prior_iteration_context: placeholderFor('priorIterationContext'),
    operating_rules: placeholderFor('operatingRules'),
    execution_contract: placeholderFor('executionContract'),
    final_response_contract: placeholderFor('finalResponseContract'),
    template_selection_reason: input.selectionReason
  });

  let prompt = renderPrompt();
  let estimatedTokens = estimateTokenCount(prompt);
  for (const sectionName of budgetPolicy.optionalSectionOrder) {
    if (estimatedTokens <= budgetPolicy.targetTokens) {
      break;
    }

    omittedSections.add(sectionName);
    prompt = renderPrompt();
    estimatedTokens = estimateTokenCount(prompt);
  }

  const withinTarget = estimatedTokens <= budgetPolicy.targetTokens;
  const budgetDeltaTokens = estimatedTokens - budgetPolicy.targetTokens;

  const evidence: RalphPromptEvidence = {
    schemaVersion: 1,
    iteration: input.iteration,
    kind: input.kind,
    target: input.target,
    templatePath,
    selectionReason: input.selectionReason,
    selectedTaskId: input.selectedTask?.id ?? null,
    taskValidationHint: input.taskValidationHint,
    effectiveValidationCommand: input.effectiveValidationCommand,
    normalizedValidationCommandFrom: input.normalizedValidationCommandFrom,
    validationCommand: input.validationCommand,
    promptByteLength: Buffer.byteLength(prompt, 'utf8'),
    promptBudget: {
      policyName: budgetPolicy.name,
      budgetMode: omittedSections.size > 0 ? 'trimmed' : 'within_budget',
      targetTokens: budgetPolicy.targetTokens,
      minimumContextBias: budgetPolicy.minimumContextBias,
      estimatedTokens,
      withinTarget,
      budgetDeltaTokens,
      estimatedTokenRange: estimateTokenRange(estimatedTokens),
      requiredSections: budgetPolicy.requiredSections,
      optionalSections: budgetPolicy.optionalSectionOrder,
      omissionOrder: budgetPolicy.optionalSectionOrder,
      selectedSections: (Object.keys(sectionBodies) as PromptSectionName[])
        .filter((name) => !omittedSections.has(name)),
      omittedSections: Array.from(omittedSections)
    },
    inputs: {
      rootPolicy: deriveRootPolicy(input.summary),
      strategyContext: sectionBodies.strategyContext,
      preflightContext: sectionBodies.preflightContext,
      objectiveContext: sectionBodies.objectiveContext,
      repoContext: sectionBodies.repoContext,
      repoContextSnapshot: input.summary,
      runtimeContext: sectionBodies.runtimeContext,
      taskContext: sectionBodies.taskContext,
      progressContext: sectionBodies.progressContext,
      priorIterationContext: sectionBodies.priorIterationContext,
      operatingRules: sectionBodies.operatingRules,
      executionContract: sectionBodies.executionContract,
      finalResponseContract: sectionBodies.finalResponseContract
    }
  };

  return {
    prompt,
    templatePath,
    evidence
  };
}
