import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import {
  acquireClaim,
  autoCompleteSatisfiedAncestors,
  applySuggestedChildTasks,
  countTaskStatuses,
  inspectTaskFileText,
  normalizeTaskFileText,
  parseTaskFile,
  resolveStaleClaim,
  releaseClaim,
  remainingSubtasks,
  selectNextTask,
  stringifyTaskFile,
  withTaskFileLock
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

test('autoCompleteSatisfiedAncestors closes aggregate parents once every child slice is done', () => {
  const taskFile = parseTaskFile(JSON.stringify({
    version: 2,
    tasks: [
      { id: 'T1', title: 'Aggregate parent', status: 'todo', dependsOn: ['T1.1', 'T1.2'] },
      { id: 'T1.1', title: 'First slice', status: 'done', parentId: 'T1' },
      { id: 'T1.2', title: 'Second slice', status: 'done', parentId: 'T1' }
    ]
  }));

  const completed = autoCompleteSatisfiedAncestors(taskFile, 'T1.2');

  assert.deepEqual(completed.completedAncestorIds, ['T1']);
  assert.equal(completed.taskFile.tasks.find((task) => task.id === 'T1')?.status, 'done');
});

test('autoCompleteSatisfiedAncestors keeps decomposed parents open when they still have standalone validation', () => {
  const taskFile = parseTaskFile(JSON.stringify({
    version: 2,
    tasks: [
      { id: 'T1', title: 'Original task', status: 'todo', dependsOn: ['T1.1', 'T1.2'], validation: 'npm test' },
      { id: 'T1.1', title: 'Reproduce', status: 'done', parentId: 'T1' },
      { id: 'T1.2', title: 'Fix', status: 'done', parentId: 'T1' }
    ]
  }));

  const completed = autoCompleteSatisfiedAncestors(taskFile, 'T1.2');

  assert.deepEqual(completed.completedAncestorIds, []);
  assert.equal(completed.taskFile.tasks.find((task) => task.id === 'T1')?.status, 'todo');
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

test('acquireClaim writes a canonical active claim and releaseClaim marks it released', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-claims-'));
  const claimFilePath = path.join(tempRoot, 'task-claims.json');
  const now = new Date('2026-03-14T00:00:00.000Z');

  const acquired = await acquireClaim(claimFilePath, 'T24.1.2', 'agent-a', 'run-001', { now });

  assert.equal(acquired.outcome, 'acquired');
  assert.equal(acquired.claim?.claim.status, 'active');
  assert.equal(acquired.canonicalClaim?.claim.agentId, 'agent-a');

  const released = await releaseClaim(claimFilePath, 'T24.1.2', 'agent-a', { now });

  assert.equal(released.outcome, 'released');
  assert.equal(released.releasedClaim?.claim.status, 'released');
  assert.equal(released.canonicalClaim, null);

  const persisted = JSON.parse(await fs.readFile(claimFilePath, 'utf8')) as { claims: Array<{ status: string }> };
  assert.deepEqual(persisted.claims.map((claim) => claim.status), ['released']);
});

test('acquireClaim returns contested without writing when another active claim already exists', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-claims-'));
  const claimFilePath = path.join(tempRoot, 'task-claims.json');

  await acquireClaim(claimFilePath, 'T24.1.2', 'agent-a', 'run-001', {
    now: new Date('2026-03-14T00:00:00.000Z')
  });

  const contested = await acquireClaim(claimFilePath, 'T24.1.2', 'agent-b', 'run-002', {
    now: new Date('2026-03-14T00:05:00.000Z')
  });

  assert.equal(contested.outcome, 'contested');
  assert.equal(contested.claim, null);
  assert.equal(contested.canonicalClaim?.claim.agentId, 'agent-a');

  const persisted = JSON.parse(await fs.readFile(claimFilePath, 'utf8')) as { claims: Array<{ agentId: string }> };
  assert.deepEqual(persisted.claims.map((claim) => claim.agentId), ['agent-a']);
});

test('acquireClaim is idempotent for the same agent and provenance', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-claims-'));
  const claimFilePath = path.join(tempRoot, 'task-claims.json');
  const now = new Date('2026-03-14T00:00:00.000Z');

  const first = await acquireClaim(claimFilePath, 'T24.1.2', 'agent-a', 'run-001', { now });
  const second = await acquireClaim(claimFilePath, 'T24.1.2', 'agent-a', 'run-001', { now });

  assert.equal(first.outcome, 'acquired');
  assert.equal(second.outcome, 'already_held');

  const persisted = JSON.parse(await fs.readFile(claimFilePath, 'utf8')) as { claims: Array<{ agentId: string }> };
  assert.equal(persisted.claims.length, 1);
});

test('acquireClaim surfaces a contested ledger even when the canonical holder matches the caller', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-claims-'));
  const claimFilePath = path.join(tempRoot, 'task-claims.json');

  await fs.writeFile(claimFilePath, JSON.stringify({
    version: 1,
    claims: [
      {
        taskId: 'T24.1.2',
        agentId: 'agent-b',
        provenanceId: 'run-000',
        claimedAt: '2026-03-14T00:00:00.000Z',
        status: 'active'
      },
      {
        taskId: 'T24.1.2',
        agentId: 'agent-a',
        provenanceId: 'run-001',
        claimedAt: '2026-03-14T00:05:00.000Z',
        status: 'active'
      }
    ]
  }, null, 2), 'utf8');

  const reacquired = await acquireClaim(claimFilePath, 'T24.1.2', 'agent-a', 'run-001', {
    now: new Date('2026-03-14T00:10:00.000Z')
  });

  assert.equal(reacquired.outcome, 'contested');
  assert.equal(reacquired.claim, null);
  assert.equal(reacquired.canonicalClaim?.claim.agentId, 'agent-a');

  const persisted = JSON.parse(await fs.readFile(claimFilePath, 'utf8')) as {
    claims: Array<{ agentId: string; provenanceId: string; status: string }>;
  };
  assert.deepEqual(
    persisted.claims.map((claim) => ({
      agentId: claim.agentId,
      provenanceId: claim.provenanceId,
      status: claim.status
    })),
    [
      {
        agentId: 'agent-b',
        provenanceId: 'run-000',
        status: 'active'
      },
      {
        agentId: 'agent-a',
        provenanceId: 'run-001',
        status: 'active'
      }
    ]
  );
});

test('releaseClaim is idempotent when the agent no longer holds the task', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-claims-'));
  const claimFilePath = path.join(tempRoot, 'task-claims.json');
  const now = new Date('2026-03-14T00:00:00.000Z');

  await acquireClaim(claimFilePath, 'T24.1.2', 'agent-a', 'run-001', { now });

  const firstRelease = await releaseClaim(claimFilePath, 'T24.1.2', 'agent-a', { now });
  const secondRelease = await releaseClaim(claimFilePath, 'T24.1.2', 'agent-a', { now });

  assert.equal(firstRelease.outcome, 'released');
  assert.equal(secondRelease.outcome, 'not_held');
  assert.equal(secondRelease.canonicalClaim, null);
});

test('releaseClaim does not mutate the file when another agent is the canonical holder', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-claims-'));
  const claimFilePath = path.join(tempRoot, 'task-claims.json');

  await fs.writeFile(claimFilePath, JSON.stringify({
    version: 1,
    claims: [
      {
        taskId: 'T24.1.2',
        agentId: 'agent-a',
        provenanceId: 'run-001',
        claimedAt: '2026-03-14T00:00:00.000Z',
        status: 'active'
      },
      {
        taskId: 'T24.1.2',
        agentId: 'agent-b',
        provenanceId: 'run-002',
        claimedAt: '2026-03-14T00:05:00.000Z',
        status: 'active'
      }
    ]
  }, null, 2), 'utf8');

  const before = await fs.readFile(claimFilePath, 'utf8');
  const released = await releaseClaim(claimFilePath, 'T24.1.2', 'agent-a');
  const after = await fs.readFile(claimFilePath, 'utf8');

  assert.equal(released.outcome, 'not_held');
  assert.equal(released.releasedClaim, null);
  assert.equal(released.canonicalClaim?.claim.agentId, 'agent-b');
  assert.equal(after, before);
});

test('releaseClaim only releases the canonical active claim held by the agent', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-claims-'));
  const claimFilePath = path.join(tempRoot, 'task-claims.json');

  await fs.writeFile(claimFilePath, JSON.stringify({
    version: 1,
    claims: [
      {
        taskId: 'T24.1.2',
        agentId: 'agent-a',
        provenanceId: 'run-001',
        claimedAt: '2026-03-14T00:00:00.000Z',
        status: 'active'
      },
      {
        taskId: 'T24.1.2',
        agentId: 'agent-a',
        provenanceId: 'run-002',
        claimedAt: '2026-03-14T00:05:00.000Z',
        status: 'active'
      }
    ]
  }, null, 2), 'utf8');

  const released = await releaseClaim(claimFilePath, 'T24.1.2', 'agent-a');

  assert.equal(released.outcome, 'released');
  assert.equal(released.releasedClaim?.claim.provenanceId, 'run-002');
  assert.equal(released.releasedClaim?.claim.status, 'released');
  assert.equal(released.canonicalClaim?.claim.provenanceId, 'run-001');

  const persisted = JSON.parse(await fs.readFile(claimFilePath, 'utf8')) as {
    claims: Array<{ taskId: string; agentId: string; provenanceId: string; status: string }>;
  };
  assert.deepEqual(
    persisted.claims.map((claim) => ({
      taskId: claim.taskId,
      agentId: claim.agentId,
      provenanceId: claim.provenanceId,
      status: claim.status
    })),
    [
      {
        taskId: 'T24.1.2',
        agentId: 'agent-a',
        provenanceId: 'run-001',
        status: 'active'
      },
      {
        taskId: 'T24.1.2',
        agentId: 'agent-a',
        provenanceId: 'run-002',
        status: 'released'
      }
    ]
  );
});

test('acquireClaim surfaces stale canonical claims without auto-releasing them', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-claims-'));
  const claimFilePath = path.join(tempRoot, 'task-claims.json');

  await fs.writeFile(claimFilePath, JSON.stringify({
    version: 1,
    claims: [
      {
        taskId: 'T24.1.2',
        agentId: 'agent-a',
        provenanceId: 'run-001',
        claimedAt: '2026-03-13T00:00:00.000Z',
        status: 'active'
      }
    ]
  }, null, 2), 'utf8');

  const contested = await acquireClaim(claimFilePath, 'T24.1.2', 'agent-b', 'run-002', {
    now: new Date('2026-03-14T12:00:00.000Z'),
    ttlMs: 1000 * 60 * 60
  });

  assert.equal(contested.outcome, 'contested');
  assert.equal(contested.canonicalClaim?.stale, true);

  const persisted = JSON.parse(await fs.readFile(claimFilePath, 'utf8')) as { claims: Array<{ status: string }> };
  assert.deepEqual(persisted.claims.map((claim) => claim.status), ['active']);
});

test('resolveStaleClaim atomically marks the expected stale canonical claim and records provenance', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-claims-'));
  const claimFilePath = path.join(tempRoot, 'task-claims.json');
  await fs.writeFile(claimFilePath, JSON.stringify({
    version: 1,
    claims: [
      {
        taskId: 'T24.1.2',
        agentId: 'agent-a',
        provenanceId: 'run-001',
        claimedAt: '2026-03-13T00:00:00.000Z',
        status: 'active'
      }
    ]
  }, null, 2), 'utf8');

  const result = await resolveStaleClaim(claimFilePath, {
    expectedClaim: {
      taskId: 'T24.1.2',
      agentId: 'agent-a',
      provenanceId: 'run-001',
      claimedAt: '2026-03-13T00:00:00.000Z',
      status: 'active'
    },
    now: new Date('2026-03-14T12:00:00.000Z'),
    ttlMs: 1000 * 60 * 60,
    resolvedBy: 'operator',
    resolutionReason: 'eligible for operator recovery after the stale claim check',
    status: 'stale'
  });

  assert.equal(result.outcome, 'resolved');
  assert.equal(result.resolvedClaim?.claim.status, 'stale');
  assert.equal(result.resolvedClaim?.claim.provenanceId, 'run-001');
  assert.equal(result.resolvedClaim?.claim.resolvedBy, 'operator');
  assert.equal(result.resolvedClaim?.claim.resolutionReason, 'eligible for operator recovery after the stale claim check');
  assert.equal(result.canonicalClaim, null);

  const persisted = JSON.parse(await fs.readFile(claimFilePath, 'utf8')) as {
    claims: Array<{ status: string; resolvedBy?: string; resolutionReason?: string; resolvedAt?: string }>;
  };
  assert.deepEqual(persisted.claims.map((claim) => claim.status), ['stale']);
  assert.equal(persisted.claims[0]?.resolvedBy, 'operator');
  assert.equal(persisted.claims[0]?.resolutionReason, 'eligible for operator recovery after the stale claim check');
  assert.equal(persisted.claims[0]?.resolvedAt, '2026-03-14T12:00:00.000Z');
});

test('resolveStaleClaim refuses to mutate claims when the canonical claim changed', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-claims-'));
  const claimFilePath = path.join(tempRoot, 'task-claims.json');
  await fs.writeFile(claimFilePath, JSON.stringify({
    version: 1,
    claims: [
      {
        taskId: 'T24.1.2',
        agentId: 'agent-a',
        provenanceId: 'run-001',
        claimedAt: '2026-03-13T00:00:00.000Z',
        status: 'active'
      },
      {
        taskId: 'T24.1.2',
        agentId: 'agent-b',
        provenanceId: 'run-002',
        claimedAt: '2026-03-14T13:00:00.000Z',
        status: 'active'
      }
    ]
  }, null, 2), 'utf8');

  const before = await fs.readFile(claimFilePath, 'utf8');
  const result = await resolveStaleClaim(claimFilePath, {
    expectedClaim: {
      taskId: 'T24.1.2',
      agentId: 'agent-a',
      provenanceId: 'run-001',
      claimedAt: '2026-03-13T00:00:00.000Z',
      status: 'active'
    },
    now: new Date('2026-03-14T14:00:00.000Z'),
    ttlMs: 1000 * 60 * 60,
    resolvedBy: 'operator',
    resolutionReason: 'eligible for operator recovery after the stale claim check'
  });
  const after = await fs.readFile(claimFilePath, 'utf8');

  assert.equal(result.outcome, 'not_eligible');
  assert.equal(result.resolvedClaim, null);
  assert.equal(result.canonicalClaim?.claim.agentId, 'agent-b');
  assert.equal(after, before);
});

test('acquireClaim replaces a legacy IDE handoff claim held by the same agent with a fresh CLI claim', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-claims-'));
  const claimFilePath = path.join(tempRoot, 'task-claims.json');
  const now = new Date('2026-03-14T12:00:00.000Z');

  await fs.writeFile(claimFilePath, JSON.stringify({
    version: 1,
    claims: [
      {
        taskId: 'T24.1.2',
        agentId: 'agent-a',
        provenanceId: 'run-i007-ide-20260314T110000Z',
        claimedAt: '2026-03-14T11:00:00.000Z',
        status: 'active'
      }
    ]
  }, null, 2), 'utf8');

  const acquired = await acquireClaim(claimFilePath, 'T24.1.2', 'agent-a', 'run-i008-cli-20260314T120000Z', { now });

  assert.equal(acquired.outcome, 'acquired');
  assert.equal(acquired.claim?.claim.provenanceId, 'run-i008-cli-20260314T120000Z');
  assert.equal(acquired.canonicalClaim?.claim.provenanceId, 'run-i008-cli-20260314T120000Z');

  const persisted = JSON.parse(await fs.readFile(claimFilePath, 'utf8')) as {
    claims: Array<{ provenanceId: string; status: string; claimedAt: string }>;
  };
  assert.deepEqual(
    persisted.claims.map((claim) => ({
      provenanceId: claim.provenanceId,
      status: claim.status,
      claimedAt: claim.claimedAt
    })),
    [
      {
        provenanceId: 'run-i007-ide-20260314T110000Z',
        status: 'released',
        claimedAt: '2026-03-14T11:00:00.000Z'
      },
      {
        provenanceId: 'run-i008-cli-20260314T120000Z',
        status: 'active',
        claimedAt: now.toISOString()
      }
    ]
  );
});

test('acquireClaim reclaims every active legacy IDE handoff claim held by the same agent before writing a fresh CLI claim', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-claims-'));
  const claimFilePath = path.join(tempRoot, 'task-claims.json');
  const now = new Date('2026-03-14T12:00:00.000Z');

  await fs.writeFile(claimFilePath, JSON.stringify({
    version: 1,
    claims: [
      {
        taskId: 'T24.1.2',
        agentId: 'agent-a',
        provenanceId: 'run-i006-ide-20260314T100000Z',
        claimedAt: '2026-03-14T10:00:00.000Z',
        status: 'active'
      },
      {
        taskId: 'T24.1.2',
        agentId: 'agent-a',
        provenanceId: 'run-i007-ide-20260314T110000Z',
        claimedAt: '2026-03-14T11:00:00.000Z',
        status: 'active'
      }
    ]
  }, null, 2), 'utf8');

  const acquired = await acquireClaim(claimFilePath, 'T24.1.2', 'agent-a', 'run-i008-cli-20260314T120000Z', { now });

  assert.equal(acquired.outcome, 'acquired');
  assert.equal(acquired.claim?.claim.provenanceId, 'run-i008-cli-20260314T120000Z');
  assert.equal(acquired.canonicalClaim?.claim.provenanceId, 'run-i008-cli-20260314T120000Z');

  const persisted = JSON.parse(await fs.readFile(claimFilePath, 'utf8')) as {
    claims: Array<{ provenanceId: string; status: string; claimedAt: string }>;
  };
  assert.deepEqual(
    persisted.claims.map((claim) => ({
      provenanceId: claim.provenanceId,
      status: claim.status,
      claimedAt: claim.claimedAt
    })),
    [
      {
        provenanceId: 'run-i006-ide-20260314T100000Z',
        status: 'released',
        claimedAt: '2026-03-14T10:00:00.000Z'
      },
      {
        provenanceId: 'run-i007-ide-20260314T110000Z',
        status: 'released',
        claimedAt: '2026-03-14T11:00:00.000Z'
      },
      {
        provenanceId: 'run-i008-cli-20260314T120000Z',
        status: 'active',
        claimedAt: now.toISOString()
      }
    ]
  );
});

test('acquireClaim persists release of legacy IDE handoff claims even when another agent still holds the task', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-claims-'));
  const claimFilePath = path.join(tempRoot, 'task-claims.json');

  await fs.writeFile(claimFilePath, JSON.stringify({
    version: 1,
    claims: [
      {
        taskId: 'T24.1.2',
        agentId: 'agent-a',
        provenanceId: 'run-i007-ide-20260314T110000Z',
        claimedAt: '2026-03-14T11:00:00.000Z',
        status: 'active'
      },
      {
        taskId: 'T24.1.2',
        agentId: 'agent-b',
        provenanceId: 'run-i008-cli-20260314T113000Z',
        claimedAt: '2026-03-14T11:30:00.000Z',
        status: 'active'
      }
    ]
  }, null, 2), 'utf8');

  const acquired = await acquireClaim(claimFilePath, 'T24.1.2', 'agent-a', 'run-i009-cli-20260314T120000Z');

  assert.equal(acquired.outcome, 'contested');
  assert.equal(acquired.canonicalClaim?.claim.agentId, 'agent-b');
  assert.equal(acquired.canonicalClaim?.claim.provenanceId, 'run-i008-cli-20260314T113000Z');

  const persisted = JSON.parse(await fs.readFile(claimFilePath, 'utf8')) as {
    claims: Array<{ provenanceId: string; agentId: string; status: string }>;
  };
  assert.deepEqual(
    persisted.claims.map((claim) => ({
      provenanceId: claim.provenanceId,
      agentId: claim.agentId,
      status: claim.status
    })),
    [
      {
        provenanceId: 'run-i007-ide-20260314T110000Z',
        agentId: 'agent-a',
        status: 'released'
      },
      {
        provenanceId: 'run-i008-cli-20260314T113000Z',
        agentId: 'agent-b',
        status: 'active'
      }
    ]
  );
});

test('acquireClaim uses the file lock so concurrent claim attempts leave one canonical holder', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-claims-'));
  const claimFilePath = path.join(tempRoot, 'task-claims.json');
  const now = new Date('2026-03-14T00:00:00.000Z');

  const [first, second] = await Promise.all([
    acquireClaim(claimFilePath, 'T24.1.2', 'agent-a', 'run-001', {
      now,
      lockRetryCount: 50,
      lockRetryDelayMs: 10
    }),
    acquireClaim(claimFilePath, 'T24.1.2', 'agent-b', 'run-002', {
      now,
      lockRetryCount: 50,
      lockRetryDelayMs: 10
    })
  ]);

  const outcomes = [first, second].map((result) => result.outcome).sort();
  assert.deepEqual(outcomes, ['acquired', 'contested']);

  const acquired = [first, second].find((result) => result.outcome === 'acquired');
  const contested = [first, second].find((result) => result.outcome === 'contested');
  assert.ok(acquired);
  assert.ok(contested);
  assert.equal(contested.canonicalClaim?.claim.agentId, acquired.claim?.claim.agentId);

  const persisted = JSON.parse(await fs.readFile(claimFilePath, 'utf8')) as {
    claims: Array<{ taskId: string; agentId: string; provenanceId: string; claimedAt: string; status: string }>;
  };
  assert.equal(persisted.claims.length, 1);
  assert.deepEqual(
    {
      taskId: persisted.claims[0]?.taskId,
      agentId: persisted.claims[0]?.agentId,
      provenanceId: persisted.claims[0]?.provenanceId,
      status: persisted.claims[0]?.status
    },
    {
      taskId: 'T24.1.2',
      agentId: acquired.claim?.claim.agentId,
      provenanceId: acquired.claim?.claim.provenanceId,
      status: 'active'
    }
  );
  assert.equal(persisted.claims[0]?.claimedAt, now.toISOString());
});

test('claim file mutations do not leave temporary write or lock artifacts behind', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-claims-'));
  const claimFilePath = path.join(tempRoot, 'task-claims.json');
  const now = new Date('2026-03-14T00:00:00.000Z');

  await acquireClaim(claimFilePath, 'T24.1.2', 'agent-a', 'run-001', { now });
  await releaseClaim(claimFilePath, 'T24.1.2', 'agent-a', { now });

  const remainingEntries = (await fs.readdir(tempRoot))
    .filter((entry) => entry !== path.basename(claimFilePath))
    .sort();

  assert.deepEqual(remainingEntries, []);
});

test('releaseClaim uses the file lock so concurrent releases leave one released record', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-claims-'));
  const claimFilePath = path.join(tempRoot, 'task-claims.json');
  const now = new Date('2026-03-14T00:00:00.000Z');

  await acquireClaim(claimFilePath, 'T24.1.2', 'agent-a', 'run-001', { now });

  const [first, second] = await Promise.all([
    releaseClaim(claimFilePath, 'T24.1.2', 'agent-a', {
      now,
      lockRetryCount: 50,
      lockRetryDelayMs: 10
    }),
    releaseClaim(claimFilePath, 'T24.1.2', 'agent-a', {
      now,
      lockRetryCount: 50,
      lockRetryDelayMs: 10
    })
  ]);

  const outcomes = [first, second].map((result) => result.outcome).sort();
  assert.deepEqual(outcomes, ['not_held', 'released']);

  const released = [first, second].find((result) => result.outcome === 'released');
  const notHeld = [first, second].find((result) => result.outcome === 'not_held');
  assert.ok(released);
  assert.ok(notHeld);
  assert.equal(released.releasedClaim?.claim.agentId, 'agent-a');
  assert.equal(notHeld.canonicalClaim, null);

  const persisted = JSON.parse(await fs.readFile(claimFilePath, 'utf8')) as {
    claims: Array<{ taskId: string; agentId: string; provenanceId: string; status: string }>;
  };
  assert.deepEqual(
    persisted.claims.map((claim) => ({
      taskId: claim.taskId,
      agentId: claim.agentId,
      provenanceId: claim.provenanceId,
      status: claim.status
    })),
    [
      {
        taskId: 'T24.1.2',
        agentId: 'agent-a',
        provenanceId: 'run-001',
        status: 'released'
      }
    ]
  );
});

test('withTaskFileLock serializes concurrent tasks.json mutations through a sibling tasks.lock file', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-task-file-'));
  const taskFilePath = path.join(tempRoot, 'tasks.json');
  await fs.writeFile(taskFilePath, stringifyTaskFile(parseTaskFile(JSON.stringify({
    version: 2,
    tasks: [
      { id: 'T1', title: 'First task', status: 'todo' }
    ]
  }))), 'utf8');

  const startGate = deferred<void>();
  const finishGate = deferred<void>();
  let firstHasLock = false;

  const first = withTaskFileLock(taskFilePath, {
    lockRetryCount: 50,
    lockRetryDelayMs: 10
  }, async () => {
    firstHasLock = true;
    startGate.resolve();
    await finishGate.promise;

    const taskFile = parseTaskFile(await fs.readFile(taskFilePath, 'utf8'));
    const updated: typeof taskFile = {
      ...taskFile,
      tasks: taskFile.tasks.map((task) => task.id === 'T1' ? { ...task, status: 'in_progress' } : task)
    };
    await fs.writeFile(taskFilePath, stringifyTaskFile(updated), 'utf8');
    return 'first';
  });

  await startGate.promise;
  assert.equal(firstHasLock, true);
  assert.equal(await pathExists(path.join(tempRoot, 'tasks.lock')), true);

  const second = withTaskFileLock(taskFilePath, {
    lockRetryCount: 50,
    lockRetryDelayMs: 10
  }, async () => {
    const taskFile = parseTaskFile(await fs.readFile(taskFilePath, 'utf8'));
    const updated: typeof taskFile = {
      ...taskFile,
      tasks: taskFile.tasks.map((task) => task.id === 'T1' ? { ...task, notes: 'serialized write' } : task)
    };
    await fs.writeFile(taskFilePath, stringifyTaskFile(updated), 'utf8');
    return 'second';
  });

  await sleep(30);
  assert.equal(await pathExists(path.join(tempRoot, 'tasks.lock')), true);

  finishGate.resolve();

  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.deepEqual([firstResult.outcome, secondResult.outcome], ['ok', 'ok']);
  assert.equal(firstResult.outcome === 'ok' ? firstResult.value : '', 'first');
  assert.equal(secondResult.outcome === 'ok' ? secondResult.value : '', 'second');

  const persisted = parseTaskFile(await fs.readFile(taskFilePath, 'utf8'));
  assert.equal(persisted.tasks[0]?.status, 'in_progress');
  assert.equal(persisted.tasks[0]?.notes, 'serialized write');
  assert.equal(await pathExists(path.join(tempRoot, 'tasks.lock')), false);
});

test('withTaskFileLock returns lock_timeout after the configured retry window', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-task-file-'));
  const taskFilePath = path.join(tempRoot, 'tasks.json');
  const lockPath = path.join(tempRoot, 'tasks.lock');
  await fs.writeFile(taskFilePath, stringifyTaskFile(parseTaskFile(JSON.stringify({
    version: 2,
    tasks: []
  }))), 'utf8');
  await fs.writeFile(lockPath, '', 'utf8');

  const result = await withTaskFileLock(taskFilePath, {
    lockRetryCount: 2,
    lockRetryDelayMs: 1
  }, async () => 'unreachable');

  assert.deepEqual(result, {
    outcome: 'lock_timeout',
    lockPath,
    attempts: 3
  });
  assert.equal(await pathExists(lockPath), true);
});

function deferred<T>(): { promise: Promise<T>; resolve: (value: T | PromiseLike<T>) => void; reject: (reason?: unknown) => void } {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return {
    promise,
    resolve,
    reject
  };
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}
