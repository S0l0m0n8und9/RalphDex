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
exports.createProvenanceBundle = createProvenanceBundle;
exports.persistPreparedProvenanceBundle = persistPreparedProvenanceBundle;
exports.persistBlockedPreflightBundle = persistBlockedPreflightBundle;
exports.persistIntegrityFailureBundle = persistIntegrityFailureBundle;
exports.cleanupGeneratedArtifactsHelper = cleanupGeneratedArtifactsHelper;
exports.isCleanTerminalHandoffStopReason = isCleanTerminalHandoffStopReason;
exports.writeLoopTerminationHandoff = writeLoopTerminationHandoff;
exports.updateAgentIdentityRecord = updateAgentIdentityRecord;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const integrity_1 = require("./integrity");
const types_1 = require("./types");
const taskFile_1 = require("./taskFile");
const artifactStore_1 = require("./artifactStore");
// ---------------------------------------------------------------------------
// Provenance bundle creation
// ---------------------------------------------------------------------------
function createProvenanceBundle(input) {
    const { prepared, status, summary, executionPayloadHash = null, executionPayloadMatched = null, mismatchReason = null, cliInvocationPath = null, iterationResultPath = null, provenanceFailurePath = null, provenanceFailureSummaryPath = null, promptCacheStats = null } = input;
    return {
        schemaVersion: 1,
        kind: 'provenanceBundle',
        agentId: prepared.config.agentId,
        provenanceId: prepared.provenanceId,
        iteration: prepared.iteration,
        promptKind: prepared.promptKind,
        promptTarget: prepared.promptTarget,
        trustLevel: prepared.trustLevel,
        status,
        summary,
        rootPolicy: prepared.rootPolicy,
        selectedTaskId: prepared.selectedTask?.id ?? null,
        selectedTaskTitle: prepared.selectedTask?.title ?? null,
        artifactDir: (0, artifactStore_1.resolveIterationArtifactPaths)(prepared.paths.artifactDir, prepared.iteration).directory,
        bundleDir: prepared.provenanceBundlePaths.directory,
        preflightReportPath: prepared.provenanceBundlePaths.preflightReportPath,
        preflightSummaryPath: prepared.provenanceBundlePaths.preflightSummaryPath,
        promptArtifactPath: prepared.provenanceBundlePaths.promptPath,
        promptEvidencePath: prepared.provenanceBundlePaths.promptEvidencePath,
        executionPlanPath: prepared.provenanceBundlePaths.executionPlanPath,
        executionPlanHash: prepared.executionPlanHash,
        cliInvocationPath,
        iterationResultPath,
        provenanceFailurePath,
        provenanceFailureSummaryPath,
        promptHash: prepared.executionPlan.promptHash,
        promptByteLength: prepared.executionPlan.promptByteLength,
        executionPayloadHash,
        executionPayloadMatched,
        mismatchReason,
        promptCacheStats,
        createdAt: prepared.executionPlan.createdAt,
        updatedAt: new Date().toISOString()
    };
}
// ---------------------------------------------------------------------------
// Provenance bundle persistence helpers
// ---------------------------------------------------------------------------
async function persistPreparedProvenanceBundle(prepared, logger) {
    const bundle = createProvenanceBundle({
        prepared,
        status: prepared.promptTarget === 'cliExec' ? 'prepared' : 'prepared',
        summary: prepared.promptTarget === 'cliExec'
            ? 'Prepared CLI execution provenance bundle.'
            : 'Prepared prompt provenance bundle for IDE handoff.'
    });
    const writeResult = await (0, artifactStore_1.writeProvenanceBundle)({
        artifactRootDir: prepared.paths.artifactDir,
        paths: prepared.provenanceBundlePaths,
        bundle,
        preflightReport: prepared.persistedPreflightReport,
        preflightSummary: prepared.preflightSummaryText,
        prompt: prepared.prompt,
        promptEvidence: prepared.promptEvidence,
        executionPlan: prepared.executionPlan,
        retentionCount: prepared.config.provenanceBundleRetentionCount
    });
    if (writeResult.retention.deletedBundleIds.length > 0) {
        logger.info('Cleaned up old Ralph provenance bundles after prepare.', {
            deletedBundleIds: writeResult.retention.deletedBundleIds,
            retentionCount: prepared.config.provenanceBundleRetentionCount
        });
    }
    await cleanupGeneratedArtifactsHelper(prepared.paths, prepared.config.generatedArtifactRetentionCount, 'prepare', logger);
}
async function persistBlockedPreflightBundle(input, logger) {
    const provenanceBundlePaths = (0, artifactStore_1.resolveProvenanceBundlePaths)(input.paths.artifactDir, input.provenanceId);
    const bundle = {
        schemaVersion: 1,
        kind: 'provenanceBundle',
        agentId: input.persistedPreflightReport.agentId,
        provenanceId: input.provenanceId,
        iteration: input.iteration,
        promptKind: input.promptKind,
        promptTarget: input.promptTarget,
        trustLevel: input.trustLevel,
        status: 'blocked',
        summary: input.persistedPreflightReport.summary,
        rootPolicy: input.rootPolicy,
        selectedTaskId: input.selectedTask?.id ?? null,
        selectedTaskTitle: input.selectedTask?.title ?? null,
        artifactDir: (0, artifactStore_1.resolveIterationArtifactPaths)(input.paths.artifactDir, input.iteration).directory,
        bundleDir: provenanceBundlePaths.directory,
        preflightReportPath: provenanceBundlePaths.preflightReportPath,
        preflightSummaryPath: provenanceBundlePaths.preflightSummaryPath,
        promptArtifactPath: null,
        promptEvidencePath: null,
        executionPlanPath: null,
        executionPlanHash: null,
        cliInvocationPath: null,
        iterationResultPath: null,
        provenanceFailurePath: null,
        provenanceFailureSummaryPath: null,
        promptHash: null,
        promptByteLength: null,
        executionPayloadHash: null,
        executionPayloadMatched: null,
        mismatchReason: null,
        createdAt: input.persistedPreflightReport.createdAt,
        updatedAt: new Date().toISOString()
    };
    const writeResult = await (0, artifactStore_1.writeProvenanceBundle)({
        artifactRootDir: input.paths.artifactDir,
        paths: provenanceBundlePaths,
        bundle,
        preflightReport: input.persistedPreflightReport,
        preflightSummary: input.preflightSummaryText,
        retentionCount: input.provenanceRetentionCount
    });
    if (writeResult.retention.deletedBundleIds.length > 0) {
        logger.info('Cleaned up old Ralph provenance bundles after blocked preflight.', {
            deletedBundleIds: writeResult.retention.deletedBundleIds
        });
    }
    await cleanupGeneratedArtifactsHelper(input.paths, input.generatedArtifactRetentionCount, 'blocked preflight', logger);
}
async function persistIntegrityFailureBundle(prepared, failureDetails, logger) {
    const failure = {
        schemaVersion: 1,
        kind: 'integrityFailure',
        provenanceId: prepared.provenanceId,
        iteration: prepared.iteration,
        promptKind: prepared.promptKind,
        promptTarget: prepared.promptTarget,
        trustLevel: prepared.trustLevel,
        stage: failureDetails.stage,
        blocked: true,
        summary: `Blocked before launch because ${failureDetails.stage} verification failed.`,
        message: failureDetails.message,
        artifactDir: (0, artifactStore_1.resolveIterationArtifactPaths)(prepared.paths.artifactDir, prepared.iteration).directory,
        executionPlanPath: prepared.executionPlanPath,
        promptArtifactPath: prepared.executionPlan.promptArtifactPath,
        cliInvocationPath: null,
        expectedExecutionPlanHash: failureDetails.expectedExecutionPlanHash,
        actualExecutionPlanHash: failureDetails.actualExecutionPlanHash,
        expectedPromptHash: failureDetails.expectedPromptHash,
        actualPromptHash: failureDetails.actualPromptHash,
        expectedPayloadHash: failureDetails.expectedPayloadHash,
        actualPayloadHash: failureDetails.actualPayloadHash,
        createdAt: new Date().toISOString()
    };
    const bundle = createProvenanceBundle({
        prepared,
        status: 'blocked',
        summary: failure.summary,
        executionPayloadHash: failure.actualPayloadHash,
        executionPayloadMatched: false,
        mismatchReason: failure.message,
        provenanceFailurePath: prepared.provenanceBundlePaths.provenanceFailurePath,
        provenanceFailureSummaryPath: prepared.provenanceBundlePaths.provenanceFailureSummaryPath
    });
    const writeResult = await (0, artifactStore_1.writeProvenanceBundle)({
        artifactRootDir: prepared.paths.artifactDir,
        paths: prepared.provenanceBundlePaths,
        bundle,
        preflightReport: prepared.persistedPreflightReport,
        preflightSummary: prepared.preflightSummaryText,
        prompt: prepared.prompt,
        promptEvidence: prepared.promptEvidence,
        executionPlan: prepared.executionPlan,
        failure,
        retentionCount: prepared.config.provenanceBundleRetentionCount
    });
    if (writeResult.retention.deletedBundleIds.length > 0) {
        logger.info('Cleaned up old Ralph provenance bundles after integrity failure.', {
            deletedBundleIds: writeResult.retention.deletedBundleIds,
            retentionCount: prepared.config.provenanceBundleRetentionCount
        });
    }
    await cleanupGeneratedArtifactsHelper(prepared.paths, prepared.config.generatedArtifactRetentionCount, 'integrity failure', logger);
}
async function cleanupGeneratedArtifactsHelper(paths, retentionCount, stage, logger) {
    const retention = await (0, artifactStore_1.cleanupGeneratedArtifacts)({
        artifactRootDir: paths.artifactDir,
        promptDir: paths.promptDir,
        runDir: paths.runDir,
        handoffDir: paths.handoffDir,
        stateFilePath: paths.stateFilePath,
        retentionCount
    });
    if (retention.deletedIterationDirectories.length === 0
        && retention.deletedPromptFiles.length === 0
        && retention.deletedRunArtifactBaseNames.length === 0
        && (retention.deletedHandoffFiles?.length ?? 0) === 0) {
        return;
    }
    logger.info(`Cleaned up generated Ralph artifacts after ${stage}.`, {
        retentionCount,
        deletedIterationDirectories: retention.deletedIterationDirectories,
        protectedRetainedIterationDirectories: retention.protectedRetainedIterationDirectories,
        deletedPromptFiles: retention.deletedPromptFiles,
        protectedRetainedPromptFiles: retention.protectedRetainedPromptFiles,
        deletedRunArtifactBaseNames: retention.deletedRunArtifactBaseNames,
        protectedRetainedRunArtifactBaseNames: retention.protectedRetainedRunArtifactBaseNames,
        deletedHandoffFiles: retention.deletedHandoffFiles ?? []
    });
}
// ---------------------------------------------------------------------------
// Loop termination handoff
// ---------------------------------------------------------------------------
const CLEAN_TERMINAL_HANDOFF_STOP_REASONS = new Set([
    'task_marked_complete',
    'iteration_cap_reached',
    'control_plane_reload_required',
    'human_review_needed',
    'no_actionable_task',
    'verification_passed_no_remaining_subtasks'
]);
function isCleanTerminalHandoffStopReason(stopReason) {
    return typeof stopReason === 'string' && CLEAN_TERMINAL_HANDOFF_STOP_REASONS.has(stopReason);
}
function buildHandoffHumanSummary(note) {
    const taskLabel = note.selectedTaskId
        ? `${note.selectedTaskId}${note.selectedTaskTitle ? ` (${note.selectedTaskTitle})` : ''}`
        : 'No selected task';
    const detail = note.progressNote
        ?? note.pendingBlocker
        ?? note.validationFailureSignature
        ?? note.completionClassification;
    return `${taskLabel} stopped with ${note.stopReason}. ${detail}`.trim();
}
async function writeAtomicJsonFile(targetPath, value) {
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    const temporaryPath = `${targetPath}.tmp`;
    await fs.writeFile(temporaryPath, (0, integrity_1.stableJson)(value), 'utf8');
    await fs.rename(temporaryPath, targetPath);
}
async function writeLoopTerminationHandoff(input) {
    if (!isCleanTerminalHandoffStopReason(input.result.stopReason)) {
        return;
    }
    const note = {
        agentId: input.result.agentId ?? types_1.DEFAULT_RALPH_AGENT_ID,
        iteration: input.result.iteration,
        selectedTaskId: input.result.selectedTaskId,
        selectedTaskTitle: input.result.selectedTaskTitle,
        stopReason: input.result.stopReason,
        completionClassification: input.result.completionClassification,
        progressNote: input.progressNote ?? undefined,
        pendingBlocker: input.pendingBlocker ?? undefined,
        validationFailureSignature: input.result.verification.validationFailureSignature ?? undefined,
        backlog: input.result.backlog
    };
    await writeAtomicJsonFile(path.join(input.paths.handoffDir, `${note.agentId}-${String(note.iteration).padStart(3, '0')}.json`), {
        ...note,
        humanSummary: buildHandoffHumanSummary(note)
    });
}
function normalizeAgentIdentityRecord(candidate, agentId, firstSeenAt) {
    if (typeof candidate !== 'object' || candidate === null) {
        return {
            agentId,
            firstSeenAt,
            completedTaskIds: [],
            touchedFiles: []
        };
    }
    const record = candidate;
    const completedTaskIds = Array.isArray(record.completedTaskIds)
        ? record.completedTaskIds.filter((item) => typeof item === 'string')
        : [];
    const touchedFiles = Array.isArray(record.touchedFiles)
        ? record.touchedFiles.filter((item) => typeof item === 'string')
        : [];
    return {
        agentId,
        firstSeenAt: typeof record.firstSeenAt === 'string' && record.firstSeenAt.trim().length > 0
            ? record.firstSeenAt
            : firstSeenAt,
        completedTaskIds,
        touchedFiles
    };
}
function uniqueSorted(values) {
    return Array.from(new Set(values.filter((value) => value.trim().length > 0))).sort((left, right) => left.localeCompare(right));
}
async function updateAgentIdentityRecord(input) {
    const agentDirectoryPath = path.join(input.rootPath, '.ralph', 'agents');
    const recordPath = path.join(agentDirectoryPath, `${input.agentId}.json`);
    await fs.mkdir(agentDirectoryPath, { recursive: true });
    const locked = await (0, taskFile_1.withTaskFileLock)(recordPath, undefined, async () => {
        let existing = null;
        try {
            existing = JSON.parse(await fs.readFile(recordPath, 'utf8'));
        }
        catch (error) {
            const code = error.code;
            if (code !== 'ENOENT') {
                throw error;
            }
        }
        const record = normalizeAgentIdentityRecord(existing, input.agentId, input.startedAt);
        const completedTaskIds = [...record.completedTaskIds];
        if (input.selectedTaskCompleted && input.selectedTaskId) {
            completedTaskIds.push(input.selectedTaskId);
        }
        const nextRecord = {
            agentId: input.agentId,
            firstSeenAt: record.firstSeenAt,
            completedTaskIds,
            touchedFiles: uniqueSorted([
                ...record.touchedFiles,
                ...(input.diffSummary?.changedFiles ?? [])
            ])
        };
        const tempPath = path.join(agentDirectoryPath, `${input.agentId}.${process.pid}.${Date.now()}.tmp`);
        await fs.writeFile(tempPath, `${JSON.stringify(nextRecord, null, 2)}\n`, 'utf8');
        await fs.rm(recordPath, { force: true });
        await fs.rename(tempPath, recordPath);
    });
    if (locked.outcome === 'lock_timeout') {
        throw new Error(`Timed out acquiring agent record lock for ${input.agentId} after ${locked.attempts} attempt(s).`);
    }
}
//# sourceMappingURL=provenancePersistence.js.map