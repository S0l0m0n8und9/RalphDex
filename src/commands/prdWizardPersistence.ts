import * as fs from 'fs/promises';
import * as path from 'path';
import type { RalphTask } from '../ralph/types';
import {
  normalizeTaskInputsForPersistence,
  replaceTasksFileWithNormalizedTasks
} from '../ralph/taskCreation';
import type {
  PrdWizardDraftBundle,
  PrdWizardTaskDraft,
  PrdWizardWriteResult
} from '../webview/prdCreationWizardHost';

export interface PrdWizardWritePaths {
  prdPath: string;
  tasksPath: string;
}

export function normalizeWizardTasksForPersistence(newTasks: PrdWizardTaskDraft[]): RalphTask[] {
  return normalizeTaskInputsForPersistence(newTasks);
}

export async function replaceTasksFile(
  tasksPath: string,
  newTasks: PrdWizardTaskDraft[]
): Promise<void> {
  await replaceTasksFileWithNormalizedTasks(tasksPath, newTasks);
}

export async function writePrdWizardDraft(
  draft: PrdWizardDraftBundle,
  paths: PrdWizardWritePaths
): Promise<PrdWizardWriteResult> {
  await fs.mkdir(path.dirname(paths.prdPath), { recursive: true });
  await fs.writeFile(paths.prdPath, draft.prdText, 'utf8');
  await replaceTasksFile(paths.tasksPath, draft.tasks);

  return {
    filesWritten: [paths.prdPath, paths.tasksPath]
  };
}
