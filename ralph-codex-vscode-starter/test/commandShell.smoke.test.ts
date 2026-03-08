import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import * as vscode from 'vscode';
import { activate } from '../src/extension';
import { vscodeTestHarness } from './support/vscodeTestHarness';

class MemoryMemento implements vscode.Memento {
  private readonly values = new Map<string, unknown>();

  public keys(): readonly string[] {
    return Array.from(this.values.keys());
  }

  public get<T>(key: string): T | undefined;
  public get<T>(key: string, defaultValue: T): T;
  public get<T>(key: string, defaultValue?: T): T | undefined {
    return this.values.has(key) ? this.values.get(key) as T : defaultValue;
  }

  public async update(key: string, value: unknown): Promise<void> {
    if (value === undefined) {
      this.values.delete(key);
      return;
    }

    this.values.set(key, value);
  }
}

function createExtensionContext(): vscode.ExtensionContext {
  return {
    subscriptions: [],
    workspaceState: new MemoryMemento()
  } as unknown as vscode.ExtensionContext;
}

function workspaceFolder(rootPath: string): vscode.WorkspaceFolder {
  return {
    uri: vscode.Uri.file(rootPath),
    name: path.basename(rootPath),
    index: 0
  };
}

async function makeTempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ralph-command-shell-'));
}

async function seedWorkspace(rootPath: string): Promise<void> {
  await fs.mkdir(path.join(rootPath, '.ralph', 'artifacts'), { recursive: true });
  await fs.writeFile(path.join(rootPath, '.ralph', 'prd.md'), '# Product / project brief\n\nKeep the extension safe.\n', 'utf8');
  await fs.writeFile(path.join(rootPath, '.ralph', 'progress.md'), '# Progress\n\n- Ready.\n', 'utf8');
  await fs.writeFile(path.join(rootPath, '.ralph', 'tasks.json'), JSON.stringify({
    version: 2,
    tasks: [
      { id: 'T1', title: 'Inspect guardrails', status: 'todo' }
    ]
  }, null, 2), 'utf8');
}

async function readLatestPrompt(rootPath: string): Promise<string> {
  return fs.readFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-prompt.md'), 'utf8');
}

async function readGeneratedPromptName(rootPath: string): Promise<string> {
  const promptFiles = await fs.readdir(path.join(rootPath, '.ralph', 'prompts'));
  const generatedPrompt = promptFiles
    .filter((entry) => entry.endsWith('.prompt.md'))
    .sort()[0];

  assert.ok(generatedPrompt, 'Expected a generated Ralph prompt file.');
  return generatedPrompt;
}

test.beforeEach(() => {
  const harness = vscodeTestHarness();
  harness.reset();
});

test('activate registers the key Ralph commands', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  activate(createExtensionContext());
  const commands = await vscode.commands.getCommands(true);

  assert.ok(commands.includes('ralphCodex.generatePrompt'));
  assert.ok(commands.includes('ralphCodex.runRalphIteration'));
  assert.ok(commands.includes('ralphCodex.runRalphLoop'));
  assert.ok(commands.includes('ralphCodex.showRalphStatus'));
  assert.ok(commands.includes('ralphCodex.openLatestRalphSummary'));
  assert.ok(commands.includes('ralphCodex.openLatestProvenanceBundle'));
  assert.ok(commands.includes('ralphCodex.revealLatestProvenanceBundleDirectory'));
});

test('Show Ralph Status reports preflight details and can open the latest summary artifact', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);
  const latestSummaryPath = path.join(rootPath, '.ralph', 'artifacts', 'latest-summary.md');
  await fs.writeFile(latestSummaryPath, '# Ralph Iteration 3\n\nSummary body.\n', 'utf8');

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
  harness.setMessageChoice('Open Latest Summary');

  activate(createExtensionContext());
  await vscode.commands.executeCommand('ralphCodex.showRalphStatus');

  assert.deepEqual(harness.state.shownDocuments, [latestSummaryPath]);
  assert.equal(harness.state.infoMessages.at(-1)?.items.includes('Open Latest Summary'), true);
  const output = harness.getOutputLines('Ralph Codex').join('\n');
  assert.match(output, /# Ralph Status:/);
  assert.match(output, /## Preflight/);
  assert.match(output, /## Artifacts/);
});

test('Open Latest Ralph Summary explains when no summary artifact exists yet', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  activate(createExtensionContext());
  await vscode.commands.executeCommand('ralphCodex.openLatestRalphSummary');

  assert.equal(harness.state.shownDocuments.length, 0);
  assert.match(
    harness.state.infoMessages.at(-1)?.message ?? '',
    /No Ralph summary exists yet because no CLI iteration has completed and no preflight has been persisted/
  );
});

test('Open Latest Ralph Summary falls back to the latest preflight summary artifact', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);
  const latestPreflightSummaryPath = path.join(rootPath, '.ralph', 'artifacts', 'latest-preflight-summary.md');
  await fs.writeFile(latestPreflightSummaryPath, '# Ralph Preflight 1\n\nBlocked before execution.\n', 'utf8');

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  activate(createExtensionContext());
  await vscode.commands.executeCommand('ralphCodex.openLatestRalphSummary');

  assert.deepEqual(harness.state.shownDocuments, [latestPreflightSummaryPath]);
});

test('Open Latest Provenance Bundle prefers the human-readable provenance summary', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);
  const latestProvenanceSummaryPath = path.join(rootPath, '.ralph', 'artifacts', 'latest-provenance-summary.md');
  await fs.writeFile(latestProvenanceSummaryPath, '# Ralph Provenance run-i001-cli\n\nBundle body.\n', 'utf8');

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  activate(createExtensionContext());
  await vscode.commands.executeCommand('ralphCodex.openLatestProvenanceBundle');

  assert.deepEqual(harness.state.shownDocuments, [latestProvenanceSummaryPath]);
});

test('Prepare Prompt copies the generated prompt when clipboard auto-copy is enabled', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
  harness.setConfiguration({ clipboardAutoCopy: true });

  activate(createExtensionContext());
  await vscode.commands.executeCommand('ralphCodex.generatePrompt');

  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
  assert.equal(harness.state.warningMessages.length, 0);
});

test('Open Codex IDE in clipboard mode copies the prompt without invoking VS Code handoff commands', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
  harness.setConfiguration({
    preferredHandoffMode: 'clipboard',
    openSidebarCommandId: 'chatgpt.openSidebar',
    newChatCommandId: 'chatgpt.newChat'
  });

  activate(createExtensionContext());
  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');

  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), false);
  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), false);
  assert.equal(
    harness.state.infoMessages.at(-1)?.message ?? '',
    `Prompt ready at ${await readGeneratedPromptName(rootPath)}.`
  );
});

test('Open Codex IDE runs configured VS Code handoff commands when ideCommand mode is available', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
  harness.setConfiguration({
    preferredHandoffMode: 'ideCommand',
    openSidebarCommandId: 'chatgpt.openSidebar',
    newChatCommandId: 'chatgpt.newChat'
  });
  harness.setAvailableCommands(['chatgpt.openSidebar', 'chatgpt.newChat']);

  activate(createExtensionContext());
  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');

  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), true);
  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), true);
  assert.equal(harness.state.warningMessages.length, 0);
  assert.equal(
    harness.state.infoMessages.at(-1)?.message ?? '',
    `Prompt ready at ${await readGeneratedPromptName(rootPath)}.`
  );
});

test('Open Codex IDE warns and falls back to manual paste when configured VS Code commands are unavailable', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
  harness.setConfiguration({
    preferredHandoffMode: 'ideCommand',
    openSidebarCommandId: 'chatgpt.openSidebar',
    newChatCommandId: 'chatgpt.newChat'
  });

  activate(createExtensionContext());
  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');

  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
  assert.match(
    harness.state.warningMessages[0]?.message ?? '',
    /The configured Codex sidebar command \(chatgpt\.openSidebar\) was not available\..*The configured Codex new-chat command \(chatgpt\.newChat\) was not available\./
  );
  assert.equal(
    harness.state.warningMessages[1]?.message ?? '',
    `Prompt copied to the clipboard from ${await readGeneratedPromptName(rootPath)}. Open Codex manually and paste it.`
  );
});

test('Open Codex IDE warns when preferredHandoffMode is cliExec and stays on clipboard handoff', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
  harness.setConfiguration({
    preferredHandoffMode: 'cliExec',
    openSidebarCommandId: 'chatgpt.openSidebar',
    newChatCommandId: 'chatgpt.newChat'
  });
  harness.setAvailableCommands(['chatgpt.openSidebar', 'chatgpt.newChat']);

  activate(createExtensionContext());
  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');

  assert.equal(harness.state.clipboardText, await readLatestPrompt(rootPath));
  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.openSidebar'), false);
  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'chatgpt.newChat'), false);
  assert.equal(
    harness.state.warningMessages[0]?.message ?? '',
    'preferredHandoffMode is cliExec. This IDE command still falls back to clipboard handoff; use Run CLI Iteration for codex exec.'
  );
  assert.equal(
    harness.state.infoMessages.at(-1)?.message ?? '',
    `Prompt ready at ${await readGeneratedPromptName(rootPath)}.`
  );
});

test('Reveal Latest Provenance Bundle Directory reveals the newest bundle directory', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);
  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
  harness.setMessageChoice('Open Bundle Manifest');
  const bundleDir = path.join(rootPath, '.ralph', 'artifacts', 'runs', 'run-i001-cli-20260307T000000Z');
  await fs.mkdir(bundleDir, { recursive: true });
  await fs.writeFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-provenance-bundle.json'), JSON.stringify({
    kind: 'provenanceBundle',
    provenanceId: 'run-i001-cli-20260307T000000Z',
    iteration: 1,
    promptKind: 'bootstrap',
    promptTarget: 'cliExec',
    trustLevel: 'verifiedCliExecution',
    status: 'executed',
    summary: 'ok',
    bundleDir
  }, null, 2), 'utf8');

  activate(createExtensionContext());
  await vscode.commands.executeCommand('ralphCodex.revealLatestProvenanceBundleDirectory');

  assert.ok(harness.state.executedCommands.some((entry) =>
    entry.command === 'revealFileInOS'
    && typeof entry.args[0] === 'object'
    && entry.args[0] !== null
    && (entry.args[0] as { fsPath?: string }).fsPath === bundleDir
  ));
  assert.deepEqual(harness.state.shownDocuments, [path.join(bundleDir, 'provenance-bundle.json')]);
});

test('Reveal Latest Provenance Bundle Directory explains when no bundle exists yet', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  activate(createExtensionContext());
  await vscode.commands.executeCommand('ralphCodex.revealLatestProvenanceBundleDirectory');

  assert.match(
    harness.state.infoMessages.at(-1)?.message ?? '',
    /No Ralph provenance bundle exists yet/
  );
});
