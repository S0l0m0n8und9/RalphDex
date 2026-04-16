import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import {
  classifyReplanTriggers,
  executeReplanNode,
  truncateWavesToChildLimit
} from '../src/ralph/orchestrationSupervisor';
import { writePlanGraph, readPlanGraph } from '../src/ralph/planGraph';
import type { ExecutionWave, PlanGraph, RalphTask } from '../src/ralph/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ralph-replan-'));
}

function makeTask(overrides: Partial<RalphTask> & { id: string }): RalphTask {
  return {
    title: `Task ${overrides.id}`,
    status: 'todo',
    ...overrides
  };
}

function makeWave(index: number, memberIds: string[]): ExecutionWave {
  return {
    waveIndex: index,
    memberTaskIds: memberIds,
    launchGuards: [],
    fanInCriteria: [],
    status: 'pending'
  };
}

function makeGraph(parentTaskId: string, waves: ExecutionWave[], overrides: Partial<PlanGraph> = {}): PlanGraph {
  return {
    parentTaskId,
    waves,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// classifyReplanTriggers — evidence classes
// ---------------------------------------------------------------------------

test('classifyReplanTriggers: three verifier mismatches trigger replan', () => {
  const tasks: RalphTask[] = [
    makeTask({ id: 'c1', status: 'done', lastVerifierResult: 'failed' }),
    makeTask({ id: 'c2', status: 'done', lastVerifierResult: 'failed' }),
    makeTask({ id: 'c3', status: 'done', lastVerifierResult: 'failed' })
  ];

  const triggers = classifyReplanTriggers(tasks, [], false);
  assert.equal(triggers.length, 1);
  assert.equal(triggers[0].kind, 'consecutive_verifier_mismatches');
  assert.match(triggers[0].summary, /3 children/);
});

test('classifyReplanTriggers: systemic failure alert triggers replan', () => {
  const tasks: RalphTask[] = [
    makeTask({ id: 'c1', status: 'done', lastVerifierResult: 'passed' })
  ];

  const triggers = classifyReplanTriggers(tasks, [], true);
  assert.equal(triggers.length, 1);
  assert.equal(triggers[0].kind, 'systemic_failure_alert');
});

test('classifyReplanTriggers: unresolved merge conflict triggers replan', () => {
  const tasks: RalphTask[] = [
    makeTask({ id: 'c1', status: 'done', lastVerifierResult: 'passed' })
  ];
  const fanInErrors = ["Unresolved merge conflict on child 'c1': conflicting changes"];

  const triggers = classifyReplanTriggers(tasks, fanInErrors, false);
  assert.equal(triggers.length, 1);
  assert.equal(triggers[0].kind, 'unresolved_merge_conflict');
});

test('classifyReplanTriggers: no triggers when evidence is clean', () => {
  const tasks: RalphTask[] = [
    makeTask({ id: 'c1', status: 'done', lastVerifierResult: 'passed' }),
    makeTask({ id: 'c2', status: 'done', lastVerifierResult: 'passed' })
  ];

  const triggers = classifyReplanTriggers(tasks, [], false);
  assert.equal(triggers.length, 0);
});

test('classifyReplanTriggers: two verifier failures do not trigger (threshold is 3)', () => {
  const tasks: RalphTask[] = [
    makeTask({ id: 'c1', status: 'done', lastVerifierResult: 'failed' }),
    makeTask({ id: 'c2', status: 'done', lastVerifierResult: 'failed' }),
    makeTask({ id: 'c3', status: 'done', lastVerifierResult: 'passed' })
  ];

  const triggers = classifyReplanTriggers(tasks, [], false);
  assert.equal(triggers.length, 0);
});

test('classifyReplanTriggers: multiple trigger classes fire simultaneously', () => {
  const tasks: RalphTask[] = [
    makeTask({ id: 'c1', status: 'done', lastVerifierResult: 'failed' }),
    makeTask({ id: 'c2', status: 'done', lastVerifierResult: 'failed' }),
    makeTask({ id: 'c3', status: 'done', lastVerifierResult: 'failed' })
  ];
  const fanInErrors = ['Merge conflict on c1'];

  const triggers = classifyReplanTriggers(tasks, fanInErrors, true);
  assert.equal(triggers.length, 3);
  const kinds = triggers.map(t => t.kind);
  assert.ok(kinds.includes('consecutive_verifier_mismatches'));
  assert.ok(kinds.includes('systemic_failure_alert'));
  assert.ok(kinds.includes('unresolved_merge_conflict'));
});

// ---------------------------------------------------------------------------
// executeReplanNode — replan advances graph state
// ---------------------------------------------------------------------------

test('executeReplanNode applies new waves when trigger fires', async () => {
  const tmpDir = await makeTempDir();
  const parentId = 'T100';
  const graphFilePath = path.join(tmpDir, parentId, 'plan-graph.json');

  const originalWave = makeWave(0, ['c1', 'c2', 'c3']);
  const graph = makeGraph(parentId, [originalWave]);
  await writePlanGraph(graphFilePath, graph);

  // Create systemic failure alert to trigger replan.
  const artifactsDir = path.join(tmpDir, 'artifacts');
  await fs.mkdir(artifactsDir, { recursive: true });
  await fs.writeFile(path.join(artifactsDir, 'systemic-failure-alert.json'), '{}', 'utf8');

  const proposedWaves = [makeWave(1, ['c4', 'c5'])];

  const allTasks: RalphTask[] = [
    makeTask({ id: 'c1', status: 'done', lastVerifierResult: 'passed' }),
    makeTask({ id: 'c2', status: 'done', lastVerifierResult: 'passed' }),
    makeTask({ id: 'c3', status: 'done', lastVerifierResult: 'passed' })
  ];

  const result = await executeReplanNode({
    planGraphFilePath: graphFilePath,
    allTasks,
    artifactsDir,
    maxReplansPerParent: 2,
    maxGeneratedChildren: 8,
    proposedWaves
  });

  assert.equal(result.outcome, 'replan_applied');
  assert.equal(result.replanCount, 1);
  assert.equal(result.needsHumanReview, false);
  assert.ok(result.triggers.length > 0);
  assert.ok(result.updatedGraph !== null);
  assert.equal(result.updatedGraph!.waves.length, 1);
  assert.deepEqual(result.updatedGraph!.waves[0].memberTaskIds, ['c4', 'c5']);

  // Verify persisted graph.
  const persisted = await readPlanGraph(graphFilePath);
  assert.ok(persisted !== null);
  assert.equal(persisted!.replanCount, 1);
  assert.deepEqual(persisted!.waves[0].memberTaskIds, ['c4', 'c5']);
});

// ---------------------------------------------------------------------------
// executeReplanNode — cap exhaustion produces escalation
// ---------------------------------------------------------------------------

test('executeReplanNode returns replan_cap_exhausted when cap is reached', async () => {
  const tmpDir = await makeTempDir();
  const parentId = 'T200';
  const graphFilePath = path.join(tmpDir, parentId, 'plan-graph.json');

  const graph = makeGraph(parentId, [makeWave(0, ['c1', 'c2', 'c3'])], {
    replanCount: 2
  });
  await writePlanGraph(graphFilePath, graph);

  // Create systemic alert to trigger replan.
  const artifactsDir = path.join(tmpDir, 'artifacts');
  await fs.mkdir(artifactsDir, { recursive: true });
  await fs.writeFile(path.join(artifactsDir, 'systemic-failure-alert.json'), '{}', 'utf8');

  const allTasks: RalphTask[] = [
    makeTask({ id: 'c1', status: 'done', lastVerifierResult: 'passed' }),
    makeTask({ id: 'c2', status: 'done', lastVerifierResult: 'passed' }),
    makeTask({ id: 'c3', status: 'done', lastVerifierResult: 'passed' })
  ];

  const result = await executeReplanNode({
    planGraphFilePath: graphFilePath,
    allTasks,
    artifactsDir,
    maxReplansPerParent: 2,
    maxGeneratedChildren: 8,
    proposedWaves: [makeWave(1, ['c4'])]
  });

  assert.equal(result.outcome, 'replan_cap_exhausted');
  assert.equal(result.needsHumanReview, true);
  assert.equal(result.replanCount, 2);
  assert.ok(result.triggers.length > 0);
  assert.equal(result.updatedGraph, null);
  assert.match(result.summary, /cap exhausted/i);
});

// ---------------------------------------------------------------------------
// executeReplanNode — no trigger does not produce replan
// ---------------------------------------------------------------------------

test('executeReplanNode returns no_trigger when evidence is clean', async () => {
  const tmpDir = await makeTempDir();
  const parentId = 'T300';
  const graphFilePath = path.join(tmpDir, parentId, 'plan-graph.json');

  const graph = makeGraph(parentId, [makeWave(0, ['c1', 'c2'])]);
  await writePlanGraph(graphFilePath, graph);

  const artifactsDir = path.join(tmpDir, 'artifacts');
  // No systemic-failure-alert.json present.

  const allTasks: RalphTask[] = [
    makeTask({ id: 'c1', status: 'done', lastVerifierResult: 'passed' }),
    makeTask({ id: 'c2', status: 'done', lastVerifierResult: 'passed' })
  ];

  const result = await executeReplanNode({
    planGraphFilePath: graphFilePath,
    allTasks,
    artifactsDir,
    maxReplansPerParent: 2,
    maxGeneratedChildren: 8,
    proposedWaves: [makeWave(1, ['c3'])]
  });

  assert.equal(result.outcome, 'no_trigger');
  assert.equal(result.triggers.length, 0);
  assert.equal(result.needsHumanReview, false);
  assert.equal(result.updatedGraph, null);
});

// ---------------------------------------------------------------------------
// executeReplanNode — missing plan graph is a no-op
// ---------------------------------------------------------------------------

test('executeReplanNode returns no_trigger when plan graph does not exist', async () => {
  const tmpDir = await makeTempDir();
  const graphFilePath = path.join(tmpDir, 'nonexistent', 'plan-graph.json');
  const artifactsDir = path.join(tmpDir, 'artifacts');

  const result = await executeReplanNode({
    planGraphFilePath: graphFilePath,
    allTasks: [],
    artifactsDir,
    maxReplansPerParent: 2,
    maxGeneratedChildren: 8,
    proposedWaves: []
  });

  assert.equal(result.outcome, 'no_trigger');
  assert.equal(result.updatedGraph, null);
});

// ---------------------------------------------------------------------------
// truncateWavesToChildLimit
// ---------------------------------------------------------------------------

test('truncateWavesToChildLimit passes through waves within limit', () => {
  const waves = [makeWave(0, ['a', 'b']), makeWave(1, ['c'])];
  const result = truncateWavesToChildLimit(waves, 10);
  assert.equal(result.length, 2);
  assert.deepEqual(result[0].memberTaskIds, ['a', 'b']);
  assert.deepEqual(result[1].memberTaskIds, ['c']);
});

test('truncateWavesToChildLimit truncates when total exceeds limit', () => {
  const waves = [makeWave(0, ['a', 'b', 'c']), makeWave(1, ['d', 'e'])];
  const result = truncateWavesToChildLimit(waves, 4);
  assert.equal(result.length, 2);
  assert.deepEqual(result[0].memberTaskIds, ['a', 'b', 'c']);
  assert.deepEqual(result[1].memberTaskIds, ['d']);
});

test('truncateWavesToChildLimit drops waves beyond the limit', () => {
  const waves = [makeWave(0, ['a', 'b']), makeWave(1, ['c', 'd']), makeWave(2, ['e'])];
  const result = truncateWavesToChildLimit(waves, 3);
  assert.equal(result.length, 2);
  assert.deepEqual(result[0].memberTaskIds, ['a', 'b']);
  assert.deepEqual(result[1].memberTaskIds, ['c']);
});
