"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrchestrationTransitionError = void 0;
exports.resolveOrchestrationPaths = resolveOrchestrationPaths;
exports.initializeState = initializeState;
exports.advanceState = advanceState;
exports.writeOrchestrationGraph = writeOrchestrationGraph;
exports.writeOrchestrationState = writeOrchestrationState;
exports.readOrchestrationGraph = readOrchestrationGraph;
exports.readOrchestrationState = readOrchestrationState;
exports.writeNodeSpan = writeNodeSpan;
exports.readNodeSpan = readNodeSpan;
exports.classifyReplanTriggers = classifyReplanTriggers;
exports.executeReplanNode = executeReplanNode;
exports.truncateWavesToChildLimit = truncateWavesToChildLimit;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const integrity_1 = require("./integrity");
const planGraph_1 = require("./planGraph");
function resolveOrchestrationPaths(ralphRoot, runId) {
    const directory = path.join(ralphRoot, 'orchestration', runId);
    return {
        directory,
        graphPath: path.join(directory, 'graph.json'),
        statePath: path.join(directory, 'state.json'),
        nodeSpanPath(nodeId) {
            return path.join(directory, `node-${nodeId}-span.json`);
        }
    };
}
// ---------------------------------------------------------------------------
// Transition validation errors
// ---------------------------------------------------------------------------
class OrchestrationTransitionError extends Error {
    constructor(message) {
        super(message);
        this.name = 'OrchestrationTransitionError';
    }
}
exports.OrchestrationTransitionError = OrchestrationTransitionError;
// ---------------------------------------------------------------------------
// Graph helpers
// ---------------------------------------------------------------------------
function findEdge(graph, from, to) {
    return graph.edges.find(e => e.from === from && e.to === to);
}
function findNodeState(state, nodeId) {
    return state.nodeStates.find(ns => ns.nodeId === nodeId);
}
function validateEvidenceRefs(evidence, context) {
    for (const [index, entry] of evidence.entries()) {
        if (entry.ref.trim().length === 0) {
            throw new OrchestrationTransitionError(`${context} contains an invalid evidence reference at index ${index}: ref must be non-empty.`);
        }
        if (entry.summary.trim().length === 0) {
            throw new OrchestrationTransitionError(`${context} contains an invalid evidence reference at index ${index}: summary must be non-empty.`);
        }
    }
}
// ---------------------------------------------------------------------------
// State initialisation from a graph definition
// ---------------------------------------------------------------------------
function initializeState(graph) {
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
function advanceState(graph, state, targetNodeId, evidence) {
    if (graph.runId !== state.runId) {
        throw new OrchestrationTransitionError(`Graph/state run mismatch: graph run "${graph.runId}" does not match state run "${state.runId}".`);
    }
    if (state.cursor === null) {
        throw new OrchestrationTransitionError('Cannot advance: orchestration graph has no active cursor (graph is complete or was never started).');
    }
    const edge = findEdge(graph, state.cursor, targetNodeId);
    if (!edge) {
        throw new OrchestrationTransitionError(`No edge from current cursor "${state.cursor}" to target "${targetNodeId}".`);
    }
    // Evidence gate: every transition must carry at least one evidence reference.
    if (evidence.length === 0) {
        throw new OrchestrationTransitionError(`Transition from "${state.cursor}" to "${targetNodeId}" rejected: no evidence provided. ` +
            'Every graph transition must cite verifier outcomes, claim status, or explicit operator action.');
    }
    validateEvidenceRefs(edge.evidenceRequired, `Transition from "${state.cursor}" to "${targetNodeId}" requirement`);
    validateEvidenceRefs(evidence, `Transition from "${state.cursor}" to "${targetNodeId}" evidence`);
    // Verify that every required evidence kind on the edge is satisfied.
    const providedKinds = new Set(evidence.map(e => e.kind));
    const missingKinds = edge.evidenceRequired
        .map(req => req.kind)
        .filter(kind => !providedKinds.has(kind));
    if (missingKinds.length > 0) {
        throw new OrchestrationTransitionError(`Transition from "${state.cursor}" to "${targetNodeId}" rejected: ` +
            `missing required evidence kinds: ${missingKinds.join(', ')}.`);
    }
    const now = new Date().toISOString();
    const sourceNodeState = findNodeState(state, state.cursor);
    if (!sourceNodeState) {
        throw new OrchestrationTransitionError(`State is missing the current cursor node "${state.cursor}".`);
    }
    const targetNodeState = findNodeState(state, targetNodeId);
    if (!targetNodeState) {
        throw new OrchestrationTransitionError(`State is missing the target node "${targetNodeId}".`);
    }
    // Complete the cursor node.
    const updatedNodeStates = state.nodeStates.map(ns => {
        if (ns.nodeId === state.cursor) {
            return {
                ...ns,
                outcome: 'completed',
                evidence,
                startedAt: ns.startedAt ?? now,
                finishedAt: now
            };
        }
        if (ns.nodeId === targetNodeId) {
            return {
                ...ns,
                outcome: 'running',
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
async function writeOrchestrationGraph(paths, graph) {
    await fs.mkdir(paths.directory, { recursive: true });
    await fs.writeFile(paths.graphPath, (0, integrity_1.stableJson)(graph), 'utf8');
}
async function writeOrchestrationState(paths, state) {
    await fs.mkdir(paths.directory, { recursive: true });
    await fs.writeFile(paths.statePath, (0, integrity_1.stableJson)(state), 'utf8');
}
async function readOrchestrationGraph(paths) {
    const raw = await fs.readFile(paths.graphPath, 'utf8');
    return JSON.parse(raw);
}
async function readOrchestrationState(paths) {
    const raw = await fs.readFile(paths.statePath, 'utf8');
    return JSON.parse(raw);
}
// ---------------------------------------------------------------------------
// Per-node span helpers
// ---------------------------------------------------------------------------
/**
 * Persist a per-node execution span to
 * `.ralph/orchestration/<runId>/node-<nodeId>-span.json`.
 */
async function writeNodeSpan(paths, nodeId, span) {
    await fs.mkdir(paths.directory, { recursive: true });
    await fs.writeFile(paths.nodeSpanPath(nodeId), (0, integrity_1.stableJson)(span), 'utf8');
}
/**
 * Read a persisted node span. Returns `undefined` when the span file does not
 * exist (node has not yet started or span was never written).
 */
async function readNodeSpan(paths, nodeId) {
    try {
        const raw = await fs.readFile(paths.nodeSpanPath(nodeId), 'utf8');
        return JSON.parse(raw);
    }
    catch (err) {
        if (err.code === 'ENOENT') {
            return undefined;
        }
        throw err;
    }
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
function classifyReplanTriggers(waveTasks, fanInErrors, systemicAlertExists) {
    const triggers = [];
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
async function systemicAlertFileExists(artifactsDir) {
    try {
        await fs.access(path.join(artifactsDir, 'systemic-failure-alert.json'));
        return true;
    }
    catch {
        return false;
    }
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
async function executeReplanNode(input) {
    const { planGraphFilePath, allTasks, artifactsDir, maxReplansPerParent, maxGeneratedChildren, proposedWaves } = input;
    // Read the current plan graph.
    const graph = await (0, planGraph_1.readPlanGraph)(planGraphFilePath);
    if (!graph) {
        return {
            outcome: 'no_trigger',
            triggers: [],
            replanCount: 0,
            needsHumanReview: false,
            summary: 'No plan graph found; replan node is a no-op.',
            updatedGraph: null
        };
    }
    // Collect wave member tasks for trigger classification.
    const taskById = new Map(allTasks.map(t => [t.id, t]));
    const allWaveMemberIds = new Set(graph.waves.flatMap(w => w.memberTaskIds));
    const waveTasks = [...allWaveMemberIds]
        .map(id => taskById.get(id))
        .filter((t) => t !== undefined);
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
            updatedGraph: null
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
            updatedGraph: null
        };
    }
    // Apply proposed waves (truncate to maxGeneratedChildren total member tasks).
    const truncatedWaves = truncateWavesToChildLimit(proposedWaves, maxGeneratedChildren);
    const nextCount = currentCount + 1;
    const updatedGraph = {
        ...graph,
        waves: truncatedWaves.length > 0 ? truncatedWaves : graph.waves,
        replanCount: nextCount
    };
    await (0, planGraph_1.writePlanGraph)(planGraphFilePath, updatedGraph);
    const triggerSummary = triggers.map(t => t.kind).join(', ');
    return {
        outcome: 'replan_applied',
        triggers,
        replanCount: nextCount,
        needsHumanReview: false,
        summary: `Replan ${nextCount}/${maxReplansPerParent} applied. Triggers: ${triggerSummary}. ` +
            `${truncatedWaves.length} wave(s) written with ${truncatedWaves.reduce((n, w) => n + w.memberTaskIds.length, 0)} total child task(s).`,
        updatedGraph
    };
}
/**
 * Truncate an array of proposed waves so the total number of member task IDs
 * across all waves does not exceed `maxChildren`. Waves are consumed in order;
 * if a wave would push the total over the limit its member list is sliced.
 */
function truncateWavesToChildLimit(waves, maxChildren) {
    const result = [];
    let remaining = maxChildren;
    for (const wave of waves) {
        if (remaining <= 0)
            break;
        if (wave.memberTaskIds.length <= remaining) {
            result.push(wave);
            remaining -= wave.memberTaskIds.length;
        }
        else {
            result.push({
                ...wave,
                memberTaskIds: wave.memberTaskIds.slice(0, remaining)
            });
            remaining = 0;
        }
    }
    return result;
}
//# sourceMappingURL=orchestrationSupervisor.js.map