import * as fs from 'fs/promises';
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
  bumpMutationCount,
  parseTaskFile
} from '../ralph/taskFile';
import type {
  RalphSuggestedChildTask,
  RalphTask,
  RalphTaskFile,
} from '../ralph/types';
import { Logger } from '../services/logger';
import { inspectCliSupport } from '../services/codexCliSupport';
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
  createPipelineRunFromApprovedTaskGraph,
  scaffoldPipelineRun,
  writePipelineArtifact
} from '../ralph/pipeline';
import type { PipelineRunArtifact } from '../ralph/pipeline';
import type { RalphPaths } from '../ralph/pathResolver';
import type { RalphCodexConfig } from '../config/types';
import { resolveRalphPaths } from '../ralph/pathResolver';
import {
  generatePrdDraft,
  generateTasksFromPrd
} from '../ralph/projectGenerator';
import {
  analyzePrdReadiness,
  persistLatestPrdReadinessArtifacts,
  readLatestTaskGenerationPlan
} from '../ralph/prdReadiness';
import { hashText } from '../ralph/integrity';
import { parseCrewRoster } from '../ralph/crewRoster';
import type { CrewMember } from '../ralph/crewRoster';
import {
  seedTasksFromFeatureRequest,
  TaskSeedingCommandError
} from './taskSeeding';
import {
  writePrdWizardDraft
} from './prdWizardPersistence';
import {
  evaluatePrdReadinessGate,
  RALPH_PRD_PLACEHOLDER,
  type PrdReadinessGateResult
} from './prdReadinessGate';
import { inspectProviderReadinessDiagnostics } from '../ralph/preflight';
import {
  relativeWizardWriteSummary,
  type PrdWizardDraftBundle,
  type PrdWizardPrdGenerateResult,
  type PrdWizardTaskGenerateResult,
  type PrdWizardWriteResult
} from '../webview/prdCreationWizardHost';
import { collectStatusSnapshot } from './statusSnapshot';
import { buildDashboardSnapshot, type DiagnosisSection } from '../webview/dashboardSnapshot';
import { autoApplyMarkBlockedRemediation } from '../ralph/taskDecomposition';
import { createDoctrinePack, DOCTRINE_ROOT_RELATIVE } from '../ralph/doctrine';

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

interface ActiveLoopStopHandle {
  isCancellationRequested(): boolean;
  dispose(): void;
}

function createActiveLoopStopRegistry() {
  let nextSessionId = 1;
  const cancelledSessionIds = new Set<number>();
  const activeSessionIds = new Set<number>();

  return {
    begin(): ActiveLoopStopHandle {
      const sessionId = nextSessionId++;
      activeSessionIds.add(sessionId);

      return {
        isCancellationRequested(): boolean {
          return cancelledSessionIds.has(sessionId);
        },
        dispose(): void {
          activeSessionIds.delete(sessionId);
          cancelledSessionIds.delete(sessionId);
        }
      };
    },
    requestStop(): boolean {
      if (activeSessionIds.size === 0) {
        return false;
      }

      for (const sessionId of activeSessionIds) {
        cancelledSessionIds.add(sessionId);
      }

      return true;
    },
    hasActiveLoop(): boolean {
      return activeSessionIds.size > 0;
    }
  };
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

function summarizeRelativePaths(rootPath: string, targetPaths: string[]): string | null {
  if (targetPaths.length === 0) {
    return null;
  }

  return targetPaths
    .map((target) => path.relative(rootPath, target) || path.basename(target))
    .join(', ');
}


async function openWorkspaceFile(targetPath: string): Promise<void> {
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(targetPath));
  await vscode.window.showTextDocument(document, { preview: false });
}

async function openDoctrineFile(workspaceFolder: vscode.WorkspaceFolder, fileName: string): Promise<void> {
  const targetPath = path.join(workspaceFolder.uri.fsPath, DOCTRINE_ROOT_RELATIVE, fileName);
  if (!(await pathExists(targetPath))) {
    void vscode.window.showWarningMessage(`Doctrine file ${DOCTRINE_ROOT_RELATIVE}/${fileName} does not exist yet. Run "Ralphdex: Initialize Doctrine Pack" first.`);
    return;
  }
  await openWorkspaceFile(targetPath);
}

function buildDoctrinePackMessage(rootPath: string, result: {
  createdPaths: string[];
  existingPaths: string[];
  repairedPaths: string[];
}): string {
  const messageParts = ['Doctrine pack ready.'];
  const created = summarizeRelativePaths(rootPath, result.createdPaths);
  const existing = summarizeRelativePaths(rootPath, result.existingPaths);
  const repaired = summarizeRelativePaths(rootPath, result.repairedPaths);

  if (created) {
    messageParts.push(`Created: ${created}.`);
  }
  if (repaired) {
    messageParts.push(`Repaired: ${repaired}.`);
  }
  if (existing) {
    messageParts.push(`Already present: ${existing}.`);
  }

  return messageParts.join(' ');
}

const RALPH_GITIGNORE_CONTENT = [
  '/artifacts',
  '/done-task-audit*.md',
  '/logs',
  '/prompts',
  '/runs',
  '/state.json'
].join('\n');

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
  doctrineDir: string;
  doctrineCreatedPaths: string[];
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
  const doctrine = await createDoctrinePack(rootPath);

  return {
    ralphDir,
    prdPath,
    tasksPath,
    progressPath,
    gitignorePath,
    doctrineDir: doctrine.doctrineDir,
    doctrineCreatedPaths: doctrine.createdPaths
  };
}

async function findMissingRalphWorkspaceFiles(paths: RalphPaths): Promise<string[]> {
  const requiredPaths = [paths.prdPath, paths.taskFilePath, paths.progressPath];
  const missingPaths: string[] = [];

  for (const targetPath of requiredPaths) {
    if (!(await pathExists(targetPath))) {
      missingPaths.push(targetPath);
    }
  }

  return missingPaths;
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
    generatePrdDraft: async (input): Promise<PrdWizardPrdGenerateResult> => {
      const generated = await generatePrdDraft(
        {
          objective: buildWizardGenerationPrompt(input),
          projectType: input.projectType
        },
        config,
        workspaceFolder.uri.fsPath
      );
      const readiness = analyzePrdReadiness(generated.prdText);
      await persistLatestPrdReadinessArtifacts(paths.artifactDir, readiness);
      return {
        prdText: generated.prdText,
        generationWarnings: generated.generationWarnings
      };
    },
    generateTasks: async (input): Promise<PrdWizardTaskGenerateResult> => {
      const generated = await generateTasksFromPrd({
        prdText: input.prdText,
        prdHash: input.prdHash,
        projectType: input.projectType,
        constraints: input.constraints
      }, config, workspaceFolder.uri.fsPath, paths.artifactDir);
      return {
        tasks: generated.tasks.map((task) => ({
          ...task,
          status: task.status ?? 'todo'
        })),
        taskCountWarning: generated.taskCountWarning,
        planArtifact: generated.planArtifact
      };
    },
    writeDraft: async (draft: PrdWizardDraftBundle): Promise<PrdWizardWriteResult> => {
      return writePrdWizardDraft(draft, {
        prdPath: paths.prdPath,
        tasksPath: paths.taskFilePath,
        artifactDir: paths.artifactDir
      });
    },
    onWriteComplete: async (result) => {
      logger.info('PRD wizard wrote Ralph files.', {
        filesWritten: result.filesWritten
      });
      await openTextFile(paths.prdPath);
      await openTextFile(paths.taskFilePath);
      const summary = relativeWizardWriteSummary(workspaceFolder.uri.fsPath, result);
      void vscode.window.showInformationMessage(
        `PRD wizard wrote: ${summary.filesWritten.join(', ')}.`
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

      const result = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: spec.label,
          cancellable: spec.cancellable ?? false
        },
        async (progress, token) => spec.handler(progress, token)
      );

      logger.info('Command completed.', { commandId: spec.commandId });
      return result;
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
  const activeLoopStops = createActiveLoopStopRegistry();

  async function ensurePrdReadyOrOpenWizard(
    workspaceFolder: vscode.WorkspaceFolder,
    config: RalphCodexConfig,
    progress: vscode.Progress<{ message?: string; increment?: number }>
  ): Promise<PrdReadinessGateResult & { wizardOpened: boolean }> {
    const gate = await evaluatePrdReadinessGate({
      workspaceFolder,
      config,
      stateManager,
      logger
    });

    if (gate.status === 'ready') {
      return { ...gate, wizardOpened: false };
    }

    if (gate.status === 'missing_or_default') {
      progress.report({ message: 'Opening PRD wizard before RalphDex can continue' });
      await openPrdCreationWizard(panelManager, workspaceFolder, config, gate.paths, logger, {
        mode: 'new',
        initialObjective: '',
        initialPrdPreview: gate.prdText,
        initialStep: 1
      });
      void vscode.window.showWarningMessage(
        'PRD readiness must be completed first. The PRD wizard is open; finish a real PRD, then start the command again.'
      );
      return { ...gate, wizardOpened: true };
    }

    // readiness_blocked: the operator has a PRD, it just doesn't match our
    // structural expectations. Surface the analysis as a non-blocking warning
    // and let the command proceed — the operator's PRD is the source of truth.
    const blockerCount = gate.readiness.blockers.length;
    const summaryPath = gate.readinessArtifactPaths?.summaryPath ?? null;
    const suppressionKey = `prdReadinessWarning.suppressedHash.${workspaceFolder.uri.fsPath}`;
    const suppressedHash = context.workspaceState.get<string>(suppressionKey);
    const isSuppressed = suppressedHash === gate.readiness.prdHash;

    if (!isSuppressed) {
      void vscode.window.showWarningMessage(
        `PRD has ${blockerCount} structural finding(s) flagged by readiness analysis. Continuing the command — open the wizard or the readiness report if you want to address them.`,
        'Open Readiness Report',
        'Open PRD Wizard',
        "Don't show again"
      ).then((choice) => {
        if (choice === 'Open Readiness Report' && summaryPath) {
          void openTextFile(summaryPath);
        } else if (choice === 'Open PRD Wizard') {
          void openPrdCreationWizard(panelManager, workspaceFolder, config, gate.paths, logger, {
            mode: 'regenerate',
            initialObjective: gate.prdText,
            initialPrdPreview: gate.prdText,
            initialStep: 3
          });
        } else if (choice === "Don't show again") {
          void context.workspaceState.update(suppressionKey, gate.readiness.prdHash);
        }
      });
    }
    progress.report({
      message: isSuppressed
        ? `PRD readiness has ${blockerCount} finding(s) — proceeding (warning suppressed for this PRD).`
        : `PRD readiness has ${blockerCount} finding(s) — proceeding with guidance.`
    });
    return {
      status: 'ready',
      paths: gate.paths,
      prdText: gate.prdText,
      readiness: gate.readiness,
      readinessArtifactPaths: null,
      wizardOpened: false
    };
  }

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
        gitignorePath: result.gitignorePath,
        doctrineDir: result.doctrineDir,
        doctrineCreatedPaths: result.doctrineCreatedPaths
      });

      // Read config to know which CLI provider to use for generation
      const config = readConfig(workspaceFolder);

      // Optional objective seed for the wizard flow
      const objective = await vscode.window.showInputBox({
        prompt: 'Enter a short project objective (optional, used to seed the PRD wizard)',
        placeHolder: 'Example: Build a reliable v2 iteration engine for the VS Code extension',
        ignoreFocusOut: true
      });

      const initialObjective = objective?.trim() ?? '';
      if (initialObjective.length > 0) {
        await fs.writeFile(result.prdPath, `${initialObjective}\n`, 'utf8');
      }

      await openPrdCreationWizard(panelManager, workspaceFolder, config, resolveRalphPaths(workspaceFolder.uri.fsPath, config), logger, {
        mode: 'new',
        initialObjective,
        initialStep: initialObjective ? 2 : 1
      });

      void vscode.window.showInformationMessage(
        'Ralph workspace ready. Use the PRD wizard readiness flow to generate and review PRD/tasks before running your first loop.',
        'Got it'
      );
    }
  });

  registerCommand(context, logger, {
    commandId: 'ralphCodex.initializeDoctrinePack',
    label: 'Ralphdex: Initialize Doctrine Pack',
    handler: async (progress) => {
      const workspaceFolder = await withWorkspaceFolder();
      const config = readConfig(workspaceFolder);
      const paths = resolveRalphPaths(workspaceFolder.uri.fsPath, config);
      progress.report({ message: 'Scaffolding or repairing the Ralph doctrine pack' });

      const missingWorkspaceFiles = await findMissingRalphWorkspaceFiles(paths);
      if (missingWorkspaceFiles.length > 0) {
        const relativeMissing = missingWorkspaceFiles
          .map((targetPath) => path.relative(workspaceFolder.uri.fsPath, targetPath) || path.basename(targetPath))
          .join(', ');
        void vscode.window.showWarningMessage(
          `Doctrine pack initialization requires an established Ralph workspace. Missing: ${relativeMissing}. Run "Ralphdex: Initialize Workspace" first.`
        );
        return;
      }

      const result = await createDoctrinePack(workspaceFolder.uri.fsPath);
      logger.info('Initialized or repaired the Ralph doctrine pack.', {
        rootPath: workspaceFolder.uri.fsPath,
        doctrineDir: result.doctrineDir,
        doctrineCreatedPaths: result.createdPaths,
        doctrineExistingPaths: result.existingPaths,
        doctrineRepairedPaths: result.repairedPaths
      });

      void vscode.window.showInformationMessage(
        buildDoctrinePackMessage(workspaceFolder.uri.fsPath, result)
      );
    }
  });


  registerCommand(context, logger, {
    commandId: 'ralphCodex.openDoctrineFolder',
    label: 'Ralphdex: Open Doctrine Folder',
    requiresTrustedWorkspace: false,
    handler: async (progress) => {
      const workspaceFolder = await withWorkspaceFolder();
      const doctrineDir = path.join(workspaceFolder.uri.fsPath, DOCTRINE_ROOT_RELATIVE);
      progress.report({ message: 'Opening the Ralph doctrine folder' });
      if (!(await pathExists(doctrineDir))) {
        void vscode.window.showWarningMessage('Doctrine folder does not exist yet. Run "Ralphdex: Initialize Doctrine Pack" first.');
        return;
      }
      await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(doctrineDir));
    }
  });

  registerCommand(context, logger, {
    commandId: 'ralphCodex.openDoctrineInvariants',
    label: 'Ralphdex: Open Doctrine Invariants',
    requiresTrustedWorkspace: false,
    handler: async (progress) => {
      const workspaceFolder = await withWorkspaceFolder();
      progress.report({ message: 'Opening doctrine invariants.md' });
      await openDoctrineFile(workspaceFolder, 'invariants.md');
    }
  });

  registerCommand(context, logger, {
    commandId: 'ralphCodex.openDoctrineBoundaries',
    label: 'Ralphdex: Open Doctrine Boundaries',
    requiresTrustedWorkspace: false,
    handler: async (progress) => {
      const workspaceFolder = await withWorkspaceFolder();
      progress.report({ message: 'Opening doctrine boundaries.md' });
      await openDoctrineFile(workspaceFolder, 'boundaries.md');
    }
  });

  registerCommand(context, logger, {
    commandId: 'ralphCodex.openDoctrineAgents',
    label: 'Ralphdex: Open Doctrine Agents',
    requiresTrustedWorkspace: false,
    handler: async (progress) => {
      const workspaceFolder = await withWorkspaceFolder();
      progress.report({ message: 'Opening doctrine agents.md' });
      await openDoctrineFile(workspaceFolder, 'agents.md');
    }
  });

  registerCommand(context, logger, {
    commandId: 'ralphCodex.openPrdWizard',
    label: 'Ralphdex: Open PRD Wizard',
    handler: async (progress) => {
      const workspaceFolder = await withWorkspaceFolder();
      const config = readConfig(workspaceFolder);
      const paths = resolveRalphPaths(workspaceFolder.uri.fsPath, config);

      if (!(await pathExists(paths.ralphDir))) {
        progress.report({ message: 'Creating a fresh .ralph workspace scaffold for the PRD wizard' });
        const result = await initializeFreshWorkspace(workspaceFolder.uri.fsPath);
        logger.info('Initialized a fresh Ralph workspace scaffold for the PRD wizard.', {
          rootPath: workspaceFolder.uri.fsPath,
          ralphDir: result.ralphDir,
          prdPath: result.prdPath,
          tasksPath: result.tasksPath,
          progressPath: result.progressPath,
          gitignorePath: result.gitignorePath,
          doctrineDir: result.doctrineDir,
          doctrineCreatedPaths: result.doctrineCreatedPaths
        });
      }

      await openPrdCreationWizard(panelManager, workspaceFolder, config, paths, logger, {
        mode: 'new',
        initialStep: 1
      });
    }
  });

  registerCommand(context, logger, {
    commandId: 'ralphCodex.addTask',
    label: 'Ralphdex: Add Task',
    handler: async (progress) => {
      const workspaceFolder = await withWorkspaceFolder();
      const config = readConfig(workspaceFolder);
      const prdGate = await ensurePrdReadyOrOpenWizard(workspaceFolder, config, progress);
      if (prdGate.status !== 'ready') {
        return;
      }
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
    handler: async (progress) => {
      const workspaceFolder = await withWorkspaceFolder();
      const config = readConfig(workspaceFolder);
      const prdGate = await ensurePrdReadyOrOpenWizard(workspaceFolder, config, progress);
      if (prdGate.status !== 'ready') {
        return;
      }
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
    label: 'Ralphdex: Prepare IDE Prompt',
    handler: async (progress) => {
      const workspaceFolder = await withWorkspaceFolder();
      const config = readConfig(workspaceFolder);
      const prdGate = await ensurePrdReadyOrOpenWizard(workspaceFolder, config, progress);
      if (prdGate.status !== 'ready') {
        return;
      }
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
      const config = readConfig(workspaceFolder);
      const prdGate = await ensurePrdReadyOrOpenWizard(workspaceFolder, config, progress);
      if (prdGate.status !== 'ready') {
        return;
      }
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
          'preferredHandoffMode is cliExec. This IDE command still falls back to clipboard handoff; use Run Single Iteration for codex exec.'
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
    label: 'Ralphdex: Run Single Iteration',
    handler: async (progress) => {
      const workspaceFolder = await withWorkspaceFolder();
      const config = readConfig(workspaceFolder);
      const prdGate = await ensurePrdReadyOrOpenWizard(workspaceFolder, config, progress);
      if (prdGate.status !== 'ready') {
        return;
      }
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
      const prdGate = await ensurePrdReadyOrOpenWizard(workspaceFolder, config, progress);
      if (prdGate.status !== 'ready') {
        return;
      }
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
      const config = readConfig(workspaceFolder);
      const prdGate = await ensurePrdReadyOrOpenWizard(workspaceFolder, config, progress);
      if (prdGate.status !== 'ready') {
        return;
      }
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
      const prdGate = await ensurePrdReadyOrOpenWizard(workspaceFolder, config, progress);
      if (prdGate.status !== 'ready') {
        return;
      }
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
    commandId: 'ralphCodex.stopLoop',
    label: 'Ralphdex: Stop Loop',
    handler: async () => {
      if (!activeLoopStops.requestStop()) {
        void vscode.window.showWarningMessage('No Ralph loop is currently running.');
        return;
      }

      void vscode.window.showInformationMessage('Stop requested. Ralph will halt before starting the next iteration.');
    }
  });

  registerCommand(context, logger, {
    commandId: 'ralphCodex.runRalphLoop',
    label: 'Ralphdex: Run Loop',
    cancellable: true,
    handler: async (progress, token) => {
      const workspaceFolder = await withWorkspaceFolder();
      const config = readConfig(workspaceFolder);
      const prdGate = await ensurePrdReadyOrOpenWizard(workspaceFolder, config, progress);
      if (prdGate.status !== 'ready') {
        return;
      }
      const stopHandle = activeLoopStops.begin();
      const previousDiagnosisStamp = await readFocusedDiagnosisArtifactStamp(workspaceFolder, stateManager, logger);
      logger.show(false);
      logger.info('Starting Ralph loop.', {
        rootPath: workspaceFolder.uri.fsPath,
        iterationCap: config.ralphIterationCap,
        verifierModes: config.verifierModes,
        noProgressThreshold: config.noProgressThreshold,
        repeatedFailureThreshold: config.repeatedFailureThreshold
      });

      try {
        broadcaster?.emitLoopStart(config.ralphIterationCap);
        let lastRun: Awaited<ReturnType<RalphIterationEngine['runCliIteration']>> | null = null;
        for (let index = 0; index < config.ralphIterationCap; index += 1) {
          if (token.isCancellationRequested || stopHandle.isCancellationRequested()) {
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
      } finally {
        stopHandle.dispose();
      }
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
      const prdGate = await ensurePrdReadyOrOpenWizard(workspaceFolder, config, progress);
      if (prdGate.status !== 'ready') {
        return;
      }
      const stopHandle = activeLoopStops.begin();
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

      type SlotResult = { agentId: string; lastRun: Awaited<ReturnType<RalphIterationEngine['runCliIteration']>> | null };

      try {
        const agentLoops = agentSlots.map(async ({ agentId, crewMember }): Promise<SlotResult> => {
          let lastRun: Awaited<ReturnType<RalphIterationEngine['runCliIteration']>> | null = null;

          for (let index = 0; index < config.ralphIterationCap; index += 1) {
            if (token.isCancellationRequested || stopHandle.isCancellationRequested()) {
              logger.info('Multi-agent loop: cancelled by user.', { agentId, iteration: index });
              return { agentId, lastRun };
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
              return { agentId, lastRun };
            }
          }

          return { agentId, lastRun };
        });

        const settled = await Promise.allSettled(agentLoops);

        const failures = settled.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
        const fulfilled = settled.filter((r): r is PromiseFulfilledResult<SlotResult> => r.status === 'fulfilled');

        if (failures.length > 0) {
          const messages = failures.map((r) => toErrorMessage(r.reason)).join('; ');
          throw new Error(`${failures.length} of ${agentSlots.length} agent(s) failed: ${messages}`);
        }

        if (token.isCancellationRequested || stopHandle.isCancellationRequested()) {
          const startedIterations = fulfilled.reduce((count, result) => (
            count + (result.value.lastRun ? 1 : 0)
          ), 0);
          broadcaster?.emitLoopEnd(startedIterations, 'cancelled');
          void vscode.window.showInformationMessage(`Ralph multi-agent loop cancelled after ${startedIterations} iteration start(s).`);
          return;
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
      } finally {
        stopHandle.dispose();
      }
    }
  });

  registerCommand(context, logger, {
    commandId: 'ralphCodex.runPipeline',
    label: 'Ralphdex: Run Full Workflow',
    handler: async (progress) => {
      const workspaceFolder = await withWorkspaceFolder();
      const config = readConfig(workspaceFolder);
      const prdGate = await ensurePrdReadyOrOpenWizard(workspaceFolder, config, progress);
      if (prdGate.status !== 'ready') {
        return;
      }

      const paths = prdGate.paths;
      const prdText = prdGate.prdText;
      const prdHash = hashText(prdText);

      const latestPlan = await readLatestTaskGenerationPlan(paths.artifactDir);
      const taskFile = parseTaskFile(await fs.readFile(paths.taskFilePath, 'utf8'));
      const taskIds = new Set(taskFile.tasks.map((task) => task.id));
      const hasApprovedTaskGraph = Boolean(
        latestPlan
        && latestPlan.status === 'approved'
        && latestPlan.prdHash === prdHash
        && latestPlan.generatedTaskIds.length > 0
        && latestPlan.generatedTaskIds.every((taskId) => taskIds.has(taskId))
      );

      if (!hasApprovedTaskGraph) {
        const choice = await vscode.window.showWarningMessage(
          'Run Full Workflow requires a task graph generated from the current approved PRD hash. Generate tasks now, or explicitly use the legacy heading scaffold.',
          'Generate Tasks',
          'Use Legacy Heading Scaffold',
          'Cancel'
        );

        if (choice === 'Generate Tasks') {
          await openPrdCreationWizard(panelManager, workspaceFolder, config, paths, logger, {
            mode: 'regenerate',
            initialObjective: prdText,
            initialPrdPreview: prdText,
            initialStep: 4
          });
        }

        if (choice !== 'Use Legacy Heading Scaffold') {
          return;
        }
        progress.report({ message: 'Scaffolding pipeline: decomposing PRD into tasks (legacy fallback)' });

        const { artifact, artifactPath, rootTaskId, childTaskIds } = await scaffoldPipelineRun({
          prdPath: paths.prdPath,
          taskFilePath: paths.taskFilePath,
          artifactDir: paths.artifactDir,
          ralphDir: paths.ralphDir,
          maxChildTasks: config.maxGeneratedChildren
        });

        logger.info('Pipeline scaffold created via legacy heading fallback.', {
          runId: artifact.runId,
          rootTaskId,
          childTaskIds,
          artifactPath
        });
        void vscode.window.showWarningMessage(
          `Run Full Workflow: using legacy heading scaffold fallback for pipeline ${artifact.runId}.`
        );

        await runPipelineFromPhase('loop', artifact, workspaceFolder, config, paths, progress);
        return;
      }

      const approvedTaskIds = latestPlan!.generatedTaskIds;
      progress.report({ message: `Running pipeline on approved task graph (${approvedTaskIds.length} task(s))` });
      const { artifact, artifactPath } = await createPipelineRunFromApprovedTaskGraph({
        prdHash,
        prdPath: paths.prdPath,
        artifactDir: paths.artifactDir,
        ralphDir: paths.ralphDir,
        taskIds: approvedTaskIds,
        rootTaskId: approvedTaskIds[0]
      });
      logger.info('Pipeline run started from approved task graph.', {
        runId: artifact.runId,
        taskIds: approvedTaskIds,
        artifactPath
      });
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
      const diagnostics = await inspectProviderReadinessDiagnostics({
        config,
        codexCliSupport: cliSupport,
        authFailureSeverity: 'error'
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
        initialStep: 3
      });
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

  // Open VS Code settings filtered to RalphDex settings.
  context.subscriptions.push(
    vscode.commands.registerCommand('ralphCodex.openSettings', async () => {
      await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:s0l0m0n8und9.ralphdex');
    })
  );

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
