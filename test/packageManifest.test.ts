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
const commandRegistrationSourceFiles = [
  path.join(__dirname, '..', '..', 'src', 'commands', 'registerCommands.ts'),
  path.join(__dirname, '..', '..', 'src', 'commands', 'artifactCommands.ts'),
  path.join(__dirname, '..', '..', 'src', 'extension.ts')
];

// Keep this list tiny: these commands are intentionally registered for internal
// flows (status bar/webview wiring) and not surfaced in contributes.commands.
const internalOnlyRegisteredCommands = new Set([
  'ralphCodex.initializeWorkspace',
  'ralphCodex.refreshDashboard',
  'ralphCodex.statusBarQuickPick',
  'ralphCodex.testCurrentProviderConnection'
]);

function duplicateIds(ids: readonly string[]): string[] {
  const counts = new Map<string, number>();
  for (const id of ids) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([id]) => id)
    .sort();
}

async function readRegisteredCommandIds(): Promise<string[]> {
  const commandIds = new Set<string>();

  for (const sourceFile of commandRegistrationSourceFiles) {
    const sourceText = await fs.readFile(sourceFile, 'utf8');

    const commandIdMatches = sourceText.matchAll(/commandId:\s*['"]([^'"]+)['"]/g);
    for (const [, commandId] of commandIdMatches) {
      commandIds.add(commandId);
    }

    const directRegistrationMatches = sourceText.matchAll(/vscode\.commands\.registerCommand\(\s*['"]([^'"]+)['"]/g);
    for (const [, commandId] of directRegistrationMatches) {
      commandIds.add(commandId);
    }
  }

  return Array.from(commandIds).sort();
}

async function readCommandInventory(): Promise<{
  contributedCommandIds: string[];
  activationCommandIds: string[];
  registeredCommandIds: string[];
  registeredPublicCommandIds: string[];
}> {
  const manifest = await readPackageManifest();
  const contributedCommandIds = (manifest.contributes?.commands ?? [])
    .map((entry) => entry.command)
    .filter((command): command is string => Boolean(command));
  const activationCommandIds = (manifest.activationEvents ?? [])
    .filter((event) => event.startsWith('onCommand:'))
    .map((event) => event.slice('onCommand:'.length));
  const registeredCommandIds = await readRegisteredCommandIds();
  const registeredPublicCommandIds = registeredCommandIds
    .filter((commandId) => !internalOnlyRegisteredCommands.has(commandId));

  return {
    contributedCommandIds,
    activationCommandIds,
    registeredCommandIds,
    registeredPublicCommandIds
  };
}

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
    commands.some((entry) => entry.command === 'ralphCodex.runWatchdogAgent' && entry.title === 'Ralphdex: Run Watchdog Agent'),
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
    commands.some((entry) => entry.command === 'ralphCodex.runScmAgent' && entry.title === 'Ralphdex: Run SCM Agent'),
    'package.json must contribute the Run SCM Agent command'
  );
});

test('command manifest has no duplicate contributed command ids', async () => {
  const { contributedCommandIds } = await readCommandInventory();
  assert.deepEqual(
    duplicateIds(contributedCommandIds),
    [],
    'package.json contributes.commands must not contain duplicate command ids'
  );
});

test('command manifest has no duplicate activation command ids', async () => {
  const { activationCommandIds } = await readCommandInventory();
  assert.deepEqual(
    duplicateIds(activationCommandIds),
    [],
    'package.json activationEvents must not contain duplicate onCommand ids'
  );
});

test('every contributed command id is registered in source', async () => {
  const { contributedCommandIds, registeredCommandIds } = await readCommandInventory();
  const registered = new Set(registeredCommandIds);
  const missingRegistrations = contributedCommandIds
    .filter((commandId) => !registered.has(commandId))
    .sort();

  assert.deepEqual(
    missingRegistrations,
    [],
    `Contributed command ids missing runtime registration: ${missingRegistrations.join(', ')}`
  );
});

test('every registered public command id is contributed', async () => {
  const { contributedCommandIds, registeredPublicCommandIds } = await readCommandInventory();
  const contributed = new Set(contributedCommandIds);
  const missingContributions = registeredPublicCommandIds
    .filter((commandId) => !contributed.has(commandId))
    .sort();

  assert.deepEqual(
    missingContributions,
    [],
    `Registered public command ids missing contributes.commands entries: ${missingContributions.join(', ')}`
  );
});

test('every contributed command has an onCommand activation event and no activation event targets unknown commands', async () => {
  const { contributedCommandIds, activationCommandIds } = await readCommandInventory();
  const contributed = new Set(contributedCommandIds);
  const activation = new Set(activationCommandIds);

  const missingActivationEvents = contributedCommandIds
    .filter((commandId) => !activation.has(commandId))
    .sort();
  const unknownActivationCommands = activationCommandIds
    .filter((commandId) => !contributed.has(commandId))
    .sort();

  assert.deepEqual(
    missingActivationEvents,
    [],
    `Contributed command ids missing onCommand activation: ${missingActivationEvents.join(', ')}`
  );
  assert.deepEqual(
    unknownActivationCommands,
    [],
    `onCommand activation events for unknown commands: ${unknownActivationCommands.join(', ')}`
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

test('package manifest contributes and activates the stop loop command', async () => {
  const manifest = await readPackageManifest();
  const commands = manifest.contributes?.commands ?? [];

  assert.ok(
    manifest.activationEvents?.includes('onCommand:ralphCodex.stopLoop'),
    'package.json must activate on ralphCodex.stopLoop'
  );
  assert.ok(
    commands.some((entry) => entry.command === 'ralphCodex.stopLoop' && entry.title === 'Ralphdex: Stop Loop'),
    'package.json must contribute the Stop Loop command'
  );
});

test('package manifest contributes and activates the openPrdWizard command', async () => {
  const manifest = await readPackageManifest();
  const commands = manifest.contributes?.commands ?? [];

  assert.ok(
    manifest.activationEvents?.includes('onCommand:ralphCodex.openPrdWizard'),
    'package.json must activate on ralphCodex.openPrdWizard'
  );
  assert.ok(
    commands.some((entry) => entry.command === 'ralphCodex.openPrdWizard' && entry.title === 'Ralphdex: Open PRD Wizard'),
    'package.json must contribute the Open PRD Wizard command'
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

test('package manifest contributes and activates the showTasks command', async () => {
  const manifest = await readPackageManifest();
  const commands = manifest.contributes?.commands ?? [];

  assert.ok(
    manifest.activationEvents?.includes('onCommand:ralphCodex.showTasks'),
    'package.json must activate on ralphCodex.showTasks'
  );
  assert.ok(
    commands.some((entry) => entry.command === 'ralphCodex.showTasks' && entry.title === 'Ralphdex: Show Tasks'),
    'package.json must contribute the Show Tasks command'
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

test('package manifest does not contribute legacy orchestration sidebar entries', async () => {
  const manifest = await readPackageManifest();
  const views = (manifest.contributes as Record<string, unknown> & { views?: Record<string, Array<{ id?: string; name?: string }>> })?.views ?? {};
  const ralphViews = views['ralphCodex'] ?? [];
  const commands = manifest.contributes?.commands ?? [];

  assert.ok(
    !ralphViews.some((view) => (view.id ?? '').toLowerCase().includes('orchestration')),
    'ralphCodex views must not include legacy orchestration ids'
  );
  assert.ok(
    !ralphViews.some((view) => (view.name ?? '').toLowerCase().includes('orchestration')),
    'ralphCodex views must not include legacy orchestration labels'
  );
  assert.ok(
    !commands.some((command) => (command.command ?? '').toLowerCase().includes('orchestration')),
    'contributed commands must not include legacy orchestration ids'
  );
  assert.ok(
    !commands.some((command) => (command.title ?? '').toLowerCase().includes('orchestration')),
    'contributed commands must not include legacy orchestration labels'
  );
});

test('package manifest excludes the shim entry point from the VSIX payload', async () => {
  // vsce does not support combining "files" in package.json with .vscodeignore.
  // The .vscodeignore blocklist strategy is used here; out/shim/** is excluded explicitly.
  const vscodeignorePath = path.join(__dirname, '..', '..', '.vscodeignore');
  const vscodeignoreContent = await fs.readFile(vscodeignorePath, 'utf8');
  assert.ok(
    vscodeignoreContent.split(/\r?\n/).some(line => line.trim() === 'out/shim/**'),
    '.vscodeignore must exclude out/shim/** from packaged files'
  );
});
