import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { readConfig } from '../config/readConfig';
import { CodexStrategyRegistry } from '../codex/providerFactory';
import { RalphIterationEngine } from '../ralph/iterationEngine';
import { buildPreflightReport } from '../ralph/preflight';
import { buildStatusReport, resolveLatestStatusArtifacts, RalphStatusSnapshot } from '../ralph/statusReport';
import { RalphStateManager } from '../ralph/stateManager';
import { selectNextTask } from '../ralph/taskFile';
import { RalphCliInvocation, RalphExecutionPlan, RalphProvenanceBundle } from '../ralph/types';
import { captureGitStatus, chooseValidationCommand, inspectValidationCommandReadiness } from '../ralph/verifier';
import { inspectCodexCliSupport, inspectIdeCommandSupport } from '../services/codexCliSupport';
import { Logger } from '../services/logger';
import { scanWorkspace } from '../services/workspaceScanner';
import { requireTrustedWorkspace } from './workspaceSupport';

interface RegisteredCommandSpec {
  commandId: string;
  label: string;
  requiresTrustedWorkspace?: boolean;
  handler: (progress: vscode.Progress<{ message?: string; increment?: number }>) => Promise<void>;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

async function readJsonArtifact(target: string | null): Promise<unknown | null> {
  if (!target) {
    return null;
  }

  try {
    return JSON.parse(await fs.readFile(target, 'utf8'));
  } catch {
    return null;
  }
}

function normalizeExecutionPlan(candidate: unknown): RalphExecutionPlan | null {
  if (typeof candidate !== 'object' || candidate === null) {
    return null;
  }

  const record = candidate as Record<string, unknown>;
  if (record.kind !== 'executionPlan'
    || typeof record.iteration !== 'number'
    || typeof record.promptKind !== 'string'
    || typeof record.promptTarget !== 'string'
    || typeof record.templatePath !== 'string'
    || typeof record.promptArtifactPath !== 'string'
    || typeof record.promptHash !== 'string') {
    return null;
  }

  return record as unknown as RalphExecutionPlan;
}

function normalizeCliInvocation(candidate: unknown): RalphCliInvocation | null {
  if (typeof candidate !== 'object' || candidate === null) {
    return null;
  }

  const record = candidate as Record<string, unknown>;
  if (record.kind !== 'cliInvocation'
    || typeof record.iteration !== 'number'
    || typeof record.commandPath !== 'string'
    || !Array.isArray(record.args)
    || typeof record.promptArtifactPath !== 'string'
    || typeof record.stdinHash !== 'string') {
    return null;
  }

  return record as unknown as RalphCliInvocation;
}

function normalizeProvenanceBundle(candidate: unknown): RalphProvenanceBundle | null {
  if (typeof candidate !== 'object' || candidate === null) {
    return null;
  }

  const record = candidate as Record<string, unknown>;
  if (record.kind !== 'provenanceBundle'
    || typeof record.provenanceId !== 'string'
    || typeof record.iteration !== 'number'
    || typeof record.promptKind !== 'string'
    || typeof record.promptTarget !== 'string'
    || typeof record.trustLevel !== 'string'
    || typeof record.bundleDir !== 'string'
    || typeof record.status !== 'string'
    || typeof record.summary !== 'string') {
    return null;
  }

  return record as unknown as RalphProvenanceBundle;
}

function iterationFailureMessage(result: { iteration: number; execution: { transcriptPath?: string } }): string {
  return `codex exec failed on iteration ${result.iteration}. See ${result.execution.transcriptPath ?? 'the Ralph artifacts'} and the Ralph Codex output channel.`;
}

async function collectStatusSnapshot(
  workspaceFolder: vscode.WorkspaceFolder,
  stateManager: RalphStateManager,
  logger: Logger
): Promise<RalphStatusSnapshot> {
  const config = readConfig(workspaceFolder);
  const inspection = await stateManager.inspectWorkspace(workspaceFolder.uri.fsPath, config);
  await logger.setWorkspaceLogFile(inspection.paths.logFilePath);

  const taskInspection = inspection.fileStatus.taskFilePath
    ? await stateManager.inspectTaskFile(inspection.paths)
    : {
      taskFile: null,
      text: null,
      migrated: false,
      diagnostics: []
    };
  const taskCounts = taskInspection.taskFile
    ? await stateManager.taskCounts(inspection.paths).catch(() => null)
    : null;
  let taskFileError: string | null = null;
  let selectedTask = null;

  if (taskInspection.taskFile) {
    selectedTask = selectNextTask(taskInspection.taskFile);
  } else if (taskInspection.diagnostics.length > 0) {
    taskFileError = taskInspection.diagnostics.map((diagnostic) => diagnostic.message).join(' ');
  }

  const focusPath = vscode.window.activeTextEditor?.document.uri.scheme === 'file'
    ? vscode.window.activeTextEditor.document.uri.fsPath
    : null;
  const availableCommands = await vscode.commands.getCommands(true);
  const [workspaceScan, latestArtifacts, gitStatus, codexCliSupport] = await Promise.all([
    scanWorkspace(workspaceFolder.uri.fsPath, workspaceFolder.name, { focusPath }),
    resolveLatestStatusArtifacts(inspection.paths),
    captureGitStatus(workspaceFolder.uri.fsPath),
    inspectCodexCliSupport(config.codexCommandPath)
  ]);
  const ideCommandSupport = inspectIdeCommandSupport({
    preferredHandoffMode: config.preferredHandoffMode,
    openSidebarCommandId: config.openSidebarCommandId,
    newChatCommandId: config.newChatCommandId,
    availableCommands
  });
  const validationCommand = chooseValidationCommand(workspaceScan, selectedTask, config.validationCommandOverride);
  const validationCommandReadiness = await inspectValidationCommandReadiness({
    command: validationCommand,
    rootPath: workspaceFolder.uri.fsPath
  });
  const preflightReport = buildPreflightReport({
    rootPath: workspaceFolder.uri.fsPath,
    workspaceTrusted: vscode.workspace.isTrusted,
    config,
    taskInspection,
    taskCounts,
    selectedTask,
    validationCommand,
    validationCommandReadiness,
    fileStatus: inspection.fileStatus,
    codexCliSupport,
    ideCommandSupport
  });
  const [latestExecutionPlan, latestCliInvocation, latestProvenanceBundle] = await Promise.all([
    readJsonArtifact(latestArtifacts.latestExecutionPlanPath).then(normalizeExecutionPlan),
    readJsonArtifact(latestArtifacts.latestCliInvocationPath).then(normalizeCliInvocation),
    readJsonArtifact(latestArtifacts.latestProvenanceBundlePath).then(normalizeProvenanceBundle)
  ]);

  return {
    workspaceName: workspaceFolder.name,
    rootPath: workspaceFolder.uri.fsPath,
    workspaceTrusted: vscode.workspace.isTrusted,
    nextIteration: inspection.state.nextIteration,
    lastIteration: inspection.state.lastIteration,
    taskCounts,
    taskFileError,
    selectedTask,
    latestSummaryPath: latestArtifacts.latestSummaryPath,
    latestResultPath: latestArtifacts.latestResultPath,
    latestPreflightReportPath: latestArtifacts.latestPreflightReportPath,
    latestPreflightSummaryPath: latestArtifacts.latestPreflightSummaryPath,
    latestPromptPath: latestArtifacts.latestPromptPath,
    latestPromptEvidencePath: latestArtifacts.latestPromptEvidencePath,
    latestExecutionPlanPath: latestArtifacts.latestExecutionPlanPath,
    latestCliInvocationPath: latestArtifacts.latestCliInvocationPath,
    latestProvenanceBundlePath: latestArtifacts.latestProvenanceBundlePath,
    latestProvenanceSummaryPath: latestArtifacts.latestProvenanceSummaryPath,
    latestProvenanceFailurePath: latestArtifacts.latestProvenanceFailurePath,
    artifactDir: inspection.paths.artifactDir,
    stateFilePath: inspection.paths.stateFilePath,
    progressPath: inspection.paths.progressPath,
    taskFilePath: inspection.paths.taskFilePath,
    promptPath: inspection.state.lastIteration?.promptPath ?? inspection.state.lastPromptPath,
    latestExecutionPlan,
    latestCliInvocation,
    latestProvenanceBundle,
    provenanceBundleRetentionCount: config.provenanceBundleRetentionCount,
    verifierModes: config.verifierModes,
    gitCheckpointMode: config.gitCheckpointMode,
    validationCommandOverride: config.validationCommandOverride || null,
    workspaceScan,
    gitStatus,
    preflightReport
  };
}

async function openLatestRalphSummary(
  workspaceFolder: vscode.WorkspaceFolder,
  stateManager: RalphStateManager,
  logger: Logger
): Promise<boolean> {
  const config = readConfig(workspaceFolder);
  const inspection = await stateManager.inspectWorkspace(workspaceFolder.uri.fsPath, config);
  await logger.setWorkspaceLogFile(inspection.paths.logFilePath);
  const latestArtifacts = await resolveLatestStatusArtifacts(inspection.paths);

  if (latestArtifacts.latestSummaryPath) {
    await openTextFile(latestArtifacts.latestSummaryPath);
    return true;
  }

  if (latestArtifacts.latestPreflightSummaryPath) {
    await openTextFile(latestArtifacts.latestPreflightSummaryPath);
    return true;
  }

  const reason = inspection.state.lastIteration
    ? 'The latest Ralph summary artifact is missing from the artifact directory.'
    : 'No Ralph summary exists yet because no CLI iteration has completed and no preflight has been persisted.';
  void vscode.window.showInformationMessage(
    `${reason} Run Ralph Codex: Run CLI Iteration or Ralph Codex: Run CLI Loop, then try again.`
  );
  return false;
}

async function openLatestProvenanceBundle(
  workspaceFolder: vscode.WorkspaceFolder,
  stateManager: RalphStateManager,
  logger: Logger
): Promise<boolean> {
  const config = readConfig(workspaceFolder);
  const inspection = await stateManager.inspectWorkspace(workspaceFolder.uri.fsPath, config);
  await logger.setWorkspaceLogFile(inspection.paths.logFilePath);
  const latestArtifacts = await resolveLatestStatusArtifacts(inspection.paths);

  if (latestArtifacts.latestProvenanceSummaryPath) {
    await openTextFile(latestArtifacts.latestProvenanceSummaryPath);
    return true;
  }

  if (latestArtifacts.latestExecutionPlanPath) {
    await openTextFile(latestArtifacts.latestExecutionPlanPath);
    return true;
  }

  void vscode.window.showInformationMessage(
    'No Ralph provenance bundle exists yet. Prepare a prompt or run a CLI iteration, then try again.'
  );
  return false;
}

async function revealLatestProvenanceBundleDirectory(
  workspaceFolder: vscode.WorkspaceFolder,
  stateManager: RalphStateManager,
  logger: Logger
): Promise<boolean> {
  const config = readConfig(workspaceFolder);
  const inspection = await stateManager.inspectWorkspace(workspaceFolder.uri.fsPath, config);
  await logger.setWorkspaceLogFile(inspection.paths.logFilePath);
  const latestArtifacts = await resolveLatestStatusArtifacts(inspection.paths);
  const latestBundle = await readJsonArtifact(latestArtifacts.latestProvenanceBundlePath).then(normalizeProvenanceBundle);

  if (!latestBundle?.bundleDir) {
    void vscode.window.showInformationMessage(
      'No Ralph provenance bundle exists yet. Prepare a prompt or run a CLI iteration, then try again.'
    );
    return false;
  }

  await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(latestBundle.bundleDir));
  const choice = await vscode.window.showInformationMessage(
    `Revealed the latest Ralph provenance bundle directory: ${latestBundle.bundleDir}`,
    latestArtifacts.latestProvenanceSummaryPath ? 'Open Bundle Summary' : 'Open Bundle Manifest'
  );

  if (choice === 'Open Bundle Summary' && latestArtifacts.latestProvenanceSummaryPath) {
    await openTextFile(latestArtifacts.latestProvenanceSummaryPath);
  } else if (choice === 'Open Bundle Manifest') {
    await openTextFile(path.join(latestBundle.bundleDir, 'provenance-bundle.json'));
  }

  return true;
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
          cancellable: false
        },
        async (progress) => spec.handler(progress)
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

export function registerCommands(context: vscode.ExtensionContext, logger: Logger): void {
  const stateManager = new RalphStateManager(context.workspaceState, logger);
  const strategies = new CodexStrategyRegistry(logger);
  const engine = new RalphIterationEngine(stateManager, strategies, logger);

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
      const run = await engine.runCliIteration(workspaceFolder, 'singleExec', progress, {
        reachedIterationCap: false
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
    commandId: 'ralphCodex.runRalphLoop',
    label: 'Ralph Codex: Run CLI Loop',
    handler: async (progress) => {
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

      let lastRun: Awaited<ReturnType<RalphIterationEngine['runCliIteration']>> | null = null;
      for (let index = 0; index < config.ralphIterationCap; index += 1) {
        progress.report({
          message: `Running Ralph loop iteration ${index + 1} of ${config.ralphIterationCap}`,
          increment: 100 / config.ralphIterationCap
        });

        lastRun = await engine.runCliIteration(workspaceFolder, 'loop', progress, {
          reachedIterationCap: index + 1 >= config.ralphIterationCap
        });

        if (lastRun.result.executionStatus === 'failed') {
          throw new Error(iterationFailureMessage(lastRun.result));
        }

        if (!lastRun.loopDecision.shouldContinue) {
          void vscode.window.showInformationMessage(
            `Ralph CLI loop stopped after iteration ${lastRun.result.iteration}: ${lastRun.loopDecision.message}`
          );
          return;
        }
      }

      void vscode.window.showInformationMessage(
        lastRun
          ? `Ralph CLI loop completed ${config.ralphIterationCap} iteration(s). Last outcome: ${lastRun.result.completionClassification}.`
          : 'Ralph CLI loop completed with no iterations.'
      );
    }
  });

  registerCommand(context, logger, {
    commandId: 'ralphCodex.showRalphStatus',
    label: 'Ralph Codex: Show Status',
    requiresTrustedWorkspace: false,
    handler: async (progress) => {
      progress.report({ message: 'Collecting workspace and Ralph status' });
      const workspaceFolder = await withWorkspaceFolder();
      const status = await collectStatusSnapshot(workspaceFolder, stateManager, logger);
      const report = buildStatusReport(status);

      logger.show(false);
      logger.appendText(report);
      logger.info('Ralph status snapshot generated.', {
        workspace: status.workspaceName,
        latestSummaryPath: status.latestSummaryPath,
        latestResultPath: status.latestResultPath,
        latestExecutionPlanPath: status.latestExecutionPlanPath,
        selectedTaskId: status.selectedTask?.id ?? null,
        stopReason: status.lastIteration?.stopReason ?? null
      });

      const primaryAction = status.latestSummaryPath ? 'Open Latest Summary' : 'Show Output';
      const choice = await vscode.window.showInformationMessage(
        vscode.workspace.isTrusted
          ? 'Ralph status summary is available in the Ralph Codex output channel.'
          : 'Ralph status summary is available in the Ralph Codex output channel in limited mode.',
        primaryAction,
        'Show Output'
      );

      if (choice === 'Open Latest Summary' && status.latestSummaryPath) {
        await openLatestRalphSummary(workspaceFolder, stateManager, logger);
      } else if (choice === 'Show Output') {
        logger.show(false);
      }
    }
  });

  registerCommand(context, logger, {
    commandId: 'ralphCodex.openLatestRalphSummary',
    label: 'Ralph Codex: Open Latest Ralph Summary',
    requiresTrustedWorkspace: false,
    handler: async (progress) => {
      progress.report({ message: 'Resolving latest Ralph summary artifact' });
      const workspaceFolder = await withWorkspaceFolder();
      await openLatestRalphSummary(workspaceFolder, stateManager, logger);
    }
  });

  registerCommand(context, logger, {
    commandId: 'ralphCodex.openLatestProvenanceBundle',
    label: 'Ralph Codex: Open Latest Provenance Bundle',
    requiresTrustedWorkspace: false,
    handler: async (progress) => {
      progress.report({ message: 'Resolving latest Ralph provenance bundle' });
      const workspaceFolder = await withWorkspaceFolder();
      await openLatestProvenanceBundle(workspaceFolder, stateManager, logger);
    }
  });

  registerCommand(context, logger, {
    commandId: 'ralphCodex.revealLatestProvenanceBundleDirectory',
    label: 'Ralph Codex: Reveal Latest Provenance Bundle Directory',
    requiresTrustedWorkspace: false,
    handler: async (progress) => {
      progress.report({ message: 'Revealing latest Ralph provenance bundle directory' });
      const workspaceFolder = await withWorkspaceFolder();
      await revealLatestProvenanceBundleDirectory(workspaceFolder, stateManager, logger);
    }
  });

  registerCommand(context, logger, {
    commandId: 'ralphCodex.resetRalphWorkspaceState',
    label: 'Ralph Codex: Reset Runtime State',
    handler: async (progress) => {
      const workspaceFolder = await withWorkspaceFolder();
      const confirmed = await vscode.window.showWarningMessage(
        'Reset Ralph runtime state? This preserves the PRD, progress log, and task file, but deletes .ralph/state.json, generated prompts, run artifacts, iteration artifacts, and extension logs.',
        { modal: true },
        'Reset'
      );

      if (confirmed !== 'Reset') {
        return;
      }

      progress.report({ message: 'Removing generated Ralph artifacts' });
      const config = readConfig(workspaceFolder);
      const snapshot = await stateManager.resetRuntimeState(workspaceFolder.uri.fsPath, config);
      await logger.setWorkspaceLogFile(snapshot.paths.logFilePath);
      logger.info('Reset Ralph workspace runtime state.', {
        rootPath: workspaceFolder.uri.fsPath,
        createdPaths: snapshot.createdPaths
      });
      void vscode.window.showInformationMessage('Ralph runtime state reset. Durable PRD, progress, and task files were preserved.');
    }
  });
}
