import * as fs from 'fs/promises';
import * as path from 'path';
import { stableJson } from './integrity';
import type { ExecutionWave, FanInMemberOutcome, FanInRecord, PlanGraph, RalphTask } from './types';

/**
 * Persist a plan graph to disk.
 *
 * Creates the parent directory recursively if it does not exist, then writes
 * the graph as stable-sorted JSON so diffs remain deterministic.
 */
export async function writePlanGraph(filePath: string, graph: PlanGraph): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, stableJson(graph), 'utf8');
}

/**
 * Read a previously persisted plan graph.
 *
 * Returns `null` when the file does not exist (ENOENT). All other I/O errors
 * are re-thrown so callers distinguish "no graph yet" from real failures.
 */
export async function readPlanGraph(filePath: string): Promise<PlanGraph | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as PlanGraph;
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

/**
 * Validate that an {@link ExecutionWave} is safe to launch.
 *
 * Returns an array of human-readable error strings. An empty array means the
 * wave is safe. Two classes of violation are checked:
 *
 * 1. **Unresolved dependency edges** — a member task has a `dependsOn` entry
 *    whose referent task is not `status === 'done'`.
 * 2. **Write-risk conflicts** — two or more members in the same wave share a
 *    `writeRiskLabels` entry, meaning they would race on the same file or
 *    resource.
 *
 * Member task IDs that do not resolve to any entry in `allTasks` are reported
 * as errors (dangling references).
 */
export function validateWaveSafety(wave: ExecutionWave, allTasks: RalphTask[]): string[] {
  const errors: string[] = [];
  const taskById = new Map(allTasks.map(t => [t.id, t]));

  // --- Check each member for dangling refs and unresolved dependencies ------
  for (const memberId of wave.memberTaskIds) {
    const task = taskById.get(memberId);
    if (!task) {
      errors.push(`Member task '${memberId}' does not exist in the task graph (dangling reference).`);
      continue;
    }
    if (task.dependsOn) {
      for (const depId of task.dependsOn) {
        const dep = taskById.get(depId);
        if (!dep) {
          errors.push(`Task '${memberId}' depends on '${depId}' which does not exist in the task graph.`);
        } else if (dep.status !== 'done') {
          errors.push(`Task '${memberId}' has unresolved dependency '${depId}' (status: '${dep.status}').`);
        }
      }
    }
  }

  // --- Check for write-risk label collisions within the wave ----------------
  const labelOwners = new Map<string, string[]>();
  for (const memberId of wave.memberTaskIds) {
    const task = taskById.get(memberId);
    if (!task?.writeRiskLabels) continue;
    for (const label of task.writeRiskLabels) {
      const owners = labelOwners.get(label);
      if (owners) {
        owners.push(memberId);
      } else {
        labelOwners.set(label, [memberId]);
      }
    }
  }
  for (const [label, owners] of labelOwners) {
    if (owners.length > 1) {
      errors.push(`Write-risk conflict on label '${label}': tasks ${owners.map(id => `'${id}'`).join(' and ')} share it in the same wave.`);
    }
  }

  return errors;
}

/**
 * Evaluate whether all child tasks in the plan graph's wave have completed
 * successfully, with no merge conflicts or validation failures.
 *
 * Writes the {@link FanInRecord} back to `plan-graph.json` as a side effect
 * so the outcome is durable and inspectable.
 *
 * Must be called **outside** the tasks.json lock because it writes to a
 * separate file (`plan-graph.json`) with no concurrent writers at this phase.
 */
export async function validateFanIn(
  planGraphFilePath: string,
  graph: PlanGraph,
  allTasks: RalphTask[]
): Promise<{ passed: boolean; errors: string[] }> {
  const errors: string[] = [];
  const taskById = new Map(allTasks.map(t => [t.id, t]));

  // Find the wave whose memberTaskIds correspond to the parent's children.
  // Use the last wave (highest waveIndex) that has members, which represents
  // the final fan-in point before the parent can complete.
  const wave = [...graph.waves]
    .sort((a, b) => b.waveIndex - a.waveIndex)
    .find(w => w.memberTaskIds.length > 0);

  if (!wave) {
    errors.push('No wave with member tasks found in plan graph.');
    const record: FanInRecord = {
      waveIndex: -1,
      memberOutcomes: {},
      fanInResult: 'failed',
      fanInErrors: errors,
      evaluatedAt: new Date().toISOString()
    };
    await writePlanGraph(planGraphFilePath, { ...graph, fanInRecord: record });
    return { passed: false, errors };
  }

  const memberOutcomes: Record<string, FanInMemberOutcome> = {};

  for (const memberId of wave.memberTaskIds) {
    const task = taskById.get(memberId);
    if (!task) {
      errors.push(`Member task '${memberId}' not found in task graph.`);
      memberOutcomes[memberId] = 'failed';
      continue;
    }

    if (task.status === 'done') {
      // Check for validation failure on the child.
      if (task.lastVerifierResult === 'failed') {
        memberOutcomes[memberId] = 'failed';
      } else {
        memberOutcomes[memberId] = 'done';
      }
    } else if (task.status === 'blocked') {
      memberOutcomes[memberId] = 'blocked';
    } else {
      // in_progress or todo — not yet complete.
      memberOutcomes[memberId] = 'blocked';
    }

    // Check for unresolved merge conflicts.
    if (task.lastReconciliationWarning?.toLowerCase().includes('conflict')) {
      errors.push(`Unresolved merge conflict on child '${memberId}': ${task.lastReconciliationWarning}`);
    }

    // Check for validation aggregate failure.
    if (task.lastVerifierResult === 'failed') {
      errors.push(`Validation failed on child '${memberId}'.`);
    }
  }

  // All members must be 'done' for the fan-in to pass.
  const allDone = Object.values(memberOutcomes).every(o => o === 'done');
  if (!allDone) {
    const incomplete = Object.entries(memberOutcomes)
      .filter(([, o]) => o !== 'done')
      .map(([id, o]) => `'${id}' (${o})`)
      .join(', ');
    errors.push(`Not all member tasks are done: ${incomplete}.`);
  }

  const passed = errors.length === 0;
  const record: FanInRecord = {
    waveIndex: wave.waveIndex,
    memberOutcomes,
    fanInResult: passed ? 'passed' : 'failed',
    fanInErrors: errors,
    evaluatedAt: new Date().toISOString()
  };

  await writePlanGraph(planGraphFilePath, { ...graph, fanInRecord: record });
  return { passed, errors };
}
