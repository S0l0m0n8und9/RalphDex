import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

interface PackageJsonShape {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
}

function repoPath(...parts: string[]): string {
  return path.resolve(__dirname, '..', '..', ...parts);
}

test('release packaging includes runtime dependencies and excludes local packaging junk', () => {
  const packageJson = JSON.parse(fs.readFileSync(repoPath('package.json'), 'utf8')) as PackageJsonShape;
  const packageScript = packageJson.scripts?.package ?? '';
  const publishDryRunScript = packageJson.scripts?.['publish:dry-run'] ?? '';
  const runtimeDependencyCount = Object.keys(packageJson.dependencies ?? {}).length;
  const vscodeIgnore = fs.readFileSync(repoPath('.vscodeignore'), 'utf8');

  assert.ok(runtimeDependencyCount > 0, 'expected at least one runtime dependency for this packaging policy test');
  assert.doesNotMatch(
    packageScript,
    /--no-dependencies/,
    'package script must not skip runtime dependency packaging'
  );
  assert.doesNotMatch(
    publishDryRunScript,
    /--no-dependencies/,
    'publish:dry-run must not skip runtime dependency packaging'
  );
  assert.match(
    vscodeIgnore,
    /^\.worktrees\/\*\*$/m,
    '.vscodeignore must exclude local worktree directories from the VSIX'
  );
  assert.match(
    vscodeIgnore,
    /^\*\.tgz$/m,
    '.vscodeignore must exclude local npm tarballs from the VSIX'
  );
  assert.match(
    vscodeIgnore,
    /^\*\.vsix$/m,
    '.vscodeignore must exclude previously built VSIX files from the VSIX'
  );
});
