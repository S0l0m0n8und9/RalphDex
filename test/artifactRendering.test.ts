import assert from 'node:assert/strict';
import test from 'node:test';
import { artifactReferenceLines, renderIterationSummary } from '../src/ralph/artifactRendering';
import type { RalphIterationArtifactPaths } from '../src/ralph/artifactStore';
import type { RalphIterationResult } from '../src/ralph/types';

function makePaths(): RalphIterationArtifactPaths {
  const base = '/workspace/.ralph/artifacts/iteration-001';
  return {
    directory: base,
    promptPath: `${base}/prompt.md`,
    promptEvidencePath: `${base}/prompt-evidence.json`,
    executionPlanPath: `${base}/execution-plan.json`,
    cliInvocationPath: `${base}/cli-invocation.json`,
    completionReportPath: `${base}/completion-report.json`,
    doctrineProposalPath: `${base}/doctrine-proposal.json`,
    stdoutPath: `${base}/stdout.txt`,
    stderrPath: `${base}/stderr.txt`,
    executionSummaryPath: `${base}/execution-summary.json`,
    verifierSummaryPath: `${base}/verifier-summary.json`,
    diffSummaryPath: `${base}/diff-summary.json`,
    iterationResultPath: `${base}/iteration-result.json`,
    remediationPath: `${base}/remediation.json`,
    summaryPath: `${base}/summary.md`,
    gitStatusBeforePath: `${base}/git-status-before.txt`,
    gitStatusAfterPath: `${base}/git-status-after.txt`
  };
}

function makeResult(overrides: Partial<RalphIterationResult> = {}): RalphIterationResult {
  return {
    schemaVersion: 1,
    agentId: 'test-agent',
    provenanceId: 'prov-001',
    iteration: 1,
    selectedTaskId: 'T1',
    selectedTaskTitle: 'Test task',
    promptKind: 'iteration',
    promptPath: '/workspace/.ralph/prompts/iteration-001.prompt.md',
    artifactDir: '/workspace/.ralph/artifacts/iteration-001',
    adapterUsed: 'cliExec',
    executionIntegrity: null,
    executionStatus: 'succeeded',
    verificationStatus: 'passed',
    completionClassification: 'complete',
    followUpAction: 'stop',
    startedAt: '2026-01-01T00:00:00Z',
    finishedAt: '2026-01-01T00:10:00Z',
    phaseTimestamps: {
      inspectStartedAt: '2026-01-01T00:00:00Z',
      inspectFinishedAt: '2026-01-01T00:01:00Z',
      taskSelectedAt: '2026-01-01T00:01:00Z',
      promptGeneratedAt: '2026-01-01T00:02:00Z',
      resultCollectedAt: '2026-01-01T00:07:00Z',
      verificationFinishedAt: '2026-01-01T00:09:00Z',
      classifiedAt: '2026-01-01T00:09:30Z'
    },
    summary: 'Task done.',
    warnings: [],
    errors: [],
    execution: { exitCode: 0 },
    verification: {
      taskValidationHint: null,
      effectiveValidationCommand: null,
      normalizedValidationCommandFrom: null,
      primaryCommand: null,
      validationFailureSignature: null,
      verifiers: []
    },
    backlog: { remainingTaskCount: 0, actionableTaskAvailable: false },
    diffSummary: null,
    noProgressSignals: [],
    remediation: null,
    completionReportStatus: 'applied',
    reconciliationWarnings: [],
    stopReason: 'task_marked_complete',
    ...overrides
  };
}

// --- Fix 5: remediation path null handling ---

test('artifactReferenceLines shows none for remediation when hasRemediation is false', () => {
  const lines = artifactReferenceLines(makePaths(), null, false);
  const remediationLine = lines.find((l) => l.includes('Remediation proposal'));
  assert.ok(remediationLine, 'should have a remediation proposal line');
  assert.match(remediationLine ?? '', /Remediation proposal: none/);
});

test('artifactReferenceLines shows none for remediation when hasRemediation is undefined', () => {
  const lines = artifactReferenceLines(makePaths(), null);
  const remediationLine = lines.find((l) => l.includes('Remediation proposal'));
  assert.ok(remediationLine, 'should have a remediation proposal line');
  assert.match(remediationLine ?? '', /Remediation proposal: none/);
});

test('artifactReferenceLines shows actual path when hasRemediation is true', () => {
  const paths = makePaths();
  const lines = artifactReferenceLines(paths, null, true);
  const remediationLine = lines.find((l) => l.includes('Remediation proposal'));
  assert.ok(remediationLine, 'should have a remediation proposal line');
  assert.match(remediationLine ?? '', /remediation\.json/);
  assert.doesNotMatch(remediationLine ?? '', /: none/);
});

test('renderIterationSummary shows none for remediation artifact when result.remediation is null', () => {
  const result = makeResult({ remediation: null });
  const paths = makePaths();
  const rendered = renderIterationSummary({ result, paths, verifiers: [], diffSummary: null });

  // In Artifact Paths section: should show "none" not the actual path
  assert.match(rendered, /Remediation proposal: none/);
  assert.doesNotMatch(rendered, /Remediation proposal: .*remediation\.json/);
});

test('renderIterationSummary shows remediation path when result.remediation is present', () => {
  const result = makeResult({
    remediation: {
      trigger: 'repeated_no_progress',
      taskId: 'T1',
      attemptCount: 3,
      action: 'decompose_task',
      humanReviewRecommended: false,
      summary: 'Decompose the task',
      evidence: []
    }
  });
  const paths = makePaths();
  const rendered = renderIterationSummary({ result, paths, verifiers: [], diffSummary: null });

  assert.match(rendered, /remediation\.json/);
});
