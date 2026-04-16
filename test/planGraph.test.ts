import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { planGraphPath } from '../src/ralph/artifactStore';
import {
  readPlanGraph,
  validateWaveSafety,
  writePlanGraph
} from '../src/ralph/planGraph';
import type { ExecutionWave, PlanGraph, RalphTask } from '../src/ralph/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ralph-plangraph-'));
}

function makeTask(overrides: Partial<RalphTask> & { id: string }): RalphTask {
  return {
    title: `Task ${overrides.id}`,
    status: 'todo',
    ...overrides
  };
}

function makeWave(overrides: Partial<ExecutionWave> = {}): ExecutionWave {
  return {
    waveIndex: 0,
    memberTaskIds: [],
    launchGuards: [],
    fanInCriteria: [],
    status: 'pending',
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// planGraphPath
// ---------------------------------------------------------------------------

test('planGraphPath returns <artifactRootDir>/<parentTaskId>/plan-graph.json', () => {
  const result = planGraphPath('/project/.ralph/artifacts', 'T100');
  assert.ok(result.endsWith(path.join('T100', 'plan-graph.json')));
  assert.ok(result.startsWith(path.normalize('/project/.ralph/artifacts')));
});

// ---------------------------------------------------------------------------
// read/write plan-graph round-trip
// ---------------------------------------------------------------------------

test('writePlanGraph + readPlanGraph round-trips a PlanGraph', async () => {
  const tmpDir = await makeTempDir();
  const filePath = path.join(tmpDir, 'T50', 'plan-graph.json');
  const graph: PlanGraph = {
    parentTaskId: 'T50',
    waves: [
      {
        waveIndex: 0,
        memberTaskIds: ['T51', 'T52'],
        launchGuards: ['all dependencies done'],
        fanInCriteria: ['both tasks done'],
        status: 'pending'
      }
    ],
    createdAt: '2026-04-16T00:00:00.000Z'
  };

  await writePlanGraph(filePath, graph);
  const read = await readPlanGraph(filePath);

  assert.deepEqual(read, graph);
});

test('readPlanGraph returns null for non-existent file', async () => {
  const tmpDir = await makeTempDir();
  const filePath = path.join(tmpDir, 'does-not-exist', 'plan-graph.json');

  const result = await readPlanGraph(filePath);
  assert.equal(result, null);
});

// ---------------------------------------------------------------------------
// validateWaveSafety — valid wave with independent tasks passes
// ---------------------------------------------------------------------------

test('validateWaveSafety returns no errors for a valid wave with independent tasks', () => {
  const tasks: RalphTask[] = [
    makeTask({ id: 'T10', status: 'todo' }),
    makeTask({ id: 'T11', status: 'todo' }),
    makeTask({ id: 'T1', status: 'done' })
  ];
  const wave = makeWave({ memberTaskIds: ['T10', 'T11'] });

  const errors = validateWaveSafety(wave, tasks);
  assert.deepEqual(errors, []);
});

test('validateWaveSafety passes when all dependencies are done', () => {
  const tasks: RalphTask[] = [
    makeTask({ id: 'T10', status: 'todo', dependsOn: ['T1'] }),
    makeTask({ id: 'T11', status: 'todo', dependsOn: ['T1'] }),
    makeTask({ id: 'T1', status: 'done' })
  ];
  const wave = makeWave({ memberTaskIds: ['T10', 'T11'] });

  const errors = validateWaveSafety(wave, tasks);
  assert.deepEqual(errors, []);
});

// ---------------------------------------------------------------------------
// validateWaveSafety — wave with unresolved dependency fails
// ---------------------------------------------------------------------------

test('validateWaveSafety reports unresolved dependency when dep is not done', () => {
  const tasks: RalphTask[] = [
    makeTask({ id: 'T10', status: 'todo', dependsOn: ['T1'] }),
    makeTask({ id: 'T11', status: 'todo' }),
    makeTask({ id: 'T1', status: 'in_progress' })
  ];
  const wave = makeWave({ memberTaskIds: ['T10', 'T11'] });

  const errors = validateWaveSafety(wave, tasks);
  assert.equal(errors.length, 1);
  assert.ok(errors[0].includes('T10'));
  assert.ok(errors[0].includes('T1'));
  assert.ok(errors[0].includes('unresolved dependency'));
});

test('validateWaveSafety reports dangling member task reference', () => {
  const tasks: RalphTask[] = [
    makeTask({ id: 'T10', status: 'todo' })
  ];
  const wave = makeWave({ memberTaskIds: ['T10', 'T99'] });

  const errors = validateWaveSafety(wave, tasks);
  assert.equal(errors.length, 1);
  assert.ok(errors[0].includes('T99'));
  assert.ok(errors[0].includes('dangling'));
});

test('validateWaveSafety reports dependency that does not exist in task graph', () => {
  const tasks: RalphTask[] = [
    makeTask({ id: 'T10', status: 'todo', dependsOn: ['T_MISSING'] })
  ];
  const wave = makeWave({ memberTaskIds: ['T10'] });

  const errors = validateWaveSafety(wave, tasks);
  assert.equal(errors.length, 1);
  assert.ok(errors[0].includes('T_MISSING'));
  assert.ok(errors[0].includes('does not exist'));
});

// ---------------------------------------------------------------------------
// validateWaveSafety — wave with write-risk conflict fails
// ---------------------------------------------------------------------------

test('validateWaveSafety reports write-risk conflict when tasks share a label', () => {
  const tasks: RalphTask[] = [
    makeTask({ id: 'T10', status: 'todo', writeRiskLabels: ['src/config.ts'] }),
    makeTask({ id: 'T11', status: 'todo', writeRiskLabels: ['src/config.ts', 'src/utils.ts'] }),
    makeTask({ id: 'T12', status: 'todo', writeRiskLabels: ['src/utils.ts'] })
  ];
  const wave = makeWave({ memberTaskIds: ['T10', 'T11', 'T12'] });

  const errors = validateWaveSafety(wave, tasks);
  assert.equal(errors.length, 2);
  const configError = errors.find(e => e.includes('src/config.ts'));
  const utilsError = errors.find(e => e.includes('src/utils.ts'));
  assert.ok(configError, 'expected an error for src/config.ts conflict');
  assert.ok(utilsError, 'expected an error for src/utils.ts conflict');
  assert.ok(configError!.includes('T10'));
  assert.ok(configError!.includes('T11'));
  assert.ok(utilsError!.includes('T11'));
  assert.ok(utilsError!.includes('T12'));
});

test('validateWaveSafety passes when write-risk labels do not overlap', () => {
  const tasks: RalphTask[] = [
    makeTask({ id: 'T10', status: 'todo', writeRiskLabels: ['src/a.ts'] }),
    makeTask({ id: 'T11', status: 'todo', writeRiskLabels: ['src/b.ts'] })
  ];
  const wave = makeWave({ memberTaskIds: ['T10', 'T11'] });

  const errors = validateWaveSafety(wave, tasks);
  assert.deepEqual(errors, []);
});

// ---------------------------------------------------------------------------
// validateWaveSafety — combined violations
// ---------------------------------------------------------------------------

test('validateWaveSafety reports both dependency and write-risk violations', () => {
  const tasks: RalphTask[] = [
    makeTask({ id: 'T10', status: 'todo', dependsOn: ['T1'], writeRiskLabels: ['pkg.json'] }),
    makeTask({ id: 'T11', status: 'todo', writeRiskLabels: ['pkg.json'] }),
    makeTask({ id: 'T1', status: 'blocked' })
  ];
  const wave = makeWave({ memberTaskIds: ['T10', 'T11'] });

  const errors = validateWaveSafety(wave, tasks);
  assert.ok(errors.length >= 2, `expected at least 2 errors, got ${errors.length}`);
  const hasDepError = errors.some(e => e.includes('unresolved dependency'));
  const hasWriteError = errors.some(e => e.includes('Write-risk conflict'));
  assert.ok(hasDepError, 'expected an unresolved dependency error');
  assert.ok(hasWriteError, 'expected a write-risk conflict error');
});
