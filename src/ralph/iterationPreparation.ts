import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { getCliCommandPath } from '../config/providers';
import { readConfig } from '../config/readConfig';
import { RalphCodexConfig } from '../config/types';
import { buildPrompt, createPromptFileName, decidePromptKind } from '../prompt/promptBuilder';
import { Logger } from '../services/logger';
import { runProcess } from '../services/processRunner';
import { scanWorkspace, scanWorkspaceCached } from '../services/workspaceScanner';
import { inspectCliSupport, inspectIdeCommandSupport } from '../services/codexCliSupport';
import { RalphStateManager } from './stateManager';
import { createProvenanceId, hashJson, hashText, utf8ByteLength } from './integrity';
import { deriveRootPolicy } from './rootPolicy';
import {
  RalphExecutionPlan,
  RalphPersistedPreflightReport,
  RalphPreflightReport,
  RalphPromptEvidence,
  RalphPromptKind,
  RalphPromptSessionHandoff,
  RalphPromptTarget,
  RalphProvenanceTrustLevel,
  RalphRootPolicy,
  RalphTask,
  RalphTaskCounts,
  RalphTaskFile,
  RalphWorkspaceState
} from './types';
import {
  acquireClaim,
  countTaskStatuses,
  inspectTaskClaimGraph,
  listSelectableTasks,
  markTaskInProgress,
  RalphTaskClaimDetails,
  selectNextTask
} from './taskFile';
import { readTaskPlan } from './planningPass';
import {
  buildBlockingPreflightMessage,
  buildPreflightReport,
  checkStaleState,
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
  selectedTaskClaim: RalphTaskClaimDetails | null;
  taskValidationHint: string | null;
  effectiveValidationCommand: string | null;
  normalizedValidationCommandFrom: string | null;
  validationCommand: string | null;
  preflightReport: RalphPreflightReport;
  persistedPreflightReport: RalphPersistedPreflightReport;
  preflightSummaryText: string;
  sessionHandoff: RalphPromptSessionHandoff | null;
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

export type PreparedPrompt = PreparedPromptContext;

export interface PrepareIterationContextInput {
  workspaceFolder: vscode.WorkspaceFolder;
  progress: vscode.Progress<{ message?: string; increment?: number }>;
  includeVerifierContext: boolean;
  configOverrides?: Partial<Pick<RalphCodexConfig, 'agentId' | 'agentRole'>>;
  /** When set, task selection prefers this task ID (e.g. directing a review agent to a just-completed parent). */
  focusTaskId?: string;
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

async function findLatestHandoffPath(
  handoffDir: string,
  agentId: string,
  iteration: number
): Promise<string | null> {
  // Fast path: check the immediately preceding iteration first
  const directPath = path.join(handoffDir, `${agentId}-${String(iteration - 1).padStart(3, '0')}.json`);
  try {
    await fs.access(directPath);
    return directPath;
  } catch {
    // fall through to directory scan
  }

  // Scan directory for the most recent handoff before this iteration
  try {
    const files = await fs.readdir(handoffDir);
    const prefix = `${agentId}-`;
    const suffix = '.json';
    let latestIteration = -1;
    for (const file of files) {
      if (!file.startsWith(prefix) || !file.endsWith(suffix)) {
        continue;
      }
      const numStr = file.slice(prefix.length, -suffix.length);
      const num = parseInt(numStr, 10);
      if (!isNaN(num) && num < iteration && num > latestIteration) {
        latestIteration = num;
      }
    }
    if (latestIteration < 0) {
      return null;
    }
    return path.join(handoffDir, `${agentId}-${String(latestIteration).padStart(3, '0')}.json`);
  } catch {
    return null;
  }
}

async function readSessionHandoff(
  handoffDir: string,
  agentId: string,
  iteration: number
): Promise<RalphPromptSessionHandoff | null> {
  if (iteration <= 1) {
    return null;
  }

  const handoffPath = await findLatestHandoffPath(handoffDir, agentId, iteration);
  if (!handoffPath) {
    return null;
  }

  try {
    const raw = JSON.parse(await fs.readFile(handoffPath, 'utf8')) as Record<string, unknown>;
    return {
      agentId: typeof raw.agentId === 'string' ? raw.agentId : agentId,
      iteration: typeof raw.iteration === 'number' ? raw.iteration : iteration - 1,
      selectedTaskId: typeof raw.selectedTaskId === 'string' ? raw.selectedTaskId : null,
      selectedTaskTitle: typeof raw.selectedTaskTitle === 'string' ? raw.selectedTaskTitle : null,
      stopReason: typeof raw.stopReason === 'string'
        ? raw.stopReason as RalphPromptSessionHandoff['stopReason']
        : 'verification_passed_no_remaining_subtasks',
      completionClassification: typeof raw.completionClassification === 'string'
        ? raw.completionClassification as RalphPromptSessionHandoff['completionClassification']
        : 'no_progress',
      humanSummary: typeof raw.humanSummary === 'string' ? raw.humanSummary : 'none',
      pendingBlocker: typeof raw.pendingBlocker === 'string' ? raw.pendingBlocker : null,
      validationFailureSignature: typeof raw.validationFailureSignature === 'string'
        ? raw.validationFailureSignature
        : null,
      remainingTaskCount: typeof raw.backlog === 'object' && raw.backlog !== null
        && typeof (raw.backlog as Record<string, unknown>).remainingTaskCount === 'number'
        ? (raw.backlog as Record<string, unknown>).remainingTaskCount as number
        : null
    };
  } catch {
    return null;
  }
}

export async function prepareIterationContext(
  input: PrepareIterationContextInput
): Promise<PreparedIterationContext> {
  const { workspaceFolder, progress, includeVerifierContext, stateManager, logger } = input;
  const inspectStartedAt = new Date().toISOString();
  progress.report({ message: 'Inspecting Ralph workspace' });
  const config: RalphCodexConfig = {
    ...readConfig(workspaceFolder),
    ...(input.configOverrides ?? {})
  };
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
  const [progressText, taskInspection, taskCounts, summary, initialCoreState] = await Promise.all([
    stateManager.readProgressText(snapshot.paths),
    stateManager.inspectTaskFile(snapshot.paths),
    stateManager.taskCounts(snapshot.paths).catch((err) => {
      logger.warn('Failed to read task counts during iteration preparation.', { error: err });
      return null;
    }),
    scanWorkspaceCached(rootPath, workspaceFolder.name, {
      focusPath,
      inspectionRootOverride: config.inspectionRootOverride
    }),
    captureCoreState(snapshot.paths)
  ]);
  const tasksText = taskInspection.text ?? initialCoreState.tasksText;
  const taskFile = taskInspection.taskFile ?? initialCoreState.taskFile;
  const effectiveTaskCounts = taskCounts ?? countTaskStatuses(taskFile);
  const taskSelectedAt = new Date().toISOString();
  const iteration = await stateManager.allocateIteration(rootPath, snapshot.paths);
  const sessionHandoff = await readSessionHandoff(snapshot.paths.handoffDir, config.agentId, iteration);
  const promptTarget: RalphPromptTarget = includeVerifierContext ? 'cliExec' : 'ideHandoff';
  const provenanceId = createProvenanceId({
    iteration,
    promptTarget,
    createdAt: taskSelectedAt
  });
  const claimedSelection = promptTarget === 'cliExec'
    ? await selectClaimedTask(
      rootPath,
      config,
      taskFile,
      snapshot.paths.taskFilePath,
      snapshot.paths.claimFilePath,
      provenanceId,
      config.agentId,
      input.focusTaskId
    )
    : {
      task: selectNextTask(taskFile),
      claim: null
    };
  const selectedTask = claimedSelection.task;
  const selectedTaskClaim = claimedSelection.claim;
  // Re-capture after selectClaimedTask may have marked the selected task in_progress so that
  // the todo→in_progress bookkeeping change is not counted as durable agent progress.
  const beforeCoreState = promptTarget === 'cliExec'
    ? await captureCoreState(snapshot.paths)
    : initialCoreState;
  const rootPolicy = deriveRootPolicy(summary);
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
  const cliCommandPath = getCliCommandPath(config);
  const [availableCommands, codexCliSupport] = await Promise.all([
    vscode.commands.getCommands(true),
    inspectCliSupport(config.cliProvider, cliCommandPath)
  ]);
  const ideCommandSupport = inspectIdeCommandSupport({
    preferredHandoffMode: config.preferredHandoffMode,
    openSidebarCommandId: config.openSidebarCommandId,
    newChatCommandId: config.newChatCommandId,
    availableCommands
  });
  const [artifactReadinessDiagnostics, agentHealthDiagnostics] = await Promise.all([
    inspectPreflightArtifactReadiness({
      rootPath,
      artifactRootDir: snapshot.paths.artifactDir,
      promptDir: snapshot.paths.promptDir,
      runDir: snapshot.paths.runDir,
      stateFilePath: snapshot.paths.stateFilePath,
      generatedArtifactRetentionCount: config.generatedArtifactRetentionCount,
      provenanceBundleRetentionCount: config.provenanceBundleRetentionCount
    }),
    checkStaleState({
      stateFilePath: snapshot.paths.stateFilePath,
      taskFilePath: snapshot.paths.taskFilePath,
      claimFilePath: snapshot.paths.claimFilePath,
      artifactDir: snapshot.paths.artifactDir,
      staleClaimTtlMs: config.claimTtlHours * 60 * 60 * 1000,
      staleLockThresholdMs: config.staleLockThresholdMinutes * 60 * 1000
    })
  ]);
  const preflightReport = buildPreflightReport({
    rootPath,
    workspaceTrusted: vscode.workspace.isTrusted,
    config,
    taskInspection,
    taskCounts: effectiveTaskCounts,
    selectedTask,
    currentProvenanceId: provenanceId,
    claimGraph: await inspectTaskClaimGraph(snapshot.paths.claimFilePath),
    taskValidationHint,
    validationCommand: effectiveValidationCommand,
    normalizedValidationCommandFrom,
    validationCommandReadiness,
    fileStatus: snapshot.fileStatus,
    createdPaths: snapshot.createdPaths,
    codexCliSupport,
    ideCommandSupport,
    artifactReadinessDiagnostics,
    agentHealthDiagnostics,
    sessionHandoff
  });
  const preflightArtifactPaths = resolvePreflightArtifactPaths(snapshot.paths.artifactDir, iteration);
  const {
    persistedReport: persistedPreflightReport,
    humanSummary: preflightSummaryText
  } = await writePreflightArtifacts({
    paths: preflightArtifactPaths,
    artifactRootDir: snapshot.paths.artifactDir,
    agentId: config.agentId,
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
    validationCommand: effectiveValidationCommand,
    sessionHandoff
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
  await maybeSummariseHistory(snapshot.state, config, snapshot.paths.memorySummaryPath, rootPath);
  const artifactPaths = resolveIterationArtifactPaths(snapshot.paths.artifactDir, iteration);
  const provenanceBundlePaths = resolveProvenanceBundlePaths(snapshot.paths.artifactDir, provenanceId);

  // Read task-plan.json when available — the Task Plan section is injected into
  // the implementer prompt regardless of whether planningPass.enabled is true so
  // that plans produced by dedicated planner agents are always surfaced.
  const taskPlanArtifact = selectedTask
    ? await readTaskPlan(snapshot.paths.artifactDir, selectedTask.id)
    : null;

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
    sessionHandoff,
    taskPlanArtifact,
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
    agentId: config.agentId,
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
    selectedTaskClaim,
    taskValidationHint,
    effectiveValidationCommand,
    normalizedValidationCommandFrom,
    validationCommand: effectiveValidationCommand,
    preflightReport,
    persistedPreflightReport,
    preflightSummaryText,
    sessionHandoff,
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

async function selectClaimedTask(
  rootPath: string,
  config: RalphCodexConfig,
  taskFile: RalphTaskFile,
  taskFilePath: string,
  claimFilePath: string,
  provenanceId: string,
  agentId: string,
  focusTaskId?: string
): Promise<{ task: RalphTask | null; claim: RalphTaskClaimDetails | null }> {
  const selectable = listSelectableTasks(taskFile);
  // When a focusTaskId is provided, sort so that task comes first.
  const candidates = focusTaskId
    ? [...selectable].sort((a, b) => (a.id === focusTaskId ? -1 : b.id === focusTaskId ? 1 : 0))
    : selectable;

  // In dedicated planning mode, implementer agents only claim tasks that already
  // have a task-plan.json written by a dedicated planner agent.
  const requirePlan = config.planningPass?.enabled
    && config.planningPass.mode === 'dedicated'
    && (config.agentRole === 'implementer' || config.agentRole === 'build');

  const artifactsDir = path.join(rootPath, config.artifactRetentionPath || '.ralph/artifacts');

  for (const candidate of candidates) {
    if (requirePlan) {
      const plan = await readTaskPlan(artifactsDir, candidate.id);
      if (!plan) {
        continue; // Wait for a planner agent to produce the task-plan.json
      }
    }

    const claimBranches = config.scmStrategy === 'branch-per-task'
      ? await prepareTaskBranchWorkspace(rootPath, candidate)
      : null;
    const claimResult = await acquireClaim(
      claimFilePath,
      candidate.id,
      agentId,
      provenanceId,
      {
        ...(claimBranches ?? {}),
        ttlMs: config.claimTtlHours * 60 * 60 * 1000
      }
    );
    if (claimResult.outcome === 'acquired' || claimResult.outcome === 'already_held') {
      if (candidate.status === 'todo') {
        await markTaskInProgress(taskFilePath, candidate.id);
      }
      return {
        task: candidate,
        claim: claimResult.claim ?? claimResult.canonicalClaim
      };
    }
  }

  return {
    task: null,
    claim: null
  };
}

async function prepareTaskBranchWorkspace(
  rootPath: string,
  task: RalphTask
): Promise<{ baseBranch: string; integrationBranch?: string; featureBranch: string }> {
  const baseBranch = await currentGitBranch(rootPath);
  const featureBranch = `ralph/${task.id}`;

  if (task.parentId) {
    const integrationBranch = `ralph/integration/${task.parentId}`;
    await ensureGitBranch(rootPath, integrationBranch, baseBranch);
    await ensureGitBranch(rootPath, featureBranch, integrationBranch);
    await checkoutGitBranch(rootPath, featureBranch);
    return {
      baseBranch,
      integrationBranch,
      featureBranch
    };
  }

  await ensureGitBranch(rootPath, featureBranch, baseBranch);
  await checkoutGitBranch(rootPath, featureBranch);
  return {
    baseBranch,
    featureBranch
  };
}

async function currentGitBranch(rootPath: string): Promise<string> {
  const result = await runProcess('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: rootPath });
  if (result.code !== 0) {
    const failure = (result.stderr || result.stdout || `exit code ${result.code}`).trim();
    throw new Error(`git rev-parse --abbrev-ref HEAD failed: ${failure}`);
  }

  const branch = result.stdout.trim();
  if (!branch) {
    throw new Error('git rev-parse --abbrev-ref HEAD returned an empty branch name.');
  }

  return branch;
}

async function branchExists(rootPath: string, branchName: string): Promise<boolean> {
  const result = await runProcess('git', ['rev-parse', '--verify', branchName], { cwd: rootPath });
  return result.code === 0;
}

async function ensureGitBranch(rootPath: string, branchName: string, startPoint: string): Promise<void> {
  if (await branchExists(rootPath, branchName)) {
    return;
  }

  const result = await runProcess('git', ['checkout', '-b', branchName, startPoint], { cwd: rootPath });
  if (result.code !== 0) {
    const failure = (result.stderr || result.stdout || `exit code ${result.code}`).trim();
    throw new Error(`git checkout -b ${branchName} ${startPoint} failed: ${failure}`);
  }
}

async function checkoutGitBranch(rootPath: string, branchName: string): Promise<void> {
  const result = await runProcess('git', ['checkout', branchName], { cwd: rootPath });
  if (result.code !== 0) {
    const failure = (result.stderr || result.stdout || `exit code ${result.code}`).trim();
    throw new Error(`git checkout ${branchName} failed: ${failure}`);
  }
}

/**
 * When memoryStrategy is 'summary' and the history depth exceeds memorySummaryThreshold,
 * invoke the configured CLI to produce a one-paragraph summary of the older entries
 * (those outside the memoryWindowSize window) and persist the result to memory-summary.md.
 *
 * Re-summarisation only occurs when the count of old entries (history beyond the window)
 * has grown since the last summarisation run.
 */
export async function maybeSummariseHistory(
  state: RalphWorkspaceState,
  config: RalphCodexConfig,
  memorySummaryPath: string,
  rootPath: string
): Promise<void> {
  if (config.memoryStrategy !== 'summary') {
    return;
  }

  const windowSize = config.memoryWindowSize ?? 10;
  const threshold = config.memorySummaryThreshold ?? 20;
  const totalDepth = state.iterationHistory.length;

  if (totalDepth <= threshold) {
    return;
  }

  const oldEntries = state.iterationHistory.slice(0, -windowSize);
  const oldCount = oldEntries.length;

  // Read existing summary to check if re-summarisation is needed
  let lastSummarizedOldCount = 0;
  try {
    const existing = await fs.readFile(memorySummaryPath, 'utf8');
    const match = existing.match(/^<!-- ralph-memory: summarized-old-count=(\d+) -->/m);
    if (match) {
      lastSummarizedOldCount = parseInt(match[1], 10);
    }
  } catch {
    // No existing summary — will create one
  }

  if (oldCount <= lastSummarizedOldCount) {
    return;
  }

  const entriesText = oldEntries.map((entry) =>
    `Iteration ${entry.iteration}: ${entry.completionClassification} / ${entry.executionStatus} — ${entry.summary}`
  ).join('\n');

  const prompt = [
    'Summarise the following Ralph iteration history in one concise paragraph.',
    'Focus on what was accomplished and any important patterns or outcomes.',
    'Reply with only the paragraph text — no headers, JSON, or code blocks.',
    '',
    entriesText
  ].join('\n');

  const commandPath = getCliCommandPath(config);
  let summaryText: string;
  try {
    const result = await runProcess(commandPath, ['-p', '-'], {
      cwd: rootPath,
      stdinText: prompt
    });
    summaryText = result.stdout.trim() || `${oldCount} prior iterations completed.`;
  } catch {
    summaryText = `${oldCount} prior iterations completed.`;
  }

  const fileContent = `<!-- ralph-memory: summarized-old-count=${oldCount} -->\n${summaryText}\n`;
  await fs.mkdir(path.dirname(memorySummaryPath), { recursive: true });
  await fs.writeFile(memorySummaryPath, fileContent, 'utf8');
}
