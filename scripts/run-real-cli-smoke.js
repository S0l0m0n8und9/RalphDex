#!/usr/bin/env node

const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.join(__dirname, '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function runOrExit(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
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
  runOrExit(npmCommand, ['run', 'compile:tests']);
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
  await fsp.writeFile(path.join(rootPath, 'src', 'fixture.ts'), 'export const fixture = true;\n', 'utf8');
  await fsp.writeFile(path.join(rootPath, '.ralph', 'prd.md'), '# Product / project brief\n\nExercise one real Ralph CLI iteration in a temp workspace.\n', 'utf8');
  await fsp.writeFile(path.join(rootPath, '.ralph', 'progress.md'), '# Progress\n\n- Baseline created for a real CLI smoke.\n', 'utf8');
  await fsp.writeFile(path.join(rootPath, '.ralph', 'tasks.json'), `${JSON.stringify({
    version: 2,
    tasks: [
      {
        id: 'T1',
        title: 'Record real smoke evidence in durable Ralph files',
        status: 'todo',
        notes: 'Update only .ralph/progress.md and .ralph/tasks.json. Append one progress bullet mentioning a real CLI smoke run and mark T1 done. Do not modify package.json or src/.',
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
  const { vscodeTestHarness } = require(path.join(projectRoot, 'out-test', 'test', 'support', 'vscodeTestHarness.js'));
  const { DEFAULT_CONFIG } = require(path.join(projectRoot, 'out-test', 'src', 'config', 'defaults.js'));
  const { RalphIterationEngine } = require(path.join(projectRoot, 'out-test', 'src', 'ralph', 'iterationEngine.js'));
  const { RalphStateManager } = require(path.join(projectRoot, 'out-test', 'src', 'ralph', 'stateManager.js'));
  const { CodexStrategyRegistry } = require(path.join(projectRoot, 'out-test', 'src', 'codex', 'providerFactory.js'));
  const { Logger } = require(path.join(projectRoot, 'out-test', 'src', 'services', 'logger.js'));

  const rootPath = await fsp.mkdtemp(path.join(os.tmpdir(), 'ralph-real-cli-'));
  const keepWorkspace = process.env.RALPH_REAL_CLI_SMOKE_KEEP_WORKSPACE === '1';
  const commandPath = process.env.RALPH_REAL_CLI_SMOKE_COMMAND || 'codex';
  const model = process.env.RALPH_REAL_CLI_SMOKE_MODEL || DEFAULT_CONFIG.model;
  let shouldCleanup = keepWorkspace;

  try {
    await seedWorkspace(rootPath);
    initGitRepo(rootPath);

    const harness = vscodeTestHarness();
    harness.reset();
    harness.setConfiguration({
      ...DEFAULT_CONFIG,
      codexCommandPath: commandPath,
      verifierModes: ['validationCommand', 'gitDiff', 'taskState'],
      gitCheckpointMode: 'snapshotAndDiff',
      approvalMode: 'never',
      sandboxMode: 'workspace-write',
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
