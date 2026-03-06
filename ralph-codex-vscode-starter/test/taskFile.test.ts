import assert from 'node:assert/strict';
import test from 'node:test';
import { countTaskStatuses, parseTaskFile, remainingSubtasks, selectNextTask } from '../src/ralph/taskFile';

test('parseTaskFile normalizes the starter task schema and counts statuses', () => {
  const taskFile = parseTaskFile(JSON.stringify({
    tasks: [
      { id: 'T1', title: 'First task', status: 'todo' },
      { id: 'T2', title: 'Second task', status: 'in_progress' },
      { id: 'T3', title: 'Third task', status: 'done' }
    ]
  }));

  assert.equal(taskFile.version, 1);
  assert.deepEqual(countTaskStatuses(taskFile), {
    todo: 1,
    in_progress: 1,
    blocked: 0,
    done: 1
  });
});

test('parseTaskFile rejects malformed task files', () => {
  assert.throws(
    () => parseTaskFile(JSON.stringify({ tasks: {} })),
    /tasks array/
  );
});

test('selectNextTask prefers in-progress work and remainingSubtasks detect unfinished children', () => {
  const taskFile = parseTaskFile(JSON.stringify({
    tasks: [
      { id: 'T1', title: 'Parent', status: 'todo' },
      { id: 'T1.1', title: 'Child done', status: 'done' },
      { id: 'T1.2', title: 'Child todo', status: 'todo' },
      { id: 'T2', title: 'Active', status: 'in_progress' }
    ]
  }));

  assert.equal(selectNextTask(taskFile)?.id, 'T2');
  assert.deepEqual(remainingSubtasks(taskFile, 'T1').map((task) => task.id), ['T1.2']);
});
