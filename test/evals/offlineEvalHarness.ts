import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export const REQUIRED_DIMENSIONS = [
  'taskSelectionCorrectness',
  'promptEvidenceCompleteness',
  'executionProfileEvidence',
  'reconciliationOutcome',
  'verifierOutcome',
  'artifactConsistency'
] as const;

export type EvaluationDimension = typeof REQUIRED_DIMENSIONS[number];
export type DimensionOutcome = 'pass' | 'fail';
export type FixtureOutcome = 'pass' | 'fail';

export interface OfflineEvalFixture {
  id: string;
  description: string;
  inputs: Record<string, unknown>;
  expected: {
    outcome: FixtureOutcome;
    dimensionResults: Record<EvaluationDimension, DimensionOutcome>;
    requiredFindings: string[];
  };
}

export interface FixtureResult {
  fixtureId: string;
  outcome: FixtureOutcome;
  expectedOutcome: FixtureOutcome;
  expectationMatched: boolean;
  dimensionResults: Record<EvaluationDimension, DimensionOutcome>;
  findings: string[];
}

export interface OfflineEvalReport {
  harnessVersion: 'v1';
  ranAt: string;
  fixturesEvaluated: number;
  fixturesPassed: number;
  fixturesFailed: number;
  overallOutcome: FixtureOutcome;
  expectationMatches: number;
  expectationMismatches: number;
  results: FixtureResult[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toIsoTime(value: unknown): number | null {
  if (!isNonEmptyString(value)) {
    return null;
  }

  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function getDimensionResults(
  fixture: OfflineEvalFixture,
  findings: string[]
): Record<EvaluationDimension, DimensionOutcome> {
  const inputs = fixture.inputs;
  const task = isObject(inputs.task) ? inputs.task : {};
  const promptEvidence = isObject(inputs.promptEvidence) ? inputs.promptEvidence : {};
  const executionProfile = isObject(inputs.executionProfile) ? inputs.executionProfile : {};
  const completionReport = isObject(inputs.completionReport) ? inputs.completionReport : {};
  const verifierSummary = isObject(inputs.verifierSummary) ? inputs.verifierSummary : {};
  const artifactIndex = isObject(inputs.artifactIndex) ? inputs.artifactIndex : {};

  const taskSelectionCorrect =
    isNonEmptyString(task.id) &&
    task.id === completionReport.selectedTaskId &&
    isNonEmptyString(completionReport.requestedStatus);
  if (!taskSelectionCorrect) {
    findings.push('task_selection_mismatch');
  }

  const doctrineContext = isObject(promptEvidence.doctrineContext) ? promptEvidence.doctrineContext : null;
  const doctrineIncluded = doctrineContext
    && Array.isArray(doctrineContext.includedFiles)
    && Array.isArray(doctrineContext.omittedFiles)
    && doctrineContext.includedCount === doctrineContext.includedFiles.length
    && doctrineContext.omittedCount === doctrineContext.omittedFiles.length
    && typeof doctrineContext.truncated === 'boolean';
  if (doctrineIncluded) {
    findings.push('doctrine_context_present');
  }

  const promptEvidenceComplete =
    isNonEmptyString(promptEvidence.promptKind) &&
    isNonEmptyString(promptEvidence.promptPath) &&
    isNonEmptyString(promptEvidence.promptHash) &&
    (doctrineContext === null || doctrineIncluded);
  if (!promptEvidenceComplete) {
    findings.push('prompt_evidence_incomplete');
  }

  const startedAt = toIsoTime(executionProfile.startedAt);
  const endedAt = toIsoTime(executionProfile.endedAt);
  const attempts = toArray(executionProfile.attempts);
  const attemptsValid = attempts.length > 0 && attempts.every((entry) => {
    if (!isObject(entry)) {
      return false;
    }

    return typeof entry.attempt === 'number' && isNonEmptyString(entry.status);
  });
  if (attempts.length > 1 || executionProfile.fallbackUsed === true) {
    findings.push('fallback_retry_evidence_present');
  }
  const executionProfileValid =
    isNonEmptyString(executionProfile.provider) &&
    isNonEmptyString(executionProfile.commandPath) &&
    startedAt !== null &&
    endedAt !== null &&
    startedAt <= endedAt &&
    attemptsValid;
  if (!executionProfileValid) {
    findings.push('execution_profile_incomplete');
  }

  const verifierBlocking = verifierSummary.blocking === true || verifierSummary.outcome === 'fail';
  const reconciledDone = completionReport.requestedStatus === 'done';
  const reconciliationValid = !(verifierBlocking && reconciledDone);
  if (!reconciliationValid) {
    findings.push('reconciliation_conflict_with_blocking_verifier');
  }

  const verifierOutcomePass = verifierSummary.outcome === 'pass' && verifierSummary.blocking !== true;
  if (!verifierOutcomePass) {
    findings.push('verifier_blocking_or_failed');
  }

  const latestIterationId = artifactIndex.latestIterationId;
  const references = toArray(artifactIndex.references);
  const referencesValid = references.length > 0 && references.every((entry) => {
    if (!isObject(entry)) {
      return false;
    }

    return isNonEmptyString(entry.path) && entry.exists === true && entry.iterationId === latestIterationId;
  });
  const artifactsValid = typeof latestIterationId === 'number' && referencesValid;
  if (!artifactsValid) {
    findings.push('artifact_reference_mismatch');
  }

  return {
    taskSelectionCorrectness: taskSelectionCorrect ? 'pass' : 'fail',
    promptEvidenceCompleteness: promptEvidenceComplete ? 'pass' : 'fail',
    executionProfileEvidence: executionProfileValid ? 'pass' : 'fail',
    reconciliationOutcome: reconciliationValid ? 'pass' : 'fail',
    verifierOutcome: verifierOutcomePass ? 'pass' : 'fail',
    artifactConsistency: artifactsValid ? 'pass' : 'fail'
  };
}

function assertFixtureContract(fixture: OfflineEvalFixture): string[] {
  const findings: string[] = [];
  const mandatoryInputKeys = [
    'task',
    'promptEvidence',
    'executionProfile',
    'completionReport',
    'verifierSummary',
    'artifactIndex'
  ];

  if (!isNonEmptyString(fixture.id)) {
    findings.push('fixture_id_missing');
  }

  for (const key of mandatoryInputKeys) {
    if (!(key in fixture.inputs)) {
      findings.push(`fixture_input_missing:${key}`);
    }
  }

  for (const dimension of REQUIRED_DIMENSIONS) {
    const expectedValue = fixture.expected.dimensionResults[dimension];
    if (expectedValue !== 'pass' && expectedValue !== 'fail') {
      findings.push(`fixture_expected_dimension_invalid:${dimension}`);
    }
  }

  return findings;
}

function evaluateFixture(fixture: OfflineEvalFixture): FixtureResult {
  const findings: string[] = [];
  const contractFindings = assertFixtureContract(fixture);
  findings.push(...contractFindings);

  const dimensionResults = getDimensionResults(fixture, findings);
  const hasFailDimension = REQUIRED_DIMENSIONS.some((dimension) => dimensionResults[dimension] === 'fail');
  const missingRequiredFinding = fixture.expected.requiredFindings.some(
    (requiredFinding) => !findings.includes(requiredFinding)
  );
  const outcome: FixtureOutcome = contractFindings.length > 0 || hasFailDimension || missingRequiredFinding ? 'fail' : 'pass';

  for (const requiredFinding of fixture.expected.requiredFindings) {
    if (!findings.includes(requiredFinding)) {
      findings.push(`required_finding_missing:${requiredFinding}`);
    }
  }

  const dimensionExpectationMatched = REQUIRED_DIMENSIONS.every(
    (dimension) => dimensionResults[dimension] === fixture.expected.dimensionResults[dimension]
  );
  const expectationMatched = outcome === fixture.expected.outcome && dimensionExpectationMatched;

  return {
    fixtureId: fixture.id,
    outcome,
    expectedOutcome: fixture.expected.outcome,
    expectationMatched,
    dimensionResults,
    findings
  };
}

async function readFixtureFile(filePath: string): Promise<OfflineEvalFixture> {
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw) as OfflineEvalFixture;
  return parsed;
}

export async function loadFixtures(fixturesDirectory: string): Promise<OfflineEvalFixture[]> {
  const entries = await fs.readdir(fixturesDirectory, { withFileTypes: true });
  const fixtureFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.fixture.json'))
    .map((entry) => path.join(fixturesDirectory, entry.name))
    .sort((left, right) => left.localeCompare(right));

  const fixtures: OfflineEvalFixture[] = [];
  for (const fixtureFile of fixtureFiles) {
    fixtures.push(await readFixtureFile(fixtureFile));
  }
  return fixtures;
}

export async function runOfflineEvaluation(fixturesDirectory: string): Promise<OfflineEvalReport> {
  const fixtures = await loadFixtures(fixturesDirectory);
  const results = fixtures.map((fixture) => evaluateFixture(fixture));
  const fixturesPassed = results.filter((result) => result.outcome === 'pass').length;
  const fixturesFailed = results.length - fixturesPassed;
  const expectationMatches = results.filter((result) => result.expectationMatched).length;
  const expectationMismatches = results.length - expectationMatches;

  return {
    harnessVersion: 'v1',
    ranAt: new Date().toISOString(),
    fixturesEvaluated: results.length,
    fixturesPassed,
    fixturesFailed,
    overallOutcome: fixturesFailed === 0 ? 'pass' : 'fail',
    expectationMatches,
    expectationMismatches,
    results
  };
}

export function renderMarkdownSummary(report: OfflineEvalReport): string {
  const lines: string[] = [];
  lines.push('# Offline Evaluation Harness Report');
  lines.push('');
  lines.push(`- Harness version: ${report.harnessVersion}`);
  lines.push(`- Ran at: ${report.ranAt}`);
  lines.push(`- Fixtures: ${report.fixturesEvaluated} (${report.fixturesPassed} pass / ${report.fixturesFailed} fail)`);
  lines.push(`- Raw outcome: ${report.overallOutcome}`);
  lines.push(`- Expectation matches: ${report.expectationMatches}`);
  lines.push(`- Expectation mismatches: ${report.expectationMismatches}`);
  lines.push('');
  lines.push('| Fixture | Raw Outcome | Expected | Match |');
  lines.push('| --- | --- | --- | --- |');

  for (const result of report.results) {
    lines.push(`| ${result.fixtureId} | ${result.outcome} | ${result.expectedOutcome} | ${result.expectationMatched ? 'yes' : 'no'} |`);
  }

  return `${lines.join('\n')}\n`;
}
