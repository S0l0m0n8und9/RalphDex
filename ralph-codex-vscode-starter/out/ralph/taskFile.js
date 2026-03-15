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
exports.withTaskFileLock = withTaskFileLock;
exports.inspectTaskGraph = inspectTaskGraph;
exports.inspectTaskFileText = inspectTaskFileText;
exports.createDefaultTaskFile = createDefaultTaskFile;
exports.parseTaskFile = parseTaskFile;
exports.normalizeTaskFileText = normalizeTaskFileText;
exports.stringifyTaskFile = stringifyTaskFile;
exports.countTaskStatuses = countTaskStatuses;
exports.listSelectableTasks = listSelectableTasks;
exports.selectNextTask = selectNextTask;
exports.autoCompleteSatisfiedAncestors = autoCompleteSatisfiedAncestors;
exports.findTaskById = findTaskById;
exports.applySuggestedChildTasks = applySuggestedChildTasks;
exports.remainingSubtasks = remainingSubtasks;
exports.acquireClaim = acquireClaim;
exports.releaseClaim = releaseClaim;
exports.inspectClaimOwnership = inspectClaimOwnership;
exports.inspectTaskClaimGraph = inspectTaskClaimGraph;
const fs = __importStar(require("node:fs/promises"));
const path = __importStar(require("node:path"));
const EMPTY_COUNTS = {
    todo: 0,
    in_progress: 0,
    blocked: 0,
    done: 0
};
const DEFAULT_CLAIM_TTL_MS = 1000 * 60 * 60 * 24;
const DEFAULT_LOCK_RETRY_COUNT = 10;
const DEFAULT_LOCK_RETRY_DELAY_MS = 25;
const SUPPORTED_TASK_FIELDS = new Set([
    'id',
    'title',
    'status',
    'parentId',
    'dependsOn',
    'notes',
    'validation',
    'blocker'
]);
const LIKELY_TASK_FIELD_MISTAKES = new Map([
    ['dependencies', 'dependsOn'],
    ['dependency', 'dependsOn'],
    ['dependson', 'dependsOn'],
    ['depends_on', 'dependsOn']
]);
function isTaskStatus(value) {
    return value === 'todo' || value === 'in_progress' || value === 'blocked' || value === 'done';
}
function sleep(delayMs) {
    return new Promise((resolve) => setTimeout(resolve, delayMs));
}
function normalizeClaimStatus(value) {
    return value === 'active' || value === 'released' || value === 'stale'
        ? value
        : 'active';
}
function normalizeClaim(candidate) {
    if (typeof candidate !== 'object' || candidate === null) {
        return null;
    }
    const record = candidate;
    if (typeof record.agentId !== 'string'
        || typeof record.taskId !== 'string'
        || typeof record.claimedAt !== 'string'
        || typeof record.provenanceId !== 'string') {
        return null;
    }
    return {
        agentId: record.agentId,
        taskId: record.taskId,
        claimedAt: record.claimedAt,
        provenanceId: record.provenanceId,
        status: normalizeClaimStatus(record.status)
    };
}
function createDefaultTaskClaimFile() {
    return {
        version: 1,
        claims: []
    };
}
function stringifyTaskClaimFile(claimFile) {
    return `${JSON.stringify(claimFile, null, 2)}\n`;
}
async function readTaskClaimFile(claimFilePath) {
    let raw = '';
    try {
        raw = await fs.readFile(claimFilePath, 'utf8');
    }
    catch (error) {
        const code = typeof error === 'object' && error !== null && 'code' in error
            ? String(error.code)
            : '';
        if (code === 'ENOENT') {
            return createDefaultTaskClaimFile();
        }
        throw error;
    }
    if (!raw.trim()) {
        return createDefaultTaskClaimFile();
    }
    const parsed = JSON.parse(raw);
    const claims = Array.isArray(parsed.claims)
        ? parsed.claims
            .map((claim) => normalizeClaim(claim))
            .filter((claim) => claim !== null)
        : [];
    return {
        version: 1,
        claims
    };
}
function claimIdentityMatches(left, right) {
    return left.taskId === right.taskId
        && left.agentId === right.agentId
        && left.provenanceId === right.provenanceId
        && left.claimedAt === right.claimedAt;
}
function isIdeHandoffProvenance(provenanceId) {
    return /^run-i\d+-ide-/.test(provenanceId);
}
function claimRecordMatches(left, right) {
    return claimIdentityMatches(left, right)
        && left.status === right.status;
}
function findClaim(claimFile, candidate) {
    return claimFile.claims.find((claim) => claimRecordMatches(claim, candidate)) ?? null;
}
function resolveClaimTtlMs(options) {
    return Math.max(0, Math.floor(options?.ttlMs ?? DEFAULT_CLAIM_TTL_MS));
}
function claimIsStale(claim, ttlMs, now) {
    if (claim.status !== 'active') {
        return false;
    }
    if (ttlMs === 0) {
        return false;
    }
    const claimedAt = Date.parse(claim.claimedAt);
    if (Number.isNaN(claimedAt)) {
        return false;
    }
    return now.getTime() - claimedAt > ttlMs;
}
function describeClaim(claim, options) {
    if (!claim) {
        return null;
    }
    const now = options?.now ?? new Date();
    return {
        claim,
        stale: claimIsStale(claim, resolveClaimTtlMs(options), now)
    };
}
function activeClaimsForTask(claimFile, taskId) {
    return claimFile.claims.filter((claim) => claim.taskId === taskId && claim.status === 'active');
}
function canonicalClaimForTask(claimFile, taskId) {
    const activeClaims = activeClaimsForTask(claimFile, taskId);
    return activeClaims.length > 0 ? activeClaims[activeClaims.length - 1] : null;
}
function taskIdsWithActiveClaims(claimFile) {
    return [...new Set(claimFile.claims
            .filter((claim) => claim.status === 'active')
            .map((claim) => claim.taskId))].sort((left, right) => left.localeCompare(right));
}
async function writeTaskClaimFile(claimFilePath, claimFile) {
    const directoryPath = path.dirname(claimFilePath);
    const tempFilePath = path.join(directoryPath, `${path.basename(claimFilePath)}.${process.pid}.${Date.now()}.tmp`);
    const contents = stringifyTaskClaimFile(claimFile);
    await fs.mkdir(directoryPath, { recursive: true });
    let tempHandle = null;
    try {
        tempHandle = await fs.open(tempFilePath, 'w');
        await tempHandle.writeFile(contents, 'utf8');
        await tempHandle.sync();
        await tempHandle.close();
        tempHandle = null;
        await fs.rm(claimFilePath, { force: true });
        await fs.rename(tempFilePath, claimFilePath);
    }
    finally {
        if (tempHandle) {
            await tempHandle.close().catch(() => undefined);
        }
        await fs.rm(tempFilePath, { force: true }).catch(() => undefined);
    }
}
async function withClaimFileLock(claimFilePath, options, fn) {
    const lockPath = `${claimFilePath}.lock`;
    const retryCount = Math.max(0, Math.floor(options?.lockRetryCount ?? DEFAULT_LOCK_RETRY_COUNT));
    const retryDelayMs = Math.max(0, Math.floor(options?.lockRetryDelayMs ?? DEFAULT_LOCK_RETRY_DELAY_MS));
    for (let attempt = 0;; attempt += 1) {
        let handle = null;
        try {
            await fs.mkdir(path.dirname(lockPath), { recursive: true });
            handle = await fs.open(lockPath, 'wx');
            try {
                return await fn();
            }
            finally {
                await handle.close();
                await fs.rm(lockPath, { force: true });
            }
        }
        catch (error) {
            if (handle) {
                await handle.close().catch(() => undefined);
            }
            const code = typeof error === 'object' && error !== null && 'code' in error
                ? String(error.code)
                : '';
            if (code !== 'EEXIST' || attempt >= retryCount) {
                throw error;
            }
            await sleep(retryDelayMs);
        }
    }
}
async function withTaskFileLock(taskFilePath, options, fn) {
    const lockPath = path.join(path.dirname(taskFilePath), 'tasks.lock');
    const retryCount = Math.max(0, Math.floor(options?.lockRetryCount ?? DEFAULT_LOCK_RETRY_COUNT));
    const retryDelayMs = Math.max(0, Math.floor(options?.lockRetryDelayMs ?? DEFAULT_LOCK_RETRY_DELAY_MS));
    for (let attempt = 0;; attempt += 1) {
        let handle = null;
        try {
            await fs.mkdir(path.dirname(lockPath), { recursive: true });
            handle = await fs.open(lockPath, 'wx');
            try {
                return {
                    outcome: 'ok',
                    value: await fn()
                };
            }
            finally {
                await handle.close();
                await fs.rm(lockPath, { force: true });
            }
        }
        catch (error) {
            if (handle) {
                await handle.close().catch(() => undefined);
            }
            const code = typeof error === 'object' && error !== null && 'code' in error
                ? String(error.code)
                : '';
            if (code !== 'EEXIST') {
                throw error;
            }
            if (attempt >= retryCount) {
                return {
                    outcome: 'lock_timeout',
                    lockPath,
                    attempts: attempt + 1
                };
            }
            await sleep(retryDelayMs);
        }
    }
}
function normalizeOptionalString(record, key) {
    return typeof record[key] === 'string' && record[key].trim().length > 0
        ? record[key].trim()
        : undefined;
}
function normalizeDependencyList(record) {
    if (!Array.isArray(record.dependsOn)) {
        return undefined;
    }
    const normalized = Array.from(new Set(record.dependsOn
        .filter((item) => typeof item === 'string')
        .map((item) => item.trim())
        .filter((item) => item.length > 0)));
    return normalized.length > 0 ? normalized : undefined;
}
function locationLabel(location) {
    return `tasks[${location.arrayIndex}] (line ${location.line}, column ${location.column})`;
}
function taskLabel(task) {
    return task.source
        ? `Task ${task.id} at ${locationLabel(task.source)}`
        : `Task ${task.id}`;
}
function entryLabel(index, location) {
    return location ? `Task entry ${index + 1} at ${locationLabel(location)}` : `Task entry ${index + 1}`;
}
function normalizedFieldKey(key) {
    return key.replace(/[^a-z0-9]/gi, '').toLowerCase();
}
function lineAndColumnAt(text, index) {
    let line = 1;
    let lineStart = 0;
    for (let cursor = 0; cursor < index; cursor += 1) {
        if (text.charCodeAt(cursor) === 10) {
            line += 1;
            lineStart = cursor + 1;
        }
    }
    return {
        line,
        column: index - lineStart + 1
    };
}
function parseJsonString(text, startIndex) {
    let value = '';
    let index = startIndex + 1;
    while (index < text.length) {
        const char = text[index];
        if (char === '\\') {
            const next = text[index + 1];
            if (next === undefined) {
                throw new Error('Unexpected end of JSON string.');
            }
            value += char;
            value += next;
            index += 2;
            continue;
        }
        if (char === '"') {
            return {
                value: JSON.parse(`"${value}"`),
                endIndex: index + 1
            };
        }
        value += char;
        index += 1;
    }
    throw new Error('Unexpected end of JSON string.');
}
function skipWhitespace(text, startIndex) {
    let index = startIndex;
    while (index < text.length && /\s/.test(text[index])) {
        index += 1;
    }
    return index;
}
function findTasksArrayStart(text) {
    let objectDepth = 0;
    let arrayDepth = 0;
    let lastToken = null;
    let index = 0;
    while (index < text.length) {
        const char = text[index];
        if (char === '"') {
            const parsed = parseJsonString(text, index);
            const canBeProperty = objectDepth === 1 && arrayDepth === 0 && (lastToken === '{' || lastToken === ',');
            if (canBeProperty && parsed.value === 'tasks') {
                const colonIndex = skipWhitespace(text, parsed.endIndex);
                if (text[colonIndex] === ':') {
                    const valueIndex = skipWhitespace(text, colonIndex + 1);
                    if (text[valueIndex] === '[') {
                        return valueIndex;
                    }
                }
            }
            lastToken = 'string';
            index = parsed.endIndex;
            continue;
        }
        if (/\s/.test(char)) {
            index += 1;
            continue;
        }
        if (char === '{') {
            objectDepth += 1;
            lastToken = char;
            index += 1;
            continue;
        }
        if (char === '}') {
            objectDepth = Math.max(0, objectDepth - 1);
            lastToken = char;
            index += 1;
            continue;
        }
        if (char === '[') {
            arrayDepth += 1;
            lastToken = char;
            index += 1;
            continue;
        }
        if (char === ']') {
            arrayDepth = Math.max(0, arrayDepth - 1);
            lastToken = char;
            index += 1;
            continue;
        }
        lastToken = char;
        index += 1;
    }
    return null;
}
function extractTaskEntryLocations(raw) {
    const arrayStart = findTasksArrayStart(raw);
    if (arrayStart === null) {
        return [];
    }
    const locations = [];
    let index = skipWhitespace(raw, arrayStart + 1);
    let arrayIndex = 0;
    while (index < raw.length && raw[index] !== ']') {
        const position = lineAndColumnAt(raw, index);
        locations.push({
            arrayIndex,
            line: position.line,
            column: position.column
        });
        let objectDepth = 0;
        let arrayDepth = 0;
        let inString = false;
        let escaped = false;
        while (index < raw.length) {
            const char = raw[index];
            if (inString) {
                if (escaped) {
                    escaped = false;
                }
                else if (char === '\\') {
                    escaped = true;
                }
                else if (char === '"') {
                    inString = false;
                }
                index += 1;
                continue;
            }
            if (char === '"') {
                inString = true;
                index += 1;
                continue;
            }
            if (char === '{') {
                objectDepth += 1;
                index += 1;
                continue;
            }
            if (char === '}') {
                objectDepth = Math.max(0, objectDepth - 1);
                index += 1;
                continue;
            }
            if (char === '[') {
                arrayDepth += 1;
                index += 1;
                continue;
            }
            if (char === ']') {
                if (objectDepth === 0 && arrayDepth === 0) {
                    break;
                }
                arrayDepth = Math.max(0, arrayDepth - 1);
                index += 1;
                continue;
            }
            if (char === ',' && objectDepth === 0 && arrayDepth === 0) {
                break;
            }
            index += 1;
        }
        index = skipWhitespace(raw, index);
        if (raw[index] === ',') {
            arrayIndex += 1;
            index = skipWhitespace(raw, index + 1);
            continue;
        }
        break;
    }
    return locations;
}
function normalizeTask(candidate, source) {
    if (typeof candidate !== 'object' || candidate === null) {
        throw new Error('Task entries must be objects.');
    }
    const record = candidate;
    if (typeof record.id !== 'string' || typeof record.title !== 'string' || !isTaskStatus(record.status)) {
        throw new Error('Each task requires string id/title fields and a valid status.');
    }
    return {
        id: record.id.trim(),
        title: record.title.trim(),
        status: record.status,
        parentId: normalizeOptionalString(record, 'parentId'),
        dependsOn: normalizeDependencyList(record),
        notes: normalizeOptionalString(record, 'notes'),
        validation: normalizeOptionalString(record, 'validation'),
        blocker: normalizeOptionalString(record, 'blocker'),
        source
    };
}
function createTaskGraphDiagnostic(code, message, details = {}) {
    return {
        category: 'taskGraph',
        severity: 'error',
        code,
        message,
        ...details
    };
}
function legacyParentCandidates(taskId) {
    const candidates = [];
    for (const separator of ['.', '-', '/']) {
        const lastIndex = taskId.lastIndexOf(separator);
        if (lastIndex > 0) {
            candidates.push(taskId.slice(0, lastIndex));
        }
    }
    return candidates;
}
function inferLegacyParentId(taskId, knownIds) {
    const matches = legacyParentCandidates(taskId)
        .filter((candidate) => knownIds.has(candidate))
        .sort((left, right) => right.length - left.length);
    return matches[0];
}
function uniqueDiagnostics(diagnostics) {
    const seen = new Set();
    const ordered = [];
    for (const diagnostic of diagnostics) {
        const key = [
            diagnostic.category,
            diagnostic.severity,
            diagnostic.code,
            diagnostic.taskId ?? '',
            (diagnostic.relatedTaskIds ?? []).join(','),
            diagnostic.location ? `${diagnostic.location.arrayIndex}:${diagnostic.location.line}:${diagnostic.location.column}` : '',
            (diagnostic.relatedLocations ?? [])
                .map((location) => `${location.arrayIndex}:${location.line}:${location.column}`)
                .join(','),
            diagnostic.message
        ].join('::');
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        ordered.push(diagnostic);
    }
    return ordered;
}
function buildTaskIndex(taskFile) {
    const index = new Map();
    for (const task of taskFile.tasks) {
        const bucket = index.get(task.id);
        if (bucket) {
            bucket.push(task);
        }
        else {
            index.set(task.id, [task]);
        }
    }
    return index;
}
function detectGraphCycles(input) {
    const diagnostics = [];
    const uniqueTasks = new Map();
    for (const task of input.tasks) {
        if (!uniqueTasks.has(task.id)) {
            uniqueTasks.set(task.id, task);
        }
    }
    const visiting = new Set();
    const visited = new Set();
    const reportedCycles = new Set();
    const visit = (taskId, stack) => {
        if (visited.has(taskId) || visiting.has(taskId)) {
            return;
        }
        const task = uniqueTasks.get(taskId);
        if (!task) {
            return;
        }
        visiting.add(taskId);
        stack.push(taskId);
        for (const neighborId of input.describe(task)) {
            if (!uniqueTasks.has(neighborId)) {
                continue;
            }
            if (neighborId === taskId) {
                diagnostics.push(createTaskGraphDiagnostic(input.code, input.message('self', task, [taskId]), {
                    taskId,
                    relatedTaskIds: [taskId],
                    location: task.source,
                    relatedLocations: task.source ? [task.source] : undefined
                }));
                continue;
            }
            if (visiting.has(neighborId)) {
                const startIndex = stack.indexOf(neighborId);
                const cyclePath = [...stack.slice(startIndex), neighborId];
                const cycleKey = cyclePath.join('->');
                if (!reportedCycles.has(cycleKey)) {
                    reportedCycles.add(cycleKey);
                    diagnostics.push(createTaskGraphDiagnostic(input.code, input.message('cycle', task, cyclePath), {
                        taskId,
                        relatedTaskIds: cyclePath,
                        location: task.source,
                        relatedLocations: cyclePath
                            .map((cycleTaskId) => uniqueTasks.get(cycleTaskId)?.source)
                            .filter((location) => Boolean(location))
                    }));
                }
                continue;
            }
            if (!visited.has(neighborId)) {
                visit(neighborId, stack);
            }
        }
        stack.pop();
        visiting.delete(taskId);
        visited.add(taskId);
    };
    for (const taskId of uniqueTasks.keys()) {
        visit(taskId, []);
    }
    return diagnostics;
}
function inspectTaskGraph(taskFile) {
    const diagnostics = [];
    const taskIndex = buildTaskIndex(taskFile);
    for (const [taskId, tasks] of taskIndex.entries()) {
        if (!taskId.trim()) {
            diagnostics.push(createTaskGraphDiagnostic('task_id_empty', 'Task ids must be non-empty strings.'));
            continue;
        }
        if (tasks.length > 1) {
            diagnostics.push(createTaskGraphDiagnostic('duplicate_task_id', `Task id ${taskId} must be unique. Found duplicates at ${tasks
                .map((task) => task.source ? locationLabel(task.source) : 'unknown location')
                .join(', ')}.`, {
                taskId,
                relatedTaskIds: tasks.map((task) => task.id),
                location: tasks[0]?.source,
                relatedLocations: tasks
                    .map((task) => task.source)
                    .filter((location) => Boolean(location))
            }));
        }
    }
    for (const task of taskFile.tasks) {
        if (task.parentId) {
            if (task.parentId === task.id) {
                diagnostics.push(createTaskGraphDiagnostic('self_parent_reference', `${taskLabel(task)} cannot reference itself as parent.`, {
                    taskId: task.id,
                    relatedTaskIds: [task.id],
                    location: task.source,
                    relatedLocations: task.source ? [task.source] : undefined
                }));
            }
            else if (!taskIndex.has(task.parentId)) {
                diagnostics.push(createTaskGraphDiagnostic('orphaned_parent_reference', `${taskLabel(task)} references missing parentId ${task.parentId}.`, {
                    taskId: task.id,
                    relatedTaskIds: [task.parentId],
                    location: task.source
                }));
            }
        }
        if (task.status === 'done') {
            const unfinishedDescendants = collectDescendants(taskFile, task.id)
                .filter((descendant) => descendant.status !== 'done');
            if (unfinishedDescendants.length > 0) {
                diagnostics.push(createTaskGraphDiagnostic('completed_parent_with_incomplete_descendants', `${taskLabel(task)} is marked done but descendant tasks are still unfinished: ${unfinishedDescendants
                    .map((descendant) => `${descendant.id} (${descendant.status})`)
                    .join(', ')}.`, {
                    taskId: task.id,
                    relatedTaskIds: unfinishedDescendants.map((descendant) => descendant.id),
                    location: task.source,
                    relatedLocations: unfinishedDescendants
                        .map((descendant) => descendant.source)
                        .filter((location) => Boolean(location))
                }));
            }
        }
        for (const dependencyId of task.dependsOn ?? []) {
            if (dependencyId === task.id) {
                diagnostics.push(createTaskGraphDiagnostic('self_dependency_reference', `${taskLabel(task)} cannot depend on itself.`, {
                    taskId: task.id,
                    relatedTaskIds: [task.id],
                    location: task.source,
                    relatedLocations: task.source ? [task.source] : undefined
                }));
                continue;
            }
            if (!taskIndex.has(dependencyId)) {
                diagnostics.push(createTaskGraphDiagnostic('invalid_dependency_reference', `${taskLabel(task)} references missing dependency ${dependencyId}.`, {
                    taskId: task.id,
                    relatedTaskIds: [dependencyId],
                    location: task.source
                }));
                continue;
            }
            const dependencyTask = taskIndex.get(dependencyId)?.[0];
            if (task.status === 'done' && dependencyTask?.status !== 'done') {
                diagnostics.push(createTaskGraphDiagnostic('completed_task_with_incomplete_dependencies', `${taskLabel(task)} is marked done but dependency ${dependencyId} is ${dependencyTask?.status ?? 'not done'}.`, {
                    taskId: task.id,
                    relatedTaskIds: [dependencyId],
                    location: task.source,
                    relatedLocations: dependencyTask?.source ? [dependencyTask.source] : undefined
                }));
            }
        }
    }
    diagnostics.push(...detectGraphCycles({
        tasks: taskFile.tasks,
        code: 'dependency_cycle',
        describe: (task) => task.dependsOn ?? [],
        message: (_kind, task, cyclePath) => `${taskLabel(task)} is part of dependency cycle: ${cyclePath.join(' -> ')}.`
    }));
    diagnostics.push(...detectGraphCycles({
        tasks: taskFile.tasks,
        code: 'parent_cycle',
        describe: (task) => task.parentId ? [task.parentId] : [],
        message: (_kind, task, cyclePath) => `${taskLabel(task)} is part of parent cycle: ${cyclePath.join(' -> ')}.`
    }));
    return uniqueDiagnostics(diagnostics);
}
function formatTaskGraphDiagnostics(diagnostics) {
    return diagnostics.map((diagnostic) => diagnostic.message).join(' ');
}
function inspectTaskFileText(raw) {
    if (!raw.trim()) {
        const taskFile = createDefaultTaskFile();
        return {
            taskFile,
            text: stringifyTaskFile(taskFile),
            migrated: true,
            diagnostics: []
        };
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (error) {
        return {
            taskFile: null,
            text: null,
            migrated: false,
            diagnostics: [
                createTaskGraphDiagnostic('task_file_json_invalid', `Task file must be valid JSON: ${error instanceof Error ? error.message : String(error)}.`)
            ]
        };
    }
    if (typeof parsed !== 'object' || parsed === null) {
        return {
            taskFile: null,
            text: null,
            migrated: false,
            diagnostics: [createTaskGraphDiagnostic('task_file_not_object', 'Task file must be a JSON object.')]
        };
    }
    const record = parsed;
    if (!Array.isArray(record.tasks)) {
        return {
            taskFile: null,
            text: null,
            migrated: false,
            diagnostics: [createTaskGraphDiagnostic('task_array_missing', 'Task file must contain a tasks array.')]
        };
    }
    const diagnostics = [];
    const normalizedTasks = [];
    const entryLocations = extractTaskEntryLocations(raw);
    for (const [index, candidate] of record.tasks.entries()) {
        const location = entryLocations[index];
        if (typeof candidate === 'object' && candidate !== null) {
            const taskRecord = candidate;
            for (const key of Object.keys(taskRecord)) {
                if (SUPPORTED_TASK_FIELDS.has(key)) {
                    continue;
                }
                const suggestedField = LIKELY_TASK_FIELD_MISTAKES.get(normalizedFieldKey(key));
                if (!suggestedField) {
                    continue;
                }
                diagnostics.push(createTaskGraphDiagnostic('unsupported_task_field', `${entryLabel(index, location)} uses unsupported field "${key}". Use "${suggestedField}" instead.`, {
                    location
                }));
            }
        }
        try {
            normalizedTasks.push(normalizeTask(candidate, location));
        }
        catch (error) {
            diagnostics.push(createTaskGraphDiagnostic('task_entry_invalid', `${entryLabel(index, location)} is invalid: ${error instanceof Error ? error.message : String(error)}.`, {
                location
            }));
        }
    }
    if (diagnostics.length > 0) {
        return {
            taskFile: null,
            text: null,
            migrated: false,
            diagnostics
        };
    }
    const knownIds = new Set(normalizedTasks.map((task) => task.id));
    const explicitVersion = record.version;
    const migratedTasks = normalizedTasks.map((task) => {
        if (task.parentId) {
            return task;
        }
        const inferredParentId = inferLegacyParentId(task.id, knownIds);
        return inferredParentId
            ? { ...task, parentId: inferredParentId }
            : task;
    });
    const taskFile = {
        version: 2,
        tasks: migratedTasks
    };
    const taskDiagnostics = inspectTaskGraph(taskFile);
    const normalizedText = stringifyTaskFile(taskFile);
    return {
        taskFile: taskDiagnostics.length === 0 ? taskFile : null,
        text: taskDiagnostics.length === 0 ? normalizedText : null,
        migrated: explicitVersion !== 2
            || migratedTasks.some((task, index) => task.parentId !== normalizedTasks[index].parentId)
            || raw.trimEnd() !== normalizedText.trimEnd(),
        diagnostics: taskDiagnostics
    };
}
function isDependencySatisfied(taskFile, dependencyId) {
    return findTaskById(taskFile, dependencyId)?.status === 'done';
}
function isTaskSelectable(taskFile, task) {
    return (task.dependsOn ?? []).every((dependencyId) => isDependencySatisfied(taskFile, dependencyId));
}
function collectDescendants(taskFile, taskId, seen = new Set()) {
    const directChildren = taskFile.tasks.filter((task) => task.parentId === taskId);
    const descendants = [];
    for (const child of directChildren) {
        if (seen.has(child.id)) {
            continue;
        }
        seen.add(child.id);
        descendants.push(child, ...collectDescendants(taskFile, child.id, seen));
    }
    return descendants;
}
function createDefaultTaskFile() {
    return {
        version: 2,
        tasks: [
            {
                id: 'T1',
                title: 'Write or refine the project objective in the PRD file',
                status: 'todo',
                notes: 'The prompt generator reads the PRD file directly.'
            },
            {
                id: 'T2',
                title: 'Replace this seed task list with repo-specific work',
                status: 'todo',
                notes: 'Keep statuses current so fresh Codex runs can resume deterministically.'
            }
        ]
    };
}
function parseTaskFile(raw) {
    const inspection = inspectTaskFileText(raw);
    if (inspection.taskFile) {
        return inspection.taskFile;
    }
    throw new Error(formatTaskGraphDiagnostics(inspection.diagnostics));
}
function normalizeTaskFileText(raw) {
    const inspection = inspectTaskFileText(raw);
    if (inspection.taskFile && inspection.text) {
        return {
            taskFile: inspection.taskFile,
            text: inspection.text,
            migrated: inspection.migrated
        };
    }
    throw new Error(formatTaskGraphDiagnostics(inspection.diagnostics));
}
function stringifyTaskFile(taskFile) {
    return `${JSON.stringify({
        version: taskFile.version,
        tasks: taskFile.tasks.map(({ source: _source, ...task }) => task)
    }, null, 2)}\n`;
}
function countTaskStatuses(taskFile) {
    const counts = { ...EMPTY_COUNTS };
    for (const task of taskFile.tasks) {
        counts[task.status] += 1;
    }
    return counts;
}
function listSelectableTasks(taskFile) {
    return [
        ...taskFile.tasks.filter((task) => task.status === 'in_progress' && isTaskSelectable(taskFile, task)),
        ...taskFile.tasks.filter((task) => task.status === 'todo' && isTaskSelectable(taskFile, task))
    ];
}
function selectNextTask(taskFile) {
    return listSelectableTasks(taskFile)[0] ?? null;
}
function collectAncestors(taskFile, taskId) {
    const ancestors = [];
    const seen = new Set();
    let currentTask = findTaskById(taskFile, taskId);
    while (currentTask?.parentId) {
        if (seen.has(currentTask.parentId)) {
            break;
        }
        const parentTask = findTaskById(taskFile, currentTask.parentId);
        if (!parentTask) {
            break;
        }
        ancestors.push(parentTask);
        seen.add(parentTask.id);
        currentTask = parentTask;
    }
    return ancestors;
}
function isSatisfiedAggregateParent(taskFile, task) {
    if (task.status === 'done' || task.validation) {
        return false;
    }
    const descendants = collectDescendants(taskFile, task.id);
    if (descendants.length === 0 || descendants.some((descendant) => descendant.status !== 'done')) {
        return false;
    }
    const descendantIds = new Set(descendants.map((descendant) => descendant.id));
    return (task.dependsOn ?? []).every((dependencyId) => descendantIds.has(dependencyId));
}
function autoCompleteSatisfiedAncestors(taskFile, completedTaskId) {
    if (!completedTaskId) {
        return {
            taskFile,
            completedAncestorIds: []
        };
    }
    let nextTaskFile = taskFile;
    const completedAncestorIds = [];
    for (const ancestor of collectAncestors(taskFile, completedTaskId)) {
        const currentAncestor = findTaskById(nextTaskFile, ancestor.id);
        if (!currentAncestor || !isSatisfiedAggregateParent(nextTaskFile, currentAncestor)) {
            continue;
        }
        nextTaskFile = {
            ...nextTaskFile,
            tasks: nextTaskFile.tasks.map((task) => (task.id === currentAncestor.id
                ? { ...task, status: 'done' }
                : task))
        };
        completedAncestorIds.push(currentAncestor.id);
    }
    return {
        taskFile: nextTaskFile,
        completedAncestorIds
    };
}
function findTaskById(taskFile, taskId) {
    if (!taskId) {
        return null;
    }
    return taskFile.tasks.find((task) => task.id === taskId) ?? null;
}
function applySuggestedChildTasks(taskFile, parentTaskId, suggestedChildTasks) {
    const parentTask = findTaskById(taskFile, parentTaskId);
    if (!parentTask) {
        throw new Error(`Cannot apply decomposition proposal because parent task ${parentTaskId} does not exist.`);
    }
    if (parentTask.status === 'done') {
        throw new Error(`Cannot apply decomposition proposal because parent task ${parentTaskId} is already done.`);
    }
    if (suggestedChildTasks.length === 0) {
        throw new Error(`Cannot apply decomposition proposal for ${parentTaskId} because no suggested child tasks were provided.`);
    }
    const knownTaskIds = new Set(taskFile.tasks.map((task) => task.id));
    const proposedTaskIds = new Set();
    for (const child of suggestedChildTasks) {
        if (child.parentId !== parentTaskId) {
            throw new Error(`Cannot apply decomposition proposal because suggested child task ${child.id} targets parent ${child.parentId} instead of ${parentTaskId}.`);
        }
        if (child.id === parentTaskId) {
            throw new Error(`Cannot apply decomposition proposal because child task id ${child.id} matches the parent task id.`);
        }
        if (proposedTaskIds.has(child.id)) {
            throw new Error(`Cannot apply decomposition proposal because child task id ${child.id} is duplicated within the proposal.`);
        }
        if (knownTaskIds.has(child.id)) {
            throw new Error(`Cannot apply decomposition proposal because task id ${child.id} already exists in tasks.json.`);
        }
        proposedTaskIds.add(child.id);
    }
    for (const child of suggestedChildTasks) {
        for (const dependency of child.dependsOn) {
            if (!knownTaskIds.has(dependency.taskId) && !proposedTaskIds.has(dependency.taskId)) {
                throw new Error(`Cannot apply decomposition proposal because child task ${child.id} depends on missing task ${dependency.taskId}.`);
            }
        }
    }
    const proposedChildren = suggestedChildTasks.map((child) => ({
        id: child.id,
        title: child.title,
        status: 'todo',
        parentId: child.parentId,
        dependsOn: child.dependsOn.map((dependency) => dependency.taskId),
        validation: child.validation ?? undefined,
        notes: child.rationale
    }));
    const parentDependencies = Array.from(new Set([
        ...(parentTask.dependsOn ?? []),
        ...proposedChildren.map((child) => child.id)
    ]));
    const nextTaskFile = {
        ...taskFile,
        tasks: [
            ...taskFile.tasks.map((task) => (task.id === parentTaskId
                ? {
                    ...task,
                    dependsOn: parentDependencies
                }
                : task)),
            ...proposedChildren
        ]
    };
    const diagnostics = inspectTaskGraph(nextTaskFile);
    if (diagnostics.length > 0) {
        throw new Error(formatTaskGraphDiagnostics(diagnostics));
    }
    return nextTaskFile;
}
function remainingSubtasks(taskFile, taskId) {
    if (!taskId) {
        return [];
    }
    return collectDescendants(taskFile, taskId).filter((task) => task.status !== 'done');
}
async function acquireClaim(claimFilePath, taskId, agentId, provenanceId, options) {
    return withClaimFileLock(claimFilePath, options, async () => {
        const claimFile = await readTaskClaimFile(claimFilePath);
        const releasableLegacyIdeClaims = activeClaimsForTask(claimFile, taskId).filter((claim) => (claim.agentId === agentId && isIdeHandoffProvenance(claim.provenanceId)));
        const effectiveClaimFile = releasableLegacyIdeClaims.length > 0
            ? {
                version: 1,
                claims: claimFile.claims.map((claim) => (releasableLegacyIdeClaims.some((legacyClaim) => claimRecordMatches(claim, legacyClaim))
                    ? { ...claim, status: 'released' }
                    : claim))
            }
            : claimFile;
        const activeClaims = activeClaimsForTask(effectiveClaimFile, taskId);
        const effectiveCanonicalClaim = canonicalClaimForTask(effectiveClaimFile, taskId);
        if (effectiveCanonicalClaim) {
            const contestedByAnotherActiveClaim = activeClaims.some((claim) => !claimIdentityMatches(claim, effectiveCanonicalClaim));
            if (contestedByAnotherActiveClaim) {
                return {
                    outcome: 'contested',
                    claim: null,
                    canonicalClaim: describeClaim(effectiveCanonicalClaim, options),
                    claimFile: effectiveClaimFile
                };
            }
            if (effectiveCanonicalClaim.agentId === agentId && effectiveCanonicalClaim.provenanceId === provenanceId) {
                return {
                    outcome: 'already_held',
                    claim: describeClaim(effectiveCanonicalClaim, options),
                    canonicalClaim: describeClaim(effectiveCanonicalClaim, options),
                    claimFile: effectiveClaimFile
                };
            }
            return {
                outcome: 'contested',
                claim: null,
                canonicalClaim: describeClaim(effectiveCanonicalClaim, options),
                claimFile: effectiveClaimFile
            };
        }
        const nextClaim = {
            taskId,
            agentId,
            provenanceId,
            claimedAt: (options?.now ?? new Date()).toISOString(),
            status: 'active'
        };
        const nextClaimFile = {
            version: 1,
            claims: [...effectiveClaimFile.claims, nextClaim]
        };
        await writeTaskClaimFile(claimFilePath, nextClaimFile);
        const verifiedClaimFile = await readTaskClaimFile(claimFilePath);
        const verifiedCanonicalClaim = canonicalClaimForTask(verifiedClaimFile, taskId);
        if (!verifiedCanonicalClaim || !claimRecordMatches(verifiedCanonicalClaim, nextClaim)) {
            return {
                outcome: 'contested',
                claim: null,
                canonicalClaim: describeClaim(verifiedCanonicalClaim, options),
                claimFile: verifiedClaimFile
            };
        }
        return {
            outcome: 'acquired',
            claim: describeClaim(nextClaim, options),
            canonicalClaim: describeClaim(verifiedCanonicalClaim, options),
            claimFile: verifiedClaimFile
        };
    });
}
async function releaseClaim(claimFilePath, taskId, agentId, options) {
    return withClaimFileLock(claimFilePath, options, async () => {
        const claimFile = await readTaskClaimFile(claimFilePath);
        const canonicalClaim = canonicalClaimForTask(claimFile, taskId);
        if (!canonicalClaim || canonicalClaim.agentId !== agentId) {
            return {
                outcome: 'not_held',
                releasedClaim: null,
                canonicalClaim: describeClaim(canonicalClaim, options),
                claimFile
            };
        }
        let releasedClaim = null;
        const nextClaimFile = {
            version: 1,
            claims: claimFile.claims.map((claim) => {
                if (claimRecordMatches(claim, canonicalClaim)) {
                    releasedClaim = {
                        ...claim,
                        status: 'released'
                    };
                    return releasedClaim;
                }
                return claim;
            })
        };
        await writeTaskClaimFile(claimFilePath, nextClaimFile);
        const verifiedClaimFile = await readTaskClaimFile(claimFilePath);
        const verifiedReleasedClaim = releasedClaim ? findClaim(verifiedClaimFile, releasedClaim) : null;
        if (!releasedClaim || !verifiedReleasedClaim) {
            throw new Error(`Failed to verify released claim for task ${taskId} held by agent ${agentId}.`);
        }
        return {
            outcome: 'released',
            releasedClaim: describeClaim(verifiedReleasedClaim, options),
            canonicalClaim: describeClaim(canonicalClaimForTask(verifiedClaimFile, taskId), options),
            claimFile: verifiedClaimFile
        };
    });
}
async function inspectClaimOwnership(claimFilePath, taskId, agentId, provenanceId, options) {
    return withClaimFileLock(claimFilePath, options, async () => {
        const claimFile = await readTaskClaimFile(claimFilePath);
        const canonicalClaim = canonicalClaimForTask(claimFile, taskId);
        return {
            holdsActiveClaim: canonicalClaim?.status === 'active'
                && canonicalClaim.taskId === taskId
                && canonicalClaim.agentId === agentId
                && canonicalClaim.provenanceId === provenanceId,
            canonicalClaim: describeClaim(canonicalClaim, options),
            claimFile
        };
    });
}
async function inspectTaskClaimGraph(claimFilePath, options) {
    return withClaimFileLock(claimFilePath, options, async () => {
        const claimFile = await readTaskClaimFile(claimFilePath);
        const tasks = taskIdsWithActiveClaims(claimFile).map((taskId) => {
            const activeClaims = activeClaimsForTask(claimFile, taskId)
                .map((claim) => describeClaim(claim, options))
                .filter((claim) => claim !== null);
            return {
                taskId,
                canonicalClaim: describeClaim(canonicalClaimForTask(claimFile, taskId), options),
                activeClaims,
                contested: activeClaims.length > 1
            };
        });
        return {
            claimFile,
            tasks
        };
    });
}
//# sourceMappingURL=taskFile.js.map