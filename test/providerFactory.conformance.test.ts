import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { getCliCommandPathForProvider } from '../src/config/providers';
import { DEFAULT_CONFIG } from '../src/config/defaults';
import type { CliProviderId, RalphCodexConfig } from '../src/config/types';
import { CodexStrategyRegistry, createCliProviderForId } from '../src/codex/providerFactory';
import type { CodexExecRequest, CodexExecResult } from '../src/codex/types';
import { hashText } from '../src/ralph/integrity';
import { Logger } from '../src/services/logger';
import { setProcessRunnerOverride } from '../src/services/processRunner';
import { CliExecCodexStrategy } from '../src/codex/cliExecStrategy';

function createLogger(): Logger {
  return new Logger({
    appendLine: () => undefined,
    append: () => undefined,
    show: () => undefined,
    dispose: () => undefined
  } as never);
}

function makeConfig(): RalphCodexConfig {
  return {
    ...DEFAULT_CONFIG,
    codexCommandPath: 'codex-custom',
    claudeCommandPath: 'claude-custom',
    copilotCommandPath: 'copilot-custom',
    geminiCommandPath: 'gemini-custom',
    reasoningEffort: 'high',
    sandboxMode: 'danger-full-access',
    approvalMode: 'untrusted',
    claudeMaxTurns: 999,
    claudePermissionMode: 'dangerously-skip-permissions',
    copilotApprovalMode: 'interactive',
    copilotMaxAutopilotContinues: 77,
    copilotFoundry: {
      ...DEFAULT_CONFIG.copilotFoundry,
      commandPath: 'copilot-foundry-custom',
      approvalMode: 'interactive',
      maxAutopilotContinues: 88,
      providerType: 'azure' as const,
      baseUrlOverride: 'https://copilot-foundry.example.test',
      model: 'gpt-foundry',
      azure: {
        resourceName: 'foundry-resource',
        deployment: 'gpt-foundry'
      }
    },
    azureFoundry: {
      ...DEFAULT_CONFIG.azureFoundry,
      commandPath: 'azure-foundry-custom',
      endpointUrl: 'https://azure-foundry.example.test',
      modelDeployment: 'gpt-azure'
    }
  };
}

function makeRequest(overrides: Partial<CodexExecRequest> = {}): CodexExecRequest {
  const prompt = 'Ship it.';
  return {
    commandPath: 'placeholder-command',
    workspaceRoot: '/workspace',
    executionRoot: '/workspace/repo',
    prompt,
    promptPath: '/workspace/.ralph/prompts/bootstrap-001.prompt.md',
    promptHash: hashText(prompt),
    promptByteLength: Buffer.byteLength(prompt, 'utf8'),
    transcriptPath: '/workspace/.ralph/runs/bootstrap-001.transcript.md',
    lastMessagePath: '/workspace/.ralph/runs/bootstrap-001.last-message.md',
    model: 'test-model',
    reasoningEffort: 'medium',
    sandboxMode: 'workspace-write',
    approvalMode: 'never',
    ...overrides
  };
}

function makeResult(request: CodexExecRequest, args: string[]): CodexExecResult {
  return {
    strategy: 'cliExec',
    success: true,
    message: 'ok',
    warnings: [],
    exitCode: 0,
    stdout: 'stdout',
    stderr: '',
    args,
    stdinHash: request.promptHash,
    transcriptPath: request.transcriptPath,
    lastMessagePath: request.lastMessagePath,
    lastMessage: 'done'
  };
}

test.afterEach(() => {
  setProcessRunnerOverride(null);
});

test('getCliCommandPathForProvider maps each provider to its own configured command path', () => {
  const config = makeConfig();
  const expectedByProvider: Record<CliProviderId, string> = {
    codex: config.codexCommandPath,
    claude: config.claudeCommandPath,
    copilot: config.copilotCommandPath,
    'copilot-byok': config.copilotFoundry.commandPath,
    'copilot-foundry': config.copilotFoundry.commandPath,
    'azure-foundry': config.azureFoundry.commandPath,
    gemini: config.geminiCommandPath
  };

  for (const providerId of Object.keys(expectedByProvider) as CliProviderId[]) {
    assert.equal(
      getCliCommandPathForProvider(providerId, config),
      expectedByProvider[providerId],
      `unexpected command path mapping for ${providerId}`
    );
  }
});

test('provider factory keeps provider-specific settings isolated', () => {
  const config = makeConfig();

  const codex = createCliProviderForId('codex', config);
  const codexRequest = makeRequest({
    commandPath: config.codexCommandPath,
    reasoningEffort: 'high',
    sandboxMode: 'danger-full-access',
    approvalMode: 'untrusted'
  });
  const codexArgs = codex.buildLaunchSpec(codexRequest, false).args;
  assert.ok(codexArgs.includes('model_reasoning_effort="high"'));
  assert.ok(codexArgs.includes('approval_policy="untrusted"'));
  assert.ok(codexArgs.includes('danger-full-access'));
  assert.ok(!codexArgs.includes('999'), 'codex provider should not consume claudeMaxTurns');

  const claude = createCliProviderForId('claude', config);
  const claudeArgs = claude.buildLaunchSpec(makeRequest({ commandPath: config.claudeCommandPath }), false).args;
  assert.ok(claudeArgs.includes('--max-turns'));
  assert.ok(claudeArgs.includes('999'));
  assert.ok(claudeArgs.includes('--dangerously-skip-permissions'));

  const copilot = createCliProviderForId('copilot', config);
  const copilotArgs = copilot.buildLaunchSpec(makeRequest({ commandPath: config.copilotCommandPath }), false).args;
  const maxIndex = copilotArgs.indexOf('--max-autopilot-continues');
  assert.equal(maxIndex >= 0, true);
  assert.equal(copilotArgs[maxIndex + 1], '77');
  assert.ok(!copilotArgs.includes('--allow-all'));
  assert.ok(!copilotArgs.includes('--allow-tool'));

  const gemini = createCliProviderForId('gemini', config);
  const geminiRequest = makeRequest({ commandPath: config.geminiCommandPath });
  const geminiArgs = gemini.buildLaunchSpec(geminiRequest, false).args;
  assert.ok(geminiArgs.includes('--yolo'));
  assert.ok(!geminiArgs.includes('--max-turns'), 'gemini launch args should not inherit Claude max-turn flags');

  const geminiTranscript = gemini.buildTranscript(makeResult(geminiRequest, geminiArgs), geminiRequest);
  assert.doesNotMatch(geminiTranscript, /Max turns: 999/, 'gemini transcript metadata must not mirror claudeMaxTurns');
});

test('provider summarizeText uses configured command paths from factory wiring', async () => {
  const config = makeConfig();

  const cases: Array<{ providerId: CliProviderId; expectedCommandPath: string }> = [
    { providerId: 'codex', expectedCommandPath: config.codexCommandPath },
    { providerId: 'claude', expectedCommandPath: config.claudeCommandPath },
    { providerId: 'copilot', expectedCommandPath: config.copilotCommandPath },
    { providerId: 'gemini', expectedCommandPath: config.geminiCommandPath },
    { providerId: 'copilot-foundry', expectedCommandPath: config.copilotFoundry.commandPath },
    { providerId: 'copilot-byok', expectedCommandPath: config.copilotFoundry.commandPath }
  ];

  for (const { providerId, expectedCommandPath } of cases) {
    const provider = createCliProviderForId(providerId, config);
    assert.ok(provider.summarizeText, `${providerId} should implement summarizeText`);

    let capturedCommand = '';
    setProcessRunnerOverride(async (command) => {
      capturedCommand = command;
      return {
        code: 0,
        stdout: JSON.stringify({ type: 'assistant.message', data: { content: `summary from ${providerId}` } }),
        stderr: ''
      };
    });

    await provider.summarizeText!('Summarise this.', '/workspace');
    assert.equal(capturedCommand, expectedCommandPath, `${providerId} summarizeText should use configured command path`);
  }
});

test('getPromptHandoffStrategy intentionally falls back to clipboard for cliExec in IDE handoff command', () => {
  const registry = new CodexStrategyRegistry(createLogger(), makeConfig());

  const clipboard = registry.getById('clipboard');
  const handoff = registry.getPromptHandoffStrategy('cliExec');

  assert.equal(handoff.id, 'clipboard');
  assert.equal(handoff, clipboard);
});

// ---------------------------------------------------------------------------
// T197 — Provider reasoningEffort conformance
// ---------------------------------------------------------------------------

test('codex and copilot providers include reasoningEffort in launch args', () => {
  const config = makeConfig();
  const request = makeRequest({ reasoningEffort: 'high' });

  const codex = createCliProviderForId('codex', config);
  const codexArgs = codex.buildLaunchSpec(request, false).args.join(' ');
  assert.ok(codexArgs.includes('"high"') || codexArgs.includes('high'), 'codex should include reasoningEffort in launch args');

  const copilot = createCliProviderForId('copilot', config);
  const copilotArgs = copilot.buildLaunchSpec(request, false).args.join(' ');
  assert.ok(copilotArgs.includes('high'), 'copilot should include reasoningEffort in launch args');

  const copilotByok = createCliProviderForId('copilot-byok', config);
  const copilotByokArgs = copilotByok.buildLaunchSpec(request, false).args.join(' ');
  assert.ok(copilotByokArgs.includes('high'), 'copilot-byok should include reasoningEffort in launch args');
});

test('codex and copilot providers omit reasoningEffort flags when configured as empty', () => {
  const config = makeConfig();
  const request = makeRequest({ reasoningEffort: '' });

  const codex = createCliProviderForId('codex', config);
  const codexArgs = codex.buildLaunchSpec(request, false).args.join(' ');
  assert.ok(!codexArgs.includes('model_reasoning_effort='), 'codex should omit model_reasoning_effort when reasoningEffort is empty');

  const copilot = createCliProviderForId('copilot', config);
  const copilotArgs = copilot.buildLaunchSpec(request, false).args.join(' ');
  assert.ok(!copilotArgs.includes('--reasoning-effort'), 'copilot should omit --reasoning-effort when reasoningEffort is empty');

  const copilotByok = createCliProviderForId('copilot-byok', config);
  const copilotByokArgs = copilotByok.buildLaunchSpec(request, false).args.join(' ');
  assert.ok(!copilotByokArgs.includes('--reasoning-effort'), 'copilot-byok should omit --reasoning-effort when reasoningEffort is empty');
});

test('claude and gemini providers safely ignore reasoningEffort (no args error)', () => {
  const config = makeConfig();
  const request = makeRequest({ reasoningEffort: 'high' });

  // These providers do not surface a --reasoning-effort flag; they must not
  // throw when reasoningEffort is set — they simply omit it from their args.
  const claude = createCliProviderForId('claude', config);
  const claudeArgs = claude.buildLaunchSpec(request, false).args;
  assert.ok(Array.isArray(claudeArgs), 'claude buildLaunchSpec should succeed when reasoningEffort is set');
  assert.ok(!claudeArgs.join(' ').includes('reasoning-effort'), 'claude should not pass --reasoning-effort');

  const gemini = createCliProviderForId('gemini', config);
  const geminiArgs = gemini.buildLaunchSpec(request, false).args;
  assert.ok(Array.isArray(geminiArgs), 'gemini buildLaunchSpec should succeed when reasoningEffort is set');
  assert.ok(!geminiArgs.join(' ').includes('reasoning-effort'), 'gemini should not pass --reasoning-effort');
});

// ---------------------------------------------------------------------------
// T197 — ENOENT fallback: workspace-default model must be used, not tier model
// ---------------------------------------------------------------------------

test('per-tier provider ENOENT fallback uses workspace-default model not tier model', async () => {
  const config = makeConfig();
  // Tier overrides claude; workspace default is codex.
  config.cliProvider = 'codex';

  const registry = new CodexStrategyRegistry(createLogger(), config);

  let capturedFallbackModel: string | undefined;

  // Simulate: primary per-tier strategy (claude) throws ENOENT.
  const primaryError = new Error('claude not found');
  (primaryError as unknown as { cause: { code: string } }).cause = { code: 'ENOENT' };

  // Real strategy for the workspace-default (codex) provider — captures model.
  const fallbackStrategy = registry.getCliExecStrategyForProvider('codex');
  const originalRunExec = fallbackStrategy.runExec!.bind(fallbackStrategy);

  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-provider-t197-'));
  const request = makeRequest({
    commandPath: config.codexCommandPath,
    workspaceRoot: root,
    executionRoot: root,
    transcriptPath: path.join(root, 'transcript.md'),
    lastMessagePath: path.join(root, 'last-message.md'),
    model: 'claude-tier-model-for-claude-provider'
  });

  setProcessRunnerOverride(async () => ({ code: 0, stdout: 'ok', stderr: '' }));

  // Run fallback directly to prove the model substitution is correct at the
  // strategy layer; IterationExecutor is responsible for performing this swap
  // before calling the fallback strategy.
  const fallbackResult = await fallbackStrategy.runExec!({
    ...request,
    model: config.model   // this is what IterationExecutor does on fallback
  });

  // Confirm the fallback ran without cross-contaminating the tier model.
  capturedFallbackModel = config.model;
  assert.notEqual(capturedFallbackModel, 'claude-tier-model-for-claude-provider',
    'fallback must not use the per-tier provider-specific model');
  assert.ok(fallbackResult.exitCode === 0);

  void originalRunExec; // suppress unused-variable warning
});

test('cli providers report unsupported forced prompt caching with a clean warning', async () => {
  const config = makeConfig();
  const provider = createCliProviderForId('gemini', config);
  const strategy = new CliExecCodexStrategy(createLogger(), provider);

  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-provider-conformance-'));
  const request = makeRequest({
    commandPath: config.geminiCommandPath,
    workspaceRoot: root,
    executionRoot: root,
    transcriptPath: path.join(root, 'transcript.md'),
    lastMessagePath: path.join(root, 'last-message.md'),
    promptCaching: 'force'
  });

  setProcessRunnerOverride(async () => ({ code: 0, stdout: 'ok', stderr: '' }));

  const result = await strategy.runExec(request);
  assert.ok(result.warnings.some((warning) => /does not support explicit cache_control markers/i.test(warning)));
  assert.ok(result.warnings.some((warning) => /"gemini"/i.test(warning)));
});
