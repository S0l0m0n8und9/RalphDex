import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import test from 'node:test';
import { buildPrompt, decidePromptKind } from '../src/prompt/promptBuilder';
import { RalphPaths } from '../src/ralph/pathResolver';
import { StructureDefinition } from '../src/ralph/structureDefinition';
import { RalphPromptKind, RalphTask } from '../src/ralph/types';
import {
  PromptScenarioFixture,
  buildWorkspaceStateForScenario,
  findSelectedTaskForScenario,
  promptScenarioList,
  taskCountsForScenario
} from './fixtures/promptScenarios';

const snapshotDirectory = path.resolve(__dirname, '../../test/fixtures/snapshots');
const updateSnapshots = process.argv.includes('--updateSnapshot')
  || process.env.npm_config_updatesnapshot !== undefined;

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
    memorySummaryPath: `${rootPath}/.ralph/memory-summary.md`,
    deadLetterPath: `${rootPath}/.ralph/dead-letter.json`
  };
}

function selectedValidation(task: RalphTask | null): string | null {
  return task?.validation ?? null;
}

function snapshotPath(kind: RalphPromptKind, scenario: PromptScenarioFixture): string {
  return path.join(snapshotDirectory, `${scenario.name}.${kind}.md`);
}

function assertPromptSemantics(scenario: PromptScenarioFixture, prompt: string): void {
  for (const snippet of scenario.requiredPromptSnippets) {
    assert.ok(
      prompt.includes(snippet),
      `Prompt for ${scenario.name}/${scenario.expectedPromptKind} should include: ${snippet}`
    );
  }

  for (const snippet of scenario.forbiddenPromptSnippets ?? []) {
    assert.ok(
      !prompt.includes(snippet),
      `Prompt for ${scenario.name}/${scenario.expectedPromptKind} should omit: ${snippet}`
    );
  }
}

async function assertMarkdownSnapshot(
  kind: RalphPromptKind,
  scenario: PromptScenarioFixture,
  prompt: string
): Promise<void> {
  const targetPath = snapshotPath(kind, scenario);
  const normalizedPrompt = prompt.replace(/\r\n/g, '\n');

  if (updateSnapshots) {
    await fs.mkdir(snapshotDirectory, { recursive: true });
    await fs.writeFile(targetPath, normalizedPrompt, 'utf8');
    return;
  }

  let existing: string;
  try {
    existing = await fs.readFile(targetPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      assert.fail(`Missing snapshot ${path.relative(process.cwd(), targetPath)}. Run npm test -- --updateSnapshot to create it.`);
    }
    throw error;
  }

  assert.equal(
    normalizedPrompt,
    existing.replace(/\r\n/g, '\n'),
    `Prompt snapshot mismatch for ${scenario.name}/${kind}. Inspect ${path.relative(process.cwd(), targetPath)} and update intentionally with npm test -- --updateSnapshot.`
  );
}

test('prompt builder matches readable golden snapshots for each valid fixture scenario', async () => {
  for (const scenario of promptScenarioList) {
    const state = buildWorkspaceStateForScenario(scenario);
    const selectedTask = findSelectedTaskForScenario(scenario);
    const taskCounts = taskCountsForScenario(scenario);
    const decision = decidePromptKind(state, 'cliExec', {
      selectedTask,
      taskCounts
    });

    const render = await buildPrompt({
      kind: decision.kind,
      target: 'cliExec',
      iteration: state.nextIteration,
      selectionReason: decision.reason,
      objectiveText: scenario.prd,
      progressText: scenario.progress,
      taskCounts,
      summary: scenario.workspaceScan,
      state,
      paths: createPaths(scenario.workspaceScan.rootPath),
      taskFile: scenario.taskFile,
      selectedTask,
      taskValidationHint: selectedValidation(selectedTask),
      effectiveValidationCommand: selectedValidation(selectedTask),
      normalizedValidationCommandFrom: selectedValidation(selectedTask),
      validationCommand: selectedValidation(selectedTask),
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

    assertPromptSemantics(scenario, render.prompt);
    await assertMarkdownSnapshot(decision.kind, scenario, render.prompt);
  }
});

test('prompt builder snapshot includes Repo Structure section when structureDefinition is present', async () => {
  const scenario = promptScenarioList.find((entry) => entry.name === 'partialProgress');
  assert.ok(scenario, 'partial-progress fixture must exist');

  const state = buildWorkspaceStateForScenario(scenario);
  const selectedTask = findSelectedTaskForScenario(scenario);
  const structureDefinition: StructureDefinition = {
    version: 1,
    directories: [
      { path: 'src', role: 'source', description: 'Production TypeScript source files.' },
      { path: 'test', role: 'test', description: 'Node test suites.' },
      { path: 'docs', role: 'docs', description: 'Durable product and architecture docs.' }
    ],
    placementRules: [
      { pattern: 'src/**/*.ts', directory: 'src', description: 'Implementation code stays under src/.' },
      { pattern: 'test/**/*.test.ts', directory: 'test', description: 'Regression coverage belongs in test/.' }
    ],
    forbiddenPaths: [
      { path: 'out/**', reason: 'Generated build output.' }
    ]
  };

  const render = await buildPrompt({
    kind: 'iteration',
    target: 'cliExec',
    iteration: state.nextIteration,
    selectionReason: 'Snapshot fixture for populated structure definition context.',
    objectiveText: scenario.prd,
    progressText: scenario.progress,
    taskCounts: taskCountsForScenario(scenario),
    summary: scenario.workspaceScan,
    state,
    paths: createPaths(scenario.workspaceScan.rootPath),
    taskFile: scenario.taskFile,
    selectedTask,
    taskValidationHint: selectedValidation(selectedTask),
    effectiveValidationCommand: selectedValidation(selectedTask),
    normalizedValidationCommandFrom: selectedValidation(selectedTask),
    validationCommand: selectedValidation(selectedTask),
    preflightReport: {
      ready: true,
      summary: 'Structure-definition snapshot fixture is ready for prompt rendering.',
      diagnostics: []
    },
    structureDefinition,
    config: {
      promptTemplateDirectory: '',
      promptIncludeVerifierFeedback: true,
      promptPriorContextBudget: 8
    }
  });

  await assertMarkdownSnapshot(
    'iteration',
    { ...scenario, name: 'partial-progress-with-structure' },
    render.prompt
  );
});
