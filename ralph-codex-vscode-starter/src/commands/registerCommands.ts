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
} from '../ralph/types';
import { Logger } from '../services/logger';
import { sleep } from '../util/async';
import { toErrorMessage } from '../util/error';
import { pathExists } from '../util/fs';
import { buildPrefixedAgentId } from '../util/validate';
import type { IterationBroadcaster } from '../ui/iterationBroadcaster';
import { requireTrustedWorkspace } from './workspaceSupport';
import {
  normalizeCompletionReportArtifact,
  readJsonArtifact
} from './statusSnapshot';
import { registerArtifactAndMaintenanceCommands } from './artifactCommands';
import { extractPrUrl, parsePrdSections, scaffoldPipelineRun, writePipelineArtifact } from '../ralph/pipeline';
import { resolveRalphPaths } from '../ralph/pathResolver';
import { generateProjectDraft, ProjectGenerationError } from '../ralph/projectGenerator';

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
    throw new Error('Open a workspace folder before using Ralph Codex Workbench.');
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
  newTasks: Pick<RalphTask, 'id' | 'title' | 'status'>[]
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

  lines.push('Run "Ralph Codex: Apply Latest Task Decomposition Proposal" to commit these proposed child tasks.');
  return lines.join('\n');
}

function iterationFailureMessage(result: { iteration: number; execution: { transcriptPath?: string } }): string {
  return `codex exec failed on iteration ${result.iteration}. See ${result.execution.transcriptPath ?? 'the Ralph artifacts'} and the Ralph Codex output channel.`;
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

export function registerCommands(context: vscode.ExtensionContext, logger: Logger, broadcaster?: IterationBroadcaster): void {
  const stateManager = new RalphStateManager(context.workspaceState, logger);
  const strategies = new CodexStrategyRegistry(logger);
  const engine = new RalphIterationEngine(stateManager, strategies, logger);

  registerCommand(context, logger, {
    commandId: 'ralphCodex.initializeWorkspace',
    label: 'Ralph Codex: Initialize Workspace',
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
      let drafts: Pick<RalphTask, 'id' | 'title' | 'status'>[];

      if (objective?.trim()) {
        progress.report({ message: 'Generating PRD and tasks — this may take a moment…' });
        try {
          const generated = await generateProjectDraft(objective.trim(), config, workspaceFolder.uri.fsPath);
          prdText = generated.prdText;
          drafts = generated.tasks;
          logger.info('Generated PRD and tasks via AI.', { taskCount: drafts.length });
        } catch (err) {
          const reason = err instanceof ProjectGenerationError || err instanceof Error
            ? err.message
            : String(err);
          logger.info(`AI generation failed, falling back to template. Reason: ${reason}`);
          void vscode.window.showWarningMessage(
            `AI generation failed — files seeded with a starter template. Refine before running. (${reason})`
          );
          prdText = `# Product / project brief\n\n${objective.trim()}\n`;
          drafts = draftTasksFromPrd(prdText);
        }
      } else {
        prdText = RALPH_PRD_PLACEHOLDER;
        drafts = draftTasksFromPrd(prdText);
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
    label: 'Ralph Codex: Add Task',
    handler: async () => {
      const workspaceFolder = await withWorkspaceFolder();
      const tasksPath = path.join(workspaceFolder.uri.fsPath, '.ralph', 'tasks.json');
      const prdPath = path.join(workspaceFolder.uri.fsPath, '.ralph', 'prd.md');

      if (!(await pathExists(tasksPath))) {
        void vscode.window.showErrorMessage(
          'No .ralph/tasks.json found. Run "Ralph Codex: Initialize Workspace" first.'
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
    commandId: 'ralphCodex.newProject',
    label: 'Ralph Codex: New Project',
    handler: async (progress) => {
      const workspaceFolder = await withWorkspaceFolder();
      const ralphDir = path.join(workspaceFolder.uri.fsPath, '.ralph');

      if (!(await pathExists(ralphDir))) {
        void vscode.window.showErrorMessage(
          'No .ralph directory found. Run "Ralph Codex: Initialize Workspace" first.'
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
          `Project "${slug}" already exists. Use "Ralph Codex: Switch Project" to select it.`
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

      const prdText = objective?.trim()
        ? `# Product / project brief\n\n${objective.trim()}\n`
        : RALPH_PRD_PLACEHOLDER;

      await fs.writeFile(absPaths.prdPath, prdText, 'utf8');

      const emptyLocked = await withTaskFileLock(absPaths.tasksPath, undefined, async () => {
        await fs.writeFile(absPaths.tasksPath, `${JSON.stringify({ version: 2, tasks: [] }, null, 2)}\n`, 'utf8');
      });
      if (emptyLocked.outcome === 'lock_timeout') {
        throw new Error(`Timed out acquiring lock for "${slug}" tasks.json.`);
      }

      await appendTasksToFile(absPaths.tasksPath, draftTasksFromPrd(prdText));
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
    label: 'Ralph Codex: Switch Project',
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
          'No named projects yet. Use "Ralph Codex: New Project" to create one.'
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
    label: 'Ralph Codex: Prepare Prompt',
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
    label: 'Ralph Codex: Open Codex IDE',
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
    label: 'Ralph Codex: Run CLI Iteration',
    handler: async (progress) => {
      const workspaceFolder = await withWorkspaceFolder();
      broadcaster?.emitIterationStart({
        iteration: 0,
        iterationCap: 1,
        selectedTaskId: null,
        selectedTaskTitle: null
      });
      const run = await engine.runCliIteration(workspaceFolder, 'singleExec', progress, {
        reachedIterationCap: false,
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
    label: 'Ralph Codex: Run CLI Loop',
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
          selectedTaskTitle: null
        });

        lastRun = await engine.runCliIteration(workspaceFolder, 'loop', progress, {
          reachedIterationCap: index + 1 >= config.ralphIterationCap,
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
    label: 'Ralph Codex: Run Multi-Agent Loop',
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

      progress.report({ message: `Starting ${agentCount} concurrent agent loop(s)` });
      broadcaster?.emitLoopStart(config.ralphIterationCap);

      // Build distinct agentId per slot. Use suffix only when multiple agents share the same base id.
      const agentSlots = Array.from({ length: agentCount }, (_, i) => ({
        slotIndex: i,
        agentId: agentCount > 1 ? `${config.agentId}-${i + 1}` : config.agentId
      }));

      type SlotResult = { agentId: string; lastRun: Awaited<ReturnType<RalphIterationEngine['runCliIteration']>> | null; reloadRequired: boolean };

      const agentLoops = agentSlots.map(async ({ agentId }): Promise<SlotResult> => {
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
            configOverrides: { agentId },
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
        throw new Error(`${failures.length} of ${agentCount} agent(s) failed: ${messages}`);
      }

      const summary = fulfilled
        .map(({ value: { agentId, lastRun } }) =>
          lastRun ? `${agentId}: ${lastRun.result.completionClassification}` : `${agentId}: no iterations`
        )
        .join('; ');

      broadcaster?.emitLoopEnd(config.ralphIterationCap, null);

      void vscode.window.showInformationMessage(
        `Ralph multi-agent loop finished (${agentCount} agent(s)). ${summary}`
      );
    }
  });

  registerCommand(context, logger, {
    commandId: 'ralphCodex.runPipeline',
    label: 'Ralph Codex: Run Pipeline',
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

      logger.info('Pipeline scaffold created.', {
        runId: artifact.runId,
        rootTaskId,
        childTaskIds,
        artifactPath
      });

      progress.report({ message: `Pipeline ${artifact.runId}: starting multi-agent loop (${childTaskIds.length} task(s))` });

      let loopStatus: 'complete' | 'failed' = 'complete';
      try {
        await vscode.commands.executeCommand('ralphCodex.runMultiAgentLoop');
      } catch (error) {
        loopStatus = 'failed';
        logger.error('Pipeline multi-agent loop failed.', error);
      }

      // Review→PR phase: only run when the multi-agent loop succeeded.
      let reviewTranscriptPath: string | undefined;
      let prUrl: string | undefined;

      if (loopStatus === 'complete') {
        progress.report({ message: `Pipeline ${artifact.runId}: running review agent` });
        try {
          const reviewRun = await engine.runCliIteration(workspaceFolder, 'singleExec', progress, {
            reachedIterationCap: false,
            configOverrides: {
              agentRole: 'review',
              agentId: buildReviewAgentId(config.agentId)
            }
          });
          reviewTranscriptPath = reviewRun.result.execution.transcriptPath;

          if (reviewRun.result.executionStatus !== 'failed') {
            progress.report({ message: `Pipeline ${artifact.runId}: running SCM agent` });
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
          }
        } catch (error) {
          logger.error('Pipeline review/SCM phase failed.', error);
        }
      }

      const finalArtifact = {
        ...artifact,
        status: loopStatus,
        loopEndTime: new Date().toISOString(),
        ...(reviewTranscriptPath !== undefined && { reviewTranscriptPath }),
        ...(prUrl !== undefined && { prUrl })
      };

      await writePipelineArtifact(paths.artifactDir, finalArtifact);

      logger.info('Pipeline run complete.', {
        runId: artifact.runId,
        status: loopStatus,
        artifactPath
      });

      const prSuffix = prUrl ? ` PR: ${prUrl}` : '';
      void vscode.window.showInformationMessage(
        `Ralph pipeline ${artifact.runId} finished with status: ${loopStatus}. Root task: ${rootTaskId} (${childTaskIds.length} subtask(s)).${prSuffix}`
      );
    }
  });

  // Delegate artifact-inspection and maintenance commands to the extracted module.
  registerArtifactAndMaintenanceCommands(context, logger, stateManager, registerCommand);
}
