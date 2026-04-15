import * as fs from 'fs/promises';
import * as path from 'path';
import { stableJson } from './integrity';
import type {
  OrchestrationEdge,
  OrchestrationEvidenceRef,
  OrchestrationGraph,
  OrchestrationNodeState,
  OrchestrationState
} from './types';

// ---------------------------------------------------------------------------
// Orchestration artifact paths
// ---------------------------------------------------------------------------

export interface OrchestrationArtifactPaths {
  directory: string;
  graphPath: string;
  statePath: string;
}

export function resolveOrchestrationPaths(ralphRoot: string, runId: string): OrchestrationArtifactPaths {
  const directory = path.join(ralphRoot, 'orchestration', runId);
  return {
    directory,
    graphPath: path.join(directory, 'graph.json'),
    statePath: path.join(directory, 'state.json')
  };
}

// ---------------------------------------------------------------------------
// Transition validation errors
// ---------------------------------------------------------------------------

export class OrchestrationTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrchestrationTransitionError';
  }
}

// ---------------------------------------------------------------------------
// Graph helpers
// ---------------------------------------------------------------------------

function findEdge(graph: OrchestrationGraph, from: string, to: string): OrchestrationEdge | undefined {
  return graph.edges.find(e => e.from === from && e.to === to);
}

function findNodeState(state: OrchestrationState, nodeId: string): OrchestrationNodeState | undefined {
  return state.nodeStates.find(ns => ns.nodeId === nodeId);
}

// ---------------------------------------------------------------------------
// State initialisation from a graph definition
// ---------------------------------------------------------------------------

export function initializeState(graph: OrchestrationGraph): OrchestrationState {
  return {
    schemaVersion: 1,
    runId: graph.runId,
    cursor: graph.entryNodeId,
    nodeStates: graph.nodes.map(node => ({
      nodeId: node.id,
      outcome: 'pending',
      evidence: [],
      startedAt: null,
      finishedAt: null
    })),
    updatedAt: new Date().toISOString()
  };
}

// ---------------------------------------------------------------------------
// Core single-transition advance
// ---------------------------------------------------------------------------

/**
 * Advance exactly one graph transition: move from the current cursor node to
 * `targetNodeId`.
 *
 * **Invariants enforced:**
 * - The cursor must be non-null (graph not already complete).
 * - An edge must exist from the cursor to `targetNodeId`.
 * - `evidence` must be non-empty and satisfy the edge's `evidenceRequired`
 *   kinds; transitions without evidence are rejected as invalid.
 * - The cursor node is marked completed with the supplied evidence.
 * - The target node becomes the new cursor.
 *
 * Returns the updated state. The caller is responsible for persisting it
 * (see {@link writeOrchestrationState}).
 */
export function advanceState(
  graph: OrchestrationGraph,
  state: OrchestrationState,
  targetNodeId: string,
  evidence: OrchestrationEvidenceRef[]
): OrchestrationState {
  if (state.cursor === null) {
    throw new OrchestrationTransitionError(
      'Cannot advance: orchestration graph has no active cursor (graph is complete or was never started).'
    );
  }

  const edge = findEdge(graph, state.cursor, targetNodeId);
  if (!edge) {
    throw new OrchestrationTransitionError(
      `No edge from current cursor "${state.cursor}" to target "${targetNodeId}".`
    );
  }

  // Evidence gate: every transition must carry at least one evidence reference.
  if (evidence.length === 0) {
    throw new OrchestrationTransitionError(
      `Transition from "${state.cursor}" to "${targetNodeId}" rejected: no evidence provided. ` +
      'Every graph transition must cite verifier outcomes, claim status, or explicit operator action.'
    );
  }

  // Verify that every required evidence kind on the edge is satisfied.
  const providedKinds = new Set(evidence.map(e => e.kind));
  const missingKinds = edge.evidenceRequired
    .map(req => req.kind)
    .filter(kind => !providedKinds.has(kind));
  if (missingKinds.length > 0) {
    throw new OrchestrationTransitionError(
      `Transition from "${state.cursor}" to "${targetNodeId}" rejected: ` +
      `missing required evidence kinds: ${missingKinds.join(', ')}.`
    );
  }

  const now = new Date().toISOString();

  // Complete the cursor node.
  const updatedNodeStates: OrchestrationNodeState[] = state.nodeStates.map(ns => {
    if (ns.nodeId === state.cursor) {
      return {
        ...ns,
        outcome: 'completed' as const,
        evidence,
        finishedAt: now
      };
    }
    if (ns.nodeId === targetNodeId) {
      return {
        ...ns,
        outcome: 'running' as const,
        startedAt: now
      };
    }
    return ns;
  });

  // Determine if the target is a terminal node (no outgoing edges).
  const hasOutgoing = graph.edges.some(e => e.from === targetNodeId);
  const nextCursor = hasOutgoing ? targetNodeId : null;

  // If the target is terminal, mark it completed immediately since there are
  // no further transitions to fire.
  if (!hasOutgoing) {
    for (let i = 0; i < updatedNodeStates.length; i++) {
      if (updatedNodeStates[i].nodeId === targetNodeId) {
        updatedNodeStates[i] = {
          ...updatedNodeStates[i],
          outcome: 'completed',
          finishedAt: now
        };
        break;
      }
    }
  }

  return {
    ...state,
    cursor: nextCursor,
    nodeStates: updatedNodeStates,
    updatedAt: now
  };
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

export async function writeOrchestrationGraph(
  paths: OrchestrationArtifactPaths,
  graph: OrchestrationGraph
): Promise<void> {
  await fs.mkdir(paths.directory, { recursive: true });
  await fs.writeFile(paths.graphPath, stableJson(graph), 'utf8');
}

export async function writeOrchestrationState(
  paths: OrchestrationArtifactPaths,
  state: OrchestrationState
): Promise<void> {
  await fs.mkdir(paths.directory, { recursive: true });
  await fs.writeFile(paths.statePath, stableJson(state), 'utf8');
}

export async function readOrchestrationGraph(
  paths: OrchestrationArtifactPaths
): Promise<OrchestrationGraph> {
  const raw = await fs.readFile(paths.graphPath, 'utf8');
  return JSON.parse(raw) as OrchestrationGraph;
}

export async function readOrchestrationState(
  paths: OrchestrationArtifactPaths
): Promise<OrchestrationState> {
  const raw = await fs.readFile(paths.statePath, 'utf8');
  return JSON.parse(raw) as OrchestrationState;
}
