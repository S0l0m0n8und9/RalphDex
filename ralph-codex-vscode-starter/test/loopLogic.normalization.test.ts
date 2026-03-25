import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildValidationFailureSignature,
  detectNoProgressSignals,
  normalizeFailureMessage
} from '../src/ralph/loopLogic';
import { DEFAULT_RALPH_AGENT_ID, RalphIterationResult } from '../src/ralph/types';

// ---------------------------------------------------------------------------
// normalizeFailureMessage
// ---------------------------------------------------------------------------

test('normalizeFailureMessage strips absolute Unix paths', () => {
  const result = normalizeFailureMessage('Error in /home/user/project/src/index.ts');
  assert.ok(!result.includes('/home/user/project'), 'path should be replaced');
  assert.ok(result.includes('<path>'), 'should contain <path> placeholder');
});

test('normalizeFailureMessage strips Windows paths', () => {
  const result = normalizeFailureMessage('Error in C:\\Users\\user\\project\\index.ts');
  assert.ok(!result.includes('C:\\'), 'Windows path should be replaced');
  assert.ok(result.includes('<path>'), 'should contain <path> placeholder');
});

test('normalizeFailureMessage strips line:col references', () => {
  const result = normalizeFailureMessage('Error at line 42, col 10');
  assert.ok(!result.includes('42'), 'line numbers should be replaced');
  assert.ok(result.includes('<loc>'), 'should contain <loc> placeholder');
});

test('normalizeFailureMessage strips colon-prefixed line numbers', () => {
  const result = normalizeFailureMessage('src/index.ts:42:10: error TS2345');
  assert.ok(result.includes('<loc>'), 'should contain <loc> for :42:10');
});

test('normalizeFailureMessage strips ISO timestamps', () => {
  const result = normalizeFailureMessage('Failed at 2026-03-07T00:10:00.000Z');
  assert.ok(!result.includes('2026'), 'timestamp should be replaced');
  assert.ok(result.includes('<ts>'), 'should contain <ts> placeholder');
});

test('normalizeFailureMessage strips hex hashes', () => {
  const result = normalizeFailureMessage('Commit abc123def456 failed');
  assert.ok(!result.includes('abc123def456'), 'hash should be replaced');
  assert.ok(result.includes('<id>'), 'should contain <id> placeholder');
});

test('normalizeFailureMessage produces consistent output for same semantic error', () => {
  const msg1 = 'Error: Type mismatch at /home/alice/project/src/foo.ts:10:5';
  const msg2 = 'Error: Type mismatch at /home/bob/other-project/src/foo.ts:99:3';
  assert.equal(normalizeFailureMessage(msg1), normalizeFailureMessage(msg2));
});

test('normalizeFailureMessage lowercases output', () => {
  const result = normalizeFailureMessage('ERROR: Something FAILED');
  assert.equal(result, result.toLowerCase());
});

// ---------------------------------------------------------------------------
// detectNoProgressSignals uses normalized signature comparison
// ---------------------------------------------------------------------------

function makeResult(overrides: Partial<RalphIterationResult> = {}): RalphIterationResult {
  return {
    schemaVersion: 1,
    agentId: DEFAULT_RALPH_AGENT_ID,
    iteration: 1,
    selectedTaskId: 'T1',
    selectedTaskTitle: 'Task one',
    promptKind: 'iteration',
    promptPath: '/workspace/.ralph/prompts/iteration-001.prompt.md',
    artifactDir: '/workspace/.ralph/artifacts/iteration-001',
    adapterUsed: 'cliExec',
    executionIntegrity: null,
    executionStatus: 'succeeded',
    verificationStatus: 'failed',
    completionClassification: 'no_progress',
    followUpAction: 'retry_same_task',
    startedAt: '2026-03-07T00:00:00.000Z',
    finishedAt: '2026-03-07T00:10:00.000Z',
    phaseTimestamps: {
      inspectStartedAt: '2026-03-07T00:00:00.000Z',
      inspectFinishedAt: '2026-03-07T00:01:00.000Z',
      taskSelectedAt: '2026-03-07T00:01:00.000Z',
      promptGeneratedAt: '2026-03-07T00:02:00.000Z',
      resultCollectedAt: '2026-03-07T00:07:30.000Z',
      verificationFinishedAt: '2026-03-07T00:09:00.000Z',
      classifiedAt: '2026-03-07T00:09:30.000Z'
    },
    summary: 'No progress',
    warnings: [],
    errors: [],
    execution: { exitCode: 1 },
    verification: {
      taskValidationHint: null,
      effectiveValidationCommand: 'npm test',
      normalizedValidationCommandFrom: null,
      primaryCommand: 'npm test',
      validationFailureSignature: null,
      verifiers: []
    },
    backlog: { remainingTaskCount: 1, actionableTaskAvailable: true },
    diffSummary: null,
    noProgressSignals: [],
    remediation: null,
    stopReason: null,
    ...overrides
  };
}

test('detectNoProgressSignals detects same_validation_failure_signature when signatures differ only in path/line', () => {
  // Two signatures that are semantically identical but differ in file path and line number
  const prevSig = 'npm test::exit:1::error ts2345 at /home/alice/project/src/foo.ts:10:5 argument of type string is not assignable to number';
  const currSig = 'npm test::exit:1::error ts2345 at /home/bob/other/src/foo.ts:99:1 argument of type string is not assignable to number';

  const previous = makeResult({
    verification: {
      taskValidationHint: null,
      effectiveValidationCommand: 'npm test',
      normalizedValidationCommandFrom: null,
      primaryCommand: 'npm test',
      validationFailureSignature: prevSig,
      verifiers: []
    }
  });

  const signals = detectNoProgressSignals(
    {
      selectedTaskId: 'T1',
      selectedTaskCompleted: false,
      selectedTaskBlocked: false,
      humanReviewNeeded: false,
      remainingSubtaskCount: 0,
      remainingTaskCount: 1,
      executionStatus: 'succeeded',
      verificationStatus: 'failed',
      validationFailureSignature: currSig,
      relevantFileChanges: [],
      progressChanged: false,
      taskFileChanged: false,
      previousIterations: [previous]
    },
    'no_progress'
  );

  assert.ok(signals.includes('same_validation_failure_signature'), 'should detect same signature via normalization');
});

test('detectNoProgressSignals does NOT emit same_validation_failure_signature when errors are genuinely different', () => {
  const prevSig = 'npm test::exit:1::Error: module not found foo';
  const currSig = 'npm test::exit:1::TypeError: cannot read property bar of undefined';

  const previous = makeResult({
    verification: {
      taskValidationHint: null,
      effectiveValidationCommand: 'npm test',
      normalizedValidationCommandFrom: null,
      primaryCommand: 'npm test',
      validationFailureSignature: prevSig,
      verifiers: []
    }
  });

  const signals = detectNoProgressSignals(
    {
      selectedTaskId: 'T1',
      selectedTaskCompleted: false,
      selectedTaskBlocked: false,
      humanReviewNeeded: false,
      remainingSubtaskCount: 0,
      remainingTaskCount: 1,
      executionStatus: 'succeeded',
      verificationStatus: 'failed',
      validationFailureSignature: currSig,
      relevantFileChanges: [],
      progressChanged: false,
      taskFileChanged: false,
      previousIterations: [previous]
    },
    'no_progress'
  );

  assert.ok(!signals.includes('same_validation_failure_signature'), 'genuinely different errors should not match');
});
