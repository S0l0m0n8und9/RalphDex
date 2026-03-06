import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { RalphPaths } from './pathResolver';
import { findTaskById, parseTaskFile } from './taskFile';
import { RalphDiffSummary, RalphTask, RalphTaskFile, RalphVerificationResult } from './types';
import { buildValidationFailureSignature, containsHumanReviewMarker } from './loopLogic';
import { runProcess } from '../services/processRunner';
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

interface GitStatusEntry {
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
    taskFile = { version: 1, tasks: [] };
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

export async function runValidationCommandVerifier(input: {
  command: string | null;
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

  const run = await runProcess(input.command, [], {
    cwd: input.rootPath,
    shell: true
  });
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
      stdoutPath,
      stderrPath
    }
  };

  await writeJsonArtifact(summaryPath, {
    command: input.command,
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
    summary = 'No Ralph task was selected for task-state verification.';
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
    summary: relevantChangedFiles.length > 0
      ? `Detected ${relevantChangedFiles.length} relevant changed file(s).`
      : 'No relevant file changes were detected.',
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
