import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import test from 'node:test';

type PackageManifest = {
  activationEvents?: string[];
  contributes?: {
    configuration?: {
      properties?: Record<string, {
        enum?: string[];
      }>;
    };
    commands?: Array<{
      command?: string;
      title?: string;
    }>;
  };
};

const packageJsonPath = path.join(__dirname, '..', '..', 'package.json');

async function readPackageManifest(): Promise<PackageManifest> {
  const raw = await fs.readFile(packageJsonPath, 'utf8');
  return JSON.parse(raw) as PackageManifest;
}

test('package manifest contributes and activates the watchdog command', async () => {
  const manifest = await readPackageManifest();
  const commands = manifest.contributes?.commands ?? [];

  assert.ok(
    manifest.activationEvents?.includes('onCommand:ralphCodex.runWatchdogAgent'),
    'package.json must activate on ralphCodex.runWatchdogAgent'
  );
  assert.ok(
    commands.some((entry) => entry.command === 'ralphCodex.runWatchdogAgent' && entry.title === 'Ralph: Run Watchdog Agent'),
    'package.json must contribute the Run Watchdog Agent command'
  );
});

test('package manifest contributes and activates the scm command', async () => {
  const manifest = await readPackageManifest();
  const commands = manifest.contributes?.commands ?? [];

  assert.ok(
    manifest.activationEvents?.includes('onCommand:ralphCodex.runScmAgent'),
    'package.json must activate on ralphCodex.runScmAgent'
  );
  assert.ok(
    commands.some((entry) => entry.command === 'ralphCodex.runScmAgent' && entry.title === 'Ralph: Run SCM Agent'),
    'package.json must contribute the Run SCM Agent command'
  );
});

test('package manifest contributes and activates the multi-agent loop command', async () => {
  const manifest = await readPackageManifest();
  const commands = manifest.contributes?.commands ?? [];

  assert.ok(
    manifest.activationEvents?.includes('onCommand:ralphCodex.runMultiAgentLoop'),
    'package.json must activate on ralphCodex.runMultiAgentLoop'
  );
  assert.ok(
    commands.some((entry) => entry.command === 'ralphCodex.runMultiAgentLoop' && entry.title === 'Ralph Codex: Run Multi-Agent Loop'),
    'package.json must contribute the Run Multi-Agent Loop command'
  );
});

test('package manifest contributes and activates the show multi-agent status command', async () => {
  const manifest = await readPackageManifest();
  const commands = manifest.contributes?.commands ?? [];

  assert.ok(
    manifest.activationEvents?.includes('onCommand:ralphCodex.showMultiAgentStatus'),
    'package.json must activate on ralphCodex.showMultiAgentStatus'
  );
  assert.ok(
    commands.some((entry) => entry.command === 'ralphCodex.showMultiAgentStatus' && entry.title === 'Ralph Codex: Show Multi-Agent Status'),
    'package.json must contribute the Show Multi-Agent Status command'
  );
});

test('package manifest exposes Copilot as a CLI provider with dedicated settings', async () => {
  const manifest = await readPackageManifest();
  const properties = manifest.contributes?.configuration?.properties ?? {};

  assert.ok(properties['ralphCodex.cliProvider']?.enum?.includes('copilot'));
  assert.ok(properties['ralphCodex.copilotCommandPath']);
  assert.ok(properties['ralphCodex.copilotApprovalMode']?.enum?.includes('allow-all'));
});
