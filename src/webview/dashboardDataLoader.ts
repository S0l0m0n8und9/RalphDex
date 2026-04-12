import * as path from 'path';
import * as vscode from 'vscode';
import { collectStatusSnapshot } from '../commands/statusSnapshot';
import { RalphStateManager } from '../ralph/stateManager';
import { readMultiAgentStatusSummaries } from '../ralph/multiAgentStatusSnapshot';
import { Logger } from '../services/logger';
import { buildDashboardSnapshot, type DashboardSnapshot } from './dashboardSnapshot';

export type DashboardSnapshotLoader = () => Promise<DashboardSnapshot | null>;

export function createDashboardSnapshotLoader(
  stateManager: RalphStateManager,
  logger: Logger
): DashboardSnapshotLoader {
  return async (): Promise<DashboardSnapshot | null> => {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return null;
    }

    const status = await collectStatusSnapshot(workspaceFolder, stateManager, logger);
    const ralphDir = path.join(workspaceFolder.uri.fsPath, '.ralph');
    const claimFilePath = path.join(ralphDir, 'claims.json');
    const agentSummaries = await readMultiAgentStatusSummaries(ralphDir, claimFilePath);
    return buildDashboardSnapshot(status, agentSummaries);
  };
}
