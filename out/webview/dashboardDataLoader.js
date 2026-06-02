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
exports.createDashboardSnapshotLoader = createDashboardSnapshotLoader;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const statusSnapshot_1 = require("../commands/statusSnapshot");
const readConfig_1 = require("../config/readConfig");
const multiAgentStatusSnapshot_1 = require("../ralph/multiAgentStatusSnapshot");
const eventJournal_1 = require("../ralph/eventJournal");
const runTimeline_1 = require("../ralph/runTimeline");
const dashboardSnapshot_1 = require("./dashboardSnapshot");
/**
 * Reads the most recent run's event journal for the trust timeline (#73).
 * Prefers the current provenance id, then falls back to the newest run dir that
 * has an `events.jsonl`. Returns null when no journal exists yet.
 */
async function loadRunFileChanges(artifactsDir, events) {
    const diffEvent = [...events]
        .reverse()
        .find((event) => event.type === 'artifact_written'
        && (event.artifactType === 'diff-summary' || event.relativePath.endsWith('/diff-summary.json')));
    if (!diffEvent || diffEvent.type !== 'artifact_written') {
        return (0, runTimeline_1.buildUnavailableRunFileChangeSummary)({
            status: 'missing',
            message: 'No durable diff summary was recorded for the latest run.'
        });
    }
    const artifactRoot = path.resolve(artifactsDir);
    const artifactPath = path.resolve(artifactRoot, diffEvent.relativePath);
    if (artifactPath !== artifactRoot && !artifactPath.startsWith(`${artifactRoot}${path.sep}`)) {
        return (0, runTimeline_1.buildUnavailableRunFileChangeSummary)({
            status: 'unreadable',
            artifactPath,
            message: 'The latest run diff summary path is outside the artifact root.'
        });
    }
    try {
        const parsed = (0, runTimeline_1.normalizeRunDiffSummary)(JSON.parse(await fs.readFile(artifactPath, 'utf8')));
        if (!parsed) {
            return (0, runTimeline_1.buildUnavailableRunFileChangeSummary)({
                status: 'unreadable',
                artifactPath,
                message: 'The latest run diff summary is present but unreadable.'
            });
        }
        return (0, runTimeline_1.buildRunFileChangeSummary)({ diffSummary: parsed, artifactPath });
    }
    catch (error) {
        return (0, runTimeline_1.buildUnavailableRunFileChangeSummary)({
            status: 'unreadable',
            artifactPath,
            message: `Unable to read latest run diff summary: ${error instanceof Error ? error.message : String(error)}`
        });
    }
}
async function loadLatestRunTimeline(artifactsDir, currentProvenanceId) {
    const candidateRunIds = [];
    if (currentProvenanceId) {
        candidateRunIds.push(currentProvenanceId);
    }
    try {
        const runDirs = await fs.readdir(path.join(artifactsDir, 'runs'), { withFileTypes: true });
        const names = runDirs
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            // Byte-order (not locale-sensitive) descending: run ids are timestamp/uuid
            // strings whose correct ordering is lexicographic, independent of locale.
            .sort((a, b) => (b > a ? 1 : b < a ? -1 : 0));
        for (const name of names) {
            if (!candidateRunIds.includes(name)) {
                candidateRunIds.push(name);
            }
        }
    }
    catch {
        // No runs directory yet.
    }
    for (const runId of candidateRunIds) {
        // Resumable read recovers the valid prefix of a journal whose last line is
        // partially written (mid-crash), so a live run is never silently skipped in
        // favour of an older run's stale timeline. ENOENT yields [] -> next candidate.
        const events = await (0, eventJournal_1.readEventJournalResumable)(artifactsDir, runId);
        if (events.length > 0) {
            const timeline = (0, runTimeline_1.buildRunTrustTimeline)(events);
            return { ...timeline, fileChanges: await loadRunFileChanges(artifactsDir, events) };
        }
    }
    return null;
}
function createDashboardSnapshotLoader(stateManager, logger) {
    return async () => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return null;
        }
        const status = await (0, statusSnapshot_1.collectStatusSnapshot)(workspaceFolder, stateManager, logger);
        const ralphDir = path.join(workspaceFolder.uri.fsPath, '.ralph');
        const claimFilePath = path.join(ralphDir, 'claims.json');
        const agentSummaries = await (0, multiAgentStatusSnapshot_1.readMultiAgentStatusSummaries)(ralphDir, claimFilePath);
        // Operator trust timeline (#73): pre-run intent from the effective config +
        // selected task, post-run timeline from the latest run's event journal.
        let runTimelineInput = null;
        try {
            const config = (0, readConfig_1.readConfig)(workspaceFolder);
            const intent = (0, runTimeline_1.buildExecutionIntentPreview)({
                config,
                selectedTask: status.selectedTask ? { id: status.selectedTask.id, title: status.selectedTask.title } : null
            });
            const timeline = await loadLatestRunTimeline(status.artifactDir, status.currentProvenanceId);
            runTimelineInput = { intent, timeline };
        }
        catch (error) {
            logger.warn('Failed to build the operator trust timeline for the dashboard.', {
                error: error instanceof Error ? error.message : String(error)
            });
        }
        return (0, dashboardSnapshot_1.buildDashboardSnapshot)(status, agentSummaries, runTimelineInput);
    };
}
//# sourceMappingURL=dashboardDataLoader.js.map