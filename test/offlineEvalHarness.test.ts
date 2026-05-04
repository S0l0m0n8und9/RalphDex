import * as path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { REQUIRED_DIMENSIONS, renderMarkdownSummary, runOfflineEvaluation } from './evals/offlineEvalHarness';

test('offline evaluation harness fixtures produce deterministic dimension-level outcomes', async () => {
  const fixturesDirectory = path.join(process.cwd(), 'test', 'evals', 'fixtures');
  const report = await runOfflineEvaluation(fixturesDirectory);

  assert.equal(report.harnessVersion, 'v1');
  assert.equal(report.fixturesEvaluated, 3);
  assert.equal(report.fixturesPassed, 2);
  assert.equal(report.fixturesFailed, 1);
  assert.equal(report.overallOutcome, 'fail');
  assert.equal(report.expectationMismatches, 0);
  assert.equal(report.expectationMatches, 3);

  const verifierFailFixture = report.results.find((result) => result.fixtureId === 'eval-failure-verifier-block');
  assert.ok(verifierFailFixture);
  assert.equal(verifierFailFixture.outcome, 'fail');
  assert.equal(verifierFailFixture.dimensionResults.verifierOutcome, 'fail');
  assert.equal(verifierFailFixture.dimensionResults.executionProfileEvidence, 'pass');
  assert.equal(verifierFailFixture.dimensionResults.reconciliationOutcome, 'fail');
  assert.ok(verifierFailFixture.findings.includes('fallback_retry_evidence_present'));
});

test('offline evaluation markdown summary remains compact and includes fixture outcomes', async () => {
  const fixturesDirectory = path.join(process.cwd(), 'test', 'evals', 'fixtures');
  const report = await runOfflineEvaluation(fixturesDirectory);
  const markdown = renderMarkdownSummary(report);

  assert.match(markdown, /# Offline Evaluation Harness Report/);
  assert.match(markdown, /\| Fixture \| Raw Outcome \| Expected \| Match \|/);

  for (const dimension of REQUIRED_DIMENSIONS) {
    for (const result of report.results) {
      assert.ok(result.dimensionResults[dimension] === 'pass' || result.dimensionResults[dimension] === 'fail');
    }
  }
});
