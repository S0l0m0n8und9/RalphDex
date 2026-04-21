import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { readConfig } from '../config/readConfig';
import { getCliProviderLabel, getCliCommandPath } from '../config/providers';
import { CodexStrategyRegistry } from '../codex/providerFactory';
import { RalphIterationEngine } from '../ralph/iterationEngine';
import { RalphStateManager } from '../ralph/stateManager';
import {
  withTaskFileLock,
  stringifyTaskFile,
  bumpMutationCount
} from '../ralph/taskFile';
import type {
  RalphSuggestedChildTask,
  RalphTask,
  RalphTaskFile,
} from '../ralph/types';
import type { RalphNewTaskInput } from '../ralph/taskNormalization';
import { Logger } from '../services/logger';
import { inspectCliSupport } from '../services/codexCliSupport';
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
  scaffoldPipelineRun,
  writePipelineArtifact
} from '../ralph/pipeline';
import type { PipelineRunArtifact } from '../ralph/pipeline';
import type { RalphPaths } from '../ralph/pathResolver';
import type { RalphCodexConfig } from '../config/types';
import { resolveRalphPaths } from '../ralph/pathResolver';
import { generateProjectDraft, ProjectGenerationError } from '../ralph/projectGenerator';
import { parseCrewRoster } from '../ralph/crewRoster';
import type { CrewMember } from '../ralph/crewRoster';
import {
  seedTasksFromFeatureRequest,
  TaskSeedingCommandError
} from './taskSeeding';
import {
  buildPrdWizardConfigSelections,
  writePrdWizardDraft
} from './prdWizardPersistence';
import { appendNormalizedTasksToFile } from '../ralph/taskCreation';
import { collectProviderReadinessDiagnostics } from '../ralph/preflight';
import {
  relativeWizardWriteSummary,
  type PrdWizardDraftBundle,
  type PrdWizardGenerateResult,
  type PrdWizardWriteResult
} from '../webview/prdCreationWizardHost';
import { collectStatusSnapshot } from './statusSnapshot';
import { buildDashboardSnapshot, type DiagnosisSection } from '../webview/dashboardSnapshot';
import { autoApplyMarkBlockedRemediation } from '../ralph/taskDecomposition';

interface RegisteredCommandSpec {
  commandId: string;
  label: string;
  requiresTrustedWorkspace?: boolean;
  cancellable?: boolean;
  handler: (
    progress: vscode.Progress<{ message?: string; increment?: number }>,
    token: vscode.CancellationToken
  ) => Promise<unknown>;
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

async function runSeedTasksFromFeatureRequestCommand(
  workspaceFolder: vscode.WorkspaceFolder,
  logger: Logger,
  options: {
    inputTitle: string;
    inputPrompt: string;
    inputPlaceholder: string;
    successMessagePrefix: string;
    successMessageTaskLabel: string;
    logContext: string;
  }
): Promise<void> {
  const requestText = await vscode.window.showInputBox({
    title: options.inputTitle,
    prompt: options.inputPrompt,
    placeHolder: options.inputPlaceholder
  });

  if (!requestText?.trim()) {
    return;
  }

  try {
    const seeded = await seedTasksFromFeatureRequest(workspaceFolder, logger, {
      requestText,
      logContext: options.logContext
    });

    await openTextFile(seeded.tasksPath);
    void vscode.window.showInformationMessage(
      `${options.successMessagePrefix} ${seeded.createdTaskCount} ${options.successMessageTaskLabel}. ` +
      `tasks.json: ${seeded.tasksPath}. Artifact: ${seeded.artifactPath}.`,
      'Got it'
    );
  } catch (error) {
    const message = error instanceof TaskSeedingCommandError
      ? error.message
      : toErrorMessage(error);
    void vscode.window.showErrorMessage(`Task seeding failed: ${message}`);
  }
}

async function readFocusedDiagnosisArtifactStamp(
  workspaceFolder: vscode.WorkspaceFolder,
  stateManager: RalphStateManager,
  logger: Logger
): Promise<string | null> {
  const status = await collectStatusSnapshot(workspaceFolder, stateManager, logger);
  const artifactPath = status.latestFailureAnalysisPath;
  if (!artifactPath) {
    return null;
  }

  try {
    const stats = await fs.stat(artifactPath);
    return `${artifactPath}:${stats.mtimeMs}`;
  } catch {
    return null;
  }
}

function buildSkipTaskBlocker(diagnosis: DiagnosisSection): string {
  return `Skipped after diagnosis (${diagnosis.category}): ${diagnosis.suggestedAction}`;
}

function summarizeProviderDiagnostics(messages: readonly string[]): string {
  return messages.join(' ');
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
 * Return two self-bootstrapping seed tasks that guide Ralph through expanding
 * a stub PRD into a full document and then generating a real backlog from it.
 * Used as the fallback when AI generation is unavailable or the user skips
 * the objective prompt.
 */
function buildBootstrapSeedTasks(): RalphNewTaskInput[] {
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
  ];
}

/**
 * Append tasks to an existing tasks.json file under lock.
 */
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

  PrdCreationWizardPanel.createOrReveal(panelManager, {
    initialMode: options?.mode ?? 'new',
    initialObjective: options?.initialObjective,
    initialPrdPreview: options?.initialPrdPreview,
    initialStep: options?.initialStep,
    initialPaths: {
      prdPath: paths.prdPath,
      tasksPath: paths.taskFilePath
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
          ...task,
          status: task.status ?? 'todo'
        })),
        taskCountWarning: generated.taskCountWarning
      };
    },
    writeDraft: async (draft: PrdWizardDraftBundle): Promise<PrdWizardWriteResult> => {
      return writePrdWizardDraft(workspaceFolder, draft, {
        prdPath: paths.prdPath,
        tasksPath: paths.taskFilePath
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

interface ReviewAgentCommandResult {
  artifactDir: string;
  transcriptPath?: string;
}

interface ScmAgentCommandResult {
  artifactDir: string;
  prUrl?: string;
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

      return await vscode.window.withProgress(
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

  async function loadFocusedDiagnosis(workspaceFolder: vscode.WorkspaceFolder): Promise<DiagnosisSection | null> {
    const status = await collectStatusSnapshot(workspaceFolder, stateManager, logger);
    return buildDashboardSnapshot(status).diagnosis;
  }

  async function showFailureDiagnosisNotification(
    workspaceFolder: vscode.WorkspaceFolder,
    previousArtifactStamp: string | null
  ): Promise<void> {
    const currentArtifactStamp = await readFocusedDiagnosisArtifactStamp(workspaceFolder, stateManager, logger);
    if (!currentArtifactStamp || currentArtifactStamp === previousArtifactStamp) {
      return;
    }

    const diagnosis = await loadFocusedDiagnosis(workspaceFolder);
    if (!diagnosis) {
      return;
    }

    const choice = await vscode.window.showInformationMessage(
      `Failure diagnosis ready for ${diagnosis.taskId}: ${diagnosis.summary}`,
      'View Diagnosis',
      'Auto-Recover',
      'Skip Task'
    );

    if (choice === 'View Diagnosis') {
      await vscode.commands.executeCommand('ralphCodex.openFailureDiagnosis', diagnosis.taskId);
    } else if (choice === 'Auto-Recover') {
      await vscode.commands.executeCommand('ralphCodex.autoRecoverTask', diagnosis.taskId);
    } else if (choice === 'Skip Task') {
      await vscode.commands.executeCommand('ralphCodex.skipTask', diagnosis.taskId);
    }
  }

  /**
   * Execute the post-scaffold pipeline phases starting at `startPhase`.
   * Writes a phase checkpoint to the artifact after each sub-phase completes
   * so a crash at any point leaves a resumable artifact on disk.
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
        const reviewRun = await vscode.commands.executeCommand('ralphCodex.runReviewAgent') as ReviewAgentCommandResult | undefined;
        reviewTranscriptPath = reviewRun?.transcriptPath;
        await checkpoint({
          phase: 'review',
          ...(reviewTranscriptPath !== undefined && { reviewTranscriptPath })
        });

        runScm = true;
      } catch (error) {
        logger.error('Pipeline review/SCM phase failed.', error);
      }
    }

    // --- SCM phase ---
    let prUrl: string | undefined;
    if (runScm) {
      progress.report({ message: `Pipeline ${current.runId}: running SCM agent` });
      try {
        const scmRun = await vscode.commands.executeCommand('ralphCodex.runScmAgent') as ScmAgentCommandResult | undefined;
        prUrl = scmRun?.prUrl;
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
      let drafts: RalphNewTaskInput[];

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
      await appendNormalizedTasksToFile(result.tasksPath, drafts);
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
      await runSeedTasksFromFeatureRequestCommand(workspaceFolder, logger, {
        inputTitle: 'Add Task',
        inputPrompt: 'High-level feature or epic request to seed into backlog tasks',
        inputPlaceholder: 'e.g. Add a provider-backed task seeding engine with durable evidence',
        successMessagePrefix: 'Added',
        successMessageTaskLabel: 'seeded task(s)',
        logContext: 'Task seeding via addTask command'
      });
    }
  });

  registerCommand(context, logger, {
    commandId: 'ralphCodex.seedTasksFromFeatureRequest',
    label: 'Ralphdex: Seed Tasks from Feature Request',
    handler: async () => {
      const workspaceFolder = await withWorkspaceFolder();
      await runSeedTasksFromFeatureRequestCommand(workspaceFolder, logger, {
        inputTitle: 'Seed Tasks from Feature Request',
        inputPrompt: 'Describe the feature request or epic to seed into backlog tasks',
        inputPlaceholder: 'e.g. Add a provider-backed task seeding engine with durable evidence',
        successMessagePrefix: 'Seeded',
        successMessageTaskLabel: 'backlog task(s)',
        logContext: 'Task seeding via seedTasksFromFeatureRequest command'
      });
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
      const previousDiagnosisStamp = await readFocusedDiagnosisArtifactStamp(workspaceFolder, stateManager, logger);
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
      await showFailureDiagnosisNotification(workspaceFolder, previousDiagnosisStamp);
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
        },
        rolePolicySource: 'explicit'
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

      return {
        artifactDir: run.result.artifactDir,
        transcriptPath: run.result.execution.transcriptPath
      } satisfies ReviewAgentCommandResult;
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
        },
        rolePolicySource: 'explicit'
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
        },
        rolePolicySource: 'explicit'
      });

      if (run.result.executionStatus === 'failed') {
        throw new Error(iterationFailureMessage(run.result));
      }

      const note = createdPathSummary(run.prepared.rootPath, run.createdPaths);
      const baseMessage = run.result.executionStatus === 'skipped'
        ? `Ralph SCM iteration ${run.result.iteration} was skipped. ${run.loopDecision.message}`
        : `Ralph SCM iteration ${run.result.iteration} completed. ${run.result.summary}`;

      void vscode.window.showInformationMessage(note ? `${baseMessage} ${note}` : baseMessage);

      const completionReportPath = path.join(run.result.artifactDir, 'completion-report.json');
      const completionArtifact = await readJsonArtifact(completionReportPath).then(normalizeCompletionReportArtifact);
      return {
        artifactDir: run.result.artifactDir,
        prUrl: extractPrUrl(completionArtifact?.report?.progressNote)
      } satisfies ScmAgentCommandResult;
    }
  });

  registerCommand(context, logger, {
    commandId: 'ralphCodex.runRalphLoop',
    label: 'Ralphdex: Run CLI Loop',
    cancellable: true,
    handler: async (progress, token) => {
      const workspaceFolder = await withWorkspaceFolder();
      const config = readConfig(workspaceFolder);
      const previousDiagnosisStamp = await readFocusedDiagnosisArtifactStamp(workspaceFolder, stateManager, logger);
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
              rolePolicySource: 'explicit',
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
                configOverrides: { agentRole: 'watchdog', agentId: 'watchdog' },
                rolePolicySource: 'explicit'
              });
            } catch (watchdogError) {
              logger.warn('Auto-watchdog after stall failed.', { error: toErrorMessage(watchdogError) });
            }
          }

          broadcaster?.emitLoopEnd(index + 1, lastRun.result.stopReason);
          void vscode.window.showInformationMessage(
            `Ralph CLI loop stopped after iteration ${lastRun.result.iteration}: ${lastRun.loopDecision.message}`
          );
          await showFailureDiagnosisNotification(workspaceFolder, previousDiagnosisStamp);
          return;
        }
      }

      if (config.autoReviewOnLoopComplete && lastRun) {
        progress.report({ message: 'Loop complete — running review agent' });
        try {
          await engine.runCliIteration(workspaceFolder, 'singleExec', progress, {
            reachedIterationCap: false,
            configOverrides: { agentRole: 'review', agentId: buildReviewAgentId(config.agentId) },
            rolePolicySource: 'explicit'
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
    commandId: 'ralphCodex.openFailureDiagnosis',
    label: 'Ralphdex: Open Failure Diagnosis',
    handler: async () => {
      const workspaceFolder = await withWorkspaceFolder();
      const diagnosis = await loadFocusedDiagnosis(workspaceFolder);
      if (!diagnosis) {
        void vscode.window.showWarningMessage('No failure diagnosis is available for the selected task.');
        return;
      }
      await vscode.commands.executeCommand('ralphCodex.showDashboard', {
        activeTab: 'diagnostics'
      });
    }
  });

  registerCommand(context, logger, {
    commandId: 'ralphCodex.autoRecoverTask',
    label: 'Ralphdex: Auto-Recover Task',
    handler: async () => {
      const workspaceFolder = await withWorkspaceFolder();
      const diagnosis = await loadFocusedDiagnosis(workspaceFolder);
      if (!diagnosis) {
        void vscode.window.showWarningMessage('No failure diagnosis is available for the selected task.');
        return;
      }

      if (diagnosis.category === 'task_ambiguity') {
        await vscode.commands.executeCommand('ralphCodex.applyLatestTaskDecompositionProposal');
        return;
      }

      await vscode.commands.executeCommand('ralphCodex.runRalphIteration');
    }
  });

  registerCommand(context, logger, {
    commandId: 'ralphCodex.skipTask',
    label: 'Ralphdex: Skip Task',
    handler: async () => {
      const workspaceFolder = await withWorkspaceFolder();
      const diagnosis = await loadFocusedDiagnosis(workspaceFolder);
      if (!diagnosis) {
        void vscode.window.showWarningMessage('No failure diagnosis is available for the selected task.');
        return;
      }

      const confirmed = await vscode.window.showWarningMessage(
        `Mark ${diagnosis.taskId} (${diagnosis.taskTitle}) blocked and skip it for now?`,
        { modal: true },
        'Skip Task'
      );
      if (confirmed !== 'Skip Task') {
        return;
      }

      const config = readConfig(workspaceFolder);
      const inspection = await stateManager.inspectWorkspace(workspaceFolder.uri.fsPath, config);
      await logger.setWorkspaceLogFile(inspection.paths.logFilePath);
      await autoApplyMarkBlockedRemediation({
        taskFilePath: inspection.paths.taskFilePath,
        taskId: diagnosis.taskId,
        blocker: buildSkipTaskBlocker(diagnosis)
      });
      void vscode.window.showInformationMessage(`Task ${diagnosis.taskId} marked blocked so the loop can move past it.`);
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
            rolePolicySource: crewMember ? 'crew' : 'preset',
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
                rolePolicySource: 'explicit',
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
                  configOverrides: { agentRole: 'watchdog', agentId: 'watchdog' },
                  rolePolicySource: 'explicit'
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
        artifactDir: paths.artifactDir,
        ralphDir: paths.ralphDir
      });

      logger.info('Pipeline scaffold created.', { runId: artifact.runId, rootTaskId, childTaskIds, artifactPath });

      await runPipelineFromPhase('loop', artifact, workspaceFolder, config, paths, progress);
    }
  });

  registerCommand(context, logger, {
    commandId: 'ralphCodex.testCurrentProviderConnection',
    label: 'Ralphdex: Test Current Provider Connection',
    handler: async (progress) => {
      const workspaceFolder = await withWorkspaceFolder();
      const config = readConfig(workspaceFolder);
      const providerLabel = getCliProviderLabel(config.cliProvider);
      progress.report({ message: `Testing ${providerLabel} provider readiness` });

      const cliSupport = await inspectCliSupport(config.cliProvider, getCliCommandPath(config));
      const diagnostics = collectProviderReadinessDiagnostics({
        config,
        codexCliSupport: cliSupport
      });
      const summary = summarizeProviderDiagnostics(diagnostics.map((diagnostic) => diagnostic.message));

      logger.info('Provider readiness test completed.', {
        provider: config.cliProvider,
        commandPath: cliSupport.commandPath,
        checks: diagnostics.map((diagnostic) => ({
          severity: diagnostic.severity,
          code: diagnostic.code,
          message: diagnostic.message
        }))
      });

      if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
        void vscode.window.showErrorMessage(summary);
        return;
      }

      if (diagnostics.some((diagnostic) => diagnostic.severity === 'warning')) {
        void vscode.window.showWarningMessage(summary);
        return;
      }

      void vscode.window.showInformationMessage(summary || `${providerLabel} provider readiness checks passed.`);
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

  registerCommand(context, logger, {
    commandId: 'ralphCodex.setProviderSecret',
    label: 'Ralphdex: Set Provider Secret',
    handler: async () => {
      if (!('secrets' in context) || !context.secrets) {
        throw new Error('VS Code SecretStorage is not available in this environment.');
      }

      const secretKey = (await vscode.window.showInputBox({
        title: 'Set Provider Secret',
        prompt: 'Secret storage key',
        placeHolder: 'e.g. copilotFoundry.primary'
      }))?.trim();

      if (!secretKey) {
        return;
      }

      const secretValue = await vscode.window.showInputBox({
        title: 'Set Provider Secret',
        prompt: `Secret value for ${secretKey}`,
        password: true,
        ignoreFocusOut: true
      });

      if (typeof secretValue !== 'string' || secretValue.length === 0) {
        return;
      }

      await context.secrets.store(secretKey, secretValue);
      void vscode.window.showInformationMessage(`Stored provider secret in VS Code SecretStorage: ${secretKey}.`);
    }
  });

  registerCommand(context, logger, {
    commandId: 'ralphCodex.clearProviderSecret',
    label: 'Ralphdex: Clear Provider Secret',
    handler: async () => {
      if (!('secrets' in context) || !context.secrets) {
        throw new Error('VS Code SecretStorage is not available in this environment.');
      }

      const secretKey = (await vscode.window.showInputBox({
        title: 'Clear Provider Secret',
        prompt: 'Secret storage key to delete',
        placeHolder: 'e.g. copilotFoundry.primary'
      }))?.trim();

      if (!secretKey) {
        return;
      }

      await context.secrets.delete(secretKey);
      void vscode.window.showInformationMessage(`Cleared provider secret from VS Code SecretStorage: ${secretKey}.`);
    }
  });

  // Show the Ralphdex activity bar sidebar (focuses the dashboard view).
  context.subscriptions.push(
    vscode.commands.registerCommand('ralphCodex.showSidebar', async () => {
      await vscode.commands.executeCommand('ralphCodex.dashboard.focus');
    })
  );

  // Focus the durable task tree view inside the Ralphdex activity bar.
  context.subscriptions.push(
    vscode.commands.registerCommand('ralphCodex.showTasks', async () => {
      await vscode.commands.executeCommand('ralphCodex.tasks.focus');
    })
  );

}
