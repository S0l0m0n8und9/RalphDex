import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import test from 'node:test';

type PackageManifest = {
  activationEvents?: string[];
  files?: string[];
  contributes?: {
    configuration?: {
      properties?: Record<string, {
        enum?: string[];
        type?: string;
      }>;
    };
    commands?: Array<{
      command?: string;
      title?: string;
    }>;
  };
};

const packageJsonPath = path.join(__dirname, '..', '..', 'package.json');
const vscodeIgnorePath = path.join(__dirname, '..', '..', '.vscodeignore');

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
    commands.some((entry) => entry.command === 'ralphCodex.runMultiAgentLoop' && entry.title === 'Ralphdex: Run Multi-Agent Loop'),
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
    commands.some((entry) => entry.command === 'ralphCodex.showMultiAgentStatus' && entry.title === 'Ralphdex: Show Multi-Agent Status'),
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

test('package manifest contributes and activates the runPipeline command', async () => {
  const manifest = await readPackageManifest();
  const commands = manifest.contributes?.commands ?? [];

  assert.ok(
    manifest.activationEvents?.includes('onCommand:ralphCodex.runPipeline'),
    'package.json must activate on ralphCodex.runPipeline'
  );
  assert.ok(
    commands.some((entry) => entry.command === 'ralphCodex.runPipeline' && entry.title === 'Ralphdex: Run Pipeline'),
    'package.json must contribute the Run Pipeline command'
  );
});

test('package manifest contributes and activates the approveHumanReview command', async () => {
  const manifest = await readPackageManifest();
  const commands = manifest.contributes?.commands ?? [];

  assert.ok(
    manifest.activationEvents?.includes('onCommand:ralphCodex.approveHumanReview'),
    'package.json must activate on ralphCodex.approveHumanReview'
  );
  assert.ok(
    commands.some((entry) => entry.command === 'ralphCodex.approveHumanReview' && entry.title === 'Ralphdex: Approve Human Review'),
    'package.json must contribute the Approve Human Review command'
  );
});

test('package manifest exposes the pipelineHumanGates boolean setting', async () => {
  const manifest = await readPackageManifest();
  const properties = manifest.contributes?.configuration?.properties ?? {};

  assert.ok(properties['ralphCodex.pipelineHumanGates'], 'pipelineHumanGates setting must be present');
  assert.equal((properties['ralphCodex.pipelineHumanGates'] as { type?: string }).type, 'boolean');
});

test('package manifest contributes and activates the openLatestPipelineRun command', async () => {
  const manifest = await readPackageManifest();
  const commands = manifest.contributes?.commands ?? [];

  assert.ok(
    manifest.activationEvents?.includes('onCommand:ralphCodex.openLatestPipelineRun'),
    'package.json must activate on ralphCodex.openLatestPipelineRun'
  );
  assert.ok(
    commands.some((entry) => entry.command === 'ralphCodex.openLatestPipelineRun' && entry.title === 'Ralphdex: Open Latest Pipeline Run'),
    'package.json must contribute the Open Latest Pipeline Run command'
  );
});

test('package manifest contributes and activates the regeneratePrd command', async () => {
  const manifest = await readPackageManifest();
  const commands = manifest.contributes?.commands ?? [];

  assert.ok(
    manifest.activationEvents?.includes('onCommand:ralphCodex.regeneratePrd'),
    'package.json must activate on ralphCodex.regeneratePrd'
  );
  assert.ok(
    commands.some((entry) => entry.command === 'ralphCodex.regeneratePrd' && entry.title === 'Ralphdex: Regenerate PRD'),
    'package.json must contribute the Regenerate PRD command'
  );
});

test('package manifest contributes and activates the newProjectWizard command', async () => {
  const manifest = await readPackageManifest();
  const commands = manifest.contributes?.commands ?? [];

  assert.ok(
    manifest.activationEvents?.includes('onCommand:ralphCodex.newProjectWizard'),
    'package.json must activate on ralphCodex.newProjectWizard'
  );
  assert.ok(
    commands.some((entry) => entry.command === 'ralphCodex.newProjectWizard' && entry.title === 'Ralphdex: New Project Wizard'),
    'package.json must contribute the New Project Wizard command'
  );
});

test('package manifest contributes and activates the showSidebar command', async () => {
  const manifest = await readPackageManifest();
  const commands = manifest.contributes?.commands ?? [];

  assert.ok(
    manifest.activationEvents?.includes('onCommand:ralphCodex.showSidebar'),
    'package.json must activate on ralphCodex.showSidebar'
  );
  assert.ok(
    commands.some((entry) => entry.command === 'ralphCodex.showSidebar' && entry.title === 'Ralphdex: Show Sidebar'),
    'package.json must contribute the Show Sidebar command'
  );
});

test('package manifest activity bar entry includes placeholder navigation views', async () => {
  const manifest = await readPackageManifest();
  const views = (manifest.contributes as Record<string, unknown> & { views?: Record<string, Array<{ id?: string }>> })?.views ?? {};
  const ralphViews = views['ralphCodex'] ?? [];

  assert.ok(ralphViews.some((v) => v.id === 'ralphCodex.dashboard'), 'ralphCodex container must include dashboard view');
  assert.ok(ralphViews.some((v) => v.id === 'ralphCodex.tasks'), 'ralphCodex container must include placeholder tasks view');
  assert.ok(ralphViews.some((v) => v.id === 'ralphCodex.logs'), 'ralphCodex container must include placeholder logs view');
});

test('package manifest excludes the shim entry point from the VSIX payload', async () => {
  const manifest = await readPackageManifest();
  const vscodeIgnore = await fs.readFile(vscodeIgnorePath, 'utf8');

  assert.ok(manifest.files?.includes('!out/shim/**'), 'package.json must exclude out/shim/** from packaged files');
  assert.match(vscodeIgnore, /^out\/shim\/\*\*$/m, '.vscodeignore must exclude out/shim/**');
});
