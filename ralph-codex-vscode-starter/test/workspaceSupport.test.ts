import assert from 'node:assert/strict';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import test from 'node:test';
import { inspectCodexCliSupport } from '../src/services/codexCliSupport';

async function makeTempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ralph-codex-support-'));
}

test('inspectCodexCliSupport reports explicit existing paths', async () => {
  const rootPath = await makeTempRoot();
  const executablePath = path.join(rootPath, 'codex');
  await fs.writeFile(executablePath, '', 'utf8');

  const support = await inspectCodexCliSupport(executablePath);

  assert.equal(support.check, 'pathExists');
});

test('inspectCodexCliSupport reports explicit missing paths', async () => {
  const support = await inspectCodexCliSupport('/tmp/ralph-codex-does-not-exist/codex');
  assert.equal(support.check, 'pathMissing');
});

test('inspectCodexCliSupport leaves PATH lookups unverified', async () => {
  const support = await inspectCodexCliSupport('codex');
  assert.equal(support.check, 'pathLookupUnverified');
});
