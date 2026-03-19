"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeCompletionText = sanitizeCompletionText;
exports.isAllowedCompletionStatus = isAllowedCompletionStatus;
exports.extractTrailingJsonObject = extractTrailingJsonObject;
exports.parseCompletionReport = parseCompletionReport;
function sanitizeCompletionText(value, maximumLength = 400) {
    if (!value) {
        return undefined;
    }
    const normalized = value
        .replace(/^\s*[-*]\s*/, '')
        .replace(/\s+/g, ' ')
        .trim();
    if (!normalized) {
        return undefined;
    }
    return normalized.slice(0, maximumLength).trim();
}
function isAllowedCompletionStatus(value) {
    return value === 'done' || value === 'blocked' || value === 'in_progress';
}
function parseSuggestedTaskDependency(candidate) {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
        return null;
    }
    const record = candidate;
    if (typeof record.taskId !== 'string' || !record.taskId.trim()) {
        return null;
    }
    if (record.reason !== 'blocks_sequence' && record.reason !== 'inherits_parent_dependency') {
        return null;
    }
    return {
        taskId: record.taskId.trim(),
        reason: record.reason
    };
}
function parseSuggestedChildTask(candidate) {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
        return null;
    }
    const record = candidate;
    if (typeof record.id !== 'string' || !record.id.trim()) {
        return null;
    }
    if (typeof record.title !== 'string' || !record.title.trim()) {
        return null;
    }
    if (typeof record.parentId !== 'string' || !record.parentId.trim()) {
        return null;
    }
    if (record.validation !== null && typeof record.validation !== 'string') {
        return null;
    }
    if (typeof record.rationale !== 'string' || !record.rationale.trim()) {
        return null;
    }
    if (!Array.isArray(record.dependsOn)) {
        return null;
    }
    const dependsOn = record.dependsOn
        .map(parseSuggestedTaskDependency)
        .filter((dependency) => dependency !== null);
    if (dependsOn.length !== record.dependsOn.length) {
        return null;
    }
    return {
        id: record.id.trim(),
        title: record.title.trim(),
        parentId: record.parentId.trim(),
        dependsOn,
        validation: typeof record.validation === 'string' ? sanitizeCompletionText(record.validation) ?? record.validation.trim() : null,
        rationale: sanitizeCompletionText(record.rationale) ?? record.rationale.trim()
    };
}
function parseSuggestedChildTasks(candidate) {
    if (candidate === undefined) {
        return undefined;
    }
    if (!Array.isArray(candidate)) {
        return null;
    }
    const tasks = candidate
        .map(parseSuggestedChildTask)
        .filter((task) => task !== null);
    return tasks.length === candidate.length ? tasks : null;
}
function extractTrailingJsonObject(text) {
    const trimmed = text.trimEnd();
    if (!trimmed.endsWith('}')) {
        return null;
    }
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = trimmed.length - 1; index >= 0; index -= 1) {
        const char = trimmed[index];
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
            continue;
        }
        if (char === '"') {
            inString = true;
            continue;
        }
        if (char === '}') {
            depth += 1;
            continue;
        }
        if (char === '{') {
            depth -= 1;
            if (depth === 0) {
                const candidate = trimmed.slice(index);
                return candidate.trim();
            }
        }
    }
    return null;
}
function parseCompletionReport(lastMessage) {
    const trimmed = lastMessage.trim();
    if (!trimmed) {
        return {
            status: 'missing',
            report: null,
            rawBlock: null,
            parseError: null
        };
    }
    const fencedMatch = /```json\s*([\s\S]*?)\s*```\s*$/i.exec(trimmed);
    const rawBlock = fencedMatch?.[1]?.trim() ?? extractTrailingJsonObject(trimmed);
    if (!rawBlock) {
        return {
            status: 'missing',
            report: null,
            rawBlock: null,
            parseError: null
        };
    }
    let candidate;
    try {
        const parsed = JSON.parse(rawBlock);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            throw new Error('Completion report must be a JSON object.');
        }
        candidate = parsed;
    }
    catch (error) {
        return {
            status: 'invalid',
            report: null,
            rawBlock,
            parseError: error instanceof Error ? error.message : String(error)
        };
    }
    if (typeof candidate.selectedTaskId !== 'string' || !candidate.selectedTaskId.trim()) {
        return {
            status: 'invalid',
            report: null,
            rawBlock,
            parseError: 'Completion report requires a non-empty selectedTaskId string.'
        };
    }
    if (typeof candidate.requestedStatus !== 'string' || !isAllowedCompletionStatus(candidate.requestedStatus)) {
        return {
            status: 'invalid',
            report: null,
            rawBlock,
            parseError: 'Completion report requestedStatus must be one of done, blocked, or in_progress.'
        };
    }
    if (candidate.needsHumanReview !== undefined && typeof candidate.needsHumanReview !== 'boolean') {
        return {
            status: 'invalid',
            report: null,
            rawBlock,
            parseError: 'Completion report needsHumanReview must be a boolean when provided.'
        };
    }
    const suggestedChildTasks = parseSuggestedChildTasks(candidate.suggestedChildTasks);
    if (suggestedChildTasks === null) {
        return {
            status: 'invalid',
            report: null,
            rawBlock,
            parseError: 'Completion report suggestedChildTasks must be an array of valid suggested child tasks when provided.'
        };
    }
    const report = {
        selectedTaskId: candidate.selectedTaskId.trim(),
        requestedStatus: candidate.requestedStatus,
        progressNote: sanitizeCompletionText(typeof candidate.progressNote === 'string' ? candidate.progressNote : undefined),
        blocker: sanitizeCompletionText(typeof candidate.blocker === 'string' ? candidate.blocker : undefined),
        validationRan: sanitizeCompletionText(typeof candidate.validationRan === 'string' ? candidate.validationRan : undefined),
        needsHumanReview: typeof candidate.needsHumanReview === 'boolean' ? candidate.needsHumanReview : undefined,
        suggestedChildTasks
    };
    return {
        status: 'parsed',
        report,
        rawBlock,
        parseError: null
    };
}
//# sourceMappingURL=completionReportParser.js.map