/**
 * Executable contract tests for the normalized-task shape defined in
 * docs/invariants.md § Normalized Task Contract.
 *
 * These tests exercise normalizeTask indirectly through parseTaskFile
 * (the public entry point) to verify coercion invariants, field-presence
 * categories, and unknown-field drop behavior.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeTaskFileText, parseTaskFile, applySuggestedChildTasks } from '../src/ralph/taskFile';
import type { RalphTask, RalphTaskFile, RalphSuggestedChildTask } from '../src/ralph/types';

/** Parse a single task through normalizeTaskFileText (normalizes without graph validation). */
function singleTask(overrides: Record<string, unknown>): RalphTask {
  const base = { id: 'T1', title: 'Test task', status: 'todo', ...overrides };
  return normalizeTaskFileText(JSON.stringify({ version: 2, tasks: [base] })).taskFile.tasks[0];
}

/** Parse multiple tasks through normalizeTaskFileText. */
function multiTask(tasks: Record<string, unknown>[]): RalphTask[] {
  return normalizeTaskFileText(JSON.stringify({ version: 2, tasks })).taskFile.tasks;
}

// --- Required field enforcement ---

test('contract: id, title, status are required', () => {
  const makeBad = (overrides: Record<string, unknown>) => {
    const base = { id: 'T1', title: 'Test task', status: 'todo', ...overrides };
    return () => parseTaskFile(JSON.stringify({ version: 2, tasks: [base] }));
  };
  assert.throws(makeBad({ id: undefined }), /requires string id\/title/);
  assert.throws(makeBad({ title: undefined }), /requires string id\/title/);
  assert.throws(makeBad({ status: undefined }), /requires string id\/title.*valid status/);
});

test('contract: status must be a recognized enum value', () => {
  const makeBad = (status: unknown) =>
    () => parseTaskFile(JSON.stringify({ version: 2, tasks: [{ id: 'T1', title: 'Task', status }] }));
  assert.throws(makeBad('pending'), /valid status/);
  assert.throws(makeBad(''), /valid status/);
});

test('contract: id and title are trimmed', () => {
  const task = singleTask({ id: '  T1  ', title: '  My Task  ' });
  assert.equal(task.id, 'T1');
  assert.equal(task.title, 'My Task');
});

// --- String coercion: empty → undefined ---

test('contract: optional string fields that are empty or whitespace become undefined', () => {
  const task = singleTask({ notes: '', validation: '   ', blocker: '  ', parentId: '' });
  assert.equal(task.notes, undefined);
  assert.equal(task.validation, undefined);
  assert.equal(task.blocker, undefined);
  assert.equal(task.parentId, undefined);
});

test('contract: optional string fields are trimmed when non-empty', () => {
  const task = singleTask({ notes: '  some notes  ', validation: ' npm test ' });
  assert.equal(task.notes, 'some notes');
  assert.equal(task.validation, 'npm test');
});

// --- Array coercion: empty → undefined, trim, filter ---

test('contract: optional array fields that are empty after filtering become undefined', () => {
  const task = singleTask({ acceptance: [], constraints: ['', '   '], context: [42, null] });
  assert.equal(task.acceptance, undefined);
  assert.equal(task.constraints, undefined);
  assert.equal(task.context, undefined);
});

test('contract: optional array fields trim entries and filter empties', () => {
  const task = singleTask({ acceptance: ['  criterion one  ', '', '  criterion two  '] });
  assert.deepEqual(task.acceptance, ['criterion one', 'criterion two']);
});

// --- Dependency deduplication ---

test('contract: dependsOn deduplicates via Set', () => {
  const tasks = multiTask([
    { id: 'T1', title: 'Test task', status: 'todo', dependsOn: ['T2', 'T3', 'T2', 'T3'] },
    { id: 'T2', title: 'Dep 1', status: 'todo' },
    { id: 'T3', title: 'Dep 2', status: 'todo' }
  ]);
  assert.deepEqual(tasks[0].dependsOn, ['T2', 'T3']);
});

test('contract: dependsOn filters empties and trims', () => {
  const tasks = multiTask([
    { id: 'T1', title: 'Test task', status: 'todo', dependsOn: ['  T2  ', '', '   '] },
    { id: 'T2', title: 'Dep', status: 'todo' }
  ]);
  assert.deepEqual(tasks[0].dependsOn, ['T2']);
});

test('contract: dependsOn becomes undefined when all entries are empty', () => {
  const task = singleTask({ dependsOn: ['', '   '] });
  assert.equal(task.dependsOn, undefined);
});

// --- Enum rejection: invalid → undefined ---

test('contract: priority silently becomes undefined on invalid value', () => {
  const task = singleTask({ priority: 'urgent' });
  assert.equal(task.priority, undefined);
});

test('contract: mode silently becomes undefined on invalid value', () => {
  const task = singleTask({ mode: 'fast' });
  assert.equal(task.mode, undefined);
});

test('contract: tier silently becomes undefined on invalid value', () => {
  const task = singleTask({ tier: 'huge' });
  assert.equal(task.tier, undefined);
});

test('contract: valid enum values are preserved', () => {
  const task = singleTask({ priority: 'high', mode: 'documentation', tier: 'complex' });
  assert.equal(task.priority, 'high');
  assert.equal(task.mode, 'documentation');
  assert.equal(task.tier, 'complex');
});

// --- Unknown-field drop ---

test('contract: unknown fields are silently dropped after normalization', () => {
  const task = singleTask({ customField: 'value', extraData: [1, 2, 3] });
  assert.equal((task as unknown as Record<string, unknown>).customField, undefined);
  assert.equal((task as unknown as Record<string, unknown>).extraData, undefined);
});

// --- Child-task conversion contract ---

test('contract: suggested child tasks convert with correct field mapping', () => {
  const parentTaskFile: RalphTaskFile = {
    version: 2,
    tasks: [
      { id: 'T1', title: 'Parent', status: 'in_progress', mode: 'documentation', validation: 'npm test' }
    ]
  };

  const suggestions: RalphSuggestedChildTask[] = [{
    id: 'T1.1',
    title: 'First child',
    parentId: 'T1',
    dependsOn: [],
    validation: 'npm run lint',
    rationale: 'Narrow scope to linting first',
    acceptance: ['Lint passes'],
    constraints: ['Do not modify src/index.ts'],
    context: ['src/ralph/taskFile.ts'],
    tier: 'simple'
  }];

  const result = applySuggestedChildTasks(parentTaskFile, 'T1', suggestions);
  const child = result.tasks.find((t) => t.id === 'T1.1')!;

  assert.equal(child.status, 'todo', 'status forced to todo');
  assert.equal(child.parentId, 'T1');
  assert.deepEqual(child.dependsOn, undefined, 'empty dependsOn becomes undefined after normalization');
  assert.equal(child.validation, 'npm run lint');
  assert.equal(child.notes, 'Narrow scope to linting first', 'rationale maps to notes');
  assert.equal(child.mode, 'documentation', 'mode inherited from parent');
  assert.deepEqual(child.acceptance, ['Lint passes']);
  assert.deepEqual(child.constraints, ['Do not modify src/index.ts']);
  assert.deepEqual(child.context, ['src/ralph/taskFile.ts']);
  assert.equal(child.tier, 'simple');
});

test('contract: suggested child with null validation becomes undefined', () => {
  const parentTaskFile: RalphTaskFile = {
    version: 2,
    tasks: [
      { id: 'T1', title: 'Parent', status: 'todo' }
    ]
  };

  const suggestions: RalphSuggestedChildTask[] = [{
    id: 'T1.1',
    title: 'Child with null validation',
    parentId: 'T1',
    dependsOn: [],
    validation: null,
    rationale: 'Test null conversion'
  }];

  const result = applySuggestedChildTasks(parentTaskFile, 'T1', suggestions);
  const child = result.tasks.find((t) => t.id === 'T1.1')!;

  assert.equal(child.validation, undefined, 'null validation becomes undefined');
});

test('contract: parent promoted to in_progress when children are applied', () => {
  const parentTaskFile: RalphTaskFile = {
    version: 2,
    tasks: [
      { id: 'T1', title: 'Parent', status: 'done' }
    ]
  };

  const suggestions: RalphSuggestedChildTask[] = [{
    id: 'T1.1',
    title: 'New child',
    parentId: 'T1',
    dependsOn: [],
    validation: null,
    rationale: 'Reopen parent'
  }];

  const result = applySuggestedChildTasks(parentTaskFile, 'T1', suggestions);
  const parent = result.tasks.find((t) => t.id === 'T1')!;
  assert.equal(parent.status, 'in_progress', 'done parent promoted to in_progress');
});
