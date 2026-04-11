import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import {
  buildFailureDiagnosticPrompt,
  classifyTransientFailure,
  parseFailureDiagnosticResponse,
  writeFailureAnalysis
} from '../src/ralph/failureDiagnostics';
import { shouldRunFailureDiagnostic } from '../src/ralph/loopLogic';

// ---------------------------------------------------------------------------
// Criterion 9: FailureCategoryId taxonomy — classifyTransientFailure
// ---------------------------------------------------------------------------

test('classifyTransientFailure returns null for non-transient signal', () => {
  assert.equal(classifyTransientFailure('TypeScript compile error: TS2345'), null);
});

test('classifyTransientFailure returns null for empty string', () => {
  assert.equal(classifyTransientFailure(''), null);
});

test('classifyTransientFailure returns transient for ECONNREFUSED', () => {
  assert.equal(classifyTransientFailure('connect ECONNREFUSED 127.0.0.1:3000'), 'transient');
});

test('classifyTransientFailure returns transient for ETIMEDOUT', () => {
  assert.equal(classifyTransientFailure('request failed: ETIMEDOUT'), 'transient');
});

test('classifyTransientFailure returns transient for network error (case-insensitive)', () => {
  assert.equal(classifyTransientFailure('Network Error occurred'), 'transient');
});

test('classifyTransientFailure returns transient for lock contention', () => {
  assert.equal(classifyTransientFailure('lock contention on .ralph/tasks.json'), 'transient');
});

test('classifyTransientFailure returns transient for process timeout', () => {
  assert.equal(classifyTransientFailure('process timeout after 30s'), 'transient');
});

test('classifyTransientFailure returns transient for socket hang up', () => {
  assert.equal(classifyTransientFailure('socket hang up'), 'transient');
});

test('classifyTransientFailure returns transient for ECONNRESET', () => {
  assert.equal(classifyTransientFailure('read ECONNRESET'), 'transient');
});

// ---------------------------------------------------------------------------
// Criterion 10: shouldRunFailureDiagnostic in loopLogic
// ---------------------------------------------------------------------------

test('shouldRunFailureDiagnostic returns false when mode is off', () => {
  assert.equal(shouldRunFailureDiagnostic('blocked', 'failed', 'off'), false);
});

test('shouldRunFailureDiagnostic returns false when neither blocked nor failed', () => {
  assert.equal(shouldRunFailureDiagnostic('complete', 'passed', 'auto'), false);
});

test('shouldRunFailureDiagnostic returns true when classification is blocked', () => {
  assert.equal(shouldRunFailureDiagnostic('blocked', 'passed', 'auto'), true);
});

test('shouldRunFailureDiagnostic returns true when verificationStatus is failed', () => {
  assert.equal(shouldRunFailureDiagnostic('no_progress', 'failed', 'auto'), true);
});

test('shouldRunFailureDiagnostic returns true when both blocked and failed', () => {
  assert.equal(shouldRunFailureDiagnostic('blocked', 'failed', 'auto'), true);
});

// ---------------------------------------------------------------------------
// Criterion 11: parseFailureDiagnosticResponse — malformed / missing
// ---------------------------------------------------------------------------

test('parseFailureDiagnosticResponse returns null for empty string', () => {
  assert.equal(parseFailureDiagnosticResponse(''), null);
});

test('parseFailureDiagnosticResponse returns null for whitespace-only input', () => {
  assert.equal(parseFailureDiagnosticResponse('   \n  '), null);
});

test('parseFailureDiagnosticResponse returns null for non-JSON text', () => {
  assert.equal(parseFailureDiagnosticResponse('Sorry, I could not complete the analysis.'), null);
});

test('parseFailureDiagnosticResponse returns null when required fields are missing', () => {
  const partial = JSON.stringify({ rootCauseCategory: 'transient', confidence: 'high' });
  assert.equal(parseFailureDiagnosticResponse(partial), null);
});

test('parseFailureDiagnosticResponse returns null for invalid rootCauseCategory', () => {
  const bad = JSON.stringify({
    rootCauseCategory: 'unknown_category',
    confidence: 'high',
    summary: 'Something went wrong.',
    suggestedAction: 'Retry.'
  });
  assert.equal(parseFailureDiagnosticResponse(bad), null);
});

test('parseFailureDiagnosticResponse returns null for invalid confidence', () => {
  const bad = JSON.stringify({
    rootCauseCategory: 'transient',
    confidence: 'very-high',
    summary: 'Something went wrong.',
    suggestedAction: 'Retry.'
  });
  assert.equal(parseFailureDiagnosticResponse(bad), null);
});

test('parseFailureDiagnosticResponse parses a valid raw JSON response', () => {
  const input = JSON.stringify({
    rootCauseCategory: 'implementation_error',
    confidence: 'medium',
    summary: 'The implementation introduced a type mismatch.',
    suggestedAction: 'Review the type definitions and fix the mismatch.'
  });
  const result = parseFailureDiagnosticResponse(input);
  assert.ok(result);
  assert.equal(result.rootCauseCategory, 'implementation_error');
  assert.equal(result.confidence, 'medium');
  assert.equal(result.summary, 'The implementation introduced a type mismatch.');
  assert.equal(result.suggestedAction, 'Review the type definitions and fix the mismatch.');
  assert.equal(result.retryPromptAddendum, undefined);
});

test('parseFailureDiagnosticResponse parses a fenced json block', () => {
  const input = '```json\n' + JSON.stringify({
    rootCauseCategory: 'validation_mismatch',
    confidence: 'high',
    summary: 'Validation command produced unexpected output.',
    suggestedAction: 'Check the validation command.',
    retryPromptAddendum: 'Focus on the validation output format.'
  }) + '\n```';
  const result = parseFailureDiagnosticResponse(input);
  assert.ok(result);
  assert.equal(result.rootCauseCategory, 'validation_mismatch');
  assert.equal(result.retryPromptAddendum, 'Focus on the validation output format.');
});

test('parseFailureDiagnosticResponse includes schemaVersion and kind', () => {
  const input = JSON.stringify({
    rootCauseCategory: 'dependency_missing',
    confidence: 'low',
    summary: 'A required package was not installed.',
    suggestedAction: 'Run npm install before retrying.'
  });
  const result = parseFailureDiagnosticResponse(input);
  assert.ok(result);
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.kind, 'failureAnalysis');
});

// ---------------------------------------------------------------------------
// Criterion 12: writeFailureAnalysis writes artifact to correct path
// ---------------------------------------------------------------------------

test('writeFailureAnalysis writes failure-analysis.json at the expected path', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-failure-diagnostics-'));
  try {
    const taskId = 'T999';
    const analysis = {
      schemaVersion: 1 as const,
      kind: 'failureAnalysis' as const,
      taskId,
      createdAt: '2026-04-11T00:00:00.000Z',
      rootCauseCategory: 'environment_issue' as const,
      confidence: 'high' as const,
      summary: 'The environment was missing a required tool.',
      suggestedAction: 'Install the missing tool and retry.'
    };

    const writtenPath = await writeFailureAnalysis(tmpDir, taskId, analysis);
    const expectedPath = path.join(tmpDir, taskId, 'failure-analysis.json');
    assert.equal(writtenPath, expectedPath);

    const contents = await fs.readFile(writtenPath, 'utf8');
    const parsed = JSON.parse(contents);
    assert.equal(parsed.schemaVersion, 1);
    assert.equal(parsed.kind, 'failureAnalysis');
    assert.equal(parsed.taskId, taskId);
    assert.equal(parsed.rootCauseCategory, 'environment_issue');
    assert.equal(parsed.confidence, 'high');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// buildFailureDiagnosticPrompt — basic shape tests
// ---------------------------------------------------------------------------

test('buildFailureDiagnosticPrompt includes task ID and title', () => {
  const prompt = buildFailureDiagnosticPrompt({
    taskId: 'T42',
    taskTitle: 'Implement feature X',
    lastIterationPrompt: 'Do the work.',
    lastMessage: 'I tried but failed.',
    failureSignal: 'Test suite failed.',
    recentHistory: []
  });
  assert.ok(prompt.includes('T42'));
  assert.ok(prompt.includes('Implement feature X'));
});

test('buildFailureDiagnosticPrompt truncates long prompts', () => {
  const longPrompt = 'x'.repeat(5000);
  const prompt = buildFailureDiagnosticPrompt({
    taskId: 'T1',
    taskTitle: 'Task',
    lastIterationPrompt: longPrompt,
    lastMessage: 'done',
    failureSignal: 'fail',
    recentHistory: []
  });
  assert.ok(prompt.includes('[truncated]'));
});
