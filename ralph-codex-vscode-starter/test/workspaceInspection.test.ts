import assert from 'node:assert/strict';
import test from 'node:test';
import { detectPackageManagers, inferTestSignals, summarizePackageJson } from '../src/services/workspaceInspection';

test('summarizePackageJson infers lifecycle commands from package manager and scripts', () => {
  const summary = summarizePackageJson({
    name: 'ralph-codex-workbench',
    packageManager: 'pnpm@9.0.0',
    workspaces: ['packages/*'],
    scripts: {
      lint: 'eslint .',
      test: 'vitest run',
      build: 'tsc -p .'
    }
  });

  assert.equal(summary.name, 'ralph-codex-workbench');
  assert.equal(summary.packageManager, 'pnpm');
  assert.equal(summary.hasWorkspaces, true);
  assert.deepEqual(summary.lifecycleCommands, ['pnpm lint', 'pnpm test', 'pnpm build']);
});

test('detectPackageManagers and inferTestSignals combine manifest and package.json signals', () => {
  const packageJson = summarizePackageJson({
    scripts: {
      test: 'node --test'
    }
  });

  const packageManagers = detectPackageManagers(['package.json', 'package-lock.json', 'README.md'], packageJson);
  const signals = inferTestSignals(['package.json'], ['README.md'], packageJson);

  assert.deepEqual(packageManagers, ['npm']);
  assert.ok(signals.includes('package.json defines a test script.'));
  assert.ok(signals.includes('README.md may define the canonical build/test commands.'));
});
