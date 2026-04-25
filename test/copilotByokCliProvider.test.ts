import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { CopilotByokCliProvider } from '../src/codex/copilotByokCliProvider';
import { CopilotByokConfig } from '../src/config/types';
import { hashText } from '../src/ralph/integrity';

function makeByokOptions(): CopilotByokConfig {
  return {
    commandPath: 'copilot',
    providerType: 'azure',
    baseUrlOverride: '',
    model: 'deployment-1',
    azure: { resourceName: 'resource-1', deployment: 'deployment-1' },
    offline: false,
    requiredApiKeyEnvVar: 'COPILOT_PROVIDER_API_KEY',
    approvalMode: 'allow-all',
    maxAutopilotContinues: 200
  };
}

function request() {
  return {
    commandPath: 'copilot',
    workspaceRoot: '/workspace',
    executionRoot: '/workspace/repo',
    prompt: 'Ship it.',
    promptPath: '/workspace/.ralph/prompts/bootstrap-001.prompt.md',
    promptHash: hashText('Ship it.'),
    promptByteLength: Buffer.byteLength('Ship it.', 'utf8'),
    transcriptPath: '/workspace/.ralph/runs/bootstrap-001.transcript.md',
    lastMessagePath: '/workspace/.ralph/runs/bootstrap-001.last-message.md',
    model: 'gpt-5.4',
    reasoningEffort: 'medium' as const,
    sandboxMode: 'workspace-write' as const,
    approvalMode: 'never' as const
  };
}

// 1. buildLaunchSpec for copilot-byok mode (Azure provider type)
test('buildLaunchSpec injects COPILOT_PROVIDER_TYPE and base URL for Azure BYOK', () => {
  const provider = new CopilotByokCliProvider(makeByokOptions(), 'byok');
  const launch = provider.buildLaunchSpec(request(), false);

  assert.equal(launch.env?.COPILOT_PROVIDER_TYPE, 'azure');
  assert.equal(
    launch.env?.COPILOT_PROVIDER_BASE_URL,
    'https://resource-1.openai.azure.com/openai/deployments/deployment-1'
  );
  assert.equal(launch.env?.COPILOT_MODEL, 'gpt-5.4');

  // These keys must NOT be present
  assert.equal(launch.env?.COPILOT_PROVIDER_API_KEY, undefined);
  assert.equal(launch.env?.COPILOT_PROVIDER_BEARER_TOKEN, undefined);
  assert.equal(launch.env?.COPILOT_PROVIDER_WIRE_API, undefined);
  assert.equal(launch.env?.COPILOT_PROVIDER_MODEL_ID, undefined);
  assert.equal(launch.env?.COPILOT_PROVIDER_WIRE_MODEL, undefined);

  // No prepareLaunchSpec method
  assert.equal('prepareLaunchSpec' in provider, false);
});

// 2. copilot-foundry preset forces azure
test('buildLaunchSpec copilot-foundry preset forces providerType to azure', () => {
  const options: CopilotByokConfig = { ...makeByokOptions(), providerType: 'openai', baseUrlOverride: 'https://api.openai.com/v1' };
  const provider = new CopilotByokCliProvider(options, 'foundry-preset');
  const launch = provider.buildLaunchSpec(request(), false);

  assert.equal(launch.env?.COPILOT_PROVIDER_TYPE, 'azure');
  assert.equal(
    launch.env?.COPILOT_PROVIDER_BASE_URL,
    'https://resource-1.openai.azure.com/openai/deployments/deployment-1'
  );
});

// 3. Azure URL derivation from resourceName + deployment
test('buildLaunchSpec derives Azure base URL from resourceName and deployment', () => {
  const options: CopilotByokConfig = {
    ...makeByokOptions(),
    azure: { resourceName: 'my-resource', deployment: 'gpt-4o' }
  };
  const provider = new CopilotByokCliProvider(options, 'byok');
  const launch = provider.buildLaunchSpec(request(), false);

  assert.equal(
    launch.env?.COPILOT_PROVIDER_BASE_URL,
    'https://my-resource.openai.azure.com/openai/deployments/gpt-4o'
  );
});

// 4. baseUrlOverride takes precedence
test('buildLaunchSpec uses baseUrlOverride when provided', () => {
  const options: CopilotByokConfig = { ...makeByokOptions(), baseUrlOverride: 'https://custom.example.com' };
  const provider = new CopilotByokCliProvider(options, 'byok');
  const launch = provider.buildLaunchSpec(request(), false);

  assert.equal(launch.env?.COPILOT_PROVIDER_BASE_URL, 'https://custom.example.com');
});

// 5. Throws when neither resourceName+deployment nor baseUrlOverride is configured
test('buildLaunchSpec throws when azure config is missing and no baseUrlOverride', () => {
  const options: CopilotByokConfig = {
    ...makeByokOptions(),
    providerType: 'azure',
    baseUrlOverride: '',
    azure: { resourceName: '', deployment: '' }
  };
  const provider = new CopilotByokCliProvider(options, 'byok');

  assert.throws(() => provider.buildLaunchSpec(request(), false), /requires both azure\.resourceName and azure\.deployment/);
});

// 6. OpenAI providerType uses baseUrlOverride
test('buildLaunchSpec for OpenAI providerType uses baseUrlOverride', () => {
  const options: CopilotByokConfig = {
    ...makeByokOptions(),
    providerType: 'openai',
    baseUrlOverride: 'https://api.openai.com/v1'
  };
  const provider = new CopilotByokCliProvider(options, 'byok');
  const launch = provider.buildLaunchSpec(request(), false);

  assert.equal(launch.env?.COPILOT_PROVIDER_TYPE, 'openai');
  assert.equal(launch.env?.COPILOT_PROVIDER_BASE_URL, 'https://api.openai.com/v1');
});

test('buildLaunchSpec falls back to azure deployment name when model values are blank', () => {
  const options: CopilotByokConfig = {
    ...makeByokOptions(),
    model: '',
    azure: { resourceName: 'resource-1', deployment: 'deploy-fallback' }
  };
  const provider = new CopilotByokCliProvider(options, 'foundry-preset');
  const launch = provider.buildLaunchSpec({ ...request(), model: '' }, false);

  assert.equal(launch.env?.COPILOT_MODEL, 'deploy-fallback');
});

// 7. Offline mode adds COPILOT_OFFLINE
test('buildLaunchSpec sets COPILOT_OFFLINE when offline is true', () => {
  const options: CopilotByokConfig = { ...makeByokOptions(), offline: true };
  const provider = new CopilotByokCliProvider(options, 'byok');
  const launch = provider.buildLaunchSpec(request(), false);

  assert.equal(launch.env?.COPILOT_OFFLINE, 'true');
});

test('buildLaunchSpec does not set COPILOT_OFFLINE when offline is false', () => {
  const provider = new CopilotByokCliProvider(makeByokOptions(), 'byok');
  const launch = provider.buildLaunchSpec(request(), false);

  assert.equal(launch.env?.COPILOT_OFFLINE, undefined);
});

// 8. Provider ID by mode
test('provider id is copilot-byok for byok mode', () => {
  const provider = new CopilotByokCliProvider(makeByokOptions(), 'byok');
  assert.equal(provider.id, 'copilot-byok');
});

test('provider id is copilot-foundry for foundry-preset mode', () => {
  const options: CopilotByokConfig = { ...makeByokOptions(), baseUrlOverride: 'https://foundry.example.com' };
  const provider = new CopilotByokCliProvider(options, 'foundry-preset');
  assert.equal(provider.id, 'copilot-foundry');
});

// 9. extractResponseText returns the last assistant message from JSONL
test('extractResponseText returns the last assistant message from Copilot JSONL output', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-copilot-byok-'));
  const lastMessagePath = path.join(root, 'last-message.md');

  const stdout = [
    JSON.stringify({ type: 'assistant.message', data: { content: 'first message' } }),
    JSON.stringify({ type: 'assistant.message', data: { content: 'final message' } })
  ].join('\n');

  const provider = new CopilotByokCliProvider(makeByokOptions(), 'byok');
  const text = await provider.extractResponseText(stdout, '', lastMessagePath);
  assert.equal(text, 'final message');
  assert.equal(await fs.readFile(lastMessagePath, 'utf8'), 'final message');
});

// 10. buildTranscript does not include API key values
test('buildTranscript does not include COPILOT_PROVIDER_API_KEY as a value', () => {
  const provider = new CopilotByokCliProvider(makeByokOptions(), 'byok');
  const req = request();
  const result = {
    strategy: 'cliExec' as const,
    success: true,
    message: 'ok',
    warnings: [],
    exitCode: 0,
    stdout: 'stdout',
    stderr: '',
    args: ['-s', '--no-ask-user'],
    stdinHash: req.promptHash,
    transcriptPath: req.transcriptPath,
    lastMessagePath: req.lastMessagePath,
    lastMessage: 'done'
  };

  const transcript = provider.buildTranscript(result, req);

  // The env var name should appear (as metadata), but not be interpreted as a secret value
  // No actual API key value should be present
  assert.doesNotMatch(transcript, /COPILOT_PROVIDER_API_KEY\s*=\s*\S+/);
  // Only the reference to the env var name appears, not a resolved value
  assert.match(transcript, /COPILOT_PROVIDER_API_KEY/);
  assert.match(transcript, /value not logged/);
});
