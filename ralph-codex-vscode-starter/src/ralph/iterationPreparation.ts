import * as vscode from 'vscode';
import { readConfig } from '../config/readConfig';
import { RalphCodexConfig } from '../config/types';
import { buildPrompt, createPromptFileName, decidePromptKind } from '../prompt/promptBuilder';
import { Logger } from '../services/logger';
import { scanWorkspace } from '../services/workspaceScanner';
import { inspectCodexCliSupport, inspectIdeCommandSupport } from '../services/codexCliSupport';
import { RalphStateManager } from './stateManager';
import { createProvenanceId, hashJson, hashText, utf8ByteLength } from './integrity';
import { deriveRootPolicy } from './rootPolicy';
import {
  RalphExecutionPlan,
  RalphPersistedPreflightReport,
  RalphPreflightReport,
  RalphPromptEvidence,
  RalphPromptKind,
  RalphPromptTarget,
  RalphProvenanceTrustLevel,
  RalphRootPolicy,
  RalphTask,
  RalphTaskCounts,
  RalphTaskFile,
  RalphWorkspaceState
} from './types';
import { countTaskStatuses, selectNextTask } from './taskFile';
import {
  buildBlockingPreflightMessage,
  buildPreflightReport,
  inspectPreflightArtifactReadiness,
  renderPreflightReport
} from './preflight';
import {
  captureCoreState,
  captureGitStatus,
  chooseValidationCommand,
  GitStatusSnapshot,
  inspectValidationCommandReadiness,
  normalizeValidationCommand,
  RalphCoreStateSnapshot
} from './verifier';
import {
  resolveIterationArtifactPaths,
  resolvePreflightArtifactPaths,
  resolveProvenanceBundlePaths,
  writeExecutionPlanArtifact,
  writePreflightArtifacts,
  writePromptArtifacts
} from './artifactStore';

const EMPTY_GIT_STATUS: GitStatusSnapshot = {
  available: false,
  raw: '',
  entries: []
};

export interface PreparedPromptContext {
  config: RalphCodexConfig;
  rootPath: string;
  rootPolicy: RalphRootPolicy;
  state: RalphWorkspaceState;
  paths: ReturnType<RalphStateManager['resolvePaths']>;
  provenanceId: string;
  trustLevel: RalphProvenanceTrustLevel;
  promptKind: RalphPromptKind;
  promptTarget: RalphPromptTarget;
  promptSelectionReason: string;
  promptPath: string;
  promptTemplatePath: string;
  promptEvidence: RalphPromptEvidence;
  executionPlan: RalphExecutionPlan;
  executionPlanHash: string;
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
  taskValidationHint: string | null;
  effectiveValidationCommand: string | null;
  normalizedValidationCommandFrom: string | null;
  validationCommand: string | null;
  preflightReport: RalphPreflightReport;
  persistedPreflightReport: RalphPersistedPreflightReport;
  preflightSummaryText: string;
  provenanceBundlePaths: ReturnType<typeof resolveProvenanceBundlePaths>;
  createdPaths: string[];
}

export interface PreparedIterationContext extends PreparedPromptContext {
  beforeCoreState: RalphCoreStateSnapshot;
  beforeGit: GitStatusSnapshot;
  phaseSeed: {
    inspectStartedAt: string;
    inspectFinishedAt: string;
    taskSelectedAt: string;
    promptGeneratedAt: string;
  };
}

export interface PreparedPrompt extends PreparedPromptContext {}

export interface PrepareIterationContextInput {
  workspaceFolder: vscode.WorkspaceFolder;
  progress: vscode.Progress<{ message?: string; increment?: number }>;
  includeVerifierContext: boolean;
  stateManager: RalphStateManager;
  logger: Logger;
  persistBlockedPreflightBundle: (input: {
    paths: ReturnType<RalphStateManager['resolvePaths']>;
    provenanceId: string;
    iteration: number;
    promptKind: RalphPromptKind;
    promptTarget: RalphPromptTarget;
    trustLevel: RalphProvenanceTrustLevel;
    provenanceRetentionCount: number;
    generatedArtifactRetentionCount: number;
    selectedTask: RalphTask | null;
    rootPolicy: RalphRootPolicy;
    persistedPreflightReport: RalphPersistedPreflightReport;
    preflightSummaryText: string;
  }) => Promise<void>;
  persistPreparedProvenanceBundle: (prepared: PreparedPromptContext) => Promise<void>;
}

function trustLevelForTarget(promptTarget: RalphPromptTarget): RalphProvenanceTrustLevel {
  return promptTarget === 'cliExec' ? 'verifiedCliExecution' : 'preparedPromptOnly';
}

async function maybeSeedObjective(
  stateManager: RalphStateManager,
  paths: ReturnType<RalphStateManager['resolvePaths']>
): Promise<string> {
  const objectiveText = await stateManager.readObjectiveText(paths);
  if (!stateManager.isDefaultObjective(objectiveText)) {
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

  await stateManager.writeObjectiveText(paths, nextText);
  return `${nextText}\n`;
}

export async function prepareIterationContext(
  input: PrepareIterationContextInput
): Promise<PreparedIterationContext> {
  const { workspaceFolder, progress, includeVerifierContext, stateManager, logger } = input;
  const inspectStartedAt = new Date().toISOString();
  progress.report({ message: 'Inspecting Ralph workspace' });
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

  const objectiveText = await maybeSeedObjective(stateManager, snapshot.paths);
  const focusPath = vscode.window.activeTextEditor?.document.uri.scheme === 'file'
    ? vscode.window.activeTextEditor.document.uri.fsPath
    : null;
  const [progressText, taskInspection, taskCounts, summary, beforeCoreState] = await Promise.all([
    stateManager.readProgressText(snapshot.paths),
    stateManager.inspectTaskFile(snapshot.paths),
    stateManager.taskCounts(snapshot.paths).catch(() => null),
    scanWorkspace(rootPath, workspaceFolder.name, {
      focusPath,
      inspectionRootOverride: config.inspectionRootOverride
    }),
    captureCoreState(snapshot.paths)
  ]);
  const tasksText = taskInspection.text ?? beforeCoreState.tasksText;
  const taskFile = taskInspection.taskFile ?? beforeCoreState.taskFile;
  const effectiveTaskCounts = taskCounts ?? countTaskStatuses(taskFile);
  const selectedTask = selectNextTask(taskFile);
  const taskSelectedAt = new Date().toISOString();
  const rootPolicy = deriveRootPolicy(summary);
  const promptTarget: RalphPromptTarget = includeVerifierContext ? 'cliExec' : 'ideHandoff';
  const promptDecision = decidePromptKind(snapshot.state, promptTarget, {
    selectedTask,
    taskCounts: effectiveTaskCounts,
    taskInspectionDiagnostics: taskInspection.diagnostics
  });
  const promptKind = promptDecision.kind;
  const taskValidationHint = selectedTask?.validation?.trim() || null;
  const selectedValidationCommand = promptKind === 'replenish-backlog'
    ? null
    : chooseValidationCommand(summary, selectedTask, config.validationCommandOverride);
  const effectiveValidationCommand = promptKind === 'replenish-backlog'
    ? null
    : normalizeValidationCommand({
      command: selectedValidationCommand,
      workspaceRootPath: workspaceFolder.uri.fsPath,
      verificationRootPath: rootPolicy.verificationRootPath
    });
  const normalizedValidationCommandFrom = selectedValidationCommand
    && effectiveValidationCommand
    && selectedValidationCommand !== effectiveValidationCommand
    ? selectedValidationCommand
    : null;
  const validationCommandReadiness = await inspectValidationCommandReadiness({
    command: effectiveValidationCommand,
    rootPath: rootPolicy.verificationRootPath
  });
  const trustLevel = trustLevelForTarget(promptTarget);
  const iteration = snapshot.state.nextIteration;
  const provenanceId = createProvenanceId({
    iteration,
    promptTarget,
    createdAt: taskSelectedAt
  });
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
  const artifactReadinessDiagnostics = await inspectPreflightArtifactReadiness({
    rootPath,
    artifactRootDir: snapshot.paths.artifactDir,
    promptDir: snapshot.paths.promptDir,
    runDir: snapshot.paths.runDir,
    stateFilePath: snapshot.paths.stateFilePath,
    generatedArtifactRetentionCount: config.generatedArtifactRetentionCount,
    provenanceBundleRetentionCount: config.provenanceBundleRetentionCount
  });
  const preflightReport = buildPreflightReport({
    rootPath,
    workspaceTrusted: vscode.workspace.isTrusted,
    config,
    taskInspection,
    taskCounts: effectiveTaskCounts,
    selectedTask,
    taskValidationHint,
    validationCommand: effectiveValidationCommand,
    normalizedValidationCommandFrom,
    validationCommandReadiness,
    fileStatus: snapshot.fileStatus,
    createdPaths: snapshot.createdPaths,
    codexCliSupport,
    ideCommandSupport,
    artifactReadinessDiagnostics
  });
  const preflightArtifactPaths = resolvePreflightArtifactPaths(snapshot.paths.artifactDir, iteration);
  const {
    persistedReport: persistedPreflightReport,
    humanSummary: preflightSummaryText
  } = await writePreflightArtifacts({
    paths: preflightArtifactPaths,
    artifactRootDir: snapshot.paths.artifactDir,
    provenanceId,
    iteration,
    promptKind,
    promptTarget,
    trustLevel,
    report: preflightReport,
    selectedTaskId: selectedTask?.id ?? null,
    selectedTaskTitle: selectedTask?.title ?? null,
    taskValidationHint,
    effectiveValidationCommand,
    normalizedValidationCommandFrom,
    validationCommand: effectiveValidationCommand
  });
  progress.report({ message: preflightReport.summary });
  logger.appendText(renderPreflightReport(preflightReport));
  logger.info('Prepared Ralph preflight report.', {
    rootPath,
    iteration,
    ready: preflightReport.ready,
    preflightReportPath: preflightArtifactPaths.reportPath,
    preflightSummaryPath: preflightArtifactPaths.summaryPath,
    diagnostics: preflightReport.diagnostics
  });
  if (includeVerifierContext && !preflightReport.ready) {
    await input.persistBlockedPreflightBundle({
      paths: snapshot.paths,
      provenanceId,
      iteration,
      promptKind,
      promptTarget,
      trustLevel,
      provenanceRetentionCount: config.provenanceBundleRetentionCount,
      generatedArtifactRetentionCount: config.generatedArtifactRetentionCount,
      selectedTask,
      rootPolicy,
      persistedPreflightReport,
      preflightSummaryText
    });
    throw new Error(buildBlockingPreflightMessage(preflightReport));
  }

  progress.report({ message: 'Generating Ralph prompt' });
  const artifactPaths = resolveIterationArtifactPaths(snapshot.paths.artifactDir, iteration);
  const provenanceBundlePaths = resolveProvenanceBundlePaths(snapshot.paths.artifactDir, provenanceId);
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
    taskValidationHint,
    effectiveValidationCommand,
    normalizedValidationCommandFrom,
    validationCommand: effectiveValidationCommand,
    preflightReport,
    config
  });
  const prompt = promptRender.prompt;
  const promptEvidence: RalphPromptEvidence = {
    ...promptRender.evidence,
    provenanceId
  };

  const promptPath = await stateManager.writePrompt(
    snapshot.paths,
    createPromptFileName(promptKind, iteration),
    prompt
  );
  await writePromptArtifacts({
    paths: artifactPaths,
    artifactRootDir: snapshot.paths.artifactDir,
    prompt,
    promptEvidence
  });
  const executionPlan: RalphExecutionPlan = {
    schemaVersion: 1,
    kind: 'executionPlan',
    provenanceId,
    iteration,
    selectedTaskId: selectedTask?.id ?? null,
    selectedTaskTitle: selectedTask?.title ?? null,
    taskValidationHint,
    effectiveValidationCommand,
    normalizedValidationCommandFrom,
    promptKind,
    promptTarget,
    selectionReason: promptDecision.reason,
    rootPolicy,
    templatePath: promptRender.templatePath,
    promptPath,
    promptArtifactPath: artifactPaths.promptPath,
    promptEvidencePath: artifactPaths.promptEvidencePath,
    promptHash: hashText(prompt),
    promptByteLength: utf8ByteLength(prompt),
    artifactDir: artifactPaths.directory,
    createdAt: new Date().toISOString()
  };
  const executionPlanHash = hashJson(executionPlan);
  await writeExecutionPlanArtifact({
    paths: artifactPaths,
    artifactRootDir: snapshot.paths.artifactDir,
    plan: executionPlan
  });
  const promptGeneratedAt = new Date().toISOString();
  const beforeGit = includeVerifierContext
    && (config.verifierModes.includes('gitDiff') || config.gitCheckpointMode !== 'off')
    ? await captureGitStatus(rootPolicy.verificationRootPath)
    : EMPTY_GIT_STATUS;

  logger.info('Prepared Ralph prompt context.', {
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
    promptEvidence,
    selectedTaskId: selectedTask?.id ?? null,
    taskValidationHint,
    effectiveValidationCommand,
    normalizedValidationCommandFrom
  });

  const preparedContext: PreparedIterationContext = {
    config,
    rootPath,
    rootPolicy,
    state: snapshot.state,
    paths: snapshot.paths,
    provenanceId,
    trustLevel,
    promptKind,
    promptTarget,
    promptSelectionReason: promptDecision.reason,
    promptPath,
    promptTemplatePath: promptRender.templatePath,
    promptEvidence,
    executionPlan,
    executionPlanHash,
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
    taskValidationHint,
    effectiveValidationCommand,
    normalizedValidationCommandFrom,
    validationCommand: effectiveValidationCommand,
    preflightReport,
    persistedPreflightReport,
    preflightSummaryText,
    provenanceBundlePaths,
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
  await input.persistPreparedProvenanceBundle(preparedContext);

  return preparedContext;
}
