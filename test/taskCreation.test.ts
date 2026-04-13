import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import {
  appendNormalizedTasksToFile,
  normalizeTaskInputsForPersistence,
  replaceTasksFileWithNormalizedTasks
} from '../src/ralph/taskCreation';

test('normalizeTaskInputsForPersistence preserves order and shared normalization semantics', () => {
  const tasks = normalizeTaskInputsForPersistence([
    {
      id: 'T1',
      title: 'First task',
      status: 'todo'
    },
    {
      id: ' T2 ',
      title: ' Second task ',
      status: 'todo',
      rationale: 'Use alias mapping',
      dependencies: ['T1', 'T1'],
      acceptance_criteria: ['done'],
      files: ['src/feature.ts'],
      validation: null
    },
    {
      id: 'T3',
      title: 'Third task',
      status: 'todo',
      validation: 'npm test',
      tier: 'complex',
      priority: 'high'
    }
  ]);

  assert.equal(tasks.length, 3);
  assert.equal(tasks[0].id, 'T1');
  assert.equal(tasks[0].title, 'First task');
  assert.equal(tasks[0].status, 'todo');

  assert.equal(tasks[1].id, 'T2');
  assert.equal(tasks[1].title, 'Second task');
  assert.equal(tasks[1].status, 'todo');
  assert.deepEqual(tasks[1].dependsOn, ['T1']);
  assert.equal(tasks[1].notes, 'Use alias mapping');
  assert.deepEqual(tasks[1].acceptance, ['done']);
  assert.deepEqual(tasks[1].context, ['src/feature.ts']);
  assert.equal(tasks[1].validation, undefined);

  assert.equal(tasks[2].id, 'T3');
  assert.equal(tasks[2].title, 'Third task');
  assert.equal(tasks[2].status, 'todo');
  assert.equal(tasks[2].validation, 'npm test');
  assert.equal(tasks[2].tier, 'complex');
  assert.equal(tasks[2].priority, 'high');
});

test('appendNormalizedTasksToFile appends tasks through the shared normalization pipeline', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-task-create-'));
  const tasksPath = path.join(tempDir, 'tasks.json');
  await fs.writeFile(tasksPath, `${JSON.stringify({
    version: 2,
    tasks: [{ id: 'T1', title: 'Existing task', status: 'todo' }]
  }, null, 2)}\n`, 'utf8');

  await appendNormalizedTasksToFile(tasksPath, [
    {
      id: ' T2 ',
      title: ' Added task ',
      status: 'todo',
      rationale: 'Append should normalize aliases',
      acceptance: ['kept']
    }
  ]);

  const parsed = JSON.parse(await fs.readFile(tasksPath, 'utf8')) as {
    mutationCount?: number;
    tasks: Array<Record<string, unknown>>;
  };
  assert.equal(parsed.tasks.length, 2);
  assert.deepEqual(parsed.tasks[1], {
    id: 'T2',
    title: 'Added task',
    status: 'todo',
    notes: 'Append should normalize aliases',
    acceptance: ['kept']
  });
  assert.equal(parsed.mutationCount, 1);
});

test('replaceTasksFileWithNormalizedTasks rewrites the file using the shared normalization pipeline', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-task-replace-'));
  const tasksPath = path.join(tempDir, 'tasks.json');
  await fs.writeFile(tasksPath, `${JSON.stringify({
    version: 2,
    tasks: [{ id: 'T1', title: 'Old task', status: 'todo' }]
  }, null, 2)}\n`, 'utf8');

  await replaceTasksFileWithNormalizedTasks(tasksPath, [
    {
      id: ' T5 ',
      title: ' Replacement task ',
      status: 'todo',
      suggestedValidationCommand: 'npm run validate'
    }
  ]);

  const parsed = JSON.parse(await fs.readFile(tasksPath, 'utf8')) as {
    mutationCount?: number;
    tasks: Array<Record<string, unknown>>;
  };
  assert.deepEqual(parsed.tasks, [
    {
      id: 'T5',
      title: 'Replacement task',
      status: 'todo',
      validation: 'npm run validate'
    }
  ]);
  assert.equal(parsed.mutationCount, 1);
});
