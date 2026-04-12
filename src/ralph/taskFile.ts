import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { withFileLock } from '../util/fileLock';
import {
  RalphAgentRole,
  RalphPreflightDiagnostic,
  RalphSuggestedChildTask,
  RalphTask,
  RalphTaskCounts,
  RalphTaskFile,
  RalphTaskMode,
  RalphTaskPriority,
  RalphTaskSourceLocation,
  RalphTaskStatus
} from './types';

// Re-export claims module so existing `import { ... } from './taskFile'` paths
// continue to work without any changes to consumers.
export * from './taskClaims';

const EMPTY_COUNTS: RalphTaskCounts = {
  todo: 0,
  in_progress: 0,
  blocked: 0,
  done: 0
};

const SUPPORTED_TASK_FIELDS = new Set([
  'id',
  'title',
  'status',
  'parentId',
  'dependsOn',
  'notes',
  'validation',
  'blocker',
  'priority',
  'mode',
  'tier',
  'acceptance',
  'constraints',
  'context'
]);

const LIKELY_TASK_FIELD_MISTAKES = new Map<string, string>([
  ['dependencies', 'dependsOn'],
  ['dependency', 'dependsOn'],
  ['dependson', 'dependsOn'],
  ['depends_on', 'dependsOn'],
  ['acceptancecriteria', 'acceptance'],
  ['acceptance_criteria', 'acceptance'],
  ['donecriteria', 'acceptance'],
  ['done_criteria', 'acceptance'],
  ['guardrails', 'constraints'],
  ['guard_rails', 'constraints'],
  ['files', 'context'],
  ['relevantfiles', 'context'],
  ['relevant_files', 'context'],
  ['type', 'mode'],
  ['taskmode', 'mode'],
  ['task_mode', 'mode'],
  ['tasktype', 'mode'],
  ['task_type', 'mode']
]);

export interface RalphTaskFileInspection {
  taskFile: RalphTaskFile | null;
  text: string | null;
  migrated: boolean;
  diagnostics: RalphPreflightDiagnostic[];
}

export interface RalphTaskFileLockOptions {
  lockRetryCount?: number;
  lockRetryDelayMs?: number;
}

export interface RalphTaskFileLockTimeout {
  outcome: 'lock_timeout';
  lockPath: string;
  attempts: number;
}

export interface RalphTaskFileLockAcquired<T> {
  outcome: 'ok';
  value: T;
}

export type RalphTaskFileLockResult<T> = RalphTaskFileLockAcquired<T> | RalphTaskFileLockTimeout;

function isTaskStatus(value: unknown): value is RalphTaskStatus {
  return value === 'todo' || value === 'in_progress' || value === 'blocked' || value === 'done';
}

export async function withTaskFileLock<T>(
  taskFilePath: string,
  options: RalphTaskFileLockOptions | undefined,
  fn: () => Promise<T>
): Promise<RalphTaskFileLockResult<T>> {
  const lockPath = path.join(path.dirname(taskFilePath), 'tasks.lock');
  return await withFileLock(lockPath, {
    lockRetryCount: options?.lockRetryCount,
    lockRetryDelayMs: options?.lockRetryDelayMs
  }, fn) as RalphTaskFileLockResult<T>;
}

function normalizeOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  return typeof record[key] === 'string' && record[key].trim().length > 0
    ? record[key].trim()
    : undefined;
}

function normalizeTaskPriority(value: unknown): RalphTaskPriority | undefined {
  if (value === 'low' || value === 'normal' || value === 'high') {
    return value;
  }
  return undefined;
}

function normalizeTaskMode(value: unknown): RalphTaskMode | undefined {
  if (value === 'default' || value === 'documentation') {
    return value;
  }
  return undefined;
}

function normalizeTaskTier(value: unknown): RalphTask['tier'] | undefined {
  if (value === 'simple' || value === 'medium' || value === 'complex') {
    return value;
  }
  return undefined;
}

function normalizeOptionalStringArray(record: Record<string, unknown>, key: string): string[] | undefined {
  if (!Array.isArray(record[key])) {
    return undefined;
  }

  const normalized = record[key]
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return normalized.length > 0 ? normalized : undefined;
}

function normalizeDependencyList(record: Record<string, unknown>): string[] | undefined {
  if (!Array.isArray(record.dependsOn)) {
    return undefined;
  }

  const normalized = Array.from(new Set(
    record.dependsOn
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
  ));

  return normalized.length > 0 ? normalized : undefined;
}

function locationLabel(location: RalphTaskSourceLocation): string {
  return `tasks[${location.arrayIndex}] (line ${location.line}, column ${location.column})`;
}

function taskLabel(task: Pick<RalphTask, 'id' | 'source'>): string {
  return task.source
    ? `Task ${task.id} at ${locationLabel(task.source)}`
    : `Task ${task.id}`;
}

function entryLabel(index: number, location?: RalphTaskSourceLocation): string {
  return location ? `Task entry ${index + 1} at ${locationLabel(location)}` : `Task entry ${index + 1}`;
}

function normalizedFieldKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

/**
 * Remap known wrong field names to their correct equivalents in place.
 * Returns the list of corrected keys (original → corrected) for diagnostics.
 */
function autoCorrectKnownMistakes(record: Record<string, unknown>): Array<{ original: string; corrected: string }> {
  const corrections: Array<{ original: string; corrected: string }> = [];

  for (const key of Object.keys(record)) {
    if (SUPPORTED_TASK_FIELDS.has(key)) {
      continue;
    }

    const corrected = LIKELY_TASK_FIELD_MISTAKES.get(normalizedFieldKey(key));
    if (!corrected) {
      continue;
    }

    // Only copy if the correct field is not already set.
    if (record[corrected] === undefined) {
      record[corrected] = record[key];
    }
    delete record[key];
    corrections.push({ original: key, corrected });
  }

  return corrections;
}

function lineAndColumnAt(text: string, index: number): { line: number; column: number } {
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

function parseJsonString(text: string, startIndex: number): { value: string; endIndex: number } {
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
        value: JSON.parse(`"${value}"`) as string,
        endIndex: index + 1
      };
    }

    value += char;
    index += 1;
  }

  throw new Error('Unexpected end of JSON string.');
}

function skipWhitespace(text: string, startIndex: number): number {
  let index = startIndex;
  while (index < text.length && /\s/.test(text[index])) {
    index += 1;
  }
  return index;
}

function findTasksArrayStart(text: string): number | null {
  let objectDepth = 0;
  let arrayDepth = 0;
  let lastToken: string | null = null;
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

function extractTaskEntryLocations(raw: string): RalphTaskSourceLocation[] {
  const arrayStart = findTasksArrayStart(raw);
  if (arrayStart === null) {
    return [];
  }

  const locations: RalphTaskSourceLocation[] = [];
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
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
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

function normalizeTask(candidate: unknown, source?: RalphTaskSourceLocation): RalphTask {
  if (typeof candidate !== 'object' || candidate === null) {
    throw new Error('Task entries must be objects.');
  }

  const record = candidate as Record<string, unknown>;
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
    priority: normalizeTaskPriority(record.priority),
    mode: normalizeTaskMode(record.mode),
    tier: normalizeTaskTier(record.tier),
    acceptance: normalizeOptionalStringArray(record, 'acceptance'),
    constraints: normalizeOptionalStringArray(record, 'constraints'),
    context: normalizeOptionalStringArray(record, 'context'),
    source
  };
}

function createTaskGraphDiagnostic(
  code: string,
  message: string,
  details: Pick<RalphPreflightDiagnostic, 'taskId' | 'relatedTaskIds' | 'location' | 'relatedLocations'> & { severity?: RalphPreflightDiagnostic['severity'] } = {}
): RalphPreflightDiagnostic {
  const { severity: explicitSeverity, ...rest } = details;
  return {
    category: 'taskGraph',
    severity: explicitSeverity ?? 'error',
    code,
    message,
    ...rest
  };
}

function legacyParentCandidates(taskId: string): string[] {
  const candidates: string[] = [];

  for (const separator of ['.', '-', '/']) {
    const lastIndex = taskId.lastIndexOf(separator);
    if (lastIndex > 0) {
      candidates.push(taskId.slice(0, lastIndex));
    }
  }

  return candidates;
}

function inferLegacyParentId(taskId: string, knownIds: Set<string>): string | undefined {
  const matches = legacyParentCandidates(taskId)
    .filter((candidate) => knownIds.has(candidate))
    .sort((left, right) => right.length - left.length);

  return matches[0];
}

function uniqueDiagnostics(diagnostics: RalphPreflightDiagnostic[]): RalphPreflightDiagnostic[] {
  const seen = new Set<string>();
  const ordered: RalphPreflightDiagnostic[] = [];

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

function buildTaskIndex(taskFile: RalphTaskFile): Map<string, RalphTask[]> {
  const index = new Map<string, RalphTask[]>();

  for (const task of taskFile.tasks) {
    const bucket = index.get(task.id);
    if (bucket) {
      bucket.push(task);
    } else {
      index.set(task.id, [task]);
    }
  }

  return index;
}

function detectGraphCycles(input: {
  tasks: RalphTask[];
  code: string;
  describe(currentTask: RalphTask): string[];
  message(kind: 'self' | 'cycle', task: RalphTask, path: string[]): string;
}): RalphPreflightDiagnostic[] {
  const diagnostics: RalphPreflightDiagnostic[] = [];
  const uniqueTasks = new Map<string, RalphTask>();

  for (const task of input.tasks) {
    if (!uniqueTasks.has(task.id)) {
      uniqueTasks.set(task.id, task);
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const reportedCycles = new Set<string>();

  const visit = (taskId: string, stack: string[]): void => {
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
        diagnostics.push(createTaskGraphDiagnostic(
          input.code,
          input.message('self', task, [taskId]),
          {
            taskId,
            relatedTaskIds: [taskId],
            location: task.source,
            relatedLocations: task.source ? [task.source] : undefined
          }
        ));
        continue;
      }

      if (visiting.has(neighborId)) {
        const startIndex = stack.indexOf(neighborId);
        const cyclePath = [...stack.slice(startIndex), neighborId];
        const cycleKey = cyclePath.join('->');
        if (!reportedCycles.has(cycleKey)) {
          reportedCycles.add(cycleKey);
          diagnostics.push(createTaskGraphDiagnostic(
            input.code,
            input.message('cycle', task, cyclePath),
            {
              taskId,
              relatedTaskIds: cyclePath,
              location: task.source,
              relatedLocations: cyclePath
                .map((cycleTaskId) => uniqueTasks.get(cycleTaskId)?.source)
                .filter((location): location is RalphTaskSourceLocation => Boolean(location))
            }
          ));
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

export function inspectTaskGraph(taskFile: RalphTaskFile): RalphPreflightDiagnostic[] {
  const diagnostics: RalphPreflightDiagnostic[] = [];
  const taskIndex = buildTaskIndex(taskFile);

  for (const [taskId, tasks] of taskIndex.entries()) {
    if (!taskId.trim()) {
      diagnostics.push(createTaskGraphDiagnostic('task_id_empty', 'Task ids must be non-empty strings.'));
      continue;
    }

    if (tasks.length > 1) {
      diagnostics.push(createTaskGraphDiagnostic(
        'duplicate_task_id',
        `Task id ${taskId} must be unique. Found duplicates at ${tasks
          .map((task) => task.source ? locationLabel(task.source) : 'unknown location')
          .join(', ')}.`,
        {
          taskId,
          relatedTaskIds: tasks.map((task) => task.id),
          location: tasks[0]?.source,
          relatedLocations: tasks
            .map((task) => task.source)
            .filter((location): location is RalphTaskSourceLocation => Boolean(location))
        }
      ));
    }
  }

  for (const task of taskFile.tasks) {
    if (task.parentId) {
      if (task.parentId === task.id) {
        diagnostics.push(createTaskGraphDiagnostic(
          'self_parent_reference',
          `${taskLabel(task)} cannot reference itself as parent.`,
          {
            taskId: task.id,
            relatedTaskIds: [task.id],
            location: task.source,
            relatedLocations: task.source ? [task.source] : undefined
          }
        ));
      } else if (!taskIndex.has(task.parentId)) {
        diagnostics.push(createTaskGraphDiagnostic(
          'orphaned_parent_reference',
          `${taskLabel(task)} references missing parentId ${task.parentId}.`,
          {
            taskId: task.id,
            relatedTaskIds: [task.parentId],
            location: task.source
          }
        ));
      }
    }

    if (task.status === 'done') {
      const unfinishedDescendants = collectDescendants(taskFile, task.id)
        .filter((descendant) => descendant.status !== 'done');

      if (unfinishedDescendants.length > 0) {
        diagnostics.push(createTaskGraphDiagnostic(
          'completed_parent_with_incomplete_descendants',
          `${taskLabel(task)} is marked done but descendant tasks are still unfinished: ${unfinishedDescendants
            .map((descendant) => `${descendant.id} (${descendant.status})`)
            .join(', ')}.`,
          {
            taskId: task.id,
            relatedTaskIds: unfinishedDescendants.map((descendant) => descendant.id),
            location: task.source,
            relatedLocations: unfinishedDescendants
              .map((descendant) => descendant.source)
              .filter((location): location is RalphTaskSourceLocation => Boolean(location))
          }
        ));
      }
    }

    for (const dependencyId of task.dependsOn ?? []) {
      if (dependencyId === task.id) {
        diagnostics.push(createTaskGraphDiagnostic(
          'self_dependency_reference',
          `${taskLabel(task)} cannot depend on itself.`,
          {
            taskId: task.id,
            relatedTaskIds: [task.id],
            location: task.source,
            relatedLocations: task.source ? [task.source] : undefined
          }
        ));
        continue;
      }

      if (!taskIndex.has(dependencyId)) {
        diagnostics.push(createTaskGraphDiagnostic(
          'invalid_dependency_reference',
          `${taskLabel(task)} references missing dependency ${dependencyId}.`,
          {
            taskId: task.id,
            relatedTaskIds: [dependencyId],
            location: task.source
          }
        ));
        continue;
      }

      const dependencyTask = taskIndex.get(dependencyId)?.[0];
      if (task.status === 'done' && dependencyTask?.status !== 'done') {
        diagnostics.push(createTaskGraphDiagnostic(
          'completed_task_with_incomplete_dependencies',
          `${taskLabel(task)} is marked done but dependency ${dependencyId} is ${dependencyTask?.status ?? 'not done'}.`,
          {
            taskId: task.id,
            relatedTaskIds: [dependencyId],
            location: task.source,
            relatedLocations: dependencyTask?.source ? [dependencyTask.source] : undefined
          }
        ));
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

function formatTaskGraphDiagnostics(diagnostics: RalphPreflightDiagnostic[]): string {
  return diagnostics.map((diagnostic) => diagnostic.message).join(' ');
}

export function inspectTaskFileText(raw: string): RalphTaskFileInspection {
  if (!raw.trim()) {
    const taskFile = createDefaultTaskFile();
    return {
      taskFile,
      text: stringifyTaskFile(taskFile),
      migrated: true,
      diagnostics: []
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return {
      taskFile: null,
      text: null,
      migrated: false,
      diagnostics: [
        createTaskGraphDiagnostic(
          'task_file_json_invalid',
          `Task file must be valid JSON: ${error instanceof Error ? error.message : String(error)}.`
        )
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

  const record = parsed as Record<string, unknown>;
  if (!Array.isArray(record.tasks)) {
    return {
      taskFile: null,
      text: null,
      migrated: false,
      diagnostics: [createTaskGraphDiagnostic('task_array_missing', 'Task file must contain a tasks array.')]
    };
  }

  const diagnostics: RalphPreflightDiagnostic[] = [];
  const normalizedTasks: RalphTask[] = [];
  const entryLocations = extractTaskEntryLocations(raw);

  for (const [index, candidate] of record.tasks.entries()) {
    const location = entryLocations[index];
    if (typeof candidate === 'object' && candidate !== null) {
      const taskRecord = candidate as Record<string, unknown>;

      // Auto-correct known field name mistakes before validation.
      const corrections = autoCorrectKnownMistakes(taskRecord);
      for (const { original, corrected } of corrections) {
        diagnostics.push(createTaskGraphDiagnostic(
          'auto_corrected_task_field',
          `${entryLabel(index, location)} used "${original}" which was auto-corrected to "${corrected}".`,
          {
            severity: 'warning',
            location
          }
        ));
      }
    }

    try {
      normalizedTasks.push(normalizeTask(candidate, location));
    } catch (error) {
      diagnostics.push(createTaskGraphDiagnostic(
        'task_entry_invalid',
        `${entryLabel(index, location)} is invalid: ${error instanceof Error ? error.message : String(error)}.`,
        {
          location
        }
      ));
    }
  }

  const hasErrors = diagnostics.some((diagnostic) => diagnostic.severity === 'error');
  if (hasErrors) {
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
  // Strip parentId from non-done tasks whose declared parent is already done.
  // When an agent proposes follow-on tasks under a done parent (either directly or
  // via a completion-report suggestedChildTasks block), the resulting
  // "completed_parent_with_incomplete_descendants" error would crash the loop.
  // Auto-correcting here keeps the task as a top-level task so work can continue.
  const statusById = new Map(migratedTasks.map((task) => [task.id, task.status]));
  const correctedTasks = migratedTasks.map((task) => {
    // Only strip todo tasks — in_progress/blocked under a done parent is a
    // genuine stuck state that should remain an error and block the loop.
    if (task.parentId && task.status === 'todo' && statusById.get(task.parentId) === 'done') {
      diagnostics.push(createTaskGraphDiagnostic(
        'auto_corrected_parent_reference',
        `${taskLabel(task)} had parentId "${task.parentId}" which is already done; parentId stripped to prevent a stuck state.`,
        {
          severity: 'warning',
          taskId: task.id,
          relatedTaskIds: [task.parentId],
          location: task.source
        }
      ));
      const { parentId: _stripped, ...rest } = task;
      return rest as RalphTask;
    }
    return task;
  });

  const parsedMutationCount = typeof record.mutationCount === 'number' && Number.isInteger(record.mutationCount) && record.mutationCount >= 0
    ? record.mutationCount
    : undefined;
  const taskFile: RalphTaskFile = {
    version: 2,
    tasks: correctedTasks,
    ...(parsedMutationCount !== undefined ? { mutationCount: parsedMutationCount } : {})
  };
  const taskDiagnostics = inspectTaskGraph(taskFile);
  const allDiagnostics = [...diagnostics, ...taskDiagnostics];
  const normalizedText = stringifyTaskFile(taskFile);

  return {
    taskFile: taskDiagnostics.length === 0 ? taskFile : null,
    text: taskDiagnostics.length === 0 ? normalizedText : null,
    migrated: explicitVersion !== 2
      || migratedTasks.some((task, index) => task.parentId !== normalizedTasks[index].parentId)
      || correctedTasks.some((task, index) => task.parentId !== migratedTasks[index].parentId)
      || raw.trimEnd() !== normalizedText.trimEnd(),
    diagnostics: allDiagnostics
  };
}

function isDependencySatisfied(taskFile: RalphTaskFile, dependencyId: string): boolean {
  return findTaskById(taskFile, dependencyId)?.status === 'done';
}

function isTaskSelectable(taskFile: RalphTaskFile, task: RalphTask): boolean {
  return (task.dependsOn ?? []).every((dependencyId) => isDependencySatisfied(taskFile, dependencyId));
}

function collectDescendants(taskFile: RalphTaskFile, taskId: string, seen = new Set<string>()): RalphTask[] {
  const directChildren = taskFile.tasks.filter((task) => task.parentId === taskId);
  const descendants: RalphTask[] = [];

  for (const child of directChildren) {
    if (seen.has(child.id)) {
      continue;
    }

    seen.add(child.id);
    descendants.push(child, ...collectDescendants(taskFile, child.id, seen));
  }

  return descendants;
}

export function createDefaultTaskFile(): RalphTaskFile {
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

export function parseTaskFile(raw: string): RalphTaskFile {
  const inspection = inspectTaskFileText(raw);
  if (inspection.taskFile) {
    return inspection.taskFile;
  }

  throw new Error(formatTaskGraphDiagnostics(inspection.diagnostics));
}

export function normalizeTaskFileText(raw: string): { taskFile: RalphTaskFile; text: string; migrated: boolean } {
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

export function bumpMutationCount(taskFile: RalphTaskFile): RalphTaskFile {
  return {
    ...taskFile,
    mutationCount: (taskFile.mutationCount ?? 0) + 1
  };
}

export function stringifyTaskFile(taskFile: RalphTaskFile): string {
  const obj: Record<string, unknown> = {
    version: taskFile.version,
    tasks: taskFile.tasks.map(({ source: _source, ...task }) => task)
  };
  if (taskFile.mutationCount !== undefined) {
    obj.mutationCount = taskFile.mutationCount;
  }
  return `${JSON.stringify(obj, null, 2)}\n`;
}

export function countTaskStatuses(taskFile: RalphTaskFile): RalphTaskCounts {
  const counts = { ...EMPTY_COUNTS };
  for (const task of taskFile.tasks) {
    counts[task.status] += 1;
  }
  return counts;
}

const PRIORITY_ORDER: Record<RalphTaskPriority, number> = { high: 0, normal: 1, low: 2 };

function taskPriorityOrder(task: RalphTask): number {
  return PRIORITY_ORDER[task.priority ?? 'normal'];
}

export function listSelectableTasks(taskFile: RalphTaskFile): RalphTask[] {
  const inProgress = taskFile.tasks.filter((task) => task.status === 'in_progress' && isTaskSelectable(taskFile, task));
  const todo = taskFile.tasks.filter((task) => task.status === 'todo' && isTaskSelectable(taskFile, task));

  // Within each status bucket, sort by priority (high first) while preserving
  // original array order for equal-priority tasks (stable sort).
  const sortByPriority = (tasks: RalphTask[]): RalphTask[] =>
    [...tasks].sort((left, right) => taskPriorityOrder(left) - taskPriorityOrder(right));

  return [...sortByPriority(inProgress), ...sortByPriority(todo)];
}

export function selectNextTask(taskFile: RalphTaskFile): RalphTask | null {
  return listSelectableTasks(taskFile)[0] ?? null;
}

async function taskArtifactExists(artifactsDir: string, taskId: string, fileName: string): Promise<boolean> {
  try {
    await fs.access(path.join(artifactsDir, taskId, fileName));
    return true;
  } catch {
    return false;
  }
}

/**
 * Selects the next task appropriate for the given agent role.
 *
 * - planner: picks the first selectable todo task that has no task-plan.json artifact.
 * - implementer: prefers todo tasks that already have a task-plan.json; falls back to
 *   any selectable task when none are planned yet (unless requirePlan=true, in which case
 *   only tasks with a task-plan.json are eligible — used for dedicated planning-pass mode).
 * - reviewer: picks the first done task that has no review.json artifact.
 * - All other roles: delegates to selectNextTask (no role filtering).
 *
 * Returns null when the role has no claimable task (agent should idle).
 */
export async function selectNextTaskForRole(
  taskFile: RalphTaskFile,
  agentRole: RalphAgentRole,
  artifactsDir: string,
  options?: { requirePlan?: boolean }
): Promise<RalphTask | null> {
  if (agentRole === 'planner') {
    const sortByPriority = (tasks: RalphTask[]): RalphTask[] =>
      [...tasks].sort((l, r) => taskPriorityOrder(l) - taskPriorityOrder(r));
    const todoTasks = sortByPriority(
      taskFile.tasks.filter((task) => task.status === 'todo' && isTaskSelectable(taskFile, task))
    );
    for (const task of todoTasks) {
      const hasPlan = await taskArtifactExists(artifactsDir, task.id, 'task-plan.json');
      if (!hasPlan) {
        return task;
      }
    }
    return null;
  }

  if (agentRole === 'implementer') {
    const selectable = listSelectableTasks(taskFile);
    // Prefer tasks that already have a task-plan.json.
    for (const task of selectable) {
      const hasPlan = await taskArtifactExists(artifactsDir, task.id, 'task-plan.json');
      if (hasPlan) {
        return task;
      }
    }
    // In dedicated planning mode (requirePlan=true), implementers wait rather
    // than claiming unplanned tasks — the planner agent must write task-plan.json first.
    if (options?.requirePlan) {
      return null;
    }
    // Fall back to any selectable task when no planned tasks are available.
    return selectable[0] ?? null;
  }

  if (agentRole === 'reviewer') {
    const sortByPriority = (tasks: RalphTask[]): RalphTask[] =>
      [...tasks].sort((l, r) => taskPriorityOrder(l) - taskPriorityOrder(r));
    const doneTasks = sortByPriority(
      taskFile.tasks.filter((task) => task.status === 'done')
    );
    for (const task of doneTasks) {
      const hasReview = await taskArtifactExists(artifactsDir, task.id, 'review.json');
      if (!hasReview) {
        return task;
      }
    }
    return null;
  }

  return selectNextTask(taskFile);
}

function collectAncestors(taskFile: RalphTaskFile, taskId: string): RalphTask[] {
  const ancestors: RalphTask[] = [];
  const seen = new Set<string>();
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

function isSatisfiedAggregateParent(taskFile: RalphTaskFile, task: RalphTask): boolean {
  if (task.status === 'done' || task.validation) {
    return false;
  }

  const descendants = collectDescendants(taskFile, task.id);
  if (descendants.length === 0 || descendants.some((descendant) => descendant.status !== 'done')) {
    return false;
  }

  const descendantIds = new Set(descendants.map((descendant) => descendant.id));
  return (task.dependsOn ?? []).every((dependencyId) => {
    if (descendantIds.has(dependencyId)) return true;
    const dep = findTaskById(taskFile, dependencyId);
    return dep?.status === 'done';
  });
}

export function autoCompleteSatisfiedAncestors(
  taskFile: RalphTaskFile,
  completedTaskId: string | null
): { taskFile: RalphTaskFile; completedAncestorIds: string[] } {
  if (!completedTaskId) {
    return {
      taskFile,
      completedAncestorIds: []
    };
  }

  let nextTaskFile = taskFile;
  const completedAncestorIds: string[] = [];

  for (const ancestor of collectAncestors(taskFile, completedTaskId)) {
    const currentAncestor = findTaskById(nextTaskFile, ancestor.id);
    if (!currentAncestor || !isSatisfiedAggregateParent(nextTaskFile, currentAncestor)) {
      continue;
    }

    nextTaskFile = {
      ...nextTaskFile,
      tasks: nextTaskFile.tasks.map((task) => (
        task.id === currentAncestor.id
          ? { ...task, status: 'done' }
          : task
      ))
    };
    completedAncestorIds.push(currentAncestor.id);
  }

  return {
    taskFile: nextTaskFile,
    completedAncestorIds
  };
}

export function isDocumentationMode(task: RalphTask | null): boolean {
  return task?.mode === 'documentation';
}

export function findTaskById(taskFile: RalphTaskFile, taskId: string | null): RalphTask | null {
  if (!taskId) {
    return null;
  }

  return taskFile.tasks.find((task) => task.id === taskId) ?? null;
}

export function applySuggestedChildTasks(
  taskFile: RalphTaskFile,
  parentTaskId: string,
  suggestedChildTasks: RalphSuggestedChildTask[]
): RalphTaskFile {
  const parentTask = findTaskById(taskFile, parentTaskId);
  if (!parentTask) {
    throw new Error(`Cannot apply decomposition proposal because parent task ${parentTaskId} does not exist.`);
  }

  // If the parent was auto-completed before all decomposition children could be applied,
  // reset it to in_progress so the new children can gate it via dependsOn. This avoids
  // a stuck state where the parent is done but children have never run.
  // Also promote todo → in_progress so pipeline scaffolding and watchdog decomposition
  // paths (which bypass the normal claim/mark-in-progress sequence) don't leave the
  // parent stuck as todo while its children gate it via dependsOn.
  const parentStatusOverride =
    parentTask.status === 'done' || parentTask.status === 'todo' ? 'in_progress' : parentTask.status;

  if (suggestedChildTasks.length === 0) {
    throw new Error(`Cannot apply decomposition proposal for ${parentTaskId} because no suggested child tasks were provided.`);
  }

  const knownTaskIds = new Set(taskFile.tasks.map((task) => task.id));
  const proposedTaskIds = new Set<string>();

  for (const child of suggestedChildTasks) {
    if (child.parentId !== parentTaskId) {
      throw new Error(
        `Cannot apply decomposition proposal because suggested child task ${child.id} targets parent ${child.parentId} instead of ${parentTaskId}.`
      );
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
        throw new Error(
          `Cannot apply decomposition proposal because child task ${child.id} depends on missing task ${dependency.taskId}.`
        );
      }
    }
  }

  const proposedChildren: RalphTask[] = suggestedChildTasks.map((child) => ({
    id: child.id,
    title: child.title,
    status: 'todo',
    parentId: child.parentId,
    dependsOn: child.dependsOn.map((dependency) => dependency.taskId),
    validation: child.validation ?? undefined,
    notes: child.rationale,
    mode: parentTask.mode,
    acceptance: child.acceptance,
    constraints: child.constraints,
    context: child.context,
    tier: child.tier
  }));

  const parentDependencies = Array.from(new Set([
    ...(parentTask.dependsOn ?? []),
    ...proposedChildren.map((child) => child.id)
  ]));

  const nextTaskFile: RalphTaskFile = {
    ...taskFile,
    tasks: [
      ...taskFile.tasks.map((task) => (
        task.id === parentTaskId
          ? {
            ...task,
            status: parentStatusOverride,
            dependsOn: parentDependencies
          }
          : task
      )),
      ...proposedChildren
    ]
  };

  const diagnostics = inspectTaskGraph(nextTaskFile);
  if (diagnostics.length > 0) {
    throw new Error(formatTaskGraphDiagnostics(diagnostics));
  }

  return nextTaskFile;
}

export async function applySuggestedChildTasksToFile(
  taskFilePath: string,
  parentTaskId: string,
  suggestedChildTasks: RalphSuggestedChildTask[]
): Promise<RalphTaskFile> {
  const locked = await withTaskFileLock(taskFilePath, undefined, async () => {
    return applySuggestedChildTasksWithinLock(taskFilePath, parentTaskId, suggestedChildTasks);
  });

  if (locked.outcome === 'lock_timeout') {
    throw new Error(
      `Timed out acquiring tasks.json lock at ${locked.lockPath} after ${locked.attempts} attempt(s).`
    );
  }

  return locked.value;
}

export async function applySuggestedChildTasksWithinLock(
  taskFilePath: string,
  parentTaskId: string,
  suggestedChildTasks: RalphSuggestedChildTask[]
): Promise<RalphTaskFile> {
  const nextTaskFile = applySuggestedChildTasks(
    parseTaskFile(await fs.readFile(taskFilePath, 'utf8')),
    parentTaskId,
    suggestedChildTasks
  );
  await fs.writeFile(taskFilePath, stringifyTaskFile(nextTaskFile), 'utf8');
  return parseTaskFile(await fs.readFile(taskFilePath, 'utf8'));
}

export function remainingSubtasks(taskFile: RalphTaskFile, taskId: string | null): RalphTask[] {
  if (!taskId) {
    return [];
  }

  return collectDescendants(taskFile, taskId).filter((task) => task.status !== 'done');
}

export async function markTaskInProgress(taskFilePath: string, taskId: string): Promise<void> {
  const locked = await withTaskFileLock(taskFilePath, undefined, async () => {
    const taskFile = parseTaskFile(await fs.readFile(taskFilePath, 'utf8'));
    const nextTaskFile: RalphTaskFile = {
      ...taskFile,
      tasks: taskFile.tasks.map((task) =>
        task.id === taskId && task.status === 'todo'
          ? { ...task, status: 'in_progress' }
          : task
      )
    };
    await fs.writeFile(taskFilePath, stringifyTaskFile(nextTaskFile), 'utf8');
  });

  if (locked.outcome === 'lock_timeout') {
    throw new Error(`Timed out acquiring tasks.json lock while marking ${taskId} in_progress.`);
  }
}
