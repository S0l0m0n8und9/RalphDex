import * as fs from 'fs/promises';
import * as path from 'path';
import { stableJson } from './integrity';
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
  RalphWatchdogAction
} from './types';

// Re-export submodules for backward compatibility.
export * from './artifactRendering';
export * from './artifactRetention';

export interface RalphIterationArtifactPaths {
  directory: string;
  promptPath: string;
  promptEvidencePath: string;
  executionPlanPath: string;
  cliInvocationPath: string;
  completionReportPath: string;
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
  latestProvenanceBundlePath: string;
  latestProvenanceSummaryPath: string;
  latestProvenanceFailurePath: string;
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
    latestProvenanceBundlePath: path.join(artifactRootDir, 'latest-provenance-bundle.json'),
    latestProvenanceSummaryPath: path.join(artifactRootDir, 'latest-provenance-summary.md'),
    latestProvenanceFailurePath: path.join(artifactRootDir, 'latest-provenance-failure.json')
  };
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
    diffSummary: input.diffSummary
  });
  const latestResult = latestResultFromIteration({
    result: input.result,
    paths: input.paths,
    diffSummary: input.diffSummary
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
