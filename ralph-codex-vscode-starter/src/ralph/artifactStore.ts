import * as fs from 'fs/promises';
import * as path from 'path';
import { stableJson } from './integrity';
import {
  RalphCliInvocation,
  RalphDiffSummary,
  RalphExecutionPlan,
  RalphIntegrityFailure,
  RalphIterationResult,
  RalphPersistedPreflightReport,
  RalphPreflightDiagnostic,
  RalphPreflightReport,
  RalphPromptEvidence,
  RalphPromptKind,
  RalphPromptTarget,
  RalphProvenanceBundle,
  RalphProvenanceTrustLevel,
  RalphVerificationResult
} from './types';

export interface RalphIterationArtifactPaths {
  directory: string;
  promptPath: string;
  promptEvidencePath: string;
  executionPlanPath: string;
  cliInvocationPath: string;
  stdoutPath: string;
  stderrPath: string;
  executionSummaryPath: string;
  verifierSummaryPath: string;
  diffSummaryPath: string;
  iterationResultPath: string;
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
  latestProvenanceBundlePath: string;
  latestProvenanceSummaryPath: string;
  latestProvenanceFailurePath: string;
}

export interface RalphProvenanceRetentionSummary {
  deletedBundleIds: string[];
  retainedBundleIds: string[];
  protectedBundleIds: string[];
}

export interface RalphPreflightArtifactPaths {
  directory: string;
  reportPath: string;
  summaryPath: string;
}

function formatOptional(value: string | null | undefined): string {
  return value && value.trim().length > 0 ? value : 'none';
}

function bulletList(values: string[]): string {
  return values.length > 0 ? values.map((value) => `- ${value}`).join('\n') : '- none';
}

function formatDiagnosticLine(diagnostic: RalphPreflightDiagnostic): string {
  return `- ${diagnostic.severity}: ${diagnostic.message}`;
}

function formatTrustLevel(value: RalphProvenanceTrustLevel): string {
  return value === 'verifiedCliExecution'
    ? 'verified CLI execution'
    : 'prepared prompt only';
}

function artifactReferenceLines(paths: RalphIterationArtifactPaths, diffSummary: RalphDiffSummary | null): string[] {
  const lines = [
    `- Prompt: ${paths.promptPath}`,
    `- Prompt evidence: ${paths.promptEvidencePath}`,
    `- Execution plan: ${paths.executionPlanPath}`,
    `- Execution summary: ${paths.executionSummaryPath}`,
    `- Verifier summary: ${paths.verifierSummaryPath}`,
    `- Iteration result: ${paths.iterationResultPath}`,
    `- Stdout: ${paths.stdoutPath}`,
    `- Stderr: ${paths.stderrPath}`,
    `- CLI invocation: ${paths.cliInvocationPath}`
  ];

  if (diffSummary) {
    lines.push(`- Diff summary: ${paths.diffSummaryPath}`);
  }
  if (diffSummary?.beforeStatusPath) {
    lines.push(`- Git status before: ${paths.gitStatusBeforePath}`);
  }
  if (diffSummary?.afterStatusPath) {
    lines.push(`- Git status after: ${paths.gitStatusAfterPath}`);
  }

  return lines;
}

function renderPreflightSummary(report: RalphPersistedPreflightReport): string {
  const headline = report.ready
    ? 'Preflight completed without blocking errors.'
    : 'Preflight blocked before Codex execution started.';
  const diagnostics = report.diagnostics.length > 0
    ? report.diagnostics.map(formatDiagnosticLine)
    : ['- ok'];

  return [
    `# Ralph Preflight ${report.iteration}`,
    '',
    `- Provenance ID: ${report.provenanceId}`,
    `- Trust level: ${formatTrustLevel(report.trustLevel)}`,
    `- Ready: ${report.ready ? 'yes' : 'no'}`,
    `- Prompt kind: ${report.promptKind}`,
    `- Prompt target: ${report.promptTarget}`,
    `- Selected task: ${formatOptional(report.selectedTaskId)}${report.selectedTaskTitle ? ` - ${report.selectedTaskTitle}` : ''}`,
    `- Validation: ${formatOptional(report.validationCommand)}`,
    `- Summary: ${report.summary}`,
    `- Report: ${report.reportPath}`,
    '',
    headline,
    '',
    '## Diagnostics',
    ...diagnostics
  ].join('\n');
}

function renderIterationSummary(input: {
  result: RalphIterationResult;
  paths: RalphIterationArtifactPaths;
  verifiers: RalphVerificationResult[];
  diffSummary: RalphDiffSummary | null;
}): string {
  const { result, paths, diffSummary, verifiers } = input;
  const verifierLines = verifiers.map((verifier) => {
    const location = verifier.artifactPath ? ` (${verifier.artifactPath})` : '';
    return `${verifier.verifier}: ${verifier.status} - ${verifier.summary}${location}`;
  });
  const diffLines = diffSummary
    ? [
      `- Summary: ${diffSummary.summary}`,
      `- Git available: ${diffSummary.gitAvailable ? 'yes' : 'no'}`,
      `- Changed files: ${diffSummary.changedFileCount}`,
      `- Relevant changed files: ${diffSummary.relevantChangedFileCount}`,
      `- Suggested checkpoint ref: ${diffSummary.suggestedCheckpointRef ?? 'none'}`
    ]
    : ['- none'];

  return [
    `# Ralph Iteration ${result.iteration}`,
    '',
    '## Outcome',
    `- Provenance ID: ${formatOptional(result.provenanceId)}`,
    `- Selected task: ${formatOptional(result.selectedTaskId)}${result.selectedTaskTitle ? ` - ${result.selectedTaskTitle}` : ''}`,
    `- Prompt kind: ${result.promptKind}`,
    `- Target mode: ${result.executionIntegrity?.promptTarget ?? 'unknown'}`,
    `- Template: ${result.executionIntegrity?.templatePath ?? 'unknown'}`,
    `- Execution: ${result.executionStatus}`,
    `- Execution message: ${result.execution.message ?? 'none'}`,
    `- Verification: ${result.verificationStatus}`,
    `- Classification: ${result.completionClassification} (selected task)`,
    `- Backlog remaining: ${result.backlog.remainingTaskCount}`,
    `- Next actionable task available: ${result.backlog.actionableTaskAvailable ? 'yes' : 'no'}`,
    `- Follow-up action: ${result.followUpAction}`,
    `- Stop reason: ${formatOptional(result.stopReason)}`,
    `- Summary: ${result.summary}`,
    '',
    '## Execution Integrity',
    `- Plan: ${result.executionIntegrity?.executionPlanPath ?? 'none'}`,
    `- Plan hash: ${result.executionIntegrity?.executionPlanHash ?? 'none'}`,
    `- Prompt artifact: ${result.executionIntegrity?.promptArtifactPath ?? 'none'}`,
    `- Prompt hash: ${result.executionIntegrity?.promptHash ?? 'none'}`,
    `- Payload matched rendered artifact: ${result.executionIntegrity?.executionPayloadMatched == null
      ? 'not executed'
      : result.executionIntegrity.executionPayloadMatched ? 'yes' : 'no'}`,
    `- CLI invocation: ${result.executionIntegrity?.cliInvocationPath ?? 'none'}`,
    `- Integrity issue: ${result.executionIntegrity?.mismatchReason ?? 'none'}`,
    '',
    '## Validation',
    `- Primary command: ${formatOptional(result.verification.primaryCommand)}`,
    `- Failure signature: ${formatOptional(result.verification.validationFailureSignature)}`,
    verifierLines.length > 0 ? bulletList(verifierLines) : '- none',
    '',
    '## Diff',
    ...diffLines,
    '',
    '## Artifact Paths',
    ...artifactReferenceLines(paths, diffSummary),
    '',
    '## Signals',
    `- No-progress signals: ${result.noProgressSignals.join(', ') || 'none'}`,
    `- Warnings: ${result.warnings.join(' | ') || 'none'}`,
    `- Errors: ${result.errors.join(' | ') || 'none'}`
  ].join('\n');
}

function renderIntegrityFailureSummary(failure: RalphIntegrityFailure): string {
  return [
    `# Ralph Provenance Failure ${failure.iteration}`,
    '',
    `- Provenance ID: ${failure.provenanceId}`,
    `- Stage: ${failure.stage}`,
    `- Prompt kind: ${failure.promptKind}`,
    `- Prompt target: ${failure.promptTarget}`,
    `- Trust level: ${formatTrustLevel(failure.trustLevel)}`,
    `- Summary: ${failure.summary}`,
    `- Message: ${failure.message}`,
    '',
    '## Expected vs Actual',
    `- Expected execution plan hash: ${failure.expectedExecutionPlanHash ?? 'none'}`,
    `- Actual execution plan hash: ${failure.actualExecutionPlanHash ?? 'none'}`,
    `- Expected prompt hash: ${failure.expectedPromptHash ?? 'none'}`,
    `- Actual prompt hash: ${failure.actualPromptHash ?? 'none'}`,
    `- Expected payload hash: ${failure.expectedPayloadHash ?? 'none'}`,
    `- Actual payload hash: ${failure.actualPayloadHash ?? 'none'}`,
    '',
    '## Artifact Paths',
    `- Iteration artifact dir: ${failure.artifactDir}`,
    `- Execution plan: ${failure.executionPlanPath ?? 'none'}`,
    `- Prompt artifact: ${failure.promptArtifactPath ?? 'none'}`,
    `- CLI invocation: ${failure.cliInvocationPath ?? 'none'}`
  ].join('\n');
}

function renderProvenanceSummary(bundle: RalphProvenanceBundle): string {
  return [
    `# Ralph Provenance ${bundle.provenanceId}`,
    '',
    `- Iteration: ${bundle.iteration}`,
    `- Status: ${bundle.status}`,
    `- Trust level: ${formatTrustLevel(bundle.trustLevel)}`,
    `- Prompt kind: ${bundle.promptKind}`,
    `- Prompt target: ${bundle.promptTarget}`,
    `- Selected task: ${formatOptional(bundle.selectedTaskId)}${bundle.selectedTaskTitle ? ` - ${bundle.selectedTaskTitle}` : ''}`,
    `- Summary: ${bundle.summary}`,
    '',
    '## Integrity',
    `- Execution plan hash: ${bundle.executionPlanHash ?? 'none'}`,
    `- Prompt hash: ${bundle.promptHash ?? 'none'}`,
    `- Payload matched rendered artifact: ${bundle.executionPayloadMatched == null
      ? 'not executed'
      : bundle.executionPayloadMatched ? 'yes' : 'no'}`,
    `- Integrity issue: ${bundle.mismatchReason ?? 'none'}`,
    '',
    '## Bundle Files',
    `- Bundle manifest: ${bundle.bundleDir ? path.join(bundle.bundleDir, 'provenance-bundle.json') : 'none'}`,
    `- Preflight report: ${bundle.preflightReportPath}`,
    `- Preflight summary: ${bundle.preflightSummaryPath}`,
    `- Prompt artifact: ${bundle.promptArtifactPath ?? 'none'}`,
    `- Prompt evidence: ${bundle.promptEvidencePath ?? 'none'}`,
    `- Execution plan: ${bundle.executionPlanPath ?? 'none'}`,
    `- CLI invocation: ${bundle.cliInvocationPath ?? 'none'}`,
    `- Iteration result: ${bundle.iterationResultPath ?? 'none'}`,
    `- Provenance failure: ${bundle.provenanceFailurePath ?? 'none'}`,
    '',
    '## Canonical Iteration Artifacts',
    `- Iteration artifact dir: ${bundle.artifactDir}`
  ].join('\n');
}

function latestResultFromIteration(input: {
  result: RalphIterationResult;
  paths: RalphIterationArtifactPaths;
  diffSummary: RalphDiffSummary | null;
}): Record<string, unknown> {
  return {
    provenanceId: input.result.provenanceId ?? null,
    iteration: input.result.iteration,
    selectedTaskId: input.result.selectedTaskId,
    selectedTaskTitle: input.result.selectedTaskTitle,
    promptKind: input.result.promptKind,
    promptTarget: input.result.executionIntegrity?.promptTarget ?? null,
    templatePath: input.result.executionIntegrity?.templatePath ?? null,
    executionStatus: input.result.executionStatus,
    executionMessage: input.result.execution.message ?? null,
    verificationStatus: input.result.verificationStatus,
    completionClassification: input.result.completionClassification,
    backlog: input.result.backlog,
    followUpAction: input.result.followUpAction,
    stopReason: input.result.stopReason,
    summary: input.result.summary,
    artifactDir: input.result.artifactDir,
    summaryPath: input.paths.summaryPath,
    promptPath: input.paths.promptPath,
    promptEvidencePath: input.paths.promptEvidencePath,
    executionPlanPath: input.result.executionIntegrity?.executionPlanPath ?? input.paths.executionPlanPath,
    cliInvocationPath: input.result.executionIntegrity?.cliInvocationPath,
    promptArtifactPath: input.result.executionIntegrity?.promptArtifactPath ?? input.paths.promptPath,
    promptHash: input.result.executionIntegrity?.promptHash ?? null,
    executionPlanHash: input.result.executionIntegrity?.executionPlanHash ?? null,
    executionPayloadMatched: input.result.executionIntegrity?.executionPayloadMatched ?? null,
    executionSummaryPath: input.paths.executionSummaryPath,
    verifierSummaryPath: input.paths.verifierSummaryPath,
    iterationResultPath: input.paths.iterationResultPath,
    diffSummaryPath: input.diffSummary ? input.paths.diffSummaryPath : null,
    stdoutPath: input.paths.stdoutPath,
    stderrPath: input.paths.stderrPath,
    warnings: input.result.warnings,
    errors: input.result.errors
  };
}

export function resolveIterationArtifactPaths(artifactRootDir: string, iteration: number): RalphIterationArtifactPaths {
  const directory = path.join(artifactRootDir, `iteration-${String(iteration).padStart(3, '0')}`);

  return {
    directory,
    promptPath: path.join(directory, 'prompt.md'),
    promptEvidencePath: path.join(directory, 'prompt-evidence.json'),
    executionPlanPath: path.join(directory, 'execution-plan.json'),
    cliInvocationPath: path.join(directory, 'cli-invocation.json'),
    stdoutPath: path.join(directory, 'stdout.log'),
    stderrPath: path.join(directory, 'stderr.log'),
    executionSummaryPath: path.join(directory, 'execution-summary.json'),
    verifierSummaryPath: path.join(directory, 'verifier-summary.json'),
    diffSummaryPath: path.join(directory, 'diff-summary.json'),
    iterationResultPath: path.join(directory, 'iteration-result.json'),
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

async function readJsonRecord(target: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await fs.readFile(target, 'utf8');
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function provenanceIdFromRecord(record: Record<string, unknown> | null): string | null {
  return typeof record?.provenanceId === 'string' && record.provenanceId.trim().length > 0
    ? record.provenanceId
    : null;
}

async function resolveProtectedBundleIds(artifactRootDir: string): Promise<Set<string>> {
  const latestPaths = resolveLatestArtifactPaths(artifactRootDir);
  const records = await Promise.all([
    readJsonRecord(latestPaths.latestResultPath),
    readJsonRecord(latestPaths.latestPreflightReportPath),
    readJsonRecord(latestPaths.latestPromptEvidencePath),
    readJsonRecord(latestPaths.latestExecutionPlanPath),
    readJsonRecord(latestPaths.latestCliInvocationPath),
    readJsonRecord(latestPaths.latestProvenanceBundlePath),
    readJsonRecord(latestPaths.latestProvenanceFailurePath)
  ]);

  return new Set(records
    .map((record) => provenanceIdFromRecord(record))
    .filter((value): value is string => Boolean(value)));
}

export async function cleanupProvenanceBundles(input: {
  artifactRootDir: string;
  retentionCount: number;
}): Promise<RalphProvenanceRetentionSummary> {
  const runsDir = path.join(input.artifactRootDir, 'runs');
  if (input.retentionCount <= 0) {
    return {
      deletedBundleIds: [],
      retainedBundleIds: [],
      protectedBundleIds: []
    };
  }

  const entries = await fs.readdir(runsDir, { withFileTypes: true }).catch(() => []);
  const bundleIds = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('run-'))
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left));
  const protectedIds = await resolveProtectedBundleIds(input.artifactRootDir);
  const retainedIds = new Set(bundleIds.slice(0, input.retentionCount));
  protectedIds.forEach((bundleId) => retainedIds.add(bundleId));

  const deletedBundleIds: string[] = [];
  for (const bundleId of bundleIds.slice(input.retentionCount)) {
    if (retainedIds.has(bundleId)) {
      continue;
    }

    await fs.rm(path.join(runsDir, bundleId), { recursive: true, force: true });
    deletedBundleIds.push(bundleId);
  }

  return {
    deletedBundleIds,
    retainedBundleIds: bundleIds.filter((bundleId) => retainedIds.has(bundleId)),
    protectedBundleIds: Array.from(protectedIds).sort()
  };
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
  provenanceId: string;
  iteration: number;
  promptKind: RalphPromptKind;
  promptTarget: RalphPromptTarget;
  trustLevel: RalphProvenanceTrustLevel;
  report: RalphPreflightReport;
  selectedTaskId: string | null;
  selectedTaskTitle: string | null;
  validationCommand: string | null;
}): Promise<{ latestPaths: RalphLatestArtifactPaths; persistedReport: RalphPersistedPreflightReport; humanSummary: string }> {
  await fs.mkdir(input.paths.directory, { recursive: true });

  const latestPaths = resolveLatestArtifactPaths(input.artifactRootDir);
  const persistedReport: RalphPersistedPreflightReport = {
    schemaVersion: 1,
    kind: 'preflight',
    provenanceId: input.provenanceId,
    iteration: input.iteration,
    promptKind: input.promptKind,
    promptTarget: input.promptTarget,
    trustLevel: input.trustLevel,
    ready: input.report.ready,
    summary: input.report.summary,
    selectedTaskId: input.selectedTaskId,
    selectedTaskTitle: input.selectedTaskTitle,
    validationCommand: input.validationCommand,
    artifactDir: input.paths.directory,
    reportPath: input.paths.reportPath,
    summaryPath: input.paths.summaryPath,
    blocked: !input.report.ready,
    createdAt: new Date().toISOString(),
    diagnostics: input.report.diagnostics
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
  stdout: string;
  stderr: string;
  executionSummary: unknown;
  verifierSummary: RalphVerificationResult[];
  diffSummary: RalphDiffSummary | null;
  result: RalphIterationResult;
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
    fs.writeFile(input.paths.stdoutPath, input.stdout, 'utf8'),
    fs.writeFile(input.paths.stderrPath, input.stderr, 'utf8'),
    fs.writeFile(input.paths.executionSummaryPath, stableJson(input.executionSummary), 'utf8'),
    fs.writeFile(input.paths.verifierSummaryPath, stableJson(input.verifierSummary), 'utf8'),
    fs.writeFile(input.paths.iterationResultPath, stableJson(input.result), 'utf8'),
    fs.writeFile(input.paths.summaryPath, `${humanSummary.trimEnd()}\n`, 'utf8'),
    fs.writeFile(latestPaths.latestResultPath, stableJson(latestResult), 'utf8'),
    fs.writeFile(latestPaths.latestSummaryPath, `${humanSummary.trimEnd()}\n`, 'utf8'),
    fs.writeFile(latestPaths.latestPromptPath, `${input.prompt.trimEnd()}\n`, 'utf8'),
    fs.writeFile(latestPaths.latestPromptEvidencePath, stableJson(input.promptEvidence), 'utf8'),
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
  bundle: RalphProvenanceBundle;
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

  const latestPaths = resolveLatestArtifactPaths(input.artifactRootDir);
  const summary = renderProvenanceSummary(input.bundle);
  const writes: Promise<unknown>[] = [
    fs.writeFile(input.paths.bundlePath, stableJson(input.bundle), 'utf8'),
    fs.writeFile(input.paths.summaryPath, `${summary.trimEnd()}\n`, 'utf8'),
    fs.writeFile(input.paths.preflightReportPath, stableJson(input.preflightReport), 'utf8'),
    fs.writeFile(input.paths.preflightSummaryPath, `${input.preflightSummary.trimEnd()}\n`, 'utf8'),
    fs.writeFile(latestPaths.latestProvenanceBundlePath, stableJson(input.bundle), 'utf8'),
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
