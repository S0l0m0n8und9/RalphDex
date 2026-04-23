import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import * as vscode from 'vscode';
import { activate } from '../src/extension';
import { buildSettingsDiscoveryState } from '../src/config/settingsSurface';
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

function createExtensionContext(sharedState?: MemoryMemento): vscode.ExtensionContext {
  const workspaceState = sharedState ?? new MemoryMemento();
  return {
    subscriptions: [],
    workspaceState,
    globalState: workspaceState,
    extensionUri: vscode.Uri.file(__dirname)
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
  return fs.mkdtemp(path.join(os.tmpdir(), 'ralph-settings-discovery-'));
}

async function seedWorkspace(rootPath: string): Promise<void> {
  await fs.mkdir(path.join(rootPath, '.ralph', 'artifacts'), { recursive: true });
  await fs.writeFile(path.join(rootPath, '.ralph', 'prd.md'), '# PRD\n', 'utf8');
  await fs.writeFile(path.join(rootPath, '.ralph', 'progress.md'), '# Progress\n', 'utf8');
  await fs.writeFile(path.join(rootPath, '.ralph', 'tasks.json'), JSON.stringify({
    version: 2,
    tasks: [{ id: 'T1', title: 'Task', status: 'todo' }]
  }, null, 2), 'utf8');
}

test.beforeEach(() => {
  vscodeTestHarness().reset();
});

test('activate shows a one-time new-settings notification and opens the dashboard settings intent', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
  harness.setMessageChoice('Open Settings Panel');

  const sharedState = new MemoryMemento();
  await sharedState.update(
    'ralphCodex.settingsSurfaceDiscovery',
    buildSettingsDiscoveryState(['autonomyMode'])
  );
  activate(createExtensionContext(sharedState));
  await new Promise((resolve) => setImmediate(resolve));

  const latestInfo = harness.state.infoMessages.at(-1);
  assert.ok(latestInfo, 'expected activation to emit an information message');
  assert.match(latestInfo?.message ?? '', /^Ralphdex: \d+ new settings available$/);
  assert.deepEqual(latestInfo?.items, ['Open Settings Panel']);

  const showDashboardCall = harness.state.executedCommands.find((call) => call.command === 'ralphCodex.showDashboard');
  assert.ok(showDashboardCall, 'expected activation notification action to open the dashboard');
  assert.deepEqual(showDashboardCall?.args[0], {
    activeTab: 'settings',
    focusSettingKey: 'agentCount'
  });

  harness.reset();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
  activate(createExtensionContext(sharedState));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(
    harness.state.infoMessages.some((entry) => /new settings available/.test(entry.message)),
    false,
    'notification should not repeat once the current settings set was acknowledged'
  );
});
