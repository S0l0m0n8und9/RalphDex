import * as fs from 'node:fs/promises';
import * as vscode from 'vscode';
import { readConfig } from '../config/readConfig';
import { resolveRalphPaths } from '../ralph/pathResolver';
import { seedTasksFromRequest, TaskSeedingError } from '../ralph/taskSeeder';
import { appendNormalizedTasksToFile } from '../ralph/taskCreation';
import { parseTaskFile } from '../ralph/taskFile';
import { Logger } from '../services/logger';
import { toErrorMessage } from '../util/error';
import { pathExists } from '../util/fs';
import { requireTrustedWorkspace } from './workspaceSupport';

export class TaskSeedingCommandError extends Error {}

export interface SeedTasksFromRequestResult {
  createdTaskCount: number;
  tasksPath: string;
  artifactPath: string;
  warnings: string[];
}

export async function seedTasksFromFeatureRequest(
  workspaceFolder: vscode.WorkspaceFolder,
  logger: Logger,
  options: {
    requestText: string;
    logContext: string;
  }
): Promise<SeedTasksFromRequestResult> {
  requireTrustedWorkspace('Task seeding');
  const config = readConfig(workspaceFolder);
  const paths = resolveRalphPaths(workspaceFolder.uri.fsPath, config);
  const tasksPath = paths.taskFilePath;

  if (!(await pathExists(tasksPath))) {
    throw new TaskSeedingCommandError(
      'No .ralph/tasks.json found. Run "Ralphdex: Initialize Workspace" first.'
    );
  }

  const raw = await fs.readFile(tasksPath, 'utf8');
  const taskFile = parseTaskFile(raw);

  try {
    const seeded = await seedTasksFromRequest({
      requestText: options.requestText,
      config,
      cwd: workspaceFolder.uri.fsPath,
      artifactRootDir: paths.artifactDir,
      existingTaskIds: taskFile.tasks.map((task) => task.id)
    });

    await appendNormalizedTasksToFile(tasksPath, seeded.tasks);
    logger.info(`${options.logContext} succeeded.`, {
      taskCount: seeded.tasks.length,
      artifactPath: seeded.artifactPath,
      warnings: seeded.warnings
    });

    return {
      createdTaskCount: seeded.tasks.length,
      tasksPath,
      artifactPath: seeded.artifactPath,
      warnings: seeded.warnings
    };
  } catch (error) {
    const message = error instanceof TaskSeedingError
      ? error.message
      : toErrorMessage(error);
    logger.info(`${options.logContext} failed. Reason: ${message}`);
    throw new TaskSeedingCommandError(message);
  }
}
