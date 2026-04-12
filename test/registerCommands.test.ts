import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeWizardTasksForPersistence
} from '../src/commands/prdWizardPersistence';

test('normalizeWizardTasksForPersistence preserves reviewed order and supported fields', () => {
  const tasks = normalizeWizardTasksForPersistence([
    {
      id: 'T3',
      title: 'Third task',
      status: 'todo',
      validation: 'npm test',
      tier: 'complex'
    },
    {
      id: 'T2',
      title: 'Second task',
      status: 'todo'
    }
  ]);

  assert.deepEqual(tasks, [
    {
      id: 'T3',
      title: 'Third task',
      status: 'todo',
      validation: 'npm test',
      tier: 'complex'
    },
    {
      id: 'T2',
      title: 'Second task',
      status: 'todo'
    }
  ]);
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
