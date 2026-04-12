import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { withTaskFileLock, parseTaskFile, stringifyTaskFile, bumpMutationCount } from '../ralph/taskFile';
import type { RalphTask, RalphTaskFile } from '../ralph/types';
import type { CliProviderId, OperatorMode, RalphCodexConfig } from '../config/types';
import { pathExists } from '../util/fs';
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
  if (newTasks.length === 0) {
    throw new Error('Review at least one task before writing tasks.json.');
  }

  const normalizedTasks: RalphTask[] = newTasks.map((task) => {
    const normalizedId = task.id.trim();
    const normalizedTitle = task.title.trim();

    if (!normalizedId) {
      throw new Error('Each reviewed task must keep a non-empty id before writing tasks.json.');
    }

    if (!normalizedTitle) {
      throw new Error(`Task ${task.id} must have a non-empty title before writing tasks.json.`);
    }

    return {
      id: normalizedId,
      title: normalizedTitle,
      status: task.status,
      ...(task.validation ? { validation: task.validation } : {}),
      ...(task.tier ? { tier: task.tier } : {})
    } satisfies RalphTask;
  });

  parseTaskFile(JSON.stringify({
    version: 2,
    tasks: normalizedTasks
  }));

  return normalizedTasks;
}

export async function replaceTasksFile(
  tasksPath: string,
  newTasks: PrdWizardTaskDraft[]
): Promise<void> {
  const locked = await withTaskFileLock(tasksPath, undefined, async () => {
    let taskFile: RalphTaskFile = { version: 2, tasks: [] };
    if (await pathExists(tasksPath)) {
      taskFile = parseTaskFile(await fs.readFile(tasksPath, 'utf8'));
    }

    const next = bumpMutationCount({
      ...taskFile,
      tasks: normalizeWizardTasksForPersistence(newTasks)
    });

    await fs.writeFile(tasksPath, stringifyTaskFile(next), 'utf8');
  });

  if (locked.outcome === 'lock_timeout') {
    throw new Error(`Timed out acquiring tasks.json lock at ${locked.lockPath} after ${locked.attempts} attempt(s).`);
  }
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
