import * as path from 'path';
import * as vscode from 'vscode';
import { readConfig } from '../config/readConfig';
import { RalphCodexConfig } from '../config/types';
import { CodexStrategyRegistry } from '../codex/providerFactory';
import { buildPrompt, choosePromptKind, createArtifactBaseName, createPromptFileName } from '../prompt/promptBuilder';
import { RalphStateManager } from '../ralph/stateManager';
import { RalphRunMode, RalphRunRecord, RalphWorkspaceState } from '../ralph/types';
import { inspectCodexCliSupport } from '../services/codexCliSupport';
import { Logger } from '../services/logger';
import { scanWorkspace } from '../services/workspaceScanner';
import { inspectIdeCommandSupport, requireTrustedWorkspace } from './workspaceSupport';

interface PreparedPrompt {
  config: RalphCodexConfig;
  rootPath: string;
  state: RalphWorkspaceState;
  paths: ReturnType<RalphStateManager['resolvePaths']>;
  promptKind: ReturnType<typeof choosePromptKind>;
  promptPath: string;
  prompt: string;
  iteration: number;
  objectiveText: string;
  createdPaths: string[];
}

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

async function ensureCodexCliReady(config: RalphCodexConfig): Promise<void> {
  const support = await inspectCodexCliSupport(config.codexCommandPath);
  if (support.check === 'pathMissing') {
    throw new Error(`Codex CLI path "${config.codexCommandPath}" does not exist. Update ralphCodex.codexCommandPath or install Codex CLI.`);
  }
}

async function maybeSeedObjective(stateManager: RalphStateManager, paths: PreparedPrompt['paths']): Promise<string> {
  const objectiveText = await stateManager.readObjectiveText(paths);
  if (!stateManager.isDefaultObjective(objectiveText)) {
    return objectiveText;
  }

  const seededObjective = await vscode.window.showInputBox({
    prompt: 'Seed the PRD with a short objective for this workspace',
    placeHolder: 'Example: Harden the VS Code extension starter into a reliable v1'
  });

  if (!seededObjective?.trim()) {
    return objectiveText;
  }

  const nextText = [
    '# Product / project brief',
    '',
    seededObjective.trim()
  ].join('\n');

  await stateManager.writeObjectiveText(paths, nextText);
  return `${nextText}\n`;
}

async function preparePrompt(
  workspaceFolder: vscode.WorkspaceFolder,
  stateManager: RalphStateManager,
  logger: Logger,
  progress: vscode.Progress<{ message?: string; increment?: number }>
): Promise<PreparedPrompt> {
  progress.report({ message: 'Ensuring Ralph workspace' });
  const config = readConfig(workspaceFolder);
  const rootPath = workspaceFolder.uri.fsPath;
  const snapshot = await stateManager.ensureWorkspace(rootPath, config);
  await logger.setWorkspaceLogFile(snapshot.paths.logFilePath);

  if (snapshot.createdPaths.length > 0) {
    logger.warn('Initialized or repaired Ralph workspace paths.', {
      rootPath,
      createdPaths: snapshot.createdPaths
    });
  }

  progress.report({ message: 'Reading Ralph state and workspace summary' });
  const objectiveText = await maybeSeedObjective(stateManager, snapshot.paths);
  const progressText = await stateManager.readProgressText(snapshot.paths);
  const tasksText = await stateManager.readTaskFileText(snapshot.paths);
  const taskCounts = await stateManager.taskCounts(snapshot.paths);
  const summary = await scanWorkspace(rootPath, workspaceFolder.name);
  const promptKind = choosePromptKind(snapshot.state);
  const iteration = snapshot.state.nextIteration;

  progress.report({ message: 'Writing prompt artifact' });
  const prompt = buildPrompt({
    kind: promptKind,
    iteration,
    objectiveText,
    progressText,
    tasksText,
    taskCounts,
    summary,
    state: snapshot.state,
    paths: snapshot.paths
  });

  const promptPath = await stateManager.writePrompt(
    snapshot.paths,
    createPromptFileName(promptKind, iteration),
    prompt
  );

  logger.info('Generated Ralph prompt.', {
    rootPath,
    promptKind,
    iteration,
    promptPath
  });

  return {
    config,
    rootPath,
    state: snapshot.state,
    paths: snapshot.paths,
    promptKind,
    promptPath,
    prompt,
    iteration,
    objectiveText,
    createdPaths: snapshot.createdPaths
  };
}

async function showWarnings(warnings: string[]): Promise<void> {
  if (warnings.length === 0) {
    return;
  }

  await vscode.window.showWarningMessage(warnings.join(' '));
}

function runRecordFromExec(
  mode: RalphRunMode,
  prepared: PreparedPrompt,
  startedAt: string,
  execResult: {
    exitCode: number;
    transcriptPath: string;
    lastMessagePath: string;
    lastMessage: string;
  }
): RalphRunRecord {
  const summary = execResult.lastMessage
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0)
    ?? `Exit code ${execResult.exitCode}`;

  return {
    iteration: prepared.iteration,
    mode,
    promptKind: prepared.promptKind,
    startedAt,
    finishedAt: new Date().toISOString(),
    status: execResult.exitCode === 0 ? 'succeeded' : 'failed',
    exitCode: execResult.exitCode,
    promptPath: prepared.promptPath,
    transcriptPath: execResult.transcriptPath,
    lastMessagePath: execResult.lastMessagePath,
    summary
  };
}

async function runExecIteration(
  workspaceFolder: vscode.WorkspaceFolder,
  stateManager: RalphStateManager,
  strategies: CodexStrategyRegistry,
  logger: Logger,
  mode: RalphRunMode,
  progress: vscode.Progress<{ message?: string; increment?: number }>,
  loopState?: { index: number; total: number }
): Promise<void> {
  const prepared = await preparePrompt(workspaceFolder, stateManager, logger, progress);
  const artifactBaseName = createArtifactBaseName(prepared.promptKind, prepared.iteration);
  const runArtifacts = stateManager.runArtifactPaths(prepared.paths, artifactBaseName);
  const execStrategy = strategies.getCliExecStrategy();
  if (!execStrategy.runExec) {
    throw new Error('The configured Codex CLI strategy does not support codex exec.');
  }

  const startedAt = new Date().toISOString();
  logger.show(false);
  logger.info('Running Ralph iteration.', {
    iteration: prepared.iteration,
    mode,
    loopState,
    promptPath: prepared.promptPath
  });

  progress.report({
    message: loopState
      ? `Running Codex CLI iteration ${loopState.index} of ${loopState.total}`
      : `Running Codex CLI iteration ${prepared.iteration}`
  });

  const execResult = await execStrategy.runExec({
    commandPath: prepared.config.codexCommandPath,
    workspaceRoot: prepared.rootPath,
    prompt: prepared.prompt,
    promptPath: prepared.promptPath,
    transcriptPath: runArtifacts.transcriptPath,
    lastMessagePath: runArtifacts.lastMessagePath,
    model: prepared.config.model,
    sandboxMode: prepared.config.sandboxMode,
    approvalMode: prepared.config.approvalMode,
    onStdoutChunk: (chunk) => logger.info('codex stdout', { iteration: prepared.iteration, chunk }),
    onStderrChunk: (chunk) => logger.warn('codex stderr', { iteration: prepared.iteration, chunk })
  });

  const runRecord = runRecordFromExec(mode, prepared, startedAt, execResult);
  await stateManager.recordRun(prepared.rootPath, prepared.paths, prepared.state, runRecord, prepared.objectiveText);

  logger.info('Completed Ralph iteration.', {
    iteration: prepared.iteration,
    exitCode: execResult.exitCode,
    transcriptPath: execResult.transcriptPath,
    lastMessagePath: execResult.lastMessagePath
  });

  if (execResult.exitCode !== 0) {
    throw new Error(
      `codex exec failed on iteration ${prepared.iteration} with exit code ${execResult.exitCode}. See ${path.basename(execResult.transcriptPath)} and the Ralph Codex output channel.`
    );
  }

  if (mode === 'singleExec') {
    const note = createdPathSummary(prepared.rootPath, prepared.createdPaths);
    void vscode.window.showInformationMessage(
      note
        ? `Ralph CLI iteration ${prepared.iteration} completed. ${note}`
        : `Ralph CLI iteration ${prepared.iteration} completed.`
    );
  }
}

async function collectStatusSnapshot(
  workspaceFolder: vscode.WorkspaceFolder,
  stateManager: RalphStateManager,
  logger: Logger
): Promise<Record<string, unknown>> {
  const config = readConfig(workspaceFolder);
  const inspection = await stateManager.inspectWorkspace(workspaceFolder.uri.fsPath, config);
  await logger.setWorkspaceLogFile(inspection.paths.logFilePath);

  const [summary, ideCommandSupport, codexCliSupport] = await Promise.all([
    scanWorkspace(workspaceFolder.uri.fsPath, workspaceFolder.name),
    inspectIdeCommandSupport(config),
    inspectCodexCliSupport(config.codexCommandPath)
  ]);

  let taskCounts: Awaited<ReturnType<RalphStateManager['taskCounts']>> | null = null;
  let taskFileError: string | null = null;

  if (inspection.fileStatus.taskFilePath) {
    try {
      taskCounts = await stateManager.taskCounts(inspection.paths);
    } catch (error) {
      taskFileError = toErrorMessage(error);
    }
  }

  const missingRalphPaths = Object.entries(inspection.fileStatus)
    .filter(([, present]) => !present)
    .map(([label]) => label);

  return {
    workspace: workspaceFolder.name,
    rootPath: workspaceFolder.uri.fsPath,
    workspaceTrusted: vscode.workspace.isTrusted,
    activationMode: vscode.workspace.isTrusted ? 'full' : 'limited',
    preferredHandoffMode: config.preferredHandoffMode,
    codexCommandPath: config.codexCommandPath,
    codexCliSupport,
    ideCommandSupport,
    nextIteration: inspection.state.nextIteration,
    objectivePreview: inspection.state.objectivePreview,
    lastPromptKind: inspection.state.lastPromptKind,
    lastPromptPath: inspection.state.lastPromptPath,
    lastRun: inspection.state.lastRun,
    taskCounts,
    taskFileError,
    ralphFileStatus: inspection.fileStatus,
    missingRalphPaths,
    manifests: summary.manifests,
    lifecycleCommands: summary.lifecycleCommands,
    progressPath: inspection.paths.progressPath,
    taskFilePath: inspection.paths.taskFilePath,
    stateFilePath: inspection.paths.stateFilePath,
    logFilePath: inspection.paths.logFilePath
  };
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

  registerCommand(context, logger, {
    commandId: 'ralphCodex.generatePrompt',
    label: 'Ralph Codex: Prepare Prompt',
    handler: async (progress) => {
      const workspaceFolder = await withWorkspaceFolder();
      const prepared = await preparePrompt(workspaceFolder, stateManager, logger, progress);
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
        nextIteration: recordState.nextIteration,
        promptKind: prepared.promptKind
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
      const prepared = await preparePrompt(workspaceFolder, stateManager, logger, progress);
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
      await ensureCodexCliReady(readConfig(workspaceFolder));
      await runExecIteration(workspaceFolder, stateManager, strategies, logger, 'singleExec', progress);
    }
  });

  registerCommand(context, logger, {
    commandId: 'ralphCodex.runRalphLoop',
    label: 'Ralph Codex: Run CLI Loop',
    handler: async (progress) => {
      const workspaceFolder = await withWorkspaceFolder();
      const config = readConfig(workspaceFolder);
      await ensureCodexCliReady(config);
      logger.show(false);
      logger.info('Starting Ralph loop.', {
        rootPath: workspaceFolder.uri.fsPath,
        iterationCap: config.ralphIterationCap
      });

      for (let index = 0; index < config.ralphIterationCap; index += 1) {
        progress.report({
          message: `Preparing iteration ${index + 1} of ${config.ralphIterationCap}`,
          increment: 100 / config.ralphIterationCap
        });
        await runExecIteration(workspaceFolder, stateManager, strategies, logger, 'loop', progress, {
          index: index + 1,
          total: config.ralphIterationCap
        });
      }

      void vscode.window.showInformationMessage(`Ralph CLI loop completed ${config.ralphIterationCap} iteration(s).`);
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

      logger.show(false);
      logger.info('Ralph status snapshot.', status);
      void vscode.window.showInformationMessage(
        vscode.workspace.isTrusted
          ? 'Ralph status written to the Ralph Codex output channel.'
          : 'Ralph status written to the Ralph Codex output channel in limited mode.'
      );
    }
  });

  registerCommand(context, logger, {
    commandId: 'ralphCodex.resetRalphWorkspaceState',
    label: 'Ralph Codex: Reset Runtime State',
    handler: async (progress) => {
      const workspaceFolder = await withWorkspaceFolder();
      const confirmed = await vscode.window.showWarningMessage(
        'Reset Ralph runtime state? This preserves the PRD, progress log, and task file, but deletes .ralph/state.json, generated prompts, run artifacts, and extension logs.',
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
