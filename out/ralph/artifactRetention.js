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
exports.repairLatestArtifactSurfaces = repairLatestArtifactSurfaces;
exports.cleanupProvenanceBundles = cleanupProvenanceBundles;
exports.inspectProvenanceBundleRetention = inspectProvenanceBundleRetention;
exports.cleanupGeneratedArtifacts = cleanupGeneratedArtifacts;
exports.previewGeneratedArtifactCleanup = previewGeneratedArtifactCleanup;
exports.previewProvenanceBundleCleanup = previewProvenanceBundleCleanup;
exports.inspectGeneratedArtifactRetention = inspectGeneratedArtifactRetention;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const fs_1 = require("../util/fs");
const artifactRendering_1 = require("./artifactRendering");
const artifactStore_1 = require("./artifactStore");
function sortByIterationDesc(left, right) {
    return right.iteration - left.iteration || right.name.localeCompare(left.name);
}
function retainedNamesByNewestAndProtected(entries, retentionCount, protectedNames, getName) {
    // Protection augments the newest-N retention window; it never displaces newer entries.
    const retained = new Set(entries.slice(0, retentionCount).map((entry) => getName(entry)));
    for (const name of protectedNames) {
        retained.add(name);
    }
    return retained;
}
function retentionDecisionByNewestAndProtected(entries, retentionCount, protectedNames, getName) {
    const newestWindowNames = new Set(entries.slice(0, retentionCount).map((entry) => getName(entry)));
    const retainedNames = retainedNamesByNewestAndProtected(entries, retentionCount, protectedNames, getName);
    const protectedRetainedNames = entries
        .filter((entry) => {
        const name = getName(entry);
        return retainedNames.has(name) && !newestWindowNames.has(name);
    })
        .map((entry) => getName(entry));
    return {
        retainedNames,
        protectedRetainedNames
    };
}
function parseIterationDirectoryName(name) {
    const match = /^iteration-(\d+)$/.exec(name);
    if (!match) {
        return null;
    }
    return {
        name,
        iteration: Number.parseInt(match[1], 10)
    };
}
function parsePromptFileName(name) {
    const match = /^.+-(\d+)\.prompt\.md$/.exec(name);
    if (!match) {
        return null;
    }
    return {
        name,
        iteration: Number.parseInt(match[1], 10)
    };
}
function parseRunArtifactFileName(name) {
    const match = /^(.+)-(\d+)\.(transcript|last-message)\.md$/.exec(name);
    if (!match) {
        return null;
    }
    return {
        name,
        baseName: `${match[1]}-${match[2]}`,
        iteration: Number.parseInt(match[2], 10)
    };
}
function parseHandoffFileName(name) {
    const match = /^.+-(\d+)\.json$/.exec(name);
    if (!match) {
        return null;
    }
    return {
        name,
        iteration: Number.parseInt(match[1], 10)
    };
}
function createProtectedGeneratedArtifacts() {
    return {
        iterationDirectories: new Set(),
        promptFiles: new Set(),
        runArtifactBaseNames: new Set()
    };
}
function isPathWithin(rootDir, targetPath) {
    if (!path.isAbsolute(targetPath)) {
        return false;
    }
    const relative = path.relative(rootDir, targetPath);
    return !relative.startsWith('..') && !path.isAbsolute(relative);
}
function readPathReference(record, key) {
    const value = record?.[key];
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}
function readRecordReference(record, key) {
    const value = record?.[key];
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value
        : null;
}
function compactPathReferences(references) {
    return references.filter((value) => Boolean(value));
}
function parsePromptEvidenceIdentity(record) {
    if (!record) {
        return null;
    }
    const kind = record.kind;
    const iteration = record.iteration;
    if ((kind !== 'bootstrap'
        && kind !== 'iteration'
        && kind !== 'replenish-backlog'
        && kind !== 'fix-failure'
        && kind !== 'continue-progress'
        && kind !== 'human-review-handoff')
        || typeof iteration !== 'number'
        || !Number.isFinite(iteration)
        || iteration < 1) {
        return null;
    }
    return {
        kind,
        iteration: Math.floor(iteration)
    };
}
function derivedLatestPromptEvidenceReferences(record, dirs) {
    const identity = parsePromptEvidenceIdentity(record);
    if (!identity) {
        return [];
    }
    const paddedIteration = String(identity.iteration).padStart(3, '0');
    return [
        path.join(dirs.artifactRootDir, `iteration-${paddedIteration}`),
        path.join(dirs.promptDir, `${identity.kind}-${paddedIteration}.prompt.md`)
    ];
}
function readRecordArray(record, key) {
    const value = record?.[key];
    if (!Array.isArray(value)) {
        return [];
    }
    return value.filter((candidate) => typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate));
}
function addProtectedGeneratedArtifactPath(protectedArtifacts, input) {
    const normalizedPath = path.normalize(input.targetPath);
    if (isPathWithin(input.artifactRootDir, normalizedPath)) {
        const relative = path.relative(input.artifactRootDir, normalizedPath);
        const [firstSegment] = relative.split(path.sep);
        if (firstSegment && parseIterationDirectoryName(firstSegment)) {
            protectedArtifacts.iterationDirectories.add(firstSegment);
        }
    }
    const baseName = path.basename(normalizedPath);
    if (isPathWithin(input.promptDir, normalizedPath)) {
        const parsedPrompt = parsePromptFileName(baseName);
        if (parsedPrompt) {
            protectedArtifacts.promptFiles.add(parsedPrompt.name);
        }
    }
    if (isPathWithin(input.runDir, normalizedPath)) {
        const parsedRunArtifact = parseRunArtifactFileName(baseName);
        if (parsedRunArtifact) {
            protectedArtifacts.runArtifactBaseNames.add(parsedRunArtifact.baseName);
        }
    }
}
function addProtectedGeneratedArtifactPaths(protectedArtifacts, input, targetPaths) {
    for (const targetPath of targetPaths) {
        addProtectedGeneratedArtifactPath(protectedArtifacts, {
            ...input,
            targetPath
        });
    }
}
function readStateRunReference(candidate) {
    if (!candidate) {
        return null;
    }
    const iteration = typeof candidate.iteration === 'number'
        && Number.isFinite(candidate.iteration)
        && candidate.iteration >= 1
        ? Math.floor(candidate.iteration)
        : null;
    const promptPath = readPathReference(candidate, 'promptPath');
    const transcriptPath = readPathReference(candidate, 'transcriptPath');
    const lastMessagePath = readPathReference(candidate, 'lastMessagePath');
    if (!promptPath && !transcriptPath && !lastMessagePath && iteration === null) {
        return null;
    }
    return {
        iteration,
        promptPath,
        transcriptPath,
        lastMessagePath
    };
}
function derivedIterationDirectoryPath(artifactRootDir, iteration) {
    return path.join(artifactRootDir, `iteration-${String(iteration).padStart(3, '0')}`);
}
function currentStateArtifactReferences(input) {
    if (!input.stateRecord) {
        return [];
    }
    const runHistory = readRecordArray(input.stateRecord, 'runHistory')
        .map((record) => readStateRunReference(record))
        .filter((record) => record !== null);
    const lastRun = readStateRunReference(readRecordReference(input.stateRecord, 'lastRun')) ?? runHistory.at(-1) ?? null;
    const effectiveRunHistory = lastRun ? [...runHistory, lastRun] : runHistory;
    const iterationHistory = readRecordArray(input.stateRecord, 'iterationHistory');
    const effectiveIterationHistory = iterationHistory.length > 0
        ? iterationHistory
        : effectiveRunHistory.flatMap((runRecord) => {
            if (runRecord.iteration === null) {
                return [];
            }
            return [{
                    artifactDir: derivedIterationDirectoryPath(input.artifactRootDir, runRecord.iteration),
                    promptPath: runRecord.promptPath,
                    execution: {
                        transcriptPath: runRecord.transcriptPath,
                        lastMessagePath: runRecord.lastMessagePath
                    }
                }];
        });
    const lastIteration = readRecordReference(input.stateRecord, 'lastIteration') ?? effectiveIterationHistory.at(-1) ?? null;
    const lastIterationExecution = readRecordReference(lastIteration, 'execution');
    const references = compactPathReferences([
        readPathReference(input.stateRecord, 'lastPromptPath'),
        readPathReference(lastRun, 'promptPath'),
        readPathReference(lastRun, 'transcriptPath'),
        readPathReference(lastRun, 'lastMessagePath'),
        readPathReference(lastIteration, 'artifactDir'),
        readPathReference(lastIteration, 'promptPath'),
        readPathReference(lastIterationExecution, 'transcriptPath'),
        readPathReference(lastIterationExecution, 'lastMessagePath')
    ]);
    if (input.includeHistory ?? true) {
        for (const runRecord of runHistory) {
            references.push(...compactPathReferences([
                readPathReference(runRecord, 'promptPath'),
                readPathReference(runRecord, 'transcriptPath'),
                readPathReference(runRecord, 'lastMessagePath')
            ]));
        }
        for (const iterationRecord of effectiveIterationHistory) {
            const executionRecord = readRecordReference(iterationRecord, 'execution');
            references.push(...compactPathReferences([
                readPathReference(iterationRecord, 'artifactDir'),
                readPathReference(iterationRecord, 'promptPath'),
                readPathReference(executionRecord, 'transcriptPath'),
                readPathReference(executionRecord, 'lastMessagePath')
            ]));
        }
    }
    return references;
}
function latestArtifactReferences(records, dirs) {
    const latestResultReferenceFields = artifactStore_1.PROTECTED_GENERATED_LATEST_POINTER_REFERENCES['latest-result.json'];
    const latestPreflightReferenceFields = artifactStore_1.PROTECTED_GENERATED_LATEST_POINTER_REFERENCES['latest-preflight-report.json'];
    const latestExecutionPlanReferenceFields = artifactStore_1.PROTECTED_GENERATED_LATEST_POINTER_REFERENCES['latest-execution-plan.json'];
    const latestCliInvocationReferenceFields = artifactStore_1.PROTECTED_GENERATED_LATEST_POINTER_REFERENCES['latest-cli-invocation.json'];
    const latestProvenanceBundleReferenceFields = artifactStore_1.PROTECTED_GENERATED_LATEST_POINTER_REFERENCES['latest-provenance-bundle.json'];
    const latestProvenanceFailureReferenceFields = artifactStore_1.PROTECTED_GENERATED_LATEST_POINTER_REFERENCES['latest-provenance-failure.json'];
    return compactPathReferences([
        ...latestResultReferenceFields.map((field) => readPathReference(records.latestResult, field)),
        ...latestPreflightReferenceFields.map((field) => readPathReference(records.latestPreflightReport, field)),
        ...latestExecutionPlanReferenceFields.map((field) => readPathReference(records.latestExecutionPlan, field)),
        ...latestCliInvocationReferenceFields.map((field) => readPathReference(records.latestCliInvocation, field)),
        ...latestProvenanceBundleReferenceFields.map((field) => readPathReference(records.latestProvenanceBundle, field)),
        ...latestProvenanceFailureReferenceFields.map((field) => readPathReference(records.latestProvenanceFailure, field)),
        ...derivedLatestPromptEvidenceReferences(records.latestPromptEvidence, dirs),
        ...derivedLatestSurfaceReferences({
            artifactRootDir: dirs.artifactRootDir,
            latestSummaryText: records.latestSummaryText,
            latestPreflightSummaryText: records.latestPreflightSummaryText,
            latestProvenanceSummaryText: records.latestProvenanceSummaryText
        })
    ]);
}
function parseIterationFromLatestSurface(raw) {
    if (!raw) {
        return null;
    }
    const headingMatch = /^# Ralph (?:Iteration|Preflight|Provenance Failure) (\d+)\s*$/m.exec(raw);
    if (headingMatch) {
        return Number.parseInt(headingMatch[1], 10);
    }
    const bulletMatch = /^- Iteration:\s+(\d+)\s*$/m.exec(raw);
    if (bulletMatch) {
        return Number.parseInt(bulletMatch[1], 10);
    }
    return null;
}
function parseArtifactPathsFromLatestSurface(raw) {
    if (!raw) {
        return [];
    }
    const pathLabels = new Set([
        'Prompt',
        'Report',
        'Preflight report',
        'Preflight summary',
        'Iteration artifact dir'
    ]);
    const extractedPaths = [];
    for (const line of raw.split(/\r?\n/u)) {
        const match = /^- ([^:]+):\s+(.+?)\s*$/.exec(line);
        if (!match || !pathLabels.has(match[1])) {
            continue;
        }
        extractedPaths.push(match[2].trim());
    }
    return extractedPaths;
}
function derivedLatestSurfaceReferences(input) {
    const surfaces = [
        input.latestSummaryText,
        input.latestPreflightSummaryText,
        input.latestProvenanceSummaryText
    ];
    const iterations = surfaces
        .map((surface) => parseIterationFromLatestSurface(surface))
        .filter((value) => value !== null);
    const artifactPaths = surfaces.flatMap((surface) => parseArtifactPathsFromLatestSurface(surface));
    return [
        ...artifactPaths,
        ...iterations.map((iteration) => derivedIterationDirectoryPath(input.artifactRootDir, iteration))
    ];
}
async function cleanupStaleLatestProvenanceFailurePointer(artifactRootDir) {
    const latestPaths = (0, artifactStore_1.resolveLatestArtifactPaths)(artifactRootDir);
    const latestProvenanceFailureRecord = await (0, fs_1.readJsonRecord)(latestPaths.latestProvenanceFailurePath);
    if (!latestProvenanceFailureRecord) {
        return;
    }
    const referencedPaths = artifactStore_1.PROTECTED_GENERATED_LATEST_POINTER_REFERENCES['latest-provenance-failure.json']
        .map((field) => readPathReference(latestProvenanceFailureRecord, field))
        .filter((targetPath) => Boolean(targetPath));
    if (referencedPaths.length === 0) {
        return;
    }
    const hasMissingReferences = (await Promise.all(referencedPaths.map(async (targetPath) => await (0, fs_1.pathExists)(targetPath) ? null : targetPath))).some((targetPath) => targetPath !== null);
    if (!hasMissingReferences) {
        return;
    }
    await fs.rm(latestPaths.latestProvenanceFailurePath, { force: true });
}
async function readTextRecord(target) {
    try {
        return await fs.readFile(target, 'utf8');
    }
    catch {
        return null;
    }
}
async function resolveProtectedBundleIds(artifactRootDir) {
    const latestPaths = (0, artifactStore_1.resolveLatestArtifactPaths)(artifactRootDir);
    const records = await Promise.all([
        (0, fs_1.readJsonRecord)(latestPaths.latestResultPath),
        (0, fs_1.readJsonRecord)(latestPaths.latestPreflightReportPath),
        (0, fs_1.readJsonRecord)(latestPaths.latestPromptEvidencePath),
        (0, fs_1.readJsonRecord)(latestPaths.latestExecutionPlanPath),
        (0, fs_1.readJsonRecord)(latestPaths.latestCliInvocationPath),
        (0, fs_1.readJsonRecord)(latestPaths.latestProvenanceBundlePath),
        (0, fs_1.readJsonRecord)(latestPaths.latestProvenanceFailurePath)
    ]);
    return new Set(records
        .map((record) => (0, artifactRendering_1.provenanceIdFromRecord)(record))
        .filter((value) => Boolean(value)));
}
async function repairLatestArtifactSurfaces(artifactRootDir) {
    const latestPaths = (0, artifactStore_1.resolveLatestArtifactPaths)(artifactRootDir);
    const repairedLatestArtifactPaths = [];
    const staleLatestArtifactPaths = [];
    const [latestResultExists, latestSummaryExists, latestPreflightReportRecord, latestPreflightSummaryExists, latestProvenanceBundleRecord, latestProvenanceSummaryExists] = await Promise.all([
        (0, fs_1.pathExists)(latestPaths.latestResultPath),
        (0, fs_1.pathExists)(latestPaths.latestSummaryPath),
        (0, fs_1.readJsonRecord)(latestPaths.latestPreflightReportPath),
        (0, fs_1.pathExists)(latestPaths.latestPreflightSummaryPath),
        (0, fs_1.readJsonRecord)(latestPaths.latestProvenanceBundlePath),
        (0, fs_1.pathExists)(latestPaths.latestProvenanceSummaryPath)
    ]);
    if (!latestSummaryExists && latestResultExists) {
        const latestResultRecord = await (0, fs_1.readJsonRecord)(latestPaths.latestResultPath);
        const repairedSummary = (0, artifactRendering_1.looksLikePreflightRecord)(latestResultRecord)
            ? (0, artifactRendering_1.renderPreflightSummary)(latestResultRecord)
            : (0, artifactRendering_1.looksLikeIntegrityFailure)(latestResultRecord)
                ? (0, artifactRendering_1.renderIntegrityFailureSummary)(latestResultRecord)
                : latestResultRecord
                    ? (0, artifactRendering_1.renderLatestResultSummary)(latestResultRecord)
                    : null;
        if (repairedSummary) {
            await fs.writeFile(latestPaths.latestSummaryPath, `${repairedSummary.trimEnd()}\n`, 'utf8');
            repairedLatestArtifactPaths.push(latestPaths.latestSummaryPath);
        }
        else {
            staleLatestArtifactPaths.push(latestPaths.latestSummaryPath);
        }
    }
    if (!latestPreflightSummaryExists && (0, artifactRendering_1.looksLikePreflightRecord)(latestPreflightReportRecord)) {
        const repairedSummary = (0, artifactRendering_1.renderPreflightSummary)(latestPreflightReportRecord);
        await fs.writeFile(latestPaths.latestPreflightSummaryPath, `${repairedSummary.trimEnd()}\n`, 'utf8');
        repairedLatestArtifactPaths.push(latestPaths.latestPreflightSummaryPath);
    }
    else if (!latestPreflightSummaryExists && latestPreflightReportRecord) {
        staleLatestArtifactPaths.push(latestPaths.latestPreflightSummaryPath);
    }
    if (!latestProvenanceSummaryExists && (0, artifactRendering_1.looksLikeProvenanceBundle)(latestProvenanceBundleRecord)) {
        const repairedSummary = (0, artifactRendering_1.renderProvenanceSummary)(latestProvenanceBundleRecord);
        await fs.writeFile(latestPaths.latestProvenanceSummaryPath, `${repairedSummary.trimEnd()}\n`, 'utf8');
        repairedLatestArtifactPaths.push(latestPaths.latestProvenanceSummaryPath);
    }
    else if (!latestProvenanceSummaryExists && latestProvenanceBundleRecord) {
        staleLatestArtifactPaths.push(latestPaths.latestProvenanceSummaryPath);
    }
    return {
        repairedLatestArtifactPaths,
        staleLatestArtifactPaths
    };
}
async function resolveProtectedGeneratedArtifacts(input) {
    const latestPaths = (0, artifactStore_1.resolveLatestArtifactPaths)(input.artifactRootDir);
    const [stateRecord, latestResult, latestPreflightReport, latestPromptEvidence, latestExecutionPlan, latestCliInvocation, latestProvenanceBundle, latestProvenanceFailure, latestSummaryText, latestPreflightSummaryText, latestProvenanceSummaryText] = await Promise.all([
        (0, fs_1.readJsonRecord)(input.stateFilePath),
        (0, fs_1.readJsonRecord)(latestPaths.latestResultPath),
        (0, fs_1.readJsonRecord)(latestPaths.latestPreflightReportPath),
        (0, fs_1.readJsonRecord)(latestPaths.latestPromptEvidencePath),
        (0, fs_1.readJsonRecord)(latestPaths.latestExecutionPlanPath),
        (0, fs_1.readJsonRecord)(latestPaths.latestCliInvocationPath),
        (0, fs_1.readJsonRecord)(latestPaths.latestProvenanceBundlePath),
        (0, fs_1.readJsonRecord)(latestPaths.latestProvenanceFailurePath),
        readTextRecord(latestPaths.latestSummaryPath),
        readTextRecord(latestPaths.latestPreflightSummaryPath),
        readTextRecord(latestPaths.latestProvenanceSummaryPath)
    ]);
    const protectedArtifacts = createProtectedGeneratedArtifacts();
    const pathInput = {
        artifactRootDir: input.artifactRootDir,
        promptDir: input.promptDir,
        runDir: input.runDir
    };
    addProtectedGeneratedArtifactPaths(protectedArtifacts, pathInput, currentStateArtifactReferences({
        stateRecord,
        artifactRootDir: input.artifactRootDir,
        includeHistory: (input.protectionScope ?? 'fullStateAndLatest') === 'fullStateAndLatest'
    }));
    addProtectedGeneratedArtifactPaths(protectedArtifacts, pathInput, latestArtifactReferences({
        latestResult,
        latestPreflightReport,
        latestPromptEvidence,
        latestExecutionPlan,
        latestCliInvocation,
        latestProvenanceBundle,
        latestProvenanceFailure,
        latestSummaryText,
        latestPreflightSummaryText,
        latestProvenanceSummaryText
    }, pathInput));
    return protectedArtifacts;
}
async function collectProvenanceBundleRetentionInspection(input) {
    const runsDir = path.join(input.artifactRootDir, 'runs');
    const entries = await fs.readdir(runsDir, { withFileTypes: true }).catch(() => []);
    const bundleIds = entries
        .filter((entry) => entry.isDirectory() && entry.name.startsWith('run-'))
        .map((entry) => entry.name)
        .sort((left, right) => right.localeCompare(left));
    const protectedIds = Array.from(await resolveProtectedBundleIds(input.artifactRootDir)).sort();
    const retainedIds = new Set(input.retentionCount <= 0 ? bundleIds : bundleIds.slice(0, input.retentionCount));
    protectedIds.forEach((bundleId) => retainedIds.add(bundleId));
    return {
        bundleIds,
        retainedBundleIds: bundleIds.filter((bundleId) => retainedIds.has(bundleId)),
        protectedBundleIds: protectedIds
    };
}
async function collectGeneratedArtifactRetentionInspection(input) {
    const watchdogDir = path.join(input.artifactRootDir, 'watchdog');
    const [artifactEntries, promptEntries, runEntries, protectedArtifacts, watchdogEntries] = await Promise.all([
        fs.readdir(input.artifactRootDir, { withFileTypes: true }).catch(() => []),
        fs.readdir(input.promptDir, { withFileTypes: true }).catch(() => []),
        fs.readdir(input.runDir, { withFileTypes: true }).catch(() => []),
        resolveProtectedGeneratedArtifacts({
            artifactRootDir: input.artifactRootDir,
            promptDir: input.promptDir,
            runDir: input.runDir,
            stateFilePath: input.stateFilePath,
            protectionScope: input.protectionScope
        }),
        fs.readdir(watchdogDir, { withFileTypes: true }).catch(() => [])
    ]);
    const handoffEntries = input.handoffDir
        ? await fs.readdir(input.handoffDir, { withFileTypes: true }).catch(() => [])
        : [];
    // Retention scanning is limited to iteration-NNN directories by parseIterationDirectoryName.
    // Directories that do not match iteration-NNN (e.g. <parentTaskId>/ directories that hold
    // plan-graph.json and replan-N.json artifacts, as well as 'runs', 'watchdog', and
    // 'orchestration') are never included in iterationDirectories and are therefore already
    // excluded from deletion — no additional guard is required for those paths.
    const iterationDirectories = artifactEntries
        .filter((entry) => entry.isDirectory())
        .map((entry) => parseIterationDirectoryName(entry.name))
        .filter((entry) => entry !== null)
        .sort(sortByIterationDesc);
    const promptFiles = promptEntries
        .filter((entry) => entry.isFile())
        .map((entry) => parsePromptFileName(entry.name))
        .filter((entry) => entry !== null)
        .sort(sortByIterationDesc);
    const runArtifactGroups = new Map();
    for (const entry of runEntries.filter((candidate) => candidate.isFile())) {
        const parsed = parseRunArtifactFileName(entry.name);
        if (!parsed) {
            continue;
        }
        const current = runArtifactGroups.get(parsed.baseName);
        if (current) {
            current.fileNames.push(parsed.name);
            continue;
        }
        runArtifactGroups.set(parsed.baseName, {
            baseName: parsed.baseName,
            iteration: parsed.iteration,
            fileNames: [parsed.name]
        });
    }
    const runArtifacts = Array.from(runArtifactGroups.values()).sort((left, right) => right.iteration - left.iteration || right.baseName.localeCompare(left.baseName));
    const handoffFiles = handoffEntries
        .filter((entry) => entry.isFile())
        .map((entry) => parseHandoffFileName(entry.name))
        .filter((entry) => entry !== null)
        .sort(sortByIterationDesc);
    const watchdogFiles = watchdogEntries
        .filter((entry) => entry.isFile())
        .map((entry) => parseHandoffFileName(entry.name))
        .filter((entry) => entry !== null)
        .sort(sortByIterationDesc);
    const effectiveRetentionCount = input.retentionCount <= 0
        ? Math.max(iterationDirectories.length, promptFiles.length, runArtifacts.length, handoffFiles.length, watchdogFiles.length)
        : input.retentionCount;
    return {
        iterationDirectories,
        promptFiles,
        runArtifacts,
        handoffFiles,
        watchdogFiles,
        protectedArtifacts,
        iterationDirectoryDecision: retentionDecisionByNewestAndProtected(iterationDirectories, effectiveRetentionCount, protectedArtifacts.iterationDirectories, (entry) => entry.name),
        promptFileDecision: retentionDecisionByNewestAndProtected(promptFiles, effectiveRetentionCount, protectedArtifacts.promptFiles, (entry) => entry.name),
        runArtifactDecision: retentionDecisionByNewestAndProtected(runArtifacts, effectiveRetentionCount, protectedArtifacts.runArtifactBaseNames, (entry) => entry.baseName),
        handoffFileDecision: {
            retainedNames: retainedNamesByNewestAndProtected(handoffFiles, effectiveRetentionCount, [], (entry) => entry.name)
        },
        watchdogFileDecision: {
            retainedNames: retainedNamesByNewestAndProtected(watchdogFiles, effectiveRetentionCount, [], (entry) => entry.name)
        }
    };
}
/**
 * Pure selection of the provenance bundle ids beyond `retentionCount` that are
 * not retained (`[]` when `retentionCount <= 0`). Shared by the live cleanup and
 * the dry-run preview so the two can never drift.
 */
function selectDeletableBundleIds(inspection, retentionCount) {
    if (retentionCount <= 0) {
        return [];
    }
    const retainedIds = new Set(inspection.retainedBundleIds);
    return inspection.bundleIds.slice(retentionCount).filter((bundleId) => !retainedIds.has(bundleId));
}
async function cleanupProvenanceBundles(input) {
    const inspection = await collectProvenanceBundleRetentionInspection(input);
    const deletedBundleIds = selectDeletableBundleIds(inspection, input.retentionCount);
    const runsDir = path.join(input.artifactRootDir, 'runs');
    for (const bundleId of deletedBundleIds) {
        await fs.rm(path.join(runsDir, bundleId), { recursive: true, force: true });
    }
    return {
        deletedBundleIds,
        retainedBundleIds: inspection.retainedBundleIds,
        protectedBundleIds: inspection.protectedBundleIds
    };
}
async function inspectProvenanceBundleRetention(input) {
    const inspection = await collectProvenanceBundleRetentionInspection(input);
    return {
        deletedBundleIds: [],
        retainedBundleIds: inspection.retainedBundleIds,
        protectedBundleIds: inspection.protectedBundleIds
    };
}
/**
 * Pure selection: of `ordered` (newest-first), the entries beyond `retentionCount`
 * that are not retained and pass the optional `guard`. Returns `[]` when
 * `retentionCount <= 0` (retain everything). Shared by the live cleanup and the
 * dry-run preview so the two can never drift.
 */
function selectDeletableEntries(ordered, retentionCount, retained, nameOf, guard) {
    if (retentionCount <= 0) {
        return [];
    }
    return ordered
        .slice(retentionCount)
        .filter((entry) => !retained.has(nameOf(entry)) && (!guard || guard(entry)));
}
/**
 * Computes the generated-artifact cleanup plan (what would be deleted/retained/
 * protected) from an inspection, without touching disk. `cleanupGeneratedArtifacts`
 * executes this exact plan; `previewGeneratedArtifactCleanup` returns it unexecuted.
 */
function buildGeneratedArtifactCleanupPlan(inspection, retentionCount, includeHandoff) {
    const summary = {
        // Iteration directories carry the iteration-NNN guard so non-iteration
        // directories (parentTaskId/, runs/, watchdog/, orchestration/) are never deleted.
        deletedIterationDirectories: selectDeletableEntries(inspection.iterationDirectories, retentionCount, inspection.iterationDirectoryDecision.retainedNames, (entry) => entry.name, (entry) => parseIterationDirectoryName(entry.name) !== null).map((entry) => entry.name),
        retainedIterationDirectories: inspection.iterationDirectories
            .filter((entry) => inspection.iterationDirectoryDecision.retainedNames.has(entry.name))
            .map((entry) => entry.name),
        protectedRetainedIterationDirectories: inspection.iterationDirectoryDecision.protectedRetainedNames,
        deletedPromptFiles: selectDeletableEntries(inspection.promptFiles, retentionCount, inspection.promptFileDecision.retainedNames, (entry) => entry.name).map((entry) => entry.name),
        retainedPromptFiles: inspection.promptFiles
            .filter((entry) => inspection.promptFileDecision.retainedNames.has(entry.name))
            .map((entry) => entry.name),
        protectedRetainedPromptFiles: inspection.promptFileDecision.protectedRetainedNames,
        deletedRunArtifactBaseNames: selectDeletableEntries(inspection.runArtifacts, retentionCount, inspection.runArtifactDecision.retainedNames, (entry) => entry.baseName).map((entry) => entry.baseName),
        retainedRunArtifactBaseNames: inspection.runArtifacts
            .filter((entry) => inspection.runArtifactDecision.retainedNames.has(entry.baseName))
            .map((entry) => entry.baseName),
        protectedRetainedRunArtifactBaseNames: inspection.runArtifactDecision.protectedRetainedNames,
        deletedWatchdogFiles: selectDeletableEntries(inspection.watchdogFiles, retentionCount, inspection.watchdogFileDecision.retainedNames, (entry) => entry.name).map((entry) => entry.name),
        retainedWatchdogFiles: inspection.watchdogFiles
            .filter((entry) => inspection.watchdogFileDecision.retainedNames.has(entry.name))
            .map((entry) => entry.name)
    };
    if (includeHandoff) {
        summary.deletedHandoffFiles = selectDeletableEntries(inspection.handoffFiles, retentionCount, inspection.handoffFileDecision.retainedNames, (entry) => entry.name).map((entry) => entry.name);
        summary.retainedHandoffFiles = inspection.handoffFiles
            .filter((entry) => inspection.handoffFileDecision.retainedNames.has(entry.name))
            .map((entry) => entry.name);
    }
    return summary;
}
async function cleanupGeneratedArtifacts(input) {
    if (input.retentionCount <= 0) {
        await cleanupStaleLatestProvenanceFailurePointer(input.artifactRootDir);
        const summary = {
            deletedIterationDirectories: [],
            retainedIterationDirectories: [],
            protectedRetainedIterationDirectories: [],
            deletedPromptFiles: [],
            retainedPromptFiles: [],
            protectedRetainedPromptFiles: [],
            deletedRunArtifactBaseNames: [],
            retainedRunArtifactBaseNames: [],
            protectedRetainedRunArtifactBaseNames: [],
            deletedWatchdogFiles: [],
            retainedWatchdogFiles: []
        };
        if (input.handoffDir) {
            summary.deletedHandoffFiles = [];
            summary.retainedHandoffFiles = [];
        }
        return summary;
    }
    const inspection = await collectGeneratedArtifactRetentionInspection(input);
    const plan = buildGeneratedArtifactCleanupPlan(inspection, input.retentionCount, Boolean(input.handoffDir));
    // Execute the plan. Each loop deletes exactly the entries the plan selected, so
    // the returned summary == the plan a preview would have reported.
    for (const name of plan.deletedIterationDirectories) {
        await fs.rm(path.join(input.artifactRootDir, name), { recursive: true, force: true });
    }
    for (const name of plan.deletedPromptFiles) {
        await fs.rm(path.join(input.promptDir, name), { force: true });
    }
    const runArtifactsByBaseName = new Map(inspection.runArtifacts.map((entry) => [entry.baseName, entry]));
    for (const baseName of plan.deletedRunArtifactBaseNames) {
        const entry = runArtifactsByBaseName.get(baseName);
        if (entry) {
            await Promise.all(entry.fileNames.map((fileName) => fs.rm(path.join(input.runDir, fileName), { force: true })));
        }
    }
    if (input.handoffDir) {
        for (const name of plan.deletedHandoffFiles ?? []) {
            await fs.rm(path.join(input.handoffDir, name), { force: true });
        }
    }
    const watchdogDir = path.join(input.artifactRootDir, 'watchdog');
    for (const name of plan.deletedWatchdogFiles ?? []) {
        await fs.rm(path.join(watchdogDir, name), { force: true });
    }
    await cleanupStaleLatestProvenanceFailurePointer(input.artifactRootDir);
    return plan;
}
/**
 * Dry-run of {@link cleanupGeneratedArtifacts}: returns the same summary shape
 * with `deleted*` populated with what *would* be deleted, without touching disk.
 */
async function previewGeneratedArtifactCleanup(input) {
    const inspection = await collectGeneratedArtifactRetentionInspection(input);
    return buildGeneratedArtifactCleanupPlan(inspection, input.retentionCount, Boolean(input.handoffDir));
}
/**
 * Dry-run of {@link cleanupProvenanceBundles}: returns the bundle ids that would
 * be deleted (mirroring the cleanup selection) without touching disk.
 */
async function previewProvenanceBundleCleanup(input) {
    const inspection = await collectProvenanceBundleRetentionInspection(input);
    return {
        deletedBundleIds: selectDeletableBundleIds(inspection, input.retentionCount),
        retainedBundleIds: inspection.retainedBundleIds,
        protectedBundleIds: inspection.protectedBundleIds
    };
}
async function inspectGeneratedArtifactRetention(input) {
    const inspection = await collectGeneratedArtifactRetentionInspection(input);
    const summary = {
        deletedIterationDirectories: [],
        retainedIterationDirectories: inspection.iterationDirectories
            .filter((entry) => inspection.iterationDirectoryDecision.retainedNames.has(entry.name))
            .map((entry) => entry.name),
        protectedRetainedIterationDirectories: inspection.iterationDirectoryDecision.protectedRetainedNames,
        deletedPromptFiles: [],
        retainedPromptFiles: inspection.promptFiles
            .filter((entry) => inspection.promptFileDecision.retainedNames.has(entry.name))
            .map((entry) => entry.name),
        protectedRetainedPromptFiles: inspection.promptFileDecision.protectedRetainedNames,
        deletedRunArtifactBaseNames: [],
        retainedRunArtifactBaseNames: inspection.runArtifacts
            .filter((entry) => inspection.runArtifactDecision.retainedNames.has(entry.baseName))
            .map((entry) => entry.baseName),
        protectedRetainedRunArtifactBaseNames: inspection.runArtifactDecision.protectedRetainedNames
    };
    if (input.handoffDir) {
        summary.deletedHandoffFiles = [];
        summary.retainedHandoffFiles = inspection.handoffFiles
            .filter((entry) => inspection.handoffFileDecision.retainedNames.has(entry.name))
            .map((entry) => entry.name);
    }
    summary.deletedWatchdogFiles = [];
    summary.retainedWatchdogFiles = inspection.watchdogFiles
        .filter((entry) => inspection.watchdogFileDecision.retainedNames.has(entry.name))
        .map((entry) => entry.name);
    return summary;
}
//# sourceMappingURL=artifactRetention.js.map