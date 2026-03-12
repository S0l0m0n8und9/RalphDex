import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applySuggestedChildTasks,
  countTaskStatuses,
  inspectTaskFileText,
  normalizeTaskFileText,
  parseTaskFile,
  remainingSubtasks,
  selectNextTask
} from '../src/ralph/taskFile';

test('parseTaskFile normalizes the starter task schema and counts statuses', () => {
  const taskFile = parseTaskFile(JSON.stringify({
    tasks: [
      { id: 'T1', title: 'First task', status: 'todo' },
      { id: 'T2', title: 'Second task', status: 'in_progress' },
      { id: 'T3', title: 'Third task', status: 'done' }
    ]
  }));

  assert.equal(taskFile.version, 2);
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
    version: 2,
    tasks: [
      { id: 'T1', title: 'Parent', status: 'todo' },
      { id: 'T1.1', title: 'Child done', status: 'done', parentId: 'T1' },
      { id: 'T1.2', title: 'Child todo', status: 'todo', parentId: 'T1' },
      { id: 'T2', title: 'Active', status: 'in_progress' }
    ]
  }));

  assert.equal(selectNextTask(taskFile)?.id, 'T2');
  assert.deepEqual(remainingSubtasks(taskFile, 'T1').map((task) => task.id), ['T1.2']);
});

test('normalizeTaskFileText migrates legacy implicit parent-child ids to explicit parentId fields', () => {
  const normalized = normalizeTaskFileText(JSON.stringify({
    tasks: [
      { id: 'T1', title: 'Parent', status: 'todo' },
      { id: 'T1.1', title: 'Child', status: 'todo' }
    ]
  }));

  assert.equal(normalized.taskFile.version, 2);
  assert.equal(normalized.taskFile.tasks[1].parentId, 'T1');
  assert.equal(normalized.migrated, true);
});

test('parseTaskFile preserves task source locations for diagnostics and selection context', () => {
  const taskFile = parseTaskFile([
    '{',
    '  "version": 2,',
    '  "tasks": [',
    '    { "id": "T1", "title": "First task", "status": "todo" },',
    '    { "id": "T2", "title": "Second task", "status": "in_progress" }',
    '  ]',
    '}'
  ].join('\n'));

  assert.deepEqual(taskFile.tasks.map((task) => task.source), [
    { arrayIndex: 0, line: 4, column: 5 },
    { arrayIndex: 1, line: 5, column: 5 }
  ]);
});

test('selectNextTask skips todo work until dependencies are done', () => {
  const taskFile = parseTaskFile(JSON.stringify({
    version: 2,
    tasks: [
      { id: 'T1', title: 'Foundation', status: 'todo' },
      { id: 'T2', title: 'Dependent', status: 'todo', dependsOn: ['T1'] }
    ]
  }));

  assert.equal(selectNextTask(taskFile)?.id, 'T1');
});

test('applySuggestedChildTasks appends approved child tasks and gates the parent behind them', () => {
  const taskFile = parseTaskFile(JSON.stringify({
    version: 2,
    tasks: [
      { id: 'T1', title: 'Broad parent', status: 'todo', dependsOn: ['T0'] },
      { id: 'T0', title: 'Foundation', status: 'done' }
    ]
  }));

  const nextTaskFile = applySuggestedChildTasks(taskFile, 'T1', [
    {
      id: 'T1.1',
      title: 'Reproduce the blocker',
      parentId: 'T1',
      dependsOn: [{ taskId: 'T0', reason: 'inherits_parent_dependency' }],
      validation: 'npm test',
      rationale: 'Narrow the first step.'
    },
    {
      id: 'T1.2',
      title: 'Implement the fix',
      parentId: 'T1',
      dependsOn: [{ taskId: 'T1.1', reason: 'blocks_sequence' }],
      validation: 'npm test',
      rationale: 'Sequence the second step.'
    }
  ]);

  assert.deepEqual(
    nextTaskFile.tasks.find((task) => task.id === 'T1')?.dependsOn,
    ['T0', 'T1.1', 'T1.2']
  );
  assert.deepEqual(
    nextTaskFile.tasks.filter((task) => task.parentId === 'T1').map((task) => task.id),
    ['T1.1', 'T1.2']
  );
  assert.equal(selectNextTask(nextTaskFile)?.id, 'T1.1');
});

test('applySuggestedChildTasks rejects malformed approved proposals before mutating the task graph', () => {
  const taskFile = parseTaskFile(JSON.stringify({
    version: 2,
    tasks: [
      { id: 'T0', title: 'Foundation', status: 'done' },
      { id: 'T1', title: 'Broad parent', status: 'todo', dependsOn: ['T0'] },
      { id: 'T2', title: 'Existing sibling', status: 'todo' }
    ]
  }));

  assert.throws(
    () => applySuggestedChildTasks(taskFile, 'T1', [
      {
        id: 'T1.1',
        title: 'Wrong parent',
        parentId: 'T2',
        dependsOn: [],
        validation: null,
        rationale: 'Invalid parent.'
      }
    ]),
    /targets parent T2 instead of T1/
  );

  assert.throws(
    () => applySuggestedChildTasks(taskFile, 'T1', [
      {
        id: 'T2',
        title: 'Conflicting id',
        parentId: 'T1',
        dependsOn: [],
        validation: null,
        rationale: 'Conflicts with an existing task.'
      }
    ]),
    /task id T2 already exists/
  );

  assert.throws(
    () => applySuggestedChildTasks(taskFile, 'T1', [
      {
        id: 'T1.1',
        title: 'Duplicate id first',
        parentId: 'T1',
        dependsOn: [],
        validation: null,
        rationale: 'First copy.'
      },
      {
        id: 'T1.1',
        title: 'Duplicate id second',
        parentId: 'T1',
        dependsOn: [],
        validation: null,
        rationale: 'Second copy.'
      }
    ]),
    /duplicated within the proposal/
  );

  assert.throws(
    () => applySuggestedChildTasks(taskFile, 'T1', [
      {
        id: 'T1.1',
        title: 'Missing dependency',
        parentId: 'T1',
        dependsOn: [{ taskId: 'T9', reason: 'blocks_sequence' }],
        validation: null,
        rationale: 'Depends on a missing task.'
      }
    ]),
    /depends on missing task T9/
  );

  assert.throws(
    () => applySuggestedChildTasks(taskFile, 'T1', [
      {
        id: 'T1.1',
        title: 'Cycle first',
        parentId: 'T1',
        dependsOn: [{ taskId: 'T1.2', reason: 'blocks_sequence' }],
        validation: null,
        rationale: 'Introduces a cycle.'
      },
      {
        id: 'T1.2',
        title: 'Cycle second',
        parentId: 'T1',
        dependsOn: [{ taskId: 'T1.1', reason: 'blocks_sequence' }],
        validation: null,
        rationale: 'Closes the cycle.'
      }
    ]),
    /dependency cycle/i
  );
});

test('applySuggestedChildTasks rejects approved proposals for parents that are already done', () => {
  const taskFile = parseTaskFile(JSON.stringify({
    version: 2,
    tasks: [
      { id: 'T1', title: 'Completed parent', status: 'done' }
    ]
  }));

  assert.throws(
    () => applySuggestedChildTasks(taskFile, 'T1', [
      {
        id: 'T1.1',
        title: 'Should not be added',
        parentId: 'T1',
        dependsOn: [],
        validation: null,
        rationale: 'This proposal should be rejected.'
      }
    ]),
    /parent task T1 is already done/
  );
});

test('inspectTaskFileText reports duplicate ids, missing references, cycles, and impossible done states', () => {
  const inspection = inspectTaskFileText(JSON.stringify({
    version: 2,
    tasks: [
      { id: 'T1', title: 'First', status: 'todo', dependsOn: ['MISSING'] },
      { id: 'T1', title: 'Duplicate', status: 'todo' },
      { id: 'T2', title: 'Child', status: 'todo', parentId: 'MISSING' },
      { id: 'T3', title: 'Done too early', status: 'done', dependsOn: ['T4'] },
      { id: 'T4', title: 'Still in progress', status: 'in_progress', dependsOn: ['T3'] }
    ]
  }));

  assert.equal(inspection.taskFile, null);
  assert.deepEqual(
    inspection.diagnostics.map((diagnostic) => diagnostic.code).sort(),
    [
      'completed_task_with_incomplete_dependencies',
      'dependency_cycle',
      'duplicate_task_id',
      'invalid_dependency_reference',
      'orphaned_parent_reference'
    ].sort()
  );
  assert.match(
    inspection.diagnostics.find((diagnostic) => diagnostic.code === 'invalid_dependency_reference')?.message ?? '',
    /Task T1 at tasks\[0\] \(line \d+, column \d+\) references missing dependency MISSING/
  );
  assert.equal(
    inspection.diagnostics.find((diagnostic) => diagnostic.code === 'duplicate_task_id')?.relatedLocations?.length,
    2
  );
});

test('inspectTaskFileText rejects likely schema-drift fields such as dependencies and suggests dependsOn', () => {
  const inspection = inspectTaskFileText(JSON.stringify({
    version: 2,
    tasks: [
      { id: 'T1', title: 'Broken field name', status: 'todo', dependencies: ['T0'] }
    ]
  }, null, 2));

  assert.equal(inspection.taskFile, null);
  assert.deepEqual(
    inspection.diagnostics.map((diagnostic) => diagnostic.code),
    ['unsupported_task_field']
  );
  assert.match(
    inspection.diagnostics[0]?.message ?? '',
    /unsupported field "dependencies".*Use "dependsOn" instead/
  );
});

test('inspectTaskFileText reports done parents with unfinished descendants as tracker drift', () => {
  const inspection = inspectTaskFileText(JSON.stringify({
    version: 2,
    tasks: [
      { id: 'T1', title: 'Completed parent', status: 'done' },
      { id: 'T1.1', title: 'Active child', status: 'in_progress', parentId: 'T1' },
      { id: 'T1.1.1', title: 'Blocked grandchild', status: 'blocked', parentId: 'T1.1' },
      { id: 'T1.2', title: 'Todo child', status: 'todo', parentId: 'T1' }
    ]
  }));

  assert.equal(inspection.taskFile, null);
  assert.deepEqual(
    inspection.diagnostics.map((diagnostic) => diagnostic.code),
    ['completed_parent_with_incomplete_descendants']
  );
  assert.match(
    inspection.diagnostics[0]?.message ?? '',
    /Task T1 .*descendant tasks are still unfinished: T1\.1 \(in_progress\), T1\.1\.1 \(blocked\), T1\.2 \(todo\)/
  );
  assert.deepEqual(
    inspection.diagnostics[0]?.relatedTaskIds,
    ['T1.1', 'T1.1.1', 'T1.2']
  );
});

test('inspectTaskFileText reports done parents with unfinished inferred descendants after legacy normalization', () => {
  const inspection = inspectTaskFileText(JSON.stringify({
    tasks: [
      { id: 'T1', title: 'Completed parent', status: 'done' },
      { id: 'T1.1', title: 'Legacy child', status: 'done' },
      { id: 'T1.1.1', title: 'Legacy grandchild', status: 'todo' }
    ]
  }, null, 2));

  assert.equal(inspection.taskFile, null);
  assert.equal(inspection.text, null);
  assert.deepEqual(
    inspection.diagnostics.map((diagnostic) => diagnostic.code),
    [
      'completed_parent_with_incomplete_descendants',
      'completed_parent_with_incomplete_descendants'
    ]
  );
  assert.match(
    inspection.diagnostics[0]?.message ?? '',
    /Task T1 .*descendant tasks are still unfinished: T1\.1\.1 \(todo\)/
  );
  assert.match(
    inspection.diagnostics[1]?.message ?? '',
    /Task T1\.1 .*descendant tasks are still unfinished: T1\.1\.1 \(todo\)/
  );
  assert.deepEqual(
    inspection.diagnostics.map((diagnostic) => diagnostic.relatedTaskIds),
    [['T1.1.1'], ['T1.1.1']]
  );
  assert.deepEqual(
    inspection.diagnostics.map((diagnostic) => diagnostic.taskId),
    ['T1', 'T1.1']
  );
});
