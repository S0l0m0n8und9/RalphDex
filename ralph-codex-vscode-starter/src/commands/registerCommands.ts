import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { readConfig } from '../config/readConfig';
import { CodexStrategyRegistry } from '../codex/providerFactory';
import { RalphIterationEngine } from '../ralph/iterationEngine';
import { RalphStateManager } from '../ralph/stateManager';
import {
  withTaskFileLock
} from '../ralph/taskFile';
import type {
  RalphSuggestedChildTask,
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
import { scaffoldPipelineRun, writePipelineArtifact } from '../ralph/pipeline';
import { resolveRalphPaths } from '../ralph/pathResolver';

interface RegisteredCommandSpec {
  commandId: string;
  label: string;
  requiresTrustedWorkspace?: boolean;
  handler: (progress: vscode.Progress<{ message?: string; increment?: number }>) => Promise<void>;
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

      await openTextFile(result.prdPath);
      void vscode.window.showInformationMessage(
        'Initialized a fresh Ralph workspace scaffold under .ralph/. Fill in .ralph/prd.md before running Ralph commands.'
      );
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

      broadcaster?.emitLoopStart(config.ralphIterationCap);
      let lastRun: Awaited<ReturnType<RalphIterationEngine['runCliIteration']>> | null = null;
      for (let index = 0; index < config.ralphIterationCap; index += 1) {
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

          broadcaster?.emitLoopEnd(index + 1, lastRun.result.stopReason);
          void vscode.window.showInformationMessage(
            `Ralph CLI loop stopped after iteration ${lastRun.result.iteration}: ${lastRun.loopDecision.message}`
          );
          return;
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
    handler: async (progress) => {
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

      // Build distinct agentId per slot. Use suffix only when multiple agents share the same base id.
      const agentSlots = Array.from({ length: agentCount }, (_, i) => ({
        slotIndex: i,
        agentId: agentCount > 1 ? `${config.agentId}-${i + 1}` : config.agentId
      }));

      type SlotResult = { agentId: string; lastRun: Awaited<ReturnType<RalphIterationEngine['runCliIteration']>> | null; reloadRequired: boolean };

      const agentLoops = agentSlots.map(async ({ agentId }): Promise<SlotResult> => {
        let lastRun: Awaited<ReturnType<RalphIterationEngine['runCliIteration']>> | null = null;

        for (let index = 0; index < config.ralphIterationCap; index += 1) {
          lastRun = await engine.runCliIteration(workspaceFolder, 'loop', progress, {
            reachedIterationCap: index + 1 >= config.ralphIterationCap,
            configOverrides: { agentId }
          });

          if (lastRun.result.executionStatus === 'failed') {
            throw new Error(`Agent ${agentId}: ${iterationFailureMessage(lastRun.result)}`);
          }

          if (!lastRun.loopDecision.shouldContinue) {
            if (
              lastRun.result.stopReason === 'control_plane_reload_required'
              && config.autoReloadOnControlPlaneChange
            ) {
              logger.info('Multi-agent loop: agent hit control-plane change.', { agentId, iteration: lastRun.result.iteration });
              return { agentId, lastRun, reloadRequired: true };
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

      const finalArtifact = {
        ...artifact,
        status: loopStatus,
        loopEndTime: new Date().toISOString()
      } as const;

      await writePipelineArtifact(paths.artifactDir, finalArtifact);

      logger.info('Pipeline run complete.', {
        runId: artifact.runId,
        status: loopStatus,
        artifactPath
      });

      void vscode.window.showInformationMessage(
        `Ralph pipeline ${artifact.runId} finished with status: ${loopStatus}. Root task: ${rootTaskId} (${childTaskIds.length} subtask(s)).`
      );
    }
  });

  // Delegate artifact-inspection and maintenance commands to the extracted module.
  registerArtifactAndMaintenanceCommands(context, logger, stateManager, registerCommand);
}
