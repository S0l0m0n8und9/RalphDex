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
import { replanDecisionPath, writeReplanDecisionArtifact } from '../src/ralph/artifactStore';
import { writePlanGraph, readPlanGraph } from '../src/ralph/planGraph';
import type { ExecutionWave, PlanGraph, RalphTask, ReplanDecisionArtifact } from '../src/ralph/types';

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

// ---------------------------------------------------------------------------
// replanDecisionPath — path helper
// ---------------------------------------------------------------------------

test('replanDecisionPath returns correct path for parentTaskId and replanIndex', () => {
  const artifactRootDir = '/workspace/.ralph/artifacts';
  const parentTaskId = 'T100';
  const replanIndex = 1;

  const result = replanDecisionPath(artifactRootDir, parentTaskId, replanIndex);

  assert.equal(result, path.join(artifactRootDir, parentTaskId, 'replan-1.json'));
});

test('replanDecisionPath is consistent with planGraphPath directory layout', () => {
  const artifactRootDir = '/workspace/.ralph/artifacts';
  const parentTaskId = 'T-abc-123';

  const replanPath = replanDecisionPath(artifactRootDir, parentTaskId, 3);
  const expectedDir = path.join(artifactRootDir, parentTaskId);

  assert.equal(path.dirname(replanPath), expectedDir);
  assert.equal(path.basename(replanPath), 'replan-3.json');
});

// ---------------------------------------------------------------------------
// writeReplanDecisionArtifact — writes correct file content
// ---------------------------------------------------------------------------

test('writeReplanDecisionArtifact writes artifact at correct path with all required fields', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-replan-artifact-'));
  const artifact: ReplanDecisionArtifact = {
    schemaVersion: 1,
    kind: 'replanDecision',
    parentTaskId: 'T500',
    replanIndex: 1,
    triggerEvidenceClass: ['systemic_failure_alert'],
    triggerDetails: 'systemic-failure-alert.json artifact is present.',
    rejectedAlternatives: [],
    chosenMutation: '2 wave(s) written with 4 total child task(s).',
    taskGraphDiff: {
      addedTaskIds: ['c3', 'c4'],
      removedTaskIds: ['c1', 'c2'],
      modifiedTaskIds: []
    },
    createdAt: '2026-04-16T10:00:00.000Z'
  };

  const writtenPath = await writeReplanDecisionArtifact(tmpDir, artifact);

  assert.equal(writtenPath, replanDecisionPath(tmpDir, 'T500', 1));

  const raw = await fs.readFile(writtenPath, 'utf8');
  const parsed = JSON.parse(raw) as ReplanDecisionArtifact;

  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.kind, 'replanDecision');
  assert.equal(parsed.parentTaskId, 'T500');
  assert.equal(parsed.replanIndex, 1);
  assert.deepEqual(parsed.triggerEvidenceClass, ['systemic_failure_alert']);
  assert.equal(parsed.triggerDetails, 'systemic-failure-alert.json artifact is present.');
  assert.deepEqual(parsed.taskGraphDiff.addedTaskIds, ['c3', 'c4']);
  assert.deepEqual(parsed.taskGraphDiff.removedTaskIds, ['c1', 'c2']);
  assert.deepEqual(parsed.taskGraphDiff.modifiedTaskIds, []);
  assert.equal(parsed.createdAt, '2026-04-16T10:00:00.000Z');
});

// ---------------------------------------------------------------------------
// executeReplanNode — writes decision artifact on replan_applied
// ---------------------------------------------------------------------------

test('executeReplanNode writes decision artifact at correct path when artifactRootDir is provided', async () => {
  const tmpDir = await makeTempDir();
  const parentId = 'T400';
  const graphFilePath = path.join(tmpDir, parentId, 'plan-graph.json');

  const originalWave = makeWave(0, ['c1', 'c2', 'c3']);
  const graph = makeGraph(parentId, [originalWave]);
  await writePlanGraph(graphFilePath, graph);

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
    proposedWaves,
    artifactRootDir: tmpDir,
    parentTaskId: parentId
  });

  assert.equal(result.outcome, 'replan_applied');
  assert.ok(result.decisionArtifactPath !== null);
  assert.equal(result.decisionArtifactPath, replanDecisionPath(tmpDir, parentId, 1));

  // Verify artifact content.
  const raw = await fs.readFile(result.decisionArtifactPath, 'utf8');
  const artifact = JSON.parse(raw) as ReplanDecisionArtifact;

  assert.equal(artifact.schemaVersion, 1);
  assert.equal(artifact.kind, 'replanDecision');
  assert.equal(artifact.parentTaskId, parentId);
  assert.equal(artifact.replanIndex, 1);
  assert.ok(artifact.triggerEvidenceClass.includes('systemic_failure_alert'));
  assert.ok(artifact.triggerDetails.length > 0);
  assert.deepEqual(artifact.taskGraphDiff.addedTaskIds, ['c4', 'c5']);
  assert.deepEqual(artifact.taskGraphDiff.removedTaskIds, ['c1', 'c2', 'c3']);
  assert.ok(artifact.createdAt.length > 0);
});

test('executeReplanNode does not write artifact when artifactRootDir is absent', async () => {
  const tmpDir = await makeTempDir();
  const parentId = 'T450';
  const graphFilePath = path.join(tmpDir, parentId, 'plan-graph.json');

  const graph = makeGraph(parentId, [makeWave(0, ['c1'])]);
  await writePlanGraph(graphFilePath, graph);

  const artifactsDir = path.join(tmpDir, 'artifacts');
  await fs.mkdir(artifactsDir, { recursive: true });
  await fs.writeFile(path.join(artifactsDir, 'systemic-failure-alert.json'), '{}', 'utf8');

  const result = await executeReplanNode({
    planGraphFilePath: graphFilePath,
    allTasks: [makeTask({ id: 'c1', status: 'done', lastVerifierResult: 'passed' })],
    artifactsDir,
    maxReplansPerParent: 2,
    maxGeneratedChildren: 8,
    proposedWaves: [makeWave(1, ['c2'])]
    // No artifactRootDir or parentTaskId.
  });

  assert.equal(result.outcome, 'replan_applied');
  assert.equal(result.decisionArtifactPath, null);
});
