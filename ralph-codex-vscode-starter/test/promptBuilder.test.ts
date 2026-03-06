import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPrompt, choosePromptKind, createPromptFileName } from '../src/prompt/promptBuilder';
import { RalphPaths } from '../src/ralph/pathResolver';
import { RalphWorkspaceState } from '../src/ralph/types';
import { WorkspaceScan } from '../src/services/workspaceInspection';

const paths: RalphPaths = {
  rootPath: '/workspace',
  ralphDir: '/workspace/.ralph',
  prdPath: '/workspace/.ralph/prd.md',
  progressPath: '/workspace/.ralph/progress.md',
  taskFilePath: '/workspace/.ralph/tasks.json',
  stateFilePath: '/workspace/.ralph/state.json',
  promptDir: '/workspace/.ralph/prompts',
  runDir: '/workspace/.ralph/runs',
  logDir: '/workspace/.ralph/logs',
  logFilePath: '/workspace/.ralph/logs/extension.log'
};

const summary: WorkspaceScan = {
  workspaceName: 'demo',
  rootPath: '/workspace',
  manifests: ['package.json', 'tsconfig.json'],
  packageManagers: ['npm'],
  ciFiles: ['.github'],
  docs: ['README.md', 'AGENTS.md'],
  sourceRoots: ['src'],
  lifecycleCommands: ['npm run lint', 'npm run test'],
  testSignals: ['package.json defines a test script.'],
  notes: [],
  packageJson: {
    name: 'demo',
    packageManager: 'npm',
    hasWorkspaces: false,
    scriptNames: ['lint', 'test'],
    lifecycleCommands: ['npm run lint', 'npm run test'],
    testSignals: ['package.json defines a test script.']
  }
};

function state(runHistoryLength: number): RalphWorkspaceState {
  return {
    version: 1,
    objectivePreview: 'Ship v1',
    nextIteration: 1,
    lastPromptKind: null,
    lastPromptPath: null,
    lastRun: null,
    runHistory: Array.from({ length: runHistoryLength }, (_, index) => ({
      iteration: index + 1,
      mode: 'singleExec',
      promptKind: 'iteration',
      startedAt: '2026-03-07T00:00:00.000Z',
      finishedAt: '2026-03-07T00:05:00.000Z',
      status: 'succeeded',
      exitCode: 0,
      promptPath: `/workspace/.ralph/prompts/iteration-${index + 1}.prompt.md`,
      summary: 'Implemented one step.'
    })),
    updatedAt: '2026-03-07T00:05:00.000Z'
  };
}

test('choosePromptKind uses bootstrap for the first run and iteration afterwards', () => {
  assert.equal(choosePromptKind(state(0)), 'bootstrap');
  assert.equal(choosePromptKind(state(1)), 'iteration');
  assert.equal(createPromptFileName('iteration', 12), 'iteration-012.prompt.md');
});

test('buildPrompt includes the durable Ralph state and repo facts', () => {
  const prompt = buildPrompt({
    kind: 'bootstrap',
    iteration: 1,
    objectiveText: '# Product / project brief\n\nShip v1.',
    progressText: '# Progress\n\n- Seeded.',
    tasksText: '{ "tasks": [] }',
    taskCounts: {
      todo: 1,
      in_progress: 0,
      blocked: 0,
      done: 0
    },
    summary,
    state: state(0),
    paths
  });

  assert.match(prompt, /Ralph Codex Bootstrap Prompt/);
  assert.match(prompt, /Workspace Snapshot/);
  assert.match(prompt, /Task Status Summary/);
  assert.match(prompt, /Runtime state path: \.ralph\/state\.json/);
});
