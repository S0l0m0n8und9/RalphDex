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
exports.writePlanGraph = writePlanGraph;
exports.readPlanGraph = readPlanGraph;
exports.validateWaveSafety = validateWaveSafety;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const integrity_1 = require("./integrity");
/**
 * Persist a plan graph to disk.
 *
 * Creates the parent directory recursively if it does not exist, then writes
 * the graph as stable-sorted JSON so diffs remain deterministic.
 */
async function writePlanGraph(filePath, graph) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, (0, integrity_1.stableJson)(graph), 'utf8');
}
/**
 * Read a previously persisted plan graph.
 *
 * Returns `null` when the file does not exist (ENOENT). All other I/O errors
 * are re-thrown so callers distinguish "no graph yet" from real failures.
 */
async function readPlanGraph(filePath) {
    try {
        const raw = await fs.readFile(filePath, 'utf8');
        return JSON.parse(raw);
    }
    catch (err) {
        if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
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
function validateWaveSafety(wave, allTasks) {
    const errors = [];
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
                }
                else if (dep.status !== 'done') {
                    errors.push(`Task '${memberId}' has unresolved dependency '${depId}' (status: '${dep.status}').`);
                }
            }
        }
    }
    // --- Check for write-risk label collisions within the wave ----------------
    const labelOwners = new Map();
    for (const memberId of wave.memberTaskIds) {
        const task = taskById.get(memberId);
        if (!task?.writeRiskLabels)
            continue;
        for (const label of task.writeRiskLabels) {
            const owners = labelOwners.get(label);
            if (owners) {
                owners.push(memberId);
            }
            else {
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
//# sourceMappingURL=planGraph.js.map