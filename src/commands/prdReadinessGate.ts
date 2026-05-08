import * as vscode from 'vscode';
import type { RalphCodexConfig } from '../config/types';
import type { RalphPaths } from '../ralph/pathResolver';
import {
  analyzePrdReadiness,
  persistLatestPrdReadinessArtifacts,
  type PrdReadinessResult
} from '../ralph/prdReadiness';
import { RalphStateManager } from '../ralph/stateManager';
import { Logger } from '../services/logger';

export const RALPH_PRD_PLACEHOLDER = '<!-- TODO: Replace with your Ralph objective before running iterations. -->\n';

export type PrdReadinessGateStatus = 'ready' | 'missing_or_default' | 'readiness_blocked';

export type PrdReadinessGateResult =
  | {
      status: 'ready';
      paths: RalphPaths;
      prdText: string;
      readiness: PrdReadinessResult;
      readinessArtifactPaths: null;
    }
  | {
      status: 'missing_or_default';
      paths: RalphPaths;
      prdText: string;
      readiness: null;
      readinessArtifactPaths: null;
    }
  | {
      status: 'readiness_blocked';
      paths: RalphPaths;
      prdText: string;
      readiness: PrdReadinessResult;
      readinessArtifactPaths: { jsonPath: string; summaryPath: string };
    };

export function isMissingOrDefaultPrd(text: string, stateManager: RalphStateManager): boolean {
  const trimmed = text.trim();
  return trimmed.length === 0
    || stateManager.isDefaultObjective(text)
    || trimmed === RALPH_PRD_PLACEHOLDER.trim()
    || (
      trimmed.includes('Describe the current objective for Ralph here.')
      && trimmed.includes('What should Codex change?')
      && trimmed.includes('What constraints matter?')
    );
}

export async function evaluatePrdReadinessGate(input: {
  workspaceFolder: vscode.WorkspaceFolder;
  config: RalphCodexConfig;
  stateManager: RalphStateManager;
  logger?: Logger;
}): Promise<PrdReadinessGateResult> {
  const snapshot = await input.stateManager.ensureWorkspace(input.workspaceFolder.uri.fsPath, input.config);
  if (input.logger) {
    await input.logger.setWorkspaceLogFile(snapshot.paths.logFilePath);
  }

  const prdText = await input.stateManager.readObjectiveText(snapshot.paths);
  if (isMissingOrDefaultPrd(prdText, input.stateManager)) {
    return {
      status: 'missing_or_default',
      paths: snapshot.paths,
      prdText,
      readiness: null,
      readinessArtifactPaths: null
    };
  }

  const readiness = analyzePrdReadiness(prdText);
  if (readiness.blockers.length > 0) {
    const readinessArtifactPaths = await persistLatestPrdReadinessArtifacts(snapshot.paths.artifactDir, readiness);
    return {
      status: 'readiness_blocked',
      paths: snapshot.paths,
      prdText,
      readiness,
      readinessArtifactPaths
    };
  }

  return {
    status: 'ready',
    paths: snapshot.paths,
    prdText,
    readiness,
    readinessArtifactPaths: null
  };
}
