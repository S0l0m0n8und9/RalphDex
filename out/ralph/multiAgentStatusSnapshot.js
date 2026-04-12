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
exports.readMultiAgentStatusSummaries = readMultiAgentStatusSummaries;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const multiAgentStatus_1 = require("./multiAgentStatus");
const taskFile_1 = require("./taskFile");
async function readJsonArtifact(target) {
    try {
        return JSON.parse(await fs.readFile(target, 'utf8'));
    }
    catch {
        return null;
    }
}
function normalizeHandoffNote(candidate) {
    if (typeof candidate !== 'object' || candidate === null) {
        return null;
    }
    const record = candidate;
    if (typeof record.iteration !== 'number') {
        return null;
    }
    return {
        iteration: record.iteration,
        selectedTaskId: typeof record.selectedTaskId === 'string' ? record.selectedTaskId : null,
        selectedTaskTitle: typeof record.selectedTaskTitle === 'string' ? record.selectedTaskTitle : null,
        stopReason: typeof record.stopReason === 'string' ? record.stopReason : null,
        completionClassification: typeof record.completionClassification === 'string' ? record.completionClassification : null,
        progressNote: typeof record.progressNote === 'string' ? record.progressNote : null
    };
}
async function readAllHandoffsForAgent(handoffDir, agentId) {
    let entries;
    try {
        const allEntries = await fs.readdir(handoffDir);
        entries = allEntries.filter((entry) => entry.startsWith(`${agentId}-`) && entry.endsWith('.json'));
    }
    catch {
        return [];
    }
    if (entries.length === 0) {
        return [];
    }
    const handoffs = await Promise.all(entries.map(async (entry) => {
        const content = await readJsonArtifact(path.join(handoffDir, entry));
        return normalizeHandoffNote(content);
    }));
    return handoffs
        .filter((handoff) => handoff !== null)
        .sort((left, right) => left.iteration - right.iteration);
}
function buildTaskTierLookup(rawTaskFile) {
    const lookup = new Map();
    if (typeof rawTaskFile !== 'object' || rawTaskFile === null) {
        return lookup;
    }
    const record = rawTaskFile;
    if (!Array.isArray(record.tasks)) {
        return lookup;
    }
    for (const task of record.tasks) {
        if (typeof task === 'object' && task !== null && typeof task.id === 'string') {
            lookup.set(task.id, task);
        }
    }
    return lookup;
}
async function readMultiAgentStatusSummaries(ralphDir, claimFilePath) {
    const agentsDir = path.join(ralphDir, 'agents');
    const handoffDir = path.join(ralphDir, 'handoff');
    let agentFiles;
    try {
        const allFiles = await fs.readdir(agentsDir);
        agentFiles = allFiles.filter((entry) => entry.endsWith('.json') && !entry.endsWith('.tmp'));
    }
    catch {
        return [];
    }
    const [claimGraph, rawTaskFile] = await Promise.all([
        (0, taskFile_1.inspectTaskClaimGraph)(claimFilePath).catch(() => null),
        readJsonArtifact(path.join(ralphDir, 'tasks.json'))
    ]);
    const taskLookup = buildTaskTierLookup(rawTaskFile);
    const summaries = await Promise.all(agentFiles.map(async (fileName) => {
        const agentId = fileName.replace(/\.json$/, '');
        const record = await readJsonArtifact(path.join(agentsDir, fileName));
        const normalized = typeof record === 'object' && record !== null ? record : {};
        const firstSeenAt = typeof normalized.firstSeenAt === 'string' ? normalized.firstSeenAt : '';
        const completedTaskIds = Array.isArray(normalized.completedTaskIds) ? normalized.completedTaskIds : [];
        const completedTaskCount = completedTaskIds.length;
        const activeClaimEntry = claimGraph?.tasks.find((entry) => entry.canonicalClaim?.claim.agentId === agentId && entry.canonicalClaim?.claim.status === 'active');
        const activeClaimTaskId = activeClaimEntry?.taskId ?? null;
        const activeClaimTask = activeClaimTaskId ? taskLookup.get(activeClaimTaskId) ?? null : null;
        const activeClaimTaskTier = activeClaimTask?.tier ?? null;
        const activeClaimTaskTierSource = activeClaimTaskId === null
            ? null
            : activeClaimTask?.tier
                ? 'explicit'
                : 'dynamic';
        const handoffHistory = await readAllHandoffsForAgent(handoffDir, agentId);
        const stuckScore = (0, multiAgentStatus_1.computeStuckScore)(handoffHistory);
        const latestHandoff = handoffHistory.length > 0 ? handoffHistory[handoffHistory.length - 1] : null;
        return {
            agentId,
            firstSeenAt,
            completedTaskCount,
            activeClaimTaskId,
            activeClaimTaskTier,
            activeClaimTaskTierSource,
            handoffHistory,
            latestHandoff,
            stuckScore,
        };
    }));
    return summaries.sort((left, right) => left.agentId.localeCompare(right.agentId));
}
//# sourceMappingURL=multiAgentStatusSnapshot.js.map