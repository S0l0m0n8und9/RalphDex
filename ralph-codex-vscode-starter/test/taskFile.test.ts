import assert from 'node:assert/strict';
import test from 'node:test';
import { countTaskStatuses, parseTaskFile } from '../src/ralph/taskFile';

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
