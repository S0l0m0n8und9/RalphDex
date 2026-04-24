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
      auth: {
        ...DEFAULT_CONFIG.copilotFoundry.auth,
        mode: 'env-api-key',
        apiKeyEnvVar: 'COPILOT_FOUNDRY_KEY'
      },
      azure: {
        ...DEFAULT_CONFIG.copilotFoundry.azure,
        baseUrlOverride: 'https://copilot-foundry.example.test'
      },
      model: {
        ...DEFAULT_CONFIG.copilotFoundry.model,
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
  delete process.env.COPILOT_FOUNDRY_KEY;
});

test('getCliCommandPathForProvider maps each provider to its own configured command path', () => {
  const config = makeConfig();
  const expectedByProvider: Record<CliProviderId, string> = {
    codex: config.codexCommandPath,
    claude: config.claudeCommandPath,
    copilot: config.copilotCommandPath,
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
  process.env.COPILOT_FOUNDRY_KEY = 'foundry-test-key';

  const cases: Array<{ providerId: CliProviderId; expectedCommandPath: string }> = [
    { providerId: 'codex', expectedCommandPath: config.codexCommandPath },
    { providerId: 'claude', expectedCommandPath: config.claudeCommandPath },
    { providerId: 'copilot', expectedCommandPath: config.copilotCommandPath },
    { providerId: 'gemini', expectedCommandPath: config.geminiCommandPath },
    { providerId: 'copilot-foundry', expectedCommandPath: config.copilotFoundry.commandPath }
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
