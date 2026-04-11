import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPrompt, PromptRenderResult } from '../src/prompt/promptBuilder';
import { RalphPaths } from '../src/ralph/pathResolver';
import { TaskPlanArtifact } from '../src/ralph/planningPass';
import { RalphAgentRole, RalphTaskMode } from '../src/ralph/types';
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
    handoffDir: `${rootPath}/.ralph/handoff`,
    promptDir: `${rootPath}/.ralph/prompts`,
    runDir: `${rootPath}/.ralph/runs`,
    logDir: `${rootPath}/.ralph/logs`,
    logFilePath: `${rootPath}/.ralph/logs/extension.log`,
    artifactDir: `${rootPath}/.ralph/artifacts`,
    memorySummaryPath: `${rootPath}/.ralph/memory-summary.md`
  };
}

function selectedValidation(task: RalphTask | null): string | null {
  return task?.validation ?? null;
}

async function renderScenario(
  scenario: PromptScenarioFixture,
  kind: RalphPromptKind,
  agentRole: RalphAgentRole = 'build',
  taskModeOverride?: RalphTaskMode
): Promise<PromptRenderResult> {
  const state = buildWorkspaceStateForScenario(scenario);
  let selectedTask = findSelectedTaskForScenario(scenario);
  if (selectedTask && taskModeOverride) {
    selectedTask = { ...selectedTask, mode: taskModeOverride };
  }
  const validationCommand = selectedValidation(selectedTask);
  return buildPrompt({
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
      promptPriorContextBudget: 8,
      agentRole
    }
  });
}

test('fix-failure prompt keeps the selected task validation command in rendered text for repeated-failure fixtures', async () => {
  const { prompt } = await renderScenario(promptScenarios.repeatedNoProgress, 'fix-failure');

  assert.match(prompt, /Task validation hint: npm run compile/);
  assert.match(prompt, /Effective validation command: npm run compile/);
  assert.match(prompt, /Validation command normalized from: npm run compile/);
});

test('human-review handoff prompt keeps the blocked-task blocker text in rendered text', async () => {
  const { prompt } = await renderScenario(promptScenarios.blockedTask, 'human-review-handoff');

  assert.match(prompt, /Waiting on a reproducible fixture input from an external dependency\./);
});

test('replenish-backlog prompt keeps the PRD objective text in rendered text', async () => {
  const { prompt } = await renderScenario(promptScenarios.replenishBacklog, 'replenish-backlog');

  assert.match(prompt, /Keep Ralph moving when the current durable backlog is fully consumed\./);
});

test('iteration prompt keeps remediation-fixture summary text when prior remediation exists', async () => {
  const { prompt } = await renderScenario(promptScenarios.repeatedNoProgress, 'iteration');

  assert.match(prompt, /Decompose T3 into smaller bounded child tasks before retrying\./);
});

test('bootstrap prompt does not leak prior-iteration details', async () => {
  const { prompt } = await renderScenario(promptScenarios.freshWorkspace, 'bootstrap');

  assert.doesNotMatch(prompt, /- Prior iteration: \d+/);
  assert.doesNotMatch(prompt, /- Prior outcome classification:/);
  assert.doesNotMatch(prompt, /- Prior summary:/);
});

test('review agent iteration prompt uses the review template and review-only instructions', async () => {
  const render = await renderScenario(promptScenarios.repeatedNoProgress, 'iteration', 'review');

  assert.match(render.templatePath, /review-agent\.md$/);
  assert.match(render.prompt, /You are Ralph's review agent\./);
  assert.match(render.prompt, /Do not make code changes\./);
  assert.match(render.prompt, /suggestedChildTasks/);
  assert.doesNotMatch(render.prompt, /Implement the smallest coherent improvement that advances the task\./);
});

// -- Documentation mode tests --

test('documentation-mode iteration prompt uses doc-specific execution contract and operating rules', async () => {
  const render = await renderScenario(promptScenarios.partialProgress, 'iteration', 'build', 'documentation');

  assert.match(render.prompt, /Read and understand the code, modules, or features that the task asks you to document\./);
  assert.match(render.prompt, /Write or update documentation files as specified by the task\./);
  assert.match(render.prompt, /Documentation files \(\.md, \.txt, etc\.\) are the primary deliverable\./);
  assert.doesNotMatch(render.prompt, /Implement the smallest coherent improvement that advances the task\./);
});

test('documentation-mode prompt includes doc-specific final response contract', async () => {
  const render = await renderScenario(promptScenarios.partialProgress, 'iteration', 'build', 'documentation');

  assert.match(render.prompt, /Created or updated documentation files\./);
  assert.match(render.prompt, /Key code areas documented and their accuracy\./);
});

test('default-mode iteration prompt does not include documentation-specific instructions', async () => {
  const render = await renderScenario(promptScenarios.partialProgress, 'iteration', 'build', 'default');

  assert.doesNotMatch(render.prompt, /Documentation files \(\.md, \.txt, etc\.\) are the primary deliverable\./);
  assert.match(render.prompt, /Implement the smallest coherent improvement that advances the task\./);
});

// -- Task Plan context section (planning pass) --

test('iteration prompt includes Task Plan section when taskPlanArtifact is provided', async () => {
  const scenario = promptScenarios.partialProgress;
  const state = buildWorkspaceStateForScenario(scenario);
  const selectedTask = findSelectedTaskForScenario(scenario);
  const validationCommand = selectedTask?.validation ?? null;

  const taskPlanArtifact: TaskPlanArtifact = {
    reasoning: 'Splitting the module reduces coupling',
    approach: 'Extract helper then update callers',
    steps: ['Read module', 'Write helper', 'Update imports'],
    risks: ['Merge conflict risk'],
    suggestedValidationCommand: 'npm run validate'
  };

  const render = await buildPrompt({
    kind: 'iteration',
    target: 'cliExec',
    iteration: state.nextIteration,
    selectionReason: 'task-plan context test',
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
    preflightReport: { ready: true, summary: 'Ready.', diagnostics: [] },
    taskPlanArtifact,
    config: {
      promptTemplateDirectory: '',
      promptIncludeVerifierFeedback: true,
      promptPriorContextBudget: 8,
      agentRole: 'implementer'
    }
  });

  assert.match(render.prompt, /## Task Plan/);
  assert.match(render.prompt, /Reasoning: Splitting the module reduces coupling/);
  assert.match(render.prompt, /Approach: Extract helper then update callers/);
});

test('iteration prompt does not include Task Plan section when taskPlanArtifact is null (planningPass disabled)', async () => {
  const render = await renderScenario(promptScenarios.partialProgress, 'iteration');

  assert.doesNotMatch(render.prompt, /## Task Plan/);
});
