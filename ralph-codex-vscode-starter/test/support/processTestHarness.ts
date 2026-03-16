import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import {
  ProcessRunOptions,
  ProcessRunResult,
  setProcessRunnerOverride
} from '../../src/services/processRunner';

const GIT_SIM_DIR = '.git';
const GIT_SIM_STATE_FILE = path.join(GIT_SIM_DIR, 'ralph-test-index.json');
const ACTIVE_CODEX_PROCESS_FILE = path.join('.ralph', 'active-codex-processes.txt');

interface GitSnapshotState {
  files: Record<string, string>;
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
    const contents = await fs.readFile(path.join(rootPath, relativePath), 'utf8');
    snapshot.files[relativePath] = createHash('sha256').update(contents).digest('hex');
  }
  return snapshot;
}

async function readGitSnapshot(rootPath: string): Promise<GitSnapshotState> {
  const statePath = path.join(rootPath, GIT_SIM_STATE_FILE);
  const raw = await fs.readFile(statePath, 'utf8');
  return JSON.parse(raw) as GitSnapshotState;
}

export async function initializeFakeGitRepository(rootPath: string): Promise<void> {
  await fs.mkdir(path.join(rootPath, GIT_SIM_DIR), { recursive: true });
  const snapshot = await buildGitSnapshot(rootPath);
  await fs.writeFile(path.join(rootPath, GIT_SIM_STATE_FILE), `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}

async function fakeGitStatus(rootPath: string): Promise<ProcessRunResult> {
  const snapshot = await readGitSnapshot(rootPath);
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

  return {
    code: 0,
    stdout: lines.length > 0 ? `${lines.join('\n')}\n` : '',
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

  if (['git', 'node', 'npm', 'codex', 'where', 'sh'].includes(executable)) {
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
    return {
      code: await pathExists(path.join(options.cwd, GIT_SIM_DIR)) ? 0 : 1,
      stdout: 'true\n',
      stderr: ''
    };
  }

  if (command === 'git' && args[0] === 'status') {
    return fakeGitStatus(options.cwd);
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
