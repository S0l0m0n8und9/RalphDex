import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { readConfig } from '../config/readConfig';
import { RalphCodexConfig } from '../config/types';
import { CodexStrategyRegistry } from '../codex/providerFactory';
import { buildPrompt, createArtifactBaseName, createPromptFileName, decidePromptKind } from '../prompt/promptBuilder';
import { Logger } from '../services/logger';
import { scanWorkspace } from '../services/workspaceScanner';
import { inspectCodexCliSupport, inspectIdeCommandSupport } from '../services/codexCliSupport';
import { RalphStateManager } from './stateManager';
import { hashText, utf8ByteLength } from './integrity';
import {
  RalphCliInvocation,
  RalphDiffSummary,
  RalphExecutionPlan,
  RalphIterationResult,
  RalphLoopDecision,
  RalphPreflightReport,
  RalphPromptEvidence,
  RalphPromptKind,
  RalphPromptTarget,
  RalphRunMode,
  RalphRunRecord,
  RalphTask,
  RalphTaskCounts,
  RalphTaskFile,
  RalphWorkspaceState
} from './types';
import { countTaskStatuses, remainingSubtasks, selectNextTask } from './taskFile';
import { classifyIterationOutcome, classifyVerificationStatus, decideLoopContinuation } from './loopLogic';
import { buildBlockingPreflightMessage, buildPreflightReport, renderPreflightReport } from './preflight';
import {
  captureCoreState,
  captureGitStatus,
  chooseValidationCommand,
  GitStatusSnapshot,
  inspectValidationCommandReadiness,
  RalphCoreStateSnapshot,
  runFileChangeVerifier,
  runTaskStateVerifier,
  runValidationCommandVerifier
} from './verifier';
import {
  resolveIterationArtifactPaths,
  resolvePreflightArtifactPaths,
  writeCliInvocationArtifact,
  writeExecutionPlanArtifact,
  writePromptArtifacts,
  writeIterationArtifacts,
  writePreflightArtifacts
} from './artifactStore';

const EMPTY_GIT_STATUS: GitStatusSnapshot = {
  available: false,
  raw: '',
  entries: []
};

interface PreparedPromptContext {
  config: RalphCodexConfig;
  rootPath: string;
  state: RalphWorkspaceState;
  paths: ReturnType<RalphStateManager['resolvePaths']>;
  promptKind: RalphPromptKind;
  promptTarget: RalphPromptTarget;
  promptSelectionReason: string;
  promptPath: string;
  promptTemplatePath: string;
  promptEvidence: RalphPromptEvidence;
  executionPlan: RalphExecutionPlan;
  executionPlanPath: string;
  prompt: string;
  iteration: number;
  objectiveText: string;
  progressText: string;
  tasksText: string;
  taskFile: RalphTaskFile;
  taskCounts: RalphTaskCounts;
  summary: Awaited<ReturnType<typeof scanWorkspace>>;
  selectedTask: RalphTask | null;
  validationCommand: string | null;
  preflightReport: RalphPreflightReport;
  createdPaths: string[];
}

interface PreparedIterationContext extends PreparedPromptContext {
  beforeCoreState: RalphCoreStateSnapshot;
  beforeGit: GitStatusSnapshot;
  phaseSeed: Pick<RalphIterationResult['phaseTimestamps'], 'inspectStartedAt' | 'inspectFinishedAt' | 'taskSelectedAt' | 'promptGeneratedAt'>;
}

export interface PreparedPrompt extends PreparedPromptContext {}

export interface RalphIterationRunSummary {
  prepared: PreparedPrompt;
  result: RalphIterationResult;
  loopDecision: RalphLoopDecision;
  createdPaths: string[];
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function summarizeLastMessage(lastMessage: string, exitCode: number | null): string {
  return lastMessage
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0)
    ?? (exitCode === null ? 'Execution skipped.' : `Exit code ${exitCode}`);
}

async function readVerifiedPromptArtifact(plan: RalphExecutionPlan): Promise<string> {
  const promptArtifactText = await fs.readFile(plan.promptArtifactPath, 'utf8').catch((error: unknown) => {
    throw new Error(
      `Execution integrity check failed before launch: could not read prompt artifact ${plan.promptArtifactPath}: ${toErrorMessage(error)}`
    );
  });

  const artifactHash = hashText(promptArtifactText);
  if (artifactHash !== plan.promptHash) {
    throw new Error(
      `Execution integrity check failed before launch: prompt artifact hash ${artifactHash} did not match planned prompt hash ${plan.promptHash}.`
    );
  }

  return promptArtifactText;
}

function runRecordFromIteration(
  mode: RalphRunMode,
  prepared: PreparedIterationContext,
  startedAt: string,
  result: RalphIterationResult
): RalphRunRecord | undefined {
  if (result.executionStatus === 'skipped') {
    return undefined;
  }

  return {
    iteration: prepared.iteration,
    mode,
    promptKind: prepared.promptKind,
    startedAt,
    finishedAt: result.finishedAt,
    status: result.executionStatus === 'succeeded' ? 'succeeded' : 'failed',
    exitCode: result.execution.exitCode,
    promptPath: prepared.promptPath,
    transcriptPath: result.execution.transcriptPath,
    lastMessagePath: result.execution.lastMessagePath,
    summary: result.summary
  };
}

export class RalphIterationEngine {
  public constructor(
    private readonly stateManager: RalphStateManager,
    private readonly strategies: CodexStrategyRegistry,
    private readonly logger: Logger
  ) {}

  public async preparePrompt(
    workspaceFolder: vscode.WorkspaceFolder,
    progress: vscode.Progress<{ message?: string; increment?: number }>
  ): Promise<PreparedPrompt> {
    const prepared = await this.prepareIterationContext(workspaceFolder, progress, false);

    return {
      ...prepared
    };
  }

  public async runCliIteration(
    workspaceFolder: vscode.WorkspaceFolder,
    mode: RalphRunMode,
    progress: vscode.Progress<{ message?: string; increment?: number }>,
    options: {
      reachedIterationCap: boolean;
    }
  ): Promise<RalphIterationRunSummary> {
    const prepared = await this.prepareIterationContext(workspaceFolder, progress, true);
    const artifactPaths = resolveIterationArtifactPaths(prepared.paths.artifactDir, prepared.iteration);
    const startedAt = prepared.phaseSeed.inspectStartedAt;
    const phaseTimestamps: RalphIterationResult['phaseTimestamps'] = {
      inspectStartedAt: prepared.phaseSeed.inspectStartedAt,
      inspectFinishedAt: prepared.phaseSeed.inspectFinishedAt,
      taskSelectedAt: prepared.phaseSeed.taskSelectedAt,
      promptGeneratedAt: prepared.phaseSeed.promptGeneratedAt,
      resultCollectedAt: startedAt,
      verificationFinishedAt: startedAt,
      classifiedAt: startedAt
    };

    progress.report({
      message: `Executing Ralph iteration ${prepared.iteration}`
    });

    const execStrategy = this.strategies.getCliExecStrategy();
    if (!execStrategy.runExec) {
      throw new Error('The configured Codex CLI strategy does not support codex exec.');
    }

    let executionStatus: RalphIterationResult['executionStatus'] = 'skipped';
    let executionWarnings: string[] = [];
    let executionErrors: string[] = [];
    let execStdout = '';
    let execStderr = '';
    let execExitCode: number | null = null;
    let execStdinHash: string | null = null;
    let transcriptPath: string | undefined;
    let lastMessagePath: string | undefined;
    let lastMessage = '';

    if (prepared.selectedTask) {
      const artifactBaseName = createArtifactBaseName(prepared.promptKind, prepared.iteration);
      const runArtifacts = this.stateManager.runArtifactPaths(prepared.paths, artifactBaseName);

      this.logger.info('Running Ralph iteration.', {
        iteration: prepared.iteration,
        mode,
        promptPath: prepared.promptPath,
        promptArtifactPath: prepared.executionPlan.promptArtifactPath,
        promptHash: prepared.executionPlan.promptHash,
        selectedTaskId: prepared.selectedTask.id,
        validationCommand: prepared.validationCommand
      });

      const promptArtifactText = await readVerifiedPromptArtifact(prepared.executionPlan);
      phaseTimestamps.executionStartedAt = new Date().toISOString();
      const execResult = await execStrategy.runExec({
        commandPath: prepared.config.codexCommandPath,
        workspaceRoot: prepared.rootPath,
        prompt: promptArtifactText,
        promptPath: prepared.executionPlan.promptArtifactPath,
        promptHash: prepared.executionPlan.promptHash,
        promptByteLength: prepared.executionPlan.promptByteLength,
        transcriptPath: runArtifacts.transcriptPath,
        lastMessagePath: runArtifacts.lastMessagePath,
        model: prepared.config.model,
        sandboxMode: prepared.config.sandboxMode,
        approvalMode: prepared.config.approvalMode,
        onStdoutChunk: (chunk) => this.logger.info('codex stdout', { iteration: prepared.iteration, chunk }),
        onStderrChunk: (chunk) => this.logger.warn('codex stderr', { iteration: prepared.iteration, chunk })
      });
      phaseTimestamps.executionFinishedAt = new Date().toISOString();

      executionStatus = execResult.exitCode === 0 ? 'succeeded' : 'failed';
      executionWarnings = execResult.warnings;
      executionErrors = execResult.exitCode === 0 ? [] : [execResult.message];
      execStdout = execResult.stdout;
      execStderr = execResult.stderr;
      execExitCode = execResult.exitCode;
      execStdinHash = execResult.stdinHash;
      transcriptPath = execResult.transcriptPath;
      lastMessagePath = execResult.lastMessagePath;
      lastMessage = execResult.lastMessage;

      const invocation: RalphCliInvocation = {
        schemaVersion: 1,
        kind: 'cliInvocation',
        iteration: prepared.iteration,
        commandPath: prepared.config.codexCommandPath,
        args: execResult.args,
        workspaceRoot: prepared.rootPath,
        promptArtifactPath: prepared.executionPlan.promptArtifactPath,
        promptHash: prepared.executionPlan.promptHash,
        promptByteLength: prepared.executionPlan.promptByteLength,
        stdinHash: execResult.stdinHash,
        transcriptPath: execResult.transcriptPath,
        lastMessagePath: execResult.lastMessagePath,
        createdAt: new Date().toISOString()
      };
      await writeCliInvocationArtifact({
        paths: artifactPaths,
        artifactRootDir: prepared.paths.artifactDir,
        invocation
      });
    } else {
      executionWarnings = ['No actionable Ralph task was selected; execution was skipped.'];
      phaseTimestamps.executionStartedAt = new Date().toISOString();
      phaseTimestamps.executionFinishedAt = phaseTimestamps.executionStartedAt;
    }

    phaseTimestamps.resultCollectedAt = new Date().toISOString();

    const afterCoreState = await captureCoreState(prepared.paths);
    const shouldCaptureGit = prepared.config.verifierModes.includes('gitDiff') || prepared.config.gitCheckpointMode !== 'off';
    const afterGit = shouldCaptureGit ? await captureGitStatus(prepared.rootPath) : EMPTY_GIT_STATUS;

    progress.report({ message: 'Running Ralph verifiers' });

    const validationVerification = prepared.config.verifierModes.includes('validationCommand') && executionStatus === 'succeeded'
      ? await runValidationCommandVerifier({
        command: prepared.validationCommand,
        rootPath: prepared.rootPath,
        artifactDir: artifactPaths.directory
      })
      : {
        command: prepared.validationCommand,
        stdout: '',
        stderr: '',
        exitCode: null,
        result: {
          verifier: 'validationCommand' as const,
          status: 'skipped' as const,
          summary: executionStatus === 'succeeded'
            ? 'Validation-command verifier disabled for this iteration.'
            : 'Validation-command verifier skipped because Codex execution did not succeed.',
          warnings: [],
          errors: [],
          command: prepared.validationCommand ?? undefined
        }
      };

    const taskStateVerification = prepared.config.verifierModes.includes('taskState')
      ? await runTaskStateVerifier({
        selectedTaskId: prepared.selectedTask?.id ?? null,
        before: prepared.beforeCoreState,
        after: afterCoreState,
        artifactDir: artifactPaths.directory
      })
      : {
        selectedTaskAfter: prepared.selectedTask,
        selectedTaskCompleted: false,
        selectedTaskBlocked: false,
        humanReviewNeeded: false,
        progressChanged: false,
        taskFileChanged: false,
        result: {
          verifier: 'taskState' as const,
          status: 'skipped' as const,
          summary: 'Task-state verifier disabled for this iteration.',
          warnings: [],
          errors: []
        }
      };

    const shouldRunFileChangeVerifier = prepared.config.verifierModes.includes('gitDiff')
      || prepared.config.gitCheckpointMode === 'snapshotAndDiff';
    const fileChangeVerification = shouldRunFileChangeVerifier
      ? await runFileChangeVerifier({
        rootPath: prepared.rootPath,
        artifactDir: artifactPaths.directory,
        beforeGit: prepared.beforeGit,
        afterGit,
        before: prepared.beforeCoreState,
        after: afterCoreState
      })
      : {
        diffSummary: null as RalphDiffSummary | null,
        result: {
          verifier: 'gitDiff' as const,
          status: 'skipped' as const,
          summary: 'Git-diff/file-change verifier disabled for this iteration.',
          warnings: [],
          errors: []
        }
      };

    phaseTimestamps.verificationFinishedAt = new Date().toISOString();

    const verifierResults = [
      validationVerification.result,
      fileChangeVerification.result,
      taskStateVerification.result
    ];
    const verificationStatus = classifyVerificationStatus(verifierResults.map((item) => item.status));
    const selectedTaskAfter = taskStateVerification.selectedTaskAfter ?? prepared.selectedTask;
    const remainingSubtaskList = remainingSubtasks(afterCoreState.taskFile, prepared.selectedTask?.id ?? null);
    const afterTaskCounts = countTaskStatuses(afterCoreState.taskFile);
    const remainingTaskCount = afterTaskCounts.todo + afterTaskCounts.in_progress + afterTaskCounts.blocked;
    const nextActionableTask = selectNextTask(afterCoreState.taskFile);
    const outcome = classifyIterationOutcome({
      selectedTaskId: prepared.selectedTask?.id ?? null,
      selectedTaskCompleted: taskStateVerification.selectedTaskCompleted,
      selectedTaskBlocked: taskStateVerification.selectedTaskBlocked,
      humanReviewNeeded: taskStateVerification.humanReviewNeeded,
      remainingSubtaskCount: remainingSubtaskList.length,
      remainingTaskCount,
      executionStatus,
      verificationStatus,
      validationFailureSignature: validationVerification.result.failureSignature ?? null,
      relevantFileChanges: fileChangeVerification.diffSummary?.relevantChangedFiles ?? [],
      progressChanged: taskStateVerification.progressChanged,
      taskFileChanged: taskStateVerification.taskFileChanged,
      previousIterations: prepared.state.iterationHistory
    });

    let completionClassification = outcome.classification;
    let followUpAction = outcome.followUpAction;
    if (!prepared.selectedTask) {
      if (prepared.taskCounts.todo === 0 && prepared.taskCounts.in_progress === 0 && prepared.taskCounts.blocked === 0) {
        completionClassification = 'complete';
        followUpAction = 'stop';
      } else if (prepared.taskCounts.todo === 0 && prepared.taskCounts.in_progress === 0 && prepared.taskCounts.blocked > 0) {
        completionClassification = 'blocked';
        followUpAction = 'request_human_review';
      }
    }

    phaseTimestamps.classifiedAt = new Date().toISOString();

    const summary = [
      prepared.selectedTask
        ? `Selected ${prepared.selectedTask.id}: ${prepared.selectedTask.title}`
        : 'No actionable Ralph task selected.',
      `Execution: ${executionStatus}`,
      `Verification: ${verificationStatus}`,
      `Outcome: ${completionClassification}`,
      `Backlog remaining: ${remainingTaskCount}`
    ].join(' | ');
    const warnings = [
      ...executionWarnings,
      ...verifierResults.flatMap((item) => item.warnings)
    ];
    const errors = [
      ...executionErrors,
      ...verifierResults.flatMap((item) => item.errors)
    ];

    const result: RalphIterationResult = {
      schemaVersion: 1,
      iteration: prepared.iteration,
      selectedTaskId: prepared.selectedTask?.id ?? null,
      selectedTaskTitle: prepared.selectedTask?.title ?? null,
      promptKind: prepared.promptKind,
      promptPath: prepared.promptPath,
      artifactDir: artifactPaths.directory,
      adapterUsed: 'cliExec',
      executionIntegrity: {
        promptTarget: prepared.executionPlan.promptTarget,
        templatePath: prepared.executionPlan.templatePath,
        executionPlanPath: prepared.executionPlanPath,
        promptArtifactPath: prepared.executionPlan.promptArtifactPath,
        promptHash: prepared.executionPlan.promptHash,
        promptByteLength: prepared.executionPlan.promptByteLength,
        executionPayloadHash: execStdinHash,
        executionPayloadMatched: execStdinHash === null ? null : execStdinHash === prepared.executionPlan.promptHash,
        mismatchReason: execStdinHash === null
          ? null
          : execStdinHash === prepared.executionPlan.promptHash
            ? null
            : `Executed stdin hash ${execStdinHash} did not match planned prompt hash ${prepared.executionPlan.promptHash}.`,
        cliInvocationPath: prepared.selectedTask ? artifactPaths.cliInvocationPath : null
      },
      executionStatus,
      verificationStatus,
      completionClassification,
      followUpAction,
      startedAt,
      finishedAt: new Date().toISOString(),
      phaseTimestamps,
      summary,
      warnings,
      errors,
      execution: {
        exitCode: execExitCode,
        transcriptPath,
        lastMessagePath,
        stdoutPath: artifactPaths.stdoutPath,
        stderrPath: artifactPaths.stderrPath
      },
      verification: {
        primaryCommand: validationVerification.command ?? null,
        validationFailureSignature: validationVerification.result.failureSignature ?? null,
        verifiers: verifierResults
      },
      backlog: {
        remainingTaskCount,
        actionableTaskAvailable: Boolean(nextActionableTask)
      },
      diffSummary: fileChangeVerification.diffSummary,
      noProgressSignals: outcome.noProgressSignals,
      stopReason: null
    };

    const loopDecision = decideLoopContinuation({
      currentResult: result,
      selectedTaskCompleted: taskStateVerification.selectedTaskCompleted,
      remainingSubtaskCount: remainingSubtaskList.length,
      remainingTaskCount,
      hasActionableTask: Boolean(nextActionableTask),
      noProgressThreshold: prepared.config.noProgressThreshold,
      repeatedFailureThreshold: prepared.config.repeatedFailureThreshold,
      stopOnHumanReviewNeeded: prepared.config.stopOnHumanReviewNeeded,
      reachedIterationCap: options.reachedIterationCap,
      previousIterations: prepared.state.iterationHistory
    });

    if (!loopDecision.shouldContinue) {
      result.stopReason = loopDecision.stopReason;
      result.followUpAction = 'stop';
    }

    phaseTimestamps.persistedAt = new Date().toISOString();

    await writeIterationArtifacts({
      paths: artifactPaths,
      artifactRootDir: prepared.paths.artifactDir,
      prompt: prepared.prompt,
      promptEvidence: prepared.promptEvidence,
      stdout: execStdout,
      stderr: execStderr,
      executionSummary: {
        iteration: prepared.iteration,
        selectedTaskId: prepared.selectedTask?.id ?? null,
        promptKind: prepared.promptKind,
        promptTarget: prepared.executionPlan.promptTarget,
        templatePath: prepared.executionPlan.templatePath,
        executionPlanPath: prepared.executionPlanPath,
        promptArtifactPath: prepared.executionPlan.promptArtifactPath,
        promptHash: prepared.executionPlan.promptHash,
        executionPayloadHash: execStdinHash,
        executionPayloadMatched: execStdinHash === null ? null : execStdinHash === prepared.executionPlan.promptHash,
        cliInvocationPath: prepared.selectedTask ? artifactPaths.cliInvocationPath : null,
        executionStatus,
        exitCode: execExitCode,
        transcriptPath,
        lastMessagePath,
        lastMessage: summarizeLastMessage(lastMessage, execExitCode)
      },
      verifierSummary: verifierResults,
      diffSummary: fileChangeVerification.diffSummary,
      result,
      gitStatusBefore: prepared.beforeGit.available ? prepared.beforeGit.raw : undefined,
      gitStatusAfter: afterGit.available ? afterGit.raw : undefined
    });

    const runRecord = runRecordFromIteration(mode, prepared, startedAt, result);
    await this.stateManager.recordIteration(
      prepared.rootPath,
      prepared.paths,
      prepared.state,
      result,
      prepared.objectiveText,
      runRecord
    );

    this.logger.info('Completed Ralph iteration.', {
      iteration: prepared.iteration,
      selectedTaskId: prepared.selectedTask?.id ?? null,
      executionStatus,
      verificationStatus,
      completionClassification,
      stopReason: result.stopReason,
      promptPath: prepared.promptPath,
      promptArtifactPath: prepared.executionPlan.promptArtifactPath,
      promptHash: prepared.executionPlan.promptHash,
      executionPayloadMatched: result.executionIntegrity?.executionPayloadMatched ?? null,
      artifactDir: artifactPaths.directory,
      selectedTaskAfterStatus: selectedTaskAfter?.status ?? null
    });

    return {
      prepared,
      result,
      loopDecision,
      createdPaths: prepared.createdPaths
    };
  }

  private async maybeSeedObjective(paths: PreparedPromptContext['paths']): Promise<string> {
    const objectiveText = await this.stateManager.readObjectiveText(paths);
    if (!this.stateManager.isDefaultObjective(objectiveText)) {
      return objectiveText;
    }

    const seededObjective = await vscode.window.showInputBox({
      prompt: 'Seed the PRD with a short objective for this workspace',
      placeHolder: 'Example: Harden the VS Code extension starter into a reliable v2 iteration engine'
    });

    if (!seededObjective?.trim()) {
      return objectiveText;
    }

    const nextText = [
      '# Product / project brief',
      '',
      seededObjective.trim()
    ].join('\n');

    await this.stateManager.writeObjectiveText(paths, nextText);
    return `${nextText}\n`;
  }

  private async prepareIterationContext(
    workspaceFolder: vscode.WorkspaceFolder,
    progress: vscode.Progress<{ message?: string; increment?: number }>,
    includeVerifierContext: boolean
  ): Promise<PreparedIterationContext> {
    const inspectStartedAt = new Date().toISOString();
    progress.report({ message: 'Inspecting Ralph workspace' });
    const config = readConfig(workspaceFolder);
    const rootPath = workspaceFolder.uri.fsPath;
    const snapshot = await this.stateManager.ensureWorkspace(rootPath, config);
    await this.logger.setWorkspaceLogFile(snapshot.paths.logFilePath);

    if (snapshot.createdPaths.length > 0) {
      this.logger.warn('Initialized or repaired Ralph workspace paths.', {
        rootPath,
        createdPaths: snapshot.createdPaths
      });
    }

    const objectiveText = await this.maybeSeedObjective(snapshot.paths);
    const [progressText, taskInspection, taskCounts, summary, beforeCoreState] = await Promise.all([
      this.stateManager.readProgressText(snapshot.paths),
      this.stateManager.inspectTaskFile(snapshot.paths),
      this.stateManager.taskCounts(snapshot.paths).catch(() => null),
      scanWorkspace(rootPath, workspaceFolder.name),
      captureCoreState(snapshot.paths)
    ]);
    const tasksText = taskInspection.text ?? beforeCoreState.tasksText;
    const taskFile = taskInspection.taskFile ?? beforeCoreState.taskFile;
    const effectiveTaskCounts = taskCounts ?? countTaskStatuses(taskFile);
    const selectedTask = selectNextTask(taskFile);
    const taskSelectedAt = new Date().toISOString();
    const validationCommand = chooseValidationCommand(summary, selectedTask, config.validationCommandOverride);
    const validationCommandReadiness = await inspectValidationCommandReadiness({
      command: validationCommand,
      rootPath
    });
    const promptTarget: RalphPromptTarget = includeVerifierContext ? 'cliExec' : 'ideHandoff';
    const promptDecision = decidePromptKind(snapshot.state, promptTarget);
    const promptKind = promptDecision.kind;
    const iteration = snapshot.state.nextIteration;
    const [availableCommands, codexCliSupport] = await Promise.all([
      vscode.commands.getCommands(true),
      inspectCodexCliSupport(config.codexCommandPath)
    ]);
    const ideCommandSupport = inspectIdeCommandSupport({
      preferredHandoffMode: config.preferredHandoffMode,
      openSidebarCommandId: config.openSidebarCommandId,
      newChatCommandId: config.newChatCommandId,
      availableCommands
    });
    const preflightReport = buildPreflightReport({
      rootPath,
      workspaceTrusted: vscode.workspace.isTrusted,
      config,
      taskInspection,
      taskCounts: effectiveTaskCounts,
      selectedTask,
      validationCommand,
      validationCommandReadiness,
      fileStatus: snapshot.fileStatus,
      createdPaths: snapshot.createdPaths,
      codexCliSupport,
      ideCommandSupport
    });
    const preflightArtifactPaths = resolvePreflightArtifactPaths(snapshot.paths.artifactDir, iteration);
    await writePreflightArtifacts({
      paths: preflightArtifactPaths,
      artifactRootDir: snapshot.paths.artifactDir,
      iteration,
      promptKind,
      report: preflightReport,
      selectedTaskId: selectedTask?.id ?? null,
      selectedTaskTitle: selectedTask?.title ?? null,
      validationCommand
    });
    progress.report({ message: preflightReport.summary });
    this.logger.appendText(renderPreflightReport(preflightReport));
    this.logger.info('Prepared Ralph preflight report.', {
      rootPath,
      iteration,
      ready: preflightReport.ready,
      preflightReportPath: preflightArtifactPaths.reportPath,
      preflightSummaryPath: preflightArtifactPaths.summaryPath,
      diagnostics: preflightReport.diagnostics
    });
    if (includeVerifierContext && !preflightReport.ready) {
      throw new Error(buildBlockingPreflightMessage(preflightReport));
    }

    progress.report({ message: 'Generating Ralph prompt' });
    const artifactPaths = resolveIterationArtifactPaths(snapshot.paths.artifactDir, iteration);
    const promptRender = await buildPrompt({
      kind: promptKind,
      target: promptTarget,
      iteration,
      selectionReason: promptDecision.reason,
      objectiveText,
      progressText,
      taskCounts: effectiveTaskCounts,
      summary,
      state: snapshot.state,
      paths: snapshot.paths,
      taskFile,
      selectedTask,
      validationCommand,
      preflightReport,
      config
    });
    const prompt = promptRender.prompt;

    const promptPath = await this.stateManager.writePrompt(
      snapshot.paths,
      createPromptFileName(promptKind, iteration),
      prompt
    );
    await writePromptArtifacts({
      paths: artifactPaths,
      artifactRootDir: snapshot.paths.artifactDir,
      prompt,
      promptEvidence: promptRender.evidence
    });
    const executionPlan: RalphExecutionPlan = {
      schemaVersion: 1,
      kind: 'executionPlan',
      iteration,
      selectedTaskId: selectedTask?.id ?? null,
      selectedTaskTitle: selectedTask?.title ?? null,
      promptKind,
      promptTarget,
      selectionReason: promptDecision.reason,
      templatePath: promptRender.templatePath,
      promptPath,
      promptArtifactPath: artifactPaths.promptPath,
      promptEvidencePath: artifactPaths.promptEvidencePath,
      promptHash: hashText(prompt),
      promptByteLength: utf8ByteLength(prompt),
      artifactDir: artifactPaths.directory,
      createdAt: new Date().toISOString()
    };
    await writeExecutionPlanArtifact({
      paths: artifactPaths,
      artifactRootDir: snapshot.paths.artifactDir,
      plan: executionPlan
    });
    const promptGeneratedAt = new Date().toISOString();
    const beforeGit = includeVerifierContext
      && (config.verifierModes.includes('gitDiff') || config.gitCheckpointMode !== 'off')
      ? await captureGitStatus(rootPath)
      : EMPTY_GIT_STATUS;

    this.logger.info('Prepared Ralph prompt context.', {
      rootPath,
      promptKind,
      promptTarget,
      promptSelectionReason: promptDecision.reason,
      iteration,
      promptPath,
      promptTemplatePath: promptRender.templatePath,
      promptArtifactPath: executionPlan.promptArtifactPath,
      promptHash: executionPlan.promptHash,
      executionPlanPath: artifactPaths.executionPlanPath,
      promptEvidence: promptRender.evidence,
      selectedTaskId: selectedTask?.id ?? null,
      validationCommand
    });

    return {
      config,
      rootPath,
      state: snapshot.state,
      paths: snapshot.paths,
      promptKind,
      promptTarget,
      promptSelectionReason: promptDecision.reason,
      promptPath,
      promptTemplatePath: promptRender.templatePath,
      promptEvidence: promptRender.evidence,
      executionPlan,
      executionPlanPath: artifactPaths.executionPlanPath,
      prompt,
      iteration,
      objectiveText,
      progressText,
      tasksText,
      taskFile,
      taskCounts: effectiveTaskCounts,
      summary,
      selectedTask,
      validationCommand,
      preflightReport,
      createdPaths: snapshot.createdPaths,
      beforeCoreState,
      beforeGit,
      phaseSeed: {
        inspectStartedAt,
        inspectFinishedAt: taskSelectedAt,
        taskSelectedAt,
        promptGeneratedAt
      }
    };
  }
}
