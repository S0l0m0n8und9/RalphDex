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
  const repoRoot = path.join(rootPath, 'ralph-codex-vscode-starter');
  await fs.mkdir(path.join(repoRoot, '.github', 'workflows'), { recursive: true });
  await fs.mkdir(path.join(repoRoot, 'src'), { recursive: true });
  await fs.mkdir(path.join(repoRoot, 'test'), { recursive: true });
  await fs.mkdir(path.join(repoRoot, 'docs'), { recursive: true });
  await fs.writeFile(path.join(repoRoot, 'AGENTS.md'), '# agents\n', 'utf8');
  await fs.writeFile(path.join(repoRoot, 'README.md'), '# demo\n', 'utf8');
  await fs.writeFile(path.join(repoRoot, 'package.json'), JSON.stringify({
    name: 'demo',
    packageManager: 'pnpm@9.0.0',
    scripts: {
      validate: 'pnpm lint && pnpm test',
      lint: 'eslint .',
      test: 'vitest run'
    }
  }, null, 2));
  await fs.writeFile(path.join(repoRoot, 'Makefile'), 'lint:\n\tpnpm lint\n\ntest:\n\tpnpm test\n');
  await fs.writeFile(path.join(repoRoot, '.github', 'workflows', 'ci.yml'), 'steps:\n  - run: pnpm test\n');

  const summary = await scanWorkspace(rootPath, 'demo');

  assert.equal(summary.rootPath, repoRoot);
  assert.equal(summary.rootSelection.strategy, 'scoredChild');
  assert.ok(summary.projectMarkers.includes('Makefile'));
  assert.ok(summary.ciFiles.includes('.github/workflows/ci.yml'));
  assert.ok(summary.validationCommands.includes('pnpm validate'));
  assert.ok(summary.validationCommands.includes('make lint'));
  assert.ok(summary.validationCommands.includes('pnpm test'));
  assert.ok(summary.ciCommands.includes('pnpm test'));
  assert.deepEqual(summary.tests, ['test']);
  assert.deepEqual(summary.packageManagerIndicators, ['package.json']);
  assert.equal(summary.evidence.tests.emptyReason, null);
  assert.match(summary.rootSelection.summary, /workspace root had no shallow repo markers/);
});

test('scanWorkspace keeps empty repos deterministic and explains empty fields', async () => {
  const rootPath = await makeTempRoot();

  const summary = await scanWorkspace(rootPath, 'empty');

  assert.equal(summary.rootPath, rootPath);
  assert.deepEqual(summary.manifests, []);
  assert.deepEqual(summary.sourceRoots, []);
  assert.deepEqual(summary.tests, []);
  assert.deepEqual(summary.docs, []);
  assert.equal(summary.evidence.manifests.emptyReason, 'No manifests matched among 17 shallow root checks.');
  assert.equal(summary.evidence.tests.emptyReason, 'No test roots matched among 5 shallow root checks.');
  assert.equal(summary.evidence.packageManagers.emptyReason, 'No package manager indicators were found at the inspected root.');
});

test('scanWorkspace selects a nested child root when the workspace root has no shallow markers', async () => {
  const rootPath = await makeTempRoot();
  const childRoot = path.join(rootPath, 'ralph-codex-vscode-starter');
  await fs.mkdir(path.join(childRoot, 'src'), { recursive: true });
  await fs.mkdir(path.join(childRoot, 'test'), { recursive: true });
  await fs.writeFile(path.join(childRoot, 'README.md'), '# demo\n');
  await fs.writeFile(path.join(childRoot, 'package.json'), JSON.stringify({
    name: 'nested-demo',
    scripts: {
      validate: 'npm run test',
      test: 'node --test'
    }
  }, null, 2));

  const summary = await scanWorkspace(rootPath, 'workspace-root');

  assert.equal(summary.workspaceRootPath, rootPath);
  assert.equal(summary.rootPath, childRoot);
  assert.equal(summary.rootSelection.strategy, 'scoredChild');
  assert.equal(summary.rootSelection.selectedRootPath, childRoot);
  assert.deepEqual(summary.rootSelection.candidates, [
    {
      path: rootPath,
      relativePath: '.',
      markerCount: 0,
      markers: []
    },
    {
      path: childRoot,
      relativePath: 'ralph-codex-vscode-starter',
      markerCount: 4,
      markers: ['package.json', 'README.md', 'src', 'test']
    }
  ]);
  assert.ok(summary.notes.includes('Using child ralph-codex-vscode-starter because the workspace root had no shallow repo markers.'));
  assert.ok(summary.manifests.includes('package.json'));
  assert.ok(summary.sourceRoots.includes('src'));
  assert.ok(summary.tests.includes('test'));
  assert.ok(summary.validationCommands.includes('npm run validate'));
  assert.ok(summary.validationCommands.includes('npm run test'));
});

test('scanWorkspace applies an explicit inspection-root override inside the workspace', async () => {
  const rootPath = await makeTempRoot();
  const alphaRoot = path.join(rootPath, 'alpha-repo');
  const betaRoot = path.join(rootPath, 'beta-repo');
  await fs.mkdir(path.join(alphaRoot, 'src'), { recursive: true });
  await fs.mkdir(path.join(betaRoot, 'src'), { recursive: true });
  await fs.writeFile(path.join(alphaRoot, 'package.json'), JSON.stringify({ name: 'alpha' }, null, 2));
  await fs.writeFile(path.join(betaRoot, 'package.json'), JSON.stringify({ name: 'beta' }, null, 2));

  const summary = await scanWorkspace(rootPath, 'workspace-root', {
    inspectionRootOverride: 'beta-repo'
  });

  assert.equal(summary.rootPath, betaRoot);
  assert.equal(summary.rootSelection.strategy, 'manualOverride');
  assert.deepEqual(summary.rootSelection.override, {
    requestedPath: 'beta-repo',
    resolvedPath: betaRoot,
    status: 'applied',
    summary: 'Using manual inspection-root override beta-repo instead of shallow root scoring.'
  });
  assert.match(summary.rootSelection.summary, /manual inspection-root override beta-repo/);
  assert.ok(summary.notes.includes('Using manual inspection-root override beta-repo instead of shallow root scoring.'));
});

test('scanWorkspace reports invalid inspection-root overrides and falls back to automatic selection', async () => {
  const rootPath = await makeTempRoot();
  const childRoot = path.join(rootPath, 'ralph-codex-vscode-starter');
  await fs.mkdir(path.join(childRoot, 'src'), { recursive: true });
  await fs.writeFile(path.join(childRoot, 'package.json'), JSON.stringify({ name: 'nested-demo' }, null, 2));

  const summary = await scanWorkspace(rootPath, 'workspace-root', {
    inspectionRootOverride: '../outside-workspace'
  });

  assert.equal(summary.rootPath, childRoot);
  assert.equal(summary.rootSelection.strategy, 'scoredChild');
  assert.deepEqual(summary.rootSelection.override, {
    requestedPath: '../outside-workspace',
    resolvedPath: path.resolve(rootPath, '../outside-workspace'),
    status: 'invalid',
    summary: 'Ignored inspection-root override ../outside-workspace because it resolves outside the workspace root.'
  });
  assert.match(summary.rootSelection.summary, /Ignored inspection-root override \.\.\/outside-workspace/);
  assert.match(summary.rootSelection.summary, /Using child ralph-codex-vscode-starter because the workspace root had no shallow repo markers/);
});
