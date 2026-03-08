import * as fs from 'fs/promises';
import * as path from 'path';
import { RalphCodexConfig } from '../config/types';
import { WorkspaceScan } from '../services/workspaceInspection';
import { resolveLatestArtifactPaths } from './artifactStore';
import { RalphPaths } from './pathResolver';
import {
  RalphCliInvocation,
  RalphExecutionPlan,
  RalphPreflightReport,
  RalphProvenanceBundle,
  RalphTask,
  RalphTaskCounts,
  RalphWorkspaceState
} from './types';
import { GitStatusSnapshot } from './verifier';

export interface RalphStatusSnapshot {
  workspaceName: string;
  rootPath: string;
  workspaceTrusted: boolean;
  nextIteration: number;
  taskCounts: RalphTaskCounts | null;
  taskFileError: string | null;
  selectedTask: RalphTask | null;
  lastIteration: RalphWorkspaceState['lastIteration'];
  latestSummaryPath: string | null;
  latestResultPath: string | null;
  latestPreflightReportPath: string | null;
  latestPreflightSummaryPath: string | null;
  latestPromptPath: string | null;
  latestPromptEvidencePath: string | null;
  latestExecutionPlanPath: string | null;
  latestCliInvocationPath: string | null;
  latestProvenanceBundlePath: string | null;
  latestProvenanceSummaryPath: string | null;
  latestProvenanceFailurePath: string | null;
  artifactDir: string;
  stateFilePath: string;
  progressPath: string;
  taskFilePath: string;
  promptPath: string | null;
  latestExecutionPlan: RalphExecutionPlan | null;
  latestCliInvocation: RalphCliInvocation | null;
  latestProvenanceBundle: RalphProvenanceBundle | null;
  provenanceBundleRetentionCount: number;
  verifierModes: RalphCodexConfig['verifierModes'];
  gitCheckpointMode: RalphCodexConfig['gitCheckpointMode'];
  validationCommandOverride: string | null;
  workspaceScan: WorkspaceScan;
  gitStatus: GitStatusSnapshot;
  preflightReport: RalphPreflightReport;
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

function relativeFromRoot(rootPath: string, target: string | null): string {
  if (!target) {
    return 'none';
  }

  return path.relative(rootPath, target) || '.';
}

function shortHash(hash: string | null | undefined): string {
  if (!hash) {
    return 'none';
  }

  return hash.length > 19 ? `${hash.slice(0, 19)}...` : hash;
}

function compactList(values: string[], limit: number): string {
  if (values.length === 0) {
    return 'none';
  }

  const visible = values.slice(0, limit);
  const remaining = values.length - visible.length;
  return remaining > 0 ? `${visible.join(', ')} (+${remaining} more)` : visible.join(', ');
}

function formatProvenanceTrustLevel(trustLevel: RalphProvenanceBundle['trustLevel'] | null | undefined): string {
  if (trustLevel === 'verifiedCliExecution') {
    return 'verified CLI execution';
  }
  if (trustLevel === 'preparedPromptOnly') {
    return 'prepared prompt only';
  }

  return 'none';
}

function describeProvenanceAssurance(bundle: RalphProvenanceBundle | null): string {
  if (!bundle) {
    return 'No persisted provenance bundle yet.';
  }

  if (bundle.trustLevel === 'verifiedCliExecution') {
    return 'CLI run with plan, prompt artifact, and stdin payload provenance verification.';
  }

  return 'Prepared prompt provenance only; later IDE execution may differ.';
}

export async function resolveLatestStatusArtifacts(paths: RalphPaths): Promise<{
  latestSummaryPath: string | null;
  latestResultPath: string | null;
  latestPreflightReportPath: string | null;
  latestPreflightSummaryPath: string | null;
  latestPromptPath: string | null;
  latestPromptEvidencePath: string | null;
  latestExecutionPlanPath: string | null;
  latestCliInvocationPath: string | null;
  latestProvenanceBundlePath: string | null;
  latestProvenanceSummaryPath: string | null;
  latestProvenanceFailurePath: string | null;
}> {
  const latestPaths = resolveLatestArtifactPaths(paths.artifactDir);

  return {
    latestSummaryPath: await pathExists(latestPaths.latestSummaryPath) ? latestPaths.latestSummaryPath : null,
    latestResultPath: await pathExists(latestPaths.latestResultPath) ? latestPaths.latestResultPath : null,
    latestPreflightReportPath: await pathExists(latestPaths.latestPreflightReportPath)
      ? latestPaths.latestPreflightReportPath
      : null,
    latestPreflightSummaryPath: await pathExists(latestPaths.latestPreflightSummaryPath)
      ? latestPaths.latestPreflightSummaryPath
      : null,
    latestPromptPath: await pathExists(latestPaths.latestPromptPath) ? latestPaths.latestPromptPath : null,
    latestPromptEvidencePath: await pathExists(latestPaths.latestPromptEvidencePath)
      ? latestPaths.latestPromptEvidencePath
      : null,
    latestExecutionPlanPath: await pathExists(latestPaths.latestExecutionPlanPath)
      ? latestPaths.latestExecutionPlanPath
      : null,
    latestCliInvocationPath: await pathExists(latestPaths.latestCliInvocationPath)
      ? latestPaths.latestCliInvocationPath
      : null,
    latestProvenanceBundlePath: await pathExists(latestPaths.latestProvenanceBundlePath)
      ? latestPaths.latestProvenanceBundlePath
      : null,
    latestProvenanceSummaryPath: await pathExists(latestPaths.latestProvenanceSummaryPath)
      ? latestPaths.latestProvenanceSummaryPath
      : null,
    latestProvenanceFailurePath: await pathExists(latestPaths.latestProvenanceFailurePath)
      ? latestPaths.latestProvenanceFailurePath
      : null
  };
}

export function buildStatusReport(snapshot: RalphStatusSnapshot): string {
  const renderDiagnostic = (diagnostic: RalphStatusSnapshot['preflightReport']['diagnostics'][number]): string =>
    `- ${diagnostic.severity} [${diagnostic.code}]: ${diagnostic.message}`;
  const lastIteration = snapshot.lastIteration;
  const verifierSummaries = lastIteration?.verification.verifiers.map((verifier) => {
    const location = verifier.artifactPath ? ` (${relativeFromRoot(snapshot.rootPath, verifier.artifactPath)})` : '';
    return `- ${verifier.verifier}: ${verifier.status} - ${verifier.summary}${location}`;
  }) ?? [];
  const gitEntryLines = snapshot.gitStatus.entries.slice(0, 10).map((entry) => `- ${entry.status} ${entry.path}`);
  const preflightTaskGraph = snapshot.preflightReport.diagnostics.filter((diagnostic) => diagnostic.category === 'taskGraph');
  const preflightWorkspace = snapshot.preflightReport.diagnostics.filter((diagnostic) => diagnostic.category === 'workspaceRuntime');
  const preflightAdapter = snapshot.preflightReport.diagnostics.filter((diagnostic) => diagnostic.category === 'codexAdapter');
  const preflightVerifier = snapshot.preflightReport.diagnostics.filter((diagnostic) => diagnostic.category === 'validationVerifier');
  const latestPlan = snapshot.latestExecutionPlan;
  const latestProvenance = snapshot.latestProvenanceBundle;
  const lastIntegrity = lastIteration?.executionIntegrity;
  const lastTaskLabel = lastIteration?.selectedTaskId
    ? `${lastIteration.selectedTaskId}${lastIteration.selectedTaskTitle ? ` - ${lastIteration.selectedTaskTitle}` : ''}`
    : 'none';
  const lastPromptLabel = lastIteration
    ? `${lastIteration.promptKind} (${lastIntegrity?.promptTarget ?? 'unknown'})`
    : 'none';
  const payloadMatched = lastIntegrity?.executionPayloadMatched === null || lastIntegrity?.executionPayloadMatched === undefined
    ? 'not recorded'
    : lastIntegrity.executionPayloadMatched ? 'yes' : 'no';
  const scan = snapshot.workspaceScan;

  return [
    `# Ralph Status: ${snapshot.workspaceName}`,
    '',
    '## Loop',
    `- Workspace trusted: ${snapshot.workspaceTrusted ? 'yes' : 'no'}`,
    `- Next iteration: ${snapshot.nextIteration}`,
    `- Current task: ${snapshot.selectedTask ? `${snapshot.selectedTask.id} - ${snapshot.selectedTask.title}` : 'none'}`,
    `- Current prompt kind: ${latestPlan?.promptKind ?? 'none'}`,
    `- Current target mode: ${latestPlan?.promptTarget ?? 'none'}`,
    `- Current template: ${relativeFromRoot(snapshot.rootPath, latestPlan?.templatePath ?? null)}`,
    `- Current prompt artifact: ${relativeFromRoot(snapshot.rootPath, latestPlan?.promptArtifactPath ?? null)}`,
    `- Current prompt hash: ${shortHash(latestPlan?.promptHash)}`,
    `- Current provenance ID: ${latestProvenance?.provenanceId ?? 'none'}`,
    `- Task counts: ${snapshot.taskCounts
      ? `todo ${snapshot.taskCounts.todo}, in_progress ${snapshot.taskCounts.in_progress}, blocked ${snapshot.taskCounts.blocked}, done ${snapshot.taskCounts.done}`
      : 'unavailable'}`,
    `- Task file error: ${snapshot.taskFileError ?? 'none'}`,
    '',
    '## Preflight',
    `- Ready: ${snapshot.preflightReport.ready ? 'yes' : 'no'}`,
    `- Summary: ${snapshot.preflightReport.summary}`,
    '',
    '### Task Graph',
    preflightTaskGraph.length > 0 ? preflightTaskGraph.map(renderDiagnostic).join('\n') : '- ok',
    '',
    '### Workspace/Runtime',
    preflightWorkspace.length > 0 ? preflightWorkspace.map(renderDiagnostic).join('\n') : '- ok',
    '',
    '### Codex Adapter',
    preflightAdapter.length > 0 ? preflightAdapter.map(renderDiagnostic).join('\n') : '- ok',
    '',
    '### Validation/Verifier',
    preflightVerifier.length > 0 ? preflightVerifier.map(renderDiagnostic).join('\n') : '- ok',
    '',
    '## Repo Context',
    `- Inspected root: ${relativeFromRoot(snapshot.rootPath, scan.rootPath)}`,
    `- Root selection: ${scan.rootSelection.summary}`,
    `- Manifests: ${compactList(scan.manifests, 5)}`,
    `- Source roots: ${compactList(scan.sourceRoots, 5)}`,
    `- Test roots: ${compactList(scan.tests, 5)}`,
    `- Docs: ${compactList(scan.docs, 5)}`,
    `- Package managers: ${compactList(scan.packageManagers, 4)}`,
    `- Package manager indicators: ${compactList(scan.packageManagerIndicators, 5)}`,
    `- Validation commands: ${compactList(scan.validationCommands, 5)}`,
    `- Lifecycle commands: ${compactList(scan.lifecycleCommands, 5)}`,
    `- CI files: ${compactList(scan.ciFiles, 4)}`,
    `- CI commands: ${compactList(scan.ciCommands, 4)}`,
    `- Test signals: ${compactList(scan.testSignals, 4)}`,
    `- Latest prompt evidence: ${relativeFromRoot(snapshot.rootPath, snapshot.latestPromptEvidencePath)}`,
    '',
    '## Provenance',
    `- Trust level: ${formatProvenanceTrustLevel(latestProvenance?.trustLevel)}`,
    `- Assurance: ${describeProvenanceAssurance(latestProvenance)}`,
    `- Bundle status: ${latestProvenance?.status ?? 'none'}`,
    `- Bundle summary: ${latestProvenance?.summary ?? 'none'}`,
    `- Bundle path: ${relativeFromRoot(snapshot.rootPath, snapshot.latestProvenanceBundlePath)}`,
    `- Bundle summary path: ${relativeFromRoot(snapshot.rootPath, snapshot.latestProvenanceSummaryPath)}`,
    `- Bundle directory: ${relativeFromRoot(snapshot.rootPath, snapshot.latestProvenanceBundle?.bundleDir ?? null)}`,
    `- Latest provenance failure: ${relativeFromRoot(snapshot.rootPath, snapshot.latestProvenanceFailurePath)}`,
    `- Bundle retention on write: ${snapshot.provenanceBundleRetentionCount <= 0
      ? 'disabled'
      : `keep latest ${snapshot.provenanceBundleRetentionCount}`}`,
    '',
    '## Latest Iteration',
    `- Last task: ${lastTaskLabel}`,
    `- Last prompt: ${lastPromptLabel}`,
    `- Last template: ${relativeFromRoot(snapshot.rootPath, lastIntegrity?.templatePath ?? null)}`,
    `- Payload matched rendered artifact: ${payloadMatched}`,
    `- Outcome: ${lastIteration ? `${lastIteration.completionClassification} (selected task)` : 'none'}`,
    `- Backlog remaining: ${lastIteration ? lastIteration.backlog.remainingTaskCount : 'none'}`,
    `- Next actionable task available: ${lastIteration ? (lastIteration.backlog.actionableTaskAvailable ? 'yes' : 'no') : 'none'}`,
    `- Execution: ${lastIteration?.executionStatus ?? 'none'}`,
    `- Execution message: ${lastIteration?.execution.message ?? lastIteration?.errors[0] ?? 'none'}`,
    `- Verification: ${lastIteration?.verificationStatus ?? 'none'}`,
    `- Stop reason: ${lastIteration?.stopReason ?? 'none'}`,
    `- Summary: ${lastIteration?.summary ?? 'No recorded iteration.'}`,
    `- Prompt: ${relativeFromRoot(snapshot.rootPath, snapshot.promptPath)}`,
    '',
    '## Verifiers',
    `- Enabled: ${snapshot.verifierModes.join(', ') || 'none'}`,
    `- Validation override: ${snapshot.validationCommandOverride ?? 'none'}`,
    verifierSummaries.length > 0 ? verifierSummaries.join('\n') : '- none',
    '',
    '## Artifacts',
    `- Artifact root: ${relativeFromRoot(snapshot.rootPath, snapshot.artifactDir)}`,
    `- Latest summary: ${relativeFromRoot(snapshot.rootPath, snapshot.latestSummaryPath)}`,
    `- Latest result/report: ${relativeFromRoot(snapshot.rootPath, snapshot.latestResultPath)}`,
    `- Latest preflight report: ${relativeFromRoot(snapshot.rootPath, snapshot.latestPreflightReportPath)}`,
    `- Latest preflight summary: ${relativeFromRoot(snapshot.rootPath, snapshot.latestPreflightSummaryPath)}`,
    `- Latest prompt: ${relativeFromRoot(snapshot.rootPath, snapshot.latestPromptPath)}`,
    `- Latest prompt evidence: ${relativeFromRoot(snapshot.rootPath, snapshot.latestPromptEvidencePath)}`,
    `- Latest execution plan: ${relativeFromRoot(snapshot.rootPath, snapshot.latestExecutionPlanPath)}`,
    `- Latest CLI invocation: ${relativeFromRoot(snapshot.rootPath, snapshot.latestCliInvocationPath)}`,
    `- Latest provenance bundle: ${relativeFromRoot(snapshot.rootPath, snapshot.latestProvenanceBundlePath)}`,
    `- Latest provenance summary: ${relativeFromRoot(snapshot.rootPath, snapshot.latestProvenanceSummaryPath)}`,
    `- Latest provenance failure: ${relativeFromRoot(snapshot.rootPath, snapshot.latestProvenanceFailurePath)}`,
    '- Direct command: Ralph Codex: Open Latest Ralph Summary',
    '- Direct command: Ralph Codex: Open Latest Provenance Bundle',
    '- Direct command: Ralph Codex: Reveal Latest Provenance Bundle Directory',
    `- State file: ${relativeFromRoot(snapshot.rootPath, snapshot.stateFilePath)}`,
    `- Progress file: ${relativeFromRoot(snapshot.rootPath, snapshot.progressPath)}`,
    `- Task file: ${relativeFromRoot(snapshot.rootPath, snapshot.taskFilePath)}`,
    '',
    '## Git',
    `- Checkpoint mode: ${snapshot.gitCheckpointMode}`,
    `- Repository detected: ${snapshot.gitStatus.available ? 'yes' : 'no'}`,
    `- Working tree changes: ${snapshot.gitStatus.entries.length}`,
    gitEntryLines.length > 0 ? gitEntryLines.join('\n') : '- working tree clean or git unavailable'
  ].join('\n');
}
