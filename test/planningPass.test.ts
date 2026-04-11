import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import {
  formatTaskPlanContext,
  parsePlanningResponse,
  readTaskPlan,
  TaskPlanArtifact,
  writeTaskPlan
} from '../src/ralph/planningPass';

// -- parsePlanningResponse --

test('parsePlanningResponse parses a fenced JSON block with all fields', () => {
  const text = [
    'Here is my plan:',
    '```json',
    JSON.stringify({
      reasoning: 'Need to refactor the module',
      approach: 'Extract helper functions',
      steps: ['Read existing code', 'Write helpers', 'Update callers'],
      risks: ['Breaking change risk'],
      suggestedValidationCommand: 'npm run validate'
    }),
    '```'
  ].join('\n');

  const result = parsePlanningResponse(text);
  assert.ok(result !== null);
  assert.equal(result.reasoning, 'Need to refactor the module');
  assert.equal(result.approach, 'Extract helper functions');
  assert.deepEqual(result.steps, ['Read existing code', 'Write helpers', 'Update callers']);
  assert.deepEqual(result.risks, ['Breaking change risk']);
  assert.equal(result.suggestedValidationCommand, 'npm run validate');
});

test('parsePlanningResponse parses a raw JSON block when no fence is present', () => {
  const text = JSON.stringify({
    reasoning: 'Direct implementation',
    approach: 'Minimal change',
    steps: ['Step A'],
    risks: []
  });

  const result = parsePlanningResponse(text);
  assert.ok(result !== null);
  assert.equal(result.reasoning, 'Direct implementation');
  assert.equal(result.approach, 'Minimal change');
  assert.deepEqual(result.steps, ['Step A']);
  assert.deepEqual(result.risks, []);
  assert.equal(result.suggestedValidationCommand, undefined);
});

test('parsePlanningResponse returns null for non-JSON text', () => {
  assert.equal(parsePlanningResponse('Just some prose, no JSON here.'), null);
});

test('parsePlanningResponse returns null when all required fields are empty', () => {
  const text = JSON.stringify({ reasoning: '', approach: '', steps: [], risks: [] });
  assert.equal(parsePlanningResponse(text), null);
});

test('parsePlanningResponse omits suggestedValidationCommand when not present', () => {
  const text = JSON.stringify({
    reasoning: 'r',
    approach: 'a',
    steps: [],
    risks: []
  });
  const result = parsePlanningResponse(text);
  assert.ok(result !== null);
  assert.equal(result.suggestedValidationCommand, undefined);
});

// -- writeTaskPlan / readTaskPlan roundtrip --

test('writeTaskPlan writes task-plan.json and readTaskPlan reads it back', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-plan-'));
  const plan: TaskPlanArtifact = {
    reasoning: 'Inline planning pass produced this',
    approach: 'Smallest coherent change',
    steps: ['Read task', 'Edit file', 'Run tests'],
    risks: ['May conflict with T42'],
    suggestedValidationCommand: 'npm run validate'
  };

  const writtenPath = await writeTaskPlan(tmpDir, 'T100', plan);
  assert.ok(writtenPath.endsWith('task-plan.json'));

  const read = await readTaskPlan(tmpDir, 'T100');
  assert.ok(read !== null);
  assert.equal(read.reasoning, plan.reasoning);
  assert.equal(read.approach, plan.approach);
  assert.deepEqual(read.steps, plan.steps);
  assert.deepEqual(read.risks, plan.risks);
  assert.equal(read.suggestedValidationCommand, plan.suggestedValidationCommand);
});

test('readTaskPlan returns null when task-plan.json does not exist', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ralph-plan-'));
  const result = await readTaskPlan(tmpDir, 'TNONE');
  assert.equal(result, null);
});

// -- formatTaskPlanContext --

test('formatTaskPlanContext renders reasoning and approach lines', () => {
  const plan: TaskPlanArtifact = {
    reasoning: 'We need this',
    approach: 'Do it simply',
    steps: ['A', 'B'],
    risks: ['risk1']
  };
  const output = formatTaskPlanContext(plan);
  assert.match(output, /Reasoning: We need this/);
  assert.match(output, /Approach: Do it simply/);
  assert.match(output, /Steps: A → B/);
  assert.match(output, /Risks: risk1/);
});

test('formatTaskPlanContext includes suggestedValidationCommand when present', () => {
  const plan: TaskPlanArtifact = {
    reasoning: 'r',
    approach: 'a',
    steps: [],
    risks: [],
    suggestedValidationCommand: 'npm run validate'
  };
  const output = formatTaskPlanContext(plan);
  assert.match(output, /Suggested validation: npm run validate/);
});

test('formatTaskPlanContext returns empty string for empty plan content', () => {
  const plan: TaskPlanArtifact = {
    reasoning: '',
    approach: '',
    steps: [],
    risks: []
  };
  const output = formatTaskPlanContext(plan);
  assert.equal(output, '');
});
