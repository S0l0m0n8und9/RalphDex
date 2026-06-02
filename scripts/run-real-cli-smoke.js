#!/usr/bin/env node

const fsp = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.join(__dirname, '..');
const npmExecPath = process.env.npm_execpath;
const npmCommand = npmExecPath ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npmArgsPrefix = npmExecPath ? [npmExecPath] : [];

function runOrExit(command, args, options = {}) {
  const shouldUseWindowsShell = process.platform === 'win32'
    && options.shell === undefined
    && command.toLowerCase().endsWith('.cmd');
  const launchCommand = shouldUseWindowsShell
    ? [command, ...args].map((part) => JSON.stringify(part)).join(' ')
    : command;
  const launchArgs = shouldUseWindowsShell ? [] : args;
  const result = spawnSync(launchCommand, launchArgs, {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: shouldUseWindowsShell,
    ...options
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runChecked(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'pipe',
    encoding: 'utf8',
    ...options
  });

  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    const message = stderr && stderr.length > 0
      ? stderr
      : `${command} ${args.join(' ')} exited with code ${result.status ?? 1}.`;
    throw new Error(message);
  }
}

async function ensureCompiledArtifacts() {
  runOrExit(npmCommand, [...npmArgsPrefix, 'run', 'compile:tests']);
}

function createLogger(Logger) {
  return new Logger({
    appendLine() {},
    append() {},
    show() {},
    dispose() {}
  });
}

function workspaceFolder(rootPath) {
  return {
    uri: { fsPath: rootPath },
    name: path.basename(rootPath),
    index: 0
  };
}

function progressReporter() {
  return {
    report() {}
  };
}

function defaultCommandPathForProvider(provider, config) {
  switch (provider) {
    case 'codex':
      return config.codexCommandPath;
    case 'claude':
      return config.claudeCommandPath;
    case 'copilot':
      return config.copilotCommandPath;
    case 'gemini':
      return config.geminiCommandPath;
    case 'copilot-byok':
    case 'copilot-foundry':
      return config.copilotFoundry.commandPath;
    case 'azure-foundry':
      return config.azureFoundry.commandPath;
    default:
      return String(provider);
  }
}

function defaultModelForProvider(provider, config) {
  return config.model;
}

function commandPathConfigForProvider(provider, commandPath, config) {
  switch (provider) {
    case 'codex':
      return { codexCommandPath: commandPath };
    case 'claude':
      return { claudeCommandPath: commandPath };
    case 'copilot':
      return { copilotCommandPath: commandPath };
    case 'gemini':
      return { geminiCommandPath: commandPath };
    case 'copilot-byok':
    case 'copilot-foundry':
      return { copilotFoundry: { ...config.copilotFoundry, commandPath } };
    case 'azure-foundry':
      return { azureFoundry: { ...config.azureFoundry, commandPath } };
    default:
      return {};
  }
}

class MemoryMemento {
  constructor() {
    this.values = new Map();
  }

  keys() {
    return Array.from(this.values.keys());
  }

  get(key, defaultValue) {
    return this.values.has(key) ? this.values.get(key) : defaultValue;
  }

  async update(key, value) {
    if (value === undefined) {
      this.values.delete(key);
      return;
    }

    this.values.set(key, value);
  }
}

async function seedWorkspace(rootPath) {
  await fsp.mkdir(path.join(rootPath, 'src'), { recursive: true });
  await fsp.mkdir(path.join(rootPath, '.ralph'), { recursive: true });
  await fsp.writeFile(path.join(rootPath, 'package.json'), `${JSON.stringify({
    name: 'ralph-real-cli-fixture',
    version: '1.0.0',
    scripts: {
      test: 'node -e "process.exit(0)"'
    }
  }, null, 2)}\n`, 'utf8');
  await fsp.writeFile(path.join(rootPath, 'src', 'fixture.ts'), 'export const fixture = "baseline";\n', 'utf8');
  await fsp.writeFile(path.join(rootPath, '.ralph', 'prd.md'), '# Product / project brief\n\nExercise one real Ralph CLI iteration in a temp workspace.\n', 'utf8');
  await fsp.writeFile(path.join(rootPath, '.ralph', 'progress.md'), '# Progress\n\n- Baseline created for a real CLI smoke.\n', 'utf8');
  await fsp.writeFile(path.join(rootPath, '.ralph', 'tasks.json'), `${JSON.stringify({
    version: 2,
    tasks: [
      {
        id: 'T1',
        title: 'Update fixture source for real CLI smoke evidence',
        status: 'todo',
        notes: 'Update only src/fixture.ts so it exports the string "real-cli-smoke". Do not run git add, git commit, or otherwise alter git history. Do not edit .ralph files directly; use the completion report to request task completion.',
        validation: 'npm test'
      }
    ]
  }, null, 2)}\n`, 'utf8');
}

function initGitRepo(rootPath) {
  runChecked('git', ['init', '--initial-branch=main'], { cwd: rootPath });
  runChecked('git', ['config', 'user.email', 'tests@example.com'], { cwd: rootPath });
  runChecked('git', ['config', 'user.name', 'Ralph Tests'], { cwd: rootPath });
  runChecked('git', ['add', '.'], { cwd: rootPath });
  runChecked('git', ['commit', '-m', 'initial'], { cwd: rootPath });
}

async function main() {
  await ensureCompiledArtifacts();

  require(path.join(projectRoot, 'test', 'register-vscode-stub.cjs'));
  require(path.join(projectRoot, 'out-test', 'test', 'support', 'processTestHarness.js')).resetProcessTestHarness();
  const { vscodeTestHarness } = require(path.join(projectRoot, 'out-test', 'test', 'support', 'vscodeTestHarness.js'));
  const { DEFAULT_CONFIG } = require(path.join(projectRoot, 'out-test', 'src', 'config', 'defaults.js'));
  const { RalphIterationEngine } = require(path.join(projectRoot, 'out-test', 'src', 'ralph', 'iterationEngine.js'));
  const { RalphStateManager } = require(path.join(projectRoot, 'out-test', 'src', 'ralph', 'stateManager.js'));
  const { CodexStrategyRegistry } = require(path.join(projectRoot, 'out-test', 'src', 'codex', 'providerFactory.js'));
  const { Logger } = require(path.join(projectRoot, 'out-test', 'src', 'services', 'logger.js'));

  const smokeRoot = process.env.RALPH_REAL_CLI_SMOKE_ROOT
    ? path.resolve(process.env.RALPH_REAL_CLI_SMOKE_ROOT)
    : path.join(projectRoot, '.worktrees', 'real-cli-smoke');
  await fsp.mkdir(smokeRoot, { recursive: true });
  const rootPath = await fsp.mkdtemp(path.join(smokeRoot, 'run-'));
  const keepWorkspace = process.env.RALPH_REAL_CLI_SMOKE_KEEP_WORKSPACE === '1';
  const provider = process.env.RALPH_REAL_CLI_SMOKE_PROVIDER || DEFAULT_CONFIG.cliProvider;
  const commandPath = process.env.RALPH_REAL_CLI_SMOKE_COMMAND || defaultCommandPathForProvider(provider, DEFAULT_CONFIG);
  const model = process.env.RALPH_REAL_CLI_SMOKE_MODEL || defaultModelForProvider(provider, DEFAULT_CONFIG);
  let shouldCleanup = keepWorkspace;

  try {
    await seedWorkspace(rootPath);
    initGitRepo(rootPath);

    const harness = vscodeTestHarness();
    harness.reset();
    harness.setConfiguration({
      ...DEFAULT_CONFIG,
      cliProvider: provider,
      ...commandPathConfigForProvider(provider, commandPath, DEFAULT_CONFIG),
      verifierModes: ['validationCommand', 'gitDiff', 'taskState'],
      gitCheckpointMode: 'snapshotAndDiff',
      approvalMode: 'never',
      sandboxMode: 'workspace-write',
      modelTiering: {
        ...DEFAULT_CONFIG.modelTiering,
        enabled: false
      },
      model
    });
    harness.setWorkspaceFolders([workspaceFolder(rootPath)]);

    const logger = createLogger(Logger);
    const stateManager = new RalphStateManager(new MemoryMemento(), logger);
    const engine = new RalphIterationEngine(stateManager, new CodexStrategyRegistry(logger), logger);
    const run = await engine.runCliIteration(workspaceFolder(rootPath), 'singleExec', progressReporter(), {
      reachedIterationCap: false
    });

    const latestSummaryPath = path.join(rootPath, '.ralph', 'artifacts', 'latest-summary.md');
    const latestResultPath = path.join(rootPath, '.ralph', 'artifacts', 'latest-result.json');
    const latestSummary = await fsp.readFile(latestSummaryPath, 'utf8');
    const latestResult = JSON.parse(await fsp.readFile(latestResultPath, 'utf8'));

    shouldCleanup = keepWorkspace === false && run.result.executionStatus === 'succeeded' && run.result.verificationStatus === 'passed';

    console.log(JSON.stringify({
      rootPath,
      provider,
      commandPath,
      model,
      result: {
        executionStatus: run.result.executionStatus,
        executionMessage: run.result.execution.message ?? null,
        verificationStatus: run.result.verificationStatus,
        completionClassification: run.result.completionClassification,
        stopReason: run.result.stopReason,
        summary: run.result.summary
      },
      latestResult: {
        executionStatus: latestResult.executionStatus ?? null,
        executionMessage: latestResult.executionMessage ?? null,
        verificationStatus: latestResult.verificationStatus ?? null,
        summary: latestResult.summary ?? null,
        summaryPath: latestResult.summaryPath ?? null,
        stderrPath: latestResult.stderrPath ?? null
      },
      latestSummaryPreview: latestSummary.split('\n').slice(0, 20)
    }, null, 2));

    if (run.result.executionStatus !== 'succeeded' || run.result.verificationStatus !== 'passed') {
      process.exitCode = 1;
    }
  } catch (error) {
    shouldCleanup = false;
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  } finally {
    if (shouldCleanup) {
      await fsp.rm(rootPath, { recursive: true, force: true });
    } else {
      console.error(`Real CLI smoke workspace preserved at ${rootPath}`);
    }
  }
}

void main();
