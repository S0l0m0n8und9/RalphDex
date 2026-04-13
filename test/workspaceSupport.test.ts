import assert from 'node:assert/strict';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import test from 'node:test';
import { inspectCodexCliSupport, inspectIdeCommandSupport } from '../src/services/codexCliSupport';

async function makeTempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ralph-codex-support-'));
}

test('inspectCodexCliSupport reports explicit existing paths', async () => {
  const rootPath = await makeTempRoot();
  const executablePath = path.join(rootPath, 'codex');
  await fs.writeFile(executablePath, '', 'utf8');
  await fs.chmod(executablePath, 0o755);

  const support = await inspectCodexCliSupport(executablePath);

  assert.equal(support.check, 'pathVerifiedExecutable');
  assert.equal(support.confidence, 'verified');
});

test('inspectCodexCliSupport reports explicit missing paths', async () => {
  const support = await inspectCodexCliSupport('/tmp/ralph-codex-does-not-exist/codex');
  assert.equal(support.check, 'pathMissing');
});

test('inspectCodexCliSupport verifies PATH lookups when the command is resolvable', async () => {
  const rootPath = await makeTempRoot();
  const executableName = process.platform === 'win32' ? 'copilot.cmd' : 'copilot';
  const executablePath = path.join(rootPath, executableName);
  await fs.writeFile(executablePath, process.platform === 'win32' ? '@echo off\r\necho ok\r\n' : '#!/bin/sh\necho ok\n', 'utf8');
  if (process.platform !== 'win32') {
    await fs.chmod(executablePath, 0o755);
  }

  const originalPath = process.env.PATH;
  process.env.PATH = `${rootPath}${path.delimiter}${originalPath ?? ''}`;
  try {
    const support = await inspectCodexCliSupport('copilot');
    assert.equal(support.configuredAs, 'pathLookup');
    assert.equal(support.check, 'pathVerifiedExecutable');
    assert.equal(support.confidence, 'verified');
    assert.ok(support.commandPath.toLowerCase().endsWith(executableName.toLowerCase()));
  } finally {
    process.env.PATH = originalPath;
  }
});

test('inspectCodexCliSupport blocks unresolved PATH lookups', async () => {
  const originalPath = process.env.PATH;
  process.env.PATH = '';
  try {
    const support = await inspectCodexCliSupport('definitely-not-a-real-command');
    assert.equal(support.configuredAs, 'pathLookup');
    assert.equal(support.check, 'pathMissing');
    assert.equal(support.confidence, 'blocked');
    assert.equal(support.commandPath, 'definitely-not-a-real-command');
  } finally {
    process.env.PATH = originalPath;
  }
});

test('inspectCodexCliSupport distinguishes explicit paths that are not executable', async () => {
  if (process.platform === 'win32') {
    return;
  }

  const rootPath = await makeTempRoot();
  const executablePath = path.join(rootPath, 'codex');
  await fs.writeFile(executablePath, '', 'utf8');
  await fs.chmod(executablePath, 0o644);

  const support = await inspectCodexCliSupport(executablePath);

  assert.equal(support.check, 'pathNotExecutable');
  assert.equal(support.confidence, 'blocked');
});

test('inspectIdeCommandSupport reports unavailable IDE command mode', () => {
  const support = inspectIdeCommandSupport({
    preferredHandoffMode: 'ideCommand',
    openSidebarCommandId: 'chatgpt.openSidebar',
    newChatCommandId: 'chatgpt.newChat',
    availableCommands: ['workbench.action.files.openFile']
  });

  assert.equal(support.status, 'unavailable');
  assert.deepEqual(support.missingCommandIds, ['chatgpt.openSidebar', 'chatgpt.newChat']);
});

test('inspectIdeCommandSupport reports available IDE command mode when commands are registered', () => {
  const support = inspectIdeCommandSupport({
    preferredHandoffMode: 'ideCommand',
    openSidebarCommandId: 'chatgpt.openSidebar',
    newChatCommandId: 'chatgpt.newChat',
    availableCommands: ['chatgpt.openSidebar', 'chatgpt.newChat']
  });

  assert.equal(support.status, 'available');
  assert.deepEqual(support.missingCommandIds, []);
});
