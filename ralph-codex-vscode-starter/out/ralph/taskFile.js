"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDefaultTaskFile = createDefaultTaskFile;
exports.parseTaskFile = parseTaskFile;
exports.stringifyTaskFile = stringifyTaskFile;
exports.countTaskStatuses = countTaskStatuses;
const EMPTY_COUNTS = {
    todo: 0,
    in_progress: 0,
    blocked: 0,
    done: 0
};
function isTaskStatus(value) {
    return value === 'todo' || value === 'in_progress' || value === 'blocked' || value === 'done';
}
function normalizeTask(candidate) {
    if (typeof candidate !== 'object' || candidate === null) {
        throw new Error('Task entries must be objects.');
    }
    const record = candidate;
    if (typeof record.id !== 'string' || typeof record.title !== 'string' || !isTaskStatus(record.status)) {
        throw new Error('Each task requires string id/title fields and a valid status.');
    }
    return {
        id: record.id,
        title: record.title,
        status: record.status,
        notes: typeof record.notes === 'string' ? record.notes : undefined,
        validation: typeof record.validation === 'string' ? record.validation : undefined,
        blocker: typeof record.blocker === 'string' ? record.blocker : undefined
    };
}
function createDefaultTaskFile() {
    return {
        version: 1,
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
    if (!raw.trim()) {
        return createDefaultTaskFile();
    }
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('Task file must be a JSON object.');
    }
    const record = parsed;
    if (!Array.isArray(record.tasks)) {
        throw new Error('Task file must contain a tasks array.');
    }
    return {
        version: 1,
        tasks: record.tasks.map((task) => normalizeTask(task))
    };
}
function stringifyTaskFile(taskFile) {
    return `${JSON.stringify(taskFile, null, 2)}\n`;
}
function countTaskStatuses(taskFile) {
    const counts = { ...EMPTY_COUNTS };
    for (const task of taskFile.tasks) {
        counts[task.status] += 1;
    }
    return counts;
}
//# sourceMappingURL=taskFile.js.map