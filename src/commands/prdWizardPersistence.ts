import * as fs from 'fs/promises';
import * as path from 'path';
import { persistTaskGenerationPlanArtifact } from '../ralph/prdReadiness';
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
  artifactDir?: string;
}

export function normalizeWizardTasksForPersistence(newTasks: PrdWizardTaskDraft[]): RalphTask[] {
  return normalizeTaskInputsForPersistence(newTasks);
}

export async function replaceTasksFile(
  tasksPath: string,
  newTasks: PrdWizardTaskDraft[]
): Promise<void> {
  if (newTasks.length === 0) {
    return;
  }
  await replaceTasksFileWithNormalizedTasks(tasksPath, newTasks);
}

export async function writePrdWizardDraft(
  draft: PrdWizardDraftBundle,
  paths: PrdWizardWritePaths
): Promise<PrdWizardWriteResult> {
  const filesWritten: string[] = [];

  await fs.mkdir(path.dirname(paths.prdPath), { recursive: true });
  await fs.writeFile(paths.prdPath, draft.prdText, 'utf8');
  filesWritten.push(paths.prdPath);

  if (draft.tasks.length > 0) {
    await replaceTasksFile(paths.tasksPath, draft.tasks);
    filesWritten.push(paths.tasksPath);
  }

  if (draft.taskGenerationPlan && paths.artifactDir) {
    await persistTaskGenerationPlanArtifact(paths.artifactDir, {
      ...draft.taskGenerationPlan,
      status: 'approved'
    });
  }

  return { filesWritten };
}
