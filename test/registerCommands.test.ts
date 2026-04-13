import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeWizardTasksForPersistence
} from '../src/commands/prdWizardPersistence';

test('normalizeWizardTasksForPersistence preserves reviewed order and supported fields', () => {
  const tasks = normalizeWizardTasksForPersistence([
    {
      id: 'T1',
      title: 'First task',
      status: 'todo'
    },
    {
      id: 'T3',
      title: 'Third task',
      status: 'todo',
      validation: 'npm test',
      tier: 'complex',
      acceptance: ['done'],
      constraints: ['stay scoped'],
      context: ['src/feature.ts'],
      dependsOn: ['T1'],
      notes: 'Preserve richer fields'
    },
    {
      id: 'T2',
      title: 'Second task',
      status: 'todo',
      rationale: 'Alias should map to notes'
    }
  ]);

  assert.equal(tasks.length, 3);
  assert.equal(tasks[0].id, 'T1');
  assert.equal(tasks[0].title, 'First task');
  assert.equal(tasks[0].status, 'todo');

  assert.equal(tasks[1].id, 'T3');
  assert.equal(tasks[1].title, 'Third task');
  assert.equal(tasks[1].status, 'todo');
  assert.equal(tasks[1].validation, 'npm test');
  assert.equal(tasks[1].tier, 'complex');
  assert.deepEqual(tasks[1].acceptance, ['done']);
  assert.deepEqual(tasks[1].constraints, ['stay scoped']);
  assert.deepEqual(tasks[1].context, ['src/feature.ts']);
  assert.deepEqual(tasks[1].dependsOn, ['T1']);
  assert.equal(tasks[1].notes, 'Preserve richer fields');

  assert.equal(tasks[2].id, 'T2');
  assert.equal(tasks[2].title, 'Second task');
  assert.equal(tasks[2].status, 'todo');
  assert.equal(tasks[2].notes, 'Alias should map to notes');
});

test('normalizeWizardTasksForPersistence rejects empty and invalid reviewed task lists', () => {
  assert.throws(
    () => normalizeWizardTasksForPersistence([]),
    /at least one task/i
  );

  assert.throws(
    () => normalizeWizardTasksForPersistence([
      { id: 'T1', title: '   ', status: 'todo' }
    ]),
    /non-empty title/i
  );
});
