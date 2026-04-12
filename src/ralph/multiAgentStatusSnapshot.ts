import * as fs from 'fs/promises';
import * as path from 'path';
import {
  type AgentHandoffSummary,
  type AgentStatusSummary,
  computeStuckScore,
} from './multiAgentStatus';
import type { RalphTask, RalphTaskTier } from './types';
import { inspectTaskClaimGraph } from './taskFile';

async function readJsonArtifact(target: string): Promise<unknown | null> {
  try {
    return JSON.parse(await fs.readFile(target, 'utf8'));
  } catch {
    return null;
  }
}

function normalizeHandoffNote(candidate: unknown): AgentHandoffSummary | null {
  if (typeof candidate !== 'object' || candidate === null) {
    return null;
  }

  const record = candidate as Record<string, unknown>;
  if (typeof record.iteration !== 'number') {
    return null;
  }

  return {
    iteration: record.iteration,
    selectedTaskId: typeof record.selectedTaskId === 'string' ? record.selectedTaskId : null,
    selectedTaskTitle: typeof record.selectedTaskTitle === 'string' ? record.selectedTaskTitle : null,
    stopReason: typeof record.stopReason === 'string' ? record.stopReason : null,
    completionClassification: typeof record.completionClassification === 'string' ? record.completionClassification : null,
    progressNote: typeof record.progressNote === 'string' ? record.progressNote : null
  };
}

async function readAllHandoffsForAgent(handoffDir: string, agentId: string): Promise<AgentHandoffSummary[]> {
  let entries: string[];

  try {
    const allEntries = await fs.readdir(handoffDir);
    entries = allEntries.filter((entry) => entry.startsWith(`${agentId}-`) && entry.endsWith('.json'));
  } catch {
    return [];
  }

  if (entries.length === 0) {
    return [];
  }

  const handoffs = await Promise.all(
    entries.map(async (entry) => {
      const content = await readJsonArtifact(path.join(handoffDir, entry));
      return normalizeHandoffNote(content);
    })
  );

  return handoffs
    .filter((handoff): handoff is AgentHandoffSummary => handoff !== null)
    .sort((left, right) => left.iteration - right.iteration);
}

function buildTaskTierLookup(rawTaskFile: unknown): Map<string, RalphTask> {
  const lookup = new Map<string, RalphTask>();
  if (typeof rawTaskFile !== 'object' || rawTaskFile === null) {
    return lookup;
  }

  const record = rawTaskFile as Record<string, unknown>;
  if (!Array.isArray(record.tasks)) {
    return lookup;
  }

  for (const task of record.tasks) {
    if (typeof task === 'object' && task !== null && typeof (task as Record<string, unknown>).id === 'string') {
      lookup.set((task as Record<string, unknown>).id as string, task as RalphTask);
    }
  }

  return lookup;
}

export async function readMultiAgentStatusSummaries(ralphDir: string, claimFilePath: string): Promise<AgentStatusSummary[]> {
  const agentsDir = path.join(ralphDir, 'agents');
  const handoffDir = path.join(ralphDir, 'handoff');

  let agentFiles: string[];

  try {
    const allFiles = await fs.readdir(agentsDir);
    agentFiles = allFiles.filter((entry) => entry.endsWith('.json') && !entry.endsWith('.tmp'));
  } catch {
    return [];
  }

  const [claimGraph, rawTaskFile] = await Promise.all([
    inspectTaskClaimGraph(claimFilePath).catch(() => null),
    readJsonArtifact(path.join(ralphDir, 'tasks.json'))
  ]);
  const taskLookup = buildTaskTierLookup(rawTaskFile);

  const summaries = await Promise.all(
    agentFiles.map(async (fileName): Promise<AgentStatusSummary> => {
      const agentId = fileName.replace(/\.json$/, '');
      const record = await readJsonArtifact(path.join(agentsDir, fileName));
      const normalized = typeof record === 'object' && record !== null ? record as Record<string, unknown> : {};

      const firstSeenAt = typeof normalized.firstSeenAt === 'string' ? normalized.firstSeenAt : '';
      const completedTaskIds = Array.isArray(normalized.completedTaskIds) ? normalized.completedTaskIds : [];
      const completedTaskCount = completedTaskIds.length;

      const activeClaimEntry = claimGraph?.tasks.find(
        (entry) => entry.canonicalClaim?.claim.agentId === agentId && entry.canonicalClaim?.claim.status === 'active'
      );
      const activeClaimTaskId = activeClaimEntry?.taskId ?? null;

      const activeClaimTask = activeClaimTaskId ? taskLookup.get(activeClaimTaskId) ?? null : null;
      const activeClaimTaskTier: RalphTaskTier | null = activeClaimTask?.tier ?? null;
      const activeClaimTaskTierSource: 'explicit' | 'dynamic' | null = activeClaimTaskId === null
        ? null
        : activeClaimTask?.tier
          ? 'explicit'
          : 'dynamic';

      const handoffHistory = await readAllHandoffsForAgent(handoffDir, agentId);
      const stuckScore = computeStuckScore(handoffHistory);
      const latestHandoff = handoffHistory.length > 0 ? handoffHistory[handoffHistory.length - 1] : null;

      return {
        agentId,
        firstSeenAt,
        completedTaskCount,
        activeClaimTaskId,
        activeClaimTaskTier,
        activeClaimTaskTierSource,
        handoffHistory,
        latestHandoff,
        stuckScore,
      };
    })
  );

  return summaries.sort((left, right) => left.agentId.localeCompare(right.agentId));
}
