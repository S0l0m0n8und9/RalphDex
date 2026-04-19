import * as fs from 'fs/promises';
import { pathExists } from '../util/fs';
import {
  applySuggestedChildTasks,
  bumpMutationCount,
  parseTaskFile,
  stringifyTaskFile,
  withTaskFileLock
} from './taskFile';
import { normalizeNewTask, type RalphNewTaskInput } from './taskNormalization';
import type { RalphSuggestedChildTask, RalphTask, RalphTaskFile } from './types';

export function normalizeTaskInputsForPersistence(newTasks: RalphNewTaskInput[]): RalphTask[] {
  if (newTasks.length === 0) {
    throw new Error('Review at least one task before writing tasks.json.');
  }

  const normalizedTasks = newTasks.map((task) => {
    if (!task.id.trim()) {
      throw new Error('Each reviewed task must keep a non-empty id before writing tasks.json.');
    }

    if (!task.title.trim()) {
      throw new Error(`Task ${task.id} must have a non-empty title before writing tasks.json.`);
    }

    return normalizeNewTask(task);
  });

  parseTaskFile(JSON.stringify({
    version: 2,
    tasks: normalizedTasks
  }));

  return normalizedTasks;
}

export async function appendNormalizedTasksToFile(
  tasksPath: string,
  newTasks: RalphNewTaskInput[]
): Promise<void> {
  if (newTasks.length === 0) {
    return;
  }

  const locked = await withTaskFileLock(tasksPath, undefined, async () => {
    const raw = await fs.readFile(tasksPath, 'utf8');
    const taskFile = parseTaskFile(raw);
    const next = bumpMutationCount({
      ...taskFile,
      tasks: [...taskFile.tasks, ...normalizeTaskInputsForPersistence(newTasks)]
    });
    const nextText = stringifyTaskFile(next);
    parseTaskFile(nextText);
    await fs.writeFile(tasksPath, nextText, 'utf8');
  });

  if (locked.outcome === 'lock_timeout') {
    throw new Error(`Timed out acquiring tasks.json lock at ${locked.lockPath} after ${locked.attempts} attempt(s).`);
  }
}

/**
 * Producer-facing persistence entry point for task decomposition, remediation,
 * and any future child-task producers. Keeps child creation on the same
 * lock/parse/normalize/write pipeline used by append and replace flows while
 * reusing `applySuggestedChildTasks` for the pure task-graph transform.
 */
export async function applySuggestedChildTasksToFile(
  taskFilePath: string,
  parentTaskId: string,
  suggestedChildTasks: RalphSuggestedChildTask[]
): Promise<RalphTaskFile> {
  const locked = await withTaskFileLock(taskFilePath, undefined, async () => {
    const currentTaskFile = parseTaskFile(await fs.readFile(taskFilePath, 'utf8'));
    const nextTaskFile = bumpMutationCount(
      applySuggestedChildTasks(currentTaskFile, parentTaskId, suggestedChildTasks)
    );
    await fs.writeFile(taskFilePath, stringifyTaskFile(nextTaskFile), 'utf8');
    return parseTaskFile(await fs.readFile(taskFilePath, 'utf8'));
  });

  if (locked.outcome === 'lock_timeout') {
    throw new Error(
      `Timed out acquiring tasks.json lock at ${locked.lockPath} after ${locked.attempts} attempt(s).`
    );
  }

  return locked.value;
}

export async function replaceTasksFileWithNormalizedTasks(
  tasksPath: string,
  newTasks: RalphNewTaskInput[]
): Promise<void> {
  const locked = await withTaskFileLock(tasksPath, undefined, async () => {
    let taskFile: RalphTaskFile = { version: 2, tasks: [] };
    if (await pathExists(tasksPath)) {
      taskFile = parseTaskFile(await fs.readFile(tasksPath, 'utf8'));
    }

    const next = bumpMutationCount({
      ...taskFile,
      tasks: normalizeTaskInputsForPersistence(newTasks)
    });
    await fs.writeFile(tasksPath, stringifyTaskFile(next), 'utf8');
  });

  if (locked.outcome === 'lock_timeout') {
    throw new Error(`Timed out acquiring tasks.json lock at ${locked.lockPath} after ${locked.attempts} attempt(s).`);
  }
}
