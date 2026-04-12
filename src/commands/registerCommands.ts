import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { readConfig } from '../config/readConfig';
import { CodexStrategyRegistry } from '../codex/providerFactory';
import { RalphIterationEngine } from '../ralph/iterationEngine';
import { RalphStateManager } from '../ralph/stateManager';
import {
  withTaskFileLock,
  parseTaskFile,
  stringifyTaskFile,
  bumpMutationCount
} from '../ralph/taskFile';
import type {
  RalphSuggestedChildTask,
  RalphTask,
  RalphTaskFile,
} from '../ralph/types';
import { Logger } from '../services/logger';
import { sleep } from '../util/async';
import { toErrorMessage } from '../util/error';
import { pathExists } from '../util/fs';
import { buildPrefixedAgentId } from '../util/validate';
import type { IterationBroadcaster } from '../ui/iterationBroadcaster';
import type { WebviewPanelManager } from '../webview/WebviewPanelManager';
import { PrdCreationWizardPanel } from '../ui/prdCreationWizardPanel';
import { requireTrustedWorkspace } from './workspaceSupport';
import {
  normalizeCompletionReportArtifact,
  readJsonArtifact
} from './statusSnapshot';
import { registerArtifactAndMaintenanceCommands } from './artifactCommands';
import {
  extractPrUrl,
  findResumablePipelineArtifacts,
  parsePrdSections,
  scaffoldPipelineRun,
  writePipelineArtifact,
  writePipelinePendingHandoff,
  readPipelinePendingHandoff,
  resolvePendingHandoffPath
} from '../ralph/pipeline';
import type { PipelinePhase, PipelineRunArtifact } from '../ralph/pipeline';
import type { RalphPaths } from '../ralph/pathResolver';
import type { RalphCodexConfig } from '../config/types';
import { resolveRalphPaths } from '../ralph/pathResolver';
import { generateProjectDraft, ProjectGenerationError } from '../ralph/projectGenerator';
import type { RecommendedSkill } from '../ralph/projectGenerator';
import { parseCrewRoster } from '../ralph/crewRoster';
import type { CrewMember } from '../ralph/crewRoster';
import {
  buildPrdWizardConfigSelections,
  writePrdWizardDraft
} from './prdWizardPersistence';
import {
  relativeWizardWriteSummary,
  type PrdWizardDraftBundle,
  type PrdWizardGenerateResult,
  type PrdWizardWriteResult
} from '../webview/prdCreationWizardHost';

interface RegisteredCommandSpec {
  commandId: string;
  label: string;
  requiresTrustedWorkspace?: boolean;
  cancellable?: boolean;
  handler: (progress: vscode.Progress<{ message?: string; increment?: number }>, token: vscode.CancellationToken) => Promise<void>;
}

function createdPathSummary(rootPath: string, createdPaths: string[]): string | null {
  if (createdPaths.length === 0) {
    return null;
  }

  const labels = createdPaths
    .map((target) => path.relative(rootPath, target) || path.basename(target))
    .join(', ');

  return `Initialized or repaired Ralph workspace paths: ${labels}.`;
}

const RALPH_GITIGNORE_CONTENT = [
  '/artifacts',
  '/done-task-audit*.md',
  '/logs',
  '/prompts',
  '/runs',
  '/state.json'
].join('\n');

const RALPH_PRD_PLACEHOLDER = '<!-- TODO: Replace with your Ralph objective before running iterations. -->\n';

async function withWorkspaceFolder(): Promise<vscode.WorkspaceFolder> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    throw new Error('Open a workspace folder before using Ralphdex.');
  }

  return folder;
}

async function showWarnings(warnings: string[]): Promise<void> {
  if (warnings.length === 0) {
    return;
  }

  await vscode.window.showWarningMessage(warnings.join(' '));
}

async function openTextFile(target: string): Promise<void> {
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(target));
  await vscode.window.showTextDocument(document, { preview: false });
}

async function initializeFreshWorkspace(rootPath: string): Promise<{
  ralphDir: string;
  prdPath: string;
  tasksPath: string;
  progressPath: string;
  gitignorePath: string;
}> {
  const ralphDir = path.join(rootPath, '.ralph');
  const prdPath = path.join(ralphDir, 'prd.md');
  const tasksPath = path.join(ralphDir, 'tasks.json');
  const progressPath = path.join(ralphDir, 'progress.md');
  const gitignorePath = path.join(ralphDir, '.gitignore');

  if (await pathExists(prdPath)) {
    throw new Error('Ralph workspace initialization aborted because .ralph/prd.md already exists.');
  }

  await fs.mkdir(ralphDir, { recursive: true });
  await fs.writeFile(prdPath, RALPH_PRD_PLACEHOLDER, 'utf8');
  const taskFileLocked = await withTaskFileLock(tasksPath, undefined, async () => {
    await fs.writeFile(tasksPath, `${JSON.stringify({ version: 2, tasks: [] }, null, 2)}\n`, 'utf8');
  });
  if (taskFileLocked.outcome === 'lock_timeout') {
    throw new Error(`Timed out acquiring tasks.json lock at ${taskFileLocked.lockPath} after ${taskFileLocked.attempts} attempt(s).`);
  }
  await fs.writeFile(progressPath, '', 'utf8');

  if (!(await pathExists(gitignorePath))) {
    await fs.writeFile(gitignorePath, `${RALPH_GITIGNORE_CONTENT}\n`, 'utf8');
  }

  return {
    ralphDir,
    prdPath,
    tasksPath,
    progressPath,
    gitignorePath
  };
}


/**
 * Derive initial task drafts from PRD text.
 * Returns tasks whose titles come from the PRD's headings (or a placeholder).
 * IDs start at T<offset+1>.
 */
function draftTasksFromPrd(prdText: string, idOffset = 0): Pick<RalphTask, 'id' | 'title' | 'status'>[] {
  const sections = parsePrdSections(prdText);
  return sections.map((title, i) => ({
    id: `T${idOffset + i + 1}`,
    title,
    status: 'todo' as const
  }));
}

/**
 * Return two self-bootstrapping seed tasks that guide Ralph through expanding
 * a stub PRD into a full document and then generating a real backlog from it.
 * Used as the fallback when AI generation is unavailable or the user skips
 * the objective prompt.
 */
function buildBootstrapSeedTasks(): Partial<RalphTask> & Pick<RalphTask, 'id' | 'title' | 'status'>[] {
  return [
    {
      id: 'T1',
      title: 'Expand PRD into a full product requirements document',
      status: 'todo' as const,
      notes:
        'Read the current content of .ralph/prd.md and expand it into a complete PRD. ' +
        'Include structured sections: # Title, ## Overview, ## Goals, ## Scope, ## Non-Goals, ' +
        'and 3–7 ## Work Area sections. Preserve the original user objective. ' +
        'Write the expanded PRD back to .ralph/prd.md.',
      acceptance: [
        'PRD contains a # title heading',
        'PRD contains ## Overview, ## Goals, and at least 3 ## work-area sections'
      ]
    },
    {
      id: 'T2',
      title: 'Create 10 new tasks in tasks.json based on the expanded PRD',
      status: 'todo' as const,
      dependsOn: ['T1'],
      notes:
        'Read the expanded PRD in .ralph/prd.md and create 10 actionable tasks in ' +
        '.ralph/tasks.json. Ensure at least 2 tasks have no dependencies (entry points) ' +
        'so Ralph can begin claiming work immediately. Use the v2 task schema: each task ' +
        'needs id, title, status, and optionally acceptance, dependsOn, context, and validation fields.',
      acceptance: [
        'tasks.json contains at least 10 new tasks beyond T1 and T2',
        'At least 2 of the new tasks have no dependsOn (entry points for Ralph)'
      ]
    }
  ] as (Partial<RalphTask> & Pick<RalphTask, 'id' | 'title' | 'status'>)[];
}

const RALPH_PROJECTS_DIR = 'projects';

/**
 * Produce a filesystem-safe slug from a human-readable project name.
 * Lowercases, collapses non-alphanumeric runs to hyphens, trims edge hyphens.
 */
function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

/** Absolute paths for a named project directory. */
function projectAbsolutePaths(ralphDir: string, slug: string): {
  dir: string; prdPath: string; tasksPath: string; progressPath: string;
} {
  const dir = path.join(ralphDir, RALPH_PROJECTS_DIR, slug);
  return {
    dir,
    prdPath: path.join(dir, 'prd.md'),
    tasksPath: path.join(dir, 'tasks.json'),
    progressPath: path.join(dir, 'progress.md')
  };
}

/** Workspace-relative settings values for a named project. */
function projectRelativePaths(slug: string): { prdPath: string; tasksPath: string; progressPath: string } {
  const base = `.ralph/${RALPH_PROJECTS_DIR}/${slug}`;
  return { prdPath: `${base}/prd.md`, tasksPath: `${base}/tasks.json`, progressPath: `${base}/progress.md` };
}

/**
 * List slugs of projects that already exist under .ralph/projects/.
 * A directory qualifies if it contains a prd.md file.
 */
async function listExistingProjects(ralphDir: string): Promise<string[]> {
  const projectsDir = path.join(ralphDir, RALPH_PROJECTS_DIR);
  try {
    const entries = await fs.readdir(projectsDir, { withFileTypes: true });
    const slugs: string[] = [];
    for (const entry of entries) {
      if (entry.isDirectory() && await pathExists(path.join(projectsDir, entry.name, 'prd.md'))) {
        slugs.push(entry.name);
      }
    }
    return slugs.sort();
  } catch {
    return [];
  }
}

/**
 * Update the three workspace settings that define which project Ralph uses.
 * Relative paths are resolved from the workspace root at runtime by readConfig.
 */
async function switchToProject(
  workspaceFolder: vscode.WorkspaceFolder,
  prdPath: string,
  tasksPath: string,
  progressPath: string
): Promise<void> {
  const config = vscode.workspace.getConfiguration('ralphCodex', workspaceFolder.uri);
  await config.update('prdPath', prdPath, vscode.ConfigurationTarget.Workspace);
  await config.update('ralphTaskFilePath', tasksPath, vscode.ConfigurationTarget.Workspace);
  await config.update('progressPath', progressPath, vscode.ConfigurationTarget.Workspace);
}

/**
 * Append tasks to an existing tasks.json file under lock.
 */
async function appendTasksToFile(
  tasksPath: string,
  newTasks: (Partial<RalphTask> & Pick<RalphTask, 'id' | 'title' | 'status'>)[]
): Promise<void> {
  if (newTasks.length === 0) {
    return;
  }

  const locked = await withTaskFileLock(tasksPath, undefined, async () => {
    const raw = await fs.readFile(tasksPath, 'utf8');
    const taskFile = parseTaskFile(raw);
    const next = bumpMutationCount({
      ...taskFile,
      tasks: [...taskFile.tasks, ...newTasks as RalphTask[]]
    });
    await fs.writeFile(tasksPath, stringifyTaskFile(next), 'utf8');
  });

  if (locked.outcome === 'lock_timeout') {
    throw new Error(`Timed out acquiring tasks.json lock at ${locked.lockPath} after ${locked.attempts} attempt(s).`);
  }
}

function buildWizardGenerationPrompt(input: {
  mode: 'new' | 'regenerate';
  projectType: string;
  objective: string;
  constraints: string;
  nonGoals: string;
}): string {
  if (input.mode === 'regenerate') {
    const suffix = [
      input.constraints.trim() ? `\n\n## Additional Constraints\n\n${input.constraints.trim()}` : '',
      input.nonGoals.trim() ? `\n\n## Additional Non-Goals\n\n${input.nonGoals.trim()}` : ''
    ].join('');
    return `${input.objective.trim()}${suffix}`;
  }

  const sections = [
    `Project type: ${input.projectType}`,
    '',
    'Objective:',
    input.objective.trim()
  ];

  if (input.constraints.trim()) {
    sections.push('', 'Constraints:', input.constraints.trim());
  }

  if (input.nonGoals.trim()) {
    sections.push('', 'Non-goals:', input.nonGoals.trim());
  }

  return sections.join('\n');
}

async function openPrdCreationWizard(
  panelManager: WebviewPanelManager | undefined,
  workspaceFolder: vscode.WorkspaceFolder,
  config: RalphCodexConfig,
  paths: RalphPaths,
  logger: Logger,
  options?: {
    mode?: 'new' | 'regenerate';
    initialObjective?: string;
    initialPrdPreview?: string;
    initialStep?: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  }
): Promise<void> {
  if (!panelManager) {
    throw new Error('PRD Creation Wizard is unavailable because the panel manager was not initialized.');
  }

  if (!(await pathExists(paths.ralphDir))) {
    void vscode.window.showErrorMessage(
      'No .ralph directory found. Run "Ralphdex: Initialize Workspace" first.'
    );
    return;
  }

  const recommendedSkillsPath = path.join(path.dirname(paths.prdPath), 'recommended-skills.json');

  PrdCreationWizardPanel.createOrReveal(panelManager, {
    initialMode: options?.mode ?? 'new',
    initialObjective: options?.initialObjective,
    initialPrdPreview: options?.initialPrdPreview,
    initialStep: options?.initialStep,
    initialPaths: {
      prdPath: paths.prdPath,
      tasksPath: paths.taskFilePath,
      recommendedSkillsPath
    },
    configSelections: buildPrdWizardConfigSelections(config),
    generateDraft: async (input): Promise<PrdWizardGenerateResult> => {
      const generated = await generateProjectDraft(
        buildWizardGenerationPrompt(input),
        config,
        workspaceFolder.uri.fsPath
      );
      return {
        prdText: generated.prdText,
        tasks: generated.tasks.map((task) => ({
          id: task.id,
          title: task.title,
          status: task.status,
          validation: task.validation
        })),
        recommendedSkills: generated.recommendedSkills,
        taskCountWarning: generated.taskCountWarning
      };
    },
    writeDraft: async (draft: PrdWizardDraftBundle): Promise<PrdWizardWriteResult> => {
      return writePrdWizardDraft(workspaceFolder, draft, {
        prdPath: paths.prdPath,
        tasksPath: paths.taskFilePath,
        recommendedSkillsPath
      });
    },
    onWriteComplete: async (result) => {
      logger.info('PRD wizard wrote Ralph files.', {
        filesWritten: result.filesWritten,
        settingsUpdated: result.settingsUpdated ?? [],
        settingsSkipped: result.settingsSkipped ?? []
      });
      await openTextFile(paths.prdPath);
      await openTextFile(paths.taskFilePath);
      const summary = relativeWizardWriteSummary(workspaceFolder.uri.fsPath, result);
      const updateSummary = summary.settingsUpdated && summary.settingsUpdated.length > 0
        ? ` Settings updated: ${summary.settingsUpdated.join(', ')}.`
        : '';
      const skipSummary = summary.settingsSkipped && summary.settingsSkipped.length > 0
        ? ` Skipped: ${summary.settingsSkipped.join(', ')}.`
        : '';
      void vscode.window.showInformationMessage(
        `PRD wizard wrote: ${summary.filesWritten.join(', ')}.${updateSummary}${skipSummary}`
      );
    }
  });
}

/**
 * Map the last completed pipeline phase to the phase that should run on resume.
 * Returns null for phases that are not resumable (artifact was in a terminal state).
 */
function phaseToResumeFrom(phase: PipelinePhase | undefined): 'loop' | 'review' | 'scm' | null {
  switch (phase) {
    case 'scaffold': return 'loop';
    case 'loop': return 'review';
    case 'review': return 'scm';
    case 'scm': return 'scm';
    default: return null;
  }
}

function buildReviewAgentId(agentId: string): string {
  return buildPrefixedAgentId('review', agentId);
}

function buildScmAgentId(agentId: string): string {
  return buildPrefixedAgentId('scm', agentId);
}

function renderSuggestedChildTasksForOutput(tasks: RalphSuggestedChildTask[]): string {
  const lines = ['Review agent proposed follow-up tasks:'];

  for (const task of tasks) {
    lines.push(`- ${task.id}: ${task.title}`);
    lines.push(`  parent: ${task.parentId}`);
    lines.push(`  rationale: ${task.rationale}`);
    lines.push(`  validation: ${task.validation ?? 'none'}`);
    lines.push(`  dependsOn: ${task.dependsOn.length > 0 ? task.dependsOn.map((dependency) => `${dependency.taskId} (${dependency.reason})`).join(', ') : 'none'}`);
  }

  lines.push('Run "Ralphdex: Apply Latest Task Decomposition Proposal" to commit these proposed child tasks.');
  return lines.join('\n');
}

function iterationFailureMessage(result: { iteration: number; execution: { transcriptPath?: string } }): string {
  return `codex exec failed on iteration ${result.iteration}. See ${result.execution.transcriptPath ?? 'the Ralph artifacts'} and the Ralphdex output channel.`;
}

function registerCommand(
  context: vscode.ExtensionContext,
  logger: Logger,
  spec: RegisteredCommandSpec
): void {
  context.subscriptions.push(vscode.commands.registerCommand(spec.commandId, async () => {
    logger.info('Command started.', {
      commandId: spec.commandId,
      workspaceTrusted: vscode.workspace.isTrusted
    });

    try {
      if (spec.requiresTrustedWorkspace ?? true) {
        requireTrustedWorkspace(spec.label);
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: spec.label,
          cancellable: spec.cancellable ?? false
        },
        async (progress, token) => spec.handler(progress, token)
      );

      logger.info('Command completed.', { commandId: spec.commandId });
    } catch (error) {
      logger.show(false);
      logger.error(`Command failed: ${spec.commandId}`, error);
      const choice = await vscode.window.showErrorMessage(toErrorMessage(error), 'Show Output');
      if (choice === 'Show Output') {
        logger.show(false);
      }
    }
  }));
}

export function registerCommands(
  context: vscode.ExtensionContext,
  logger: Logger,
  broadcaster?: IterationBroadcaster,
  panelManager?: WebviewPanelManager
): void {
  const stateManager = new RalphStateManager(context.workspaceState, logger);
  const strategies = new CodexStrategyRegistry(logger);
  const engine = new RalphIterationEngine(stateManager, strategies, logger);

  /**
   * Execute the post-scaffold pipeline phases starting at `startPhase`.
   * Writes a phase checkpoint to the artifact after each sub-phase completes
   * so a crash at any point leaves a resumable artifact on disk.
   *
   * Called by both `runPipeline` (after scaffold) and `resumePipeline` (after
   * determining the last completed phase from the artifact).
   */
  async function runPipelineFromPhase(
    startPhase: 'loop' | 'review' | 'scm',
    artifact: PipelineRunArtifact,
    workspaceFolder: vscode.WorkspaceFolder,
    config: RalphCodexConfig,
    paths: RalphPaths,
    progress: vscode.Progress<{ message?: string; increment?: number }>
  ): Promise<void> {
    let current = artifact;

    const checkpoint = async (updates: Partial<PipelineRunArtifact>): Promise<void> => {
      current = { ...current, ...updates };
      await writePipelineArtifact(paths.artifactDir, current);
    };

    // --- Loop phase ---
    let loopStatus: 'complete' | 'failed' = 'complete';
    if (startPhase === 'loop') {
      progress.report({ message: `Pipeline ${current.runId}: starting multi-agent loop (${current.decomposedTaskIds.length} task(s))` });
      try {
        await vscode.commands.executeCommand('ralphCodex.runMultiAgentLoop');
      } catch (error) {
        loopStatus = 'failed';
        logger.error('Pipeline multi-agent loop failed.', error);
      }
      if (loopStatus === 'complete') {
        await checkpoint({ phase: 'loop' });
      }
    }

    // --- Review phase ---
    let reviewTranscriptPath: string | undefined;
    let runScm = startPhase === 'scm';

    if (loopStatus === 'complete' && startPhase !== 'scm') {
      progress.report({ message: `Pipeline ${current.runId}: running review agent` });
      try {
        const reviewRun = await engine.runCliIteration(workspaceFolder, 'singleExec', progress, {
          reachedIterationCap: false,
          configOverrides: {
            agentRole: 'review',
            agentId: buildReviewAgentId(config.agentId)
          }
        });
        reviewTranscriptPath = reviewRun.result.execution.transcriptPath;
        await checkpoint({
          phase: 'review',
          ...(reviewTranscriptPath !== undefined && { reviewTranscriptPath })
        });

        if (reviewRun.result.executionStatus !== 'failed') {
          if (config.pipelineHumanGates) {
            const handoffPath = await writePipelinePendingHandoff(paths.handoffDir, {
              schemaVersion: 1,
              kind: 'pipelinePendingHandoff',
              runId: current.runId,
              artifactPath: path.join(paths.artifactDir, 'pipelines', `${current.runId}.json`),
              ...(reviewTranscriptPath !== undefined && { reviewTranscriptPath }),
              createdAt: new Date().toISOString()
            });
            await checkpoint({ status: 'awaiting_human_approval', loopEndTime: new Date().toISOString() });
            logger.info('Pipeline paused for human review.', { runId: current.runId, handoffPath });
            void vscode.window.showInformationMessage(
              `Ralph pipeline ${current.runId} paused for human review. Run "Ralphdex: Approve Human Review" to submit the PR.`
            );
            return;
          }
          runScm = true;
        }
      } catch (error) {
        logger.error('Pipeline review/SCM phase failed.', error);
      }
    }

    // --- SCM phase ---
    let prUrl: string | undefined;
    if (runScm) {
      progress.report({ message: `Pipeline ${current.runId}: running SCM agent` });
      try {
        const scmRun = await engine.runCliIteration(workspaceFolder, 'singleExec', progress, {
          reachedIterationCap: false,
          configOverrides: {
            agentRole: 'scm',
            agentId: buildScmAgentId(config.agentId)
          }
        });
        const scmReportPath = path.join(scmRun.result.artifactDir, 'completion-report.json');
        const scmReport = await readJsonArtifact(scmReportPath).then(normalizeCompletionReportArtifact);
        prUrl = extractPrUrl(scmReport?.report?.progressNote);
      } catch (error) {
        logger.error('Pipeline SCM phase failed.', error);
      }
    }

    // --- Finalize ---
    await checkpoint({
      status: loopStatus,
      loopEndTime: new Date().toISOString(),
      phase: 'done',
      ...(prUrl !== undefined && { prUrl })
    });

    logger.info('Pipeline run complete.', { runId: current.runId, status: loopStatus });
    const prSuffix = prUrl ? ` PR: ${prUrl}` : '';
    void vscode.window.showInformationMessage(
      `Ralph pipeline ${current.runId} finished with status: ${loopStatus}. Root task: ${current.rootTaskId} (${current.decomposedTaskIds.length} subtask(s)).${prSuffix}`
    );
  }

  registerCommand(context, logger, {
    commandId: 'ralphCodex.initializeWorkspace',
    label: 'Ralphdex: Initialize Workspace',
    handler: async (progress) => {
      progress.report({ message: 'Creating a fresh .ralph workspace scaffold' });
      const workspaceFolder = await withWorkspaceFolder();
      const prdPath = path.join(workspaceFolder.uri.fsPath, '.ralph', 'prd.md');

      if (await pathExists(prdPath)) {
        void vscode.window.showWarningMessage(
          'Ralph workspace initialization aborted because .ralph/prd.md already exists. Refusing to overwrite active Ralph state.'
        );
        return;
      }

      const result = await initializeFreshWorkspace(workspaceFolder.uri.fsPath);
      logger.info('Initialized a fresh Ralph workspace scaffold.', {
        rootPath: workspaceFolder.uri.fsPath,
        ralphDir: result.ralphDir,
        prdPath: result.prdPath,
        tasksPath: result.tasksPath,
        progressPath: result.progressPath,
        gitignorePath: result.gitignorePath
      });

      // Read config to know which CLI provider to use for generation
      const config = readConfig(workspaceFolder);

      // Step 1: Prompt for objective
      const objective = await vscode.window.showInputBox({
        prompt: 'Enter a short project objective (press Escape to fill in prd.md manually)',
        placeHolder: 'Example: Build a reliable v2 iteration engine for the VS Code extension',
        ignoreFocusOut: true
      });

      let prdText: string;
      let drafts: (Partial<RalphTask> & Pick<RalphTask, 'id' | 'title' | 'status'>)[];
      let skillsPath: string | undefined;

      if (objective?.trim()) {
        progress.report({ message: 'Generating PRD and tasks — this may take a moment…' });
        try {
          const generated = await generateProjectDraft(objective.trim(), config, workspaceFolder.uri.fsPath);
          prdText = generated.prdText;
          drafts = generated.tasks;
          if (generated.recommendedSkills.length > 0) {
            skillsPath = path.join(result.ralphDir, 'recommended-skills.json');
            await fs.writeFile(skillsPath, `${JSON.stringify(generated.recommendedSkills, null, 2)}\n`, 'utf8');
            logger.info('Wrote recommended-skills.json.', { skillCount: generated.recommendedSkills.length });
          }
          logger.info('Generated PRD and tasks via AI.', { taskCount: drafts.length });
        } catch (err) {
          const reason = err instanceof ProjectGenerationError || err instanceof Error
            ? err.message
            : String(err);
          logger.info(`AI generation failed, falling back to bootstrap seed tasks. Reason: ${reason}`);
          void vscode.window.showWarningMessage(
            `AI generation failed — files seeded with bootstrap tasks. Refine before running. (${reason})`
          );
          prdText = `# Product / project brief\n\n${objective.trim()}\n`;
          drafts = buildBootstrapSeedTasks();
        }
      } else {
        prdText = RALPH_PRD_PLACEHOLDER;
        drafts = buildBootstrapSeedTasks();
      }

      await fs.writeFile(result.prdPath, prdText, 'utf8');
      logger.info('Wrote prd.md.');

      // Step 2: Write starter tasks
      await appendTasksToFile(result.tasksPath, drafts);
      logger.info(`Wrote ${drafts.length} starter task(s) to tasks.json.`);

      // Open both files side-by-side so the user can review and refine
      await openTextFile(result.prdPath);
      await openTextFile(result.tasksPath);

      void vscode.window.showInformationMessage(
        `Ralph workspace ready. Review prd.md and tasks.json — refine them with your AI assistant before running your first loop.`,
        'Got it'
      );
    }
  });

  registerCommand(context, logger, {
    commandId: 'ralphCodex.addTask',
    label: 'Ralphdex: Add Task',
    handler: async () => {
      const workspaceFolder = await withWorkspaceFolder();
      const tasksPath = path.join(workspaceFolder.uri.fsPath, '.ralph', 'tasks.json');
      const prdPath = path.join(workspaceFolder.uri.fsPath, '.ralph', 'prd.md');

      if (!(await pathExists(tasksPath))) {
        void vscode.window.showErrorMessage(
          'No .ralph/tasks.json found. Run "Ralphdex: Initialize Workspace" first.'
        );
        return;
      }

      const raw = await fs.readFile(tasksPath, 'utf8');
      const taskFile = parseTaskFile(raw);
      const idOffset = taskFile.tasks.length;

      const prdText = (await pathExists(prdPath))
        ? await fs.readFile(prdPath, 'utf8')
        : '';

      const drafts = draftTasksFromPrd(prdText, idOffset);

      // Avoid collisions with existing IDs
      const existingIds = new Set(taskFile.tasks.map((t) => t.id));
      let counter = idOffset + 1;
      const deduped = drafts.map((t) => {
        while (existingIds.has(`T${counter}`)) {
          counter++;
        }
        const id = `T${counter}`;
        existingIds.add(id);
        counter++;
        return { ...t, id };
      });

      await appendTasksToFile(tasksPath, deduped);
      logger.info(`Generated ${deduped.length} task(s) from PRD via addTask command.`);

      await openTextFile(tasksPath);
      void vscode.window.showInformationMessage(
        `Added ${deduped.length} task(s) from PRD. Review and refine tasks.json before running your loop.`,
        'Got it'
      );
    }
  });

  registerCommand(context, logger, {
    commandId: 'ralphCodex.newProjectWizard',
    label: 'Ralphdex: New Project Wizard',
    handler: async () => {
      const workspaceFolder = await withWorkspaceFolder();
      const config = readConfig(workspaceFolder);
      const paths = resolveRalphPaths(workspaceFolder.uri.fsPath, config);
      await openPrdCreationWizard(panelManager, workspaceFolder, config, paths, logger, {
        mode: 'new',
        initialStep: 1
      });
    }
  });

  registerCommand(context, logger, {
    commandId: 'ralphCodex.newProject',
    label: 'Ralphdex: New Project',
    handler: async (progress) => {
      const workspaceFolder = await withWorkspaceFolder();
      const ralphDir = path.join(workspaceFolder.uri.fsPath, '.ralph');

      if (!(await pathExists(ralphDir))) {
        void vscode.window.showErrorMessage(
          'No .ralph directory found. Run "Ralphdex: Initialize Workspace" first.'
        );
        return;
      }

      const name = await vscode.window.showInputBox({
        prompt: 'Enter a name for the new project',
        placeHolder: 'Example: auth-refactor, api-v2, mobile-app',
        ignoreFocusOut: true,
        validateInput: (v) => {
          if (!v.trim()) { return 'Name is required'; }
          if (!slugify(v)) { return 'Name must contain at least one letter or number'; }
          return null;
        }
      });

      if (!name?.trim()) { return; }

      const slug = slugify(name.trim());
      const absPaths = projectAbsolutePaths(ralphDir, slug);

      if (await pathExists(absPaths.prdPath)) {
        void vscode.window.showWarningMessage(
          `Project "${slug}" already exists. Use "Ralphdex: Switch Project" to select it.`
        );
        return;
      }

      const objective = await vscode.window.showInputBox({
        prompt: `Describe the objective for "${slug}" (press Escape to fill in manually)`,
        placeHolder: 'Example: Redesign the authentication layer with OAuth2 support',
        ignoreFocusOut: true
      });

      progress.report({ message: `Creating project "${slug}"` });
      await fs.mkdir(absPaths.dir, { recursive: true });

      const config = readConfig(workspaceFolder);

      let prdText: string;
      let drafts: (Partial<RalphTask> & Pick<RalphTask, 'id' | 'title' | 'status'>)[];

      if (objective?.trim()) {
        progress.report({ message: 'Generating PRD and tasks — this may take a moment…' });
        try {
          const generated = await generateProjectDraft(objective.trim(), config, workspaceFolder.uri.fsPath);
          prdText = generated.prdText;
          drafts = generated.tasks;
          if (generated.recommendedSkills.length > 0) {
            const skillsPath = path.join(absPaths.dir, 'recommended-skills.json');
            await fs.writeFile(skillsPath, `${JSON.stringify(generated.recommendedSkills, null, 2)}\n`, 'utf8');
            logger.info(`Wrote recommended-skills.json for project "${slug}".`, { skillCount: generated.recommendedSkills.length });
          }
          logger.info(`Generated PRD and tasks for project "${slug}" via AI.`, { taskCount: drafts.length });
        } catch (err) {
          const reason = err instanceof ProjectGenerationError || err instanceof Error
            ? err.message
            : String(err);
          logger.info(`AI generation failed for "${slug}", falling back to bootstrap seed tasks. Reason: ${reason}`);
          void vscode.window.showWarningMessage(
            `AI generation failed — files seeded with bootstrap tasks. Refine before running. (${reason})`
          );
          prdText = `# Product / project brief\n\n${objective.trim()}\n`;
          drafts = buildBootstrapSeedTasks();
        }
      } else {
        prdText = RALPH_PRD_PLACEHOLDER;
        drafts = buildBootstrapSeedTasks();
      }

      await fs.writeFile(absPaths.prdPath, prdText, 'utf8');

      const emptyLocked = await withTaskFileLock(absPaths.tasksPath, undefined, async () => {
        await fs.writeFile(absPaths.tasksPath, `${JSON.stringify({ version: 2, tasks: [] }, null, 2)}\n`, 'utf8');
      });
      if (emptyLocked.outcome === 'lock_timeout') {
        throw new Error(`Timed out acquiring lock for "${slug}" tasks.json.`);
      }

      await appendTasksToFile(absPaths.tasksPath, drafts);
      await fs.writeFile(absPaths.progressPath, '', 'utf8');

      logger.info(`Created new Ralph project "${slug}".`, { dir: absPaths.dir });

      const relPaths = projectRelativePaths(slug);
      await switchToProject(workspaceFolder, relPaths.prdPath, relPaths.tasksPath, relPaths.progressPath);

      await openTextFile(absPaths.prdPath);
      await openTextFile(absPaths.tasksPath);

      void vscode.window.showInformationMessage(
        `Project "${slug}" created and active. Review prd.md and tasks.json, then run your loop.`,
        'Got it'
      );
    }
  });

  registerCommand(context, logger, {
    commandId: 'ralphCodex.switchProject',
    label: 'Ralphdex: Switch Project',
    handler: async () => {
      const workspaceFolder = await withWorkspaceFolder();
      const ralphDir = path.join(workspaceFolder.uri.fsPath, '.ralph');

      const slugs = await listExistingProjects(ralphDir);

      type ProjectItem = vscode.QuickPickItem & { slug: string };
      const items: ProjectItem[] = [
        { label: '$(home) default', description: '.ralph/prd.md  ·  .ralph/tasks.json', slug: '__default__' },
        ...slugs.map((slug): ProjectItem => ({
          label: `$(folder) ${slug}`,
          description: `.ralph/projects/${slug}/prd.md`,
          slug
        }))
      ];

      if (slugs.length === 0) {
        void vscode.window.showInformationMessage(
          'No named projects yet. Use "Ralphdex: New Project" to create one.'
        );
        return;
      }

      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a Ralph project to make active',
        ignoreFocusOut: true
      });

      if (!picked) { return; }

      if (picked.slug === '__default__') {
        await switchToProject(workspaceFolder, '.ralph/prd.md', '.ralph/tasks.json', '.ralph/progress.md');
        void vscode.window.showInformationMessage('Switched to default Ralph project.');
      } else {
        const relPaths = projectRelativePaths(picked.slug);
        await switchToProject(workspaceFolder, relPaths.prdPath, relPaths.tasksPath, relPaths.progressPath);
        void vscode.window.showInformationMessage(`Switched to project "${picked.slug}".`);
      }
    }
  });

  registerCommand(context, logger, {
    commandId: 'ralphCodex.generatePrompt',
    label: 'Ralphdex: Prepare Prompt',
    handler: async (progress) => {
      const workspaceFolder = await withWorkspaceFolder();
      const prepared = await engine.preparePrompt(workspaceFolder, progress);
      const recordState = await stateManager.recordPrompt(
        prepared.rootPath,
        prepared.paths,
        prepared.state,
        prepared.promptKind,
        prepared.promptPath,
        prepared.objectiveText
      );

      if (prepared.config.clipboardAutoCopy) {
        const clipboardStrategy = strategies.getById('clipboard');
        const result = await clipboardStrategy.handoffPrompt?.({
          prompt: prepared.prompt,
          promptPath: prepared.promptPath,
          promptKind: prepared.promptKind,
          iteration: prepared.iteration,
          copyToClipboard: true,
          openSidebarCommandId: prepared.config.openSidebarCommandId,
          newChatCommandId: prepared.config.newChatCommandId
        });

        if (result) {
          await showWarnings(result.warnings);
        }
      }

      logger.info('Prompt generated and stored.', {
        promptPath: prepared.promptPath,
        promptArtifactPath: prepared.executionPlan.promptArtifactPath,
        promptHash: prepared.executionPlan.promptHash,
        executionPlanPath: prepared.executionPlanPath,
        nextIteration: recordState.nextIteration,
        promptKind: prepared.promptKind,
        promptTarget: prepared.executionPlan.promptTarget,
        selectedTaskId: prepared.selectedTask?.id ?? null,
        validationCommand: prepared.validationCommand
      });

      const note = createdPathSummary(prepared.rootPath, prepared.createdPaths);
      void vscode.window.showInformationMessage(
        note
          ? `Prepared ${prepared.promptKind} prompt at ${path.basename(prepared.promptPath)}. ${note}`
          : `Prepared ${prepared.promptKind} prompt at ${path.basename(prepared.promptPath)}.`
      );
    }
  });

  registerCommand(context, logger, {
    commandId: 'ralphCodex.openCodexAndCopyPrompt',
    label: 'Ralphdex: Open Codex IDE',
    handler: async (progress) => {
      const workspaceFolder = await withWorkspaceFolder();
      const prepared = await engine.preparePrompt(workspaceFolder, progress);
      const strategy = strategies.getPromptHandoffStrategy(prepared.config.preferredHandoffMode);
      const result = await strategy.handoffPrompt?.({
        prompt: prepared.prompt,
        promptPath: prepared.promptPath,
        promptKind: prepared.promptKind,
        iteration: prepared.iteration,
        copyToClipboard: true,
        openSidebarCommandId: prepared.config.openSidebarCommandId,
        newChatCommandId: prepared.config.newChatCommandId
      });

      await stateManager.recordPrompt(
        prepared.rootPath,
        prepared.paths,
        prepared.state,
        prepared.promptKind,
        prepared.promptPath,
        prepared.objectiveText
      );

      if (prepared.config.preferredHandoffMode === 'cliExec') {
        await vscode.window.showWarningMessage(
          'preferredHandoffMode is cliExec. This IDE command still falls back to clipboard handoff; use Run CLI Iteration for codex exec.'
        );
      }

      if (result) {
        await showWarnings(result.warnings);
        if (result.success) {
          void vscode.window.showInformationMessage(result.message);
        } else {
          void vscode.window.showWarningMessage(result.message);
        }
      }
    }
  });

  registerCommand(context, logger, {
    commandId: 'ralphCodex.runRalphIteration',
    label: 'Ralphdex: Run CLI Iteration',
    handler: async (progress) => {
      const workspaceFolder = await withWorkspaceFolder();
      const config = readConfig(workspaceFolder);
      broadcaster?.emitIterationStart({
        iteration: 0,
        iterationCap: 1,
        selectedTaskId: null,
        selectedTaskTitle: null,
        agentId: config.agentId
      });
      const run = await engine.runCliIteration(workspaceFolder, 'singleExec', progress, {
        reachedIterationCap: false,
        configOverrides: { agentId: config.agentId },
        broadcaster
      });
      broadcaster?.emitIterationEnd({
        iteration: run.result.iteration,
        classification: run.result.completionClassification,
        stopReason: run.result.stopReason
      });

      if (run.result.executionStatus === 'failed') {
        throw new Error(iterationFailureMessage(run.result));
      }

      const note = createdPathSummary(run.prepared.rootPath, run.createdPaths);
      const baseMessage = run.result.executionStatus === 'skipped'
        ? `Ralph CLI iteration ${run.result.iteration} was skipped. ${run.loopDecision.message}`
        : `Ralph CLI iteration ${run.result.iteration} completed. ${run.result.summary}`;

      void vscode.window.showInformationMessage(note ? `${baseMessage} ${note}` : baseMessage);
    }
  });

  registerCommand(context, logger, {
    commandId: 'ralphCodex.runReviewAgent',
    label: 'Ralph: Run Review Agent',
    handler: async (progress) => {
      const workspaceFolder = await withWorkspaceFolder();
      const config = readConfig(workspaceFolder);
      const run = await engine.runCliIteration(workspaceFolder, 'singleExec', progress, {
        reachedIterationCap: false,
        configOverrides: {
          agentRole: 'review',
          agentId: buildReviewAgentId(config.agentId)
        }
      });

      if (run.result.executionStatus === 'failed') {
        throw new Error(iterationFailureMessage(run.result));
      }

      const completionReportPath = path.join(run.result.artifactDir, 'completion-report.json');
      const completionArtifact = await readJsonArtifact(completionReportPath).then(normalizeCompletionReportArtifact);
      const suggestedChildTasks = completionArtifact?.report?.suggestedChildTasks ?? [];
      if (suggestedChildTasks.length > 0) {
        logger.show(false);
        logger.appendText(renderSuggestedChildTasksForOutput(suggestedChildTasks));

        const choice = await vscode.window.showInformationMessage(
          `Review agent proposed ${suggestedChildTasks.length} follow-up task(s). Run Apply Latest Task Decomposition Proposal to commit them.`,
          'Apply Latest Task Decomposition Proposal',
          'Show Output'
        );
        if (choice === 'Apply Latest Task Decomposition Proposal') {
          await vscode.commands.executeCommand('ralphCodex.applyLatestTaskDecompositionProposal');
        } else if (choice === 'Show Output') {
          logger.show(false);
        }
      }

      const note = createdPathSummary(run.prepared.rootPath, run.createdPaths);
      const baseMessage = run.result.executionStatus === 'skipped'
        ? `Ralph review iteration ${run.result.iteration} was skipped. ${run.loopDecision.message}`
        : `Ralph review iteration ${run.result.iteration} completed. ${run.result.summary}`;

      void vscode.window.showInformationMessage(note ? `${baseMessage} ${note}` : baseMessage);
    }
  });

  registerCommand(context, logger, {
    commandId: 'ralphCodex.runWatchdogAgent',
    label: 'Ralph: Run Watchdog Agent',
    handler: async (progress) => {
      const workspaceFolder = await withWorkspaceFolder();
      const run = await engine.runCliIteration(workspaceFolder, 'singleExec', progress, {
        reachedIterationCap: false,
        configOverrides: {
          agentRole: 'watchdog',
          agentId: 'watchdog'
        }
      });

      if (run.result.executionStatus === 'failed') {
        throw new Error(iterationFailureMessage(run.result));
      }

      const note = createdPathSummary(run.prepared.rootPath, run.createdPaths);
      const baseMessage = run.result.executionStatus === 'skipped'
        ? `Ralph watchdog iteration ${run.result.iteration} was skipped. ${run.loopDecision.message}`
        : `Ralph watchdog iteration ${run.result.iteration} completed. ${run.result.summary}`;

      void vscode.window.showInformationMessage(note ? `${baseMessage} ${note}` : baseMessage);
    }
  });

  registerCommand(context, logger, {
    commandId: 'ralphCodex.runScmAgent',
    label: 'Ralph: Run SCM Agent',
    handler: async (progress) => {
      const workspaceFolder = await withWorkspaceFolder();
      const config = readConfig(workspaceFolder);
      const run = await engine.runCliIteration(workspaceFolder, 'singleExec', progress, {
        reachedIterationCap: false,
        configOverrides: {
          agentRole: 'scm',
          agentId: buildScmAgentId(config.agentId)
        }
      });

      if (run.result.executionStatus === 'failed') {
        throw new Error(iterationFailureMessage(run.result));
      }

      const note = createdPathSummary(run.prepared.rootPath, run.createdPaths);
      const baseMessage = run.result.executionStatus === 'skipped'
        ? `Ralph SCM iteration ${run.result.iteration} was skipped. ${run.loopDecision.message}`
        : `Ralph SCM iteration ${run.result.iteration} completed. ${run.result.summary}`;

      void vscode.window.showInformationMessage(note ? `${baseMessage} ${note}` : baseMessage);
    }
  });

  registerCommand(context, logger, {
    commandId: 'ralphCodex.runRalphLoop',
    label: 'Ralphdex: Run CLI Loop',
    cancellable: true,
    handler: async (progress, token) => {
      const workspaceFolder = await withWorkspaceFolder();
      const config = readConfig(workspaceFolder);
      logger.show(false);
      logger.info('Starting Ralph loop.', {
        rootPath: workspaceFolder.uri.fsPath,
        iterationCap: config.ralphIterationCap,
        verifierModes: config.verifierModes,
        noProgressThreshold: config.noProgressThreshold,
        repeatedFailureThreshold: config.repeatedFailureThreshold
      });

      broadcaster?.emitLoopStart(config.ralphIterationCap);
      let lastRun: Awaited<ReturnType<RalphIterationEngine['runCliIteration']>> | null = null;
      for (let index = 0; index < config.ralphIterationCap; index += 1) {
        if (token.isCancellationRequested) {
          broadcaster?.emitLoopEnd(index, 'cancelled');
          void vscode.window.showInformationMessage(`Ralph CLI loop cancelled after ${index} iteration(s).`);
          return;
        }

        progress.report({
          message: `Running Ralph loop iteration ${index + 1} of ${config.ralphIterationCap}`,
          increment: 100 / config.ralphIterationCap
        });

        broadcaster?.emitIterationStart({
          iteration: index + 1,
          iterationCap: config.ralphIterationCap,
          selectedTaskId: null,
          selectedTaskTitle: null,
          agentId: config.agentId
        });

        lastRun = await engine.runCliIteration(workspaceFolder, 'loop', progress, {
          reachedIterationCap: index + 1 >= config.ralphIterationCap,
          configOverrides: { agentId: config.agentId },
          broadcaster
        });

        broadcaster?.emitIterationEnd({
          iteration: lastRun.result.iteration,
          classification: lastRun.result.completionClassification,
          stopReason: lastRun.result.stopReason
        });

        if (lastRun.result.executionStatus === 'failed') {
          broadcaster?.emitLoopEnd(index + 1, 'execution_failed');
          throw new Error(iterationFailureMessage(lastRun.result));
        }

        if (lastRun.autoReviewContext && config.autoReviewOnParentDone) {
          progress.report({ message: `Parent ${lastRun.autoReviewContext.parentTaskId} done — running review agent` });
          try {
            await engine.runCliIteration(workspaceFolder, 'singleExec', progress, {
              reachedIterationCap: false,
              configOverrides: { agentRole: 'review', agentId: buildReviewAgentId(config.agentId) },
              focusTaskId: lastRun.autoReviewContext.parentTaskId
            });
          } catch (reviewError) {
            logger.warn('Auto-review after parent-done failed.', { error: toErrorMessage(reviewError) });
          }
        }

        if (!lastRun.loopDecision.shouldContinue) {
          if (
            lastRun.result.stopReason === 'control_plane_reload_required'
            && config.autoReloadOnControlPlaneChange
          ) {
            logger.info('Ralph is reloading the extension host to apply control-plane changes.', {
              iteration: lastRun.result.iteration,
              stopReason: lastRun.result.stopReason
            });
            await sleep(1500);
            await vscode.commands.executeCommand('workbench.action.reloadWindow');
            return;
          }

          const isStallStop = lastRun.result.stopReason === 'repeated_no_progress'
            || lastRun.result.stopReason === 'repeated_identical_failure';
          if (isStallStop && config.autoWatchdogOnStall) {
            progress.report({ message: 'Loop stalled — running watchdog agent' });
            try {
              await engine.runCliIteration(workspaceFolder, 'singleExec', progress, {
                reachedIterationCap: false,
                configOverrides: { agentRole: 'watchdog', agentId: 'watchdog' }
              });
            } catch (watchdogError) {
              logger.warn('Auto-watchdog after stall failed.', { error: toErrorMessage(watchdogError) });
            }
          }

          broadcaster?.emitLoopEnd(index + 1, lastRun.result.stopReason);
          void vscode.window.showInformationMessage(
            `Ralph CLI loop stopped after iteration ${lastRun.result.iteration}: ${lastRun.loopDecision.message}`
          );
          return;
        }
      }

      if (config.autoReviewOnLoopComplete && lastRun) {
        progress.report({ message: 'Loop complete — running review agent' });
        try {
          await engine.runCliIteration(workspaceFolder, 'singleExec', progress, {
            reachedIterationCap: false,
            configOverrides: { agentRole: 'review', agentId: buildReviewAgentId(config.agentId) }
          });
        } catch (reviewError) {
          logger.warn('Auto-review on loop complete failed.', { error: toErrorMessage(reviewError) });
        }
      }

      broadcaster?.emitLoopEnd(config.ralphIterationCap, lastRun?.result.stopReason ?? null);
      void vscode.window.showInformationMessage(
        lastRun
          ? `Ralph CLI loop completed ${config.ralphIterationCap} iteration(s). Last outcome: ${lastRun.result.completionClassification}.`
          : 'Ralph CLI loop completed with no iterations.'
      );
    }
  });

  registerCommand(context, logger, {
    commandId: 'ralphCodex.runMultiAgentLoop',
    label: 'Ralphdex: Run Multi-Agent Loop',
    cancellable: true,
    handler: async (progress, token) => {
      const workspaceFolder = await withWorkspaceFolder();
      const config = readConfig(workspaceFolder);
      const agentCount = config.agentCount;

      logger.show(false);
      logger.info('Starting multi-agent loop.', {
        rootPath: workspaceFolder.uri.fsPath,
        agentCount,
        iterationCap: config.ralphIterationCap
      });

      if (agentCount < 2) {
        void vscode.window.showWarningMessage(
          'ralphCodex.agentCount is 1. Running a single-agent loop. Set agentCount ≥ 2 for concurrent multi-agent mode.'
        );
      }

      // Resolve crew roster from .ralph/crew.json when present; fall back to agentCount synthesis.
      const crewJsonPath = path.join(workspaceFolder.uri.fsPath, '.ralph', 'crew.json');
      const crewResult = await parseCrewRoster(crewJsonPath);
      for (const warning of crewResult.warnings) {
        logger.warn(`crew.json: ${warning}`);
      }

      type AgentSlot = { slotIndex: number; agentId: string; crewMember?: CrewMember };
      let agentSlots: AgentSlot[];
      if (crewResult.members !== null && crewResult.members.length > 0) {
        agentSlots = crewResult.members.map((member, i) => ({
          slotIndex: i,
          agentId: member.id,
          crewMember: member
        }));
        logger.info('Multi-agent loop: using crew.json roster.', {
          memberCount: agentSlots.length,
          ids: agentSlots.map((slot) => slot.agentId).join(', ')
        });
      } else {
        // Fall back to anonymous agentId-N synthesis from agentCount.
        agentSlots = Array.from({ length: agentCount }, (_, i) => ({
          slotIndex: i,
          agentId: agentCount > 1 ? `${config.agentId}-${i + 1}` : config.agentId
        }));
      }

      progress.report({ message: `Starting ${agentSlots.length} concurrent agent loop(s)` });
      broadcaster?.emitLoopStart(config.ralphIterationCap);

      type SlotResult = { agentId: string; lastRun: Awaited<ReturnType<RalphIterationEngine['runCliIteration']>> | null; reloadRequired: boolean };

      const agentLoops = agentSlots.map(async ({ agentId, crewMember }): Promise<SlotResult> => {
        let lastRun: Awaited<ReturnType<RalphIterationEngine['runCliIteration']>> | null = null;

        for (let index = 0; index < config.ralphIterationCap; index += 1) {
          if (token.isCancellationRequested) {
            logger.info('Multi-agent loop: cancelled by user.', { agentId, iteration: index });
            return { agentId, lastRun, reloadRequired: false };
          }

          broadcaster?.emitIterationStart({
            iteration: index + 1,
            iterationCap: config.ralphIterationCap,
            selectedTaskId: null,
            selectedTaskTitle: null,
            agentId
          });

          lastRun = await engine.runCliIteration(workspaceFolder, 'loop', progress, {
            reachedIterationCap: index + 1 >= config.ralphIterationCap,
            configOverrides: { agentId, ...(crewMember ? { agentRole: crewMember.role } : {}) },
            broadcaster
          });

          broadcaster?.emitIterationEnd({
            iteration: lastRun.result.iteration,
            classification: lastRun.result.completionClassification,
            stopReason: lastRun.result.stopReason,
            agentId
          });

          if (lastRun.result.executionStatus === 'failed') {
            throw new Error(`Agent ${agentId}: ${iterationFailureMessage(lastRun.result)}`);
          }

          if (lastRun.autoReviewContext && config.autoReviewOnParentDone) {
            try {
              await engine.runCliIteration(workspaceFolder, 'singleExec', progress, {
                reachedIterationCap: false,
                configOverrides: { agentRole: 'review', agentId: buildReviewAgentId(agentId) },
                focusTaskId: lastRun.autoReviewContext.parentTaskId
              });
            } catch (reviewError) {
              logger.warn('Multi-agent auto-review after parent-done failed.', { agentId, error: toErrorMessage(reviewError) });
            }
          }

          if (!lastRun.loopDecision.shouldContinue) {
            if (
              lastRun.result.stopReason === 'control_plane_reload_required'
              && config.autoReloadOnControlPlaneChange
            ) {
              logger.info('Multi-agent loop: agent hit control-plane change.', { agentId, iteration: lastRun.result.iteration });
              return { agentId, lastRun, reloadRequired: true };
            }

            const isStallStop = lastRun.result.stopReason === 'repeated_no_progress'
              || lastRun.result.stopReason === 'repeated_identical_failure';
            if (isStallStop && config.autoWatchdogOnStall) {
              try {
                await engine.runCliIteration(workspaceFolder, 'singleExec', progress, {
                  reachedIterationCap: false,
                  configOverrides: { agentRole: 'watchdog', agentId: 'watchdog' }
                });
              } catch (watchdogError) {
                logger.warn('Multi-agent auto-watchdog after stall failed.', { agentId, error: toErrorMessage(watchdogError) });
              }
            }

            logger.info('Multi-agent loop: agent stopped early.', {
              agentId,
              iteration: lastRun.result.iteration,
              stopReason: lastRun.result.stopReason,
              message: lastRun.loopDecision.message
            });
            return { agentId, lastRun, reloadRequired: false };
          }
        }

        return { agentId, lastRun, reloadRequired: false };
      });

      const settled = await Promise.allSettled(agentLoops);

      const failures = settled.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      const fulfilled = settled.filter((r): r is PromiseFulfilledResult<SlotResult> => r.status === 'fulfilled');

      if (fulfilled.some((r) => r.value.reloadRequired)) {
        logger.info('Multi-agent loop: reloading extension host to apply control-plane changes.', {});
        await sleep(1500);
        await vscode.commands.executeCommand('workbench.action.reloadWindow');
        return;
      }

      if (failures.length > 0) {
        const messages = failures.map((r) => toErrorMessage(r.reason)).join('; ');
        throw new Error(`${failures.length} of ${agentSlots.length} agent(s) failed: ${messages}`);
      }

      const summary = fulfilled
        .map(({ value: { agentId, lastRun } }) =>
          lastRun ? `${agentId}: ${lastRun.result.completionClassification}` : `${agentId}: no iterations`
        )
        .join('; ');

      broadcaster?.emitLoopEnd(config.ralphIterationCap, null);

      void vscode.window.showInformationMessage(
        `Ralph multi-agent loop finished (${agentSlots.length} agent(s)). ${summary}`
      );
    }
  });

  registerCommand(context, logger, {
    commandId: 'ralphCodex.runPipeline',
    label: 'Ralphdex: Run Pipeline',
    handler: async (progress) => {
      const workspaceFolder = await withWorkspaceFolder();
      const config = readConfig(workspaceFolder);
      const paths = resolveRalphPaths(workspaceFolder.uri.fsPath, config);

      progress.report({ message: 'Scaffolding pipeline: decomposing PRD into tasks' });

      const { artifact, artifactPath, rootTaskId, childTaskIds } = await scaffoldPipelineRun({
        prdPath: paths.prdPath,
        taskFilePath: paths.taskFilePath,
        artifactDir: paths.artifactDir
      });

      logger.info('Pipeline scaffold created.', { runId: artifact.runId, rootTaskId, childTaskIds, artifactPath });

      await runPipelineFromPhase('loop', artifact, workspaceFolder, config, paths, progress);
    }
  });

  registerCommand(context, logger, {
    commandId: 'ralphCodex.resumePipeline',
    label: 'Ralphdex: Resume Pipeline',
    handler: async (progress) => {
      const workspaceFolder = await withWorkspaceFolder();
      const config = readConfig(workspaceFolder);
      const paths = resolveRalphPaths(workspaceFolder.uri.fsPath, config);

      const resumable = await findResumablePipelineArtifacts(paths.artifactDir);
      if (resumable.length === 0) {
        void vscode.window.showWarningMessage('No resumable pipeline runs found.');
        return;
      }

      let selected: { artifact: PipelineRunArtifact; artifactPath: string };
      if (resumable.length === 1) {
        selected = resumable[0];
      } else {
        const items = resumable.map(({ artifact }) => ({
          label: artifact.runId,
          description: `phase: ${artifact.phase ?? 'unknown'}, started: ${artifact.loopStartTime}`
        }));
        const picked = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select a pipeline run to resume'
        });
        if (!picked) {
          return;
        }
        selected = resumable.find(({ artifact }) => artifact.runId === picked.label)!;
      }

      const { artifact } = selected;
      const startPhase = phaseToResumeFrom(artifact.phase);
      if (!startPhase) {
        void vscode.window.showWarningMessage(
          `Pipeline ${artifact.runId} has phase '${artifact.phase ?? 'unknown'}' which is not resumable.`
        );
        return;
      }

      progress.report({ message: `Resuming pipeline ${artifact.runId} from phase '${startPhase}'` });
      logger.info('Resuming pipeline.', { runId: artifact.runId, resumeFrom: startPhase });

      await runPipelineFromPhase(startPhase, artifact, workspaceFolder, config, paths, progress);
    }
  });

  registerCommand(context, logger, {
    commandId: 'ralphCodex.approveHumanReview',
    label: 'Ralphdex: Approve Human Review',
    handler: async (progress) => {
      const workspaceFolder = await withWorkspaceFolder();
      const config = readConfig(workspaceFolder);
      const paths = resolveRalphPaths(workspaceFolder.uri.fsPath, config);

      // Discover all pending pipeline handoff files.
      let pendingFiles: string[];
      try {
        const entries = await fs.readdir(paths.handoffDir);
        pendingFiles = entries
          .filter((e) => /^pipeline-.+-pending\.json$/.test(e))
          .map((e) => path.join(paths.handoffDir, e));
      } catch {
        pendingFiles = [];
      }

      if (pendingFiles.length === 0) {
        void vscode.window.showWarningMessage('No pending pipeline human-review handoffs found.');
        return;
      }

      let selectedPath: string;
      if (pendingFiles.length === 1) {
        selectedPath = pendingFiles[0];
      } else {
        const items = pendingFiles.map((p) => path.basename(p));
        const picked = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select a pending pipeline handoff to approve'
        });
        if (!picked) {
          return;
        }
        selectedPath = path.join(paths.handoffDir, picked);
      }

      const handoff = await readPipelinePendingHandoff(selectedPath);
      progress.report({ message: `Approving pipeline ${handoff.runId}: running SCM agent` });

      let prUrl: string | undefined;
      try {
        const scmRun = await engine.runCliIteration(workspaceFolder, 'singleExec', progress, {
          reachedIterationCap: false,
          configOverrides: {
            agentRole: 'scm',
            agentId: buildScmAgentId(config.agentId)
          }
        });
        const scmReportPath = path.join(scmRun.result.artifactDir, 'completion-report.json');
        const scmReport = await readJsonArtifact(scmReportPath).then(normalizeCompletionReportArtifact);
        prUrl = extractPrUrl(scmReport?.report?.progressNote);
      } catch (error) {
        logger.error('approveHumanReview: SCM agent failed.', error);
        void vscode.window.showErrorMessage(`Ralph pipeline ${handoff.runId} PR submission failed.`);
        return;
      }

      // Update the pipeline artifact to complete.
      try {
        const rawArtifact = await readJsonArtifact(handoff.artifactPath);
        if (rawArtifact && typeof rawArtifact === 'object') {
          const updatedArtifact = {
            ...rawArtifact,
            status: 'complete',
            loopEndTime: new Date().toISOString(),
            ...(prUrl !== undefined && { prUrl })
          };
          await fs.writeFile(handoff.artifactPath, JSON.stringify(updatedArtifact, null, 2) + '\n', 'utf8');
        }
      } catch (error) {
        logger.error('approveHumanReview: failed to update pipeline artifact.', error);
      }

      // Remove the pending handoff file.
      try {
        await fs.unlink(selectedPath);
      } catch (error) {
        logger.error('approveHumanReview: failed to remove pending handoff file.', error);
      }

      logger.info('Pipeline approved and PR submitted.', { runId: handoff.runId, prUrl });

      const prSuffix = prUrl ? ` PR: ${prUrl}` : '';
      void vscode.window.showInformationMessage(
        `Ralph pipeline ${handoff.runId} approved and submitted.${prSuffix}`
      );
    }
  });

  // ---------- Construct Recommended Skills ----------
  registerCommand(context, logger, {
    commandId: 'ralphCodex.constructRecommendedSkills',
    label: 'Ralphdex: Construct Recommended Skills',
    handler: async (progress) => {
      const workspaceFolder = await withWorkspaceFolder();
      const config = readConfig(workspaceFolder);
      const paths = resolveRalphPaths(workspaceFolder.uri.fsPath, config);
      const skillsFilePath = path.join(paths.ralphDir, 'recommended-skills.json');

      let skills: RecommendedSkill[];
      try {
        const raw = JSON.parse(await fs.readFile(skillsFilePath, 'utf8'));
        if (!Array.isArray(raw)) {
          void vscode.window.showInformationMessage('recommended-skills.json does not contain an array.');
          return;
        }
        skills = raw.filter(
          (entry: unknown): entry is RecommendedSkill =>
            typeof entry === 'object'
            && entry !== null
            && typeof (entry as Record<string, unknown>).name === 'string'
            && typeof (entry as Record<string, unknown>).description === 'string'
        );
      } catch {
        void vscode.window.showInformationMessage(
          'No recommended-skills.json found. Run "New Project" with an AI-generated PRD to create one.'
        );
        return;
      }

      if (skills.length === 0) {
        void vscode.window.showInformationMessage('recommended-skills.json is empty — no skills to construct.');
        return;
      }

      const quickPickItems = skills.map((s) => ({
        label: s.name,
        description: s.description,
        detail: s.rationale ?? undefined,
        picked: false,
        skill: s
      }));

      const selected = await vscode.window.showQuickPick(quickPickItems, {
        canPickMany: true,
        placeHolder: 'Select skills to construct (only selected skills will be built)',
        title: 'Recommended Skills'
      });

      if (!selected || selected.length === 0) {
        logger.info('constructRecommendedSkills: operator cancelled or selected nothing.');
        return;
      }

      const selectedSkills = selected.map((item) => item.skill);
      logger.info('constructRecommendedSkills: operator approved skills.', {
        count: selectedSkills.length,
        names: selectedSkills.map((s) => s.name)
      });

      progress.report({ message: `Constructing ${selectedSkills.length} skill(s)…` });

      for (const skill of selectedSkills) {
        progress.report({ message: `Constructing skill: ${skill.name}` });

        const skillDir = path.join(paths.ralphDir, 'skills', skill.name);
        await fs.mkdir(skillDir, { recursive: true });

        const manifest = {
          name: skill.name,
          description: skill.description,
          rationale: skill.rationale ?? null,
          constructedAt: new Date().toISOString()
        };
        await fs.writeFile(
          path.join(skillDir, 'skill.json'),
          JSON.stringify(manifest, null, 2) + '\n',
          'utf8'
        );

        logger.info(`Constructed skill: ${skill.name}`, { skillDir });
      }

      void vscode.window.showInformationMessage(
        `Constructed ${selectedSkills.length} skill(s): ${selectedSkills.map((s) => s.name).join(', ')}`
      );
    }
  });

  // ---------- Regenerate PRD ----------
  registerCommand(context, logger, {
    commandId: 'ralphCodex.regeneratePrd',
    label: 'Ralphdex: Regenerate PRD',
    handler: async (progress) => {
      const workspaceFolder = await withWorkspaceFolder();
      const config = readConfig(workspaceFolder);
      const paths = resolveRalphPaths(workspaceFolder.uri.fsPath, config);

      if (!(await pathExists(paths.prdPath))) {
        void vscode.window.showErrorMessage(
          'No .ralph/prd.md found. Run "Ralphdex: Initialize Workspace" first.'
        );
        return;
      }

      const currentPrdText = await fs.readFile(paths.prdPath, 'utf8');
      await openPrdCreationWizard(panelManager, workspaceFolder, config, paths, logger, {
        mode: 'regenerate',
        initialObjective: currentPrdText,
        initialPrdPreview: currentPrdText,
        initialStep: 4
      });
      return;

      progress.report({ message: 'Generating refined PRD — this may take a moment…' });
      let generated: { prdText: string };
      try {
        generated = await generateProjectDraft(currentPrdText, config, workspaceFolder.uri.fsPath);
      } catch (err) {
        const reason = err instanceof Error
          ? (err as Error).message
          : String(err);
        void vscode.window.showErrorMessage(`PRD regeneration failed: ${reason}`);
        return;
      }

      const tempPath = path.join(os.tmpdir(), `ralph-prd-proposed-${Date.now()}.md`);
      await fs.writeFile(tempPath, generated.prdText, 'utf8');

      await vscode.commands.executeCommand(
        'vscode.diff',
        vscode.Uri.file(paths.prdPath),
        vscode.Uri.file(tempPath),
        'Regenerate PRD: Current ↔ Proposed'
      );

      const choice = await vscode.window.showInformationMessage(
        'Apply the refined PRD to prd.md?',
        'Apply',
        'Discard'
      );

      if (choice === 'Apply') {
        await fs.writeFile(paths.prdPath, generated.prdText, 'utf8');
        logger.info('Regenerated PRD applied.', { prdPath: paths.prdPath });
        void vscode.window.showInformationMessage('Refined PRD saved to prd.md.');
      } else {
        logger.info('Regenerated PRD discarded by operator.');
      }

      try {
        await fs.unlink(tempPath);
      } catch {
        // best-effort temp file cleanup
      }
    }
  });

  // Delegate artifact-inspection and maintenance commands to the extracted module.
  registerArtifactAndMaintenanceCommands(context, logger, stateManager, registerCommand);

  // Show the Ralphdex activity bar sidebar (focuses the dashboard view).
  context.subscriptions.push(
    vscode.commands.registerCommand('ralphCodex.showSidebar', async () => {
      await vscode.commands.executeCommand('ralphCodex.dashboard.focus');
    })
  );

  // On activation: scan for interrupted pipeline runs and offer to resume.
  const activationFolder = vscode.workspace.workspaceFolders?.[0];
  if (activationFolder) {
    const activationConfig = readConfig(activationFolder);
    const activationPaths = resolveRalphPaths(activationFolder.uri.fsPath, activationConfig);
    void (async () => {
      try {
        const resumable = await findResumablePipelineArtifacts(activationPaths.artifactDir);
        if (resumable.length === 0) {
          return;
        }
        const label = resumable.length === 1
          ? `Ralph pipeline '${resumable[0].artifact.runId}' was interrupted at phase '${resumable[0].artifact.phase ?? 'unknown'}'.`
          : `${resumable.length} Ralph pipeline runs were interrupted.`;
        const choice = await vscode.window.showWarningMessage(`${label} Resume?`, 'Resume Pipeline');
        if (choice === 'Resume Pipeline') {
          await vscode.commands.executeCommand('ralphCodex.resumePipeline');
        }
      } catch (err) {
        logger.error('Failed to check for resumable pipelines on activation.', err);
      }
    })();
  }
}
