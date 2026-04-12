import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { maybeSummariseHistory, readLastSummarizationMode } from '../src/ralph/iterationPreparation';
import type { CliProvider } from '../src/codex/cliProvider';
import type { RalphCodexConfig } from '../src/config/types';
import type { RalphWorkspaceState, RalphIterationResult } from '../src/ralph/types';
import { DEFAULT_CONFIG } from '../src/config/defaults';

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ralph-mem-summ-'));
}

function makeIterationResult(iteration: number): RalphIterationResult {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    iteration,
    selectedTaskId: `T${iteration}`,
    selectedTaskTitle: `Task ${iteration}`,
    promptKind: 'iteration',
    promptPath: '/fake/prompt.md',
    artifactDir: '/fake/artifacts',
    adapterUsed: 'cliExec',
    executionIntegrity: null,
    executionStatus: 'succeeded',
    verificationStatus: 'passed',
    completionClassification: 'complete',
    followUpAction: 'continue_same_task',
    startedAt: now,
    finishedAt: now,
    phaseTimestamps: {
      inspectStartedAt: now,
      inspectFinishedAt: now,
      taskSelectedAt: now,
      promptGeneratedAt: now,
      resultCollectedAt: now,
      verificationFinishedAt: now,
      classifiedAt: now
    },
    summary: `Completed iteration ${iteration}.`,
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
    backlog: { remainingTaskCount: 1, actionableTaskAvailable: true },
    diffSummary: null,
    noProgressSignals: [],
    remediation: null,
    stopReason: null
  };
}

function makeState(historyLength: number): RalphWorkspaceState {
  return {
    version: 2,
    objectivePreview: null,
    nextIteration: historyLength + 1,
    lastPromptKind: 'iteration',
    lastPromptPath: null,
    lastRun: null,
    runHistory: [],
    lastIteration: historyLength > 0 ? makeIterationResult(historyLength) : null,
    iterationHistory: Array.from({ length: historyLength }, (_, i) => makeIterationResult(i + 1)),
    updatedAt: new Date().toISOString()
  };
}

function makeConfig(overrides: Partial<RalphCodexConfig> = {}): RalphCodexConfig {
  return {
    ...DEFAULT_CONFIG,
    memoryStrategy: 'summary',
    memoryWindowSize: 5,
    memorySummaryThreshold: 10,
    ...overrides
  };
}

/** Stub provider whose summarizeText succeeds with a canned response. */
function makeSuccessProvider(): CliProvider {
  return {
    id: 'claude',
    buildLaunchSpec: () => ({ args: [], cwd: '.' }),
    extractResponseText: async () => '',
    isIgnorableStderrLine: () => false,
    summarizeResult: () => '',
    describeLaunchError: () => '',
    buildTranscript: () => '',
    summarizeText: async (_prompt: string, _cwd: string) =>
      'The first 15 iterations completed foundational setup and scaffolding.'
  };
}

/** Stub provider whose summarizeText throws, forcing fallback. */
function makeFailingProvider(): CliProvider {
  return {
    id: 'codex',
    buildLaunchSpec: () => ({ args: [], cwd: '.' }),
    extractResponseText: async () => '',
    isIgnorableStderrLine: () => false,
    summarizeResult: () => '',
    describeLaunchError: () => '',
    buildTranscript: () => '',
    summarizeText: async () => { throw new Error('Provider unavailable'); }
  };
}

/** Stub provider without summarizeText (tests the legacy fallback path). */
function makeNoSummarizeProvider(): CliProvider {
  return {
    id: 'copilot',
    buildLaunchSpec: () => ({ args: [], cwd: '.' }),
    extractResponseText: async () => '',
    isIgnorableStderrLine: () => false,
    summarizeResult: () => '',
    describeLaunchError: () => '',
    buildTranscript: () => ''
    // No summarizeText — intentionally omitted
  };
}

test('maybeSummariseHistory returns null when memoryStrategy is not summary', async () => {
  const tmpDir = await makeTempDir();
  const summaryPath = path.join(tmpDir, 'memory-summary.md');
  const config = makeConfig({ memoryStrategy: 'verbatim' });
  const state = makeState(25);

  const result = await maybeSummariseHistory(state, config, summaryPath, tmpDir, makeSuccessProvider());
  assert.equal(result, null, 'should skip when strategy is not summary');
});

test('maybeSummariseHistory returns null when below threshold', async () => {
  const tmpDir = await makeTempDir();
  const summaryPath = path.join(tmpDir, 'memory-summary.md');
  const config = makeConfig({ memorySummaryThreshold: 30 });
  const state = makeState(20);

  const result = await maybeSummariseHistory(state, config, summaryPath, tmpDir, makeSuccessProvider());
  assert.equal(result, null, 'should skip when history depth is below threshold');
});

test('maybeSummariseHistory returns provider_exec when provider.summarizeText succeeds', async () => {
  const tmpDir = await makeTempDir();
  const summaryPath = path.join(tmpDir, 'memory-summary.md');
  const config = makeConfig();
  const state = makeState(15);

  const result = await maybeSummariseHistory(state, config, summaryPath, tmpDir, makeSuccessProvider());
  assert.equal(result, 'provider_exec');

  const content = await fs.readFile(summaryPath, 'utf8');
  assert.ok(content.includes('summarization-mode=provider_exec'), 'file should record provider_exec mode');
  assert.ok(content.includes('foundational setup'), 'file should contain provider response');
});

test('maybeSummariseHistory returns fallback_summary when provider.summarizeText throws', async () => {
  const tmpDir = await makeTempDir();
  const summaryPath = path.join(tmpDir, 'memory-summary.md');
  const config = makeConfig();
  const state = makeState(15);

  const result = await maybeSummariseHistory(state, config, summaryPath, tmpDir, makeFailingProvider());
  assert.equal(result, 'fallback_summary');

  const content = await fs.readFile(summaryPath, 'utf8');
  assert.ok(content.includes('summarization-mode=fallback_summary'), 'file should record fallback mode');
  assert.ok(content.includes('10 prior iterations completed'), 'file should contain static fallback text');
});

test('maybeSummariseHistory returns fallback_summary when no provider is passed', async () => {
  const tmpDir = await makeTempDir();
  const summaryPath = path.join(tmpDir, 'memory-summary.md');
  const config = makeConfig();
  const state = makeState(15);

  const result = await maybeSummariseHistory(state, config, summaryPath, tmpDir);
  assert.equal(result, 'fallback_summary', 'should fallback when no provider is given');

  const content = await fs.readFile(summaryPath, 'utf8');
  assert.ok(content.includes('summarization-mode=fallback_summary'), 'file should record fallback mode');
});

test('maybeSummariseHistory returns fallback_summary when provider lacks summarizeText', async () => {
  const tmpDir = await makeTempDir();
  const summaryPath = path.join(tmpDir, 'memory-summary.md');
  const config = makeConfig();
  const state = makeState(15);

  const result = await maybeSummariseHistory(state, config, summaryPath, tmpDir, makeNoSummarizeProvider());
  assert.equal(result, 'fallback_summary', 'should fallback when provider has no summarizeText');

  const content = await fs.readFile(summaryPath, 'utf8');
  assert.ok(content.includes('summarization-mode=fallback_summary'), 'file should record fallback mode');
});

test('maybeSummariseHistory skips re-summarisation when old count has not grown', async () => {
  const tmpDir = await makeTempDir();
  const summaryPath = path.join(tmpDir, 'memory-summary.md');
  const config = makeConfig();
  const state = makeState(15);

  // First call should summarize
  const result1 = await maybeSummariseHistory(state, config, summaryPath, tmpDir, makeSuccessProvider());
  assert.equal(result1, 'provider_exec');

  // Second call with same state should skip
  const result2 = await maybeSummariseHistory(state, config, summaryPath, tmpDir, makeSuccessProvider());
  assert.equal(result2, null, 'should skip when old count has not grown');
});

test('readLastSummarizationMode reads provider_exec from memory-summary.md', async () => {
  const tmpDir = await makeTempDir();
  const summaryPath = path.join(tmpDir, 'memory-summary.md');
  await fs.writeFile(summaryPath, '<!-- ralph-memory: summarized-old-count=10 summarization-mode=provider_exec -->\nSome summary.\n', 'utf8');

  const mode = await readLastSummarizationMode(summaryPath);
  assert.equal(mode, 'provider_exec');
});

test('readLastSummarizationMode reads fallback_summary from memory-summary.md', async () => {
  const tmpDir = await makeTempDir();
  const summaryPath = path.join(tmpDir, 'memory-summary.md');
  await fs.writeFile(summaryPath, '<!-- ralph-memory: summarized-old-count=5 summarization-mode=fallback_summary -->\n5 prior iterations completed.\n', 'utf8');

  const mode = await readLastSummarizationMode(summaryPath);
  assert.equal(mode, 'fallback_summary');
});

test('readLastSummarizationMode returns null for legacy format without mode', async () => {
  const tmpDir = await makeTempDir();
  const summaryPath = path.join(tmpDir, 'memory-summary.md');
  await fs.writeFile(summaryPath, '<!-- ralph-memory: summarized-old-count=5 -->\nOld format summary.\n', 'utf8');

  const mode = await readLastSummarizationMode(summaryPath);
  assert.equal(mode, null);
});

test('readLastSummarizationMode returns null when file does not exist', async () => {
  const tmpDir = await makeTempDir();
  const summaryPath = path.join(tmpDir, 'nonexistent.md');

  const mode = await readLastSummarizationMode(summaryPath);
  assert.equal(mode, null);
});

// --- Provider-variant regression tests ---

function makeProviderStub(id: 'claude' | 'codex' | 'copilot' | 'azure-foundry', response: string): CliProvider {
  return {
    id,
    buildLaunchSpec: () => ({ args: [], cwd: '.' }),
    extractResponseText: async () => '',
    isIgnorableStderrLine: () => false,
    summarizeResult: () => '',
    describeLaunchError: () => '',
    buildTranscript: () => '',
    summarizeText: async () => response
  };
}

for (const providerId of ['claude', 'codex', 'copilot', 'azure-foundry'] as const) {
  test(`maybeSummariseHistory routes through ${providerId} provider summarizeText`, async () => {
    const tmpDir = await makeTempDir();
    const summaryPath = path.join(tmpDir, 'memory-summary.md');
    const config = makeConfig();
    const state = makeState(15);
    const response = `Summary from ${providerId} provider.`;
    const provider = makeProviderStub(providerId, response);

    const result = await maybeSummariseHistory(state, config, summaryPath, tmpDir, provider);
    assert.equal(result, 'provider_exec', `${providerId} should yield provider_exec`);

    const content = await fs.readFile(summaryPath, 'utf8');
    assert.ok(content.includes('summarization-mode=provider_exec'), `${providerId} file should record provider_exec`);
    assert.ok(content.includes(response), `${providerId} file should contain provider response`);
  });

  test(`maybeSummariseHistory falls back when ${providerId} provider summarizeText throws`, async () => {
    const tmpDir = await makeTempDir();
    const summaryPath = path.join(tmpDir, 'memory-summary.md');
    const config = makeConfig();
    const state = makeState(15);
    const provider: CliProvider = {
      id: providerId,
      buildLaunchSpec: () => ({ args: [], cwd: '.' }),
      extractResponseText: async () => '',
      isIgnorableStderrLine: () => false,
      summarizeResult: () => '',
      describeLaunchError: () => '',
      buildTranscript: () => '',
      summarizeText: async () => { throw new Error(`${providerId} unavailable`); }
    };

    const result = await maybeSummariseHistory(state, config, summaryPath, tmpDir, provider);
    assert.equal(result, 'fallback_summary', `${providerId} failure should yield fallback_summary`);

    const content = await fs.readFile(summaryPath, 'utf8');
    assert.ok(content.includes('summarization-mode=fallback_summary'), `${providerId} file should record fallback mode`);
  });
}
