import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import type { RalphTask } from '../ralph/types';
import type { OperatorMode, RalphCodexConfig } from '../config/types';
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
  recommendedSkillsPath: string;
}

export function buildPrdWizardConfigSelections(
  config: Pick<RalphCodexConfig, 'cliProvider' | 'operatorMode'>
): PrdWizardConfigSelection[] {
  const operatorMode: OperatorMode = config.operatorMode ?? 'simple';

  return [
    {
      key: 'operatorMode',
      label: 'Operator mode',
      value: operatorMode,
      description: 'Persist the recommended operator preset into workspace settings at confirm time.',
      rationale: operatorMode === config.operatorMode
        ? 'Uses the current workspace preset so future runs stay aligned.'
        : 'Defaults to the supervised preset until the workspace opts into a broader autonomy mode.',
      selected: true
    },
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

function selectionSettingKey(selection: PrdWizardConfigSelection): 'operatorMode' | 'cliProvider' {
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

  const selectedSkills = draft.recommendedSkills
    .filter((skill) => skill.selected)
    .map(({ selected: _selected, ...skill }) => skill);
  const skippedSkills = draft.recommendedSkills
    .filter((skill) => !skill.selected)
    .map((skill) => `${skill.name} (not selected)`);

  await fs.writeFile(paths.recommendedSkillsPath, `${JSON.stringify(selectedSkills, null, 2)}\n`, 'utf8');
  filesWritten.push(paths.recommendedSkillsPath);

  const config = vscode.workspace.getConfiguration('ralphCodex', workspaceFolder.uri);
  for (const selection of draft.configSelections) {
    if (!selection.selected) {
      settingsSkipped.push(`${selectionSummary(selection)} (not selected)`);
      continue;
    }

    await config.update(selectionSettingKey(selection), selection.value, vscode.ConfigurationTarget.Workspace);
    settingsUpdated.push(selectionSummary(selection));
  }

  settingsSkipped.push(...skippedSkills);

  return {
    filesWritten,
    settingsUpdated,
    settingsSkipped
  };
}
