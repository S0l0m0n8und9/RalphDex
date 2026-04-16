import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { getCliCommandPath } from '../config/providers';
import { readConfig, resolveOperatorModeProvenance } from '../config/readConfig';
import { buildPreflightReport, checkHandoffHealth, checkStaleState, inspectPreflightArtifactReadiness } from '../ralph/preflight';
import { deriveRootPolicy } from '../ralph/rootPolicy';
import {
  resolveLatestStatusArtifacts,
  RalphLatestRemediationStatus,
  RalphStatusSnapshot
} from '../ralph/statusReport';
import { deriveEffectiveTier } from '../ralph/complexityScorer';
import { RalphStateManager } from '../ralph/stateManager';
import { inspectTaskClaimGraph, selectNextTask } from '../ralph/taskFile';
import type {
  FailureCategoryId,
  RalphCliInvocation,
  RalphExecutionPlan,
  RalphHandoff,
  RalphPromptEvidence,
  RalphProvenanceBundle,
  RalphCompletionReport,
  RalphSuggestedChildTask,
  RalphTaskRemediationArtifact
} from '../ralph/types';
import { resolveLatestHandoffPath } from '../ralph/handoffManager';
import { inspectGeneratedArtifactRetention, inspectProvenanceBundleRetention } from '../ralph/artifactStore';
import {
  captureGitStatus,
  chooseValidationCommand,
  inspectValidationCommandReadiness,
  normalizeValidationCommand
} from '../ralph/verifier';
import { readLatestPipelineArtifact } from '../ralph/pipeline';
import { readOrchestrationGraph, readOrchestrationState, resolveOrchestrationPaths } from '../ralph/orchestrationSupervisor';
import type { RecommendedSkill } from '../ralph/projectGenerator';
import { readDeadLetterQueue, type DeadLetterEntry } from '../ralph/deadLetter';
import { getFailureAnalysisPath, parseFailureDiagnosticResponse, type FailureAnalysis } from '../ralph/failureDiagnostics';
import { getRecoveryStatePath } from '../ralph/recoveryOrchestrator';
import { inspectCodexCliSupport, inspectIdeCommandSupport } from '../services/codexCliSupport';
import { Logger } from '../services/logger';
import { pathExists } from '../util/fs';
import { validateRecord } from '../util/validate';
import { scanWorkspaceCached } from '../services/workspaceScanner';
import { CompletionReportArtifact } from '../ralph/completionReportParser';
import { getEffectivePolicy } from '../ralph/rolePolicy';
import { contextEnvelopePath } from '../ralph/artifactStore';
import type { ContextEnvelope } from '../ralph/types';

export async function readJsonArtifact(target: string | null): Promise<unknown | null> {
  if (!target) {
    return null;
  }

  try {
    return JSON.parse(await fs.readFile(target, 'utf8'));
  } catch {
    return null;
  }
}

export async function firstExistingPath(candidates: Array<string | null | undefined>): Promise<string | null> {
  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate ?? null;
    }
  }

  return null;
}

export function normalizeExecutionPlan(candidate: unknown): RalphExecutionPlan | null {
  return validateRecord<RalphExecutionPlan>(candidate, {
    kind: ['literal', 'executionPlan'],
    iteration: 'number',
    promptKind: 'string',
    promptTarget: 'string',
    templatePath: 'string',
    promptArtifactPath: 'string',
    promptHash: 'string'
  });
}

export function normalizePromptEvidence(candidate: unknown): RalphPromptEvidence | null {
  return validateRecord<RalphPromptEvidence>(candidate, {
    iteration: 'number',
    kind: 'string',
    target: 'string',
    templatePath: 'string',
    selectionReason: 'string'
  });
}

export function normalizeCliInvocation(candidate: unknown): RalphCliInvocation | null {
  return validateRecord<RalphCliInvocation>(candidate, {
    kind: ['literal', 'cliInvocation'],
    iteration: 'number',
    commandPath: 'string',
    args: 'array',
    promptArtifactPath: 'string',
    stdinHash: 'string'
  });
}

export function normalizeProvenanceBundle(candidate: unknown): RalphProvenanceBundle | null {
  return validateRecord<RalphProvenanceBundle>(candidate, {
    kind: ['literal', 'provenanceBundle'],
    provenanceId: 'string',
    iteration: 'number',
    promptKind: 'string',
    promptTarget: 'string',
    trustLevel: 'string',
    bundleDir: 'string',
    status: 'string',
    summary: 'string'
  });
}

export function normalizeLatestRemediation(candidate: unknown): RalphLatestRemediationStatus | null {
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

export function normalizeTaskRemediationArtifact(candidate: unknown): RalphTaskRemediationArtifact | null {
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

export function normalizeCompletionReportArtifact(candidate: unknown): CompletionReportArtifact | null {
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

async function readRecommendedSkills(filePath: string): Promise<RecommendedSkill[]> {
  try {
    const raw = JSON.parse(await fs.readFile(filePath, 'utf8'));
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw.filter(
      (entry): entry is RecommendedSkill =>
        typeof entry === 'object'
        && entry !== null
        && typeof entry.name === 'string'
        && typeof entry.rationale === 'string'
    );
  } catch {
    return [];
  }
}

export async function collectStatusSnapshot(
  workspaceFolder: vscode.WorkspaceFolder,
  stateManager: RalphStateManager,
  logger: Logger
): Promise<RalphStatusSnapshot> {
  const config = readConfig(workspaceFolder);
  const rawConfig = vscode.workspace.getConfiguration('ralphCodex', workspaceFolder.uri);
  const operatorModeProvenance = resolveOperatorModeProvenance(rawConfig, config, config.operatorMode);

  const planningPassInspect = rawConfig.inspect<unknown>('planningPass');
  const planningPassExplicit = planningPassInspect?.workspaceValue !== undefined
    || planningPassInspect?.globalValue !== undefined;
  const planningPassEnabledSource: 'explicit' | 'manifest-default' = planningPassExplicit ? 'explicit' : 'manifest-default';

  const budgetProfileInspect = rawConfig.inspect<unknown>('promptBudgetProfile');
  const budgetProfileExplicit = budgetProfileInspect?.workspaceValue !== undefined
    || budgetProfileInspect?.globalValue !== undefined;
  const promptBudgetProfileSource: 'explicit' | 'manifest-default' = budgetProfileExplicit ? 'explicit' : 'manifest-default';
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
    ? await stateManager.taskCounts(inspection.paths).catch((err) => {
        logger.warn('Failed to read task counts for status snapshot.', { error: err });
        return null;
      })
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
    scanWorkspaceCached(workspaceFolder.uri.fsPath, workspaceFolder.name, {
      focusPath,
      inspectionRootOverride: config.inspectionRootOverride
    }),
    resolveLatestStatusArtifacts(inspection.paths),
    inspectCodexCliSupport(getCliCommandPath(config))
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
  const [artifactReadinessDiagnostics, staleStateDiagnostics, handoffHealthDiagnostics] = await Promise.all([
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
      artifactDir: inspection.paths.artifactDir,
      staleClaimTtlMs: config.watchdogStaleTtlMs
    }),
    checkHandoffHealth({ ralphRoot: inspection.paths.ralphDir })
  ]);
  const agentHealthDiagnostics = [...staleStateDiagnostics, ...handoffHealthDiagnostics];
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

  // Derive rolePolicySource from the most recent context-envelope artifact (iteration - 1).
  let rolePolicySource: 'preset' | 'crew' | 'explicit' = 'preset';
  const prevIteration = inspection.state.nextIteration - 1;
  if (prevIteration >= 1) {
    const envelopePath = contextEnvelopePath(
      inspection.paths.artifactDir,
      String(prevIteration).padStart(3, '0')
    );
    try {
      const raw = await fs.readFile(envelopePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<ContextEnvelope>;
      if (parsed.policySource === 'crew' || parsed.policySource === 'explicit') {
        rolePolicySource = parsed.policySource;
      }
    } catch {
      // file absent or unreadable — default 'preset' stands
    }
  }
  const effectiveRolePolicy = getEffectivePolicy(config.agentRole);

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
    agentHealthDiagnostics,
    rolePolicySource
  });
  const recommendedSkills = await readRecommendedSkills(
    path.join(workspaceFolder.uri.fsPath, '.ralph', 'recommended-skills.json')
  );
  const [generatedArtifactRetention, provenanceBundleRetention, latestPipelineEntry, deadLetterQueue] = await Promise.all([
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
    }),
    readLatestPipelineArtifact(inspection.paths.artifactDir),
    readDeadLetterQueue(inspection.paths.deadLetterPath)
  ]);

  let orchestration: RalphStatusSnapshot['orchestration'] = null;
  if (latestPipelineEntry?.artifact) {
    const runId = latestPipelineEntry.artifact.runId;
    const orchestrationPaths = resolveOrchestrationPaths(inspection.paths.ralphDir, runId);
    try {
      const [graph, state] = await Promise.all([
        readOrchestrationGraph(orchestrationPaths),
        readOrchestrationState(orchestrationPaths)
      ]);

      const activeNode = graph.nodes.find((n) => n.id === state.cursor);
      const completedNodes = state.nodeStates
        .filter((ns) => ns.outcome === 'completed')
        .map((ns) => {
          const node = graph.nodes.find((n) => n.id === ns.nodeId);
          return {
            nodeId: ns.nodeId,
            label: node?.label ?? ns.nodeId,
            outcome: ns.outcome,
            finishedAt: ns.finishedAt
          };
        });

      const pendingBranchNodes = state.cursor
        ? graph.edges
          .filter((e) => e.from === state.cursor)
          .map((e) => {
            const node = graph.nodes.find((n) => n.id === e.to);
            return {
              nodeId: e.to,
              label: node?.label ?? e.to
            };
          })
        : [];

      orchestration = {
        activeNodeId: state.cursor,
        activeNodeLabel: activeNode?.label ?? null,
        completedNodes,
        pendingBranchNodes
      };
    } catch {
      // no orchestration state for this run, or malformed — leave as null
    }
  }

  const deadLetterEntries: DeadLetterEntry[] = deadLetterQueue.entries;

  let latestHandoff: RalphHandoff | null = null;
  try {
    const raw = await fs.readFile(resolveLatestHandoffPath(inspection.paths.ralphDir), 'utf8');
    latestHandoff = JSON.parse(raw) as RalphHandoff;
  } catch {
    // no latest-handoff.json yet — leave as null
  }

  let lastFailureCategory: FailureCategoryId | null = null;
  let recoveryAttemptCount: number | null = null;
  let latestFailureAnalysis: FailureAnalysis | null = null;
  let latestFailureAnalysisPath: string | null = null;
  let recoveryStatePath: string | null = null;
  if (selectedTask) {
    const selectedFailureAnalysisPath = getFailureAnalysisPath(inspection.paths.artifactDir, selectedTask.id);
    const selectedRecoveryStatePath = getRecoveryStatePath(inspection.paths.artifactDir, selectedTask.id);
    const [failureAnalysisRaw, recoveryStateRaw] = await Promise.all([
      fs.readFile(selectedFailureAnalysisPath, 'utf8').catch(() => null),
      fs.readFile(selectedRecoveryStatePath, 'utf8').catch(() => null)
    ]);
    if (failureAnalysisRaw) {
      const parsed = parseFailureDiagnosticResponse(failureAnalysisRaw);
      latestFailureAnalysis = parsed;
      lastFailureCategory = parsed?.rootCauseCategory ?? null;
      latestFailureAnalysisPath = selectedFailureAnalysisPath;
    }
    if (recoveryStateRaw) {
      try {
        const parsed = JSON.parse(recoveryStateRaw) as { attemptCount?: unknown };
        recoveryAttemptCount = typeof parsed.attemptCount === 'number' ? parsed.attemptCount : null;
        recoveryStatePath = selectedRecoveryStatePath;
      } catch {
        // malformed JSON — leave null
      }
    }
  }

  const tierThresholds = {
    simpleThreshold: config.modelTiering.simpleThreshold,
    complexThreshold: config.modelTiering.complexThreshold
  };
  const taskFile = taskInspection.taskFile;
  const iterationHistory = inspection.state.iterationHistory;

  const effectiveTierInfo = selectedTask && taskFile
    ? deriveEffectiveTier({ task: selectedTask, taskFile, iterationHistory, ...tierThresholds })
    : null;

  const lastTaskId = inspection.state.lastIteration?.selectedTaskId ?? null;
  const lastTask = lastTaskId && taskFile
    ? taskFile.tasks.find((task) => task.id === lastTaskId) ?? null
    : null;
  const lastTaskTierInfo = lastTask && taskFile
    ? deriveEffectiveTier({ task: lastTask, taskFile, iterationHistory, ...tierThresholds })
    : null;

  return {
    workspaceName: workspaceFolder.name,
    rootPath: workspaceFolder.uri.fsPath,
    workspaceTrusted: vscode.workspace.isTrusted,
    nextIteration: inspection.state.nextIteration,
    lastIteration: inspection.state.lastIteration,
    runHistory: inspection.state.runHistory,
    iterationHistory,
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
    agentCount: config.agentCount,
    workspaceScan,
    gitStatus,
    preflightReport,
    claimGraph,
    currentProvenanceId,
    latestPipelineRunPath: latestPipelineEntry?.artifactPath ?? null,
    latestPipelineRun: latestPipelineEntry?.artifact ?? null,
    recommendedSkills,
    effectiveTierInfo,
    lastTaskTierInfo,
    operatorMode: config.operatorMode,
    operatorModeProvenance,
    planningPassEnabled: config.planningPass.enabled,
    planningPassEnabledSource,
    promptBudgetProfile: config.promptBudgetProfile,
    promptBudgetProfileSource,
    deadLetterEntries,
    lastFailureCategory,
    recoveryAttemptCount,
    latestFailureAnalysis,
    latestFailureAnalysisPath,
    recoveryStatePath,
    orchestration,
    latestHandoff,
    effectiveRolePolicy,
    rolePolicySource
  };
}
