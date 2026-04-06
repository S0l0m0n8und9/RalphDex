import assert from 'node:assert/strict';
import test from 'node:test';
import {
  detectPackageManagers,
  inferTestSignals,
  inferValidationCommands,
  summarizePackageJson
} from '../src/services/workspaceInspection';

test('summarizePackageJson infers lifecycle commands from package manager and scripts', () => {
  const summary = summarizePackageJson({
    name: 'ralph-codex-workbench',
    packageManager: 'pnpm@9.0.0',
    workspaces: ['packages/*'],
    scripts: {
      validate: 'npm run lint && npm run test',
      'check:docs': 'node ./scripts/check-docs.js',
      lint: 'eslint .',
      test: 'vitest run',
      build: 'tsc -p .'
    }
  });

  assert.equal(summary.name, 'ralph-codex-workbench');
  assert.equal(summary.packageManager, 'pnpm');
  assert.equal(summary.hasWorkspaces, true);
  assert.deepEqual(summary.lifecycleCommands, ['pnpm validate', 'pnpm check:docs', 'pnpm lint', 'pnpm test', 'pnpm build']);
  assert.deepEqual(summary.validationCommands, ['pnpm validate', 'pnpm check:docs', 'pnpm lint', 'pnpm test', 'pnpm build']);
});

test('detectPackageManagers, inferTestSignals, and inferValidationCommands combine workspace signals', () => {
  const packageJson = summarizePackageJson({
    scripts: {
      test: 'node --test'
    }
  });

  const packageManagers = detectPackageManagers(['package.json', 'package-lock.json', 'README.md'], packageJson);
  const signals = inferTestSignals(['package.json'], ['README.md'], ['test'], packageJson);
  const commands = inferValidationCommands({
    manifests: ['package.json', 'Makefile', 'pyproject.toml'],
    packageJson,
    makeTargets: ['test', 'lint'],
    ciCommands: ['pytest']
  });

  assert.deepEqual(packageManagers, ['npm']);
  assert.ok(signals.includes('package.json defines a test script.'));
  assert.ok(signals.includes('README.md may define the canonical build/test commands.'));
  assert.ok(signals.includes('Detected test roots: test.'));
  assert.deepEqual(commands, ['npm run test', 'make lint', 'make test', 'python -m pytest']);
});
