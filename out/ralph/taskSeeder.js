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
exports.TaskSeedingError = void 0;
exports.parseTaskSeedResponse = parseTaskSeedResponse;
exports.seedTasksFromRequest = seedTasksFromRequest;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const integrity_1 = require("./integrity");
const taskCreation_1 = require("./taskCreation");
const projectGenerator_1 = require("./projectGenerator");
class TaskSeedingError extends Error {
    constructor(message) {
        super(message);
        this.name = 'TaskSeedingError';
    }
}
exports.TaskSeedingError = TaskSeedingError;
const TASK_SEEDING_PROMPT_TEMPLATE = `You are generating Ralph backlog tasks from one high-level request.

Return ONLY a fenced JSON block with a top-level object containing a non-empty "tasks" array.
Do not include markdown outside the JSON fence.

Request:
<request>
{REQUEST}
</request>

Requirements:
- Output between 2 and 8 tasks unless the request is truly smaller.
- Each task object must include string fields "id" and "title".
- Ralph will force every imported task status to "todo", so any emitted status is informational only.
- Optional fields allowed when useful: "notes", "rationale", "dependsOn", "acceptance", "constraints", "context", "priority", "mode", "tier", and "suggestedValidationCommand".
- Keep fields concise, deterministic, and directly useful for autonomous execution.
- Use flat top-level tasks only. Do not emit child task IDs like T1.1.

Respond with EXACTLY:

\`\`\`json
{
  "tasks": [
    {
      "id": "T1",
      "title": "short task title",
      "status": "todo",
      "suggestedValidationCommand": "npm run validate",
      "acceptance": ["one concrete done check"],
      "context": ["src/example.ts"],
      "tier": "medium"
    }
  ]
}
\`\`\``;
function nextAvailableTaskId(existingIds) {
    let counter = 1;
    while (existingIds.has(`T${counter}`)) {
        counter += 1;
    }
    return `T${counter}`;
}
function normalizeSeedTaskIds(tasks, existingTaskIds) {
    const knownIds = new Set(existingTaskIds);
    const warnings = [];
    const seededIdMap = new Map();
    const normalizedTasks = tasks.map((task) => {
        const preferredId = task.id.trim();
        const finalId = preferredId && !knownIds.has(preferredId)
            ? preferredId
            : nextAvailableTaskId(knownIds);
        if (preferredId !== finalId) {
            warnings.push(`Remapped seeded task id "${task.id}" to "${finalId}" to avoid a duplicate or empty id.`);
        }
        knownIds.add(finalId);
        if (preferredId && !seededIdMap.has(preferredId)) {
            seededIdMap.set(preferredId, finalId);
        }
        return {
            ...task,
            id: finalId
        };
    });
    const remappedTasks = normalizedTasks.map((task) => {
        if (!Array.isArray(task.dependsOn)) {
            return task;
        }
        return {
            ...task,
            dependsOn: task.dependsOn.map((dependency) => {
                if (typeof dependency === 'string') {
                    return seededIdMap.get(dependency.trim()) ?? dependency;
                }
                if (dependency && typeof dependency === 'object' && 'taskId' in dependency) {
                    const taskId = String(dependency.taskId);
                    return {
                        ...dependency,
                        taskId: seededIdMap.get(taskId.trim()) ?? taskId
                    };
                }
                return dependency;
            })
        };
    });
    if (remappedTasks.length > 8) {
        warnings.push(`Response contained ${remappedTasks.length} tasks; expected 2-8 for a single seeding request.`);
    }
    return {
        tasks: remappedTasks,
        warnings
    };
}
function parseTaskSeedResponse(responseText, existingTaskIds = []) {
    const fencePattern = /```json\s*([\s\S]*?)```/g;
    let lastMatch = null;
    let match;
    while ((match = fencePattern.exec(responseText)) !== null) {
        lastMatch = match;
    }
    if (!lastMatch) {
        throw new TaskSeedingError('AI response did not contain a fenced JSON block.');
    }
    let parsed;
    try {
        parsed = JSON.parse(lastMatch[1].trim());
    }
    catch {
        throw new TaskSeedingError('AI response contained malformed JSON in the task-seeding block.');
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new TaskSeedingError('AI response JSON block must be an object with a non-empty "tasks" array.');
    }
    const record = parsed;
    if (!Array.isArray(record.tasks) || record.tasks.length === 0) {
        throw new TaskSeedingError('AI response JSON block must contain a non-empty "tasks" array.');
    }
    const tasks = record.tasks.map((candidate, index) => {
        if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
            throw new TaskSeedingError(`Task at index ${index} must be an object.`);
        }
        const item = { ...candidate };
        if (typeof item.id !== 'string' || typeof item.title !== 'string') {
            throw new TaskSeedingError(`Task at index ${index} is missing required string fields "id" and "title".`);
        }
        const validation = typeof item.suggestedValidationCommand === 'string' && item.suggestedValidationCommand.trim()
            ? item.suggestedValidationCommand.trim()
            : undefined;
        delete item.status;
        delete item.suggestedValidationCommand;
        return {
            ...item,
            id: item.id,
            title: item.title,
            status: 'todo',
            ...(validation !== undefined ? { validation } : {})
        };
    });
    return normalizeSeedTaskIds(tasks, existingTaskIds);
}
function buildTaskSeedingPrompt(requestText) {
    return TASK_SEEDING_PROMPT_TEMPLATE.replace('{REQUEST}', requestText.replace(/<\/request>/gi, '[/request]'));
}
async function writeTaskSeedingArtifact(artifactRootDir, artifact) {
    const targetDir = path.join(artifactRootDir, 'task-seeding');
    await fs.mkdir(targetDir, { recursive: true });
    const compactTimestamp = artifact.createdAt.replace(/[:.]/g, '-');
    const artifactPath = path.join(targetDir, `task-seeding-${compactTimestamp}.json`);
    await fs.writeFile(artifactPath, (0, integrity_1.stableJson)(artifact), 'utf8');
    return artifactPath;
}
async function seedTasksFromRequest(input) {
    const prompt = buildTaskSeedingPrompt(input.requestText.trim());
    let execution;
    try {
        execution = await (0, projectGenerator_1.runPromptThroughConfiguredProvider)(prompt, input.config, input.cwd, 'ralph-task-seed');
    }
    catch (error) {
        if (error instanceof projectGenerator_1.ProjectGenerationError) {
            throw new TaskSeedingError(error.message);
        }
        throw error;
    }
    const parsed = parseTaskSeedResponse(execution.responseText, input.existingTaskIds ?? []);
    try {
        (0, taskCreation_1.normalizeTaskInputsForPersistence)(parsed.tasks);
    }
    catch (error) {
        throw new TaskSeedingError(error instanceof Error ? error.message : String(error));
    }
    const artifact = {
        schemaVersion: 1,
        kind: 'taskSeeding',
        createdAt: new Date().toISOString(),
        sourceRequest: input.requestText.trim(),
        provider: {
            id: execution.providerId,
            commandPath: execution.commandPath,
            model: input.config.model
        },
        launchMetadata: {
            cwd: execution.launchCwd,
            args: execution.launchArgs,
            shell: execution.launchShell
        },
        taskDrafts: parsed.tasks,
        warnings: parsed.warnings
    };
    const artifactPath = await writeTaskSeedingArtifact(input.artifactRootDir, artifact);
    return {
        tasks: parsed.tasks,
        warnings: parsed.warnings,
        artifactPath,
        artifact
    };
}
//# sourceMappingURL=taskSeeder.js.map