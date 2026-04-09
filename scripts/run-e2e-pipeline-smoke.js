#!/usr/bin/env node

const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.join(__dirname, '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const PR_URL = 'https://github.com/acme/ralph-e2e-smoke/pull/1';

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
    const stdout = result.stdout?.trim();
    const message = stderr || stdout || `${command} ${args.join(' ')} exited with code ${result.status ?? 1}.`;
    throw new Error(message);
  }

  return result;
}

function workspaceFolder(vscode, rootPath) {
  return {
    uri: vscode.Uri.file(rootPath),
    name: path.basename(rootPath),
    index: 0
  };
}

function createExtensionContext(vscode) {
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

  return {
    subscriptions: [],
    workspaceState: new MemoryMemento(),
    extensionUri: vscode.Uri.file(projectRoot)
  };
}

function progressReporter() {
  return {
    report() {}
  };
}

function createMockRun(rootPath, mode, overrides = {}) {
  return {
    prepared: {
      rootPath
    },
    result: {
      iteration: 1,
      executionStatus: 'succeeded',
      verificationStatus: 'passed',
      summary: 'E2E pipeline smoke mock iteration.',
      completionClassification: 'complete',
      stopReason: null,
      artifactDir: path.join(rootPath, '.ralph', 'artifacts', `${mode}-mock`),
      followUpAction: 'continue_next_task',
      execution: { transcriptPath: undefined },
      ...overrides
    },
    loopDecision: {
      shouldContinue: false,
      message: 'E2E pipeline smoke mock iteration complete.'
    },
    createdPaths: []
  };
}

async function seedWorkspace(rootPath) {
  await fsp.mkdir(path.join(rootPath, 'src'), { recursive: true });
  await fsp.mkdir(path.join(rootPath, '.ralph', 'artifacts'), { recursive: true });

  await fsp.writeFile(path.join(rootPath, 'package.json'), `${JSON.stringify({
    name: 'ralph-e2e-pipeline-fixture',
    version: '1.0.0',
    private: true,
    scripts: {
      test: 'node -e "process.exit(0)"'
    }
  }, null, 2)}\n`, 'utf8');
  await fsp.writeFile(path.join(rootPath, 'README.md'), '# Ralph E2E Pipeline Fixture\n', 'utf8');
  await fsp.writeFile(path.join(rootPath, 'src', 'fixture.ts'), 'export const fixture = true;\n', 'utf8');
  await fsp.writeFile(path.join(rootPath, '.ralph', 'prd.md'), [
    '# Product / project brief',
    '',
    'Run the smallest possible Ralph pipeline smoke in a fresh workspace.',
    '',
    '## Add pipeline smoke export',
    '',
    'Update only `src/fixture.ts` to add `export const pipelineSmoke = true;`.',
    'Do not touch `package.json` or add dependencies.',
    ''
  ].join('\n'), 'utf8');
  await fsp.writeFile(path.join(rootPath, '.ralph', 'progress.md'), '# Progress\n\n- Pipeline E2E smoke workspace created.\n', 'utf8');
  await fsp.writeFile(path.join(rootPath, '.ralph', 'tasks.json'), `${JSON.stringify({
    version: 2,
    tasks: []
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
  if (process.env.RALPH_E2E !== '1') {
    console.log('Skipping pipeline E2E smoke. Set RALPH_E2E=1 to run it.');
    return;
  }

  runOrExit(npmCommand, ['run', 'compile:tests']);

  require(path.join(projectRoot, 'test', 'register-vscode-stub.cjs'));

  const vscode = require('vscode');
  const { activate } = require(path.join(projectRoot, 'out-test', 'src', 'extension.js'));
  const { RalphIterationEngine } = require(path.join(projectRoot, 'out-test', 'src', 'ralph', 'iterationEngine.js'));
  const { vscodeTestHarness } = require(path.join(projectRoot, 'out-test', 'test', 'support', 'vscodeTestHarness.js'));
  const { DEFAULT_CONFIG } = require(path.join(projectRoot, 'out-test', 'src', 'config', 'defaults.js'));
  const rootPath = await fsp.mkdtemp(path.join(os.tmpdir(), 'ralph-e2e-pipeline-'));
  const keepWorkspace = process.env.RALPH_E2E_KEEP_WORKSPACE === '1';
  const commandPath = process.env.RALPH_E2E_PIPELINE_COMMAND || 'codex';
  const model = process.env.RALPH_E2E_PIPELINE_MODEL || DEFAULT_CONFIG.model;
  let shouldCleanup = keepWorkspace;
  let realInvocationCount = 0;

  try {
    await seedWorkspace(rootPath);
    initGitRepo(rootPath);

    const harness = vscodeTestHarness();
    harness.reset();
    harness.setConfiguration({
      ...DEFAULT_CONFIG,
      cliProvider: 'codex',
      preferredHandoffMode: 'cliExec',
      codexCommandPath: commandPath,
      verifierModes: ['validationCommand', 'gitDiff', 'taskState'],
      gitCheckpointMode: 'snapshotAndDiff',
      approvalMode: 'never',
      sandboxMode: 'workspace-write',
      pipelineHumanGates: false,
      autoReviewOnParentDone: false,
      agentId: 'default',
      agentCount: 1,
      ralphIterationCap: 1,
      model
    });
    harness.setWorkspaceFolders([workspaceFolder(vscode, rootPath)]);

    const originalRunCliIteration = RalphIterationEngine.prototype.runCliIteration;
    RalphIterationEngine.prototype.runCliIteration = async function patchedRunCliIteration(workspaceFolderArg, mode, progress, options) {
      const agentRole = options?.configOverrides?.agentRole;

      if (!agentRole && mode === 'loop') {
        realInvocationCount += 1;
        return originalRunCliIteration.call(this, workspaceFolderArg, mode, progress, options);
      }

      if (agentRole === 'review') {
        const artifactDir = path.join(rootPath, '.ralph', 'artifacts', 'review-001');
        const transcriptPath = path.join(artifactDir, 'transcript.jsonl');
        await fsp.mkdir(artifactDir, { recursive: true });
        await fsp.writeFile(transcriptPath, '{"type":"review","message":"mock review"}\n', 'utf8');
        return createMockRun(rootPath, mode, {
          artifactDir,
          execution: { transcriptPath }
        });
      }

      if (agentRole === 'scm') {
        const artifactDir = path.join(rootPath, '.ralph', 'artifacts', 'scm-001');
        await fsp.mkdir(artifactDir, { recursive: true });
        await fsp.writeFile(
          path.join(artifactDir, 'completion-report.json'),
          JSON.stringify({
            schemaVersion: 1,
            kind: 'completionReport',
            status: 'parsed',
            selectedTaskId: 'Tpipe-scm',
            warnings: [],
            report: {
              requestedStatus: 'done',
              progressNote: `PR submitted at ${PR_URL}.`
            }
          }, null, 2),
          'utf8'
        );
        return createMockRun(rootPath, mode, {
          artifactDir
        });
      }

      return originalRunCliIteration.call(this, workspaceFolderArg, mode, progress ?? progressReporter(), options);
    };

    try {
      activate(createExtensionContext(vscode));
      await vscode.commands.executeCommand('ralphCodex.runPipeline');
    } finally {
      RalphIterationEngine.prototype.runCliIteration = originalRunCliIteration;
    }

    assert.ok(realInvocationCount >= 1, 'Expected at least one real CLI loop invocation.');

    const pipelinesDir = path.join(rootPath, '.ralph', 'artifacts', 'pipelines');
    const pipelineFiles = (await fsp.readdir(pipelinesDir)).filter((entry) => entry.endsWith('.json')).sort();
    assert.equal(pipelineFiles.length, 1, 'Expected exactly one pipeline artifact.');

    const artifactPath = path.join(pipelinesDir, pipelineFiles[0]);
    const artifact = JSON.parse(await fsp.readFile(artifactPath, 'utf8'));
    assert.equal(artifact.kind, 'pipelineRun');
    assert.equal(artifact.status, 'complete');
    assert.equal(artifact.phase, 'done');
    assert.equal(artifact.prUrl, PR_URL);

    shouldCleanup = keepWorkspace === false;

    console.log(JSON.stringify({
      rootPath,
      commandPath,
      model,
      realInvocationCount,
      artifactPath,
      prUrl: artifact.prUrl,
      infoMessage: harness.state.infoMessages.at(-1)?.message ?? null
    }, null, 2));
  } catch (error) {
    shouldCleanup = false;
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  } finally {
    if (shouldCleanup) {
      await fsp.rm(rootPath, { recursive: true, force: true });
    } else {
      console.error(`Pipeline E2E smoke workspace preserved at ${rootPath}`);
    }
  }
}

void main();
