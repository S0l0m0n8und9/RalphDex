import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import {
  analyzeTaskShape,
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
  assert.equal(result.readiness, 'ready');
});

test('parsePlanningResponse parses readiness and valid suggestedChildTasks', () => {
  const text = JSON.stringify({
    reasoning: 'Task is broad',
    approach: 'Split it',
    steps: ['Scaffold', 'Smoke test'],
    risks: [],
    readiness: 'needs_decomposition',
    readinessReason: 'Greenfield epic',
    atomicity: 'epic',
    estimatedTaskCount: 3,
    nextAction: 'apply_child_tasks_and_stop',
    suggestedChildTasks: [{
      id: 'T1.1',
      title: 'Create scaffold',
      parentId: 'T1',
      dependsOn: [],
      validation: 'npm test',
      rationale: 'Bounded first step'
    }]
  });
  const result = parsePlanningResponse(text);
  assert.ok(result);
  assert.equal(result.readiness, 'needs_decomposition');
  assert.equal(result.readinessReason, 'Greenfield epic');
  assert.equal(result.atomicity, 'epic');
  assert.equal(result.estimatedTaskCount, 3);
  assert.equal(result.nextAction, 'apply_child_tasks_and_stop');
  assert.equal(result.suggestedChildTasks?.length, 1);
});

test('parsePlanningResponse ignores malformed readiness and malformed suggestedChildTasks safely', () => {
  const text = JSON.stringify({
    reasoning: 'Task exists',
    approach: 'Try',
    steps: ['one'],
    risks: [],
    readiness: 'explode',
    atomicity: 'gigantic',
    nextAction: 'do_everything',
    suggestedChildTasks: [{ id: '', title: 'bad' }]
  });
  const result = parsePlanningResponse(text);
  assert.ok(result);
  assert.equal(result.readiness, 'ready');
  assert.equal(result.atomicity, undefined);
  assert.equal(result.nextAction, undefined);
  assert.equal(result.suggestedChildTasks, undefined);
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

// -- deterministic task-shape diagnostics --

test('analyzeTaskShape detects missing acceptance criteria', () => {
  const result = analyzeTaskShape({
    task: { id: 'T1', title: 'Add health endpoint', status: 'todo', validation: 'npm test' },
    effectiveValidationCommand: 'npm test'
  });

  assert.equal(result.findings.some((finding) => finding.code === 'missing_acceptance'), true);
  assert.equal(result.recommendedAction, 'warn');
});

test('analyzeTaskShape detects missing validation command', () => {
  const result = analyzeTaskShape({
    task: { id: 'T1', title: 'Add health endpoint', status: 'todo', acceptance: ['GET /health returns 200'] }
  });

  assert.equal(result.findings.some((finding) => finding.code === 'missing_validation'), true);
  assert.equal(result.recommendedAction, 'warn');
});

test('analyzeTaskShape detects broad and compound task titles', () => {
  const result = analyzeTaskShape({
    task: {
      id: 'T1',
      title: 'Build the app and set up auth/database/routing/tests/deployment',
      status: 'todo',
      acceptance: ['App runs'],
      validation: 'npm test'
    },
    effectiveValidationCommand: 'npm test'
  });

  assert.equal(result.atomicity, 'epic');
  assert.equal(result.findings.some((finding) => finding.code === 'broad_scope'), true);
  assert.equal(result.findings.some((finding) => finding.code === 'compound_title'), true);
  assert.equal(result.recommendedAction, 'decompose');
});

test('analyzeTaskShape detects greenfield broad first task', () => {
  const result = analyzeTaskShape({
    task: {
      id: 'T1',
      title: 'Implement foundation',
      status: 'todo',
      acceptance: ['Foundation exists'],
      validation: 'npm test'
    },
    effectiveValidationCommand: 'npm test',
    workspaceScan: {
      packageJson: { name: 'empty', packageManager: null, hasWorkspaces: false, scriptNames: ['test'], lifecycleCommands: ['npm test'], validationCommands: ['npm test'], testSignals: [] },
      manifests: ['package.json'],
      sourceRoots: [],
      tests: [],
      projectMarkers: ['package.json'],
      validationCommands: ['npm test'],
      packageManagers: ['npm']
    }
  });

  assert.equal(result.findings.some((finding) => finding.code === 'greenfield_bootstrap_risk'), true);
  assert.equal(result.recommendedAction, 'decompose');
});

test('analyzeTaskShape detects missing package script referenced by validation', () => {
  const result = analyzeTaskShape({
    task: {
      id: 'T1',
      title: 'Add build check',
      status: 'todo',
      acceptance: ['Build check exists'],
      validation: 'npm run validate'
    },
    effectiveValidationCommand: 'npm run validate',
    workspaceScan: {
      packageJson: { name: 'demo', packageManager: null, hasWorkspaces: false, scriptNames: ['test'], lifecycleCommands: ['npm test'], validationCommands: ['npm test'], testSignals: [] },
      manifests: ['package.json'],
      sourceRoots: ['src'],
      tests: ['test'],
      projectMarkers: ['package.json', 'src', 'test'],
      validationCommands: ['npm test'],
      packageManagers: ['npm']
    }
  });

  assert.equal(result.findings.some((finding) => finding.code === 'missing_package_script'), true);
  assert.equal(result.recommendedAction, 'block_or_review');
});

test('analyzeTaskShape does not flag a small existing-repo task with acceptance and validation', () => {
  const result = analyzeTaskShape({
    task: {
      id: 'T1',
      title: 'Add health endpoint',
      status: 'todo',
      acceptance: ['GET /health returns 200'],
      validation: 'npm test'
    },
    effectiveValidationCommand: 'npm test',
    workspaceScan: {
      packageJson: { name: 'demo', packageManager: null, hasWorkspaces: false, scriptNames: ['test'], lifecycleCommands: ['npm test'], validationCommands: ['npm test'], testSignals: [] },
      manifests: ['package.json'],
      sourceRoots: ['src'],
      tests: ['test'],
      projectMarkers: ['package.json', 'src', 'test'],
      validationCommands: ['npm test'],
      packageManagers: ['npm']
    }
  });

  assert.equal(result.atomicity, 'atomic');
  assert.deepEqual(result.findings, []);
  assert.equal(result.recommendedAction, 'execute');
});
