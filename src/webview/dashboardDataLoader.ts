import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';
import { collectStatusSnapshot } from '../commands/statusSnapshot';
import { readConfig } from '../config/readConfig';
import { RalphStateManager } from '../ralph/stateManager';
import { readMultiAgentStatusSummaries } from '../ralph/multiAgentStatusSnapshot';
import { readEventJournalResumable, type RalphRuntimeEvent } from '../ralph/eventJournal';
import {
  buildRunFileChangeSummary,
  buildExecutionIntentPreview,
  buildUnavailableRunFileChangeSummary,
  buildRunTrustTimeline,
  normalizeRunDiffSummary,
  type ExecutionIntentPreview,
  type RunFileChangeSummary,
  type RunTrustTimeline
} from '../ralph/runTimeline';
import { Logger } from '../services/logger';
import { buildDashboardSnapshot, type DashboardSnapshot } from './dashboardSnapshot';

export type DashboardSnapshotLoader = () => Promise<DashboardSnapshot | null>;

/**
 * Reads the most recent run's event journal for the trust timeline (#73).
 * Prefers the current provenance id, then falls back to the newest run dir that
 * has an `events.jsonl`. Returns null when no journal exists yet.
 */
async function loadRunFileChanges(
  artifactsDir: string,
  events: readonly RalphRuntimeEvent[]
): Promise<RunFileChangeSummary> {
  const diffEvent = [...events]
    .reverse()
    .find((event) => event.type === 'artifact_written'
      && (event.artifactType === 'diff-summary' || event.relativePath.endsWith('/diff-summary.json')));
  if (!diffEvent || diffEvent.type !== 'artifact_written') {
    return buildUnavailableRunFileChangeSummary({
      status: 'missing',
      message: 'No durable diff summary was recorded for the latest run.'
    });
  }

  const artifactRoot = path.resolve(artifactsDir);
  const artifactPath = path.resolve(artifactRoot, diffEvent.relativePath);
  if (artifactPath !== artifactRoot && !artifactPath.startsWith(`${artifactRoot}${path.sep}`)) {
    return buildUnavailableRunFileChangeSummary({
      status: 'unreadable',
      artifactPath,
      message: 'The latest run diff summary path is outside the artifact root.'
    });
  }
  try {
    const parsed = normalizeRunDiffSummary(JSON.parse(await fs.readFile(artifactPath, 'utf8')));
    if (!parsed) {
      return buildUnavailableRunFileChangeSummary({
        status: 'unreadable',
        artifactPath,
        message: 'The latest run diff summary is present but unreadable.'
      });
    }
    return buildRunFileChangeSummary({ diffSummary: parsed, artifactPath });
  } catch (error) {
    return buildUnavailableRunFileChangeSummary({
      status: 'unreadable',
      artifactPath,
      message: `Unable to read latest run diff summary: ${error instanceof Error ? error.message : String(error)}`
    });
  }
}

async function loadLatestRunTimeline(
  artifactsDir: string,
  currentProvenanceId: string | null
): Promise<RunTrustTimeline | null> {
  const candidateRunIds: string[] = [];
  if (currentProvenanceId) {
    candidateRunIds.push(currentProvenanceId);
  }
  try {
    const runDirs = await fs.readdir(path.join(artifactsDir, 'runs'), { withFileTypes: true });
    const names = runDirs
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      // Byte-order (not locale-sensitive) descending: run ids are timestamp/uuid
      // strings whose correct ordering is lexicographic, independent of locale.
      .sort((a, b) => (b > a ? 1 : b < a ? -1 : 0));
    for (const name of names) {
      if (!candidateRunIds.includes(name)) {
        candidateRunIds.push(name);
      }
    }
  } catch {
    // No runs directory yet.
  }

  for (const runId of candidateRunIds) {
    // Resumable read recovers the valid prefix of a journal whose last line is
    // partially written (mid-crash), so a live run is never silently skipped in
    // favour of an older run's stale timeline. ENOENT yields [] -> next candidate.
    const events: RalphRuntimeEvent[] = await readEventJournalResumable(artifactsDir, runId);
    if (events.length > 0) {
      const timeline = buildRunTrustTimeline(events);
      return { ...timeline, fileChanges: await loadRunFileChanges(artifactsDir, events) };
    }
  }
  return null;
}

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

    // Operator trust timeline (#73): pre-run intent from the effective config +
    // selected task, post-run timeline from the latest run's event journal.
    let runTimelineInput: { intent: ExecutionIntentPreview | null; timeline: RunTrustTimeline | null } | null = null;
    try {
      const config = readConfig(workspaceFolder);
      const intent = buildExecutionIntentPreview({
        config,
        selectedTask: status.selectedTask ? { id: status.selectedTask.id, title: status.selectedTask.title } : null
      });
      const timeline = await loadLatestRunTimeline(status.artifactDir, status.currentProvenanceId);
      runTimelineInput = { intent, timeline };
    } catch (error) {
      logger.warn('Failed to build the operator trust timeline for the dashboard.', {
        error: error instanceof Error ? error.message : String(error)
      });
    }

    return buildDashboardSnapshot(status, agentSummaries, runTimelineInput);
  };
}
