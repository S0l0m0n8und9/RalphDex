import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { setProcessRunnerOverride } from '../src/services/processRunner';
import {
  inspectValidationCommandReadiness,
  normalizeValidationCommand,
  runValidationCommandVerifier
} from '../src/ralph/verifier';

async function makeTempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ralph-verifier-'));
}

test.afterEach(() => {
  setProcessRunnerOverride(null);
});

test('inspectValidationCommandReadiness confirms explicit executable paths cheaply', async () => {
  const rootPath = await makeTempRoot();
  const executablePath = path.join(rootPath, 'validate.sh');
  await fs.writeFile(executablePath, '#!/bin/sh\nexit 0\n', 'utf8');
  await fs.chmod(executablePath, 0o755);

  const readiness = await inspectValidationCommandReadiness({
    command: `${executablePath} --quick`,
    rootPath
  });

  assert.equal(readiness.status, 'executableConfirmed');
  assert.equal(readiness.executable, executablePath);
});

test('inspectValidationCommandReadiness warns when a PATH command cannot be resolved', async () => {
  const rootPath = await makeTempRoot();
  const readiness = await inspectValidationCommandReadiness({
    command: 'ralph-command-that-should-not-exist --version',
    rootPath
  });

  assert.equal(readiness.status, 'executableNotConfirmed');
  assert.equal(readiness.executable, 'ralph-command-that-should-not-exist');
});

test('inspectValidationCommandReadiness resolves the executable after leading env assignments', async () => {
  const rootPath = await makeTempRoot();
  const calls: Array<{ command: string; args: string[] }> = [];

  setProcessRunnerOverride(async (command, args) => {
    calls.push({ command, args });
    return {
      code: 0,
      stdout: path.join(rootPath, 'npm'),
      stderr: ''
    };
  });

  const readiness = await inspectValidationCommandReadiness({
    command: 'RALPH_E2E=1 npm run test:e2e-pipeline',
    rootPath
  });

  assert.equal(readiness.status, 'executableConfirmed');
  assert.equal(readiness.executable, path.join(rootPath, 'npm'));
  assert.equal(calls.length, 1);
  assert.match(calls[0].command, /where|sh/);
  assert.ok(calls[0].args.includes('npm'));
});

test('normalizeValidationCommand strips a redundant workspace-relative cd into the selected verifier root', () => {
  const workspaceRootPath = path.join('/tmp', 'ralph-workspace');
  const verificationRootPath = path.join(workspaceRootPath, 'ralph-codex-vscode-starter');

  const command = normalizeValidationCommand({
    command: 'cd ralph-codex-vscode-starter && npm run validate',
    workspaceRootPath,
    verificationRootPath
  });

  assert.equal(command, 'npm run validate');
});

test('normalizeValidationCommand strips a legacy repo-name cd when the opened workspace is already the verifier root', () => {
  const workspaceRootPath = path.join('/tmp', 'ralph-workspace', 'ralph-codex-vscode-starter');

  const command = normalizeValidationCommand({
    command: 'cd ralph-codex-vscode-starter && npm run validate',
    workspaceRootPath,
    verificationRootPath: workspaceRootPath
  });

  assert.equal(command, 'npm run validate');
});

test('normalizeValidationCommand keeps commands that cd somewhere other than the selected verifier root', () => {
  const workspaceRootPath = path.join('/tmp', 'ralph-workspace');
  const verificationRootPath = path.join(workspaceRootPath, 'ralph-codex-vscode-starter');

  const command = normalizeValidationCommand({
    command: 'cd sibling-repo && npm test',
    workspaceRootPath,
    verificationRootPath
  });

  assert.equal(command, 'cd sibling-repo && npm test');
});

test('runValidationCommandVerifier executes env-prefixed commands with process env overrides', async () => {
  const rootPath = await makeTempRoot();
  const artifactDir = path.join(rootPath, 'artifacts');
  const calls: Array<{
    command: string;
    args: string[];
    options: { cwd: string; shell?: boolean; env?: NodeJS.ProcessEnv };
  }> = [];

  setProcessRunnerOverride(async (command, args, options) => {
    calls.push({ command, args, options });
    return {
      code: 0,
      stdout: 'ok',
      stderr: ''
    };
  });

  const verification = await runValidationCommandVerifier({
    command: 'RALPH_E2E=1 npm run test:e2e-pipeline',
    rootPath,
    artifactDir
  });

  assert.equal(verification.result.status, 'passed');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, 'npm run test:e2e-pipeline');
  assert.deepEqual(calls[0].args, []);
  assert.equal(calls[0].options.cwd, rootPath);
  assert.equal(calls[0].options.shell, true);
  assert.equal(calls[0].options.env?.RALPH_E2E, '1');
});
