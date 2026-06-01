import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildErrorReport,
  buildIterationReport,
  categoryForError,
  categoryForIterationResult,
  exitCodeForCategory,
  redactShimText,
  SHIM_EXIT_CODES,
  SHIM_REPORT_SCHEMA_VERSION,
  ShimError
} from '../src/shim/contract';
import type { RalphIterationResult } from '../src/ralph/types';

function makeResult(overrides: Partial<RalphIterationResult> = {}): RalphIterationResult {
  return {
    schemaVersion: 1,
    iteration: 1,
    selectedTaskId: 'T1',
    selectedTaskTitle: 'Example task',
    promptKind: 'bootstrap',
    promptPath: '/tmp/prompt.md',
    artifactDir: '/tmp/artifacts',
    adapterUsed: 'codex',
    executionIntegrity: null,
    executionStatus: 'succeeded',
    verificationStatus: 'passed',
    completionClassification: 'complete',
    followUpAction: 'continue_next_task',
    startedAt: '2026-01-01T00:00:00.000Z',
    finishedAt: '2026-01-01T00:00:01.000Z',
    phaseTimestamps: {
      inspectStartedAt: '2026-01-01T00:00:00.000Z',
      inspectFinishedAt: '2026-01-01T00:00:00.000Z',
      taskSelectedAt: '2026-01-01T00:00:00.000Z',
      promptGeneratedAt: '2026-01-01T00:00:00.000Z',
      resultCollectedAt: '2026-01-01T00:00:00.000Z',
      verificationFinishedAt: '2026-01-01T00:00:00.000Z',
      classifiedAt: '2026-01-01T00:00:00.000Z'
    },
    summary: 'ok',
    warnings: [],
    errors: [],
    execution: {} as RalphIterationResult['execution'],
    verification: {} as RalphIterationResult['verification'],
    backlog: {} as RalphIterationResult['backlog'],
    diffSummary: null,
    noProgressSignals: [],
    remediation: null,
    stopReason: null,
    ...overrides
  };
}

test('exit codes are stable and distinct per failure category', () => {
  assert.deepEqual(SHIM_EXIT_CODES, {
    success: 0,
    internal: 1,
    config: 2,
    preflight: 3,
    provider: 4,
    validation: 5
  });
  const codes = Object.values(SHIM_EXIT_CODES);
  assert.equal(new Set(codes).size, codes.length, 'exit codes must be distinct');
  assert.equal(exitCodeForCategory('validation'), 5);
});

test('categoryForIterationResult distinguishes provider, validation, preflight, and success', () => {
  assert.equal(categoryForIterationResult(makeResult()), 'success');
  assert.equal(
    categoryForIterationResult(makeResult({ executionStatus: 'failed' })),
    'provider'
  );
  assert.equal(
    categoryForIterationResult(makeResult({ verificationStatus: 'failed' })),
    'validation'
  );
  assert.equal(
    categoryForIterationResult(makeResult({ executionStatus: 'skipped' })),
    'preflight'
  );
  // Provider failure dominates a co-occurring verification failure.
  assert.equal(
    categoryForIterationResult(
      makeResult({ executionStatus: 'failed', verificationStatus: 'failed' })
    ),
    'provider'
  );
});

test('a blocked-but-executed task is still a success exit (run did its job)', () => {
  const report = buildIterationReport(
    makeResult({ completionClassification: 'blocked', stopReason: 'human_review_needed' })
  );
  assert.equal(report.ok, true);
  assert.equal(report.exitCode, 0);
  assert.equal(report.completionClassification, 'blocked');
  assert.equal(report.stopReason, 'human_review_needed');
});

test('buildIterationReport carries schema version and key result fields', () => {
  const report = buildIterationReport(makeResult({ verificationStatus: 'failed' }));
  assert.equal(report.schemaVersion, SHIM_REPORT_SCHEMA_VERSION);
  assert.equal(report.ok, false);
  assert.equal(report.category, 'validation');
  assert.equal(report.exitCode, 5);
  assert.equal(report.iteration, 1);
  assert.equal(report.selectedTaskId, 'T1');
  assert.equal(report.executionStatus, 'succeeded');
});

test('reports redact secrets from free-text fields', () => {
  const report = buildIterationReport(
    makeResult({
      summary: 'token sk-abcdefghij1234567890 leaked',
      errors: ['Authorization: Bearer abcdef1234567890 failed']
    })
  );
  assert.doesNotMatch(report.summary ?? '', /sk-abcdefghij1234567890/);
  assert.match(report.summary ?? '', /\[redacted\]/);
  assert.doesNotMatch(report.errors?.[0] ?? '', /abcdef1234567890/);
});

test('ShimError carries a category that maps to its exit code', () => {
  const error = new ShimError('bad config', 'config');
  assert.equal(categoryForError(error), 'config');
  const report = buildErrorReport(error);
  assert.equal(report.ok, false);
  assert.equal(report.category, 'config');
  assert.equal(report.exitCode, 2);
  assert.equal(report.error?.message, 'bad config');
});

test('unknown thrown values classify as internal (exit 1)', () => {
  assert.equal(categoryForError(new Error('boom')), 'internal');
  const report = buildErrorReport('boom');
  assert.equal(report.category, 'internal');
  assert.equal(report.exitCode, 1);
});

test('error reports redact secrets in the message', () => {
  const report = buildErrorReport(new ShimError('failed with sk-abcdefghijkl1234567890', 'provider'));
  assert.equal(report.exitCode, 4);
  assert.doesNotMatch(report.error?.message ?? '', /sk-abcdefghijkl1234567890/);
  assert.match(report.error?.message ?? '', /\[redacted\]/);
});

test('redactShimText redacts free-text log output (used for stderr in --json mode)', () => {
  const text = 'iteration finished: token sk-abcdefghijkl1234567890 leaked';
  const redacted = redactShimText(text);
  assert.doesNotMatch(redacted, /sk-abcdefghijkl1234567890/);
  assert.match(redacted, /\[redacted\]/);
});
