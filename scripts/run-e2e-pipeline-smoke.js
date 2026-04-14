#!/usr/bin/env node

const assert = require('node:assert/strict');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.join(__dirname, '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function runOrExit(command, args, options = {}) {
  const spawnInput = process.platform === 'win32'
    ? {
        command: 'cmd.exe',
        args: ['/d', '/s', '/c', `${command} ${args.join(' ')}`]
      }
    : { command, args };

  const result = spawnSync(spawnInput.command, spawnInput.args, {
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

  process.env.RALPH_DISABLE_PROCESS_TEST_HARNESS = '1';
  require(path.join(projectRoot, 'test', 'register-vscode-stub.cjs'));

  const vscode = require('vscode');
  const { activate } = require(path.join(projectRoot, 'out-test', 'src', 'extension.js'));
  const { vscodeTestHarness } = require(path.join(projectRoot, 'out-test', 'test', 'support', 'vscodeTestHarness.js'));
  const {
    PIPELINE_SMOKE_PR_URL,
    writePipelineSmokeFakeCodexExecScript
  } = require(path.join(projectRoot, 'out-test', 'test', 'support', 'fakeCodexExecFixture.js'));
  const { DEFAULT_CONFIG } = require(path.join(projectRoot, 'out-test', 'src', 'config', 'defaults.js'));
  const rootPath = await fsp.mkdtemp(path.join(os.tmpdir(), 'ralph-e2e-pipeline-'));
  const keepWorkspace = process.env.RALPH_E2E_KEEP_WORKSPACE === '1';
  const model = process.env.RALPH_E2E_PIPELINE_MODEL || DEFAULT_CONFIG.model;
  let shouldCleanup = keepWorkspace;

  try {
    await seedWorkspace(rootPath);
    initGitRepo(rootPath);
    await writePipelineSmokeFakeCodexExecScript(rootPath);

    const harness = vscodeTestHarness();
    harness.reset();
    harness.setConfiguration({
      ...DEFAULT_CONFIG,
      cliProvider: 'codex',
      preferredHandoffMode: 'cliExec',
      codexCommandPath: process.execPath,
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
    activate(createExtensionContext(vscode));
    await vscode.commands.executeCommand('ralphCodex.runPipeline');

    const pipelinesDir = path.join(rootPath, '.ralph', 'artifacts', 'pipelines');
    const pipelineFiles = (await fsp.readdir(pipelinesDir)).filter((entry) => entry.endsWith('.json')).sort();
    assert.equal(pipelineFiles.length, 1, 'Expected exactly one pipeline artifact.');

    const artifactPath = path.join(pipelinesDir, pipelineFiles[0]);
    const artifact = JSON.parse(await fsp.readFile(artifactPath, 'utf8'));
    assert.equal(artifact.kind, 'pipelineRun');
    assert.equal(artifact.status, 'complete');
    assert.equal(artifact.phase, 'done');
    assert.equal(artifact.prUrl, PIPELINE_SMOKE_PR_URL);
    assert.ok(artifact.reviewTranscriptPath, 'Expected reviewTranscriptPath in the pipeline artifact.');
    await fsp.access(artifact.reviewTranscriptPath);
    const fixtureSource = await fsp.readFile(path.join(rootPath, 'src', 'fixture.ts'), 'utf8');
    assert.match(fixtureSource, /export const pipelineSmoke = true;/);

    shouldCleanup = keepWorkspace === false;

    console.log(JSON.stringify({
      rootPath,
      commandPath: process.execPath,
      model,
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
