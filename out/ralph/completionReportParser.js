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
function isAllowedReviewOutcome(value) {
    return value === 'approved' || value === 'changes_required';
}
function isAllowedWatchdogActionType(value) {
    return value === 'resolve_stale_claim' || value === 'decompose_task' || value === 'escalate_to_human';
}
function isAllowedWatchdogActionSeverity(value) {
    return value === 'MEDIUM' || value === 'HIGH' || value === 'CRITICAL';
}
function parseOptionalStringArray(value) {
    if (!Array.isArray(value)) {
        return undefined;
    }
    const items = value
        .filter((item) => typeof item === 'string')
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
    return items.length > 0 ? items : undefined;
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
    if (!Array.isArray(record.dependsOn) && !Array.isArray(record.dependencies) && !Array.isArray(record.depends_on)) {
        return null;
    }
    const rawDependsOn = record.dependsOn ?? record.dependencies ?? record.depends_on;
    const dependsOn = rawDependsOn
        .map(parseSuggestedTaskDependency)
        .filter((dependency) => dependency !== null);
    if (dependsOn.length !== rawDependsOn.length) {
        return null;
    }
    const acceptance = parseOptionalStringArray(record.acceptance ?? record.acceptanceCriteria ?? record.acceptance_criteria);
    const constraints = parseOptionalStringArray(record.constraints ?? record.guardrails ?? record.guard_rails);
    const context = parseOptionalStringArray(record.context ?? record.files ?? record.relevantFiles ?? record.relevant_files);
    return {
        id: record.id.trim(),
        title: record.title.trim(),
        parentId: record.parentId.trim(),
        dependsOn,
        validation: typeof record.validation === 'string' ? sanitizeCompletionText(record.validation) ?? record.validation.trim() : null,
        rationale: sanitizeCompletionText(record.rationale) ?? record.rationale.trim(),
        ...(acceptance ? { acceptance } : {}),
        ...(constraints ? { constraints } : {}),
        ...(context ? { context } : {})
    };
}
const MAX_SUGGESTED_CHILD_TASKS = 10;
function parseSuggestedChildTasks(candidate) {
    if (candidate === undefined) {
        return undefined;
    }
    if (!Array.isArray(candidate)) {
        return null;
    }
    if (candidate.length > MAX_SUGGESTED_CHILD_TASKS) {
        return null;
    }
    const tasks = candidate
        .map(parseSuggestedChildTask)
        .filter((task) => task !== null);
    return tasks.length === candidate.length ? tasks : null;
}
function parseWatchdogAction(candidate) {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
        return null;
    }
    const record = candidate;
    if (typeof record.taskId !== 'string' || !record.taskId.trim()) {
        return null;
    }
    if (typeof record.agentId !== 'string' || !record.agentId.trim()) {
        return null;
    }
    if (!isAllowedWatchdogActionType(record.action)) {
        return null;
    }
    if (!isAllowedWatchdogActionSeverity(record.severity)) {
        return null;
    }
    const reason = sanitizeCompletionText(typeof record.reason === 'string' ? record.reason : undefined);
    const evidence = sanitizeCompletionText(typeof record.evidence === 'string' ? record.evidence : undefined);
    if (!reason || !evidence) {
        return null;
    }
    if (!Number.isInteger(record.trailingNoProgressCount) || record.trailingNoProgressCount < 0) {
        return null;
    }
    if (!Number.isInteger(record.trailingRepeatedFailureCount) || record.trailingRepeatedFailureCount < 0) {
        return null;
    }
    const trailingNoProgressCount = record.trailingNoProgressCount;
    const trailingRepeatedFailureCount = record.trailingRepeatedFailureCount;
    const suggestedChildTasks = parseSuggestedChildTasks(record.suggestedChildTasks);
    if (suggestedChildTasks === null) {
        return null;
    }
    return {
        taskId: record.taskId.trim(),
        agentId: record.agentId.trim(),
        action: record.action,
        severity: record.severity,
        reason,
        evidence,
        trailingNoProgressCount,
        trailingRepeatedFailureCount,
        suggestedChildTasks
    };
}
function parseWatchdogActions(candidate) {
    if (candidate === undefined) {
        return undefined;
    }
    if (!Array.isArray(candidate)) {
        return undefined;
    }
    return candidate
        .map(parseWatchdogAction)
        .filter((action) => action !== null);
}
function extractTrailingJsonObject(text) {
    const trimmed = text.trimEnd();
    if (!trimmed.endsWith('}')) {
        return null;
    }
    // Walk forward to find the last '{' that opens a balanced JSON object,
    // handling string escapes correctly (forward traversal avoids the
    // backward-walk escape-sequence inversion bug).
    let lastBalancedStart = -1;
    for (let start = trimmed.length - 1; start >= 0; start -= 1) {
        if (trimmed[start] !== '{') {
            continue;
        }
        // Try to match a balanced object starting at this '{'
        let depth = 0;
        let inString = false;
        let escaped = false;
        let balanced = false;
        for (let i = start; i < trimmed.length; i += 1) {
            const char = trimmed[i];
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
            if (char === '{') {
                depth += 1;
            }
            else if (char === '}') {
                depth -= 1;
                if (depth === 0) {
                    if (i === trimmed.length - 1) {
                        balanced = true;
                    }
                    break;
                }
            }
        }
        if (balanced) {
            lastBalancedStart = start;
            break;
        }
    }
    if (lastBalancedStart === -1) {
        return null;
    }
    return trimmed.slice(lastBalancedStart).trim();
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
    const watchdogActions = parseWatchdogActions(candidate.watchdog_actions);
    const report = {
        selectedTaskId: candidate.selectedTaskId.trim(),
        requestedStatus: candidate.requestedStatus,
        progressNote: sanitizeCompletionText(typeof candidate.progressNote === 'string' ? candidate.progressNote : undefined),
        blocker: sanitizeCompletionText(typeof candidate.blocker === 'string' ? candidate.blocker : undefined),
        validationRan: sanitizeCompletionText(typeof candidate.validationRan === 'string' ? candidate.validationRan : undefined),
        needsHumanReview: typeof candidate.needsHumanReview === 'boolean' ? candidate.needsHumanReview : undefined,
        suggestedChildTasks,
        watchdog_actions: watchdogActions,
        proposedPlan: sanitizeCompletionText(typeof candidate.proposedPlan === 'string' ? candidate.proposedPlan : undefined, 4000),
        reviewOutcome: isAllowedReviewOutcome(candidate.reviewOutcome) ? candidate.reviewOutcome : undefined,
        reviewNotes: sanitizeCompletionText(typeof candidate.reviewNotes === 'string' ? candidate.reviewNotes : undefined)
    };
    return {
        status: 'parsed',
        report,
        rawBlock,
        parseError: null
    };
}
//# sourceMappingURL=completionReportParser.js.map