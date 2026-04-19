import * as fs from 'fs/promises';
import * as path from 'path';
import type { RalphCodexConfig } from '../config/types';
import { stableJson } from './integrity';
import { normalizeTaskInputsForPersistence } from './taskCreation';
import type { RalphNewTaskInput } from './taskNormalization';
import { ProjectGenerationError, runPromptThroughConfiguredProvider } from './projectGenerator';

export class TaskSeedingError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'TaskSeedingError';
  }
}

export interface TaskSeedingArtifact {
  schemaVersion: 1;
  kind: 'taskSeeding';
  createdAt: string;
  sourceRequest: string;
  provider: {
    id: string;
    commandPath: string;
    model: string;
  };
  launchMetadata: {
    cwd: string;
    args: string[];
    shell: boolean;
  };
  taskDrafts: RalphNewTaskInput[];
  warnings: string[];
}

export interface ParseTaskSeedResponseResult {
  tasks: RalphNewTaskInput[];
  warnings: string[];
}

export interface SeedTasksFromRequestResult {
  tasks: RalphNewTaskInput[];
  warnings: string[];
  artifactPath: string;
  artifact: TaskSeedingArtifact;
}

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

function nextAvailableTaskId(existingIds: Set<string>): string {
  let counter = 1;
  while (existingIds.has(`T${counter}`)) {
    counter += 1;
  }
  return `T${counter}`;
}

function normalizeSeedTaskIds(
  tasks: RalphNewTaskInput[],
  existingTaskIds: Iterable<string>
): ParseTaskSeedResponseResult {
  const knownIds = new Set(existingTaskIds);
  const warnings: string[] = [];
  const seededIdMap = new Map<string, string>();
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
          const taskId = String((dependency as { taskId: unknown }).taskId);
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
    warnings.push(
      `Response contained ${remappedTasks.length} tasks; expected 2-8 for a single seeding request.`
    );
  }

  return {
    tasks: remappedTasks,
    warnings
  };
}

export function parseTaskSeedResponse(
  responseText: string,
  existingTaskIds: Iterable<string> = []
): ParseTaskSeedResponseResult {
  const fencePattern = /```json\s*([\s\S]*?)```/g;
  let lastMatch: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;
  while ((match = fencePattern.exec(responseText)) !== null) {
    lastMatch = match;
  }

  if (!lastMatch) {
    throw new TaskSeedingError('AI response did not contain a fenced JSON block.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(lastMatch[1]!.trim());
  } catch {
    throw new TaskSeedingError('AI response contained malformed JSON in the task-seeding block.');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new TaskSeedingError('AI response JSON block must be an object with a non-empty "tasks" array.');
  }

  const record = parsed as Record<string, unknown>;
  if (!Array.isArray(record.tasks) || record.tasks.length === 0) {
    throw new TaskSeedingError('AI response JSON block must contain a non-empty "tasks" array.');
  }

  const tasks = record.tasks.map((candidate, index) => {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
      throw new TaskSeedingError(`Task at index ${index} must be an object.`);
    }

    const item = { ...(candidate as Record<string, unknown>) };
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
      status: 'todo' as const,
      ...(validation !== undefined ? { validation } : {})
    } as RalphNewTaskInput;
  });

  return normalizeSeedTaskIds(tasks, existingTaskIds);
}

function buildTaskSeedingPrompt(requestText: string): string {
  return TASK_SEEDING_PROMPT_TEMPLATE.replace('{REQUEST}', requestText.replace(/<\/request>/gi, '[/request]'));
}

async function writeTaskSeedingArtifact(
  artifactRootDir: string,
  artifact: TaskSeedingArtifact
): Promise<string> {
  const targetDir = path.join(artifactRootDir, 'task-seeding');
  await fs.mkdir(targetDir, { recursive: true });

  const compactTimestamp = artifact.createdAt.replace(/[:.]/g, '-');
  const artifactPath = path.join(targetDir, `task-seeding-${compactTimestamp}.json`);
  await fs.writeFile(artifactPath, stableJson(artifact), 'utf8');
  return artifactPath;
}

export async function seedTasksFromRequest(input: {
  requestText: string;
  config: RalphCodexConfig;
  cwd: string;
  artifactRootDir: string;
  existingTaskIds?: Iterable<string>;
}): Promise<SeedTasksFromRequestResult> {
  const prompt = buildTaskSeedingPrompt(input.requestText.trim());

  let execution;
  try {
    execution = await runPromptThroughConfiguredProvider(prompt, input.config, input.cwd, 'ralph-task-seed');
  } catch (error) {
    if (error instanceof ProjectGenerationError) {
      throw new TaskSeedingError(error.message);
    }
    throw error;
  }

  const parsed = parseTaskSeedResponse(execution.responseText, input.existingTaskIds ?? []);

  try {
    normalizeTaskInputsForPersistence(parsed.tasks);
  } catch (error) {
    throw new TaskSeedingError(error instanceof Error ? error.message : String(error));
  }

  const artifact: TaskSeedingArtifact = {
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
