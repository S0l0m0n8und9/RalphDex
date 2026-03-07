import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { inspectValidationCommandReadiness } from '../src/ralph/verifier';

async function makeTempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ralph-verifier-'));
}

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
