import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { getCliCommandPath } from '../config/providers';
import { readConfig } from '../config/readConfig';
import { buildPreflightReport, checkHandoffHealth, checkStaleState, inspectPreflightArtifactReadiness, inspectProviderReadinessDiagnostics } from '../ralph/preflight';
import { deriveRootPolicy } from '../ralph/rootPolicy';
import {
  resolveLatestStatusArtifacts,
  type RalphPrdReconciliationStatus,
  RalphLatestRemediationStatus,
  RalphStatusSnapshot
} from '../ralph/statusReport';
import { deriveEffectiveTier } from '../ralph/complexityScorer';
import { RalphStateManager } from '../ralph/stateManager';
import { inspectTaskClaimGraph, parseTaskFile, selectNextTask } from '../ralph/taskFile';
import type {
  FailureCategoryId,
  RalphCliInvocation,
  RalphExecutionPlan,
  RalphHandoff,
  RalphPromptEvidence,
  RalphProvenanceBundle,
  RalphCompletionReport,
  RalphSuggestedChildTask,
  RalphTaskRemediationArtifact,
  ReplanDecisionArtifact
} from '../ralph/types';
import { resolveLatestHandoffPath } from '../ralph/handoffManager';
import { contextEnvelopePath, inspectGeneratedArtifactRetention, inspectProvenanceBundleRetention, planGraphPath, resolveDoctrineProposalReviewPaths, resolvePrdReconciliationPaths, writePrdReconciliationProposal } from '../ralph/artifactStore';
import {
  captureGitStatus,
  chooseValidationCommand,
  inspectValidationCommandReadiness,
  normalizeValidationCommand
} from '../ralph/verifier';
import { readLatestPipelineArtifact } from '../ralph/pipeline';
import { readOrchestrationGraph, readOrchestrationState, resolveOrchestrationPaths } from '../ralph/orchestrationSupervisor';
import type { FanInRecord, OrchestrationNodeSpan } from '../ralph/types';
import { readDeadLetterQueue, type DeadLetterEntry } from '../ralph/deadLetter';
import { getFailureAnalysisPath, parseFailureDiagnosticResponse, type FailureAnalysis } from '../ralph/failureDiagnostics';
import { getRecoveryStatePath } from '../ralph/recoveryOrchestrator';
import { inspectCodexCliSupport, inspectIdeCommandSupport } from '../services/codexCliSupport';
import { Logger } from '../services/logger';
import { pathExists } from '../util/fs';
import { validateRecord } from '../util/validate';
import { scanWorkspaceCached } from '../services/workspaceScanner';
import { CompletionReportArtifact } from '../ralph/completionReportParser';
import { DoctrineProposalArtifact, DoctrineProposalRisk, DoctrineProposalStatus } from '../ralph/doctrineProposals';
import { getEffectivePolicy } from '../ralph/rolePolicy';
import type { ContextEnvelope } from '../ralph/types';
import { collectDoctrineContext, inspectDoctrinePack } from '../ralph/doctrine';
import { analyzePrdBacklogReconciliation, type PrdReconciliationProposal } from '../ralph/prdReconciliation';

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
    rejectionReason: typeof record.rejectionReason === 'string'
      ? record.rejectionReason as CompletionReportArtifact['rejectionReason']
      : null,
    selectedTaskId: record.selectedTaskId,
    report: normalizedReport,
    rawBlock: typeof record.rawBlock === 'string' ? record.rawBlock : null,
    parseError: typeof record.parseError === 'string' ? record.parseError : null,
    warnings: record.warnings.filter((warning): warning is string => typeof warning === 'string')
  };
}

const VALID_PROPOSAL_STATUSES = new Set<string>(['proposed', 'applied', 'rejected', 'partiallyApplied']);
const VALID_OPERATIONS = new Set<string>(['append', 'replaceSection', 'addSectionItem']);
const VALID_RISKS = new Set<string>(['low', 'medium', 'high']);

function normalizeDoctrineProposedUpdate(candidate: unknown): DoctrineProposalArtifact['updates'][number] | null {
  if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
    return null;
  }
  const u = candidate as Record<string, unknown>;
  if (typeof u.targetFile !== 'string'
    || !u.targetFile.trim()
    || typeof u.operation !== 'string'
    || !VALID_OPERATIONS.has(u.operation)
    || typeof u.proposedText !== 'string'
    || !u.proposedText.trim()
    || typeof u.rationale !== 'string'
    || !u.rationale.trim()
    || !Array.isArray(u.evidence)
    || u.evidence.length === 0
    || !(u.evidence as unknown[]).every((e) => typeof e === 'string' && (e as string).trim() !== '')
    || typeof u.requiresApproval !== 'boolean'
    || typeof u.protectedTarget !== 'boolean'
    || typeof u.risk !== 'string'
    || !VALID_RISKS.has(u.risk)) {
    return null;
  }
  const operation = u.operation as DoctrineProposalArtifact['updates'][number]['operation'];
  const needsSection = operation === 'addSectionItem' || operation === 'replaceSection';
  const section = needsSection
    ? (typeof u.section === 'string' && u.section.trim() ? u.section : null)
    : (typeof u.section === 'string' ? u.section : null);
  if (needsSection && section === null) {
    return null;
  }
  return {
    targetFile: u.targetFile,
    operation,
    section,
    proposedText: u.proposedText,
    rationale: u.rationale,
    evidence: u.evidence as string[],
    requiresApproval: u.requiresApproval,
    protectedTarget: u.protectedTarget,
    risk: u.risk as DoctrineProposalArtifact['updates'][number]['risk']
  };
}


async function countPendingDoctrineProposalsByRisk(artifactRootDir: string): Promise<Record<DoctrineProposalRisk, number>> {
  const counts: Record<DoctrineProposalRisk, number> = { low: 0, medium: 0, high: 0 };
  const directory = path.join(artifactRootDir, 'doctrine-proposals');

  let entries: import('fs').Dirent[];
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return counts;
  }

  await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json') && !entry.name.endsWith('.review.json'))
    .map(async (entry) => {
      const artifact = normalizeDoctrineProposalArtifact(
        await readJsonArtifact(path.join(directory, entry.name))
      );
      if (artifact?.status === 'proposed') {
        counts[artifact.risk] += 1;
      }
    }));

  return counts;
}

async function readPendingDoctrineProposals(
  artifactRootDir: string
): Promise<Array<{ path: string; proposal: DoctrineProposalArtifact }>> {
  const directory = path.join(artifactRootDir, 'doctrine-proposals');

  let entries: import('fs').Dirent[];
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }

  const proposals: Array<{ path: string; proposal: DoctrineProposalArtifact }> = [];
  for (const entry of entries
    .filter((candidate) => candidate.isFile() && candidate.name.endsWith('.json') && !candidate.name.endsWith('.review.json'))
    .sort((left, right) => left.name.localeCompare(right.name))) {
    const proposalPath = path.join(directory, entry.name);
    const proposal = normalizeDoctrineProposalArtifact(await readJsonArtifact(proposalPath));
    if (proposal?.status === 'proposed') {
      proposals.push({ path: proposalPath, proposal });
    }
  }

  proposals.sort((left, right) => {
    const byId = left.proposal.proposalId.localeCompare(right.proposal.proposalId);
    return byId !== 0 ? byId : left.path.localeCompare(right.path);
  });
  return proposals;
}

export function normalizeDoctrineProposalArtifact(candidate: unknown): DoctrineProposalArtifact | null {
  if (typeof candidate !== 'object' || candidate === null) {
    return null;
  }

  const record = candidate as Record<string, unknown>;
  if (record.kind !== 'doctrineUpdateProposal'
    || typeof record.proposalId !== 'string'
    || !record.proposalId.trim()
    || !Array.isArray(record.updates)
    || record.updates.length === 0
    || !Array.isArray(record.warnings)
    || !(record.warnings as unknown[]).every((w) => typeof w === 'string')
    || typeof record.status !== 'string'
    || !VALID_PROPOSAL_STATUSES.has(record.status)
    || typeof record.risk !== 'string'
    || !VALID_RISKS.has(record.risk)) {
    return null;
  }

  const normalizedUpdates: DoctrineProposalArtifact['updates'] = [];
  for (const update of record.updates) {
    const normalized = normalizeDoctrineProposedUpdate(update);
    if (!normalized) {
      return null;
    }
    normalizedUpdates.push(normalized);
  }

  return {
    schemaVersion: 1,
    kind: 'doctrineUpdateProposal',
    proposalId: record.proposalId,
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : '',
    provenanceId: typeof record.provenanceId === 'string' ? record.provenanceId : null,
    iteration: typeof record.iteration === 'number' ? record.iteration : null,
    selectedTaskId: typeof record.selectedTaskId === 'string' ? record.selectedTaskId : null,
    selectedTaskTitle: typeof record.selectedTaskTitle === 'string' ? record.selectedTaskTitle : null,
    source: record.source === 'completionReport'
      || record.source === 'manual'
      || record.source === 'diagnostic'
      ? record.source
      : 'unknown',
    status: record.status as DoctrineProposalStatus,
    risk: record.risk as DoctrineProposalArtifact['risk'],
    summary: typeof record.summary === 'string' ? record.summary : '',
    updates: normalizedUpdates,
    warnings: record.warnings as string[],
    ...(typeof record.reviewedAt === 'string' ? { reviewedAt: record.reviewedAt } : {}),
    ...(record.reviewedBy === 'operator' ? { reviewedBy: 'operator' as const } : {}),
    ...(record.reviewAction === 'applied' || record.reviewAction === 'rejected' || record.reviewAction === 'partiallyApplied'
      ? { reviewAction: record.reviewAction as DoctrineProposalArtifact['reviewAction'] }
      : {}),
    ...(Array.isArray(record.appliedUpdateIndexes)
      ? { appliedUpdateIndexes: (record.appliedUpdateIndexes as unknown[]).filter((i): i is number => typeof i === 'number') }
      : {}),
    ...(Array.isArray(record.rejectedUpdateIndexes)
      ? { rejectedUpdateIndexes: (record.rejectedUpdateIndexes as unknown[]).filter((i): i is number => typeof i === 'number') }
      : {}),
    ...(typeof record.reviewNotes === 'string' || record.reviewNotes === null
      ? { reviewNotes: record.reviewNotes as string | null }
      : {}),
    ...(Array.isArray(record.applicationWarnings)
      ? { applicationWarnings: (record.applicationWarnings as unknown[]).filter((w): w is string => typeof w === 'string') }
      : {})
  };
}

export function normalizePrdReconciliationProposal(candidate: unknown): PrdReconciliationProposal | null {
  if (typeof candidate !== 'object' || candidate === null) {
    return null;
  }
  const record = candidate as Record<string, unknown>;
  if (record.kind !== 'prdReconciliation'
    || record.schemaVersion !== 1
    || typeof record.generatedAt !== 'string'
    || typeof record.findingCount !== 'number'
    || !Number.isFinite(record.findingCount)
    || record.findingCount < 0
    || !Array.isArray(record.findings)) {
    return null;
  }

  const findings: PrdReconciliationProposal['findings'] = [];
  for (const candidateFinding of record.findings) {
    if (typeof candidateFinding !== 'object' || candidateFinding === null) {
      return null;
    }
    const finding = candidateFinding as Record<string, unknown>;
    if ((finding.type !== 'stale_prd_task_reference'
        && finding.type !== 'orphan_active_task'
        && finding.type !== 'duplicate_active_task')
      || (finding.severity !== 'info' && finding.severity !== 'warning')
      || typeof finding.message !== 'string'
      || (finding.taskIds !== undefined
        && (!Array.isArray(finding.taskIds) || finding.taskIds.some((taskId) => typeof taskId !== 'string')))) {
      return null;
    }
    findings.push({
      type: finding.type,
      severity: finding.severity,
      message: finding.message,
      ...(Array.isArray(finding.taskIds) ? { taskIds: finding.taskIds as string[] } : {})
    });
  }

  return {
    schemaVersion: 1,
    kind: 'prdReconciliation',
    generatedAt: record.generatedAt,
    findingCount: record.findingCount,
    findings
  };
}

async function collectPrdReconciliationStatus(input: {
  prdPath: string;
  taskFilePath: string;
  artifactDir: string;
  taskFileText: string | null;
  logger: Logger;
}): Promise<RalphPrdReconciliationStatus> {
  const paths = resolvePrdReconciliationPaths(input.artifactDir);
  const [prdExists, taskFileExists] = await Promise.all([
    pathExists(input.prdPath),
    pathExists(input.taskFilePath)
  ]);

  if (!prdExists) {
    return {
      status: 'missing',
      proposal: null,
      jsonPath: paths.jsonPath,
      markdownPath: paths.markdownPath,
      message: 'PRD file is missing; create .ralph/prd.md or regenerate the PRD.'
    };
  }
  if (!taskFileExists || !input.taskFileText) {
    return {
      status: 'missing',
      proposal: null,
      jsonPath: paths.jsonPath,
      markdownPath: paths.markdownPath,
      message: 'Task file is missing or unreadable; restore .ralph/tasks.json before reconciling PRD scope.'
    };
  }

  let proposal: PrdReconciliationProposal;
  try {
    proposal = analyzePrdBacklogReconciliation({
      prdText: await fs.readFile(input.prdPath, 'utf8'),
      taskFile: parseTaskFile(input.taskFileText),
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    const existing = normalizePrdReconciliationProposal(await readJsonArtifact(paths.jsonPath));
    return {
      status: existing ? 'stale' : 'unreadable',
      proposal: null,
      jsonPath: paths.jsonPath,
      markdownPath: paths.markdownPath,
      message: existing
        ? 'Latest reconciliation proposal is stale; refresh the dashboard or run Show Status.'
        : `Unable to analyze PRD/backlog reconciliation: ${error instanceof Error ? error.message : String(error)}`
    };
  }

  try {
    await writePrdReconciliationProposal(input.artifactDir, proposal);
  } catch (error) {
    input.logger.warn('Failed to persist PRD/backlog reconciliation proposal for dashboard.', {
      error: error instanceof Error ? error.message : String(error)
    });
    const [jsonExists, markdownExists] = await Promise.all([
      pathExists(paths.jsonPath),
      pathExists(paths.markdownPath)
    ]);
    if (jsonExists || markdownExists) {
      return {
        status: 'stale',
        proposal: null,
        jsonPath: jsonExists ? paths.jsonPath : null,
        markdownPath: markdownExists ? paths.markdownPath : null,
        message: 'Latest reconciliation proposal is stale; refresh the dashboard or run Show Status.'
      };
    }
    return {
      status: 'unreadable',
      proposal: null,
      jsonPath: null,
      markdownPath: null,
      message: `Unable to write PRD/backlog reconciliation proposal: ${error instanceof Error ? error.message : String(error)}`
    };
  }

  return {
    status: 'available',
    proposal,
    jsonPath: paths.jsonPath,
    markdownPath: paths.markdownPath,
    message: null
  };
}

export async function collectStatusSnapshot(
  workspaceFolder: vscode.WorkspaceFolder,
  stateManager: RalphStateManager,
  logger: Logger
): Promise<RalphStatusSnapshot> {
  const config = readConfig(workspaceFolder);
  const rawConfig = vscode.workspace.getConfiguration('ralphCodex', workspaceFolder.uri);

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
  const [
    artifactReadinessDiagnostics,
    staleStateDiagnostics,
    handoffHealthDiagnostics,
    doctrineInspection,
    doctrineContext,
    pendingDoctrineProposalCountsByRisk,
    pendingDoctrineProposals,
    prdReconciliation
  ] = await Promise.all([
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
    checkHandoffHealth({ ralphRoot: inspection.paths.ralphDir }),
    inspectDoctrinePack(workspaceFolder.uri.fsPath),
    collectDoctrineContext(workspaceFolder.uri.fsPath),
    countPendingDoctrineProposalsByRisk(inspection.paths.artifactDir),
    readPendingDoctrineProposals(inspection.paths.artifactDir),
    collectPrdReconciliationStatus({
      prdPath: inspection.paths.prdPath,
      taskFilePath: inspection.paths.taskFilePath,
      artifactDir: inspection.paths.artifactDir,
      taskFileText: taskInspection.text,
      logger
    })
  ]);
  const agentHealthDiagnostics = [...staleStateDiagnostics, ...handoffHealthDiagnostics];
  const claimGraph = await inspectTaskClaimGraph(inspection.paths.claimFilePath);
  const [latestPromptEvidence, latestExecutionPlan, latestCliInvocation, latestRemediation, latestDoctrineProposal, latestProvenanceBundle] = await Promise.all([
    readJsonArtifact(latestArtifacts.latestPromptEvidencePath).then(normalizePromptEvidence),
    readJsonArtifact(latestArtifacts.latestExecutionPlanPath).then(normalizeExecutionPlan),
    readJsonArtifact(latestArtifacts.latestCliInvocationPath).then(normalizeCliInvocation),
    readJsonArtifact(latestArtifacts.latestRemediationPath).then(normalizeLatestRemediation),
    readJsonArtifact(latestArtifacts.latestDoctrineProposalPath).then(normalizeDoctrineProposalArtifact),
    readJsonArtifact(latestArtifacts.latestProvenanceBundlePath).then(normalizeProvenanceBundle)
  ]);
  const currentProvenanceId = latestExecutionPlan?.provenanceId
    ?? latestProvenanceBundle?.provenanceId
    ?? inspection.state.lastIteration?.provenanceId
    ?? null;

  let latestDoctrineReviewJsonPath: string | null = null;
  let latestDoctrineReviewMdPath: string | null = null;
  if (latestDoctrineProposal?.proposalId) {
    try {
      const reviewPaths = resolveDoctrineProposalReviewPaths(inspection.paths.artifactDir, latestDoctrineProposal.proposalId);
      const [reviewJsonExists, reviewMdExists] = await Promise.all([
        pathExists(reviewPaths.reviewJsonPath),
        pathExists(reviewPaths.reviewMdPath)
      ]);
      if (reviewJsonExists) {
        latestDoctrineReviewJsonPath = reviewPaths.reviewJsonPath;
      }
      if (reviewMdExists) {
        latestDoctrineReviewMdPath = reviewPaths.reviewMdPath;
      }
    } catch {
      // unsafe proposalId — skip review path resolution
    }
  }

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

  const providerReadinessDiagnostics = await inspectProviderReadinessDiagnostics({
    config,
    codexCliSupport,
    ideCommandSupport
  });

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
    providerReadinessDiagnostics,
    artifactReadinessDiagnostics,
    doctrineDiagnostics: doctrineInspection.diagnostics,
    agentHealthDiagnostics,
    rolePolicySource
  });
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

  // Read replan decision artifacts for the latest pipeline run's root task.
  const replanArtifacts: ReplanDecisionArtifact[] = [];
  const rootTaskId = latestPipelineEntry?.artifact.rootTaskId;
  if (rootTaskId) {
    const rootTaskArtifactDir = path.join(inspection.paths.artifactDir, rootTaskId);
    const replanFilePattern = /^replan-(\d+)\.json$/;
    try {
      const dirEntries = await fs.readdir(rootTaskArtifactDir, { withFileTypes: true });
      const replanFiles = dirEntries
        .filter((e) => e.isFile() && replanFilePattern.test(e.name))
        .sort((a, b) => {
          const aIndex = Number.parseInt(replanFilePattern.exec(a.name)![1], 10);
          const bIndex = Number.parseInt(replanFilePattern.exec(b.name)![1], 10);
          return aIndex - bIndex;
        });
      for (const entry of replanFiles) {
        try {
          const raw = await fs.readFile(path.join(rootTaskArtifactDir, entry.name), 'utf8');
          const parsed = JSON.parse(raw) as ReplanDecisionArtifact;
          if (parsed.kind === 'replanDecision') {
            replanArtifacts.push(parsed);
          }
        } catch {
          // malformed or unreadable — skip
        }
      }
    } catch {
      // directory absent or unreadable — leave empty
    }
  }

  // Extract fanInRecord from the plan graph for the latest pipeline root task.
  let fanInRecord: FanInRecord | null = null;
  if (rootTaskId) {
    const graphPath = planGraphPath(inspection.paths.artifactDir, rootTaskId);
    try {
      const raw = await fs.readFile(graphPath, 'utf8');
      const parsed = JSON.parse(raw) as { fanInRecord?: FanInRecord };
      fanInRecord = parsed.fanInRecord ?? null;
    } catch {
      // plan graph absent or unreadable — leave null
    }
  }

  // Collect per-node execution spans from the latest orchestration run.
  const nodeSpans: OrchestrationNodeSpan[] = [];
  if (latestPipelineEntry?.artifact?.runId) {
    const runId = latestPipelineEntry.artifact.runId;
    const orchDir = path.join(inspection.paths.ralphDir, 'orchestration', runId);
    const spanPattern = /^node-.+-span\.json$/;
    try {
      const entries = await fs.readdir(orchDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile() || !spanPattern.test(entry.name)) {
          continue;
        }
        try {
          const raw = await fs.readFile(path.join(orchDir, entry.name), 'utf8');
          const parsed = JSON.parse(raw) as OrchestrationNodeSpan;
          if (parsed && parsed.nodeId) {
            nodeSpans.push(parsed);
          }
        } catch {
          // malformed span — skip
        }
      }
    } catch {
      // orchestration dir absent — leave empty
    }
  }

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
    latestDoctrineProposalPath: latestArtifacts.latestDoctrineProposalPath,
    latestDoctrineProposalMdPath: latestArtifacts.latestDoctrineProposalMdPath,
    latestDoctrineReviewJsonPath,
    latestDoctrineReviewMdPath,
    latestProvenanceBundlePath: latestArtifacts.latestProvenanceBundlePath,
    latestProvenanceSummaryPath: latestArtifacts.latestProvenanceSummaryPath,
    latestProvenanceFailurePath: latestArtifacts.latestProvenanceFailurePath,
    latestOfflineEvaluationReportPath: latestArtifacts.latestOfflineEvaluationReportPath,
    latestOfflineEvaluationSummary: latestArtifacts.latestOfflineEvaluationSummary,
    artifactDir: inspection.paths.artifactDir,
    stateFilePath: inspection.paths.stateFilePath,
    progressPath: inspection.paths.progressPath,
    taskFilePath: inspection.paths.taskFilePath,
    promptPath: inspection.state.lastIteration?.promptPath ?? inspection.state.lastPromptPath,
    latestPromptEvidence,
    latestExecutionPlan,
    latestCliInvocation,
    latestRemediation,
    latestDoctrineProposal,
    prdReconciliation,
    doctrineInspection,
    doctrineContext,
    pendingDoctrineProposalCountsByRisk,
    pendingDoctrineProposals,
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
    effectiveTierInfo,
    lastTaskTierInfo,
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
    rolePolicySource,
    replanArtifacts: replanArtifacts.length > 0 ? replanArtifacts : undefined,
    fanInRecord: fanInRecord ?? undefined,
    nodeSpans: nodeSpans.length > 0 ? nodeSpans : undefined
  };
}
