import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import type { FailureAnalysis } from '../src/ralph/failureDiagnostics';
import {
  appendDeadLetterEntry,
  readDeadLetterQueue,
  removeDeadLetterEntry,
  type DeadLetterEntry
} from '../src/ralph/deadLetter';
import {
  parseTaskFile,
  stringifyTaskFile,
  bumpMutationCount
} from '../src/ralph/taskFile';

function makeAnalysis(override: Partial<FailureAnalysis> = {}): FailureAnalysis {
  return {
    schemaVersion: 1,
    kind: 'failureAnalysis',
    taskId: 'T1',
    createdAt: new Date().toISOString(),
    rootCauseCategory: 'transient',
    confidence: 'high',
    summary: 'Test failure.',
    suggestedAction: 'Retry.',
    ...override
  };
}

function makeEntry(override: Partial<DeadLetterEntry> = {}): DeadLetterEntry {
  return {
    schemaVersion: 1,
    kind: 'deadLetterEntry',
    taskId: 'T1',
    taskTitle: 'Test Task',
    deadLetteredAt: new Date().toISOString(),
    diagnosticHistory: [makeAnalysis()],
    recoveryAttemptCount: 3,
    ...override
  };
}

// ---------------------------------------------------------------------------
// AC 5: appendDeadLetterEntry creates file with one entry when file is absent
// ---------------------------------------------------------------------------

test('appendDeadLetterEntry creates file with one entry when file is absent', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-dl-'));
  try {
    const dlPath = path.join(tmpDir, 'dead-letter.json');
    const entry = makeEntry();

    await appendDeadLetterEntry(dlPath, entry);

    const queue = await readDeadLetterQueue(dlPath);
    assert.equal(queue.schemaVersion, 1);
    assert.equal(queue.kind, 'deadLetterQueue');
    assert.equal(queue.entries.length, 1);
    assert.equal(queue.entries[0].taskId, 'T1');
    assert.equal(queue.entries[0].recoveryAttemptCount, 3);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// appendDeadLetterEntry appends to existing file
// ---------------------------------------------------------------------------

test('appendDeadLetterEntry appends to existing file', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-dl-'));
  try {
    const dlPath = path.join(tmpDir, 'dead-letter.json');

    await appendDeadLetterEntry(dlPath, makeEntry({ taskId: 'T1', taskTitle: 'Task One' }));
    await appendDeadLetterEntry(dlPath, makeEntry({ taskId: 'T2', taskTitle: 'Task Two' }));

    const queue = await readDeadLetterQueue(dlPath);
    assert.equal(queue.entries.length, 2);
    assert.equal(queue.entries[0].taskId, 'T1');
    assert.equal(queue.entries[1].taskId, 'T2');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// AC 5: removeDeadLetterEntry returns true and removes matching entry
// ---------------------------------------------------------------------------

test('removeDeadLetterEntry returns true and removes matching entry', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-dl-'));
  try {
    const dlPath = path.join(tmpDir, 'dead-letter.json');

    await appendDeadLetterEntry(dlPath, makeEntry({ taskId: 'T1' }));
    await appendDeadLetterEntry(dlPath, makeEntry({ taskId: 'T2' }));

    const removed = await removeDeadLetterEntry(dlPath, 'T1');
    assert.equal(removed, true);

    const queue = await readDeadLetterQueue(dlPath);
    assert.equal(queue.entries.length, 1);
    assert.equal(queue.entries[0].taskId, 'T2');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// removeDeadLetterEntry returns false when taskId not present
// ---------------------------------------------------------------------------

test('removeDeadLetterEntry returns false when taskId not present', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-dl-'));
  try {
    const dlPath = path.join(tmpDir, 'dead-letter.json');

    await appendDeadLetterEntry(dlPath, makeEntry({ taskId: 'T1' }));

    const removed = await removeDeadLetterEntry(dlPath, 'T99');
    assert.equal(removed, false);

    const queue = await readDeadLetterQueue(dlPath);
    assert.equal(queue.entries.length, 1);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// readDeadLetterQueue returns empty queue when file is absent
// ---------------------------------------------------------------------------

test('readDeadLetterQueue returns empty queue when file is absent', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-dl-'));
  try {
    const dlPath = path.join(tmpDir, 'dead-letter.json');
    const queue = await readDeadLetterQueue(dlPath);
    assert.equal(queue.schemaVersion, 1);
    assert.equal(queue.kind, 'deadLetterQueue');
    assert.deepEqual(queue.entries, []);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// AC 6: requeueDeadLetterTask resets task to todo and removes from dead-letter.json
// (This tests the pure functions used by the command handler)
// ---------------------------------------------------------------------------

test('requeue: removeDeadLetterEntry + parseTaskFile + reset task to todo', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-dl-'));
  try {
    const dlPath = path.join(tmpDir, 'dead-letter.json');
    const tasksPath = path.join(tmpDir, 'tasks.json');

    // Seed dead-letter queue with one entry
    await appendDeadLetterEntry(dlPath, makeEntry({ taskId: 'T7', taskTitle: 'Stuck Task' }));

    // Seed task file with a blocked task
    const taskFileInitial = {
      version: 2 as const,
      tasks: [
        { id: 'T7', title: 'Stuck Task', status: 'blocked' as const, blocker: 'exhausted recovery' }
      ],
      mutationCount: 0
    };
    await fs.writeFile(tasksPath, JSON.stringify(taskFileInitial, null, 2), 'utf8');

    // Simulate requeueDeadLetterTask: remove from DL, reset task status
    const removed = await removeDeadLetterEntry(dlPath, 'T7');
    assert.equal(removed, true, 'entry removed from dead-letter');

    const raw = await fs.readFile(tasksPath, 'utf8');
    const taskFile = parseTaskFile(raw);
    const task = taskFile.tasks.find((t) => t.id === 'T7');
    assert.ok(task, 'task found');
    task.status = 'todo';
    delete task.blocker;
    const updated = bumpMutationCount(taskFile);
    await fs.writeFile(tasksPath, stringifyTaskFile(updated), 'utf8');

    // Verify task is now todo and not in dead-letter
    const finalRaw = await fs.readFile(tasksPath, 'utf8');
    const finalTaskFile = parseTaskFile(finalRaw);
    const finalTask = finalTaskFile.tasks.find((t) => t.id === 'T7');
    assert.ok(finalTask, 'task still exists');
    assert.equal(finalTask.status, 'todo', 'task reset to todo');
    assert.equal(finalTask.blocker, undefined, 'blocker cleared');

    const finalQueue = await readDeadLetterQueue(dlPath);
    assert.equal(finalQueue.entries.length, 0, 'dead-letter queue now empty');
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});
