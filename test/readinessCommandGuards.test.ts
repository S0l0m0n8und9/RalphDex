import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import * as vscode from 'vscode';
import { activate } from '../src/extension';
import { RalphIterationEngine } from '../src/ralph/iterationEngine';
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

class MemorySecretStorage {
  private readonly values = new Map<string, string>();

  public async get(key: string): Promise<string | undefined> {
    return this.values.get(key);
  }

  public async store(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  public async delete(key: string): Promise<void> {
    this.values.delete(key);
  }
}

function createExtensionContext(): vscode.ExtensionContext {
  return {
    subscriptions: [],
    workspaceState: new MemoryMemento(),
    secrets: new MemorySecretStorage(),
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
  return fs.mkdtemp(path.join(os.tmpdir(), 'ralph-readiness-guards-'));
}

async function seedDefaultPrdWorkspace(rootPath: string): Promise<void> {
  await fs.mkdir(path.join(rootPath, '.ralph', 'artifacts'), { recursive: true });
  await fs.writeFile(path.join(rootPath, '.ralph', 'prd.md'), [
    '# Product / project brief',
    '',
    'Describe the current objective for Ralph here.',
    '',
    '- What should Codex change?',
    '- What constraints matter?',
    '- What does "done" look like?'
  ].join('\n'), 'utf8');
  await fs.writeFile(path.join(rootPath, '.ralph', 'progress.md'), '# Progress\n', 'utf8');
  await fs.writeFile(path.join(rootPath, '.ralph', 'tasks.json'), JSON.stringify({
    version: 2,
    tasks: [
      { id: 'T1', title: 'Do not run against placeholder PRD', status: 'todo' }
    ]
  }, null, 2), 'utf8');
}

function installEngineCallTrap(): () => { runCliIterationCalls: number; preparePromptCalls: number } {
  const originalRunCliIteration = RalphIterationEngine.prototype.runCliIteration;
  const originalPreparePrompt = RalphIterationEngine.prototype.preparePrompt;
  let runCliIterationCalls = 0;
  let preparePromptCalls = 0;

  RalphIterationEngine.prototype.runCliIteration = async function trappedRunCliIteration() {
    runCliIterationCalls += 1;
    throw new Error('runCliIteration must not be called when the PRD is missing/default.');
  } as RalphIterationEngine['runCliIteration'];

  RalphIterationEngine.prototype.preparePrompt = async function trappedPreparePrompt() {
    preparePromptCalls += 1;
    throw new Error('preparePrompt must not be called when the PRD is missing/default.');
  } as RalphIterationEngine['preparePrompt'];

  return () => {
    RalphIterationEngine.prototype.runCliIteration = originalRunCliIteration;
    RalphIterationEngine.prototype.preparePrompt = originalPreparePrompt;
    return { runCliIterationCalls, preparePromptCalls };
  };
}

async function withDefaultPrdCommandHarness<T>(action: () => Promise<T>): Promise<{
  result: T;
  runCliIterationCalls: number;
  preparePromptCalls: number;
  warningText: string;
  createdPanelTitles: string;
  executedCommandIds: string[];
}> {
  const rootPath = await makeTempRoot();
  await seedDefaultPrdWorkspace(rootPath);

  const harness = vscodeTestHarness();
  harness.reset();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
  harness.setConfiguration({
    cliProvider: 'codex',
    autonomyMode: 'supervised',
    autoApplyRemediation: [],
    autoReplenishBacklog: false
  });

  const restore = installEngineCallTrap();
  try {
    activate(createExtensionContext());
    const result = await action();
    const calls = restore();
    return {
      result,
      ...calls,
      warningText: harness.state.warningMessages.map((entry) => entry.message).join('\n'),
      createdPanelTitles: harness.state.createdWebviewPanels.map((panel) => panel.title).join('\n'),
      executedCommandIds: harness.state.executedCommands.map((entry) => entry.command)
    };
  } catch (error) {
    const calls = restore();
    throw Object.assign(error instanceof Error ? error : new Error(String(error)), calls);
  }
}

const noPrdExecutionCommands = [
  'ralphCodex.generatePrompt',
  'ralphCodex.openCodexAndCopyPrompt',
  'ralphCodex.runRalphIteration',
  'ralphCodex.runRalphLoop',
  'ralphCodex.runMultiAgentLoop',
  'ralphCodex.runPipeline'
] as const;

for (const commandId of noPrdExecutionCommands) {
  test(`${commandId} routes default PRD workspaces to readiness before engine execution`, async () => {
    const result = await withDefaultPrdCommandHarness(async () => {
      await vscode.commands.executeCommand(commandId);
    });

    assert.equal(result.runCliIterationCalls, 0, `${commandId} must not call runCliIteration before a real PRD exists.`);
    assert.equal(result.preparePromptCalls, 0, `${commandId} must not call preparePrompt before a real PRD exists.`);
    assert.match(
      result.warningText,
      /RalphDex needs a real PRD before running|PRD wizard is open|real PRD/i,
      `${commandId} should explain that a real PRD is required.`
    );
    assert.ok(
      result.createdPanelTitles.includes('PRD') || result.executedCommandIds.includes('ralphCodex.openPrdWizard'),
      `${commandId} should open or route to the PRD wizard/readiness flow.`
    );
  });
}
