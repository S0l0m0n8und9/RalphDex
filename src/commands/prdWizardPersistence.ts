import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import type { RalphTask } from '../ralph/types';
import type { RalphCodexConfig } from '../config/types';
import {
  normalizeTaskInputsForPersistence,
  replaceTasksFileWithNormalizedTasks
} from '../ralph/taskCreation';
import type {
  PrdWizardConfigSelection,
  PrdWizardDraftBundle,
  PrdWizardTaskDraft,
  PrdWizardWriteResult
} from '../webview/prdCreationWizardHost';

export interface PrdWizardWritePaths {
  prdPath: string;
  tasksPath: string;
}

export function buildPrdWizardConfigSelections(
  config: Pick<RalphCodexConfig, 'cliProvider'>
): PrdWizardConfigSelection[] {
  return [
    {
      key: 'cliProvider',
      label: 'CLI provider',
      value: config.cliProvider,
      description: 'Persist the recommended CLI provider into workspace settings at confirm time.',
      rationale: 'Matches the current workspace CLI provider so generation and execution stay on the same backend.',
      selected: true
    }
  ];
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

function selectionSettingKey(selection: PrdWizardConfigSelection): 'cliProvider' {
  return selection.key;
}

function selectionSummary(selection: PrdWizardConfigSelection): string {
  return `ralphCodex.${selection.key} = ${selection.value}`;
}

export async function writePrdWizardDraft(
  workspaceFolder: vscode.WorkspaceFolder,
  draft: PrdWizardDraftBundle,
  paths: PrdWizardWritePaths
): Promise<PrdWizardWriteResult> {
  await fs.mkdir(path.dirname(paths.prdPath), { recursive: true });
  await fs.writeFile(paths.prdPath, draft.prdText, 'utf8');
  await replaceTasksFile(paths.tasksPath, draft.tasks);

  const filesWritten = [paths.prdPath, paths.tasksPath];
  const settingsUpdated: string[] = [];
  const settingsSkipped: string[] = [];

  const config = vscode.workspace.getConfiguration('ralphCodex', workspaceFolder.uri);
  for (const selection of draft.configSelections) {
    if (!selection.selected) {
      settingsSkipped.push(`${selectionSummary(selection)} (not selected)`);
      continue;
    }

    await config.update(selectionSettingKey(selection), selection.value, vscode.ConfigurationTarget.Workspace);
    settingsUpdated.push(selectionSummary(selection));
  }

  return {
    filesWritten,
    settingsUpdated,
    settingsSkipped
  };
}
