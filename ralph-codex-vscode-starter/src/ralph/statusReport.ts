import * as fs from 'fs/promises';
import * as path from 'path';
import { RalphCodexConfig } from '../config/types';
import { resolveLatestArtifactPaths } from './artifactStore';
import { RalphPaths } from './pathResolver';
import {
  RalphCliInvocation,
  RalphExecutionPlan,
  RalphPreflightReport,
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
  artifactDir: string;
  stateFilePath: string;
  progressPath: string;
  taskFilePath: string;
  promptPath: string | null;
  latestExecutionPlan: RalphExecutionPlan | null;
  latestCliInvocation: RalphCliInvocation | null;
  verifierModes: RalphCodexConfig['verifierModes'];
  gitCheckpointMode: RalphCodexConfig['gitCheckpointMode'];
  validationCommandOverride: string | null;
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

export async function resolveLatestStatusArtifacts(paths: RalphPaths): Promise<{
  latestSummaryPath: string | null;
  latestResultPath: string | null;
  latestPreflightReportPath: string | null;
  latestPreflightSummaryPath: string | null;
  latestPromptPath: string | null;
  latestPromptEvidencePath: string | null;
  latestExecutionPlanPath: string | null;
  latestCliInvocationPath: string | null;
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
    '## Latest Iteration',
    `- Last task: ${lastTaskLabel}`,
    `- Last prompt: ${lastPromptLabel}`,
    `- Last template: ${relativeFromRoot(snapshot.rootPath, lastIntegrity?.templatePath ?? null)}`,
    `- Payload matched rendered artifact: ${payloadMatched}`,
    `- Outcome: ${lastIteration ? `${lastIteration.completionClassification} (selected task)` : 'none'}`,
    `- Backlog remaining: ${lastIteration ? lastIteration.backlog.remainingTaskCount : 'none'}`,
    `- Next actionable task available: ${lastIteration ? (lastIteration.backlog.actionableTaskAvailable ? 'yes' : 'no') : 'none'}`,
    `- Execution: ${lastIteration?.executionStatus ?? 'none'}`,
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
    '- Direct command: Ralph Codex: Open Latest Ralph Summary',
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
