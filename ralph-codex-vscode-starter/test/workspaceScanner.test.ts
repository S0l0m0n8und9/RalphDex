import assert from 'node:assert/strict';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import test from 'node:test';
import { scanWorkspace } from '../src/services/workspaceScanner';

async function makeTempRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ralph-codex-scan-'));
}

test('scanWorkspace detects validation heuristics from common project markers', async () => {
  const rootPath = await makeTempRoot();
  await fs.mkdir(path.join(rootPath, '.github', 'workflows'), { recursive: true });
  await fs.mkdir(path.join(rootPath, 'src'), { recursive: true });
  await fs.writeFile(path.join(rootPath, 'package.json'), JSON.stringify({
    name: 'demo',
    packageManager: 'pnpm@9.0.0',
    scripts: {
      validate: 'pnpm lint && pnpm test',
      lint: 'eslint .',
      test: 'vitest run'
    }
  }, null, 2));
  await fs.writeFile(path.join(rootPath, 'Makefile'), 'lint:\n\tpnpm lint\n\ntest:\n\tpnpm test\n');
  await fs.writeFile(path.join(rootPath, '.github', 'workflows', 'ci.yml'), 'steps:\n  - run: pnpm test\n');

  const summary = await scanWorkspace(rootPath, 'demo');

  assert.ok(summary.projectMarkers.includes('Makefile'));
  assert.ok(summary.ciFiles.includes('.github/workflows/ci.yml'));
  assert.ok(summary.validationCommands.includes('pnpm validate'));
  assert.ok(summary.validationCommands.includes('make lint'));
  assert.ok(summary.validationCommands.includes('pnpm test'));
  assert.ok(summary.ciCommands.includes('pnpm test'));
});
