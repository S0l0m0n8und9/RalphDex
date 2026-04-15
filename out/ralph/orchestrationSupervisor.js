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
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const integrity_1 = require("./integrity");
function resolveOrchestrationPaths(ralphRoot, runId) {
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
    // Complete the cursor node.
    const updatedNodeStates = state.nodeStates.map(ns => {
        if (ns.nodeId === state.cursor) {
            return {
                ...ns,
                outcome: 'completed',
                evidence,
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
//# sourceMappingURL=orchestrationSupervisor.js.map