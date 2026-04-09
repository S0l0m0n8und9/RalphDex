import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { RalphPaths } from './pathResolver';
import { findTaskById, parseTaskFile } from './taskFile';
import { RalphDiffSummary, RalphTask, RalphTaskFile, RalphVerificationResult } from './types';
import { buildValidationFailureSignature, containsHumanReviewMarker } from './loopLogic';
import { runProcess, ProcessTimeoutError } from '../services/processRunner';
import { WorkspaceScan } from '../services/workspaceInspection';

export interface RalphCoreStateSnapshot {
  objectiveText: string;
  progressText: string;
  tasksText: string;
  taskFile: RalphTaskFile;
  taskFileError: string | null;
  hashes: {
    objective: string;
    progress: string;
    tasks: string;
  };
}

export interface GitStatusSnapshot {
  available: boolean;
  raw: string;
  entries: GitStatusEntry[];
}

export interface GitStatusEntry {
  status: string;
  path: string;
}

export interface ValidationCommandVerification {
  result: RalphVerificationResult;
  command: string | null;
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export interface ValidationCommandReadinessInspection {
  command: string | null;
  status: 'missing' | 'selected' | 'executableConfirmed' | 'executableNotConfirmed';
  executable: string | null;
}

export interface TaskStateVerification {
  result: RalphVerificationResult;
  selectedTaskAfter: RalphTask | null;
  selectedTaskCompleted: boolean;
  selectedTaskBlocked: boolean;
  humanReviewNeeded: boolean;
  progressChanged: boolean;
  taskFileChanged: boolean;
}

function hashText(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

async function readText(target: string): Promise<string> {
  return fs.readFile(target, 'utf8').catch(() => '');
}

function parseGitStatus(raw: string): GitStatusEntry[] {
  return raw
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length >= 3)
    .map((line) => {
      const status = line.slice(0, 2).trim() || '??';
      const body = line.slice(3).trim();
      const parsedPath = body.includes(' -> ') ? body.split(' -> ').at(-1) ?? body : body;

      return {
        status,
        path: parsedPath
      };
    });
}

function isRelevantChange(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, '/');

  if (normalized === '.ralph/state.json') {
    return false;
  }
  if (normalized.startsWith('.ralph/prompts/')
    || normalized.startsWith('.ralph/runs/')
    || normalized.startsWith('.ralph/logs/')
    || normalized.startsWith('.ralph/artifacts/')) {
    return false;
  }

  return true;
}

function tokenizeShellCommand(command: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | '\'' | null = null;
  let escaped = false;

  for (const char of command) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (quote === '\'') {
      if (char === '\'') {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (quote === '"') {
      if (char === '"') {
        quote = null;
      } else if (char === '\\') {
        escaped = true;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === '\'') {
      quote = char;
      continue;
    }

    if (char === '\\') {
      if (process.platform === 'win32') {
        current += char;
      } else {
        escaped = true;
      }
      continue;
    }

    if (/\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

function extractExecutableToken(command: string): string | null {
  const tokens = tokenizeShellCommand(command);

  for (const token of tokens) {
    if (/^[A-Za-z_][A-Za-z0-9_]*=.*/.test(token)) {
      continue;
    }

    return token;
  }

  return null;
}

function usesExplicitExecutablePath(executable: string): boolean {
  return path.isAbsolute(executable) || executable.includes(path.sep) || executable.includes('/');
}

async function isExecutable(commandPath: string): Promise<boolean> {
  try {
    await fs.access(commandPath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function stripOuterQuotes(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith('\'') && trimmed.endsWith('\''))) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

export function normalizeValidationCommand(input: {
  command: string | null;
  workspaceRootPath: string;
  verificationRootPath: string;
}): string | null {
  if (!input.command) {
    return null;
  }

  const match = /^\s*cd\s+("[^"]+"|'[^']+'|[^&|;]+?)\s*&&\s*(.+)\s*$/s.exec(input.command);
  if (!match) {
    return input.command;
  }

  const target = stripOuterQuotes(match[1]);
  const normalizedVerificationRoot = path.resolve(input.verificationRootPath);
  const normalizedTargetFromWorkspaceRoot = path.resolve(input.workspaceRootPath, target);
  if (normalizedTargetFromWorkspaceRoot === normalizedVerificationRoot) {
    return match[2].trim();
  }

  if (path.resolve(input.workspaceRootPath) === normalizedVerificationRoot) {
    const normalizedTargetFromVerifierParent = path.resolve(path.dirname(normalizedVerificationRoot), target);
    if (normalizedTargetFromVerifierParent === normalizedVerificationRoot) {
      return match[2].trim();
    }
  }

  return input.command;
}

async function writeJsonArtifact(target: string, value: unknown): Promise<string> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return target;
}

export async function captureCoreState(paths: RalphPaths): Promise<RalphCoreStateSnapshot> {
  const [objectiveText, progressText, tasksText] = await Promise.all([
    readText(paths.prdPath),
    readText(paths.progressPath),
    readText(paths.taskFilePath)
  ]);
  let taskFile: RalphTaskFile;
  let taskFileError: string | null = null;

  try {
    taskFile = parseTaskFile(tasksText);
  } catch (error) {
    taskFile = { version: 2, tasks: [] };
    taskFileError = error instanceof Error ? error.message : String(error);
  }

  return {
    objectiveText,
    progressText,
    tasksText,
    taskFile,
    taskFileError,
    hashes: {
      objective: hashText(objectiveText),
      progress: hashText(progressText),
      tasks: hashText(tasksText)
    }
  };
}

export async function captureGitStatus(rootPath: string): Promise<GitStatusSnapshot> {
  const probe = await runProcess('git', ['rev-parse', '--is-inside-work-tree'], {
    cwd: rootPath
  }).catch(() => null);

  if (!probe || probe.code !== 0 || probe.stdout.trim() !== 'true') {
    return {
      available: false,
      raw: '',
      entries: []
    };
  }

  const status = await runProcess('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
    cwd: rootPath
  });

  return {
    available: status.code === 0,
    raw: status.stdout,
    entries: status.code === 0 ? parseGitStatus(status.stdout) : []
  };
}

export function chooseValidationCommand(
  workspaceScan: WorkspaceScan,
  selectedTask: RalphTask | null,
  overrideCommand: string
): string | null {
  if (overrideCommand.trim()) {
    return overrideCommand.trim();
  }

  if (selectedTask?.validation?.trim()) {
    return selectedTask.validation.trim();
  }

  return workspaceScan.validationCommands[0] ?? null;
}

export async function inspectValidationCommandReadiness(input: {
  command: string | null;
  rootPath: string;
}): Promise<ValidationCommandReadinessInspection> {
  if (!input.command) {
    return {
      command: null,
      status: 'missing',
      executable: null
    };
  }

  const executable = extractExecutableToken(input.command);
  if (!executable) {
    return {
      command: input.command,
      status: 'selected',
      executable: null
    };
  }

  if (usesExplicitExecutablePath(executable)) {
    return {
      command: input.command,
      status: await isExecutable(executable) ? 'executableConfirmed' : 'executableNotConfirmed',
      executable
    };
  }

  try {
    const lookup = process.platform === 'win32'
      ? await runProcess('where', [executable], { cwd: input.rootPath })
      : await runProcess('sh', ['-lc', `command -v ${shellQuote(executable)}`], { cwd: input.rootPath });
    const resolvedExecutable = lookup.stdout
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length > 0)
      ?? executable;

    return {
      command: input.command,
      status: lookup.code === 0 ? 'executableConfirmed' : 'executableNotConfirmed',
      executable: resolvedExecutable
    };
  } catch {
    return {
      command: input.command,
      status: 'executableNotConfirmed',
      executable
    };
  }
}

export async function runValidationCommandVerifier(input: {
  command: string | null;
  taskValidationHint?: string | null;
  normalizedValidationCommandFrom?: string | null;
  rootPath: string;
  artifactDir: string;
}): Promise<ValidationCommandVerification> {
  if (!input.command) {
    return {
      command: null,
      stdout: '',
      stderr: '',
      exitCode: null,
      result: {
        verifier: 'validationCommand',
        status: 'skipped',
        summary: 'No validation command was selected for this iteration.',
        warnings: [],
        errors: []
      }
    };
  }

  const DEFAULT_VALIDATION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

  let run: { code: number; stdout: string; stderr: string };
  try {
    run = await runProcess(input.command, [], {
      cwd: input.rootPath,
      shell: true,
      timeoutMs: DEFAULT_VALIDATION_TIMEOUT_MS
    });
  } catch (err) {
    if (err instanceof ProcessTimeoutError) {
      const stdoutPath = path.join(input.artifactDir, 'validation-command.stdout.log');
      const stderrPath = path.join(input.artifactDir, 'validation-command.stderr.log');
      const summaryPath = path.join(input.artifactDir, 'validation-command.json');
      await fs.mkdir(input.artifactDir, { recursive: true });
      await Promise.all([
        fs.writeFile(stdoutPath, '', 'utf8'),
        fs.writeFile(stderrPath, '', 'utf8')
      ]);
      const timeoutSummary = `Validation command timed out after ${DEFAULT_VALIDATION_TIMEOUT_MS}ms: ${input.command}`;
      const result: RalphVerificationResult = {
        verifier: 'validationCommand',
        status: 'failed',
        summary: timeoutSummary,
        warnings: [],
        errors: [timeoutSummary],
        command: input.command,
        artifactPath: summaryPath,
        failureSignature: `timeout:${input.command}`,
        metadata: {
          exitCode: null,
          taskValidationHint: input.taskValidationHint ?? null,
          normalizedValidationCommandFrom: input.normalizedValidationCommandFrom ?? null,
          stdoutPath,
          stderrPath,
          timedOut: true,
          timeoutMs: DEFAULT_VALIDATION_TIMEOUT_MS
        }
      };
      await writeJsonArtifact(summaryPath, {
        command: input.command,
        taskValidationHint: input.taskValidationHint ?? null,
        normalizedValidationCommandFrom: input.normalizedValidationCommandFrom ?? null,
        exitCode: null,
        stdoutPath,
        stderrPath,
        failureSignature: `timeout:${input.command}`,
        timedOut: true,
        timeoutMs: DEFAULT_VALIDATION_TIMEOUT_MS
      });
      return {
        command: input.command,
        stdout: '',
        stderr: '',
        exitCode: null,
        result
      };
    }
    throw err;
  }

  const stdoutPath = path.join(input.artifactDir, 'validation-command.stdout.log');
  const stderrPath = path.join(input.artifactDir, 'validation-command.stderr.log');
  const summaryPath = path.join(input.artifactDir, 'validation-command.json');

  await fs.mkdir(input.artifactDir, { recursive: true });
  await Promise.all([
    fs.writeFile(stdoutPath, run.stdout, 'utf8'),
    fs.writeFile(stderrPath, run.stderr, 'utf8')
  ]);

  const failureSignature = buildValidationFailureSignature(input.command, run.code, run.stdout, run.stderr);
  const result: RalphVerificationResult = {
    verifier: 'validationCommand',
    status: run.code === 0 ? 'passed' : 'failed',
    summary: run.code === 0
      ? `Validation command passed: ${input.command}`
      : `Validation command failed with exit code ${run.code}: ${input.command}`,
    warnings: [],
    errors: run.code === 0 ? [] : [`Validation command exited with ${run.code}.`],
    command: input.command,
    artifactPath: summaryPath,
    failureSignature,
    metadata: {
      exitCode: run.code,
      taskValidationHint: input.taskValidationHint ?? null,
      normalizedValidationCommandFrom: input.normalizedValidationCommandFrom ?? null,
      stdoutPath,
      stderrPath
    }
  };

  await writeJsonArtifact(summaryPath, {
    command: input.command,
    taskValidationHint: input.taskValidationHint ?? null,
    normalizedValidationCommandFrom: input.normalizedValidationCommandFrom ?? null,
    exitCode: run.code,
    stdoutPath,
    stderrPath,
    failureSignature
  });

  return {
    command: input.command,
    stdout: run.stdout,
    stderr: run.stderr,
    exitCode: run.code,
    result
  };
}

export async function runTaskStateVerifier(input: {
  selectedTaskId: string | null;
  before: RalphCoreStateSnapshot;
  after: RalphCoreStateSnapshot;
  artifactDir: string;
}): Promise<TaskStateVerification> {
  const selectedTaskBefore = findTaskById(input.before.taskFile, input.selectedTaskId);
  const selectedTaskAfter = findTaskById(input.after.taskFile, input.selectedTaskId);
  const progressChanged = input.before.hashes.progress !== input.after.hashes.progress;
  const taskFileChanged = input.before.hashes.tasks !== input.after.hashes.tasks;
  const selectedTaskCompleted = selectedTaskAfter?.status === 'done';
  const selectedTaskBlocked = selectedTaskAfter?.status === 'blocked';
  const humanReviewNeeded = containsHumanReviewMarker(selectedTaskAfter?.blocker)
    || containsHumanReviewMarker(selectedTaskAfter?.notes);
  const summaryPath = path.join(input.artifactDir, 'task-state.json');

  let status: RalphVerificationResult['status'] = 'skipped';
  let summary = 'No task-state progress was detected.';
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!input.selectedTaskId) {
    if (progressChanged || taskFileChanged) {
      status = 'passed';
      summary = 'Durable Ralph task/progress files changed during a no-task iteration.';
    } else {
      summary = 'No Ralph task was selected for task-state verification.';
    }
  } else if (input.after.taskFileError) {
    status = 'failed';
    summary = `Task file could not be parsed after iteration for ${input.selectedTaskId}.`;
    errors.push(input.after.taskFileError);
  } else if (selectedTaskCompleted) {
    status = 'passed';
    summary = `Selected task ${input.selectedTaskId} is marked done.`;
  } else if (selectedTaskBlocked) {
    status = 'failed';
    summary = `Selected task ${input.selectedTaskId} is blocked.`;
    errors.push(selectedTaskAfter?.blocker ?? 'Task status is blocked.');
  } else if (selectedTaskBefore?.status !== selectedTaskAfter?.status) {
    status = 'passed';
    summary = `Selected task ${input.selectedTaskId} changed from ${selectedTaskBefore?.status ?? 'missing'} to ${selectedTaskAfter?.status ?? 'missing'}.`;
  } else if (progressChanged || taskFileChanged) {
    status = 'passed';
    summary = `Durable Ralph task/progress files changed for ${input.selectedTaskId}.`;
  } else {
    warnings.push('Task and progress files were unchanged during the iteration.');
  }

  await writeJsonArtifact(summaryPath, {
    selectedTaskId: input.selectedTaskId,
    selectedTaskBefore,
    selectedTaskAfter,
    taskFileError: input.after.taskFileError,
    progressChanged,
    taskFileChanged,
    humanReviewNeeded
  });

  return {
    selectedTaskAfter,
    selectedTaskCompleted,
    selectedTaskBlocked,
    humanReviewNeeded,
    progressChanged,
    taskFileChanged,
    result: {
      verifier: 'taskState',
      status,
      summary,
      warnings,
      errors,
      artifactPath: summaryPath
    }
  };
}

export async function runFileChangeVerifier(input: {
  rootPath: string;
  artifactDir: string;
  beforeGit: GitStatusSnapshot;
  afterGit: GitStatusSnapshot;
  before: RalphCoreStateSnapshot;
  after: RalphCoreStateSnapshot;
}): Promise<{ result: RalphVerificationResult; diffSummary: RalphDiffSummary }> {
  const changedFiles = new Set<string>();
  const beforeStatuses = new Map<string, string>(input.beforeGit.entries.map((entry) => [entry.path, entry.status]));
  const afterStatuses = new Map<string, string>(input.afterGit.entries.map((entry) => [entry.path, entry.status]));

  for (const [filePath, status] of afterStatuses) {
    if (beforeStatuses.get(filePath) !== status) {
      changedFiles.add(filePath);
    }
  }
  for (const [filePath] of beforeStatuses) {
    if (!afterStatuses.has(filePath)) {
      changedFiles.add(filePath);
    }
  }

  if (input.before.hashes.objective !== input.after.hashes.objective) {
    changedFiles.add('.ralph/prd.md');
  }
  if (input.before.hashes.progress !== input.after.hashes.progress) {
    changedFiles.add('.ralph/progress.md');
  }
  if (input.before.hashes.tasks !== input.after.hashes.tasks) {
    changedFiles.add('.ralph/tasks.json');
  }

  const orderedChangedFiles = Array.from(changedFiles).sort();
  const relevantChangedFiles = orderedChangedFiles.filter((item) => isRelevantChange(item));
  const statusTransitions = orderedChangedFiles.map((item) => {
    const beforeStatus = beforeStatuses.get(item) ?? 'clean';
    const afterStatus = afterStatuses.get(item) ?? 'clean';
    return `${item}: ${beforeStatus} -> ${afterStatus}`;
  });
  const suggestedCheckpointRef = relevantChangedFiles.length > 0
    ? `ralph/iter-${path.basename(input.artifactDir)}`
    : undefined;
  const diffSummary: RalphDiffSummary = {
    available: input.beforeGit.available || input.afterGit.available || orderedChangedFiles.length > 0,
    gitAvailable: input.beforeGit.available || input.afterGit.available,
    summary: relevantChangedFiles.length > 0
      ? `Detected ${relevantChangedFiles.length} relevant changed file(s) out of ${orderedChangedFiles.length} total changes.`
      : orderedChangedFiles.length > 0
        ? `Detected ${orderedChangedFiles.length} change(s), but none outside Ralph-managed files.`
        : 'No relevant file changes were detected.',
    changedFileCount: orderedChangedFiles.length,
    relevantChangedFileCount: relevantChangedFiles.length,
    changedFiles: orderedChangedFiles,
    relevantChangedFiles,
    statusTransitions,
    suggestedCheckpointRef,
    beforeStatusPath: input.beforeGit.available ? path.join(input.artifactDir, 'git-status-before.txt') : undefined,
    afterStatusPath: input.afterGit.available ? path.join(input.artifactDir, 'git-status-after.txt') : undefined
  };
  const summaryPath = path.join(input.artifactDir, 'git-diff.json');

  await writeJsonArtifact(summaryPath, diffSummary);

  return {
    diffSummary,
    result: {
      verifier: 'gitDiff',
      status: relevantChangedFiles.length > 0 ? 'passed' : 'failed',
      summary: diffSummary.summary,
      warnings: relevantChangedFiles.length > 0 ? [] : ['No relevant workspace changes were detected.'],
      errors: [],
      artifactPath: summaryPath,
      metadata: {
        changedFiles: orderedChangedFiles,
        relevantChangedFiles
      }
    }
  };
}
