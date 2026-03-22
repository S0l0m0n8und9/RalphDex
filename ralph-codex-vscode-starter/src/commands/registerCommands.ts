import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { readConfig } from '../config/readConfig';
import { CodexStrategyRegistry } from '../codex/providerFactory';
import { RalphIterationEngine } from '../ralph/iterationEngine';
import { buildPreflightReport, checkStaleState, inspectPreflightArtifactReadiness } from '../ralph/preflight';
import { deriveRootPolicy } from '../ralph/rootPolicy';
import {
  buildStatusReport,
  RalphLatestRemediationStatus,
  resolveLatestStatusArtifacts,
  RalphStatusSnapshot
} from '../ralph/statusReport';
import { RalphStateManager } from '../ralph/stateManager';
import {
  inspectTaskClaimGraph,
  resolveStaleClaim,
  selectNextTask,
  withTaskFileLock
} from '../ralph/taskFile';
import {
  RalphCliInvocation,
  RalphExecutionPlan,
  RalphPromptEvidence,
  RalphProvenanceBundle,
  RalphCompletionReport,
  RalphSuggestedChildTask,
  RalphTaskRemediationArtifact
} from '../ralph/types';
import { inspectGeneratedArtifactRetention, inspectProvenanceBundleRetention } from '../ralph/artifactStore';
import {
  applyTaskDecompositionProposalArtifact,
  resolveApplicableTaskDecompositionProposal
} from '../ralph/taskDecomposition';
import {
  captureGitStatus,
  chooseValidationCommand,
  inspectValidationCommandReadiness,
  normalizeValidationCommand
} from '../ralph/verifier';
import { inspectCodexExecActivity } from '../services/cliActivity';
import { inspectCodexCliSupport, inspectIdeCommandSupport } from '../services/codexCliSupport';
import { Logger } from '../services/logger';
import { scanWorkspace } from '../services/workspaceScanner';
import { requireTrustedWorkspace } from './workspaceSupport';
import { CompletionReportArtifact } from '../ralph/completionReportParser';

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

function deletedCountSummary(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
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

async function pathExists(target: string | null | undefined): Promise<boolean> {
  if (!target) {
    return false;
  }

  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
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

async function firstExistingPath(candidates: Array<string | null | undefined>): Promise<string | null> {
  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate ?? null;
    }
  }

  return null;
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

function normalizePromptEvidence(candidate: unknown): RalphPromptEvidence | null {
  if (typeof candidate !== 'object' || candidate === null) {
    return null;
  }

  const record = candidate as Record<string, unknown>;
  if (typeof record.iteration !== 'number'
    || typeof record.kind !== 'string'
    || typeof record.target !== 'string'
    || typeof record.templatePath !== 'string'
    || typeof record.selectionReason !== 'string') {
    return null;
  }

  return record as unknown as RalphPromptEvidence;
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

function normalizeLatestRemediation(candidate: unknown): RalphLatestRemediationStatus | null {
  if (typeof candidate !== 'object' || candidate === null) {
    return null;
  }

  const record = candidate as Record<string, unknown>;
  if (typeof record.trigger !== 'string'
    || typeof record.attemptCount !== 'number'
    || typeof record.action !== 'string'
    || typeof record.humanReviewRecommended !== 'boolean'
    || typeof record.summary !== 'string'
    || !Array.isArray(record.evidence)
    || record.evidence.some((entry) => typeof entry !== 'string')) {
    return null;
  }

  return {
    trigger: record.trigger as RalphLatestRemediationStatus['trigger'],
    attemptCount: record.attemptCount,
    action: record.action as RalphLatestRemediationStatus['action'],
    humanReviewRecommended: record.humanReviewRecommended,
    summary: record.summary,
    evidence: record.evidence as string[],
    suggestedChildTasks: Array.isArray(record.suggestedChildTasks)
      ? record.suggestedChildTasks
        .filter((entry): entry is RalphSuggestedChildTask => {
          if (typeof entry !== 'object' || entry === null) {
            return false;
          }
          const child = entry as Record<string, unknown>;
          return typeof child.id === 'string'
            && typeof child.title === 'string'
            && typeof child.parentId === 'string'
            && (child.validation === null || typeof child.validation === 'string')
            && typeof child.rationale === 'string'
            && Array.isArray(child.dependsOn)
            && child.dependsOn.every((dependency) => {
              if (typeof dependency !== 'object' || dependency === null) {
                return false;
              }
              const record = dependency as Record<string, unknown>;
              return typeof record.taskId === 'string' && typeof record.reason === 'string';
            });
        })
      : []
  };
}

function normalizeTaskRemediationArtifact(candidate: unknown): RalphTaskRemediationArtifact | null {
  if (typeof candidate !== 'object' || candidate === null) {
    return null;
  }

  const record = candidate as Record<string, unknown>;
  if (record.kind !== 'taskRemediation'
    || typeof record.iteration !== 'number'
    || (typeof record.selectedTaskId !== 'string' && record.selectedTaskId !== null)
    || typeof record.action !== 'string'
    || !Array.isArray(record.suggestedChildTasks)) {
    return null;
  }

  const latestRemediation = normalizeLatestRemediation(candidate);
  if (!latestRemediation) {
    return null;
  }

  return {
    schemaVersion: 1,
    kind: 'taskRemediation',
    provenanceId: typeof record.provenanceId === 'string' ? record.provenanceId : null,
    iteration: record.iteration,
    selectedTaskId: record.selectedTaskId,
    selectedTaskTitle: typeof record.selectedTaskTitle === 'string' ? record.selectedTaskTitle : null,
    trigger: latestRemediation.trigger,
    attemptCount: latestRemediation.attemptCount,
    action: latestRemediation.action,
    humanReviewRecommended: latestRemediation.humanReviewRecommended,
    summary: latestRemediation.summary,
    rationale: typeof record.rationale === 'string' ? record.rationale : '',
    proposedAction: typeof record.proposedAction === 'string' ? record.proposedAction : latestRemediation.summary,
    evidence: latestRemediation.evidence,
    triggeringHistory: Array.isArray(record.triggeringHistory)
      ? record.triggeringHistory as RalphTaskRemediationArtifact['triggeringHistory']
      : [],
    suggestedChildTasks: latestRemediation.suggestedChildTasks ?? [],
    artifactDir: typeof record.artifactDir === 'string' ? record.artifactDir : '',
    iterationResultPath: typeof record.iterationResultPath === 'string' ? record.iterationResultPath : '',
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : ''
  };
}

function normalizeCompletionReportArtifact(candidate: unknown): CompletionReportArtifact | null {
  if (typeof candidate !== 'object' || candidate === null) {
    return null;
  }

  const record = candidate as Record<string, unknown>;
  if (record.kind !== 'completionReport'
    || typeof record.status !== 'string'
    || (typeof record.selectedTaskId !== 'string' && record.selectedTaskId !== null)
    || !Array.isArray(record.warnings)) {
    return null;
  }

  const report = record.report;
  const normalizedReport: RalphCompletionReport | null = typeof report === 'object' && report !== null
    ? report as RalphCompletionReport
    : null;

  return {
    schemaVersion: 1,
    kind: 'completionReport',
    status: record.status as CompletionReportArtifact['status'],
    rejectionReason: typeof record.rejectionReason === 'string' ? record.rejectionReason : null,
    selectedTaskId: record.selectedTaskId,
    report: normalizedReport,
    rawBlock: typeof record.rawBlock === 'string' ? record.rawBlock : null,
    parseError: typeof record.parseError === 'string' ? record.parseError : null,
    warnings: record.warnings.filter((warning): warning is string => typeof warning === 'string')
  };
}

function buildReviewAgentId(agentId: string): string {
  const trimmed = agentId.trim() || 'default';
  return trimmed.startsWith('review-') ? trimmed : `review-${trimmed}`;
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
  const [workspaceScan, latestArtifacts, codexCliSupport] = await Promise.all([
    scanWorkspace(workspaceFolder.uri.fsPath, workspaceFolder.name, {
      focusPath,
      inspectionRootOverride: config.inspectionRootOverride
    }),
    resolveLatestStatusArtifacts(inspection.paths),
    inspectCodexCliSupport(config.cliProvider === 'claude' ? config.claudeCommandPath : config.codexCommandPath)
  ]);
  const rootPolicy = deriveRootPolicy(workspaceScan);
  const gitStatus = await captureGitStatus(rootPolicy.verificationRootPath);
  const ideCommandSupport = inspectIdeCommandSupport({
    preferredHandoffMode: config.preferredHandoffMode,
    openSidebarCommandId: config.openSidebarCommandId,
    newChatCommandId: config.newChatCommandId,
    availableCommands
  });
  const validationCommand = normalizeValidationCommand({
    command: chooseValidationCommand(workspaceScan, selectedTask, config.validationCommandOverride),
    workspaceRootPath: workspaceFolder.uri.fsPath,
    verificationRootPath: rootPolicy.verificationRootPath
  });
  const taskValidationHint = selectedTask?.validation?.trim() || null;
  const rawSelectedValidationCommand = chooseValidationCommand(workspaceScan, selectedTask, config.validationCommandOverride);
  const normalizedValidationCommandFrom = rawSelectedValidationCommand
    && validationCommand
    && rawSelectedValidationCommand !== validationCommand
    ? rawSelectedValidationCommand
    : null;
  const validationCommandReadiness = await inspectValidationCommandReadiness({
    command: validationCommand,
    rootPath: rootPolicy.verificationRootPath
  });
  const [artifactReadinessDiagnostics, agentHealthDiagnostics] = await Promise.all([
    inspectPreflightArtifactReadiness({
      rootPath: workspaceFolder.uri.fsPath,
      artifactRootDir: inspection.paths.artifactDir,
      promptDir: inspection.paths.promptDir,
      runDir: inspection.paths.runDir,
      stateFilePath: inspection.paths.stateFilePath,
      generatedArtifactRetentionCount: config.generatedArtifactRetentionCount,
      provenanceBundleRetentionCount: config.provenanceBundleRetentionCount
    }),
    checkStaleState({
      stateFilePath: inspection.paths.stateFilePath,
      taskFilePath: inspection.paths.taskFilePath,
      claimFilePath: inspection.paths.claimFilePath,
      artifactDir: inspection.paths.artifactDir
    })
  ]);
  const claimGraph = await inspectTaskClaimGraph(inspection.paths.claimFilePath);
  const [latestPromptEvidence, latestExecutionPlan, latestCliInvocation, latestRemediation, latestProvenanceBundle] = await Promise.all([
    readJsonArtifact(latestArtifacts.latestPromptEvidencePath).then(normalizePromptEvidence),
    readJsonArtifact(latestArtifacts.latestExecutionPlanPath).then(normalizeExecutionPlan),
    readJsonArtifact(latestArtifacts.latestCliInvocationPath).then(normalizeCliInvocation),
    readJsonArtifact(latestArtifacts.latestRemediationPath).then(normalizeLatestRemediation),
    readJsonArtifact(latestArtifacts.latestProvenanceBundlePath).then(normalizeProvenanceBundle)
  ]);
  const currentProvenanceId = latestExecutionPlan?.provenanceId
    ?? latestProvenanceBundle?.provenanceId
    ?? inspection.state.lastIteration?.provenanceId
    ?? null;
  const preflightReport = buildPreflightReport({
    rootPath: workspaceFolder.uri.fsPath,
    workspaceTrusted: vscode.workspace.isTrusted,
    config,
    taskInspection,
    taskCounts,
    selectedTask,
    currentProvenanceId,
    claimGraph,
    taskValidationHint,
    validationCommand,
    normalizedValidationCommandFrom,
    validationCommandReadiness,
    fileStatus: inspection.fileStatus,
    codexCliSupport,
    ideCommandSupport,
    artifactReadinessDiagnostics,
    agentHealthDiagnostics
  });
  const [generatedArtifactRetention, provenanceBundleRetention] = await Promise.all([
    inspectGeneratedArtifactRetention({
      artifactRootDir: inspection.paths.artifactDir,
      promptDir: inspection.paths.promptDir,
      runDir: inspection.paths.runDir,
      stateFilePath: inspection.paths.stateFilePath,
      retentionCount: config.generatedArtifactRetentionCount
    }),
    inspectProvenanceBundleRetention({
      artifactRootDir: inspection.paths.artifactDir,
      retentionCount: config.provenanceBundleRetentionCount
    })
  ]);

  return {
    workspaceName: workspaceFolder.name,
    rootPath: workspaceFolder.uri.fsPath,
    workspaceTrusted: vscode.workspace.isTrusted,
    nextIteration: inspection.state.nextIteration,
    lastIteration: inspection.state.lastIteration,
    runHistory: inspection.state.runHistory,
    iterationHistory: inspection.state.iterationHistory,
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
    latestRemediationPath: latestArtifacts.latestRemediationPath,
    latestProvenanceBundlePath: latestArtifacts.latestProvenanceBundlePath,
    latestProvenanceSummaryPath: latestArtifacts.latestProvenanceSummaryPath,
    latestProvenanceFailurePath: latestArtifacts.latestProvenanceFailurePath,
    artifactDir: inspection.paths.artifactDir,
    stateFilePath: inspection.paths.stateFilePath,
    progressPath: inspection.paths.progressPath,
    taskFilePath: inspection.paths.taskFilePath,
    promptPath: inspection.state.lastIteration?.promptPath ?? inspection.state.lastPromptPath,
    latestPromptEvidence,
    latestExecutionPlan,
    latestCliInvocation,
    latestRemediation,
    latestProvenanceBundle,
    latestArtifactRepair: latestArtifacts.repair,
    generatedArtifactRetention,
    provenanceBundleRetention,
    generatedArtifactRetentionCount: config.generatedArtifactRetentionCount,
    provenanceBundleRetentionCount: config.provenanceBundleRetentionCount,
    verifierModes: config.verifierModes,
    gitCheckpointMode: config.gitCheckpointMode,
    validationCommandOverride: config.validationCommandOverride || null,
    workspaceScan,
    gitStatus,
    preflightReport,
    claimGraph,
    currentProvenanceId
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
    ? 'The latest Ralph summary artifact is missing or stale and could not be repaired from persisted Ralph metadata.'
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
    latestArtifacts.latestProvenanceBundlePath
      ? 'The latest Ralph provenance summary artifact is missing or stale and could not be repaired from the persisted bundle manifest.'
      : 'No Ralph provenance bundle exists yet. Prepare a prompt or run a CLI iteration, then try again.'
  );
  return false;
}

async function openLatestPromptEvidence(
  workspaceFolder: vscode.WorkspaceFolder,
  stateManager: RalphStateManager,
  logger: Logger
): Promise<boolean> {
  const config = readConfig(workspaceFolder);
  const inspection = await stateManager.inspectWorkspace(workspaceFolder.uri.fsPath, config);
  await logger.setWorkspaceLogFile(inspection.paths.logFilePath);
  const latestArtifacts = await resolveLatestStatusArtifacts(inspection.paths);

  if (latestArtifacts.latestPromptEvidencePath) {
    await openTextFile(latestArtifacts.latestPromptEvidencePath);
    return true;
  }

  void vscode.window.showInformationMessage(
    inspection.state.lastPromptPath || latestArtifacts.latestPromptPath
      ? 'The latest Ralph prompt evidence artifact is missing. Prepare a prompt or run a CLI iteration to regenerate prompt evidence, then try again.'
      : 'No Ralph prompt evidence exists yet. Prepare a prompt or run a CLI iteration, then try again.'
  );
  return false;
}

async function openLatestCliTranscriptOrLastMessage(
  workspaceFolder: vscode.WorkspaceFolder,
  stateManager: RalphStateManager,
  logger: Logger
): Promise<boolean> {
  const config = readConfig(workspaceFolder);
  const inspection = await stateManager.inspectWorkspace(workspaceFolder.uri.fsPath, config);
  await logger.setWorkspaceLogFile(inspection.paths.logFilePath);
  const latestArtifacts = await resolveLatestStatusArtifacts(inspection.paths);
  const latestCliInvocation = await readJsonArtifact(latestArtifacts.latestCliInvocationPath).then(normalizeCliInvocation);
  const transcriptPath = await firstExistingPath([
    latestCliInvocation?.transcriptPath,
    inspection.state.lastIteration?.execution.transcriptPath,
    inspection.state.lastRun?.transcriptPath
  ]);
  const lastMessagePath = await firstExistingPath([
    latestCliInvocation?.lastMessagePath,
    inspection.state.lastIteration?.execution.lastMessagePath,
    inspection.state.lastRun?.lastMessagePath
  ]);

  if (transcriptPath) {
    await openTextFile(transcriptPath);
    return true;
  }

  if (lastMessagePath) {
    await openTextFile(lastMessagePath);
    return true;
  }

  void vscode.window.showInformationMessage(
    latestArtifacts.latestCliInvocationPath || inspection.state.lastRun || inspection.state.lastIteration
      ? 'The latest Ralph CLI transcript and last-message artifacts are missing. Run a CLI iteration to generate fresh execution output, then try again.'
      : 'No Ralph CLI transcript exists yet because no CLI iteration has completed. Run Ralph Codex: Run CLI Iteration or Ralph Codex: Run CLI Loop, then try again.'
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

async function applyLatestTaskDecompositionProposal(
  workspaceFolder: vscode.WorkspaceFolder,
  stateManager: RalphStateManager,
  logger: Logger
): Promise<boolean> {
  const config = readConfig(workspaceFolder);
  const inspection = await stateManager.inspectWorkspace(workspaceFolder.uri.fsPath, config);
  await logger.setWorkspaceLogFile(inspection.paths.logFilePath);
  const latestArtifacts = await resolveLatestStatusArtifacts(inspection.paths);
  const remediationArtifact = await readJsonArtifact(latestArtifacts.latestRemediationPath).then(normalizeTaskRemediationArtifact);

  if (!remediationArtifact) {
    void vscode.window.showInformationMessage(
      'No latest Ralph remediation proposal exists yet. Run enough CLI iterations to record a remediation artifact, then try again.'
    );
    return false;
  }

  const proposal = resolveApplicableTaskDecompositionProposal(remediationArtifact);
  if (!proposal) {
    void vscode.window.showInformationMessage(
      'The latest Ralph remediation artifact does not contain an applicable task-decomposition proposal.'
    );
    return false;
  }

  const childTaskIds = proposal.suggestedChildTasks.map((task) => task.id);
  const confirmed = await vscode.window.showWarningMessage(
    `Apply the latest Ralph decomposition proposal for ${proposal.parentTaskId}? This updates .ralph/tasks.json by adding ${childTaskIds.length} child task(s) and making the parent task depend on them.`,
    { modal: true },
    'Apply Proposal'
  );

  if (confirmed !== 'Apply Proposal') {
    return false;
  }

  await applyTaskDecompositionProposalArtifact(inspection.paths.taskFilePath, remediationArtifact);

  logger.info('Applied Ralph task decomposition proposal.', {
    rootPath: workspaceFolder.uri.fsPath,
    remediationPath: latestArtifacts.latestRemediationPath,
    parentTaskId: proposal.parentTaskId,
    childTaskIds
  });

  await openTextFile(inspection.paths.taskFilePath);
  const remediationLabel = latestArtifacts.latestRemediationPath
    ? path.relative(workspaceFolder.uri.fsPath, latestArtifacts.latestRemediationPath)
    : '.ralph/artifacts/latest-remediation.json';
  void vscode.window.showInformationMessage(
    `Applied the latest Ralph decomposition proposal from ${remediationLabel}. Added ${childTaskIds.join(', ')} under ${proposal.parentTaskId}.`
  );
  return true;
}

async function resolveStaleTaskClaim(
  workspaceFolder: vscode.WorkspaceFolder,
  stateManager: RalphStateManager,
  logger: Logger
): Promise<boolean> {
  const config = readConfig(workspaceFolder);
  const inspection = await stateManager.inspectWorkspace(workspaceFolder.uri.fsPath, config);
  await logger.setWorkspaceLogFile(inspection.paths.logFilePath);
  const status = await collectStatusSnapshot(workspaceFolder, stateManager, logger);
  const staleClaims = status.claimGraph?.tasks.filter((entry) => entry.canonicalClaim?.stale) ?? [];

  if (staleClaims.length === 0) {
    void vscode.window.showInformationMessage(
      'No stale active task claim exists to resolve. Use Ralph Codex: Show Status to inspect the current claim graph.'
    );
    return false;
  }

  let targetClaim = staleClaims.find((entry) => entry.taskId === status.selectedTask?.id) ?? null;
  if (!targetClaim && staleClaims.length === 1) {
    targetClaim = staleClaims[0];
  }

  if (!targetClaim) {
    const requestedTaskId = (await vscode.window.showInputBox({
      prompt: `Multiple stale claims exist (${staleClaims.map((entry) => entry.taskId).join(', ')}). Enter the task id to resolve.`
    }))?.trim();

    if (!requestedTaskId) {
      return false;
    }

    targetClaim = staleClaims.find((entry) => entry.taskId === requestedTaskId) ?? null;
    if (!targetClaim) {
      void vscode.window.showWarningMessage(
        `Task ${requestedTaskId} does not currently have a stale canonical claim. Use Ralph Codex: Show Status to inspect the current claim graph.`
      );
      return false;
    }
  }

  const canonicalClaim = targetClaim.canonicalClaim?.claim;
  if (!canonicalClaim) {
    void vscode.window.showWarningMessage(
      `Task ${targetClaim.taskId} no longer has a canonical active claim to resolve. Refresh Ralph status and try again.`
    );
    return false;
  }

  const activity = await inspectCodexExecActivity(workspaceFolder.uri.fsPath);
  if (activity.check !== 'clear') {
    void vscode.window.showWarningMessage(
      activity.check === 'active'
        ? `Cannot resolve stale claim for ${targetClaim.taskId} because a codex exec process is still running. Confirm the CLI iteration is gone before retrying.`
        : `Cannot resolve stale claim for ${targetClaim.taskId} because Ralph could not confirm whether codex exec is still running. ${activity.summary}`
    );
    return false;
  }

  const confirmed = await vscode.window.showWarningMessage(
    `Mark stale claim for ${targetClaim.taskId} held by ${canonicalClaim.agentId}/${canonicalClaim.provenanceId} as stale? This updates .ralph/claims.json and records the recovery reason durably.`,
    { modal: true },
    'Mark Claim Stale'
  );

  if (confirmed !== 'Mark Claim Stale') {
    return false;
  }

  const resolutionReason = `eligible for operator recovery because the canonical claim was stale from ${canonicalClaim.claimedAt} and no running codex exec process was detected`;
  const resolved = await resolveStaleClaim(inspection.paths.claimFilePath, {
    expectedClaim: canonicalClaim,
    resolutionReason,
    resolvedBy: 'operator',
    status: 'stale'
  });

  if (resolved.outcome !== 'resolved' || !resolved.resolvedClaim) {
    void vscode.window.showWarningMessage(
      `Task ${targetClaim.taskId} is no longer eligible for stale-claim resolution because its canonical claim changed. Refresh Ralph status and try again.`
    );
    return false;
  }

  logger.info('Resolved stale Ralph task claim.', {
    taskId: resolved.resolvedClaim.claim.taskId,
    agentId: resolved.resolvedClaim.claim.agentId,
    provenanceId: resolved.resolvedClaim.claim.provenanceId,
    status: resolved.resolvedClaim.claim.status,
    resolvedAt: resolved.resolvedClaim.claim.resolvedAt,
    resolutionReason: resolved.resolvedClaim.claim.resolutionReason
  });

  void vscode.window.showInformationMessage(
    `Marked stale claim for ${resolved.resolvedClaim.claim.taskId} held by ${resolved.resolvedClaim.claim.agentId}/${resolved.resolvedClaim.claim.provenanceId} as ${resolved.resolvedClaim.claim.status}.`
  );
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
          if (
            lastRun.result.stopReason === 'control_plane_reload_required'
            && config.autoReloadOnControlPlaneChange
          ) {
            logger.info('Ralph is reloading the extension host to apply control-plane changes.', {
              iteration: lastRun.result.iteration,
              stopReason: lastRun.result.stopReason
            });
            await delay(1500);
            await vscode.commands.executeCommand('workbench.action.reloadWindow');
            return;
          }

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
    commandId: 'ralphCodex.openLatestPromptEvidence',
    label: 'Ralph Codex: Open Latest Prompt Evidence',
    requiresTrustedWorkspace: false,
    handler: async (progress) => {
      progress.report({ message: 'Resolving latest Ralph prompt evidence' });
      const workspaceFolder = await withWorkspaceFolder();
      await openLatestPromptEvidence(workspaceFolder, stateManager, logger);
    }
  });

  registerCommand(context, logger, {
    commandId: 'ralphCodex.openLatestCliTranscript',
    label: 'Ralph Codex: Open Latest CLI Transcript',
    requiresTrustedWorkspace: false,
    handler: async (progress) => {
      progress.report({ message: 'Resolving latest Ralph CLI transcript' });
      const workspaceFolder = await withWorkspaceFolder();
      await openLatestCliTranscriptOrLastMessage(workspaceFolder, stateManager, logger);
    }
  });

  registerCommand(context, logger, {
    commandId: 'ralphCodex.applyLatestTaskDecompositionProposal',
    label: 'Ralph Codex: Apply Latest Task Decomposition Proposal',
    handler: async (progress) => {
      progress.report({ message: 'Applying the latest Ralph task decomposition proposal' });
      const workspaceFolder = await withWorkspaceFolder();
      await applyLatestTaskDecompositionProposal(workspaceFolder, stateManager, logger);
    }
  });

  registerCommand(context, logger, {
    commandId: 'ralphCodex.resolveStaleTaskClaim',
    label: 'Ralph Codex: Resolve Stale Task Claim',
    handler: async (progress) => {
      progress.report({ message: 'Resolving a stale Ralph task claim' });
      const workspaceFolder = await withWorkspaceFolder();
      await resolveStaleTaskClaim(workspaceFolder, stateManager, logger);
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
    commandId: 'ralphCodex.cleanupRalphRuntimeArtifacts',
    label: 'Ralph Codex: Cleanup Runtime Artifacts',
    handler: async (progress) => {
      const workspaceFolder = await withWorkspaceFolder();
      const confirmed = await vscode.window.showWarningMessage(
        'Cleanup Ralph runtime artifacts? This preserves .ralph/state.json, the PRD, progress log, task file, and latest Ralph evidence while pruning older generated prompts, runs, iteration artifacts, provenance bundles, and extension logs.',
        { modal: true },
        'Cleanup'
      );

      if (confirmed !== 'Cleanup') {
        return;
      }

      progress.report({ message: 'Pruning generated Ralph runtime artifacts' });
      const config = readConfig(workspaceFolder);
      const result = await stateManager.cleanupRuntimeArtifacts(workspaceFolder.uri.fsPath, config);
      await logger.setWorkspaceLogFile(result.snapshot.paths.logFilePath);
      logger.info('Pruned Ralph runtime artifacts.', {
        rootPath: workspaceFolder.uri.fsPath,
        deletedIterationDirectories: result.cleanup.generatedArtifacts.deletedIterationDirectories,
        deletedPromptFiles: result.cleanup.generatedArtifacts.deletedPromptFiles,
        deletedRunArtifactBaseNames: result.cleanup.generatedArtifacts.deletedRunArtifactBaseNames,
        deletedBundleIds: result.cleanup.provenanceBundles.deletedBundleIds,
        deletedLogFiles: result.cleanup.deletedLogFiles
      });

      const deletedArtifacts = [
        deletedCountSummary(
          result.cleanup.generatedArtifacts.deletedIterationDirectories.length,
          'iteration directory',
          'iteration directories'
        ),
        deletedCountSummary(
          result.cleanup.generatedArtifacts.deletedPromptFiles.length,
          'prompt file',
          'prompt files'
        ),
        deletedCountSummary(
          result.cleanup.generatedArtifacts.deletedRunArtifactBaseNames.length,
          'run artifact set',
          'run artifact sets'
        ),
        deletedCountSummary(
          result.cleanup.provenanceBundles.deletedBundleIds.length,
          'bundle',
          'bundles'
        ),
        deletedCountSummary(
          result.cleanup.deletedLogFiles.length,
          'log file',
          'log files'
        )
      ].join(', ');
      void vscode.window.showInformationMessage(
        `Ralph runtime artifacts cleaned up. Preserved durable state and latest evidence while pruning ${deletedArtifacts}.`
      );
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
