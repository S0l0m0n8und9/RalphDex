import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { readConfig } from '../config/readConfig';
import {
  buildStatusReport,
  resolveLatestStatusArtifacts,
} from '../ralph/statusReport';
import { RalphStateManager } from '../ralph/stateManager';
import {
  resolveStaleClaim,
  inspectTaskClaimGraph
} from '../ralph/taskFile';
import {
  applyTaskDecompositionProposalArtifact,
  resolveApplicableTaskDecompositionProposal
} from '../ralph/taskDecomposition';
import { inspectCodexExecActivity } from '../services/cliActivity';
import { Logger } from '../services/logger';
import {
  type AgentHandoffSummary,
  type AgentStatusSummary,
  buildMultiAgentStatusReport,
  computeStuckScore,
} from '../ralph/multiAgentStatus';
import type { RalphTask, RalphTaskTier } from '../ralph/types';
import {
  collectStatusSnapshot,
  firstExistingPath,
  normalizeCliInvocation,
  normalizeProvenanceBundle,
  normalizeTaskRemediationArtifact,
  readJsonArtifact
} from './statusSnapshot';
import { readLatestPipelineArtifact } from '../ralph/pipeline';

// ---------------------------------------------------------------------------
// Shared types (kept local to avoid circular re-exports)
// ---------------------------------------------------------------------------

interface RegisteredCommandSpec {
  commandId: string;
  label: string;
  requiresTrustedWorkspace?: boolean;
  handler: (progress: vscode.Progress<{ message?: string; increment?: number }>) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Small utilities duplicated from registerCommands.ts to avoid coupling
// ---------------------------------------------------------------------------

async function withWorkspaceFolder(): Promise<vscode.WorkspaceFolder> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    throw new Error('Open a workspace folder before using Ralphdex.');
  }

  return folder;
}

async function openTextFile(target: string): Promise<void> {
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(target));
  await vscode.window.showTextDocument(document, { preview: false });
}

function deletedCountSummary(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

// ---------------------------------------------------------------------------
// Artifact opening helpers
// ---------------------------------------------------------------------------

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
    `${reason} Run Ralphdex: Run CLI Iteration or Ralphdex: Run CLI Loop, then try again.`
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
      : 'No Ralph CLI transcript exists yet because no CLI iteration has completed. Run Ralphdex: Run CLI Iteration or Ralphdex: Run CLI Loop, then try again.'
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

async function openLatestPipelineRun(
  workspaceFolder: vscode.WorkspaceFolder,
  stateManager: RalphStateManager,
  logger: Logger
): Promise<boolean> {
  const config = readConfig(workspaceFolder);
  const inspection = await stateManager.inspectWorkspace(workspaceFolder.uri.fsPath, config);
  await logger.setWorkspaceLogFile(inspection.paths.logFilePath);
  const latest = await readLatestPipelineArtifact(inspection.paths.artifactDir);

  if (latest) {
    await openTextFile(latest.artifactPath);
    return true;
  }

  void vscode.window.showInformationMessage(
    'No pipeline run artifact found. Run "Ralphdex: Run Pipeline" first, then try again.'
  );
  return false;
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
      'No stale active task claim exists to resolve. Use Ralphdex: Show Status to inspect the current claim graph.'
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
        `Task ${requestedTaskId} does not currently have a stale canonical claim. Use Ralphdex: Show Status to inspect the current claim graph.`
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

// ---------------------------------------------------------------------------
// Multi-agent status helpers
// ---------------------------------------------------------------------------

function normalizeHandoffNote(candidate: unknown): AgentHandoffSummary | null {
  if (typeof candidate !== 'object' || candidate === null) {
    return null;
  }

  const record = candidate as Record<string, unknown>;
  if (typeof record.iteration !== 'number') {
    return null;
  }

  return {
    iteration: record.iteration,
    selectedTaskId: typeof record.selectedTaskId === 'string' ? record.selectedTaskId : null,
    selectedTaskTitle: typeof record.selectedTaskTitle === 'string' ? record.selectedTaskTitle : null,
    stopReason: typeof record.stopReason === 'string' ? record.stopReason : null,
    completionClassification: typeof record.completionClassification === 'string' ? record.completionClassification : null,
    progressNote: typeof record.progressNote === 'string' ? record.progressNote : null
  };
}

async function readAllHandoffsForAgent(handoffDir: string, agentId: string): Promise<AgentHandoffSummary[]> {
  let entries: string[];

  try {
    const allEntries = await fs.readdir(handoffDir);
    entries = allEntries.filter((entry) => entry.startsWith(`${agentId}-`) && entry.endsWith('.json'));
  } catch {
    return [];
  }

  if (entries.length === 0) {
    return [];
  }

  const handoffs = await Promise.all(
    entries.map(async (entry) => {
      const content = await readJsonArtifact(path.join(handoffDir, entry));
      return normalizeHandoffNote(content);
    })
  );

  return handoffs
    .filter((h): h is AgentHandoffSummary => h !== null)
    .sort((a, b) => a.iteration - b.iteration);
}

function buildTaskTierLookup(rawTaskFile: unknown): Map<string, RalphTask> {
  const lookup = new Map<string, RalphTask>();
  if (typeof rawTaskFile !== 'object' || rawTaskFile === null) {
    return lookup;
  }
  const record = rawTaskFile as Record<string, unknown>;
  if (!Array.isArray(record.tasks)) {
    return lookup;
  }
  for (const task of record.tasks) {
    if (typeof task === 'object' && task !== null && typeof (task as Record<string, unknown>).id === 'string') {
      lookup.set((task as Record<string, unknown>).id as string, task as RalphTask);
    }
  }
  return lookup;
}

async function readMultiAgentStatusSummaries(ralphDir: string, claimFilePath: string): Promise<AgentStatusSummary[]> {
  const agentsDir = path.join(ralphDir, 'agents');
  const handoffDir = path.join(ralphDir, 'handoff');

  let agentFiles: string[];

  try {
    const allFiles = await fs.readdir(agentsDir);
    agentFiles = allFiles.filter((entry) => entry.endsWith('.json') && !entry.endsWith('.tmp'));
  } catch {
    return [];
  }

  const [claimGraph, rawTaskFile] = await Promise.all([
    inspectTaskClaimGraph(claimFilePath).catch(() => null),
    readJsonArtifact(path.join(ralphDir, 'tasks.json'))
  ]);
  const taskLookup = buildTaskTierLookup(rawTaskFile);

  const summaries = await Promise.all(
    agentFiles.map(async (fileName): Promise<AgentStatusSummary> => {
      const agentId = fileName.replace(/\.json$/, '');
      const record = await readJsonArtifact(path.join(agentsDir, fileName));
      const normalized = typeof record === 'object' && record !== null ? record as Record<string, unknown> : {};

      const firstSeenAt = typeof normalized.firstSeenAt === 'string' ? normalized.firstSeenAt : '';
      const completedTaskIds = Array.isArray(normalized.completedTaskIds) ? normalized.completedTaskIds : [];
      const completedTaskCount = completedTaskIds.length;

      const activeClaimEntry = claimGraph?.tasks.find(
        (entry) => entry.canonicalClaim?.claim.agentId === agentId && entry.canonicalClaim?.claim.status === 'active'
      );
      const activeClaimTaskId = activeClaimEntry?.taskId ?? null;

      const activeClaimTask = activeClaimTaskId ? taskLookup.get(activeClaimTaskId) ?? null : null;
      const activeClaimTaskTier: RalphTaskTier | null = activeClaimTask?.tier ?? null;
      const activeClaimTaskTierSource: 'explicit' | 'dynamic' | null = activeClaimTaskId === null
        ? null
        : activeClaimTask?.tier
          ? 'explicit'
          : 'dynamic';

      const handoffHistory = await readAllHandoffsForAgent(handoffDir, agentId);
      const stuckScore = computeStuckScore(handoffHistory);
      const latestHandoff = handoffHistory.length > 0 ? handoffHistory[handoffHistory.length - 1] : null;

      return {
        agentId,
        firstSeenAt,
        completedTaskCount,
        activeClaimTaskId,
        activeClaimTaskTier,
        activeClaimTaskTierSource,
        handoffHistory,
        latestHandoff,
        stuckScore,
      };
    })
  );

  return summaries.sort((left, right) => left.agentId.localeCompare(right.agentId));
}

// ---------------------------------------------------------------------------
// Public registration entry point
// ---------------------------------------------------------------------------

export function registerArtifactAndMaintenanceCommands(
  context: vscode.ExtensionContext,
  logger: Logger,
  stateManager: RalphStateManager,
  registerCommand: (context: vscode.ExtensionContext, logger: Logger, spec: RegisteredCommandSpec) => void
): void {
  registerCommand(context, logger, {
    commandId: 'ralphCodex.showRalphStatus',
    label: 'Ralphdex: Show Status',
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
          ? 'Ralph status summary is available in the Ralphdex output channel.'
          : 'Ralph status summary is available in the Ralphdex output channel in limited mode.',
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
    label: 'Ralphdex: Open Latest Ralph Summary',
    requiresTrustedWorkspace: false,
    handler: async (progress) => {
      progress.report({ message: 'Resolving latest Ralph summary artifact' });
      const workspaceFolder = await withWorkspaceFolder();
      await openLatestRalphSummary(workspaceFolder, stateManager, logger);
    }
  });

  registerCommand(context, logger, {
    commandId: 'ralphCodex.openLatestProvenanceBundle',
    label: 'Ralphdex: Open Latest Provenance Bundle',
    requiresTrustedWorkspace: false,
    handler: async (progress) => {
      progress.report({ message: 'Resolving latest Ralph provenance bundle' });
      const workspaceFolder = await withWorkspaceFolder();
      await openLatestProvenanceBundle(workspaceFolder, stateManager, logger);
    }
  });

  registerCommand(context, logger, {
    commandId: 'ralphCodex.openLatestPromptEvidence',
    label: 'Ralphdex: Open Latest Prompt Evidence',
    requiresTrustedWorkspace: false,
    handler: async (progress) => {
      progress.report({ message: 'Resolving latest Ralph prompt evidence' });
      const workspaceFolder = await withWorkspaceFolder();
      await openLatestPromptEvidence(workspaceFolder, stateManager, logger);
    }
  });

  registerCommand(context, logger, {
    commandId: 'ralphCodex.openLatestCliTranscript',
    label: 'Ralphdex: Open Latest CLI Transcript',
    requiresTrustedWorkspace: false,
    handler: async (progress) => {
      progress.report({ message: 'Resolving latest Ralph CLI transcript' });
      const workspaceFolder = await withWorkspaceFolder();
      await openLatestCliTranscriptOrLastMessage(workspaceFolder, stateManager, logger);
    }
  });

  registerCommand(context, logger, {
    commandId: 'ralphCodex.openLatestPipelineRun',
    label: 'Ralphdex: Open Latest Pipeline Run',
    requiresTrustedWorkspace: false,
    handler: async (progress) => {
      progress.report({ message: 'Resolving latest Ralph pipeline run artifact' });
      const workspaceFolder = await withWorkspaceFolder();
      await openLatestPipelineRun(workspaceFolder, stateManager, logger);
    }
  });

  registerCommand(context, logger, {
    commandId: 'ralphCodex.applyLatestTaskDecompositionProposal',
    label: 'Ralphdex: Apply Latest Task Decomposition Proposal',
    handler: async (progress) => {
      progress.report({ message: 'Applying the latest Ralph task decomposition proposal' });
      const workspaceFolder = await withWorkspaceFolder();
      await applyLatestTaskDecompositionProposal(workspaceFolder, stateManager, logger);
    }
  });

  registerCommand(context, logger, {
    commandId: 'ralphCodex.resolveStaleTaskClaim',
    label: 'Ralphdex: Resolve Stale Task Claim',
    handler: async (progress) => {
      progress.report({ message: 'Resolving a stale Ralph task claim' });
      const workspaceFolder = await withWorkspaceFolder();
      await resolveStaleTaskClaim(workspaceFolder, stateManager, logger);
    }
  });

  registerCommand(context, logger, {
    commandId: 'ralphCodex.revealLatestProvenanceBundleDirectory',
    label: 'Ralphdex: Reveal Latest Provenance Bundle Directory',
    requiresTrustedWorkspace: false,
    handler: async (progress) => {
      progress.report({ message: 'Revealing latest Ralph provenance bundle directory' });
      const workspaceFolder = await withWorkspaceFolder();
      await revealLatestProvenanceBundleDirectory(workspaceFolder, stateManager, logger);
    }
  });

  registerCommand(context, logger, {
    commandId: 'ralphCodex.showMultiAgentStatus',
    label: 'Ralphdex: Show Multi-Agent Status',
    requiresTrustedWorkspace: false,
    handler: async (progress) => {
      progress.report({ message: 'Collecting per-agent status' });
      const workspaceFolder = await withWorkspaceFolder();
      const config = readConfig(workspaceFolder);
      const ralphDir = path.join(workspaceFolder.uri.fsPath, '.ralph');
      const claimFilePath = path.join(ralphDir, 'claims.json');

      const summaries = await readMultiAgentStatusSummaries(ralphDir, claimFilePath);
      const report = buildMultiAgentStatusReport(summaries);

      logger.show(false);
      logger.appendText(report);
      logger.info('Multi-agent status snapshot generated.', {
        workspace: workspaceFolder.name,
        agentCount: summaries.length
      });

      void vscode.window.showInformationMessage(
        summaries.length > 0
          ? `Multi-agent status for ${summaries.length} agent(s) is available in the Ralphdex output channel.`
          : 'No agent identity records found. Run at least one CLI iteration to populate agent state.',
        'Show Output'
      ).then((choice) => {
        if (choice === 'Show Output') {
          logger.show(false);
        }
      });
    }
  });

  registerCommand(context, logger, {
    commandId: 'ralphCodex.cleanupRalphRuntimeArtifacts',
    label: 'Ralphdex: Cleanup Runtime Artifacts',
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
    label: 'Ralphdex: Reset Runtime State',
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
