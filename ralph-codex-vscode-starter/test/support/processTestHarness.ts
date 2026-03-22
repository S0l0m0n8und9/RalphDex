import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  ProcessRunOptions,
  ProcessRunResult,
  setProcessRunnerOverride
} from '../../src/services/processRunner';

const GIT_SIM_DIR = '.git';
const GIT_SIM_STATE_FILE = path.join(GIT_SIM_DIR, 'ralph-test-index.json');
const GIT_SIM_COMMITS_FILE = path.join(GIT_SIM_DIR, 'ralph-test-commits.json');
const GIT_SIM_PUSHES_FILE = path.join(GIT_SIM_DIR, 'ralph-test-pushes.json');
const GIT_SIM_PULL_REQUESTS_FILE = path.join(GIT_SIM_DIR, 'ralph-test-pull-requests.json');
const GIT_SIM_PUSH_FAILURE_FILE = path.join(GIT_SIM_DIR, 'ralph-test-push-failure.txt');
const GIT_SIM_GH_FAILURE_FILE = path.join(GIT_SIM_DIR, 'ralph-test-gh-failure.txt');
const GIT_SIM_GH_MISSING_FILE = path.join(GIT_SIM_DIR, 'ralph-test-gh-missing');
const ACTIVE_CODEX_PROCESS_FILE = path.join('.ralph', 'active-codex-processes.txt');
const GIT_COMMIT_EXCLUSIONS = new Set([
  '.ralph/state.json',
  '.ralph/claims.json'
]);

interface GitSnapshotState {
  files: Record<string, string>;
}

interface GitBranchState {
  files: Record<string, string>;
  baseFiles: Record<string, string>;
}

interface GitSimulationState {
  currentBranch: string;
  branches: Record<string, GitBranchState>;
  conflictPaths?: string[];
}

interface GitCommitRecord {
  subject: string;
  body: string;
}

interface GitPushRecord {
  remote: string;
  branch: string;
  args: string[];
}

interface PullRequestRecord {
  base: string;
  head: string;
  title: string;
  body: string;
  args: string[];
}

function normalizeRelative(target: string): string {
  return target.replace(/\\/g, '/');
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function collectWorkspaceFiles(rootPath: string): Promise<string[]> {
  const collected: string[] = [];

  async function walk(currentPath: string): Promise<void> {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      const relativePath = normalizeRelative(path.relative(rootPath, fullPath));
      if (relativePath === GIT_SIM_DIR || relativePath.startsWith(`${GIT_SIM_DIR}/`)) {
        continue;
      }

      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      if (entry.isFile()) {
        collected.push(relativePath);
      }
    }
  }

  await walk(rootPath);
  return collected.sort();
}

async function buildGitSnapshot(rootPath: string): Promise<GitSnapshotState> {
  const files = await collectWorkspaceFiles(rootPath);
  const snapshot: GitSnapshotState = { files: {} };
  for (const relativePath of files) {
    if (GIT_COMMIT_EXCLUSIONS.has(relativePath) || relativePath.startsWith('.ralph/logs/')) {
      continue;
    }
    snapshot.files[relativePath] = await fs.readFile(path.join(rootPath, relativePath), 'utf8');
  }
  return snapshot;
}

async function writeGitState(rootPath: string, state: GitSimulationState): Promise<void> {
  await fs.writeFile(path.join(rootPath, GIT_SIM_STATE_FILE), `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

async function readGitState(rootPath: string): Promise<GitSimulationState> {
  const statePath = path.join(rootPath, GIT_SIM_STATE_FILE);
  const raw = await fs.readFile(statePath, 'utf8');
  return JSON.parse(raw) as GitSimulationState;
}

async function syncWorkingTree(rootPath: string, snapshot: GitSnapshotState): Promise<void> {
  const currentFiles = await collectWorkspaceFiles(rootPath);
  for (const relativePath of currentFiles) {
    if (GIT_COMMIT_EXCLUSIONS.has(relativePath) || relativePath.startsWith('.ralph/logs/')) {
      continue;
    }

    if (!(relativePath in snapshot.files)) {
      await fs.rm(path.join(rootPath, relativePath), { force: true });
    }
  }

  for (const [relativePath, contents] of Object.entries(snapshot.files)) {
    const fullPath = path.join(rootPath, relativePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    const existing = await fs.readFile(fullPath, 'utf8').catch(() => null);
    if (existing !== contents) {
      await fs.writeFile(fullPath, contents, 'utf8');
    }
  }
}

export async function initializeFakeGitRepository(rootPath: string): Promise<void> {
  await fs.mkdir(path.join(rootPath, GIT_SIM_DIR), { recursive: true });
  const snapshot = await buildGitSnapshot(rootPath);
  await writeGitState(rootPath, {
    currentBranch: 'main',
    branches: {
      main: {
        files: snapshot.files,
        baseFiles: snapshot.files
      }
    },
    conflictPaths: []
  });
  await fs.writeFile(path.join(rootPath, GIT_SIM_COMMITS_FILE), '[]\n', 'utf8');
  await fs.writeFile(path.join(rootPath, GIT_SIM_PUSHES_FILE), '[]\n', 'utf8');
  await fs.writeFile(path.join(rootPath, GIT_SIM_PULL_REQUESTS_FILE), '[]\n', 'utf8');
}

async function fakeGitStatus(rootPath: string): Promise<ProcessRunResult> {
  const state = await readGitState(rootPath);
  const snapshot = state.branches[state.currentBranch] ?? { files: {} };
  const current = await buildGitSnapshot(rootPath);
  const changedPaths = new Set<string>([
    ...Object.keys(snapshot.files),
    ...Object.keys(current.files)
  ]);

  const lines = Array.from(changedPaths)
    .sort()
    .flatMap((relativePath) => {
      const beforeHash = snapshot.files[relativePath];
      const afterHash = current.files[relativePath];
      if (beforeHash === afterHash) {
        return [];
      }

      if (beforeHash === undefined) {
        return [`?? ${relativePath}`];
      }

      if (afterHash === undefined) {
        return [`D  ${relativePath}`];
      }

      return [`M  ${relativePath}`];
    });
  for (const conflictPath of state.conflictPaths ?? []) {
    if (!lines.includes(`UU ${conflictPath}`)) {
      lines.push(`UU ${conflictPath}`);
    }
  }

  return {
    code: 0,
    stdout: lines.length > 0 ? `${lines.join('\n')}\n` : '',
    stderr: ''
  };
}

async function readCommitLog(rootPath: string): Promise<GitCommitRecord[]> {
  const raw = await fs.readFile(path.join(rootPath, GIT_SIM_COMMITS_FILE), 'utf8');
  return JSON.parse(raw) as GitCommitRecord[];
}

async function readPushLog(rootPath: string): Promise<GitPushRecord[]> {
  const raw = await fs.readFile(path.join(rootPath, GIT_SIM_PUSHES_FILE), 'utf8');
  return JSON.parse(raw) as GitPushRecord[];
}

async function readPullRequestLog(rootPath: string): Promise<PullRequestRecord[]> {
  const raw = await fs.readFile(path.join(rootPath, GIT_SIM_PULL_REQUESTS_FILE), 'utf8');
  return JSON.parse(raw) as PullRequestRecord[];
}

async function fakeGitAdd(): Promise<ProcessRunResult> {
  return {
    code: 0,
    stdout: '',
    stderr: ''
  };
}

async function fakeGitCommit(rootPath: string, args: string[]): Promise<ProcessRunResult> {
  const messages = args.flatMap((arg, index) => (args[index - 1] === '-m' ? [arg] : []));
  const subject = messages[0]?.trim() ?? '';
  const body = messages[1]?.trim() ?? '';
  const currentSnapshot = await buildGitSnapshot(rootPath);
  const state = await readGitState(rootPath);
  const existingSnapshot = state.branches[state.currentBranch] ?? { files: {} };

  if (JSON.stringify(currentSnapshot.files) === JSON.stringify(existingSnapshot.files)) {
    return {
      code: 1,
      stdout: '',
      stderr: 'nothing to commit'
    };
  }

  const commits = await readCommitLog(rootPath);
  commits.push({ subject, body });
  state.branches[state.currentBranch] = {
    ...state.branches[state.currentBranch],
    files: currentSnapshot.files
  };
  state.conflictPaths = [];
  await writeGitState(rootPath, state);
  await fs.writeFile(path.join(rootPath, GIT_SIM_COMMITS_FILE), `${JSON.stringify(commits, null, 2)}\n`, 'utf8');

  return {
    code: 0,
    stdout: `[${state.currentBranch} abc1234] ${subject}\n`,
    stderr: ''
  };
}

async function fakeGitRevParse(rootPath: string, args: string[]): Promise<ProcessRunResult> {
  const state = await readGitState(rootPath);
  if (args[1] === '--abbrev-ref' && args[2] === 'HEAD') {
    return {
      code: 0,
      stdout: `${state.currentBranch}\n`,
      stderr: ''
    };
  }

  if (args[1] === '--verify') {
    const target = args[2] ?? '';
    const branchName = target.replace(/^refs\/heads\//, '');
    return {
      code: branchName in state.branches ? 0 : 1,
      stdout: branchName in state.branches ? `${branchName}\n` : '',
      stderr: branchName in state.branches ? '' : `unknown revision ${branchName}`
    };
  }

  return {
    code: 1,
    stdout: '',
    stderr: 'unsupported rev-parse'
  };
}

async function fakeGitCheckout(rootPath: string, args: string[]): Promise<ProcessRunResult> {
  const state = await readGitState(rootPath);
  if (args[1] === '-b') {
    const branchName = args[2] ?? '';
    const startPoint = args[3] ?? state.currentBranch;
    const baseBranch = state.branches[startPoint];
    if (!baseBranch) {
      return { code: 1, stdout: '', stderr: `unknown revision ${startPoint}` };
    }

    state.branches[branchName] = {
      files: { ...baseBranch.files },
      baseFiles: { ...baseBranch.files }
    };
    state.currentBranch = branchName;
    state.conflictPaths = [];
    await writeGitState(rootPath, state);
    await syncWorkingTree(rootPath, { files: state.branches[branchName].files });
    return {
      code: 0,
      stdout: `Switched to a new branch '${branchName}'\n`,
      stderr: ''
    };
  }

  const branchName = args[1] ?? '';
  const branch = state.branches[branchName];
  if (!branch) {
    return { code: 1, stdout: '', stderr: `pathspec '${branchName}' did not match any file(s) known to git` };
  }

  if (state.currentBranch === branchName) {
    return {
      code: 0,
      stdout: `Already on '${branchName}'\n`,
      stderr: ''
    };
  }

  state.currentBranch = branchName;
  state.conflictPaths = [];
  await writeGitState(rootPath, state);
  await syncWorkingTree(rootPath, { files: branch.files });
  return {
    code: 0,
    stdout: `Switched to branch '${branchName}'\n`,
    stderr: ''
  };
}

async function fakeGitDiff(rootPath: string, args: string[]): Promise<ProcessRunResult> {
  const state = await readGitState(rootPath);
  if (args[1] === '--name-only' && args[2] === '--diff-filter=U') {
    const lines = (state.conflictPaths ?? []).join('\n');
    return {
      code: 0,
      stdout: lines ? `${lines}\n` : '',
      stderr: ''
    };
  }

  return {
    code: 1,
    stdout: '',
    stderr: 'unsupported diff'
  };
}

function mergeSnapshots(current: Record<string, string>, source: Record<string, string>, base: Record<string, string>): {
  merged: Record<string, string>;
  conflictPaths: string[];
} {
  const merged: Record<string, string> = {};
  const conflictPaths: string[] = [];
  const allPaths = new Set<string>([
    ...Object.keys(base),
    ...Object.keys(current),
    ...Object.keys(source)
  ]);

  for (const filePath of Array.from(allPaths).sort()) {
    const left = current[filePath];
    const right = source[filePath];
    const ancestor = base[filePath];

    if (left === right) {
      if (left !== undefined) {
        merged[filePath] = left;
      }
      continue;
    }

    if (left === ancestor) {
      if (right !== undefined) {
        merged[filePath] = right;
      }
      continue;
    }

    if (right === ancestor) {
      if (left !== undefined) {
        merged[filePath] = left;
      }
      continue;
    }

    conflictPaths.push(filePath);
    if (left !== undefined) {
      merged[filePath] = left;
    }
  }

  return { merged, conflictPaths };
}

async function fakeGitMerge(rootPath: string, args: string[]): Promise<ProcessRunResult> {
  const sourceBranchName = args.find((arg, index) => index > 0 && !arg.startsWith('-')) ?? '';
  const messages = args.flatMap((arg, index) => (args[index - 1] === '-m' ? [arg] : []));
  const subject = messages[0]?.trim() ?? '';
  const body = messages[1]?.trim() ?? '';
  const state = await readGitState(rootPath);
  const currentBranch = state.branches[state.currentBranch];
  const sourceBranch = state.branches[sourceBranchName];

  if (!currentBranch || !sourceBranch) {
    return { code: 1, stdout: '', stderr: `unknown revision ${sourceBranchName}` };
  }

  const merge = mergeSnapshots(currentBranch.files, sourceBranch.files, sourceBranch.baseFiles);
  if (merge.conflictPaths.length > 0) {
    state.conflictPaths = merge.conflictPaths;
    await writeGitState(rootPath, state);
    return {
      code: 1,
      stdout: '',
      stderr: `CONFLICT (content): Merge conflict in ${merge.conflictPaths.join(', ')}`
    };
  }

  state.branches[state.currentBranch] = {
    files: merge.merged,
    baseFiles: currentBranch.baseFiles
  };
  state.conflictPaths = [];
  await writeGitState(rootPath, state);
  await syncWorkingTree(rootPath, { files: merge.merged });

  const commits = await readCommitLog(rootPath);
  commits.push({ subject, body });
  await fs.writeFile(path.join(rootPath, GIT_SIM_COMMITS_FILE), `${JSON.stringify(commits, null, 2)}\n`, 'utf8');

  return {
    code: 0,
    stdout: `Merge made by the 'ort' strategy.\n`,
    stderr: ''
  };
}

async function fakeGitPush(rootPath: string, args: string[]): Promise<ProcessRunResult> {
  if (await pathExists(path.join(rootPath, GIT_SIM_PUSH_FAILURE_FILE))) {
    const failure = (await fs.readFile(path.join(rootPath, GIT_SIM_PUSH_FAILURE_FILE), 'utf8')).trim() || 'push rejected';
    return {
      code: 1,
      stdout: '',
      stderr: failure
    };
  }

  const remote = args[args.length - 2] ?? '';
  const branch = args[args.length - 1] ?? '';
  const pushes = await readPushLog(rootPath);
  pushes.push({
    remote,
    branch,
    args
  });
  await fs.writeFile(path.join(rootPath, GIT_SIM_PUSHES_FILE), `${JSON.stringify(pushes, null, 2)}\n`, 'utf8');

  return {
    code: 0,
    stdout: `branch '${branch}' set up to track '${remote}/${branch}'.\n`,
    stderr: ''
  };
}

async function fakeGhPrCreate(rootPath: string, args: string[]): Promise<ProcessRunResult> {
  if (await pathExists(path.join(rootPath, GIT_SIM_GH_MISSING_FILE))) {
    throw Object.assign(new Error('spawn gh ENOENT'), { code: 'ENOENT' });
  }

  if (await pathExists(path.join(rootPath, GIT_SIM_GH_FAILURE_FILE))) {
    const failure = (await fs.readFile(path.join(rootPath, GIT_SIM_GH_FAILURE_FILE), 'utf8')).trim() || 'gh pr create failed';
    return {
      code: 1,
      stdout: '',
      stderr: failure
    };
  }

  const base = args[args.indexOf('--base') + 1] ?? '';
  const head = args[args.indexOf('--head') + 1] ?? '';
  const title = args[args.indexOf('--title') + 1] ?? '';
  const body = args[args.indexOf('--body') + 1] ?? '';
  const pullRequests = await readPullRequestLog(rootPath);
  pullRequests.push({
    base,
    head,
    title,
    body,
    args
  });
  await fs.writeFile(path.join(rootPath, GIT_SIM_PULL_REQUESTS_FILE), `${JSON.stringify(pullRequests, null, 2)}\n`, 'utf8');

  return {
    code: 0,
    stdout: 'https://github.com/example/repo/pull/1\n',
    stderr: ''
  };
}

function parseExecutableLookup(command: string, args: string[]): string {
  if (command === 'where') {
    return args[0] ?? '';
  }

  const expression = args[1] ?? '';
  const match = /command -v '(.+)'$/.exec(expression);
  return match?.[1] ?? '';
}

async function fakeExecutableLookup(command: string, args: string[]): Promise<ProcessRunResult> {
  const executable = parseExecutableLookup(command, args).trim();
  if (!executable) {
    return { code: 1, stdout: '', stderr: '' };
  }

  if (path.isAbsolute(executable) || executable.includes('/') || executable.includes('\\')) {
    return {
      code: await pathExists(executable) ? 0 : 1,
      stdout: executable,
      stderr: ''
    };
  }

  if (['git', 'gh', 'node', 'npm', 'codex', 'where', 'sh'].includes(executable)) {
    return {
      code: 0,
      stdout: executable,
      stderr: ''
    };
  }

  return {
    code: 1,
    stdout: '',
    stderr: ''
  };
}

async function fakeCodexExecProcessLookup(rootPath: string): Promise<ProcessRunResult> {
  const processListPath = path.join(rootPath, ACTIVE_CODEX_PROCESS_FILE);
  if (!(await pathExists(processListPath))) {
    return {
      code: 0,
      stdout: '',
      stderr: ''
    };
  }

  return {
    code: 0,
    stdout: await fs.readFile(processListPath, 'utf8'),
    stderr: ''
  };
}

function stripLeadingCd(command: string, cwd: string): { command: string; cwd: string } {
  const match = /^\s*cd\s+("[^"]+"|'[^']+'|[^&|;]+?)\s*&&\s*(.+)\s*$/s.exec(command);
  if (!match) {
    return { command, cwd };
  }

  const rawTarget = match[1].trim();
  const target = rawTarget.startsWith('"') || rawTarget.startsWith('\'')
    ? rawTarget.slice(1, -1)
    : rawTarget;

  return {
    command: match[2].trim(),
    cwd: path.resolve(cwd, target)
  };
}

async function fakeShellCommand(command: string, cwd: string): Promise<ProcessRunResult> {
  const normalized = stripLeadingCd(command, cwd);
  const trimmed = normalized.command.trim();

  if (/^npm(?:\.cmd)?\s+test$/i.test(trimmed)) {
    return { code: 0, stdout: '', stderr: '' };
  }

  if (/^npm(?:\.cmd)?\s+run\s+test$/i.test(trimmed)) {
    return { code: 0, stdout: '', stderr: '' };
  }

  if (/^npm(?:\.cmd)?\s+run\s+validate$/i.test(trimmed)) {
    await fs.writeFile(path.join(normalized.cwd, 'validate.cwd.txt'), normalized.cwd, 'utf8');
    return { code: 0, stdout: '', stderr: '' };
  }

  if (/^node(?:\.exe)?\s+-e\s+"process\.exit\(0\)"$/i.test(trimmed)) {
    return { code: 0, stdout: '', stderr: '' };
  }

  if (/^node(?:\.exe)?\s+-e\s+"process\.exit\(1\)"$/i.test(trimmed)) {
    return { code: 1, stdout: '', stderr: '' };
  }

  if (trimmed.includes('console.error(\'deterministic failure\')') && trimmed.includes('process.exit(1)')) {
    return { code: 1, stdout: '', stderr: 'deterministic failure\n' };
  }

  throw new Error(`Unsupported fake shell command: ${trimmed}`);
}

async function fakeCliCommand(command: string, options: ProcessRunOptions): Promise<ProcessRunResult> {
  if (!(await pathExists(command))) {
    throw Object.assign(new Error(`spawn ${command} ENOENT`), { code: 'ENOENT' });
  }

  const script = await fs.readFile(command, 'utf8');
  assert.match(script, /network offline/);
  const lastMessagePath = script
    .split('\n')
    .find((line) => line.includes('--output-last-message'));
  void lastMessagePath;

  return {
    code: 1,
    stdout: '',
    stderr: [
      'ERROR: stream disconnected before completion: network offline',
      'ERROR: Failed to shutdown rollout recorder'
    ].join('\n')
  };
}

async function fakeProcessRunner(command: string, args: string[], options: ProcessRunOptions): Promise<ProcessRunResult> {
  if (command === 'git' && args[0] === 'rev-parse') {
    if (args[1] === '--is-inside-work-tree') {
      return {
        code: await pathExists(path.join(options.cwd, GIT_SIM_DIR)) ? 0 : 1,
        stdout: 'true\n',
        stderr: ''
      };
    }

    return fakeGitRevParse(options.cwd, args);
  }

  if (command === 'git' && args[0] === 'status') {
    return fakeGitStatus(options.cwd);
  }

  if (command === 'git' && args[0] === 'add') {
    return fakeGitAdd();
  }

  if (command === 'git' && args[0] === 'commit') {
    return fakeGitCommit(options.cwd, args);
  }

  if (command === 'git' && args[0] === 'checkout') {
    return fakeGitCheckout(options.cwd, args);
  }

  if (command === 'git' && args[0] === 'merge') {
    return fakeGitMerge(options.cwd, args);
  }

  if (command === 'git' && args[0] === 'push') {
    return fakeGitPush(options.cwd, args);
  }

  if (command === 'git' && args[0] === 'diff') {
    return fakeGitDiff(options.cwd, args);
  }

  if (command === 'gh' && args[0] === 'pr' && args[1] === 'create') {
    return fakeGhPrCreate(options.cwd, args);
  }

  if (command === 'sh' && args[0] === '-lc' && (args[1] ?? '').includes('ps -eo command')) {
    return fakeCodexExecProcessLookup(options.cwd);
  }

  if (command === 'where' || (command === 'sh' && args[0] === '-lc')) {
    return fakeExecutableLookup(command, args);
  }

  if (command === 'powershell' && args.includes('-Command') && args.some((arg) => arg.includes('Get-CimInstance Win32_Process'))) {
    return fakeCodexExecProcessLookup(options.cwd);
  }

  if (options.shell) {
    return fakeShellCommand(command, options.cwd);
  }

  return fakeCliCommand(command, options);
}

export function installProcessTestHarness(): void {
  setProcessRunnerOverride(fakeProcessRunner);
}

export function resetProcessTestHarness(): void {
  setProcessRunnerOverride(null);
}
