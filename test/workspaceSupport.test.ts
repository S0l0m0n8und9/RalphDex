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

test('inspectCodexCliSupport leaves PATH lookups unverified', async () => {
  const support = await inspectCodexCliSupport('codex');
  assert.equal(support.check, 'pathLookupAssumed');
  assert.equal(support.confidence, 'assumed');
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
