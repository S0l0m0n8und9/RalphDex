/**
 * Tests for the shared task-normalization and augmentation pipeline
 * exported by src/ralph/taskNormalization.ts.
 *
 * Verifies that normalizeNewTask applies alias mapping, structured-dependency
 * flattening, null coercion, default status, parent augmentation, and
 * canonical normalization correctly.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeNewTask } from '../src/ralph/taskNormalization';
import type { RalphTask } from '../src/ralph/types';

// ---------------------------------------------------------------------------
// Minimal input — only required fields
// ---------------------------------------------------------------------------

test('normalizeNewTask: minimal input defaults status to todo', () => {
  const task = normalizeNewTask({ id: 'T1', title: 'Do the thing' });
  assert.equal(task.id, 'T1');
  assert.equal(task.title, 'Do the thing');
  assert.equal(task.status, 'todo');
});

test('normalizeNewTask: custom defaultStatus is applied when status absent', () => {
  const task = normalizeNewTask(
    { id: 'T1', title: 'Task' },
    { defaultStatus: 'in_progress' }
  );
  assert.equal(task.status, 'in_progress');
});

test('normalizeNewTask: explicit status overrides defaultStatus', () => {
  const task = normalizeNewTask(
    { id: 'T1', title: 'Task', status: 'blocked' },
    { defaultStatus: 'todo' }
  );
  assert.equal(task.status, 'blocked');
});

// ---------------------------------------------------------------------------
// Rich field preservation
// ---------------------------------------------------------------------------

test('normalizeNewTask: preserves acceptance, constraints, context, validation, tier', () => {
  const task = normalizeNewTask({
    id: 'T2',
    title: 'Rich task',
    acceptance: ['Criterion 1', 'Criterion 2'],
    constraints: ['Must not break API'],
    context: ['src/ralph/taskFile.ts'],
    validation: 'npm run validate',
    tier: 'complex'
  });
  assert.deepEqual(task.acceptance, ['Criterion 1', 'Criterion 2']);
  assert.deepEqual(task.constraints, ['Must not break API']);
  assert.deepEqual(task.context, ['src/ralph/taskFile.ts']);
  assert.equal(task.validation, 'npm run validate');
  assert.equal(task.tier, 'complex');
});

test('normalizeNewTask: does not silently drop supported schema fields', () => {
  const task = normalizeNewTask({
    id: 'T3',
    title: 'Full task',
    parentId: 'T2',
    dependsOn: ['T1'],
    notes: 'Some notes',
    validation: 'npm test',
    blocker: 'Waiting on review',
    priority: 'high',
    mode: 'documentation',
    tier: 'medium',
    acceptance: ['Done when tests pass'],
    constraints: ['No breaking changes'],
    context: ['src/index.ts'],
    status: 'blocked'
  });
  assert.equal(task.parentId, 'T2');
  assert.deepEqual(task.dependsOn, ['T1']);
  assert.equal(task.notes, 'Some notes');
  assert.equal(task.validation, 'npm test');
  assert.equal(task.blocker, 'Waiting on review');
  assert.equal(task.priority, 'high');
  assert.equal(task.mode, 'documentation');
  assert.equal(task.tier, 'medium');
  assert.deepEqual(task.acceptance, ['Done when tests pass']);
  assert.deepEqual(task.constraints, ['No breaking changes']);
  assert.deepEqual(task.context, ['src/index.ts']);
  assert.equal(task.status, 'blocked');
});

// ---------------------------------------------------------------------------
// Alias mapping: rationale → notes
// ---------------------------------------------------------------------------

test('normalizeNewTask: rationale maps to notes when notes is absent', () => {
  const task = normalizeNewTask({
    id: 'T4',
    title: 'Alias test',
    rationale: 'This is why we do it'
  });
  assert.equal(task.notes, 'This is why we do it');
});

test('normalizeNewTask: notes takes precedence over rationale', () => {
  const task = normalizeNewTask({
    id: 'T4',
    title: 'Alias test',
    notes: 'Explicit notes',
    rationale: 'Should be ignored'
  });
  assert.equal(task.notes, 'Explicit notes');
});

// ---------------------------------------------------------------------------
// Structured dependsOn flattening
// ---------------------------------------------------------------------------

test('normalizeNewTask: flattens structured dependsOn to task-ID strings', () => {
  const task = normalizeNewTask({
    id: 'T5',
    title: 'Deps test',
    dependsOn: [
      { taskId: 'T1' },
      { taskId: 'T2' }
    ]
  });
  assert.deepEqual(task.dependsOn, ['T1', 'T2']);
});

test('normalizeNewTask: accepts plain string dependsOn', () => {
  const task = normalizeNewTask({
    id: 'T5',
    title: 'Deps test',
    dependsOn: ['T1', 'T2']
  });
  assert.deepEqual(task.dependsOn, ['T1', 'T2']);
});

test('normalizeNewTask: mixed dependsOn entries are flattened', () => {
  const task = normalizeNewTask({
    id: 'T5',
    title: 'Deps test',
    dependsOn: ['T1', { taskId: 'T2' }]
  });
  assert.deepEqual(task.dependsOn, ['T1', 'T2']);
});

// ---------------------------------------------------------------------------
// Null coercion for validation
// ---------------------------------------------------------------------------

test('normalizeNewTask: validation null becomes undefined', () => {
  const task = normalizeNewTask({
    id: 'T6',
    title: 'Null validation',
    validation: null
  });
  assert.equal(task.validation, undefined);
});

// ---------------------------------------------------------------------------
// Field-name auto-correction (known aliases)
// ---------------------------------------------------------------------------

test('normalizeNewTask: auto-corrects dependencies → dependsOn', () => {
  const task = normalizeNewTask({
    id: 'T7',
    title: 'Alias correction',
    dependencies: ['T1']
  } as any);
  assert.deepEqual(task.dependsOn, ['T1']);
});

test('normalizeNewTask: auto-corrects acceptance_criteria → acceptance', () => {
  const task = normalizeNewTask({
    id: 'T8',
    title: 'Alias correction',
    acceptance_criteria: ['Must pass tests']
  } as any);
  assert.deepEqual(task.acceptance, ['Must pass tests']);
});

test('normalizeNewTask: auto-corrects files → context', () => {
  const task = normalizeNewTask({
    id: 'T9',
    title: 'Alias correction',
    files: ['src/index.ts']
  } as any);
  assert.deepEqual(task.context, ['src/index.ts']);
});

// ---------------------------------------------------------------------------
// Parent augmentation
// ---------------------------------------------------------------------------

test('normalizeNewTask: inherits mode from parent when absent', () => {
  const parent: RalphTask = {
    id: 'T10',
    title: 'Parent',
    status: 'in_progress',
    mode: 'documentation'
  };
  const task = normalizeNewTask(
    { id: 'T10.1', title: 'Child', parentId: 'T10' },
    { parentTask: parent }
  );
  assert.equal(task.mode, 'documentation');
});

test('normalizeNewTask: inherits tier from parent when absent', () => {
  const parent: RalphTask = {
    id: 'T10',
    title: 'Parent',
    status: 'in_progress',
    tier: 'complex'
  };
  const task = normalizeNewTask(
    { id: 'T10.1', title: 'Child', parentId: 'T10' },
    { parentTask: parent }
  );
  assert.equal(task.tier, 'complex');
});

test('normalizeNewTask: inherits validation from parent when absent', () => {
  const parent: RalphTask = {
    id: 'T10',
    title: 'Parent',
    status: 'in_progress',
    validation: 'npm run validate'
  };
  const task = normalizeNewTask(
    { id: 'T10.1', title: 'Child', parentId: 'T10' },
    { parentTask: parent }
  );
  assert.equal(task.validation, 'npm run validate');
});

test('normalizeNewTask: explicit child fields are NOT overridden by parent', () => {
  const parent: RalphTask = {
    id: 'T10',
    title: 'Parent',
    status: 'in_progress',
    mode: 'documentation',
    tier: 'complex',
    validation: 'npm run validate'
  };
  const task = normalizeNewTask(
    {
      id: 'T10.1',
      title: 'Child',
      parentId: 'T10',
      mode: 'default',
      tier: 'simple',
      validation: 'npm test'
    },
    { parentTask: parent }
  );
  assert.equal(task.mode, 'default');
  assert.equal(task.tier, 'simple');
  assert.equal(task.validation, 'npm test');
});

test('normalizeNewTask: no augmentation without parentTask option', () => {
  const task = normalizeNewTask({
    id: 'T11',
    title: 'No parent'
  });
  assert.equal(task.mode, undefined);
  assert.equal(task.tier, undefined);
  assert.equal(task.validation, undefined);
});

// ---------------------------------------------------------------------------
// Coercion pass-through (verifies normalizeTask delegation)
// ---------------------------------------------------------------------------

test('normalizeNewTask: trims id and title', () => {
  const task = normalizeNewTask({ id: '  T12  ', title: '  Trimmed  ' });
  assert.equal(task.id, 'T12');
  assert.equal(task.title, 'Trimmed');
});

test('normalizeNewTask: empty optional strings become undefined', () => {
  const task = normalizeNewTask({
    id: 'T13',
    title: 'Coercion',
    notes: '   ',
    blocker: '',
    parentId: '  '
  });
  assert.equal(task.notes, undefined);
  assert.equal(task.blocker, undefined);
  assert.equal(task.parentId, undefined);
});

test('normalizeNewTask: empty arrays become undefined', () => {
  const task = normalizeNewTask({
    id: 'T14',
    title: 'Coercion',
    acceptance: [],
    constraints: [],
    context: [],
    dependsOn: []
  });
  assert.equal(task.acceptance, undefined);
  assert.equal(task.constraints, undefined);
  assert.equal(task.context, undefined);
  assert.equal(task.dependsOn, undefined);
});

test('normalizeNewTask: dependsOn is deduplicated', () => {
  const task = normalizeNewTask({
    id: 'T15',
    title: 'Dedup',
    dependsOn: ['T1', 'T2', 'T1']
  });
  assert.deepEqual(task.dependsOn, ['T1', 'T2']);
});

test('normalizeNewTask: unknown fields are dropped', () => {
  const task = normalizeNewTask({
    id: 'T16',
    title: 'Drop unknown',
    unknownField: 'should be gone'
  });
  assert.equal((task as any).unknownField, undefined);
});

test('normalizeNewTask: invalid enum values become undefined', () => {
  const task = normalizeNewTask({
    id: 'T17',
    title: 'Bad enums',
    priority: 'urgent' as any,
    mode: 'fast' as any,
    tier: 'massive' as any
  });
  assert.equal(task.priority, undefined);
  assert.equal(task.mode, undefined);
  assert.equal(task.tier, undefined);
});

// ---------------------------------------------------------------------------
// Source field is not injected by normalizeNewTask
// ---------------------------------------------------------------------------

test('normalizeNewTask: does not inject source location', () => {
  const task = normalizeNewTask({ id: 'T18', title: 'No source' });
  assert.equal(task.source, undefined);
});
