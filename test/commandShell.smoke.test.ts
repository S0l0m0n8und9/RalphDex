import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import * as vscode from 'vscode';
import { activate } from '../src/extension';
import { RalphIterationEngine } from '../src/ralph/iterationEngine';
import { setProcessRunnerOverride } from '../src/services/processRunner';
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

async function writeFailureDiagnosisArtifacts(
  rootPath: string,
  taskId: string,
  overrides: {
    category?: string;
    confidence?: string;
    summary?: string;
    suggestedAction?: string;
    retryPromptAddendum?: string;
    attemptCount?: number;
  } = {}
): Promise<void> {
  const taskArtifactDir = path.join(rootPath, '.ralph', 'artifacts', taskId);
  await fs.mkdir(taskArtifactDir, { recursive: true });
  await fs.writeFile(path.join(taskArtifactDir, 'failure-analysis.json'), JSON.stringify({
    schemaVersion: 1,
    kind: 'failureAnalysis',
    taskId,
    createdAt: '2026-01-01T00:00:00.000Z',
    rootCauseCategory: overrides.category ?? 'validation_mismatch',
    confidence: overrides.confidence ?? 'high',
    summary: overrides.summary ?? `Failure summary for ${taskId}`,
    suggestedAction: overrides.suggestedAction ?? `Suggested action for ${taskId}`,
    ...(overrides.retryPromptAddendum ? { retryPromptAddendum: overrides.retryPromptAddendum } : {})
  }, null, 2), 'utf8');
  await fs.writeFile(path.join(taskArtifactDir, 'recovery-state.json'), JSON.stringify({
    schemaVersion: 1,
    kind: 'recoveryState',
    taskId,
    category: overrides.category ?? 'validation_mismatch',
    attemptCount: overrides.attemptCount ?? 2,
    lastAttemptAt: '2026-01-01T00:00:00.000Z',
    escalated: false,
    ...(overrides.retryPromptAddendum ? { retryPromptAddendum: overrides.retryPromptAddendum } : {})
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

async function readClaimFile(rootPath: string): Promise<{ version: number; claims: Array<{ taskId: string; status: string }> } | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(rootPath, '.ralph', 'claims.json'), 'utf8')) as {
      version: number;
      claims: Array<{ taskId: string; status: string }>;
    };
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';
    if (code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

type MockRunCliIterationResult = Awaited<ReturnType<RalphIterationEngine['runCliIteration']>>;

function createMockRun(
  rootPath: string,
  mode: 'singleExec' | 'loop',
  stopReason: 'control_plane_reload_required' | 'human_review_needed' | 'preflight_blocked' | null,
  overrides: Partial<MockRunCliIterationResult['result']> = {}
): MockRunCliIterationResult {
  const message = stopReason === 'control_plane_reload_required'
    ? 'Control-plane changes require a reload.'
    : stopReason === 'human_review_needed'
      ? 'The current outcome requires explicit human review.'
      : stopReason === 'preflight_blocked'
        ? 'Ralph preflight blocked iteration start. Missing human-authored PRD.'
      : `Mock ${mode} stop.`;

  return {
    prepared: {
      rootPath
    },
    result: {
      iteration: 1,
      executionStatus: stopReason === 'preflight_blocked' ? 'skipped' : 'succeeded',
      summary: 'Iteration summary.',
      completionClassification: 'complete',
      stopReason,
      artifactDir: path.join(rootPath, '.ralph', 'artifacts', 'iteration-001'),
      followUpAction: 'continue_same_task',
      execution: { transcriptPath: undefined },
      ...overrides
    },
    loopDecision: {
      shouldContinue: false,
      message
    },
    createdPaths: []
  } as unknown as MockRunCliIterationResult;
}

async function withMockedRunCliIteration<T>(
  implementation: (
    workspaceFolder: vscode.WorkspaceFolder,
    mode: 'singleExec' | 'loop',
    progress?: vscode.Progress<{ message?: string; increment?: number }>,
    options?: unknown
  ) => Promise<MockRunCliIterationResult>,
  action: () => Promise<T>
): Promise<T> {
  const original = RalphIterationEngine.prototype.runCliIteration;
  RalphIterationEngine.prototype.runCliIteration = function mockedRunCliIteration(
    workspaceFolder: vscode.WorkspaceFolder,
    mode: 'singleExec' | 'loop',
    progress?: vscode.Progress<{ message?: string; increment?: number }>,
    options?: unknown
  ): Promise<MockRunCliIterationResult> {
    return implementation(workspaceFolder, mode, progress, options);
  } as RalphIterationEngine['runCliIteration'];

  try {
    return await action();
  } finally {
    RalphIterationEngine.prototype.runCliIteration = original;
  }
}

async function _withImmediateTimeout<T>(action: () => Promise<T>): Promise<T> {
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = ((callback: (...args: unknown[]) => void, _delay?: number, ...args: unknown[]) => {
    callback(...args);
    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;

  try {
    return await action();
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
}

async function withCapturedTimeouts<T>(
  action: (delays: number[]) => Promise<T>
): Promise<T> {
  const originalSetTimeout = globalThis.setTimeout;
  const delays: number[] = [];
  globalThis.setTimeout = ((callback: (...args: unknown[]) => void, delay?: number, ...args: unknown[]) => {
    delays.push(typeof delay === 'number' ? delay : 0);
    callback(...args);
    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;

  try {
    return await action(delays);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
}

async function withMockedExecuteCommand<T>(
  action: (calls: Array<{ command: string; args: unknown[] }>) => Promise<T>
): Promise<T> {
  const originalExecuteCommand = vscode.commands.executeCommand;
  const calls: Array<{ command: string; args: unknown[] }> = [];
  vscode.commands.executeCommand = (async (command: string, ...args: unknown[]) => {
    calls.push({ command, args });
    return originalExecuteCommand(command, ...args);
  }) as typeof vscode.commands.executeCommand;

  try {
    return await action(calls);
  } finally {
    vscode.commands.executeCommand = originalExecuteCommand;
  }
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
  harness.setConfiguration({
    autonomyMode: 'autonomous',
    autoReloadOnControlPlaneChange: false,
    autoApplyRemediation: [],
    autoReplenishBacklog: false
  });

  activate(createExtensionContext());
  const commands = await vscode.commands.getCommands(true);

  assert.ok(commands.includes('ralphCodex.generatePrompt'));
  assert.ok(commands.includes('ralphCodex.initializeWorkspace'));
  assert.ok(commands.includes('ralphCodex.runRalphIteration'));
  assert.ok(commands.includes('ralphCodex.runRalphLoop'));
  assert.ok(commands.includes('ralphCodex.runReviewAgent'));
  assert.ok(commands.includes('ralphCodex.runScmAgent'));
  assert.ok(commands.includes('ralphCodex.showRalphStatus'));
  assert.ok(commands.includes('ralphCodex.showMultiAgentStatus'));
  assert.ok(commands.includes('ralphCodex.showDashboard'));
  assert.ok(commands.includes('ralphCodex.refreshDashboard'));
  assert.ok(commands.includes('ralphCodex.openFailureDiagnosis'));
  assert.ok(commands.includes('ralphCodex.autoRecoverTask'));
  assert.ok(commands.includes('ralphCodex.skipTask'));
  assert.ok(commands.includes('ralphCodex.openLatestRalphSummary'));
  assert.ok(commands.includes('ralphCodex.openLatestProvenanceBundle'));
  assert.ok(commands.includes('ralphCodex.openLatestPromptEvidence'));
  assert.ok(commands.includes('ralphCodex.openLatestCliTranscript'));
  assert.ok(commands.includes('ralphCodex.applyLatestTaskDecompositionProposal'));
  assert.ok(commands.includes('ralphCodex.resolveStaleTaskClaim'));
  assert.ok(commands.includes('ralphCodex.revealLatestProvenanceBundleDirectory'));
  assert.ok(commands.includes('ralphCodex.cleanupRalphRuntimeArtifacts'));
  assert.ok(commands.includes('ralphCodex.showTasks'));

  const output = harness.getOutputLines('Ralphdex').join('\n');
  assert.match(output, /"message":"Effective Ralph autonomy configuration\."/);
  assert.match(output, /"autonomyMode":"autonomous"/);
  assert.match(output, /"autoReloadOnControlPlaneChange":true/);
  assert.match(output, /"autoApplyRemediation":\["decompose_task","mark_blocked"\]/);
  assert.match(output, /"autoReplenishBacklog":true/);
});

test('Run Review Agent executes a single review pass with the review agent command override', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
  harness.setConfiguration({
    agentId: 'default'
  });

  const invocations: Array<{ mode: 'singleExec' | 'loop'; agentRole?: unknown; agentId?: unknown }> = [];

  await withMockedRunCliIteration(
    async (workspaceFolderArg, mode, _progress, options) => {
      const runOptions = options as { configOverrides?: { agentRole?: unknown; agentId?: unknown } } | undefined;
      invocations.push({
        mode,
        agentRole: runOptions?.configOverrides?.agentRole,
        agentId: runOptions?.configOverrides?.agentId
      });
      return createMockRun(workspaceFolderArg.uri.fsPath, mode, null, {
        followUpAction: 'continue_next_task'
      });
    },
    async () => {
      activate(createExtensionContext());
      await vscode.commands.executeCommand('ralphCodex.runReviewAgent');
    }
  );

  assert.equal(invocations.length, 1);
  assert.deepEqual(invocations[0], {
    mode: 'singleExec',
    agentRole: 'review',
    agentId: 'review-default'
  });
  assert.match(
    harness.state.infoMessages.at(-1)?.message ?? '',
    /Ralph review iteration 1 completed\. Iteration summary\./
  );
});

test('Run Watchdog Agent executes a single watchdog pass with the watchdog agent command override', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
  harness.setConfiguration({
    agentId: 'builder-1'
  });

  const invocations: Array<{ mode: 'singleExec' | 'loop'; agentRole?: unknown; agentId?: unknown }> = [];

  await withMockedRunCliIteration(
    async (workspaceFolderArg, mode, _progress, options) => {
      const runOptions = options as { configOverrides?: { agentRole?: unknown; agentId?: unknown } } | undefined;
      invocations.push({
        mode,
        agentRole: runOptions?.configOverrides?.agentRole,
        agentId: runOptions?.configOverrides?.agentId
      });
      return createMockRun(workspaceFolderArg.uri.fsPath, mode, null, {
        followUpAction: 'continue_next_task'
      });
    },
    async () => {
      activate(createExtensionContext());
      await vscode.commands.executeCommand('ralphCodex.runWatchdogAgent');
    }
  );

  assert.equal(invocations.length, 1);
  assert.deepEqual(invocations[0], {
    mode: 'singleExec',
    agentRole: 'watchdog',
    agentId: 'watchdog'
  });
  assert.match(
    harness.state.infoMessages.at(-1)?.message ?? '',
    /Ralph watchdog iteration 1 completed\. Iteration summary\./
  );
});

test('Run SCM Agent executes a single SCM pass with the scm agent command override', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
  harness.setConfiguration({
    agentId: 'builder-2'
  });

  const invocations: Array<{ mode: 'singleExec' | 'loop'; agentRole?: unknown; agentId?: unknown }> = [];

  await withMockedRunCliIteration(
    async (workspaceFolderArg, mode, _progress, options) => {
      const runOptions = options as { configOverrides?: { agentRole?: unknown; agentId?: unknown } } | undefined;
      invocations.push({
        mode,
        agentRole: runOptions?.configOverrides?.agentRole,
        agentId: runOptions?.configOverrides?.agentId
      });
      return createMockRun(workspaceFolderArg.uri.fsPath, mode, null, {
        followUpAction: 'continue_next_task'
      });
    },
    async () => {
      activate(createExtensionContext());
      await vscode.commands.executeCommand('ralphCodex.runScmAgent');
    }
  );

  assert.equal(invocations.length, 1);
  assert.deepEqual(invocations[0], {
    mode: 'singleExec',
    agentRole: 'scm',
    agentId: 'scm-builder-2'
  });
  assert.match(
    harness.state.infoMessages.at(-1)?.message ?? '',
    /Ralph SCM iteration 1 completed\. Iteration summary\./
  );
});

test('Initialize Workspace creates a fresh .ralph scaffold and preserves a missing-only .gitignore contract', async () => {
  const rootPath = await makeTempRoot();

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  activate(createExtensionContext());
  await vscode.commands.executeCommand('ralphCodex.initializeWorkspace');

  assert.equal(await fs.readFile(path.join(rootPath, '.ralph', 'prd.md'), 'utf8'), '<!-- TODO: Replace with your Ralph objective before running iterations. -->\n');
  assert.equal(await fs.readFile(path.join(rootPath, '.ralph', 'progress.md'), 'utf8'), '');
  const tasksJson = JSON.parse(await fs.readFile(path.join(rootPath, '.ralph', 'tasks.json'), 'utf8'));
  assert.equal(tasksJson.version, 2);
  assert.equal(tasksJson.tasks.length, 2);
  assert.equal(tasksJson.tasks[0].id, 'T1');
  assert.equal(tasksJson.tasks[0].status, 'todo');
  assert.match(tasksJson.tasks[0].notes, /Read the current content of \.ralph\/prd\.md/);
  assert.ok(Array.isArray(tasksJson.tasks[0].acceptance), 'T1 should have acceptance criteria');
  assert.equal(tasksJson.tasks[1].id, 'T2');
  assert.equal(tasksJson.tasks[1].status, 'todo');
  assert.deepEqual(tasksJson.tasks[1].dependsOn, ['T1']);
  assert.match(tasksJson.tasks[1].notes, /create 10 actionable tasks/i);
  assert.ok(Array.isArray(tasksJson.tasks[1].acceptance), 'T2 should keep acceptance criteria');
  assert.equal(await fs.readFile(path.join(rootPath, '.ralph', '.gitignore'), 'utf8'), '/artifacts\n/done-task-audit*.md\n/logs\n/prompts\n/runs\n/state.json\n');
  assert.deepEqual(harness.state.shownDocuments, [
    path.join(rootPath, '.ralph', 'prd.md'),
    path.join(rootPath, '.ralph', 'tasks.json')
  ]);
  assert.match(harness.state.infoMessages.at(-1)?.message ?? '', /Ralph workspace ready/);
});

test('Initialize Workspace aborts with a warning when .ralph/prd.md already exists', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);
  await fs.writeFile(path.join(rootPath, '.ralph', 'tasks.json'), '{"sentinel":true}\n', 'utf8');

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  activate(createExtensionContext());
  await vscode.commands.executeCommand('ralphCodex.initializeWorkspace');

  assert.equal(await fs.readFile(path.join(rootPath, '.ralph', 'tasks.json'), 'utf8'), '{"sentinel":true}\n');
  assert.equal(harness.state.shownDocuments.length, 0);
  assert.match(harness.state.warningMessages.at(-1)?.message ?? '', /\.ralph\/prd\.md already exists/);
});

test('Show Ralph Status routes through the dashboard and writes raw report to output channel', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);
  const latestSummaryPath = path.join(rootPath, '.ralph', 'artifacts', 'latest-summary.md');
  await fs.writeFile(latestSummaryPath, '# Ralph Iteration 3\n\nSummary body.\n', 'utf8');

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
  harness.setMessageChoice('Open Latest Summary');

  activate(createExtensionContext());
  await vscode.commands.executeCommand('ralphCodex.showRalphStatus');

  // Dashboard routing: both commands must have been executed.
  assert.ok(
    harness.state.executedCommands.some((e) => e.command === 'ralphCodex.showDashboard'),
    'showRalphStatus must execute ralphCodex.showDashboard'
  );
  assert.ok(
    harness.state.executedCommands.some((e) => e.command === 'ralphCodex.refreshDashboard'),
    'showRalphStatus must execute ralphCodex.refreshDashboard'
  );

  // Notification reflects dashboard-first flow.
  assert.match(
    harness.state.infoMessages.at(-1)?.message ?? '',
    /available in the dashboard/
  );
  assert.equal(harness.state.infoMessages.at(-1)?.items.includes('Open Latest Summary'), true);

  // Raw report still written to the output channel for audit/debugging.
  const output = harness.getOutputLines('Ralphdex').join('\n');
  assert.match(output, /# Ralph Status:/);
  assert.match(output, /## Preflight/);
  assert.match(output, /## Artifacts/);

  // User choosing 'Open Latest Summary' still opens the artifact.
  assert.deepEqual(harness.state.shownDocuments, [latestSummaryPath]);
});

test('Show Multi-Agent Status routes through the dashboard and writes raw report to output channel', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  activate(createExtensionContext());
  await vscode.commands.executeCommand('ralphCodex.showMultiAgentStatus');

  // Dashboard routing: both commands must have been executed.
  assert.ok(
    harness.state.executedCommands.some((e) => e.command === 'ralphCodex.showDashboard'),
    'showMultiAgentStatus must execute ralphCodex.showDashboard'
  );
  assert.ok(
    harness.state.executedCommands.some((e) => e.command === 'ralphCodex.refreshDashboard'),
    'showMultiAgentStatus must execute ralphCodex.refreshDashboard'
  );

  // Notification reflects dashboard-first flow.
  assert.match(
    harness.state.infoMessages.at(-1)?.message ?? '',
    /available in the dashboard|populate agent state/
  );

  // Raw report still written to the output channel for audit/debugging.
  const output = harness.getOutputLines('Ralphdex').join('\n');
  assert.match(output, /Multi-Agent Status/);
});

test('Show Tasks focuses the task tree view', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  activate(createExtensionContext());
  await vscode.commands.executeCommand('ralphCodex.showTasks');

  assert.ok(
    harness.state.executedCommands.some((entry) => entry.command === 'ralphCodex.tasks.focus'),
    'showTasks must focus the task tree view'
  );
});

test('Test Current Provider Connection reports the active provider readiness using the existing CLI support checks', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
  harness.setConfiguration({
    cliProvider: 'copilot',
    copilotCommandPath: 'copilot'
  });

  activate(createExtensionContext());
  await vscode.commands.executeCommand('ralphCodex.testCurrentProviderConnection');

  const readinessMessage = [
    harness.state.errorMessages.at(-1)?.message ?? '',
    harness.state.warningMessages.at(-1)?.message ?? '',
    harness.state.infoMessages.at(-1)?.message ?? ''
  ].find((message) => message.length > 0) ?? '';

  assert.match(
    readinessMessage,
    /GitHub Copilot CLI (will be resolved from PATH at runtime: copilot|was resolved from PATH and verified:|command could not be resolved from PATH: copilot)/
  );
});

test('Test Current Provider Connection blocks azure-foundry when required auth or endpoint settings are missing', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
  harness.setConfiguration({
    cliProvider: 'azure-foundry',
    azureFoundry: {
      commandPath: 'azure-foundry',
      endpointUrl: '',
      modelDeployment: '',
      apiVersion: '2024-12-01-preview',
      auth: {
        mode: 'env-api-key',
        tenantId: '',
        subscriptionId: '',
        apiKeyEnvVar: '',
        secretStorageKey: ''
      }
    }
  });

  activate(createExtensionContext());
  await vscode.commands.executeCommand('ralphCodex.testCurrentProviderConnection');

  assert.match(
    harness.state.errorMessages.at(-1)?.message ?? '',
    /ralphCodex\.azureFoundry\.endpointUrl is not configured/
  );
});

test('Set Provider Secret stores a value in VS Code SecretStorage without writing workspace settings', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
  const context = createExtensionContext();
  activate(context);

  harness.setInputBoxValue('copilotFoundry.primary');
  const secretPrompts: string[] = [];
  const originalShowInputBox = vscode.window.showInputBox;
  (vscode.window.showInputBox as unknown) = async (options?: vscode.InputBoxOptions) => {
    secretPrompts.push(options?.prompt ?? '');
    if ((options?.prompt ?? '').includes('Secret value')) {
      return 'super-secret-value';
    }
    return 'copilotFoundry.primary';
  };

  try {
    await vscode.commands.executeCommand('ralphCodex.setProviderSecret');
  } finally {
    (vscode.window.showInputBox as unknown) = originalShowInputBox;
  }

  const secrets = (context as unknown as { secrets: MemorySecretStorage }).secrets;
  assert.equal(await secrets.get('copilotFoundry.primary'), 'super-secret-value');
  assert.equal(harness.state.updatedSettings.copilotFoundry, undefined);
});

test('Clear Provider Secret removes a value from VS Code SecretStorage', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
  const context = createExtensionContext();
  const secrets = (context as unknown as { secrets: MemorySecretStorage }).secrets;
  await secrets.store('copilotFoundry.primary', 'super-secret-value');
  activate(context);

  const originalShowInputBox = vscode.window.showInputBox;
  (vscode.window.showInputBox as unknown) = async () => 'copilotFoundry.primary';
  try {
    await vscode.commands.executeCommand('ralphCodex.clearProviderSecret');
  } finally {
    (vscode.window.showInputBox as unknown) = originalShowInputBox;
  }

  assert.equal(await secrets.get('copilotFoundry.primary'), undefined);
  assert.equal(harness.state.updatedSettings.copilotFoundry, undefined);
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

test('Open Latest Ralph Summary repairs a deleted latest summary from latest-result metadata', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);
  const latestSummaryPath = path.join(rootPath, '.ralph', 'artifacts', 'latest-summary.md');
  await fs.writeFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-result.json'), JSON.stringify({
    agentId: 'builder-1',
    iteration: 3,
    provenanceId: 'run-i003-cli-20260307T000600Z',
    selectedTaskId: 'T3',
    selectedTaskTitle: 'Repair stale latest pointers',
    promptKind: 'iteration',
    promptTarget: 'cliExec',
    templatePath: '/tmp/iteration-template.md',
    executionStatus: 'succeeded',
    executionMessage: 'codex exec completed successfully.',
    verificationStatus: 'passed',
    completionClassification: 'complete',
    backlog: {
      remainingTaskCount: 2,
      actionableTaskAvailable: true
    },
    followUpAction: 'continue_next_task',
    stopReason: null,
    remediation: {
      trigger: 'repeated_no_progress',
      taskId: 'T3',
      attemptCount: 2,
      action: 'decompose_task',
      humanReviewRecommended: false,
      summary: 'Task T3 made no durable progress across 2 consecutive attempts; decompose the task into a smaller deterministic unit before rerunning it.',
      evidence: ['same_task_selected_repeatedly', 'no_relevant_file_changes']
    },
    summary: 'Selected T3: Repair stale latest pointers | Execution: succeeded | Verification: passed | Outcome: complete | Backlog remaining: 2',
    artifactDir: path.join(rootPath, '.ralph', 'artifacts', 'iteration-003'),
    summaryPath: path.join(rootPath, '.ralph', 'artifacts', 'iteration-003', 'summary.md'),
    promptPath: path.join(rootPath, '.ralph', 'artifacts', 'iteration-003', 'prompt.md'),
    promptEvidencePath: path.join(rootPath, '.ralph', 'artifacts', 'iteration-003', 'prompt-evidence.json'),
    executionPlanPath: path.join(rootPath, '.ralph', 'artifacts', 'iteration-003', 'execution-plan.json'),
    cliInvocationPath: path.join(rootPath, '.ralph', 'artifacts', 'iteration-003', 'cli-invocation.json'),
    promptArtifactPath: path.join(rootPath, '.ralph', 'artifacts', 'iteration-003', 'prompt.md'),
    promptHash: 'sha256:prompt',
    executionPlanHash: 'sha256:plan',
    executionPayloadMatched: true,
    transcriptPath: path.join(rootPath, '.ralph', 'runs', 'iteration-003.transcript.md'),
    lastMessagePath: path.join(rootPath, '.ralph', 'runs', 'iteration-003.last-message.md'),
    executionSummaryPath: path.join(rootPath, '.ralph', 'artifacts', 'iteration-003', 'execution-summary.json'),
    verifierSummaryPath: path.join(rootPath, '.ralph', 'artifacts', 'iteration-003', 'verifier-summary.json'),
    iterationResultPath: path.join(rootPath, '.ralph', 'artifacts', 'iteration-003', 'iteration-result.json'),
    remediationPath: path.join(rootPath, '.ralph', 'artifacts', 'iteration-003', 'task-remediation.json'),
    diffSummaryPath: null,
    stdoutPath: path.join(rootPath, '.ralph', 'artifacts', 'iteration-003', 'stdout.log'),
    stderrPath: path.join(rootPath, '.ralph', 'artifacts', 'iteration-003', 'stderr.log'),
    completionReportStatus: 'applied',
    reconciliationWarnings: [],
    warnings: [],
    errors: []
  }, null, 2), 'utf8');

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  activate(createExtensionContext());
  await vscode.commands.executeCommand('ralphCodex.openLatestRalphSummary');

  assert.deepEqual(harness.state.shownDocuments, [latestSummaryPath]);
  assert.match(await fs.readFile(latestSummaryPath, 'utf8'), /# Ralph Iteration 3/);
  assert.match(await fs.readFile(latestSummaryPath, 'utf8'), /- Agent ID: builder-1/);
  assert.match(await fs.readFile(latestSummaryPath, 'utf8'), /Remediation: Task T3 made no durable progress/);
});

test('Apply Latest Task Decomposition Proposal explains when no latest remediation artifact exists', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  activate(createExtensionContext());
  await vscode.commands.executeCommand('ralphCodex.applyLatestTaskDecompositionProposal');

  assert.match(
    harness.state.infoMessages.at(-1)?.message ?? '',
    /No latest Ralph remediation proposal exists yet/
  );
});

test('Apply Latest Task Decomposition Proposal explains when the latest remediation is not a decomposition proposal', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);
  await fs.writeFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-remediation.json'), JSON.stringify({
    schemaVersion: 1,
    kind: 'taskRemediation',
    provenanceId: 'run-i002-cli-20260310T091148Z',
    iteration: 2,
    selectedTaskId: 'T1',
    selectedTaskTitle: 'Inspect guardrails',
    trigger: 'repeated_identical_failure',
    attemptCount: 2,
    action: 'request_human_review',
    humanReviewRecommended: true,
    summary: 'Task T1 failed in the same way 2 times; request a human review before another retry.',
    rationale: 'The task needs a person to review the repeated failure.',
    proposedAction: 'Request human review.',
    evidence: ['validation_failure_signature:npm test::exit:1::deterministic'],
    triggeringHistory: [],
    suggestedChildTasks: [],
    artifactDir: path.join(rootPath, '.ralph', 'artifacts', 'iteration-002'),
    iterationResultPath: path.join(rootPath, '.ralph', 'artifacts', 'iteration-002', 'iteration-result.json'),
    createdAt: '2026-03-10T09:11:48.574Z'
  }, null, 2), 'utf8');

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  activate(createExtensionContext());
  await vscode.commands.executeCommand('ralphCodex.applyLatestTaskDecompositionProposal');

  assert.match(
    harness.state.infoMessages.at(-1)?.message ?? '',
    /does not contain an applicable task-decomposition proposal/
  );
});

test('Apply Latest Task Decomposition Proposal explains when the latest decomposition remediation has no child tasks to apply', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);
  await fs.writeFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-remediation.json'), JSON.stringify({
    schemaVersion: 1,
    kind: 'taskRemediation',
    provenanceId: 'run-i002-cli-20260310T091148Z',
    iteration: 2,
    selectedTaskId: 'T1',
    selectedTaskTitle: 'Inspect guardrails',
    trigger: 'repeated_no_progress',
    attemptCount: 2,
    action: 'decompose_task',
    humanReviewRecommended: false,
    summary: 'Task T1 made no durable progress across 2 consecutive attempts; decompose the task into smaller bounded steps before rerunning it.',
    rationale: 'The task is compound and needs a bounded first step.',
    proposedAction: 'Accept the child-task proposal before retrying T1.',
    evidence: ['same_task_selected_repeatedly', 'no_relevant_file_changes'],
    triggeringHistory: [],
    suggestedChildTasks: [],
    artifactDir: path.join(rootPath, '.ralph', 'artifacts', 'iteration-002'),
    iterationResultPath: path.join(rootPath, '.ralph', 'artifacts', 'iteration-002', 'iteration-result.json'),
    createdAt: '2026-03-10T09:11:48.574Z'
  }, null, 2), 'utf8');

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  activate(createExtensionContext());
  await vscode.commands.executeCommand('ralphCodex.applyLatestTaskDecompositionProposal');

  assert.match(
    harness.state.infoMessages.at(-1)?.message ?? '',
    /does not contain an applicable task-decomposition proposal/
  );
});

test('Apply Latest Task Decomposition Proposal requires explicit approval before editing tasks.json', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);
  await fs.writeFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-remediation.json'), JSON.stringify({
    schemaVersion: 1,
    kind: 'taskRemediation',
    provenanceId: 'run-i002-cli-20260310T091148Z',
    iteration: 2,
    selectedTaskId: 'T1',
    selectedTaskTitle: 'Inspect guardrails',
    trigger: 'repeated_no_progress',
    attemptCount: 2,
    action: 'decompose_task',
    humanReviewRecommended: false,
    summary: 'Task T1 made no durable progress across 2 consecutive attempts; decompose the task into smaller bounded steps before rerunning it.',
    rationale: 'The task is compound and needs a bounded first step.',
    proposedAction: 'Accept the child-task proposal before retrying T1.',
    evidence: ['same_task_selected_repeatedly', 'no_relevant_file_changes'],
    triggeringHistory: [],
    suggestedChildTasks: [
      {
        id: 'T1.1',
        title: 'Reproduce the blocker',
        parentId: 'T1',
        dependsOn: [],
        validation: 'npm test',
        rationale: 'First bounded step.'
      }
    ],
    artifactDir: path.join(rootPath, '.ralph', 'artifacts', 'iteration-002'),
    iterationResultPath: path.join(rootPath, '.ralph', 'artifacts', 'iteration-002', 'iteration-result.json'),
    createdAt: '2026-03-10T09:11:48.574Z'
  }, null, 2), 'utf8');

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  activate(createExtensionContext());
  await vscode.commands.executeCommand('ralphCodex.applyLatestTaskDecompositionProposal');

  const taskFile = JSON.parse(await fs.readFile(path.join(rootPath, '.ralph', 'tasks.json'), 'utf8')) as {
    tasks: Array<{ id: string; dependsOn?: string[] }>;
  };
  assert.deepEqual(taskFile.tasks.map((task) => task.id), ['T1']);
  assert.equal(harness.state.shownDocuments.length, 0);
  assert.match(harness.state.warningMessages.at(-1)?.message ?? '', /Apply the latest Ralph decomposition proposal for T1/);
});

test('Apply Latest Task Decomposition Proposal updates tasks.json after approval', async () => {
  const rootPath = await makeTempRoot();
  await fs.mkdir(path.join(rootPath, '.ralph', 'artifacts'), { recursive: true });
  await fs.writeFile(path.join(rootPath, '.ralph', 'prd.md'), '# Product / project brief\n\nKeep the extension safe.\n', 'utf8');
  await fs.writeFile(path.join(rootPath, '.ralph', 'progress.md'), '# Progress\n\n- Ready.\n', 'utf8');
  await fs.writeFile(path.join(rootPath, '.ralph', 'tasks.json'), JSON.stringify({
    version: 2,
    tasks: [
      { id: 'T0', title: 'Foundation', status: 'done' },
      { id: 'T1', title: 'Inspect guardrails', status: 'todo', dependsOn: ['T0'] }
    ]
  }, null, 2), 'utf8');
  await fs.writeFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-remediation.json'), JSON.stringify({
    schemaVersion: 1,
    kind: 'taskRemediation',
    provenanceId: 'run-i002-cli-20260310T091148Z',
    iteration: 2,
    selectedTaskId: 'T1',
    selectedTaskTitle: 'Inspect guardrails',
    trigger: 'repeated_no_progress',
    attemptCount: 2,
    action: 'decompose_task',
    humanReviewRecommended: false,
    summary: 'Task T1 made no durable progress across 2 consecutive attempts; decompose the task into smaller bounded steps before rerunning it.',
    rationale: 'The task is compound and needs a bounded first step.',
    proposedAction: 'Accept the child-task proposal before retrying T1.',
    evidence: ['same_task_selected_repeatedly', 'no_relevant_file_changes'],
    triggeringHistory: [],
    suggestedChildTasks: [
      {
        id: 'T1.1',
        title: 'Reproduce the blocker',
        parentId: 'T1',
        dependsOn: [],
        validation: 'npm test',
        rationale: 'First bounded step.'
      },
      {
        id: 'T1.2',
        title: 'Implement the smallest fix',
        parentId: 'T1',
        dependsOn: [{ taskId: 'T1.1', reason: 'blocks_sequence' }],
        validation: 'npm test',
        rationale: 'Second bounded step.'
      }
    ],
    artifactDir: path.join(rootPath, '.ralph', 'artifacts', 'iteration-002'),
    iterationResultPath: path.join(rootPath, '.ralph', 'artifacts', 'iteration-002', 'iteration-result.json'),
    createdAt: '2026-03-10T09:11:48.574Z'
  }, null, 2), 'utf8');

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
  harness.setMessageChoice('Apply Proposal');

  activate(createExtensionContext());
  await vscode.commands.executeCommand('ralphCodex.applyLatestTaskDecompositionProposal');

  const taskFile = JSON.parse(await fs.readFile(path.join(rootPath, '.ralph', 'tasks.json'), 'utf8')) as {
    tasks: Array<{ id: string; parentId?: string; dependsOn?: string[]; notes?: string }>;
  };
  assert.deepEqual(taskFile.tasks.map((task) => task.id), ['T0', 'T1', 'T1.1', 'T1.2']);
  assert.deepEqual(taskFile.tasks[1]?.dependsOn, ['T0', 'T1.1', 'T1.2']);
  assert.equal(taskFile.tasks[2]?.parentId, 'T1');
  assert.equal(taskFile.tasks[3]?.parentId, 'T1');
  assert.equal(taskFile.tasks[2]?.notes, 'First bounded step.');
  assert.deepEqual(harness.state.shownDocuments, [path.join(rootPath, '.ralph', 'tasks.json')]);
  assert.match(
    harness.state.infoMessages.at(-1)?.message ?? '',
    /Applied the latest Ralph decomposition proposal/
  );
});

test('Apply Latest Task Decomposition Proposal leaves tasks.json unchanged when the approved proposal is malformed', async () => {
  const rootPath = await makeTempRoot();
  await fs.mkdir(path.join(rootPath, '.ralph', 'artifacts'), { recursive: true });
  await fs.writeFile(path.join(rootPath, '.ralph', 'prd.md'), '# Product / project brief\n\nKeep the extension safe.\n', 'utf8');
  await fs.writeFile(path.join(rootPath, '.ralph', 'progress.md'), '# Progress\n\n- Ready.\n', 'utf8');
  await fs.writeFile(path.join(rootPath, '.ralph', 'tasks.json'), JSON.stringify({
    version: 2,
    tasks: [
      { id: 'T0', title: 'Foundation', status: 'done' },
      { id: 'T1', title: 'Inspect guardrails', status: 'todo', dependsOn: ['T0'] }
    ]
  }, null, 2), 'utf8');
  await fs.writeFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-remediation.json'), JSON.stringify({
    schemaVersion: 1,
    kind: 'taskRemediation',
    provenanceId: 'run-i002-cli-20260310T091148Z',
    iteration: 2,
    selectedTaskId: 'T1',
    selectedTaskTitle: 'Inspect guardrails',
    trigger: 'repeated_no_progress',
    attemptCount: 2,
    action: 'decompose_task',
    humanReviewRecommended: false,
    summary: 'Task T1 made no durable progress across 2 consecutive attempts; decompose the task into smaller bounded steps before rerunning it.',
    rationale: 'The task is compound and needs a bounded first step.',
    proposedAction: 'Accept the child-task proposal before retrying T1.',
    evidence: ['same_task_selected_repeatedly', 'no_relevant_file_changes'],
    triggeringHistory: [],
    suggestedChildTasks: [
      {
        id: 'T1.1',
        title: 'Reproduce the blocker',
        parentId: 'T1',
        dependsOn: [{ taskId: 'MISSING', reason: 'blocks_sequence' }],
        validation: 'npm test',
        rationale: 'First bounded step.'
      }
    ],
    artifactDir: path.join(rootPath, '.ralph', 'artifacts', 'iteration-002'),
    iterationResultPath: path.join(rootPath, '.ralph', 'artifacts', 'iteration-002', 'iteration-result.json'),
    createdAt: '2026-03-10T09:11:48.574Z'
  }, null, 2), 'utf8');

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
  harness.setMessageChoice('Apply Proposal');

  activate(createExtensionContext());
  await vscode.commands.executeCommand('ralphCodex.applyLatestTaskDecompositionProposal');

  const taskFile = JSON.parse(await fs.readFile(path.join(rootPath, '.ralph', 'tasks.json'), 'utf8')) as {
    tasks: Array<{ id: string; dependsOn?: string[] }>;
  };
  assert.deepEqual(taskFile.tasks.map((task) => task.id), ['T0', 'T1']);
  assert.deepEqual(taskFile.tasks[1]?.dependsOn, ['T0']);
  assert.equal(harness.state.shownDocuments.length, 0);
  assert.match(
    harness.state.errorMessages.at(-1)?.message ?? '',
    /child task T1\.1 depends on missing task MISSING/
  );
});

test('Resolve Stale Task Claim explains when no stale claim exists', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  activate(createExtensionContext());
  await vscode.commands.executeCommand('ralphCodex.resolveStaleTaskClaim');

  assert.match(
    harness.state.infoMessages.at(-1)?.message ?? '',
    /No stale active task claim exists to resolve/
  );
});

test('Resolve Stale Task Claim marks the canonical stale claim and surfaces the recovery in status output', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);
  await fs.writeFile(path.join(rootPath, '.ralph', 'claims.json'), JSON.stringify({
    version: 1,
    claims: [
      {
        taskId: 'T1',
        agentId: 'default',
        provenanceId: 'run-i001-cli-20260307T000000Z',
        claimedAt: '2026-03-07T00:00:00.000Z',
        status: 'active'
      }
    ]
  }, null, 2), 'utf8');

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
  harness.setMessageChoice('Mark Claim Stale');

  activate(createExtensionContext());
  await vscode.commands.executeCommand('ralphCodex.resolveStaleTaskClaim');

  const claims = JSON.parse(await fs.readFile(path.join(rootPath, '.ralph', 'claims.json'), 'utf8')) as {
    claims: Array<{
      status: string;
      resolvedAt?: string;
      resolutionReason?: string;
      provenanceId: string;
    }>;
  };
  assert.equal(claims.claims[0]?.status, 'stale');
  assert.equal(claims.claims[0]?.provenanceId, 'run-i001-cli-20260307T000000Z');
  assert.match(claims.claims[0]?.resolvedAt ?? '', /^\d{4}-\d{2}-\d{2}T/);
  assert.match(claims.claims[0]?.resolutionReason ?? '', /eligible for operator recovery because the canonical claim was stale/);
  assert.match(
    harness.state.infoMessages.at(-1)?.message ?? '',
    /Marked stale claim for T1 held by default\/run-i001-cli-20260307T000000Z as stale/
  );

  await vscode.commands.executeCommand('ralphCodex.showRalphStatus');

  const output = harness.getOutputLines('Ralphdex').join('\n');
  assert.match(output, /Latest claim resolution: T1 default\/run-i001-cli-20260307T000000Z -> stale/);
  assert.match(output, /stale_claim_resolved/);
});

test('Resolve Stale Task Claim refuses to resolve while codex exec still appears active', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);
  await fs.writeFile(path.join(rootPath, '.ralph', 'claims.json'), JSON.stringify({
    version: 1,
    claims: [
      {
        taskId: 'T1',
        agentId: 'default',
        provenanceId: 'run-i001-cli-20260307T000000Z',
        claimedAt: '2026-03-07T00:00:00.000Z',
        status: 'active'
      }
    ]
  }, null, 2), 'utf8');
  await fs.writeFile(path.join(rootPath, '.ralph', 'active-codex-processes.txt'), 'codex exec --model gpt-5.4\n', 'utf8');

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  activate(createExtensionContext());
  await vscode.commands.executeCommand('ralphCodex.resolveStaleTaskClaim');

  const claims = JSON.parse(await fs.readFile(path.join(rootPath, '.ralph', 'claims.json'), 'utf8')) as {
    claims: Array<{ status: string }>;
  };
  assert.equal(claims.claims[0]?.status, 'active');
  assert.match(
    harness.state.warningMessages.at(-1)?.message ?? '',
    /Cannot resolve stale claim for T1 because a codex exec process is still running/
  );
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

test('Open Latest Provenance Bundle repairs a deleted summary from the latest bundle manifest', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);
  const latestProvenanceSummaryPath = path.join(rootPath, '.ralph', 'artifacts', 'latest-provenance-summary.md');
  await fs.writeFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-provenance-bundle.json'), JSON.stringify({
    kind: 'provenanceBundle',
    schemaVersion: 1,
    provenanceId: 'run-i003-cli-20260307T000600Z',
    iteration: 3,
    promptKind: 'iteration',
    promptTarget: 'cliExec',
    trustLevel: 'verifiedCliExecution',
    status: 'executed',
    summary: 'Bundle summary',
    rootPolicy: {
      workspaceRootPath: rootPath,
      inspectionRootPath: rootPath,
      executionRootPath: rootPath,
      verificationRootPath: rootPath,
      selectionStrategy: 'workspaceRoot',
      selectionSummary: 'Using the workspace root.',
      policySummary: 'Inspect, execute, and verify from the workspace root.'
    },
    selectedTaskId: 'T3',
    selectedTaskTitle: 'Repair stale latest pointers',
    artifactDir: path.join(rootPath, '.ralph', 'artifacts', 'iteration-003'),
    bundleDir: path.join(rootPath, '.ralph', 'artifacts', 'runs', 'run-i003-cli-20260307T000600Z'),
    preflightReportPath: path.join(rootPath, '.ralph', 'artifacts', 'runs', 'run-i003-cli-20260307T000600Z', 'preflight-report.json'),
    preflightSummaryPath: path.join(rootPath, '.ralph', 'artifacts', 'runs', 'run-i003-cli-20260307T000600Z', 'preflight-summary.md'),
    promptArtifactPath: path.join(rootPath, '.ralph', 'artifacts', 'runs', 'run-i003-cli-20260307T000600Z', 'prompt.md'),
    promptEvidencePath: path.join(rootPath, '.ralph', 'artifacts', 'runs', 'run-i003-cli-20260307T000600Z', 'prompt-evidence.json'),
    executionPlanPath: path.join(rootPath, '.ralph', 'artifacts', 'runs', 'run-i003-cli-20260307T000600Z', 'execution-plan.json'),
    executionPlanHash: 'sha256:plan',
    cliInvocationPath: path.join(rootPath, '.ralph', 'artifacts', 'runs', 'run-i003-cli-20260307T000600Z', 'cli-invocation.json'),
    iterationResultPath: path.join(rootPath, '.ralph', 'artifacts', 'runs', 'run-i003-cli-20260307T000600Z', 'iteration-result.json'),
    provenanceFailurePath: null,
    provenanceFailureSummaryPath: null,
    promptHash: 'sha256:prompt',
    promptByteLength: 123,
    executionPayloadHash: 'sha256:payload',
    executionPayloadMatched: true,
    mismatchReason: null,
    createdAt: '2026-03-07T00:06:00.000Z',
    updatedAt: '2026-03-07T00:06:00.000Z'
  }, null, 2), 'utf8');

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  activate(createExtensionContext());
  await vscode.commands.executeCommand('ralphCodex.openLatestProvenanceBundle');

  assert.deepEqual(harness.state.shownDocuments, [latestProvenanceSummaryPath]);
  assert.match(await fs.readFile(latestProvenanceSummaryPath, 'utf8'), /# Ralph Provenance run-i003-cli-20260307T000600Z/);
});

test('Open Latest Prompt Evidence opens the stable latest prompt evidence artifact', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);
  const latestPromptEvidencePath = path.join(rootPath, '.ralph', 'artifacts', 'latest-prompt-evidence.json');
  await fs.writeFile(latestPromptEvidencePath, JSON.stringify({
    kind: 'promptEvidence',
    schemaVersion: 1,
    provenanceId: 'run-i001-ide-20260307T000100Z',
    iteration: 1,
    promptKind: 'iteration'
  }, null, 2), 'utf8');

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  activate(createExtensionContext());
  await vscode.commands.executeCommand('ralphCodex.openLatestPromptEvidence');

  assert.deepEqual(harness.state.shownDocuments, [latestPromptEvidencePath]);
});

test('Open Latest Prompt Evidence explains when no prompt evidence exists yet', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  activate(createExtensionContext());
  await vscode.commands.executeCommand('ralphCodex.openLatestPromptEvidence');

  assert.equal(harness.state.shownDocuments.length, 0);
  assert.match(harness.state.infoMessages.at(-1)?.message ?? '', /No Ralph prompt evidence exists yet/);
});

test('Open Latest CLI Transcript prefers the transcript artifact from the latest CLI invocation', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);
  const runDir = path.join(rootPath, '.ralph', 'runs');
  const transcriptPath = path.join(runDir, 'iteration-003.transcript.md');
  const lastMessagePath = path.join(runDir, 'iteration-003.last-message.md');
  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(transcriptPath, '# Transcript\n\nok\n', 'utf8');
  await fs.writeFile(lastMessagePath, 'ok\n', 'utf8');
  await fs.writeFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-cli-invocation.json'), JSON.stringify({
    kind: 'cliInvocation',
    schemaVersion: 1,
    provenanceId: 'run-i003-cli-20260307T000600Z',
    iteration: 3,
    commandPath: 'codex',
    args: ['exec'],
    workspaceRoot: rootPath,
    rootPolicy: {
      workspaceRootPath: rootPath,
      inspectionRootPath: rootPath,
      executionRootPath: rootPath,
      verificationRootPath: rootPath,
      selectionStrategy: 'workspaceRoot',
      selectionSummary: 'Using the workspace root.',
      policySummary: 'Inspect, execute, and verify from the workspace root.'
    },
    promptArtifactPath: path.join(rootPath, '.ralph', 'artifacts', 'iteration-003', 'prompt.md'),
    promptHash: 'sha256:prompt',
    promptByteLength: 123,
    stdinHash: 'sha256:stdin',
    transcriptPath,
    lastMessagePath,
    createdAt: '2026-03-07T00:06:00.000Z'
  }, null, 2), 'utf8');

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  activate(createExtensionContext());
  await vscode.commands.executeCommand('ralphCodex.openLatestCliTranscript');

  assert.deepEqual(harness.state.shownDocuments, [transcriptPath]);
});

test('Open Latest CLI Transcript falls back to the last-message artifact when the transcript path is absent', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);
  const runDir = path.join(rootPath, '.ralph', 'runs');
  const lastMessagePath = path.join(runDir, 'iteration-003.last-message.md');
  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(lastMessagePath, 'ok\n', 'utf8');
  await fs.writeFile(path.join(rootPath, '.ralph', 'state.json'), JSON.stringify({
    version: 2,
    objectivePreview: null,
    nextIteration: 4,
    lastPromptKind: 'iteration',
    lastPromptPath: null,
    lastRun: {
      iteration: 3,
      mode: 'singleExec',
      promptKind: 'iteration',
      startedAt: '2026-03-07T00:00:00.000Z',
      finishedAt: '2026-03-07T00:05:00.000Z',
      status: 'succeeded',
      exitCode: 0,
      promptPath: path.join(rootPath, '.ralph', 'prompts', 'iteration-003.prompt.md'),
      lastMessagePath,
      summary: 'Iteration 3 succeeded.'
    },
    runHistory: [],
    lastIteration: null,
    iterationHistory: [],
    updatedAt: '2026-03-07T00:05:00.000Z'
  }, null, 2), 'utf8');

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  activate(createExtensionContext());
  await vscode.commands.executeCommand('ralphCodex.openLatestCliTranscript');

  assert.deepEqual(harness.state.shownDocuments, [lastMessagePath]);
});

test('Open Latest CLI Transcript falls back to the last-message artifact when the transcript file was deleted', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);
  const runDir = path.join(rootPath, '.ralph', 'runs');
  const transcriptPath = path.join(runDir, 'iteration-003.transcript.md');
  const lastMessagePath = path.join(runDir, 'iteration-003.last-message.md');
  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(lastMessagePath, 'ok\n', 'utf8');
  await fs.writeFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-cli-invocation.json'), JSON.stringify({
    kind: 'cliInvocation',
    schemaVersion: 1,
    provenanceId: 'run-i003-cli-20260307T000600Z',
    iteration: 3,
    commandPath: 'codex',
    args: ['exec'],
    workspaceRoot: rootPath,
    rootPolicy: {
      workspaceRootPath: rootPath,
      inspectionRootPath: rootPath,
      executionRootPath: rootPath,
      verificationRootPath: rootPath,
      selectionStrategy: 'workspaceRoot',
      selectionSummary: 'Using the workspace root.',
      policySummary: 'Inspect, execute, and verify from the workspace root.'
    },
    promptArtifactPath: path.join(rootPath, '.ralph', 'artifacts', 'iteration-003', 'prompt.md'),
    promptHash: 'sha256:prompt',
    promptByteLength: 123,
    stdinHash: 'sha256:stdin',
    transcriptPath,
    lastMessagePath,
    createdAt: '2026-03-07T00:06:00.000Z'
  }, null, 2), 'utf8');

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  activate(createExtensionContext());
  await vscode.commands.executeCommand('ralphCodex.openLatestCliTranscript');

  assert.deepEqual(harness.state.shownDocuments, [lastMessagePath]);
});

test('Open Latest CLI Transcript falls back to state-backed run artifacts when latest invocation paths are stale', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);
  const runDir = path.join(rootPath, '.ralph', 'runs');
  const staleTranscriptPath = path.join(runDir, 'iteration-003.transcript.md');
  const staleLastMessagePath = path.join(runDir, 'iteration-003.last-message.md');
  const currentTranscriptPath = path.join(runDir, 'iteration-004.transcript.md');
  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(currentTranscriptPath, '# Transcript\n\ncurrent\n', 'utf8');
  await fs.writeFile(path.join(rootPath, '.ralph', 'artifacts', 'latest-cli-invocation.json'), JSON.stringify({
    kind: 'cliInvocation',
    schemaVersion: 1,
    provenanceId: 'run-i003-cli-20260307T000600Z',
    iteration: 3,
    commandPath: 'codex',
    args: ['exec'],
    workspaceRoot: rootPath,
    rootPolicy: {
      workspaceRootPath: rootPath,
      inspectionRootPath: rootPath,
      executionRootPath: rootPath,
      verificationRootPath: rootPath,
      selectionStrategy: 'workspaceRoot',
      selectionSummary: 'Using the workspace root.',
      policySummary: 'Inspect, execute, and verify from the workspace root.'
    },
    promptArtifactPath: path.join(rootPath, '.ralph', 'artifacts', 'iteration-003', 'prompt.md'),
    promptHash: 'sha256:prompt',
    promptByteLength: 123,
    stdinHash: 'sha256:stdin',
    transcriptPath: staleTranscriptPath,
    lastMessagePath: staleLastMessagePath,
    createdAt: '2026-03-07T00:06:00.000Z'
  }, null, 2), 'utf8');
  await fs.writeFile(path.join(rootPath, '.ralph', 'state.json'), JSON.stringify({
    version: 2,
    objectivePreview: null,
    nextIteration: 5,
    lastPromptKind: 'iteration',
    lastPromptPath: null,
    lastRun: {
      iteration: 4,
      mode: 'singleExec',
      promptKind: 'iteration',
      startedAt: '2026-03-07T00:10:00.000Z',
      finishedAt: '2026-03-07T00:15:00.000Z',
      status: 'succeeded',
      exitCode: 0,
      promptPath: path.join(rootPath, '.ralph', 'prompts', 'iteration-004.prompt.md'),
      transcriptPath: currentTranscriptPath,
      summary: 'Iteration 4 succeeded.'
    },
    runHistory: [],
    lastIteration: null,
    iterationHistory: [],
    updatedAt: '2026-03-07T00:15:00.000Z'
  }, null, 2), 'utf8');

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  activate(createExtensionContext());
  await vscode.commands.executeCommand('ralphCodex.openLatestCliTranscript');

  assert.deepEqual(harness.state.shownDocuments, [currentTranscriptPath]);
});

test('Open Latest CLI Transcript explains when no CLI run artifacts exist yet', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  activate(createExtensionContext());
  await vscode.commands.executeCommand('ralphCodex.openLatestCliTranscript');

  assert.equal(harness.state.shownDocuments.length, 0);
  assert.match(harness.state.infoMessages.at(-1)?.message ?? '', /No Ralph CLI transcript exists yet/);
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

test('Prepare Prompt does not create a durable active claim for the selected task', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  activate(createExtensionContext());
  await vscode.commands.executeCommand('ralphCodex.generatePrompt');

  const claims = await readClaimFile(rootPath);
  assert.ok(claims === null || claims.claims.every((claim) => claim.status !== 'active'));
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

test('Open Codex IDE does not create a durable active claim for the selected task', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
  harness.setConfiguration({
    preferredHandoffMode: 'clipboard'
  });

  activate(createExtensionContext());
  await vscode.commands.executeCommand('ralphCodex.openCodexAndCopyPrompt');

  const claims = await readClaimFile(rootPath);
  assert.ok(claims === null || claims.claims.every((claim) => claim.status !== 'active'));
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

test('Run CLI Loop does not auto-reload when control-plane reload is required but the setting is disabled', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
  harness.setConfiguration({
    autoReloadOnControlPlaneChange: false
  });

  const seenModes: Array<'singleExec' | 'loop'> = [];
  const executeCalls = await withMockedExecuteCommand(async (calls) => {
    await withMockedRunCliIteration(
      async (workspaceFolderArg, mode) => {
        seenModes.push(mode);
        return createMockRun(workspaceFolderArg.uri.fsPath, mode, 'control_plane_reload_required');
      },
      async () => {
        activate(createExtensionContext());
        await vscode.commands.executeCommand('ralphCodex.runRalphLoop');
      }
    );
    return calls;
  });

  assert.deepEqual(seenModes, ['loop']);
  assert.equal(executeCalls.some((entry) => entry.command === 'workbench.action.reloadWindow'), false);
  assert.match(
    harness.state.infoMessages.at(-1)?.message ?? '',
    /Ralph CLI loop stopped after iteration 1: Control-plane changes require a reload\./
  );
});

test('Run CLI Iteration does not auto-reload on a control-plane reload stop even when the setting is enabled', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
  harness.setConfiguration({
    autoReloadOnControlPlaneChange: true
  });

  const seenModes: Array<'singleExec' | 'loop'> = [];
  const executeCalls = await withMockedExecuteCommand(async (calls) => {
    await withMockedRunCliIteration(
      async (workspaceFolderArg, mode) => {
        seenModes.push(mode);
        return createMockRun(workspaceFolderArg.uri.fsPath, mode, 'control_plane_reload_required');
      },
      async () => {
        activate(createExtensionContext());
        await vscode.commands.executeCommand('ralphCodex.runRalphIteration');
      }
    );
    return calls;
  });

  assert.deepEqual(seenModes, ['singleExec']);
  assert.equal(executeCalls.some((entry) => entry.command === 'workbench.action.reloadWindow'), false);
  assert.match(
    harness.state.infoMessages.at(-1)?.message ?? '',
    /Ralph CLI iteration 1 completed\. Iteration summary\./
  );
});

test('Run CLI Iteration does not surface stale failure diagnosis after a successful run', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);
  await writeFailureDiagnosisArtifacts(rootPath, 'T1');

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  await withMockedRunCliIteration(
    async (workspaceFolderArg, mode) => createMockRun(workspaceFolderArg.uri.fsPath, mode, null),
    async () => {
      activate(createExtensionContext());
      await vscode.commands.executeCommand('ralphCodex.runRalphIteration');
    }
  );

  assert.match(
    harness.state.infoMessages.at(-1)?.message ?? '',
    /Ralph CLI iteration 1 completed\. Iteration summary\./
  );
  assert.equal(
    harness.state.infoMessages.some((entry) => /Failure diagnosis ready for T1/.test(entry.message)),
    false
  );
});

test('Run CLI Loop surfaces a fresh failure diagnosis notification and View Diagnosis routes to the dashboard diagnostics tab', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
  harness.setMessageChoice('View Diagnosis');

  await withMockedRunCliIteration(
    async (workspaceFolderArg, mode) => {
      await writeFailureDiagnosisArtifacts(workspaceFolderArg.uri.fsPath, 'T1', {
        summary: 'Validator and emitted payload drifted apart.',
        suggestedAction: 'Align the emitted payload to the validator schema.',
        retryPromptAddendum: 'Preserve the validator contract while retrying.'
      });
      return createMockRun(workspaceFolderArg.uri.fsPath, mode, 'human_review_needed');
    },
    async () => {
      activate(createExtensionContext());
      await vscode.commands.executeCommand('ralphCodex.runRalphLoop');
    }
  );

  assert.ok(
    harness.state.infoMessages.some((entry) => /Failure diagnosis ready for T1: Validator and emitted payload drifted apart\./.test(entry.message)),
    'Expected a fresh failure diagnosis notification'
  );
  const showDashboardCall = harness.state.executedCommands.find((entry) => entry.command === 'ralphCodex.showDashboard');
  assert.ok(showDashboardCall, 'Expected View Diagnosis to route through ralphCodex.showDashboard');
  assert.deepEqual(showDashboardCall?.args[0], { activeTab: 'diagnostics' });
  assert.equal(
    harness.state.createdWebviewPanels.some((panel) => panel.viewType === 'ralphCodex.failureDiagnosisPanel'),
    false,
    'Expected no dedicated failure diagnosis panel to be created'
  );
});

test('Auto-Recover Task routes task ambiguity to the decomposition proposal command', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);
  await writeFailureDiagnosisArtifacts(rootPath, 'T1', {
    category: 'task_ambiguity',
    summary: 'The task is too ambiguous for deterministic implementation.',
    suggestedAction: 'Apply the latest decomposition proposal before retrying.'
  });

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  const executeCalls = await withMockedExecuteCommand(async (calls) => {
    activate(createExtensionContext());
    await vscode.commands.executeCommand('ralphCodex.autoRecoverTask');
    return calls;
  });

  assert.ok(
    executeCalls.some((entry) => entry.command === 'ralphCodex.applyLatestTaskDecompositionProposal'),
    'Expected task ambiguity recovery to route through decomposition'
  );
  assert.equal(
    executeCalls.some((entry) => entry.command === 'ralphCodex.runRalphIteration'),
    false
  );
});

test('Skip Task marks the selected task blocked using the diagnosis summary', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);
  await writeFailureDiagnosisArtifacts(rootPath, 'T1', {
    category: 'validation_mismatch',
    summary: 'The validation contract no longer matches the generated output.',
    suggestedAction: 'Update the generator to satisfy the validator before retrying.'
  });

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
  harness.setMessageChoice('Skip Task');

  activate(createExtensionContext());
  await vscode.commands.executeCommand('ralphCodex.skipTask');

  const taskFile = JSON.parse(await fs.readFile(path.join(rootPath, '.ralph', 'tasks.json'), 'utf8')) as {
    tasks: Array<{ id: string; status: string; blocker?: string }>;
  };
  const task = taskFile.tasks.find((entry) => entry.id === 'T1');

  assert.equal(task?.status, 'blocked');
  assert.equal(
    task?.blocker,
    'Skipped after diagnosis (validation_mismatch): Update the generator to satisfy the validator before retrying.'
  );
});

test('Run CLI Loop auto-reloads with the VS Code reload command after a control-plane reload stop when enabled', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
  harness.setConfiguration({
    autoReloadOnControlPlaneChange: true
  });

  const seenModes: Array<'singleExec' | 'loop'> = [];
  const executeCalls = await withMockedExecuteCommand(async (calls) => {
    await withMockedRunCliIteration(
      async (workspaceFolderArg, mode) => {
        seenModes.push(mode);
        return createMockRun(workspaceFolderArg.uri.fsPath, mode, 'control_plane_reload_required');
      },
      async () => withCapturedTimeouts(async () => {
        activate(createExtensionContext());
        await vscode.commands.executeCommand('ralphCodex.runRalphLoop');
      })
    );
    return calls;
  });

  assert.deepEqual(seenModes, ['loop']);
  const reloadCommands = executeCalls.filter((entry) => entry.command === 'workbench.action.reloadWindow');
  assert.equal(reloadCommands.length, 1);
  assert.deepEqual(reloadCommands[0]?.args ?? [], []);
  assert.equal(
    harness.state.infoMessages.some((entry) => /Ralph CLI loop stopped after iteration/.test(entry.message)),
    false
  );
});

test('Run CLI Loop still stops for human review in autonomous mode', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
  harness.setConfiguration({
    autonomyMode: 'autonomous',
    autoReloadOnControlPlaneChange: false,
    autoApplyRemediation: [],
    autoReplenishBacklog: false
  });

  await withMockedRunCliIteration(
    async (workspaceFolderArg, mode) => createMockRun(workspaceFolderArg.uri.fsPath, mode, 'human_review_needed'),
    async () => {
      activate(createExtensionContext());
      await vscode.commands.executeCommand('ralphCodex.runRalphLoop');
    }
  );

  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'workbench.action.reloadWindow'), false);
  assert.match(
    harness.state.infoMessages.at(-1)?.message ?? '',
    /Ralph CLI loop stopped after iteration 1: The current outcome requires explicit human review\./
  );
});

test('Run CLI Loop still stops on blocked preflight in autonomous mode', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
  harness.setConfiguration({
    autonomyMode: 'autonomous',
    autoReloadOnControlPlaneChange: false,
    autoApplyRemediation: [],
    autoReplenishBacklog: false
  });

  await withMockedRunCliIteration(
    async (workspaceFolderArg, mode) => createMockRun(workspaceFolderArg.uri.fsPath, mode, 'preflight_blocked'),
    async () => {
      activate(createExtensionContext());
      await vscode.commands.executeCommand('ralphCodex.runRalphLoop');
    }
  );

  assert.equal(harness.state.executedCommands.some((entry) => entry.command === 'workbench.action.reloadWindow'), false);
  assert.match(
    harness.state.infoMessages.at(-1)?.message ?? '',
    /Ralph CLI loop stopped after iteration 1: Ralph preflight blocked iteration start\. Missing human-authored PRD\./
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

test('Cleanup Runtime Artifacts preserves durable state while pruning older generated artifacts', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);
  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
  harness.setMessageChoice('Cleanup');

  const promptDir = path.join(rootPath, '.ralph', 'prompts');
  const runDir = path.join(rootPath, '.ralph', 'runs');
  const artifactDir = path.join(rootPath, '.ralph', 'artifacts');
  const logDir = path.join(rootPath, '.ralph', 'logs');
  const latestSummaryPath = path.join(artifactDir, 'latest-summary.md');
  const latestPromptEvidencePath = path.join(artifactDir, 'latest-prompt-evidence.json');
  const latestCliInvocationPath = path.join(artifactDir, 'latest-cli-invocation.json');
  const latestProvenanceBundlePath = path.join(artifactDir, 'latest-provenance-bundle.json');
  const latestProvenanceSummaryPath = path.join(artifactDir, 'latest-provenance-summary.md');
  await fs.mkdir(promptDir, { recursive: true });
  await fs.mkdir(runDir, { recursive: true });
  await fs.mkdir(path.join(artifactDir, 'iteration-001'), { recursive: true });
  await fs.mkdir(path.join(artifactDir, 'iteration-002'), { recursive: true });
  await fs.writeFile(path.join(promptDir, 'iteration-001.prompt.md'), 'old prompt\n', 'utf8');
  await fs.writeFile(path.join(promptDir, 'iteration-002.prompt.md'), 'current prompt\n', 'utf8');
  await fs.writeFile(path.join(runDir, 'iteration-001.transcript.md'), 'old transcript\n', 'utf8');
  await fs.writeFile(path.join(runDir, 'iteration-002.transcript.md'), 'current transcript\n', 'utf8');
  await fs.mkdir(logDir, { recursive: true });
  await fs.writeFile(path.join(logDir, 'old.log'), 'old log\n', 'utf8');
  await fs.writeFile(latestSummaryPath, '# Ralph Iteration 2\n\ncurrent\n', 'utf8');
  await fs.writeFile(latestPromptEvidencePath, JSON.stringify({
    kind: 'promptEvidence',
    iteration: 2,
    promptKind: 'iteration'
  }, null, 2), 'utf8');
  await fs.writeFile(latestCliInvocationPath, JSON.stringify({
    kind: 'cliInvocation',
    iteration: 2,
    transcriptPath: path.join(runDir, 'iteration-002.transcript.md')
  }, null, 2), 'utf8');
  await fs.writeFile(latestProvenanceSummaryPath, '# Ralph Provenance run-i002-cli-20260307T000500Z\n\ncurrent\n', 'utf8');
  await fs.writeFile(latestProvenanceBundlePath, JSON.stringify({
    kind: 'provenanceBundle',
    provenanceId: 'run-i002-cli-20260307T000500Z',
    iteration: 2,
    promptKind: 'iteration',
    promptTarget: 'cliExec',
    trustLevel: 'verifiedCliExecution',
    status: 'executed',
    summary: 'current bundle',
    bundleDir: path.join(artifactDir, 'runs', 'run-i002-cli-20260307T000500Z')
  }, null, 2), 'utf8');
  await fs.writeFile(path.join(rootPath, '.ralph', 'state.json'), JSON.stringify({
    version: 2,
    objectivePreview: 'Preserve current Ralph state.',
    nextIteration: 3,
    lastPromptKind: 'iteration',
    lastPromptPath: path.join(promptDir, 'iteration-002.prompt.md'),
    lastRun: {
      iteration: 2,
      mode: 'singleExec',
      promptKind: 'iteration',
      startedAt: '2026-03-07T00:00:00.000Z',
      finishedAt: '2026-03-07T00:05:00.000Z',
      status: 'succeeded',
      exitCode: 0,
      promptPath: path.join(promptDir, 'iteration-002.prompt.md'),
      transcriptPath: path.join(runDir, 'iteration-002.transcript.md'),
      summary: 'current'
    },
    runHistory: [],
    lastIteration: {
      schemaVersion: 1,
      iteration: 2,
      selectedTaskId: 'T2',
      selectedTaskTitle: 'Current task',
      promptKind: 'iteration',
      promptPath: path.join(promptDir, 'iteration-002.prompt.md'),
      artifactDir: path.join(artifactDir, 'iteration-002'),
      adapterUsed: 'cliExec',
      executionIntegrity: null,
      executionStatus: 'succeeded',
      verificationStatus: 'passed',
      completionClassification: 'partial_progress',
      followUpAction: 'continue_same_task',
      startedAt: '2026-03-07T00:00:00.000Z',
      finishedAt: '2026-03-07T00:05:00.000Z',
      phaseTimestamps: {
        inspectStartedAt: '2026-03-07T00:00:00.000Z',
        inspectFinishedAt: '2026-03-07T00:01:00.000Z',
        taskSelectedAt: '2026-03-07T00:01:00.000Z',
        promptGeneratedAt: '2026-03-07T00:02:00.000Z',
        resultCollectedAt: '2026-03-07T00:04:00.000Z',
        verificationFinishedAt: '2026-03-07T00:04:30.000Z',
        classifiedAt: '2026-03-07T00:04:45.000Z'
      },
      summary: 'current',
      warnings: [],
      errors: [],
      execution: {
        exitCode: 0,
        transcriptPath: path.join(runDir, 'iteration-002.transcript.md')
      },
      verification: {
        taskValidationHint: null,
        effectiveValidationCommand: 'npm test',
        normalizedValidationCommandFrom: null,
        primaryCommand: 'npm test',
        validationFailureSignature: null,
        verifiers: []
      },
      backlog: {
        remainingTaskCount: 1,
        actionableTaskAvailable: true
      },
      diffSummary: null,
      noProgressSignals: [],
      remediation: null,
      stopReason: null
    },
    iterationHistory: [],
    updatedAt: '2026-03-07T00:05:00.000Z'
  }, null, 2), 'utf8');

  activate(createExtensionContext());
  await vscode.commands.executeCommand('ralphCodex.cleanupRalphRuntimeArtifacts');

  await assert.rejects(fs.access(path.join(promptDir, 'iteration-001.prompt.md')));
  await fs.access(path.join(promptDir, 'iteration-002.prompt.md'));
  await fs.access(latestSummaryPath);
  await fs.access(latestPromptEvidencePath);
  await fs.access(latestCliInvocationPath);
  await fs.access(latestProvenanceBundlePath);
  await fs.access(latestProvenanceSummaryPath);
  await fs.access(path.join(rootPath, '.ralph', 'state.json'));
  assert.match(
    harness.state.warningMessages[0]?.message ?? '',
    /Cleanup Ralph runtime artifacts/
  );
  assert.match(
    harness.state.infoMessages.at(-1)?.message ?? '',
    /Preserved durable state and latest evidence while pruning/
  );
});

test('Cleanup Runtime Artifacts leaves files untouched when confirmation is dismissed', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);
  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  const promptDir = path.join(rootPath, '.ralph', 'prompts');
  const artifactDir = path.join(rootPath, '.ralph', 'artifacts');
  await fs.mkdir(promptDir, { recursive: true });
  await fs.mkdir(path.join(artifactDir, 'iteration-001'), { recursive: true });
  await fs.writeFile(path.join(promptDir, 'iteration-001.prompt.md'), 'prompt\n', 'utf8');
  await fs.writeFile(path.join(rootPath, '.ralph', 'state.json'), JSON.stringify({
    version: 2,
    objectivePreview: null,
    nextIteration: 2,
    lastPromptKind: 'iteration',
    lastPromptPath: path.join(promptDir, 'iteration-001.prompt.md'),
    lastRun: null,
    runHistory: [],
    lastIteration: null,
    iterationHistory: [],
    updatedAt: '2026-03-07T00:05:00.000Z'
  }, null, 2), 'utf8');

  activate(createExtensionContext());
  await vscode.commands.executeCommand('ralphCodex.cleanupRalphRuntimeArtifacts');

  await fs.access(path.join(promptDir, 'iteration-001.prompt.md'));
  await fs.access(path.join(rootPath, '.ralph', 'state.json'));
  assert.equal(harness.state.infoMessages.length, 0);
  assert.match(
    harness.state.warningMessages[0]?.message ?? '',
    /Cleanup Ralph runtime artifacts/
  );
});

test('Run Pipeline runs review agent and SCM agent after the multi-agent loop succeeds', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
  harness.setConfiguration({
    agentId: 'default',
    agentCount: 1
  });

  type InvocationRecord = { mode: 'singleExec' | 'loop'; agentRole?: unknown; agentId?: unknown };
  const invocations: InvocationRecord[] = [];

  await withMockedRunCliIteration(
    async (workspaceFolderArg, mode, _progress, options) => {
      const runOptions = options as { configOverrides?: { agentRole?: unknown; agentId?: unknown } } | undefined;
      invocations.push({
        mode,
        agentRole: runOptions?.configOverrides?.agentRole,
        agentId: runOptions?.configOverrides?.agentId
      });
      return createMockRun(workspaceFolderArg.uri.fsPath, mode, null, {
        followUpAction: 'continue_next_task'
      });
    },
    async () => {
      activate(createExtensionContext());
      await vscode.commands.executeCommand('ralphCodex.runPipeline');
    }
  );

  const executedCommands = harness.state.executedCommands.map((entry) => entry.command);
  assert.ok(
    executedCommands.includes('ralphCodex.runReviewAgent'),
    'runPipeline must invoke the review phase through the review command.'
  );
  assert.ok(
    executedCommands.includes('ralphCodex.runScmAgent'),
    'runPipeline must invoke the SCM phase through the SCM command.'
  );

  // Expect: 1 loop iteration (multi-agent), then review, then SCM
  const loopInvocations = invocations.filter((inv) => inv.mode === 'loop');
  const reviewInvocation = invocations.find((inv) => inv.agentRole === 'review');
  const scmInvocation = invocations.find((inv) => inv.agentRole === 'scm');

  assert.ok(loopInvocations.length >= 1, 'Expected at least one loop invocation from the multi-agent loop');
  assert.ok(reviewInvocation, 'Expected a review-agent invocation after the loop');
  assert.ok(scmInvocation, 'Expected an SCM-agent invocation after the review');

  assert.deepEqual(reviewInvocation?.agentId, 'review-default');
  assert.deepEqual(scmInvocation?.agentId, 'scm-default');

  // Review must come before SCM in the invocation sequence
  const reviewIndex = invocations.indexOf(reviewInvocation!);
  const scmIndex = invocations.indexOf(scmInvocation!);
  assert.ok(reviewIndex < scmIndex, 'Review agent must run before SCM agent');

  // Pipeline artifact must be written with status complete
  const pipelinesDir = path.join(rootPath, '.ralph', 'artifacts', 'pipelines');
  const pipelineFiles = await fs.readdir(pipelinesDir);
  assert.equal(pipelineFiles.length, 1, 'Expected exactly one pipeline artifact');
  const artifactRaw = await fs.readFile(path.join(pipelinesDir, pipelineFiles[0]!), 'utf8');
  const artifact = JSON.parse(artifactRaw) as { status: string; reviewTranscriptPath?: string };
  assert.equal(artifact.status, 'complete', 'Pipeline artifact status must be complete');
  assert.match(
    harness.state.infoMessages.at(-1)?.message ?? '',
    /Ralph pipeline .+ finished with status: complete/
  );
});

test('Run Pipeline captures reviewTranscriptPath and prUrl in the pipeline artifact', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
  harness.setConfiguration({
    agentId: 'default',
    agentCount: 1
  });

  const reviewArtifactDir = path.join(rootPath, '.ralph', 'artifacts', 'review-001');
  const scmArtifactDir = path.join(rootPath, '.ralph', 'artifacts', 'scm-001');
  const fakeTranscriptPath = path.join(reviewArtifactDir, 'transcript.jsonl');
  const fakePrUrl = 'https://github.com/acme/repo/pull/99';

  await withMockedRunCliIteration(
    async (workspaceFolderArg, mode, _progress, options) => {
      const runOptions = options as { configOverrides?: { agentRole?: unknown } } | undefined;
      const agentRole = runOptions?.configOverrides?.agentRole;

      if (agentRole === 'review') {
        await fs.mkdir(reviewArtifactDir, { recursive: true });
        return createMockRun(workspaceFolderArg.uri.fsPath, mode, null, {
          artifactDir: reviewArtifactDir,
          execution: { exitCode: 0, transcriptPath: fakeTranscriptPath }
        });
      }

      if (agentRole === 'scm') {
        await fs.mkdir(scmArtifactDir, { recursive: true });
        await fs.writeFile(
          path.join(scmArtifactDir, 'completion-report.json'),
          JSON.stringify({
            schemaVersion: 1,
            kind: 'completionReport',
            status: 'parsed',
            selectedTaskId: 'T-scm',
            warnings: [],
            report: { progressNote: `PR submitted at ${fakePrUrl} and merged.` }
          }),
          'utf8'
        );
        return createMockRun(workspaceFolderArg.uri.fsPath, mode, null, {
          artifactDir: scmArtifactDir,
          followUpAction: 'continue_next_task'
        });
      }

      return createMockRun(workspaceFolderArg.uri.fsPath, mode, null, {
        followUpAction: 'continue_next_task'
      });
    },
    async () => {
      activate(createExtensionContext());
      await vscode.commands.executeCommand('ralphCodex.runPipeline');
    }
  );

  const pipelinesDir = path.join(rootPath, '.ralph', 'artifacts', 'pipelines');
  const pipelineFiles = await fs.readdir(pipelinesDir);
  assert.equal(pipelineFiles.length, 1, 'Expected exactly one pipeline artifact');
  const artifactRaw = await fs.readFile(path.join(pipelinesDir, pipelineFiles[0]!), 'utf8');
  const artifact = JSON.parse(artifactRaw) as {
    status: string;
    reviewTranscriptPath?: string;
    prUrl?: string;
  };

  assert.equal(artifact.status, 'complete', 'Pipeline artifact status must be complete');
  assert.equal(artifact.reviewTranscriptPath, fakeTranscriptPath, 'reviewTranscriptPath must be captured from review run');
  assert.equal(artifact.prUrl, fakePrUrl, 'prUrl must be extracted from SCM completion report');

  const lastMessage = harness.state.infoMessages.at(-1)?.message ?? '';
  assert.match(lastMessage, /Ralph pipeline .+ finished with status: complete/);
  assert.ok(lastMessage.includes(fakePrUrl), 'Info message must include the PR URL');
});

test('Add Task seeds provider-generated backlog tasks and persists a seeding artifact without stripping existing rich task structure', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);
  await fs.writeFile(path.join(rootPath, '.ralph', 'tasks.json'), JSON.stringify({
    version: 2,
    tasks: [
      {
        id: 'T1',
        title: 'Inspect guardrails',
        status: 'blocked',
        notes: 'Existing rich task should survive append.',
        validation: 'npm run validate',
        blocker: 'Waiting on fixture review',
        priority: 'high',
        mode: 'documentation',
        tier: 'complex',
        acceptance: ['Original task remains intact'],
        constraints: ['Do not rewrite existing tasks'],
        context: ['src/commands/registerCommands.ts']
      }
    ]
  }, null, 2), 'utf8');

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
  harness.setInputBoxValue('Seed backlog tasks for provider-backed task seeding.');

  setProcessRunnerOverride((_command, _args, _options) => ({
    code: 0,
    stdout: JSON.stringify({
      type: 'result',
      result: [
        '```json',
        JSON.stringify({
          tasks: [
            {
              id: 'T1',
              title: 'Build task seeding helper',
              status: 'done',
              suggestedValidationCommand: 'npm run validate',
              context: ['src/ralph/taskSeeder.ts']
            },
            {
              id: 'T2',
              title: 'Wire Add Task through the seeding helper',
              status: 'blocked',
              dependsOn: ['T1']
            }
          ]
        }, null, 2),
        '```'
      ].join('\n'),
      num_turns: 1
    }),
    stderr: ''
  }));

  try {
    activate(createExtensionContext());
    await vscode.commands.executeCommand('ralphCodex.addTask');
  } finally {
    setProcessRunnerOverride(null);
  }

  const tasksJson = JSON.parse(await fs.readFile(path.join(rootPath, '.ralph', 'tasks.json'), 'utf8')) as {
    version: number;
    mutationCount?: number;
    tasks: Array<Record<string, unknown>>;
  };

  assert.equal(tasksJson.version, 2);
  assert.equal(tasksJson.mutationCount, 1);
  assert.deepEqual(tasksJson.tasks[0], {
    id: 'T1',
    title: 'Inspect guardrails',
    status: 'blocked',
    notes: 'Existing rich task should survive append.',
    validation: 'npm run validate',
    blocker: 'Waiting on fixture review',
    priority: 'high',
    mode: 'documentation',
    tier: 'complex',
    acceptance: ['Original task remains intact'],
    constraints: ['Do not rewrite existing tasks'],
    context: ['src/commands/registerCommands.ts']
  });
  assert.deepEqual(tasksJson.tasks.slice(1), [
    {
      id: 'T2',
      title: 'Build task seeding helper',
      status: 'todo',
      validation: 'npm run validate',
      context: ['src/ralph/taskSeeder.ts']
    },
    {
      id: 'T3',
      title: 'Wire Add Task through the seeding helper',
      status: 'todo',
      dependsOn: ['T2']
    }
  ]);

  const seedingDir = path.join(rootPath, '.ralph', 'artifacts', 'task-seeding');
  const seedingArtifacts = await fs.readdir(seedingDir);
  assert.equal(seedingArtifacts.length, 1, 'Expected a single task-seeding artifact');

  const seedingArtifact = JSON.parse(
    await fs.readFile(path.join(seedingDir, seedingArtifacts[0]!), 'utf8')
  ) as {
    sourceRequest: string;
    taskDrafts: Array<{
      id: string;
      title: string;
      status?: string;
      validation?: string;
      dependsOn?: string[];
      context?: string[];
    }>;
    warnings: string[];
  };

  assert.equal(seedingArtifact.sourceRequest, 'Seed backlog tasks for provider-backed task seeding.');
  assert.deepEqual(seedingArtifact.taskDrafts, [
    {
      id: 'T2',
      title: 'Build task seeding helper',
      status: 'todo',
      validation: 'npm run validate',
      context: ['src/ralph/taskSeeder.ts']
    },
    {
      id: 'T3',
      title: 'Wire Add Task through the seeding helper',
      status: 'todo',
      dependsOn: ['T2']
    }
  ]);
  assert.equal(seedingArtifact.warnings.length, 2);
  assert.deepEqual(harness.state.shownDocuments, [path.join(rootPath, '.ralph', 'tasks.json')]);
  assert.match(harness.state.infoMessages.at(-1)?.message ?? '', /Added 2 seeded task\(s\)/);
});

test('Seed Tasks from Feature Request seeds provider-generated backlog tasks and reports artifact and task file paths', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
  harness.setInputBoxValue('Seed a feature request into deterministic backlog tasks.');

  setProcessRunnerOverride((_command, _args, _options) => ({
    code: 0,
    stdout: JSON.stringify({
      type: 'result',
      result: [
        '```json',
        JSON.stringify({
          tasks: [
            {
              id: 'T2',
              title: 'Introduce a dedicated seeding command',
              status: 'todo'
            }
          ]
        }, null, 2),
        '```'
      ].join('\n'),
      num_turns: 1
    }),
    stderr: ''
  }));

  try {
    activate(createExtensionContext());
    await vscode.commands.executeCommand('ralphCodex.seedTasksFromFeatureRequest');
  } finally {
    setProcessRunnerOverride(null);
  }

  const tasksPath = path.join(rootPath, '.ralph', 'tasks.json');
  const seedingDir = path.join(rootPath, '.ralph', 'artifacts', 'task-seeding');
  const seedingArtifacts = await fs.readdir(seedingDir);
  assert.equal(seedingArtifacts.length, 1, 'Expected a single task-seeding artifact');
  const artifactPath = path.join(seedingDir, seedingArtifacts[0]!);

  assert.deepEqual(harness.state.shownDocuments, [tasksPath]);
  assert.match(harness.state.infoMessages.at(-1)?.message ?? '', /Seeded 1 backlog task/);
  assert.match(harness.state.infoMessages.at(-1)?.message ?? '', new RegExp(escapeRegExp(tasksPath)));
  assert.match(harness.state.infoMessages.at(-1)?.message ?? '', new RegExp(escapeRegExp(artifactPath)));
});

test('Seed Tasks from Feature Request reports provider failures without mutating tasks.json', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);
  const tasksPath = path.join(rootPath, '.ralph', 'tasks.json');
  const initialTasksText = await fs.readFile(tasksPath, 'utf8');

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
  harness.setInputBoxValue('Seed tasks for a provider failure case.');

  setProcessRunnerOverride((_command, _args, _options) => ({
    code: 1,
    stdout: '',
    stderr: 'provider exited with failure'
  }));

  try {
    activate(createExtensionContext());
    await vscode.commands.executeCommand('ralphCodex.seedTasksFromFeatureRequest');
  } finally {
    setProcessRunnerOverride(null);
  }

  assert.equal(await fs.readFile(tasksPath, 'utf8'), initialTasksText);
  assert.equal(harness.state.shownDocuments.length, 0);
  assert.match(harness.state.errorMessages.at(-1)?.message ?? '', /Task seeding failed:/);
});

test('Seed Tasks from Feature Request reports malformed task payloads without mutating tasks.json', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);
  const tasksPath = path.join(rootPath, '.ralph', 'tasks.json');
  const initialTasksText = await fs.readFile(tasksPath, 'utf8');

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
  harness.setInputBoxValue('Seed tasks for a malformed-response case.');

  setProcessRunnerOverride((_command, _args, _options) => ({
    code: 0,
    stdout: JSON.stringify({
      type: 'result',
      result: '```json\n{"tasks":[]}\n```',
      num_turns: 1
    }),
    stderr: ''
  }));

  try {
    activate(createExtensionContext());
    await vscode.commands.executeCommand('ralphCodex.seedTasksFromFeatureRequest');
  } finally {
    setProcessRunnerOverride(null);
  }

  assert.equal(await fs.readFile(tasksPath, 'utf8'), initialTasksText);
  assert.equal(harness.state.shownDocuments.length, 0);
  assert.match(harness.state.errorMessages.at(-1)?.message ?? '', /Task seeding failed:/);
});

test('Seed Tasks from Feature Request reports id collisions discovered at persistence time without mutating tasks.json', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);
  const tasksPath = path.join(rootPath, '.ralph', 'tasks.json');
  const concurrentTasksText = `${JSON.stringify({
    version: 2,
    tasks: [
      { id: 'T1', title: 'Inspect guardrails', status: 'todo' },
      { id: 'T2', title: 'Concurrent writer task', status: 'todo' }
    ]
  }, null, 2)}\n`;

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);
  harness.setInputBoxValue('Seed tasks for a concurrent collision case.');

  setProcessRunnerOverride(async (_command, _args, _options) => {
    await fs.writeFile(tasksPath, concurrentTasksText, 'utf8');
    return {
      code: 0,
      stdout: JSON.stringify({
        type: 'result',
        result: [
          '```json',
          JSON.stringify({
            tasks: [
              { id: 'T2', title: 'Command-generated task', status: 'todo' }
            ]
          }, null, 2),
          '```'
        ].join('\n'),
        num_turns: 1
      }),
      stderr: ''
    };
  });

  try {
    activate(createExtensionContext());
    await vscode.commands.executeCommand('ralphCodex.seedTasksFromFeatureRequest');
  } finally {
    setProcessRunnerOverride(null);
  }

  assert.equal(await fs.readFile(tasksPath, 'utf8'), concurrentTasksText);
  assert.equal(harness.state.shownDocuments.length, 0);
  assert.match(harness.state.errorMessages.at(-1)?.message ?? '', /Task id T2 must be unique/);
});

test('Regenerate PRD opens the wizard at the existing PRD flow entry point', async () => {
  const rootPath = await makeTempRoot();
  await seedWorkspace(rootPath);

  const harness = vscodeTestHarness();
  harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

  activate(createExtensionContext());
  await vscode.commands.executeCommand('ralphCodex.regeneratePrd');

  assert.equal(harness.state.createdWebviewPanels.length, 1, 'Expected one webview panel to be created');
  assert.equal(harness.state.createdWebviewPanels[0]?.viewType, 'ralphCodex.prdCreationWizard');
});


