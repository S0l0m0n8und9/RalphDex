import * as fs from 'fs/promises';
import * as path from 'path';
import { stableJson } from './integrity';
import { readPlanGraph, writePlanGraph } from './planGraph';
import type {
  ExecutionWave,
  OrchestrationEdge,
  OrchestrationEvidenceRef,
  OrchestrationGraph,
  OrchestrationNodeSpan,
  OrchestrationNodeState,
  OrchestrationState,
  PlanGraph,
  RalphTask,
  ReplanDecisionArtifact,
  ReplanTriggerKind
} from './types';

// ---------------------------------------------------------------------------
// Orchestration artifact paths
// ---------------------------------------------------------------------------

export interface OrchestrationArtifactPaths {
  directory: string;
  graphPath: string;
  statePath: string;
  /** Returns the file path for a per-node execution span artifact. */
  nodeSpanPath(nodeId: string): string;
}

export function resolveOrchestrationPaths(ralphRoot: string, runId: string): OrchestrationArtifactPaths {
  const directory = path.join(ralphRoot, 'orchestration', runId);
  return {
    directory,
    graphPath: path.join(directory, 'graph.json'),
    statePath: path.join(directory, 'state.json'),
    nodeSpanPath(nodeId: string): string {
      return path.join(directory, `node-${nodeId}-span.json`);
    }
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

function validateEvidenceRefs(
  evidence: OrchestrationEvidenceRef[],
  context: string
): void {
  for (const [index, entry] of evidence.entries()) {
    if (entry.ref.trim().length === 0) {
      throw new OrchestrationTransitionError(
        `${context} contains an invalid evidence reference at index ${index}: ref must be non-empty.`
      );
    }
    if (entry.summary.trim().length === 0) {
      throw new OrchestrationTransitionError(
        `${context} contains an invalid evidence reference at index ${index}: summary must be non-empty.`
      );
    }
  }
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
  if (graph.runId !== state.runId) {
    throw new OrchestrationTransitionError(
      `Graph/state run mismatch: graph run "${graph.runId}" does not match state run "${state.runId}".`
    );
  }
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

  validateEvidenceRefs(
    edge.evidenceRequired,
    `Transition from "${state.cursor}" to "${targetNodeId}" requirement`
  );
  validateEvidenceRefs(
    evidence,
    `Transition from "${state.cursor}" to "${targetNodeId}" evidence`
  );

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
  const sourceNodeState = findNodeState(state, state.cursor);
  if (!sourceNodeState) {
    throw new OrchestrationTransitionError(
      `State is missing the current cursor node "${state.cursor}".`
    );
  }
  const targetNodeState = findNodeState(state, targetNodeId);
  if (!targetNodeState) {
    throw new OrchestrationTransitionError(
      `State is missing the target node "${targetNodeId}".`
    );
  }

  // Complete the cursor node.
  const updatedNodeStates: OrchestrationNodeState[] = state.nodeStates.map(ns => {
    if (ns.nodeId === state.cursor) {
      return {
        ...ns,
        outcome: 'completed' as const,
        evidence,
        startedAt: ns.startedAt ?? now,
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

// ---------------------------------------------------------------------------
// Per-node span helpers
// ---------------------------------------------------------------------------

/**
 * Persist a per-node execution span to
 * `.ralph/orchestration/<runId>/node-<nodeId>-span.json`.
 */
export async function writeNodeSpan(
  paths: OrchestrationArtifactPaths,
  nodeId: string,
  span: OrchestrationNodeSpan
): Promise<void> {
  await fs.mkdir(paths.directory, { recursive: true });
  await fs.writeFile(paths.nodeSpanPath(nodeId), stableJson(span), 'utf8');
}

/**
 * Read a persisted node span. Returns `undefined` when the span file does not
 * exist (node has not yet started or span was never written).
 */
export async function readNodeSpan(
  paths: OrchestrationArtifactPaths,
  nodeId: string
): Promise<OrchestrationNodeSpan | undefined> {
  try {
    const raw = await fs.readFile(paths.nodeSpanPath(nodeId), 'utf8');
    return JSON.parse(raw) as OrchestrationNodeSpan;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Replan node — bounded adaptive re-planning
// ---------------------------------------------------------------------------

export type { ReplanTriggerKind };

export interface ReplanTrigger {
  kind: ReplanTriggerKind;
  summary: string;
}

export type ReplanOutcome =
  | 'replan_applied'
  | 'replan_cap_exhausted'
  | 'no_trigger';

export interface ReplanResult {
  outcome: ReplanOutcome;
  triggers: ReplanTrigger[];
  replanCount: number;
  needsHumanReview: boolean;
  summary: string;
  updatedGraph: PlanGraph | null;
  /** Path to the written replan decision artifact, or null when no artifact was written. */
  decisionArtifactPath: string | null;
}

/**
 * Classify trigger evidence from child task states and artifacts.
 *
 * Returns an array of triggers that fired. An empty array means no replan
 * is warranted.
 *
 * Evidence classes:
 * 1. Three consecutive verifier mismatches on any child in the wave.
 * 2. systemic-failure-alert.json artifact present for the run.
 * 3. Fan-in record contains unresolved merge conflict errors.
 */
export function classifyReplanTriggers(
  waveTasks: RalphTask[],
  fanInErrors: string[],
  systemicAlertExists: boolean
): ReplanTrigger[] {
  const triggers: ReplanTrigger[] = [];

  // (1) Three consecutive verifier mismatches: any child with lastVerifierResult === 'failed'
  // that also has lastReconciliationWarning indicating repeated failure.
  // Simplified check: count children with failed verifier results — three or more triggers replan.
  const failedVerifierChildren = waveTasks.filter(t => t.lastVerifierResult === 'failed');
  if (failedVerifierChildren.length >= 3) {
    triggers.push({
      kind: 'consecutive_verifier_mismatches',
      summary: `${failedVerifierChildren.length} children have failed verifier results: ${failedVerifierChildren.map(t => t.id).join(', ')}.`
    });
  }

  // (2) Systemic failure alert present.
  if (systemicAlertExists) {
    triggers.push({
      kind: 'systemic_failure_alert',
      summary: 'systemic-failure-alert.json artifact is present for this run.'
    });
  }

  // (3) Unresolved merge conflict from fan-in.
  const conflictErrors = fanInErrors.filter(e => e.toLowerCase().includes('conflict'));
  if (conflictErrors.length > 0) {
    triggers.push({
      kind: 'unresolved_merge_conflict',
      summary: `Fan-in reported merge conflicts: ${conflictErrors.join('; ')}.`
    });
  }

  return triggers;
}

/**
 * Check whether a systemic-failure-alert.json file exists in the given
 * artifacts directory. Returns false on any I/O error (treat as absent).
 */
async function systemicAlertFileExists(artifactsDir: string): Promise<boolean> {
  try {
    await fs.access(path.join(artifactsDir, 'systemic-failure-alert.json'));
    return true;
  } catch {
    return false;
  }
}

export interface ExecuteReplanNodeInput {
  /** Path to the plan-graph.json file for the parent task. */
  planGraphFilePath: string;
  /** All tasks from the task graph (needed for trigger classification). */
  allTasks: RalphTask[];
  /** Artifacts directory for the current run (checked for systemic-failure-alert.json). */
  artifactsDir: string;
  /** Maximum replans allowed per parent (from config). */
  maxReplansPerParent: number;
  /** Maximum generated children per replan (from config). Used to truncate proposed waves. */
  maxGeneratedChildren: number;
  /** Pre-parsed proposed waves from the planning pass caller. Empty when no proposal is available. */
  proposedWaves: ExecutionWave[];
  /**
   * Root directory for artifact storage. When provided alongside parentTaskId, a
   * replan decision artifact is written at
   * `<artifactRootDir>/<parentTaskId>/replan-<replanIndex>.json`.
   */
  artifactRootDir?: string;
  /** Parent task ID used to locate the replan decision artifact directory. */
  parentTaskId?: string;
}

/**
 * Execute the adaptive re-plan node for a parent task's plan graph.
 *
 * Reads trigger evidence, checks the per-parent replan counter, and if a
 * trigger fires and the cap is not exhausted, writes revised waves to
 * plan-graph.json.
 *
 * When the replan cap is exhausted, returns `replan_cap_exhausted` with
 * `needsHumanReview = true` so the caller can surface a deterministic
 * `human_review_needed` stop.
 *
 * This function is the single writer for plan-graph.json at replan time,
 * following the same invariant as `validateFanIn`.
 */
export async function executeReplanNode(
  input: ExecuteReplanNodeInput
): Promise<ReplanResult> {
  const {
    planGraphFilePath,
    allTasks,
    artifactsDir,
    maxReplansPerParent,
    maxGeneratedChildren,
    proposedWaves,
    artifactRootDir,
    parentTaskId
  } = input;

  // Read the current plan graph.
  const graph = await readPlanGraph(planGraphFilePath);
  if (!graph) {
    return {
      outcome: 'no_trigger',
      triggers: [],
      replanCount: 0,
      needsHumanReview: false,
      summary: 'No plan graph found; replan node is a no-op.',
      updatedGraph: null,
      decisionArtifactPath: null
    };
  }

  // Collect wave member tasks for trigger classification.
  const taskById = new Map(allTasks.map(t => [t.id, t]));
  const allWaveMemberIds = new Set(graph.waves.flatMap(w => w.memberTaskIds));
  const waveTasks = [...allWaveMemberIds]
    .map(id => taskById.get(id))
    .filter((t): t is RalphTask => t !== undefined);

  // Collect fan-in errors from the persisted record.
  const fanInErrors = graph.fanInRecord?.fanInErrors ?? [];

  // Check for systemic failure alert.
  const alertExists = await systemicAlertFileExists(artifactsDir);

  // Classify triggers.
  const triggers = classifyReplanTriggers(waveTasks, fanInErrors, alertExists);

  if (triggers.length === 0) {
    return {
      outcome: 'no_trigger',
      triggers: [],
      replanCount: graph.replanCount ?? 0,
      needsHumanReview: false,
      summary: 'No replan triggers detected; graph unchanged.',
      updatedGraph: null,
      decisionArtifactPath: null
    };
  }

  // Check cap.
  const currentCount = graph.replanCount ?? 0;
  if (currentCount >= maxReplansPerParent) {
    return {
      outcome: 'replan_cap_exhausted',
      triggers,
      replanCount: currentCount,
      needsHumanReview: true,
      summary: `Replan cap exhausted (${currentCount}/${maxReplansPerParent}). Escalating to human review.`,
      updatedGraph: null,
      decisionArtifactPath: null
    };
  }

  // Capture old wave member IDs before mutation so we can compute a taskGraphDiff.
  const oldMemberIds = new Set(graph.waves.flatMap(w => w.memberTaskIds));

  // Apply proposed waves (truncate to maxGeneratedChildren total member tasks).
  const truncatedWaves = truncateWavesToChildLimit(proposedWaves, maxGeneratedChildren);
  const nextCount = currentCount + 1;

  const updatedGraph: PlanGraph = {
    ...graph,
    waves: truncatedWaves.length > 0 ? truncatedWaves : graph.waves,
    replanCount: nextCount
  };

  await writePlanGraph(planGraphFilePath, updatedGraph);

  // Compute task graph diff (old member IDs vs new).
  const newMemberIds = new Set(updatedGraph.waves.flatMap(w => w.memberTaskIds));
  const addedTaskIds = [...newMemberIds].filter(id => !oldMemberIds.has(id));
  const removedTaskIds = [...oldMemberIds].filter(id => !newMemberIds.has(id));

  const triggerSummary = triggers.map(t => t.kind).join(', ');
  const chosenMutation = `${truncatedWaves.length} wave(s) written with ` +
    `${truncatedWaves.reduce((n, w) => n + w.memberTaskIds.length, 0)} total child task(s).`;

  // Write replan decision artifact if artifact root and parent task ID are provided.
  let decisionArtifactPath: string | null = null;
  if (artifactRootDir && parentTaskId) {
    const artifactDir = path.join(artifactRootDir, parentTaskId);
    await fs.mkdir(artifactDir, { recursive: true });
    const artifactFileName = `replan-${nextCount}.json`;
    const artifactPath = path.join(artifactDir, artifactFileName);
    const artifact: ReplanDecisionArtifact = {
      schemaVersion: 1,
      kind: 'replanDecision',
      parentTaskId,
      replanIndex: nextCount,
      triggerEvidenceClass: triggers.map(t => t.kind),
      triggerDetails: triggers.map(t => t.summary).join(' '),
      rejectedAlternatives: [],
      chosenMutation,
      taskGraphDiff: {
        addedTaskIds,
        removedTaskIds,
        modifiedTaskIds: []
      },
      createdAt: new Date().toISOString()
    };
    await fs.writeFile(artifactPath, stableJson(artifact), 'utf8');
    decisionArtifactPath = artifactPath;
  }

  return {
    outcome: 'replan_applied',
    triggers,
    replanCount: nextCount,
    needsHumanReview: false,
    summary: `Replan ${nextCount}/${maxReplansPerParent} applied. Triggers: ${triggerSummary}. ${chosenMutation}`,
    updatedGraph,
    decisionArtifactPath
  };
}

/**
 * Truncate an array of proposed waves so the total number of member task IDs
 * across all waves does not exceed `maxChildren`. Waves are consumed in order;
 * if a wave would push the total over the limit its member list is sliced.
 */
export function truncateWavesToChildLimit(
  waves: ExecutionWave[],
  maxChildren: number
): ExecutionWave[] {
  const result: ExecutionWave[] = [];
  let remaining = maxChildren;

  for (const wave of waves) {
    if (remaining <= 0) break;

    if (wave.memberTaskIds.length <= remaining) {
      result.push(wave);
      remaining -= wave.memberTaskIds.length;
    } else {
      result.push({
        ...wave,
        memberTaskIds: wave.memberTaskIds.slice(0, remaining)
      });
      remaining = 0;
    }
  }

  return result;
}
