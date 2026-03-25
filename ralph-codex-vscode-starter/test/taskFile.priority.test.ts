import assert from 'node:assert/strict';
import test from 'node:test';
import { listSelectableTasks, parseTaskFile } from '../src/ralph/taskFile';
import { RalphTaskFile } from '../src/ralph/types';

function makeTaskFile(tasks: RalphTaskFile['tasks']): RalphTaskFile {
  return { version: 2, tasks };
}

// ---------------------------------------------------------------------------
// listSelectableTasks: priority-aware ordering
// ---------------------------------------------------------------------------

test('listSelectableTasks returns high-priority task before normal-priority task', () => {
  const taskFile = makeTaskFile([
    { id: 'T1', title: 'Normal task', status: 'todo' },
    { id: 'T2', title: 'High priority task', status: 'todo', priority: 'high' }
  ]);

  const selectable = listSelectableTasks(taskFile);
  assert.equal(selectable[0].id, 'T2', 'high-priority task should be selected first');
  assert.equal(selectable[1].id, 'T1');
});

test('listSelectableTasks returns normal-priority task before low-priority task', () => {
  const taskFile = makeTaskFile([
    { id: 'T1', title: 'Low priority task', status: 'todo', priority: 'low' },
    { id: 'T2', title: 'Normal task', status: 'todo' }
  ]);

  const selectable = listSelectableTasks(taskFile);
  assert.equal(selectable[0].id, 'T2', 'normal-priority task should be selected before low');
  assert.equal(selectable[1].id, 'T1');
});

test('listSelectableTasks preserves original order among equal-priority tasks', () => {
  const taskFile = makeTaskFile([
    { id: 'T1', title: 'First', status: 'todo' },
    { id: 'T2', title: 'Second', status: 'todo' },
    { id: 'T3', title: 'Third', status: 'todo' }
  ]);

  const selectable = listSelectableTasks(taskFile);
  assert.equal(selectable[0].id, 'T1');
  assert.equal(selectable[1].id, 'T2');
  assert.equal(selectable[2].id, 'T3');
});

test('listSelectableTasks: in_progress tasks still sort before todo tasks regardless of priority', () => {
  const taskFile = makeTaskFile([
    { id: 'T1', title: 'Todo high', status: 'todo', priority: 'high' },
    { id: 'T2', title: 'In progress normal', status: 'in_progress' }
  ]);

  const selectable = listSelectableTasks(taskFile);
  assert.equal(selectable[0].id, 'T2', 'in_progress should come before todo even if todo is high-priority');
});

test('listSelectableTasks: in_progress bucket is internally sorted by priority', () => {
  const taskFile = makeTaskFile([
    { id: 'T1', title: 'In progress normal', status: 'in_progress' },
    { id: 'T2', title: 'In progress high', status: 'in_progress', priority: 'high' }
  ]);

  const selectable = listSelectableTasks(taskFile);
  assert.equal(selectable[0].id, 'T2', 'high-priority in_progress should come first');
});

// ---------------------------------------------------------------------------
// parseTaskFile handles the priority field
// ---------------------------------------------------------------------------

test('parseTaskFile accepts valid priority values', () => {
  const raw = JSON.stringify({
    version: 2,
    tasks: [
      { id: 'T1', title: 'High task', status: 'todo', priority: 'high' },
      { id: 'T2', title: 'Low task', status: 'todo', priority: 'low' },
      { id: 'T3', title: 'No priority', status: 'todo' }
    ]
  });

  const taskFile = parseTaskFile(raw);
  assert.equal(taskFile.tasks[0].priority, 'high');
  assert.equal(taskFile.tasks[1].priority, 'low');
  assert.equal(taskFile.tasks[2].priority, undefined);
});

test('parseTaskFile ignores invalid priority values (treats as undefined)', () => {
  const raw = JSON.stringify({
    version: 2,
    tasks: [
      { id: 'T1', title: 'Task', status: 'todo', priority: 'urgent' }
    ]
  });

  const taskFile = parseTaskFile(raw);
  assert.equal(taskFile.tasks[0].priority, undefined, 'invalid priority should be silently ignored');
});
