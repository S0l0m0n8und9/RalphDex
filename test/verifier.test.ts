import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { setProcessRunnerOverride } from '../src/services/processRunner';
import {
  collectRelevantWorkspaceChanges,
  inspectValidationCommandReadiness,
  normalizeValidationCommand,
  parseGitStatusPorcelainZ,
  runFileChangeVerifier,
  runValidationCommandVerifier,
  type GitStatusSnapshot,
  type RalphCoreStateSnapshot
} from '../src/ralph/verifier';

// ---------------------------------------------------------------------------
// parseGitStatusPorcelainZ — null-terminated safe path parsing
// ---------------------------------------------------------------------------

test('parseGitStatusPorcelainZ parses basic null-separated entries', () => {
  const raw = 'M  src/foo.ts\0?? src/bar.ts\0';
  const entries = parseGitStatusPorcelainZ(raw);
  assert.equal(entries.length, 2);
  assert.deepEqual(entries[0], { status: 'M', path: 'src/foo.ts' });
  assert.deepEqual(entries[1], { status: '??', path: 'src/bar.ts' });
});

test('parseGitStatusPorcelainZ handles paths with spaces', () => {
  const raw = '?? src/components/New Widget.tsx\0M  src/normal.ts\0';
  const entries = parseGitStatusPorcelainZ(raw);
  assert.equal(entries.length, 2);
  assert.deepEqual(entries[0], { status: '??', path: 'src/components/New Widget.tsx' });
  assert.deepEqual(entries[1], { status: 'M', path: 'src/normal.ts' });
});

test('parseGitStatusPorcelainZ skips original path for renames', () => {
  // In --porcelain=v1 -z, renames: "R  new_path\0old_path\0next_entry\0"
  const raw = 'R  src/new.ts\0src/old.ts\0 M src/other.ts\0';
  const entries = parseGitStatusPorcelainZ(raw);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].path, 'src/new.ts');
  assert.equal(entries[1].path, 'src/other.ts');
});

test('parseGitStatusPorcelainZ returns empty array for empty input', () => {
  assert.deepEqual(parseGitStatusPorcelainZ(''), []);
  assert.deepEqual(parseGitStatusPorcelainZ('\0'), []);
});

test('parseGitStatusPorcelainZ handles staged addition (A status)', () => {
  const raw = 'A  src/staged-new.ts\0';
  const entries = parseGitStatusPorcelainZ(raw);
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0], { status: 'A', path: 'src/staged-new.ts' });
});

// ---------------------------------------------------------------------------
// collectRelevantWorkspaceChanges — before/after diff with relevant filtering
// ---------------------------------------------------------------------------

function makeSnapshot(entries: Array<{ status: string; path: string }>): GitStatusSnapshot {
  return { available: true, raw: '', entries };
}

const EMPTY_SNAPSHOT: GitStatusSnapshot = { available: false, raw: '', entries: [] };

test('collectRelevantWorkspaceChanges detects new untracked source file', () => {
  const before = makeSnapshot([]);
  const after = makeSnapshot([{ status: '??', path: 'src/newComponent.ts' }]);
  const changes = collectRelevantWorkspaceChanges(before, after);
  assert.deepEqual(changes, ['src/newComponent.ts']);
});

test('collectRelevantWorkspaceChanges detects new untracked test file', () => {
  const before = makeSnapshot([]);
  const after = makeSnapshot([{ status: '??', path: 'test/newFeature.test.ts' }]);
  const changes = collectRelevantWorkspaceChanges(before, after);
  assert.deepEqual(changes, ['test/newFeature.test.ts']);
});

test('collectRelevantWorkspaceChanges detects tracked file modification', () => {
  const before = makeSnapshot([]);
  const after = makeSnapshot([{ status: 'M', path: 'src/existing.ts' }]);
  const changes = collectRelevantWorkspaceChanges(before, after);
  assert.deepEqual(changes, ['src/existing.ts']);
});

test('collectRelevantWorkspaceChanges detects staged addition', () => {
  const before = makeSnapshot([]);
  const after = makeSnapshot([{ status: 'A', path: 'src/staged.ts' }]);
  const changes = collectRelevantWorkspaceChanges(before, after);
  assert.deepEqual(changes, ['src/staged.ts']);
});

test('collectRelevantWorkspaceChanges returns empty for clean workspace', () => {
  const before = makeSnapshot([]);
  const after = makeSnapshot([]);
  const changes = collectRelevantWorkspaceChanges(before, after);
  assert.deepEqual(changes, []);
});

test('collectRelevantWorkspaceChanges returns empty when both snapshots unavailable', () => {
  const changes = collectRelevantWorkspaceChanges(EMPTY_SNAPSHOT, EMPTY_SNAPSHOT);
  assert.deepEqual(changes, []);
});

test('collectRelevantWorkspaceChanges excludes ralph metadata paths', () => {
  const before = makeSnapshot([]);
  const after = makeSnapshot([
    { status: '??', path: 'src/real.ts' },
    { status: 'M', path: '.ralph/state.json' },
    { status: '??', path: '.ralph/prompts/iter-001.md' },
    { status: '??', path: '.ralph/runs/run.json' },
    { status: '??', path: '.ralph/logs/debug.log' },
    { status: '??', path: '.ralph/artifacts/summary.json' }
  ]);
  const changes = collectRelevantWorkspaceChanges(before, after);
  assert.deepEqual(changes, ['src/real.ts']);
});

test('collectRelevantWorkspaceChanges excludes unrelated untracked files outside relevant paths (node_modules, dist)', () => {
  const before = makeSnapshot([]);
  const after = makeSnapshot([
    { status: '??', path: 'src/component.ts' },
    { status: '??', path: 'node_modules/some-package/index.js' },
    { status: '??', path: 'dist/bundle.js' }
  ]);
  const changes = collectRelevantWorkspaceChanges(before, after);
  assert.deepEqual(changes, ['src/component.ts']);
});

test('collectRelevantWorkspaceChanges handles path with spaces (porcelain -z safety)', () => {
  const before = makeSnapshot([]);
  const after = makeSnapshot([{ status: '??', path: 'src/components/New Widget.tsx' }]);
  const changes = collectRelevantWorkspaceChanges(before, after);
  assert.deepEqual(changes, ['src/components/New Widget.tsx']);
});

// ---------------------------------------------------------------------------
// runFileChangeVerifier — untracked (??) file handling
// ---------------------------------------------------------------------------

const EMPTY_CORE_SNAPSHOT: RalphCoreStateSnapshot = {
  objectiveText: '',
  progressText: '',
  tasksText: '',
  taskFile: { version: 2, tasks: [] },
  taskFileError: null,
  hashes: { objective: '', progress: '', tasks: '' }
};

test('runFileChangeVerifier: newly created untracked file is a relevant change', async () => {
  const tmpDir = await makeTempRoot();
  const before: GitStatusSnapshot = { available: true, raw: '', entries: [] };
  const after: GitStatusSnapshot = {
    available: true,
    raw: '',
    entries: [{ status: '??', path: 'src/new-component.ts' }]
  };

  const { result, diffSummary } = await runFileChangeVerifier({
    rootPath: tmpDir,
    artifactDir: tmpDir,
    beforeGit: before,
    afterGit: after,
    before: EMPTY_CORE_SNAPSHOT,
    after: EMPTY_CORE_SNAPSHOT
  });

  assert.ok(diffSummary.relevantChangedFiles.includes('src/new-component.ts'), 'newly created ?? file should be in relevantChangedFiles');
  assert.equal(result.status, 'passed');
});

test('runFileChangeVerifier: existing untracked file unchanged is not a change', async () => {
  const tmpDir = await makeTempRoot();
  const entry = { status: '??', path: 'src/already-there.ts' };
  const snap: GitStatusSnapshot = { available: true, raw: '', entries: [entry] };

  const { diffSummary } = await runFileChangeVerifier({
    rootPath: tmpDir,
    artifactDir: tmpDir,
    beforeGit: snap,
    afterGit: snap,
    before: EMPTY_CORE_SNAPSHOT,
    after: EMPTY_CORE_SNAPSHOT
  });

  assert.equal(diffSummary.relevantChangedFiles.length, 0, 'unchanged ?? file should not count as a change');
});

test('runFileChangeVerifier: new untracked file alongside tracked modification both detected', async () => {
  const tmpDir = await makeTempRoot();
  // Before: both files are clean (not in git status output)
  const before: GitStatusSnapshot = { available: true, raw: '', entries: [] };
  // After: agent modified src/existing.ts and created src/new-file.ts
  const after: GitStatusSnapshot = {
    available: true,
    raw: '',
    entries: [
      { status: 'M', path: 'src/existing.ts' },
      { status: '??', path: 'src/new-file.ts' }
    ]
  };

  const { result, diffSummary } = await runFileChangeVerifier({
    rootPath: tmpDir,
    artifactDir: tmpDir,
    beforeGit: before,
    afterGit: after,
    before: EMPTY_CORE_SNAPSHOT,
    after: EMPTY_CORE_SNAPSHOT
  });

  assert.ok(diffSummary.relevantChangedFiles.includes('src/existing.ts'), 'tracked modification should be detected');
  assert.ok(diffSummary.relevantChangedFiles.includes('src/new-file.ts'), 'new ?? file should be detected alongside tracked change');
  assert.equal(result.status, 'passed');
});

test('runFileChangeVerifier: deep untracked path (nested directory) is detected', async () => {
  const tmpDir = await makeTempRoot();
  const before: GitStatusSnapshot = { available: true, raw: '', entries: [] };
  const after: GitStatusSnapshot = {
    available: true,
    raw: '',
    entries: [{ status: '??', path: 'frontend/src/screens/project-list.tsx' }]
  };

  const { result, diffSummary } = await runFileChangeVerifier({
    rootPath: tmpDir,
    artifactDir: tmpDir,
    beforeGit: before,
    afterGit: after,
    before: EMPTY_CORE_SNAPSHOT,
    after: EMPTY_CORE_SNAPSHOT
  });

  assert.ok(diffSummary.relevantChangedFiles.includes('frontend/src/screens/project-list.tsx'), 'deeply nested new ?? file should be in relevantChangedFiles');
  assert.equal(result.status, 'passed');
});

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
  if (process.platform === 'win32') {
    assert.ok(calls[0].args.includes('npm'));
  } else {
    assert.ok(calls[0].args.some(arg => arg.includes('npm')));
  }
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
