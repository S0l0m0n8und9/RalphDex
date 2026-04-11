import * as fs from 'fs/promises';
import type { FailureAnalysis } from './failureDiagnostics';

export interface DeadLetterEntry {
  schemaVersion: 1;
  kind: 'deadLetterEntry';
  taskId: string;
  taskTitle: string;
  deadLetteredAt: string;
  diagnosticHistory: FailureAnalysis[];
  recoveryAttemptCount: number;
}

export interface DeadLetterQueue {
  schemaVersion: 1;
  kind: 'deadLetterQueue';
  entries: DeadLetterEntry[];
}

const EMPTY_QUEUE: DeadLetterQueue = {
  schemaVersion: 1,
  kind: 'deadLetterQueue',
  entries: []
};

export async function readDeadLetterQueue(deadLetterPath: string): Promise<DeadLetterQueue> {
  try {
    const text = await fs.readFile(deadLetterPath, 'utf8');
    return JSON.parse(text) as DeadLetterQueue;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { ...EMPTY_QUEUE, entries: [] };
    }
    throw err;
  }
}

export async function appendDeadLetterEntry(
  deadLetterPath: string,
  entry: DeadLetterEntry
): Promise<void> {
  const queue = await readDeadLetterQueue(deadLetterPath);
  queue.entries.push(entry);
  await fs.writeFile(deadLetterPath, JSON.stringify(queue, null, 2), 'utf8');
}

/**
 * Remove the entry with the given taskId from the dead-letter queue.
 * Returns true if an entry was removed, false if taskId was not present.
 */
export async function removeDeadLetterEntry(
  deadLetterPath: string,
  taskId: string
): Promise<boolean> {
  const queue = await readDeadLetterQueue(deadLetterPath);
  const before = queue.entries.length;
  queue.entries = queue.entries.filter((entry) => entry.taskId !== taskId);
  if (queue.entries.length === before) {
    return false;
  }
  await fs.writeFile(deadLetterPath, JSON.stringify(queue, null, 2), 'utf8');
  return true;
}
