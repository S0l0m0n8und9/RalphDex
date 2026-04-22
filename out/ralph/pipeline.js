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
exports.extractPrUrl = extractPrUrl;
exports.buildPipelineRunId = buildPipelineRunId;
exports.parsePrdSections = parsePrdSections;
exports.buildPipelineRootTask = buildPipelineRootTask;
exports.buildPipelineChildTasks = buildPipelineChildTasks;
exports.addPipelineRootTask = addPipelineRootTask;
exports.writePipelineArtifact = writePipelineArtifact;
exports.scaffoldPipelineRun = scaffoldPipelineRun;
exports.readLatestPipelineArtifact = readLatestPipelineArtifact;
const crypto = __importStar(require("node:crypto"));
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const integrity_1 = require("./integrity");
const taskFile_1 = require("./taskFile");
const taskCreation_1 = require("./taskCreation");
const taskNormalization_1 = require("./taskNormalization");
const orchestrationSupervisor_1 = require("./orchestrationSupervisor");
const PR_URL_PATTERN = /https:\/\/[^\s"']+\/pull\/\d+/;
/**
 * Extract the first GitHub/GitLab PR URL from a progress note string.
 * Returns undefined when no match is found.
 */
function extractPrUrl(progressNote) {
    if (!progressNote) {
        return undefined;
    }
    const match = PR_URL_PATTERN.exec(progressNote);
    return match ? match[0] : undefined;
}
/**
 * Generate a deterministic pipeline run ID from a timestamp.
 * Format: pipeline-<yyyyMMddTHHmmssZ>-<4 hex chars>
 */
function buildPipelineRunId(now = new Date()) {
    const compact = now.toISOString()
        .replace(/[-:]/g, '')
        .replace(/\.\d{3}Z$/, 'Z')
        .replace('T', 'T');
    const jitter = crypto.randomBytes(2).toString('hex');
    return `pipeline-${compact}-${jitter}`;
}
const MAX_PIPELINE_CHILD_TASKS = 3;
/**
 * Parse level-2 markdown headings (## Heading) from a PRD text.
 * Falls back to level-1 headings, then to a single placeholder.
 * Returns at most MAX_PIPELINE_CHILD_TASKS segments.
 */
function parsePrdSections(prdText) {
    const h2 = [...prdText.matchAll(/^##\s+(.+)$/gm)]
        .map((m) => m[1].trim())
        .filter((t) => t.length > 0)
        .slice(0, MAX_PIPELINE_CHILD_TASKS);
    if (h2.length >= 1) {
        return h2;
    }
    const h1 = [...prdText.matchAll(/^#\s+(.+)$/gm)]
        .map((m) => m[1].trim())
        .filter((t) => t.length > 0)
        .slice(0, MAX_PIPELINE_CHILD_TASKS);
    if (h1.length >= 1) {
        return h1;
    }
    return ['Implement PRD objective'];
}
/**
 * Build the pipeline-root parent task (not yet written to disk).
 */
function buildPipelineRootTask(rootTaskId, runId) {
    return (0, taskNormalization_1.normalizeNewTask)({
        id: rootTaskId,
        title: `Pipeline run ${runId}`,
        notes: `Auto-generated pipeline root. Created by ralphCodex.runPipeline at ${new Date().toISOString()}.`
    });
}
/**
 * Build child task suggestions from PRD section titles.
 */
function buildPipelineChildTasks(runId, rootTaskId, sections) {
    return sections.map((title, index) => {
        const suffix = String(index + 1).padStart(2, '0');
        return {
            id: `${rootTaskId}.${suffix}`,
            title,
            parentId: rootTaskId,
            dependsOn: index === 0
                ? []
                : [{ taskId: `${rootTaskId}.${String(index).padStart(2, '0')}`, reason: 'blocks_sequence' }],
            validation: null,
            rationale: `Auto-derived from PRD section for pipeline run ${runId}.`
        };
    });
}
/**
 * Add the pipeline-root task to the task file (under lock) and return it.
 */
async function addPipelineRootTask(taskFilePath, rootTask) {
    const rootTaskInput = {
        id: rootTask.id,
        title: rootTask.title,
        status: rootTask.status,
        ...(rootTask.parentId !== undefined ? { parentId: rootTask.parentId } : {}),
        ...(rootTask.dependsOn !== undefined ? { dependsOn: rootTask.dependsOn } : {}),
        ...(rootTask.notes !== undefined ? { notes: rootTask.notes } : {}),
        ...(rootTask.validation !== undefined ? { validation: rootTask.validation } : {}),
        ...(rootTask.blocker !== undefined ? { blocker: rootTask.blocker } : {}),
        ...(rootTask.priority !== undefined ? { priority: rootTask.priority } : {}),
        ...(rootTask.mode !== undefined ? { mode: rootTask.mode } : {}),
        ...(rootTask.tier !== undefined ? { tier: rootTask.tier } : {}),
        ...(rootTask.acceptance !== undefined ? { acceptance: rootTask.acceptance } : {}),
        ...(rootTask.constraints !== undefined ? { constraints: rootTask.constraints } : {}),
        ...(rootTask.context !== undefined ? { context: rootTask.context } : {})
    };
    await (0, taskCreation_1.appendNormalizedTasksToFile)(taskFilePath, [rootTaskInput]);
    return (0, taskFile_1.parseTaskFile)(await fs.readFile(taskFilePath, 'utf8'));
}
/**
 * Write the pipeline run artifact to .ralph/artifacts/pipelines/<runId>.json.
 */
async function writePipelineArtifact(artifactDir, artifact) {
    const pipelinesDir = path.join(artifactDir, 'pipelines');
    await fs.mkdir(pipelinesDir, { recursive: true });
    const artifactPath = path.join(pipelinesDir, `${artifact.runId}.json`);
    await fs.writeFile(artifactPath, (0, integrity_1.stableJson)(artifact), 'utf8');
    return artifactPath;
}
/**
 * Orchestrate the full pipeline scaffold:
 * 1. Hash the PRD.
 * 2. Parse sections to derive child task titles.
 * 3. Add pipeline-root task to tasks.json.
 * 4. Add child tasks under the root.
 * 5. Write an initial pipeline artifact.
 * Returns the run artifact and the artifact file path.
 */
async function scaffoldPipelineRun(input) {
    const prdText = await fs.readFile(input.prdPath, 'utf8');
    const prdHash = (0, integrity_1.hashText)(prdText);
    const runId = buildPipelineRunId();
    const rootTaskId = `Tpipe-${runId.replace(/^pipeline-/, '')}`;
    const sections = parsePrdSections(prdText);
    const rootTask = buildPipelineRootTask(rootTaskId, runId);
    const childTasks = buildPipelineChildTasks(runId, rootTaskId, sections);
    const childTaskIds = childTasks.map((t) => t.id);
    await addPipelineRootTask(input.taskFilePath, rootTask);
    await (0, taskCreation_1.applySuggestedChildTasksToFile)(input.taskFilePath, rootTaskId, childTasks);
    const loopStartTime = new Date().toISOString();
    const orchestrationPaths = (0, orchestrationSupervisor_1.resolveOrchestrationPaths)(input.ralphDir, runId);
    const artifact = {
        schemaVersion: 1,
        kind: 'pipelineRun',
        runId,
        prdHash,
        prdPath: input.prdPath,
        rootTaskId,
        decomposedTaskIds: childTaskIds,
        loopStartTime,
        status: 'running',
        phase: 'scaffold',
        orchestrationGraphPath: orchestrationPaths.graphPath
    };
    const artifactPath = await writePipelineArtifact(input.artifactDir, artifact);
    return { artifact, artifactPath, rootTaskId, childTaskIds };
}
/**
 * Find and parse the most recent pipeline run artifact from
 * <artifactDir>/pipelines/<runId>.json.
 * Returns null when no artifacts exist or the directory is absent.
 */
async function readLatestPipelineArtifact(artifactDir) {
    const pipelinesDir = path.join(artifactDir, 'pipelines');
    let entries;
    try {
        entries = await fs.readdir(pipelinesDir);
    }
    catch {
        return null;
    }
    const jsonFiles = entries.filter((name) => name.endsWith('.json')).sort().reverse();
    for (const name of jsonFiles) {
        const artifactPath = path.join(pipelinesDir, name);
        try {
            const raw = await fs.readFile(artifactPath, 'utf8');
            const artifact = JSON.parse(raw);
            if (artifact.kind === 'pipelineRun' && typeof artifact.runId === 'string') {
                return { artifact, artifactPath };
            }
        }
        catch {
            // skip malformed files
        }
    }
    return null;
}
//# sourceMappingURL=pipeline.js.map