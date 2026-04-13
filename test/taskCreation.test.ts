import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import {
  applySuggestedChildTasksToFile,
  appendNormalizedTasksToFile,
  normalizeTaskInputsForPersistence,
  replaceTasksFileWithNormalizedTasks
} from '../src/ralph/taskCreation';
import type { RalphTask } from '../src/ralph/types';

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

test('appendNormalizedTasksToFile preserves the full supported task shape in serialized tasks.json output', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-task-create-rich-'));
  const tasksPath = path.join(tempDir, 'tasks.json');
  await fs.writeFile(tasksPath, `${JSON.stringify({
    version: 2,
    tasks: [{ id: 'T1', title: 'Existing task', status: 'todo' }]
  }, null, 2)}\n`, 'utf8');

  await appendNormalizedTasksToFile(tasksPath, [
    {
      id: ' T2 ',
      title: ' Rich append task ',
      status: 'blocked',
      rationale: 'Append should preserve the producer payload.',
      validation: 'npm run validate',
      blocker: 'Waiting on shared fixture',
      priority: 'high',
      mode: 'documentation',
      tier: 'complex',
      acceptance: ['Task is persisted with all supported fields'],
      constraints: ['Do not rewrite sibling tasks'],
      context: ['src/ralph/taskCreation.ts']
    }
  ]);

  const parsed = JSON.parse(await fs.readFile(tasksPath, 'utf8')) as {
    mutationCount?: number;
    tasks: Array<Record<string, unknown>>;
  };
  assert.deepEqual(parsed.tasks[1], {
    id: 'T2',
    title: 'Rich append task',
    status: 'blocked',
    notes: 'Append should preserve the producer payload.',
    validation: 'npm run validate',
    blocker: 'Waiting on shared fixture',
    priority: 'high',
    mode: 'documentation',
    tier: 'complex',
    acceptance: ['Task is persisted with all supported fields'],
    constraints: ['Do not rewrite sibling tasks'],
    context: ['src/ralph/taskCreation.ts']
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

test('replaceTasksFileWithNormalizedTasks preserves the full supported task shape in serialized tasks.json output', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-task-replace-rich-'));
  const tasksPath = path.join(tempDir, 'tasks.json');
  await fs.writeFile(tasksPath, `${JSON.stringify({
    version: 2,
    tasks: [{ id: 'T1', title: 'Old task', status: 'todo' }]
  }, null, 2)}\n`, 'utf8');

  await replaceTasksFileWithNormalizedTasks(tasksPath, [
    {
      id: 'T0',
      title: 'Replacement parent',
      status: 'todo'
    },
    {
      id: 'Tbase',
      title: 'Replacement dependency',
      status: 'todo'
    },
    {
      id: ' T5 ',
      title: ' Replacement rich task ',
      status: 'todo',
      parentId: 'T0',
      dependencies: ['Tbase'],
      notes: 'Replacement keeps the normalized producer shape.',
      suggestedValidationCommand: 'npm run validate',
      blocker: 'Needs final review',
      priority: 'normal',
      mode: 'documentation',
      tier: 'complex',
      acceptance_criteria: ['Replacement writes rich tasks.json output'],
      constraints: ['Preserve normalized field names'],
      files: ['src/commands/prdWizardPersistence.ts']
    }
  ]);

  const parsed = JSON.parse(await fs.readFile(tasksPath, 'utf8')) as {
    mutationCount?: number;
    tasks: Array<Record<string, unknown>>;
  };
  assert.deepEqual(parsed.tasks, [
    {
      id: 'T0',
      title: 'Replacement parent',
      status: 'todo'
    },
    {
      id: 'Tbase',
      title: 'Replacement dependency',
      status: 'todo'
    },
    {
      id: 'T5',
      title: 'Replacement rich task',
      status: 'todo',
      parentId: 'T0',
      dependsOn: ['Tbase'],
      notes: 'Replacement keeps the normalized producer shape.',
      validation: 'npm run validate',
      blocker: 'Needs final review',
      priority: 'normal',
      mode: 'documentation',
      tier: 'complex',
      acceptance: ['Replacement writes rich tasks.json output'],
      constraints: ['Preserve normalized field names'],
      context: ['src/commands/prdWizardPersistence.ts']
    }
  ]);
  assert.equal(parsed.mutationCount, 1);
});

test('applySuggestedChildTasksToFile persists child tasks through the shared task-creation pipeline', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-task-child-create-'));
  const tasksPath = path.join(tempDir, 'tasks.json');
  await fs.writeFile(tasksPath, `${JSON.stringify({
    version: 2,
    tasks: [
      {
        id: 'T1',
        title: 'Document module',
        status: 'todo',
        mode: 'documentation',
        tier: 'complex',
        validation: 'npm run validate',
        dependsOn: ['T0']
      },
      {
        id: 'T0',
        title: 'Foundation',
        status: 'done'
      }
    ]
  }, null, 2)}\n`, 'utf8');

  const nextTaskFile = await applySuggestedChildTasksToFile(tasksPath, 'T1', [
    {
      id: 'T1.1',
      title: ' Document API ',
      parentId: 'T1',
      dependsOn: [{ taskId: 'T0', reason: 'inherits_parent_dependency' }],
      validation: null,
      rationale: ' Narrow the first documentation slice. '
    }
  ]);

  const child = nextTaskFile.tasks.find((task: RalphTask) => task.id === 'T1.1');
  assert.ok(child);
  assert.equal(child.title, 'Document API');
  assert.equal(child.status, 'todo');
  assert.equal(child.notes, 'Narrow the first documentation slice.');
  assert.equal(child.mode, 'documentation');
  assert.equal(child.tier, 'complex');
  assert.equal(child.validation, 'npm run validate');

  const persisted = JSON.parse(await fs.readFile(tasksPath, 'utf8')) as {
    mutationCount?: number;
    tasks: Array<Record<string, unknown>>;
  };
  assert.equal(persisted.mutationCount, 1);
});
