import * as path from 'path';
import { WorkspaceScan } from '../services/workspaceInspection';
import { RalphRootPolicy } from './types';

export function deriveRootPolicy(summary: WorkspaceScan): RalphRootPolicy {
  const inspectionRootPath = summary.rootPath;
  const relativeInspectionRoot = path.relative(summary.workspaceRootPath, inspectionRootPath) || '.';
  const policySummary = summary.workspaceRootPath === inspectionRootPath
    ? 'Inspect, execute, and verify at the workspace root while storing Ralph artifacts under .ralph there.'
    : `Inspect ${relativeInspectionRoot}, run Codex and verifiers there, and keep Ralph artifacts under the workspace-root .ralph directory.`;

  return {
    workspaceRootPath: summary.workspaceRootPath,
    inspectionRootPath,
    executionRootPath: inspectionRootPath,
    verificationRootPath: inspectionRootPath,
    selectionStrategy: summary.rootSelection.strategy,
    selectionSummary: summary.rootSelection.summary,
    policySummary
  };
}
