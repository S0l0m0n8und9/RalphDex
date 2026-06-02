import * as fs from 'fs/promises';
import * as path from 'path';
import type { DoctrineProposalArtifact, DoctrineProposalReviewArtifact } from './doctrineProposals';
import { renderDoctrineProposalMarkdown, renderDoctrineProposalReviewMarkdown } from './doctrineProposals';
import { stableJson } from './integrity';
import {
  registerArtifacts,
  type ArtifactRegistryEntryInput,
  type ArtifactRelationships,
  type ArtifactRetentionClass
} from './artifactRegistry';
import { renderCleanupManifestMarkdown, type RalphCleanupManifest } from './cleanupManifest';
import {
  resolveOrchestrationPaths as resolveSupervisorOrchestrationPaths,
  type OrchestrationArtifactPaths as SupervisorOrchestrationArtifactPaths
} from './orchestrationSupervisor';
import {
  renderPreflightSummary,
  renderIterationSummary,
  renderIntegrityFailureSummary,
  renderProvenanceSummary,
  latestResultFromIteration
} from './artifactRendering';
import { cleanupProvenanceBundles } from './artifactRetention';
import type {
  RalphCliInvocation,
  RalphDiffSummary,
  RalphExecutionPlan,
  RalphIntegrityFailure,
  RalphIterationResult,
  RalphPersistedPreflightReport,
  RalphPreflightReport,
  RalphPromptEvidence,
  RalphPromptKind,
  RalphPromptSessionHandoff,
  RalphPromptTarget,
  RalphProvenanceBundle,
  RalphProvenanceTrustLevel,
  RalphTaskRemediationArtifact,
  RalphVerificationResult,
  RalphWatchdogAction,
  ReplanDecisionArtifact
} from './types';

// Re-export submodules for backward compatibility.
export * from './artifactRendering';
export * from './artifactRetention';

// Define orchestration graph/state path resolution on the artifact-store surface
// so callers can discover every durable Ralph artifact from one module.
export type OrchestrationArtifactPaths = SupervisorOrchestrationArtifactPaths;

export function resolveOrchestrationPaths(ralphRoot: string, runId: string): OrchestrationArtifactPaths {
  return resolveSupervisorOrchestrationPaths(ralphRoot, runId);
}

export interface RalphIterationArtifactPaths {
  directory: string;
  promptPath: string;
  promptEvidencePath: string;
  executionPlanPath: string;
  cliInvocationPath: string;
  completionReportPath: string;
  doctrineProposalPath: string;
  stdoutPath: string;
  stderrPath: string;
  executionSummaryPath: string;
  verifierSummaryPath: string;
  diffSummaryPath: string;
  iterationResultPath: string;
  remediationPath: string;
  summaryPath: string;
  gitStatusBeforePath: string;
  gitStatusAfterPath: string;
}

export interface RalphProvenanceBundlePaths {
  directory: string;
  bundlePath: string;
  summaryPath: string;
  preflightReportPath: string;
  preflightSummaryPath: string;
  promptPath: string;
  promptEvidencePath: string;
  executionPlanPath: string;
  cliInvocationPath: string;
  iterationResultPath: string;
  provenanceFailurePath: string;
  provenanceFailureSummaryPath: string;
}

export interface RalphLatestArtifactPaths {
  latestResultPath: string;
  latestSummaryPath: string;
  latestPreflightReportPath: string;
  latestPreflightSummaryPath: string;
  latestPromptPath: string;
  latestPromptEvidencePath: string;
  latestExecutionPlanPath: string;
  latestCliInvocationPath: string;
  latestRemediationPath: string;
  latestDoctrineProposalPath: string;
  latestDoctrineProposalMdPath: string;
  latestProvenanceBundlePath: string;
  latestProvenanceSummaryPath: string;
  latestProvenanceFailurePath: string;
}

export interface RalphDoctrineProposalCanonicalPaths {
  directory: string;
  jsonPath: string;
  mdPath: string;
}

export interface RalphDoctrineProposalReviewPaths {
  directory: string;
  reviewJsonPath: string;
  reviewMdPath: string;
}

export interface RalphLatestArtifactRepairSummary {
  repairedLatestArtifactPaths: string[];
  staleLatestArtifactPaths: string[];
}

export type RalphGeneratedArtifactProtectionScope = 'currentAndLatest' | 'fullStateAndLatest';

export const PROTECTED_GENERATED_STATE_ROOT_REFERENCES = [
  'lastPromptPath',
  'lastRun.promptPath',
  'lastRun.transcriptPath',
  'lastRun.lastMessagePath',
  'lastIteration.artifactDir',
  'lastIteration.promptPath',
  'lastIteration.execution.transcriptPath',
  'lastIteration.execution.lastMessagePath',
  'runHistory[].promptPath',
  'runHistory[].transcriptPath',
  'runHistory[].lastMessagePath',
  'iterationHistory[].artifactDir',
  'iterationHistory[].promptPath',
  'iterationHistory[].execution.transcriptPath',
  'iterationHistory[].execution.lastMessagePath'
] as const;

export const PROTECTED_GENERATED_LATEST_POINTER_FILES = [
  'latest-result.json',
  'latest-preflight-report.json',
  'latest-prompt-evidence.json',
  'latest-execution-plan.json',
  'latest-cli-invocation.json',
  'latest-doctrine-proposal.json',
  'latest-doctrine-proposal.md',
  'latest-provenance-bundle.json',
  'latest-provenance-failure.json'
] as const;

export const PROTECTED_GENERATED_LATEST_POINTER_REFERENCES = {
  'latest-result.json': [
    'artifactDir',
    'summaryPath',
    'promptPath',
    'promptEvidencePath',
    'executionPlanPath',
    'cliInvocationPath',
    'promptArtifactPath',
    'transcriptPath',
    'lastMessagePath'
  ],
  'latest-preflight-report.json': [
    'artifactDir',
    'reportPath',
    'summaryPath'
  ],
  'latest-prompt-evidence.json': [
    'kind+iteration (derived iteration directory and prompt file)'
  ],
  'latest-execution-plan.json': [
    'artifactDir',
    'promptPath',
    'promptArtifactPath',
    'promptEvidencePath',
    'executionPlanPath'
  ],
  'latest-cli-invocation.json': [
    'promptArtifactPath',
    'transcriptPath',
    'lastMessagePath',
    'cliInvocationPath'
  ],
  'latest-doctrine-proposal.json': [
    'provenanceId',
    'iteration',
    'selectedTaskId',
    'selectedTaskTitle'
  ],
  'latest-doctrine-proposal.md': [
    'proposalId (derived from provenanceId or iteration)'
  ],
  'latest-provenance-bundle.json': [
    'artifactDir',
    'preflightReportPath',
    'preflightSummaryPath',
    'promptArtifactPath',
    'promptEvidencePath',
    'executionPlanPath',
    'cliInvocationPath',
    'iterationResultPath',
    'provenanceFailurePath',
    'provenanceFailureSummaryPath'
  ],
  'latest-provenance-failure.json': [
    'artifactDir',
    'executionPlanPath',
    'promptArtifactPath',
    'cliInvocationPath',
    'provenanceFailurePath',
    'provenanceFailureSummaryPath'
  ]
} as const;

export interface RalphPreflightArtifactPaths {
  directory: string;
  reportPath: string;
  summaryPath: string;
}

export interface RalphProvenanceRetentionSummary {
  deletedBundleIds: string[];
  retainedBundleIds: string[];
  protectedBundleIds: string[];
}

export interface RalphGeneratedArtifactRetentionSummary {
  deletedIterationDirectories: string[];
  retainedIterationDirectories: string[];
  protectedRetainedIterationDirectories: string[];
  deletedPromptFiles: string[];
  retainedPromptFiles: string[];
  protectedRetainedPromptFiles: string[];
  deletedRunArtifactBaseNames: string[];
  retainedRunArtifactBaseNames: string[];
  protectedRetainedRunArtifactBaseNames: string[];
  deletedHandoffFiles?: string[];
  retainedHandoffFiles?: string[];
  deletedWatchdogFiles?: string[];
  retainedWatchdogFiles?: string[];
}

export interface RalphWatchdogDiagnosticArtifact {
  schemaVersion: 1;
  kind: 'watchdogDiagnostic';
  agentId: string;
  provenanceId: string;
  iteration: number;
  triggeredAt: string;
  actionCount: number;
  actions: RalphWatchdogAction[];
}

export function resolveIterationArtifactPaths(artifactRootDir: string, iteration: number): RalphIterationArtifactPaths {
  const directory = path.join(artifactRootDir, `iteration-${String(iteration).padStart(3, '0')}`);

  return {
    directory,
    promptPath: path.join(directory, 'prompt.md'),
    promptEvidencePath: path.join(directory, 'prompt-evidence.json'),
    executionPlanPath: path.join(directory, 'execution-plan.json'),
    cliInvocationPath: path.join(directory, 'cli-invocation.json'),
    completionReportPath: path.join(directory, 'completion-report.json'),
    doctrineProposalPath: path.join(directory, 'doctrine-proposal.json'),
    stdoutPath: path.join(directory, 'stdout.log'),
    stderrPath: path.join(directory, 'stderr.log'),
    executionSummaryPath: path.join(directory, 'execution-summary.json'),
    verifierSummaryPath: path.join(directory, 'verifier-summary.json'),
    diffSummaryPath: path.join(directory, 'diff-summary.json'),
    iterationResultPath: path.join(directory, 'iteration-result.json'),
    remediationPath: path.join(directory, 'task-remediation.json'),
    summaryPath: path.join(directory, 'summary.md'),
    gitStatusBeforePath: path.join(directory, 'git-status-before.txt'),
    gitStatusAfterPath: path.join(directory, 'git-status-after.txt')
  };
}

export function resolveProvenanceBundlePaths(
  artifactRootDir: string,
  provenanceId: string
): RalphProvenanceBundlePaths {
  const directory = path.join(artifactRootDir, 'runs', provenanceId);

  return {
    directory,
    bundlePath: path.join(directory, 'provenance-bundle.json'),
    summaryPath: path.join(directory, 'summary.md'),
    preflightReportPath: path.join(directory, 'preflight-report.json'),
    preflightSummaryPath: path.join(directory, 'preflight-summary.md'),
    promptPath: path.join(directory, 'prompt.md'),
    promptEvidencePath: path.join(directory, 'prompt-evidence.json'),
    executionPlanPath: path.join(directory, 'execution-plan.json'),
    cliInvocationPath: path.join(directory, 'cli-invocation.json'),
    iterationResultPath: path.join(directory, 'iteration-result.json'),
    provenanceFailurePath: path.join(directory, 'provenance-failure.json'),
    provenanceFailureSummaryPath: path.join(directory, 'provenance-failure-summary.md')
  };
}

export function resolveLatestArtifactPaths(artifactRootDir: string): RalphLatestArtifactPaths {
  return {
    latestResultPath: path.join(artifactRootDir, 'latest-result.json'),
    latestSummaryPath: path.join(artifactRootDir, 'latest-summary.md'),
    latestPreflightReportPath: path.join(artifactRootDir, 'latest-preflight-report.json'),
    latestPreflightSummaryPath: path.join(artifactRootDir, 'latest-preflight-summary.md'),
    latestPromptPath: path.join(artifactRootDir, 'latest-prompt.md'),
    latestPromptEvidencePath: path.join(artifactRootDir, 'latest-prompt-evidence.json'),
    latestExecutionPlanPath: path.join(artifactRootDir, 'latest-execution-plan.json'),
    latestCliInvocationPath: path.join(artifactRootDir, 'latest-cli-invocation.json'),
    latestRemediationPath: path.join(artifactRootDir, 'latest-remediation.json'),
    latestDoctrineProposalPath: path.join(artifactRootDir, 'latest-doctrine-proposal.json'),
    latestDoctrineProposalMdPath: path.join(artifactRootDir, 'latest-doctrine-proposal.md'),
    latestProvenanceBundlePath: path.join(artifactRootDir, 'latest-provenance-bundle.json'),
    latestProvenanceSummaryPath: path.join(artifactRootDir, 'latest-provenance-summary.md'),
    latestProvenanceFailurePath: path.join(artifactRootDir, 'latest-provenance-failure.json')
  };
}

export function resolveDoctrineProposalCanonicalPaths(
  artifactRootDir: string,
  proposalId: string
): RalphDoctrineProposalCanonicalPaths {
  if (!proposalId || proposalId.trim() === '') {
    throw new Error('proposalId must not be empty');
  }
  if (proposalId.includes('/') || proposalId.includes('\\') || proposalId.includes('..')) {
    throw new Error(`proposalId contains unsafe path characters: ${proposalId}`);
  }
  const directory = path.join(artifactRootDir, 'doctrine-proposals');
  return {
    directory,
    jsonPath: path.join(directory, `${proposalId}.json`),
    mdPath: path.join(directory, `${proposalId}.md`)
  };
}

export function resolveDoctrineProposalReviewPaths(
  artifactRootDir: string,
  proposalId: string
): RalphDoctrineProposalReviewPaths {
  if (!proposalId || proposalId.trim() === '') {
    throw new Error('proposalId must not be empty');
  }
  if (proposalId.includes('/') || proposalId.includes('\\') || proposalId.includes('..')) {
    throw new Error(`proposalId contains unsafe path characters: ${proposalId}`);
  }
  const directory = path.join(artifactRootDir, 'doctrine-proposals');
  return {
    directory,
    reviewJsonPath: path.join(directory, `${proposalId}.review.json`),
    reviewMdPath: path.join(directory, `${proposalId}.review.md`)
  };
}

export async function writeDoctrineProposalReviewArtifact(input: {
  artifactRootDir: string;
  review: DoctrineProposalReviewArtifact;
}): Promise<{ reviewJsonPath: string; reviewMdPath: string }> {
  const reviewPaths = resolveDoctrineProposalReviewPaths(input.artifactRootDir, input.review.proposalId);
  const markdown = renderDoctrineProposalReviewMarkdown(input.review);

  await fs.mkdir(reviewPaths.directory, { recursive: true });
  await Promise.all([
    fs.writeFile(reviewPaths.reviewJsonPath, stableJson(input.review), 'utf8'),
    fs.writeFile(reviewPaths.reviewMdPath, `${markdown.trimEnd()}\n`, 'utf8')
  ]);

  return { reviewJsonPath: reviewPaths.reviewJsonPath, reviewMdPath: reviewPaths.reviewMdPath };
}

export async function writeUpdatedDoctrineProposalArtifact(input: {
  artifactRootDir: string;
  proposal: DoctrineProposalArtifact;
}): Promise<void> {
  const canonicalPaths = resolveDoctrineProposalCanonicalPaths(input.artifactRootDir, input.proposal.proposalId);
  const latestPaths = resolveLatestArtifactPaths(input.artifactRootDir);
  const markdown = renderDoctrineProposalMarkdown(input.proposal);
  const json = stableJson(input.proposal);

  await fs.mkdir(canonicalPaths.directory, { recursive: true });
  await Promise.all([
    fs.writeFile(canonicalPaths.jsonPath, json, 'utf8'),
    fs.writeFile(canonicalPaths.mdPath, `${markdown.trimEnd()}\n`, 'utf8'),
    fs.writeFile(latestPaths.latestDoctrineProposalPath, json, 'utf8'),
    fs.writeFile(latestPaths.latestDoctrineProposalMdPath, `${markdown.trimEnd()}\n`, 'utf8')
  ]);
}

/**
 * Returns the path where a context envelope for `iterationId` should be written.
 *
 * `iterationId` is used as-is (no zero-padding) because callers supply a raw
 * string identifier rather than a numeric iteration counter.
 */
export function contextEnvelopePath(artifactRootDir: string, iterationId: string): string {
  return path.join(artifactRootDir, `iteration-${iterationId}`, 'context-envelope.json');
}

/**
 * Returns the path where a plan graph for `parentTaskId` should be persisted.
 *
 * Layout: `<artifactRootDir>/<parentTaskId>/plan-graph.json`.
 */
export function planGraphPath(artifactRootDir: string, parentTaskId: string): string {
  return path.join(artifactRootDir, parentTaskId, 'plan-graph.json');
}

/**
 * Returns the path where replan decision artifact `replanIndex` for `parentTaskId`
 * should be persisted.
 *
 * Layout: `<artifactRootDir>/<parentTaskId>/replan-<replanIndex>.json`.
 *
 * This path lives inside the `<parentTaskId>/` directory, which is NOT matched
 * by `parseIterationDirectoryName` in artifactRetention.ts — so these files are
 * already excluded from generated-artifact retention cleanup without any special
 * guard needed.
 */
export function replanDecisionPath(
  artifactRootDir: string,
  parentTaskId: string,
  replanIndex: number
): string {
  return path.join(artifactRootDir, parentTaskId, `replan-${replanIndex}.json`);
}

/**
 * Write a replan decision artifact to the parent-task directory.
 *
 * Creates the directory if needed, then writes stable JSON.
 */
export async function writeReplanDecisionArtifact(
  artifactRootDir: string,
  artifact: ReplanDecisionArtifact
): Promise<string> {
  const artifactPath = replanDecisionPath(artifactRootDir, artifact.parentTaskId, artifact.replanIndex);
  await fs.mkdir(path.dirname(artifactPath), { recursive: true });
  await fs.writeFile(artifactPath, stableJson(artifact), 'utf8');
  return artifactPath;
}

export function resolvePreflightArtifactPaths(artifactRootDir: string, iteration: number): RalphPreflightArtifactPaths {
  const directory = path.join(artifactRootDir, `iteration-${String(iteration).padStart(3, '0')}`);

  return {
    directory,
    reportPath: path.join(directory, 'preflight-report.json'),
    summaryPath: path.join(directory, 'preflight-summary.md')
  };
}

export async function ensureIterationArtifactDirectory(paths: RalphIterationArtifactPaths): Promise<void> {
  await fs.mkdir(paths.directory, { recursive: true });
}

async function ensureProvenanceBundleDirectory(paths: RalphProvenanceBundlePaths): Promise<void> {
  await fs.mkdir(paths.directory, { recursive: true });
}

export async function writePromptArtifacts(input: {
  paths: RalphIterationArtifactPaths;
  artifactRootDir: string;
  prompt: string;
  promptEvidence: RalphPromptEvidence;
}): Promise<RalphLatestArtifactPaths> {
  await ensureIterationArtifactDirectory(input.paths);

  const latestPaths = resolveLatestArtifactPaths(input.artifactRootDir);

  await Promise.all([
    fs.writeFile(input.paths.promptPath, `${input.prompt.trimEnd()}\n`, 'utf8'),
    fs.writeFile(input.paths.promptEvidencePath, stableJson(input.promptEvidence), 'utf8'),
    fs.writeFile(latestPaths.latestPromptPath, `${input.prompt.trimEnd()}\n`, 'utf8'),
    fs.writeFile(latestPaths.latestPromptEvidencePath, stableJson(input.promptEvidence), 'utf8')
  ]);

  return latestPaths;
}

export async function writeExecutionPlanArtifact(input: {
  paths: RalphIterationArtifactPaths;
  artifactRootDir: string;
  plan: RalphExecutionPlan;
}): Promise<RalphLatestArtifactPaths> {
  await ensureIterationArtifactDirectory(input.paths);

  const latestPaths = resolveLatestArtifactPaths(input.artifactRootDir);

  await Promise.all([
    fs.writeFile(input.paths.executionPlanPath, stableJson(input.plan), 'utf8'),
    fs.writeFile(latestPaths.latestExecutionPlanPath, stableJson(input.plan), 'utf8')
  ]);

  return latestPaths;
}

export async function writeCliInvocationArtifact(input: {
  paths: RalphIterationArtifactPaths;
  artifactRootDir: string;
  invocation: RalphCliInvocation;
}): Promise<RalphLatestArtifactPaths> {
  await ensureIterationArtifactDirectory(input.paths);

  const latestPaths = resolveLatestArtifactPaths(input.artifactRootDir);

  await Promise.all([
    fs.writeFile(input.paths.cliInvocationPath, stableJson(input.invocation), 'utf8'),
    fs.writeFile(latestPaths.latestCliInvocationPath, stableJson(input.invocation), 'utf8')
  ]);

  return latestPaths;
}

export async function writeDoctrineProposalArtifact(input: {
  paths: RalphIterationArtifactPaths;
  artifactRootDir: string;
  proposal: DoctrineProposalArtifact;
}): Promise<string> {
  await ensureIterationArtifactDirectory(input.paths);

  const latestPaths = resolveLatestArtifactPaths(input.artifactRootDir);
  const canonicalPaths = resolveDoctrineProposalCanonicalPaths(input.artifactRootDir, input.proposal.proposalId);
  const markdown = renderDoctrineProposalMarkdown(input.proposal);
  const json = stableJson(input.proposal);

  await fs.mkdir(canonicalPaths.directory, { recursive: true });
  await Promise.all([
    fs.writeFile(input.paths.doctrineProposalPath, json, 'utf8'),
    fs.writeFile(canonicalPaths.jsonPath, json, 'utf8'),
    fs.writeFile(canonicalPaths.mdPath, `${markdown.trimEnd()}\n`, 'utf8'),
    fs.writeFile(latestPaths.latestDoctrineProposalPath, json, 'utf8'),
    fs.writeFile(latestPaths.latestDoctrineProposalMdPath, `${markdown.trimEnd()}\n`, 'utf8')
  ]);

  return canonicalPaths.jsonPath;
}

export async function writePreflightArtifacts(input: {
  paths: RalphPreflightArtifactPaths;
  artifactRootDir: string;
  agentId: string;
  provenanceId: string;
  iteration: number;
  promptKind: RalphPromptKind;
  promptTarget: RalphPromptTarget;
  trustLevel: RalphProvenanceTrustLevel;
  report: RalphPreflightReport;
  selectedTaskId: string | null;
  selectedTaskTitle: string | null;
  taskValidationHint: string | null;
  effectiveValidationCommand: string | null;
  normalizedValidationCommandFrom: string | null;
  validationCommand: string | null;
  sessionHandoff?: RalphPromptSessionHandoff | null;
}): Promise<{ latestPaths: RalphLatestArtifactPaths; persistedReport: RalphPersistedPreflightReport; humanSummary: string }> {
  await fs.mkdir(input.paths.directory, { recursive: true });

  const latestPaths = resolveLatestArtifactPaths(input.artifactRootDir);
  const persistedReport: RalphPersistedPreflightReport = {
    schemaVersion: 1,
    kind: 'preflight',
    agentId: input.agentId,
    provenanceId: input.provenanceId,
    iteration: input.iteration,
    promptKind: input.promptKind,
    promptTarget: input.promptTarget,
    trustLevel: input.trustLevel,
    ready: input.report.ready,
    summary: input.report.summary,
    activeClaimSummary: input.report.activeClaimSummary,
    selectedTaskId: input.selectedTaskId,
    selectedTaskTitle: input.selectedTaskTitle,
    taskValidationHint: input.taskValidationHint,
    effectiveValidationCommand: input.effectiveValidationCommand,
    normalizedValidationCommandFrom: input.normalizedValidationCommandFrom,
    validationCommand: input.validationCommand,
    artifactDir: input.paths.directory,
    reportPath: input.paths.reportPath,
    summaryPath: input.paths.summaryPath,
    blocked: !input.report.ready,
    createdAt: new Date().toISOString(),
    diagnostics: input.report.diagnostics,
    sessionHandoff: input.sessionHandoff ?? null
  };
  const humanSummary = renderPreflightSummary(persistedReport);

  await Promise.all([
    fs.writeFile(input.paths.reportPath, stableJson(persistedReport), 'utf8'),
    fs.writeFile(input.paths.summaryPath, `${humanSummary.trimEnd()}\n`, 'utf8'),
    fs.writeFile(latestPaths.latestPreflightReportPath, stableJson(persistedReport), 'utf8'),
    fs.writeFile(latestPaths.latestPreflightSummaryPath, `${humanSummary.trimEnd()}\n`, 'utf8'),
    input.report.ready
      ? Promise.resolve()
      : Promise.all([
        fs.writeFile(latestPaths.latestResultPath, stableJson(persistedReport), 'utf8'),
        fs.writeFile(latestPaths.latestSummaryPath, `${humanSummary.trimEnd()}\n`, 'utf8')
      ]).then(() => undefined)
  ]);

  return {
    latestPaths,
    persistedReport,
    humanSummary
  };
}

export async function writeIterationArtifacts(input: {
  paths: RalphIterationArtifactPaths;
  artifactRootDir: string;
  prompt: string;
  promptEvidence: RalphPromptEvidence;
  completionReport: unknown;
  doctrineProposalArtifact?: DoctrineProposalArtifact | null;
  stdout: string;
  stderr: string;
  executionSummary: unknown;
  verifierSummary: RalphVerificationResult[];
  diffSummary: RalphDiffSummary | null;
  result: RalphIterationResult;
  remediationArtifact?: RalphTaskRemediationArtifact | null;
  gitStatusBefore?: string;
  gitStatusAfter?: string;
}): Promise<{ latestPaths: RalphLatestArtifactPaths; humanSummary: string; latestResult: Record<string, unknown> }> {
  await ensureIterationArtifactDirectory(input.paths);

  const latestPaths = resolveLatestArtifactPaths(input.artifactRootDir);
  const humanSummary = renderIterationSummary({
    result: input.result,
    paths: input.paths,
    verifiers: input.verifierSummary,
    diffSummary: input.diffSummary,
    hasDoctrineProposal: input.doctrineProposalArtifact != null
  });
  const latestResult = latestResultFromIteration({
    result: input.result,
    paths: input.paths,
    diffSummary: input.diffSummary,
    hasDoctrineProposal: input.doctrineProposalArtifact != null
  });

  await Promise.all([
    fs.writeFile(input.paths.promptPath, `${input.prompt.trimEnd()}\n`, 'utf8'),
    fs.writeFile(input.paths.promptEvidencePath, stableJson(input.promptEvidence), 'utf8'),
    fs.writeFile(input.paths.completionReportPath, stableJson(input.completionReport), 'utf8'),
    fs.writeFile(input.paths.stdoutPath, input.stdout, 'utf8'),
    fs.writeFile(input.paths.stderrPath, input.stderr, 'utf8'),
    fs.writeFile(input.paths.executionSummaryPath, stableJson(input.executionSummary), 'utf8'),
    fs.writeFile(input.paths.verifierSummaryPath, stableJson(input.verifierSummary), 'utf8'),
    fs.writeFile(input.paths.iterationResultPath, stableJson(input.result), 'utf8'),
    input.remediationArtifact
      ? fs.writeFile(input.paths.remediationPath, stableJson(input.remediationArtifact), 'utf8')
      : Promise.resolve(),
    fs.writeFile(input.paths.summaryPath, `${humanSummary.trimEnd()}\n`, 'utf8'),
    fs.writeFile(latestPaths.latestResultPath, stableJson(latestResult), 'utf8'),
    fs.writeFile(latestPaths.latestSummaryPath, `${humanSummary.trimEnd()}\n`, 'utf8'),
    fs.writeFile(latestPaths.latestPromptPath, `${input.prompt.trimEnd()}\n`, 'utf8'),
    fs.writeFile(latestPaths.latestPromptEvidencePath, stableJson(input.promptEvidence), 'utf8'),
    input.remediationArtifact
      ? fs.writeFile(latestPaths.latestRemediationPath, stableJson(input.remediationArtifact), 'utf8')
      : fs.rm(latestPaths.latestRemediationPath, { force: true }),
    input.doctrineProposalArtifact
      ? writeDoctrineProposalArtifact({
        paths: input.paths,
        artifactRootDir: input.artifactRootDir,
        proposal: input.doctrineProposalArtifact
      })
      : Promise.resolve(),
    input.diffSummary
      ? fs.writeFile(input.paths.diffSummaryPath, stableJson(input.diffSummary), 'utf8')
      : Promise.resolve(),
    input.gitStatusBefore !== undefined
      ? fs.writeFile(input.paths.gitStatusBeforePath, input.gitStatusBefore, 'utf8')
      : Promise.resolve(),
    input.gitStatusAfter !== undefined
      ? fs.writeFile(input.paths.gitStatusAfterPath, input.gitStatusAfter, 'utf8')
      : Promise.resolve()
  ]);

  return {
    latestPaths,
    humanSummary,
    latestResult
  };
}

export async function writeProvenanceBundle(input: {
  artifactRootDir: string;
  paths: RalphProvenanceBundlePaths;
  bundle: Omit<
    RalphProvenanceBundle,
    'executionSummaryPath'
    | 'verifierSummaryPath'
    | 'completionReportStatus'
    | 'reconciliationWarnings'
    | 'completionReportPath'
    | 'epistemicGap'
  >;
  preflightReport: RalphPersistedPreflightReport;
  preflightSummary: string;
  prompt?: string;
  promptEvidence?: RalphPromptEvidence;
  executionPlan?: RalphExecutionPlan;
  cliInvocation?: RalphCliInvocation;
  result?: RalphIterationResult;
  failure?: RalphIntegrityFailure;
  retentionCount?: number;
}): Promise<{
  latestPaths: RalphLatestArtifactPaths;
  summary: string;
  retention: RalphProvenanceRetentionSummary;
}> {
  await ensureProvenanceBundleDirectory(input.paths);

  const resultIterationPaths = input.result
    ? resolveIterationArtifactPaths(input.artifactRootDir, input.result.iteration)
    : null;
  const completionReportPath = resultIterationPaths
    ? await fs.access(resultIterationPaths.completionReportPath)
      .then(() => resultIterationPaths.completionReportPath)
      .catch(() => null)
    : null;
  const bundle: RalphProvenanceBundle = input.result
    ? {
      ...input.bundle,
      executionSummaryPath: resultIterationPaths?.executionSummaryPath ?? null,
      verifierSummaryPath: resultIterationPaths?.verifierSummaryPath ?? null,
      completionReportStatus: input.result.completionReportStatus ?? null,
      reconciliationWarnings: input.result.reconciliationWarnings ?? null,
      completionReportPath,
      epistemicGap: {
        trustBoundary: 'The provenance chain stops at the codex exec boundary; model-internal reasoning is not directly observable.',
        bundleProves: 'Prompt, plan, and CLI payload integrity up to execution, plus the verifier-observed post-run artifacts.',
        bundleDoesNotProve: 'That the model reasoned correctly internally or that its completion report is true without verifier support.',
        modelClaimsPath: completionReportPath,
        modelClaimsStatus: input.result.completionReportStatus ?? null,
        modelClaimsAreUnverified: completionReportPath !== null,
        verifierEvidencePaths: [
          resultIterationPaths?.executionSummaryPath ?? null,
          resultIterationPaths?.verifierSummaryPath ?? null,
          resultIterationPaths?.iterationResultPath ?? null
        ].filter((item): item is string => typeof item === 'string' && item.length > 0),
        verifierEvidenceIsAuthoritative: true,
        reconciliationWarnings: input.result.reconciliationWarnings ?? [],
        noWarningsMeans: 'No reconciliation warnings means the model claim matched the observable verifier signals, not that the model reasoning was correct.'
      }
    }
    : {
      ...input.bundle,
      executionSummaryPath: null,
      verifierSummaryPath: null,
      epistemicGap: {
        trustBoundary: 'The provenance chain can prove only the prepared bundle until execution occurs.',
        bundleProves: 'The persisted preflight, prompt, and execution-plan artifacts that Ralph prepared for this run.',
        bundleDoesNotProve: 'Anything about a model outcome, because no completion report or verifier evidence exists yet.',
        modelClaimsPath: null,
        modelClaimsStatus: null,
        modelClaimsAreUnverified: false,
        verifierEvidencePaths: [],
        verifierEvidenceIsAuthoritative: true,
        reconciliationWarnings: [],
        noWarningsMeans: 'No reconciliation warnings are available because no model self-report was reconciled yet.'
      }
    };

  const latestPaths = resolveLatestArtifactPaths(input.artifactRootDir);
  const summary = renderProvenanceSummary(bundle);
  const writes: Promise<unknown>[] = [
    fs.writeFile(input.paths.bundlePath, stableJson(bundle), 'utf8'),
    fs.writeFile(input.paths.summaryPath, `${summary.trimEnd()}\n`, 'utf8'),
    fs.writeFile(input.paths.preflightReportPath, stableJson(input.preflightReport), 'utf8'),
    fs.writeFile(input.paths.preflightSummaryPath, `${input.preflightSummary.trimEnd()}\n`, 'utf8'),
    fs.writeFile(latestPaths.latestProvenanceBundlePath, stableJson(bundle), 'utf8'),
    fs.writeFile(latestPaths.latestProvenanceSummaryPath, `${summary.trimEnd()}\n`, 'utf8')
  ];

  if (input.prompt !== undefined) {
    writes.push(fs.writeFile(input.paths.promptPath, `${input.prompt.trimEnd()}\n`, 'utf8'));
  }
  if (input.promptEvidence) {
    writes.push(fs.writeFile(input.paths.promptEvidencePath, stableJson(input.promptEvidence), 'utf8'));
  }
  if (input.executionPlan) {
    writes.push(fs.writeFile(input.paths.executionPlanPath, stableJson(input.executionPlan), 'utf8'));
  }
  if (input.cliInvocation) {
    writes.push(fs.writeFile(input.paths.cliInvocationPath, stableJson(input.cliInvocation), 'utf8'));
  }
  if (input.result) {
    writes.push(fs.writeFile(input.paths.iterationResultPath, stableJson(input.result), 'utf8'));
  }
  if (input.failure) {
    const failureSummary = renderIntegrityFailureSummary(input.failure);
    writes.push(
      fs.writeFile(input.paths.provenanceFailurePath, stableJson(input.failure), 'utf8'),
      fs.writeFile(input.paths.provenanceFailureSummaryPath, `${failureSummary.trimEnd()}\n`, 'utf8'),
      fs.writeFile(latestPaths.latestProvenanceFailurePath, stableJson(input.failure), 'utf8'),
      fs.writeFile(latestPaths.latestResultPath, stableJson(input.failure), 'utf8'),
      fs.writeFile(latestPaths.latestSummaryPath, `${failureSummary.trimEnd()}\n`, 'utf8')
    );
  }

  await Promise.all(writes);
  const retention = await cleanupProvenanceBundles({
    artifactRootDir: input.artifactRootDir,
    retentionCount: input.retentionCount ?? 0
  });

  return {
    latestPaths,
    summary,
    retention
  };
}

/** Metadata stamped onto every registry entry produced for one iteration. */
export interface IterationArtifactRegistryMetadata {
  runId: string | null;
  taskId: string | null;
  agentId: string | null;
  agentRole: string | null;
  provider: string | null;
  iteration: number | null;
}

interface RegistrableArtifact {
  path: string;
  type: string;
  retentionClass: ArtifactRetentionClass;
  related?: ArtifactRelationships;
}

function toRegistryRelative(artifactRootDir: string, target: string): string {
  return path.relative(artifactRootDir, target).split(path.sep).join('/');
}

/**
 * Registers the artifacts produced by one iteration (plus its provenance bundle)
 * in the canonical artifact registry (`index.json`), so the dashboard/sidebar and
 * cleanup can query by run/task/type/provider/role without walking the tree
 * (issue #69).
 *
 * Only paths that actually exist on disk are registered, so optional artifacts
 * (cli-invocation, diff-summary, remediation, doctrine-proposal) are included
 * exactly when they were written. The latest-pointer files stay authoritative
 * for backward compatibility; the registry is an additive index.
 */
export async function registerIterationArtifactSet(input: {
  artifactRootDir: string;
  iterationPaths: RalphIterationArtifactPaths;
  provenancePaths?: RalphProvenanceBundlePaths;
  metadata: IterationArtifactRegistryMetadata;
  doctrineProposalId?: string | null;
  /** Surfaces structurally-suspect registry loads (forwarded to the registry reader). */
  warn?: (message: string) => void;
}): Promise<void> {
  const iterationResultRelative = toRegistryRelative(input.artifactRootDir, input.iterationPaths.iterationResultPath);

  const candidates: RegistrableArtifact[] = [
    { path: input.iterationPaths.promptPath, type: 'prompt', retentionClass: 'iteration' },
    { path: input.iterationPaths.promptEvidencePath, type: 'prompt-evidence', retentionClass: 'iteration' },
    { path: input.iterationPaths.executionPlanPath, type: 'execution-plan', retentionClass: 'iteration' },
    { path: input.iterationPaths.cliInvocationPath, type: 'cli-invocation', retentionClass: 'iteration' },
    { path: input.iterationPaths.completionReportPath, type: 'completion-report', retentionClass: 'iteration' },
    { path: input.iterationPaths.iterationResultPath, type: 'iteration-result', retentionClass: 'iteration' },
    { path: input.iterationPaths.summaryPath, type: 'iteration-summary', retentionClass: 'iteration' },
    { path: input.iterationPaths.verifierSummaryPath, type: 'verifier-summary', retentionClass: 'iteration' },
    { path: input.iterationPaths.executionSummaryPath, type: 'execution-summary', retentionClass: 'iteration' },
    { path: input.iterationPaths.diffSummaryPath, type: 'diff-summary', retentionClass: 'iteration' },
    { path: input.iterationPaths.remediationPath, type: 'task-remediation', retentionClass: 'iteration' },
    // The iteration directory holds a *draft* copy of the proposal; the canonical,
    // operator-reviewable artifact lives under doctrine-proposals/<id>.json (below).
    // Distinct types keep `queryArtifacts({ type: 'doctrine-proposal' })` returning
    // only the canonical entry.
    { path: input.iterationPaths.doctrineProposalPath, type: 'doctrine-proposal-draft', retentionClass: 'iteration' }
  ];
  if (input.provenancePaths) {
    candidates.push(
      // Provenance bundles are derived from the iteration result they wrap.
      {
        path: input.provenancePaths.bundlePath,
        type: 'provenance-bundle',
        retentionClass: 'durable',
        related: { generatedFrom: iterationResultRelative }
      },
      { path: input.provenancePaths.summaryPath, type: 'provenance-summary', retentionClass: 'durable' }
    );
  }
  if (input.doctrineProposalId) {
    const canonical = resolveDoctrineProposalCanonicalPaths(input.artifactRootDir, input.doctrineProposalId);
    candidates.push({
      path: canonical.jsonPath,
      type: 'doctrine-proposal',
      retentionClass: 'durable',
      related: { generatedFrom: toRegistryRelative(input.artifactRootDir, input.iterationPaths.doctrineProposalPath) }
    });
  }

  const present = await Promise.all(
    candidates.map(async (candidate) => ({
      candidate,
      exists: await fs
        .access(candidate.path)
        .then(() => true)
        .catch(() => false)
    }))
  );

  const entries: ArtifactRegistryEntryInput[] = present
    .filter((item) => item.exists)
    .map(({ candidate }) => ({
      type: candidate.type,
      path: candidate.path,
      runId: input.metadata.runId,
      taskId: input.metadata.taskId,
      agentId: input.metadata.agentId,
      agentRole: input.metadata.agentRole,
      provider: input.metadata.provider,
      iteration: input.metadata.iteration,
      retentionClass: candidate.retentionClass,
      ...(candidate.related ? { related: candidate.related } : {})
    }));

  await registerArtifacts(input.artifactRootDir, entries, { warn: input.warn });
}

export interface RalphCleanupManifestPaths {
  jsonPath: string;
  markdownPath: string;
}

/** Resolves the cleanup-manifest artifact locations at the artifacts root. */
export function resolveCleanupManifestPaths(artifactRootDir: string): RalphCleanupManifestPaths {
  return {
    jsonPath: path.join(artifactRootDir, 'cleanup-manifest.json'),
    markdownPath: path.join(artifactRootDir, 'cleanup-manifest.md')
  };
}

/**
 * Persists a cleanup manifest (issue #72) at the artifacts root as JSON plus a
 * human-readable markdown summary. Written after the cleanup it describes, so the
 * manifest itself is never deleted by that cleanup (it is a root-level file, not
 * an iteration directory or bundle).
 */
export async function writeCleanupManifestArtifact(
  artifactRootDir: string,
  manifest: RalphCleanupManifest
): Promise<RalphCleanupManifestPaths> {
  const paths = resolveCleanupManifestPaths(artifactRootDir);
  await fs.mkdir(artifactRootDir, { recursive: true });
  await Promise.all([
    fs.writeFile(paths.jsonPath, stableJson(manifest), 'utf8'),
    fs.writeFile(paths.markdownPath, `${renderCleanupManifestMarkdown(manifest).trimEnd()}\n`, 'utf8')
  ]);
  return paths;
}

export async function writeWatchdogDiagnosticArtifact(input: {
  artifactRootDir: string;
  agentId: string;
  provenanceId: string;
  iteration: number;
  actions: RalphWatchdogAction[];
}): Promise<string> {
  const watchdogDir = path.join(input.artifactRootDir, 'watchdog');
  await fs.mkdir(watchdogDir, { recursive: true });

  const paddedIteration = String(input.iteration).padStart(3, '0');
  const fileName = `${input.agentId}-${paddedIteration}.json`;
  const filePath = path.join(watchdogDir, fileName);

  const artifact: RalphWatchdogDiagnosticArtifact = {
    schemaVersion: 1,
    kind: 'watchdogDiagnostic',
    agentId: input.agentId,
    provenanceId: input.provenanceId,
    iteration: input.iteration,
    triggeredAt: new Date().toISOString(),
    actionCount: input.actions.length,
    actions: input.actions
  };

  await fs.writeFile(filePath, stableJson(artifact), 'utf8');
  return filePath;
}
