import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPrompt } from '../src/prompt/promptBuilder';
import { RalphPaths } from '../src/ralph/pathResolver';
import { RalphPromptKind, RalphTask } from '../src/ralph/types';
import {
  PromptScenarioFixture,
  buildWorkspaceStateForScenario,
  findSelectedTaskForScenario,
  promptScenarios,
  taskCountsForScenario
} from './fixtures/promptScenarios';

function createPaths(rootPath: string): RalphPaths {
  return {
    rootPath,
    ralphDir: `${rootPath}/.ralph`,
    prdPath: `${rootPath}/.ralph/prd.md`,
    progressPath: `${rootPath}/.ralph/progress.md`,
    taskFilePath: `${rootPath}/.ralph/tasks.json`,
    claimFilePath: `${rootPath}/.ralph/claims.json`,
    stateFilePath: `${rootPath}/.ralph/state.json`,
    promptDir: `${rootPath}/.ralph/prompts`,
    runDir: `${rootPath}/.ralph/runs`,
    logDir: `${rootPath}/.ralph/logs`,
    logFilePath: `${rootPath}/.ralph/logs/extension.log`,
    artifactDir: `${rootPath}/.ralph/artifacts`
  };
}

function selectedValidation(task: RalphTask | null): string | null {
  return task?.validation ?? null;
}

async function renderScenarioPrompt(
  scenario: PromptScenarioFixture,
  kind: RalphPromptKind
): Promise<string> {
  const state = buildWorkspaceStateForScenario(scenario);
  const selectedTask = findSelectedTaskForScenario(scenario);
  const validationCommand = selectedValidation(selectedTask);
  const render = await buildPrompt({
    kind,
    target: 'cliExec',
    iteration: state.nextIteration,
    selectionReason: `Content assertion fixture for ${scenario.name}/${kind}.`,
    objectiveText: scenario.prd,
    progressText: scenario.progress,
    taskCounts: taskCountsForScenario(scenario),
    summary: scenario.workspaceScan,
    state,
    paths: createPaths(scenario.workspaceScan.rootPath),
    taskFile: scenario.taskFile,
    selectedTask,
    taskValidationHint: validationCommand,
    effectiveValidationCommand: validationCommand,
    normalizedValidationCommandFrom: validationCommand,
    validationCommand,
    preflightReport: {
      ready: true,
      summary: `Fixture scenario ${scenario.name} is ready for prompt rendering.`,
      diagnostics: []
    },
    config: {
      promptTemplateDirectory: '',
      promptIncludeVerifierFeedback: true,
      promptPriorContextBudget: 8
    }
  });

  return render.prompt;
}

test('fix-failure prompt keeps the selected task validation command in rendered text', async () => {
  const prompt = await renderScenarioPrompt(promptScenarios.fixFailure, 'fix-failure');

  assert.match(prompt, /Task validation hint: npm run compile/);
  assert.match(prompt, /Effective validation command: npm run compile/);
});

test('human-review handoff prompt keeps the task blocker text in rendered text', async () => {
  const prompt = await renderScenarioPrompt(promptScenarios.humanReview, 'human-review-handoff');

  assert.match(prompt, /\[human-review-needed\] Fixture baseline requires explicit reviewer sign-off before proceeding\./);
});

test('replenish-backlog prompt keeps the PRD objective text in rendered text', async () => {
  const prompt = await renderScenarioPrompt(promptScenarios.replenishBacklog, 'replenish-backlog');

  assert.match(prompt, /Keep Ralph moving when the current durable backlog is fully consumed\./);
});

test('iteration prompt can still carry remediation summary text when prior remediation exists', async () => {
  const prompt = await renderScenarioPrompt(promptScenarios.repeatedNoProgress, 'iteration');

  assert.match(prompt, /Prior remediation: Decompose T3 into smaller bounded child tasks before retrying\./);
});

test('bootstrap prompt does not leak prior-iteration details', async () => {
  const prompt = await renderScenarioPrompt(promptScenarios.freshWorkspace, 'bootstrap');

  assert.doesNotMatch(prompt, /- Prior iteration: \d+/);
  assert.doesNotMatch(prompt, /- Prior outcome classification:/);
  assert.doesNotMatch(prompt, /- Prior summary:/);
});
