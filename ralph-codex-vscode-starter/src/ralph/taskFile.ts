import { RalphTask, RalphTaskCounts, RalphTaskFile, RalphTaskStatus } from './types';

const EMPTY_COUNTS: RalphTaskCounts = {
  todo: 0,
  in_progress: 0,
  blocked: 0,
  done: 0
};

function isTaskStatus(value: unknown): value is RalphTaskStatus {
  return value === 'todo' || value === 'in_progress' || value === 'blocked' || value === 'done';
}

function normalizeTask(candidate: unknown): RalphTask {
  if (typeof candidate !== 'object' || candidate === null) {
    throw new Error('Task entries must be objects.');
  }

  const record = candidate as Record<string, unknown>;
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

export function createDefaultTaskFile(): RalphTaskFile {
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

export function parseTaskFile(raw: string): RalphTaskFile {
  if (!raw.trim()) {
    return createDefaultTaskFile();
  }

  const parsed = JSON.parse(raw) as unknown;
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Task file must be a JSON object.');
  }

  const record = parsed as Record<string, unknown>;
  if (!Array.isArray(record.tasks)) {
    throw new Error('Task file must contain a tasks array.');
  }

  return {
    version: 1,
    tasks: record.tasks.map((task) => normalizeTask(task))
  };
}

export function stringifyTaskFile(taskFile: RalphTaskFile): string {
  return `${JSON.stringify(taskFile, null, 2)}\n`;
}

export function countTaskStatuses(taskFile: RalphTaskFile): RalphTaskCounts {
  const counts = { ...EMPTY_COUNTS };
  for (const task of taskFile.tasks) {
    counts[task.status] += 1;
  }
  return counts;
}
