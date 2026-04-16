import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import {
  checkContestedFanInScmGate,
  clearHumanGateArtifact,
  executeReplanNode,
  humanGateArtifactPath,
  writeHumanGateArtifact
} from '../src/ralph/orchestrationSupervisor';
import { writePlanGraph } from '../src/ralph/planGraph';
import type {
  ExecutionWave,
  FanInRecord,
  HumanGateArtifact,
  PlanGraph,
  RalphTask
} from '../src/ralph/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ralph-human-gates-'));
}

function makeTask(overrides: Partial<RalphTask> & { id: string }): RalphTask {
  return { title: `Task ${overrides.id}`, status: 'todo', ...overrides };
}

function makeWave(index: number, memberIds: string[]): ExecutionWave {
  return { waveIndex: index, memberTaskIds: memberIds, launchGuards: [], fanInCriteria: [], status: 'pending' };
}

function makeGraph(parentTaskId: string, waves: ExecutionWave[], overrides: Partial<PlanGraph> = {}): PlanGraph {
  return { parentTaskId, waves, createdAt: '2026-01-01T00:00:00.000Z', ...overrides };
}

function makeConflictFanInRecord(): FanInRecord {
  return {
    waveIndex: 0,
    memberOutcomes: { c1: 'done', c2: 'done' },
    fanInResult: 'failed',
    fanInErrors: ['Unresolved merge conflict on child c1: conflicting changes'],
    evaluatedAt: '2026-01-01T00:00:00.000Z'
  };
}

// ---------------------------------------------------------------------------
// humanGateArtifactPath — path helper
// ---------------------------------------------------------------------------

test('humanGateArtifactPath returns correct path for scope_expansion gate', () => {
  const result = humanGateArtifactPath('/root/.ralph/artifacts', 'T100', 'scope_expansion');
  assert.equal(result, path.join('/root/.ralph/artifacts', 'T100', 'human-gate-scope_expansion.json'));
});

test('humanGateArtifactPath returns correct path for dependency_rewiring gate', () => {
  const result = humanGateArtifactPath('/root/.ralph/artifacts', 'T200', 'dependency_rewiring');
  assert.equal(result, path.join('/root/.ralph/artifacts', 'T200', 'human-gate-dependency_rewiring.json'));
});

test('humanGateArtifactPath returns correct path for contested_fan_in_scm gate', () => {
  const result = humanGateArtifactPath('/root/.ralph/artifacts', 'T300', 'contested_fan_in_scm');
  assert.equal(result, path.join('/root/.ralph/artifacts', 'T300', 'human-gate-contested_fan_in_scm.json'));
});

// ---------------------------------------------------------------------------
// writeHumanGateArtifact — persistence
// ---------------------------------------------------------------------------

test('writeHumanGateArtifact writes artifact with all required fields', async () => {
  const tmpDir = await makeTempDir();
  const artifact: HumanGateArtifact = {
    gateType: 'scope_expansion',
    triggerReason: 'Replan adds 4 tasks, exceeding threshold of 3 (maxGeneratedChildren/2).',
    affectedTaskIds: ['c2', 'c3', 'c4', 'c5'],
    requiredApprovalCommand: 'ralphCodex.approveHumanReview',
    createdAt: '2026-04-16T10:00:00.000Z'
  };

  const writtenPath = await writeHumanGateArtifact(tmpDir, 'T100', artifact);

  assert.equal(writtenPath, humanGateArtifactPath(tmpDir, 'T100', 'scope_expansion'));

  const raw = await fs.readFile(writtenPath, 'utf8');
  const parsed = JSON.parse(raw) as HumanGateArtifact;
  assert.equal(parsed.gateType, 'scope_expansion');
  assert.equal(parsed.triggerReason, artifact.triggerReason);
  assert.deepEqual(parsed.affectedTaskIds, artifact.affectedTaskIds);
  assert.equal(parsed.requiredApprovalCommand, 'ralphCodex.approveHumanReview');
  assert.equal(parsed.createdAt, artifact.createdAt);
});

test('writeHumanGateArtifact creates parent directory if absent', async () => {
  const tmpDir = await makeTempDir();
  const artifact: HumanGateArtifact = {
    gateType: 'dependency_rewiring',
    triggerReason: 'Task c1 (parent P1) depends on c3 (parent P2).',
    affectedTaskIds: ['c1'],
    requiredApprovalCommand: 'ralphCodex.approveHumanReview',
    createdAt: '2026-04-16T10:00:00.000Z'
  };

  await assert.doesNotReject(() => writeHumanGateArtifact(tmpDir, 'T999', artifact));
  const stat = await fs.stat(humanGateArtifactPath(tmpDir, 'T999', 'dependency_rewiring'));
  assert.ok(stat.isFile());
});

// ---------------------------------------------------------------------------
// clearHumanGateArtifact — deletion
// ---------------------------------------------------------------------------

test('clearHumanGateArtifact deletes a written gate artifact', async () => {
  const tmpDir = await makeTempDir();
  const artifact: HumanGateArtifact = {
    gateType: 'scope_expansion',
    triggerReason: 'test',
    affectedTaskIds: [],
    requiredApprovalCommand: 'ralphCodex.approveHumanReview',
    createdAt: '2026-04-16T00:00:00.000Z'
  };

  await writeHumanGateArtifact(tmpDir, 'T500', artifact);
  const artifactPath = humanGateArtifactPath(tmpDir, 'T500', 'scope_expansion');

  // Verify file exists before clearing.
  await assert.doesNotReject(() => fs.access(artifactPath));

  await clearHumanGateArtifact(tmpDir, 'T500', 'scope_expansion');

  // File should no longer exist.
  await assert.rejects(() => fs.access(artifactPath));
});

test('clearHumanGateArtifact is a no-op when artifact does not exist', async () => {
  const tmpDir = await makeTempDir();
  await assert.doesNotReject(() => clearHumanGateArtifact(tmpDir, 'T501', 'scope_expansion'));
});

// ---------------------------------------------------------------------------
// Scope expansion gate via executeReplanNode
// ---------------------------------------------------------------------------

test('scope expansion gate triggers needsHumanReview when pipelineHumanGates=true and new tasks exceed maxGeneratedChildren/2', async () => {
  const tmpDir = await makeTempDir();
  const parentId = 'T600';
  const graphFilePath = path.join(tmpDir, parentId, 'plan-graph.json');

  // Original graph has one wave with c1.
  const graph = makeGraph(parentId, [makeWave(0, ['c1'])]);
  await writePlanGraph(graphFilePath, graph);

  const artifactsDir = path.join(tmpDir, 'artifacts');
  await fs.mkdir(artifactsDir, { recursive: true });
  await fs.writeFile(path.join(artifactsDir, 'systemic-failure-alert.json'), '{}', 'utf8');

  // Proposed waves add 4 new tasks. maxGeneratedChildren=6, threshold=3. 4>3 → gate fires.
  const proposedWaves = [makeWave(1, ['c2', 'c3', 'c4', 'c5'])];
  const allTasks: RalphTask[] = [makeTask({ id: 'c1', status: 'done', lastVerifierResult: 'passed' })];

  const result = await executeReplanNode({
    planGraphFilePath: graphFilePath,
    allTasks,
    artifactsDir,
    maxReplansPerParent: 3,
    maxGeneratedChildren: 6,
    proposedWaves,
    pipelineHumanGates: true,
    artifactRootDir: tmpDir,
    parentTaskId: parentId
  });

  assert.equal(result.outcome, 'human_gate_triggered');
  assert.equal(result.needsHumanReview, true);
  assert.ok(result.humanGateType === 'scope_expansion');
  // Mutation must NOT have been applied.
  const persisted = await import('../src/ralph/planGraph').then(m => m.readPlanGraph(graphFilePath));
  assert.ok(persisted !== null);
  assert.deepEqual(persisted!.waves[0].memberTaskIds, ['c1'], 'mutation must not be applied when gate fires');
});

test('scope expansion gate bypasses and applies mutation when pipelineHumanGates=false', async () => {
  const tmpDir = await makeTempDir();
  const parentId = 'T601';
  const graphFilePath = path.join(tmpDir, parentId, 'plan-graph.json');

  const graph = makeGraph(parentId, [makeWave(0, ['c1'])]);
  await writePlanGraph(graphFilePath, graph);

  const artifactsDir = path.join(tmpDir, 'artifacts');
  await fs.mkdir(artifactsDir, { recursive: true });
  await fs.writeFile(path.join(artifactsDir, 'systemic-failure-alert.json'), '{}', 'utf8');

  const proposedWaves = [makeWave(1, ['c2', 'c3', 'c4', 'c5'])];
  const allTasks: RalphTask[] = [makeTask({ id: 'c1', status: 'done', lastVerifierResult: 'passed' })];

  const result = await executeReplanNode({
    planGraphFilePath: graphFilePath,
    allTasks,
    artifactsDir,
    maxReplansPerParent: 3,
    maxGeneratedChildren: 6,
    proposedWaves,
    pipelineHumanGates: false, // bypassed
    artifactRootDir: tmpDir,
    parentTaskId: parentId
  });

  // Gate is bypassed; mutation applies normally.
  assert.equal(result.outcome, 'replan_applied');
  assert.equal(result.needsHumanReview, false);
  const persisted = await import('../src/ralph/planGraph').then(m => m.readPlanGraph(graphFilePath));
  assert.ok(persisted !== null);
  assert.deepEqual(persisted!.waves[0].memberTaskIds, ['c2', 'c3', 'c4', 'c5']);
});

test('scope expansion gate does not trigger when new tasks are within threshold', async () => {
  const tmpDir = await makeTempDir();
  const parentId = 'T602';
  const graphFilePath = path.join(tmpDir, parentId, 'plan-graph.json');

  const graph = makeGraph(parentId, [makeWave(0, ['c1'])]);
  await writePlanGraph(graphFilePath, graph);

  const artifactsDir = path.join(tmpDir, 'artifacts');
  await fs.mkdir(artifactsDir, { recursive: true });
  await fs.writeFile(path.join(artifactsDir, 'systemic-failure-alert.json'), '{}', 'utf8');

  // Proposed waves add 2 new tasks. maxGeneratedChildren=6, threshold=3. 2<=3 → no gate.
  const proposedWaves = [makeWave(1, ['c2', 'c3'])];
  const allTasks: RalphTask[] = [makeTask({ id: 'c1', status: 'done', lastVerifierResult: 'passed' })];

  const result = await executeReplanNode({
    planGraphFilePath: graphFilePath,
    allTasks,
    artifactsDir,
    maxReplansPerParent: 3,
    maxGeneratedChildren: 6,
    proposedWaves,
    pipelineHumanGates: true
  });

  assert.equal(result.outcome, 'replan_applied');
  assert.equal(result.needsHumanReview, false);
});

// ---------------------------------------------------------------------------
// Dependency rewiring gate via executeReplanNode
// ---------------------------------------------------------------------------

test('dependency rewiring gate triggers when proposed tasks depend on tasks from a different parent', async () => {
  const tmpDir = await makeTempDir();
  const parentId = 'P1';
  const graphFilePath = path.join(tmpDir, parentId, 'plan-graph.json');

  const graph = makeGraph(parentId, [makeWave(0, ['c1'])]);
  await writePlanGraph(graphFilePath, graph);

  const artifactsDir = path.join(tmpDir, 'artifacts');
  await fs.mkdir(artifactsDir, { recursive: true });
  await fs.writeFile(path.join(artifactsDir, 'systemic-failure-alert.json'), '{}', 'utf8');

  // c2 is a child of P1, but depends on c3 which is a child of P2 (cross-parent).
  const allTasks: RalphTask[] = [
    makeTask({ id: 'c1', status: 'done', lastVerifierResult: 'passed', parentId: 'P1' }),
    makeTask({ id: 'c2', status: 'todo', parentId: 'P1', dependsOn: ['c3'] }),
    makeTask({ id: 'c3', status: 'done', parentId: 'P2' })  // different parent!
  ];

  const proposedWaves = [makeWave(1, ['c2'])];

  const result = await executeReplanNode({
    planGraphFilePath: graphFilePath,
    allTasks,
    artifactsDir,
    maxReplansPerParent: 3,
    maxGeneratedChildren: 10,
    proposedWaves,
    pipelineHumanGates: true,
    artifactRootDir: tmpDir,
    parentTaskId: parentId
  });

  assert.equal(result.outcome, 'human_gate_triggered');
  assert.equal(result.needsHumanReview, true);
  assert.ok(result.humanGateType === 'dependency_rewiring');
  // Mutation must NOT have been applied.
  const persisted = await import('../src/ralph/planGraph').then(m => m.readPlanGraph(graphFilePath));
  assert.ok(persisted !== null);
  assert.deepEqual(persisted!.waves[0].memberTaskIds, ['c1'], 'mutation must not be applied when dependency gate fires');
});

test('dependency rewiring gate does not trigger when dependencies stay within same parent', async () => {
  const tmpDir = await makeTempDir();
  const parentId = 'P1';
  const graphFilePath = path.join(tmpDir, parentId, 'plan-graph.json');

  const graph = makeGraph(parentId, [makeWave(0, ['c1'])]);
  await writePlanGraph(graphFilePath, graph);

  const artifactsDir = path.join(tmpDir, 'artifacts');
  await fs.mkdir(artifactsDir, { recursive: true });
  await fs.writeFile(path.join(artifactsDir, 'systemic-failure-alert.json'), '{}', 'utf8');

  // c2 depends on c1, both under P1 — intra-parent dependency, safe.
  const allTasks: RalphTask[] = [
    makeTask({ id: 'c1', status: 'done', lastVerifierResult: 'passed', parentId: 'P1' }),
    makeTask({ id: 'c2', status: 'todo', parentId: 'P1', dependsOn: ['c1'] })
  ];

  const proposedWaves = [makeWave(1, ['c2'])];

  const result = await executeReplanNode({
    planGraphFilePath: graphFilePath,
    allTasks,
    artifactsDir,
    maxReplansPerParent: 3,
    maxGeneratedChildren: 10,
    proposedWaves,
    pipelineHumanGates: true
  });

  // No cross-parent dependency, so gate does not fire.
  assert.equal(result.outcome, 'replan_applied');
  assert.equal(result.needsHumanReview, false);
});

// ---------------------------------------------------------------------------
// SCM gate after contested fan-in — checkContestedFanInScmGate
// ---------------------------------------------------------------------------

test('contested fan-in followed by scm_submit triggers gate when pipelineHumanGates=true', async () => {
  const tmpDir = await makeTempDir();
  const parentId = 'T700';
  const planGraph = makeGraph(parentId, [makeWave(0, ['c1', 'c2'])], {
    fanInRecord: makeConflictFanInRecord()
  });

  const result = await checkContestedFanInScmGate({
    planGraph,
    targetNodeKind: 'scm_submit',
    pipelineHumanGates: true,
    artifactRootDir: tmpDir,
    parentTaskId: parentId
  });

  assert.equal(result.gateTriggered, true);
  assert.ok(result.artifactPath !== null);

  // Verify artifact was written.
  const raw = await fs.readFile(result.artifactPath!, 'utf8');
  const artifact = JSON.parse(raw) as HumanGateArtifact;
  assert.equal(artifact.gateType, 'contested_fan_in_scm');
  assert.equal(artifact.requiredApprovalCommand, 'ralphCodex.approveHumanReview');
  assert.ok(artifact.triggerReason.length > 0);
});

test('contested fan-in scm gate bypasses when pipelineHumanGates=false', async () => {
  const tmpDir = await makeTempDir();
  const parentId = 'T701';
  const planGraph = makeGraph(parentId, [makeWave(0, ['c1'])], {
    fanInRecord: makeConflictFanInRecord()
  });

  const result = await checkContestedFanInScmGate({
    planGraph,
    targetNodeKind: 'scm_submit',
    pipelineHumanGates: false, // bypassed
    artifactRootDir: tmpDir,
    parentTaskId: parentId
  });

  assert.equal(result.gateTriggered, false);
  assert.equal(result.artifactPath, null);
});

test('contested fan-in scm gate does not trigger when target node is not scm_submit', async () => {
  const tmpDir = await makeTempDir();
  const parentId = 'T702';
  const planGraph = makeGraph(parentId, [makeWave(0, ['c1'])], {
    fanInRecord: makeConflictFanInRecord()
  });

  const result = await checkContestedFanInScmGate({
    planGraph,
    targetNodeKind: 'verify_gate', // not scm_submit
    pipelineHumanGates: true,
    artifactRootDir: tmpDir,
    parentTaskId: parentId
  });

  assert.equal(result.gateTriggered, false);
  assert.equal(result.artifactPath, null);
});

test('contested fan-in scm gate does not trigger when fan-in has no conflicts', async () => {
  const tmpDir = await makeTempDir();
  const parentId = 'T703';
  const cleanFanIn: FanInRecord = {
    waveIndex: 0,
    memberOutcomes: { c1: 'done', c2: 'done' },
    fanInResult: 'passed',
    fanInErrors: [], // no errors
    evaluatedAt: '2026-01-01T00:00:00.000Z'
  };
  const planGraph = makeGraph(parentId, [makeWave(0, ['c1', 'c2'])], { fanInRecord: cleanFanIn });

  const result = await checkContestedFanInScmGate({
    planGraph,
    targetNodeKind: 'scm_submit',
    pipelineHumanGates: true,
    artifactRootDir: tmpDir,
    parentTaskId: parentId
  });

  assert.equal(result.gateTriggered, false);
  assert.equal(result.artifactPath, null);
});

test('contested fan-in scm gate does not trigger when no fanInRecord exists', async () => {
  const tmpDir = await makeTempDir();
  const parentId = 'T704';
  const planGraph = makeGraph(parentId, [makeWave(0, ['c1'])]); // no fanInRecord

  const result = await checkContestedFanInScmGate({
    planGraph,
    targetNodeKind: 'scm_submit',
    pipelineHumanGates: true,
    artifactRootDir: tmpDir,
    parentTaskId: parentId
  });

  assert.equal(result.gateTriggered, false);
  assert.equal(result.artifactPath, null);
});
