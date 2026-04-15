import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import {
  advanceState,
  initializeState,
  OrchestrationTransitionError,
  readOrchestrationGraph,
  readOrchestrationState,
  resolveOrchestrationPaths,
  writeOrchestrationGraph,
  writeOrchestrationState
} from '../src/ralph/orchestrationSupervisor';
import type {
  OrchestrationEvidenceRef,
  OrchestrationGraph,
  OrchestrationState
} from '../src/ralph/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSimpleGraph(overrides: Partial<OrchestrationGraph> = {}): OrchestrationGraph {
  return {
    schemaVersion: 1,
    runId: 'run-001',
    entryNodeId: 'n1',
    nodes: [
      { id: 'n1', kind: 'task_exec', label: 'Execute task' },
      { id: 'n2', kind: 'verify_gate', label: 'Verify results' },
      { id: 'n3', kind: 'scm_submit', label: 'Submit SCM' }
    ],
    edges: [
      {
        from: 'n1',
        to: 'n2',
        evidenceRequired: [{ kind: 'verifier_outcome', ref: '', summary: 'verifier must pass' }]
      },
      {
        from: 'n2',
        to: 'n3',
        evidenceRequired: [{ kind: 'verifier_outcome', ref: '', summary: 'gate must pass' }]
      }
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  };
}

function makeEvidence(kind: OrchestrationEvidenceRef['kind'] = 'verifier_outcome'): OrchestrationEvidenceRef[] {
  return [{ kind, ref: '.ralph/artifacts/iteration-001/verifier-summary.json', summary: 'Validation passed' }];
}

async function makeTempRalphRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ralph-orch-'));
}

// ---------------------------------------------------------------------------
// initializeState
// ---------------------------------------------------------------------------

test('initializeState creates pending node states with cursor at entry node', () => {
  const graph = makeSimpleGraph();
  const state = initializeState(graph);

  assert.equal(state.schemaVersion, 1);
  assert.equal(state.runId, graph.runId);
  assert.equal(state.cursor, 'n1');
  assert.equal(state.nodeStates.length, 3);
  for (const ns of state.nodeStates) {
    assert.equal(ns.outcome, 'pending');
    assert.deepEqual(ns.evidence, []);
    assert.equal(ns.startedAt, null);
    assert.equal(ns.finishedAt, null);
  }
});

// ---------------------------------------------------------------------------
// advanceState — valid transition with evidence
// ---------------------------------------------------------------------------

test('advanceState moves cursor and records evidence on valid transition', () => {
  const graph = makeSimpleGraph();
  const state = initializeState(graph);
  const evidence = makeEvidence();

  const next = advanceState(graph, state, 'n2', evidence);

  // Cursor moved to n2.
  assert.equal(next.cursor, 'n2');

  // n1 is completed with evidence.
  const n1 = next.nodeStates.find(ns => ns.nodeId === 'n1')!;
  assert.equal(n1.outcome, 'completed');
  assert.deepEqual(n1.evidence, evidence);
  assert.notEqual(n1.finishedAt, null);

  // n2 is running.
  const n2 = next.nodeStates.find(ns => ns.nodeId === 'n2')!;
  assert.equal(n2.outcome, 'running');
  assert.notEqual(n2.startedAt, null);

  // n3 is still pending.
  const n3 = next.nodeStates.find(ns => ns.nodeId === 'n3')!;
  assert.equal(n3.outcome, 'pending');
});

// ---------------------------------------------------------------------------
// advanceState — terminal node marks cursor null
// ---------------------------------------------------------------------------

test('advanceState to terminal node sets cursor to null', () => {
  const graph = makeSimpleGraph();
  let state = initializeState(graph);

  state = advanceState(graph, state, 'n2', makeEvidence());
  state = advanceState(graph, state, 'n3', makeEvidence());

  // n3 has no outgoing edges — cursor should be null.
  assert.equal(state.cursor, null);

  // n3 should be marked completed (terminal).
  const n3 = state.nodeStates.find(ns => ns.nodeId === 'n3')!;
  assert.equal(n3.outcome, 'completed');
  assert.notEqual(n3.finishedAt, null);
});

// ---------------------------------------------------------------------------
// advanceState — rejected transition without evidence
// ---------------------------------------------------------------------------

test('advanceState rejects transition with empty evidence array', () => {
  const graph = makeSimpleGraph();
  const state = initializeState(graph);

  assert.throws(
    () => advanceState(graph, state, 'n2', []),
    (err: unknown) => {
      assert.ok(err instanceof OrchestrationTransitionError);
      assert.match(err.message, /no evidence provided/);
      return true;
    }
  );
});

test('advanceState rejects transition with missing required evidence kind', () => {
  const graph = makeSimpleGraph();
  const state = initializeState(graph);

  // Edge from n1->n2 requires verifier_outcome, but we provide operator_action.
  const wrongEvidence: OrchestrationEvidenceRef[] = [
    { kind: 'operator_action', ref: 'op-1', summary: 'Operator approved' }
  ];

  assert.throws(
    () => advanceState(graph, state, 'n2', wrongEvidence),
    (err: unknown) => {
      assert.ok(err instanceof OrchestrationTransitionError);
      assert.match(err.message, /missing required evidence kinds/);
      return true;
    }
  );
});

// ---------------------------------------------------------------------------
// advanceState — no edge
// ---------------------------------------------------------------------------

test('advanceState rejects transition when no edge exists', () => {
  const graph = makeSimpleGraph();
  const state = initializeState(graph);

  assert.throws(
    () => advanceState(graph, state, 'n3', makeEvidence()),
    (err: unknown) => {
      assert.ok(err instanceof OrchestrationTransitionError);
      assert.match(err.message, /No edge/);
      return true;
    }
  );
});

// ---------------------------------------------------------------------------
// advanceState — null cursor (already complete)
// ---------------------------------------------------------------------------

test('advanceState rejects when cursor is null', () => {
  const graph = makeSimpleGraph();
  let state = initializeState(graph);

  state = advanceState(graph, state, 'n2', makeEvidence());
  state = advanceState(graph, state, 'n3', makeEvidence());

  // Graph is complete — cursor is null.
  assert.throws(
    () => advanceState(graph, state, 'n1', makeEvidence()),
    (err: unknown) => {
      assert.ok(err instanceof OrchestrationTransitionError);
      assert.match(err.message, /no active cursor/);
      return true;
    }
  );
});

// ---------------------------------------------------------------------------
// Persistence round-trip: run interrupted and resumed from state.json
// ---------------------------------------------------------------------------

test('run interrupted and resumed from persisted state.json', async () => {
  const ralphRoot = await makeTempRalphRoot();
  const graph = makeSimpleGraph();
  const paths = resolveOrchestrationPaths(ralphRoot, graph.runId);

  // --- Phase 1: start, advance one step, persist, then "crash" ---
  const initialState = initializeState(graph);
  const afterFirstStep = advanceState(graph, initialState, 'n2', makeEvidence());

  await writeOrchestrationGraph(paths, graph);
  await writeOrchestrationState(paths, afterFirstStep);

  // --- Phase 2: resume from disk (simulate fresh process) ---
  const loadedGraph = await readOrchestrationGraph(paths);
  const loadedState = await readOrchestrationState(paths);

  // Loaded state matches what we persisted.
  assert.equal(loadedState.cursor, 'n2');
  assert.equal(loadedState.nodeStates.find(ns => ns.nodeId === 'n1')!.outcome, 'completed');
  assert.equal(loadedState.nodeStates.find(ns => ns.nodeId === 'n2')!.outcome, 'running');
  assert.equal(loadedState.nodeStates.find(ns => ns.nodeId === 'n3')!.outcome, 'pending');

  // Continue from the loaded state — advance to n3.
  const afterSecondStep = advanceState(loadedGraph, loadedState, 'n3', makeEvidence());
  assert.equal(afterSecondStep.cursor, null);
  assert.equal(afterSecondStep.nodeStates.find(ns => ns.nodeId === 'n3')!.outcome, 'completed');

  // Persist the final state and verify on disk.
  await writeOrchestrationState(paths, afterSecondStep);
  const finalState = await readOrchestrationState(paths);
  assert.equal(finalState.cursor, null);
  assert.equal(finalState.nodeStates.filter(ns => ns.outcome === 'completed').length, 3);
});

// ---------------------------------------------------------------------------
// resolveOrchestrationPaths
// ---------------------------------------------------------------------------

test('resolveOrchestrationPaths produces expected directory layout', () => {
  const paths = resolveOrchestrationPaths('/project/.ralph', 'run-abc');
  assert.ok(paths.directory.includes(path.join('orchestration', 'run-abc')));
  assert.ok(paths.graphPath.endsWith('graph.json'));
  assert.ok(paths.statePath.endsWith('state.json'));
});

// ---------------------------------------------------------------------------
// Re-export from artifactStore
// ---------------------------------------------------------------------------

test('artifactStore re-exports resolveOrchestrationPaths', async () => {
  const { resolveOrchestrationPaths: reExported } = await import('../src/ralph/artifactStore');
  assert.equal(typeof reExported, 'function');
  const paths = reExported('/project/.ralph', 'run-xyz');
  assert.ok(paths.graphPath.endsWith('graph.json'));
});
