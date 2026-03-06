import * as path from 'path';
import { WorkspaceScan } from '../services/workspaceInspection';
import { RalphPaths } from '../ralph/pathResolver';
import { RalphPromptKind, RalphTaskCounts, RalphWorkspaceState } from '../ralph/types';

export interface PromptGenerationInput {
  kind: RalphPromptKind;
  iteration: number;
  objectiveText: string;
  progressText: string;
  tasksText: string;
  taskCounts: RalphTaskCounts;
  summary: WorkspaceScan;
  state: RalphWorkspaceState;
  paths: RalphPaths;
}

function section(title: string, body: string): string {
  return `## ${title}\n${body.trim()}\n`;
}

function repoFacts(summary: WorkspaceScan): string {
  const lines = [
    `- Workspace: ${summary.workspaceName}`,
    `- Root path: ${summary.rootPath}`,
    `- Manifests: ${summary.manifests.join(', ') || 'none detected'}`,
    `- Package managers: ${summary.packageManagers.join(', ') || 'unknown'}`,
    `- CI files: ${summary.ciFiles.join(', ') || 'none detected'}`,
    `- Docs: ${summary.docs.join(', ') || 'none detected'}`,
    `- Source roots: ${summary.sourceRoots.join(', ') || 'none detected'}`,
    `- Lifecycle commands: ${summary.lifecycleCommands.join(', ') || 'none detected'}`,
    `- Test signals: ${summary.testSignals.join(' | ') || 'unknown'}`
  ];

  if (summary.packageJson?.name) {
    lines.push(`- package.json name: ${summary.packageJson.name}`);
  }
  if (summary.packageJson?.hasWorkspaces) {
    lines.push('- package.json workspaces: yes');
  }
  if (summary.notes.length > 0) {
    lines.push(`- Notes: ${summary.notes.join(' | ')}`);
  }

  return lines.join('\n');
}

function taskSummary(taskCounts: RalphTaskCounts): string {
  return [
    `- todo: ${taskCounts.todo}`,
    `- in_progress: ${taskCounts.in_progress}`,
    `- blocked: ${taskCounts.blocked}`,
    `- done: ${taskCounts.done}`
  ].join('\n');
}

function stateSummary(state: RalphWorkspaceState, paths: RalphPaths): string {
  const lines = [
    `- Next iteration number: ${state.nextIteration}`,
    `- Last prompt kind: ${state.lastPromptKind ?? 'none yet'}`,
    `- Last prompt path: ${state.lastPromptPath ? path.relative(paths.rootPath, state.lastPromptPath) : 'none yet'}`,
    `- Last run: ${state.lastRun ? `${state.lastRun.status} at iteration ${state.lastRun.iteration}` : 'none yet'}`,
    `- PRD path: ${path.relative(paths.rootPath, paths.prdPath)}`,
    `- Progress path: ${path.relative(paths.rootPath, paths.progressPath)}`,
    `- Task file path: ${path.relative(paths.rootPath, paths.taskFilePath)}`,
    `- Runtime state path: ${path.relative(paths.rootPath, paths.stateFilePath)}`
  ];

  if (state.lastRun?.summary) {
    lines.push(`- Last run summary: ${state.lastRun.summary}`);
  }

  return lines.join('\n');
}

export function choosePromptKind(state: RalphWorkspaceState): RalphPromptKind {
  return state.runHistory.length === 0 ? 'bootstrap' : 'iteration';
}

export function createPromptFileName(kind: RalphPromptKind, iteration: number): string {
  return `${kind}-${String(iteration).padStart(3, '0')}.prompt.md`;
}

export function createArtifactBaseName(kind: RalphPromptKind, iteration: number): string {
  return `${kind}-${String(iteration).padStart(3, '0')}`;
}

export function buildPrompt(input: PromptGenerationInput): string {
  const title = input.kind === 'bootstrap'
    ? '# Ralph Codex Bootstrap Prompt'
    : `# Ralph Codex Iteration ${input.iteration}`;

  const intro = input.kind === 'bootstrap'
    ? 'You are starting a fresh Codex run inside an existing repository. Treat repository files as the source of truth.'
    : 'You are a fresh Codex run continuing work from durable repository state, not chat memory.';

  const operatingRules = [
    '- Read AGENTS.md, the PRD, the progress log, and the task file before making changes.',
    '- Do not invent undocumented Codex IDE APIs or unsupported prompt injection paths.',
    '- Prefer thin, reliable architecture and file-backed state over clever abstractions.',
    '- Make the smallest coherent change that materially advances the objective.',
    '- Validate using the repository’s real commands when they exist.',
    '- Update durable Ralph files when the task state or progress changes.'
  ].join('\n');

  const executionContract = [
    '1. Summarize what is real, stubbed, or risky before editing when that context matters.',
    '2. Pick the highest-value executable task.',
    '3. Implement the smallest coherent improvement.',
    '4. Run validation and report the concrete result.',
    '5. End with changed files, validation results, assumptions, limitations, and next steps.'
  ].join('\n');

  return [
    title,
    '',
    intro,
    '',
    section('Objective / PRD', input.objectiveText),
    section('Workspace Snapshot', repoFacts(input.summary)),
    section('Ralph Runtime State', stateSummary(input.state, input.paths)),
    section('Task Status Summary', taskSummary(input.taskCounts)),
    section('Current Progress Log', input.progressText || 'No progress log found.'),
    section('Current Task File', input.tasksText || 'No task file found.'),
    section('Operating Rules', operatingRules),
    section('Execution Contract', executionContract)
  ].join('\n');
}
