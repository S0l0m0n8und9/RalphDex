import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPrompt, type PromptGenerationInput } from '../src/prompt/promptBuilder';
import {
  CLAUDE_PROMPT_BUDGET_POLICIES,
  CODEX_PROMPT_BUDGET_POLICIES,
  REQUIRED_PROMPT_SECTIONS,
  type PromptSectionName
} from '../src/prompt/promptBudget';
import { RalphPaths } from '../src/ralph/pathResolver';
import { RalphAgentRole, RalphPromptKind, RalphTask } from '../src/ralph/types';
import {
  type PromptScenarioFixture,
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
    memorySummaryPath: `${rootPath}/.ralph/memory-summary.md`,
    deadLetterPath: `${rootPath}/.ralph/dead-letter.json`
  };
}

function selectedValidation(task: RalphTask | null): string | null {
  return task?.validation ?? null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildScenarioPromptInput(options: {
  scenario: PromptScenarioFixture;
  kind: RalphPromptKind;
  agentRole?: RalphAgentRole;
  target?: 'cliExec' | 'ideHandoff';
  objectiveText?: string;
  progressText?: string;
  selectedTask?: RalphTask | null;
  selectedTaskClaim?: PromptGenerationInput['selectedTaskClaim'];
}): PromptGenerationInput {
  const state = buildWorkspaceStateForScenario(options.scenario);
  const selectedTask = options.selectedTask === undefined
    ? findSelectedTaskForScenario(options.scenario)
    : options.selectedTask;
  const validation = selectedValidation(selectedTask);

  return {
    kind: options.kind,
    target: options.target ?? 'cliExec',
    iteration: state.nextIteration,
    selectionReason: `Golden prompt fixture for ${options.scenario.name}/${options.kind}.`,
    objectiveText: options.objectiveText ?? options.scenario.prd,
    progressText: options.progressText ?? options.scenario.progress,
    taskCounts: taskCountsForScenario(options.scenario),
    summary: options.scenario.workspaceScan,
    state,
    paths: createPaths(options.scenario.workspaceScan.rootPath),
    taskFile: options.scenario.taskFile,
    selectedTask,
    selectedTaskClaim: options.selectedTaskClaim ?? null,
    taskValidationHint: validation,
    effectiveValidationCommand: validation,
    normalizedValidationCommandFrom: validation,
    validationCommand: validation,
    preflightReport: {
      ready: true,
      summary: `Fixture scenario ${options.scenario.name} is ready for golden prompt rendering.`,
      diagnostics: []
    },
    config: {
      promptTemplateDirectory: '',
      promptIncludeVerifierFeedback: true,
      promptPriorContextBudget: 8,
      agentRole: options.agentRole ?? 'build'
    }
  };
}

async function renderTwice(input: PromptGenerationInput) {
  const first = await buildPrompt(input);
  const second = await buildPrompt(JSON.parse(JSON.stringify(input)) as PromptGenerationInput);
  return { first, second };
}

function assertBudgetIsDeterministic(input: {
  expectedPolicyName: string;
  first: Awaited<ReturnType<typeof buildPrompt>>;
  second: Awaited<ReturnType<typeof buildPrompt>>;
}): void {
  assert.ok(input.first.evidence.promptBudget, 'promptBudget evidence must be present');
  assert.ok(input.second.evidence.promptBudget, 'promptBudget evidence must be present on re-render');
  const firstBudget = input.first.evidence.promptBudget!;
  const secondBudget = input.second.evidence.promptBudget!;

  assert.equal(firstBudget.policyName, input.expectedPolicyName);
  assert.equal(secondBudget.policyName, input.expectedPolicyName);
  assert.equal(input.first.prompt, input.second.prompt);
  assert.equal(input.first.evidence.promptByteLength, input.second.evidence.promptByteLength);
  assert.equal(input.first.evidence.promptByteLength, Buffer.byteLength(input.first.prompt, 'utf8'));
  assert.ok(input.first.evidence.promptByteLength > 0);
  assert.ok(input.first.evidence.promptByteLength < 25000);
  assert.equal(firstBudget.estimatedTokens, secondBudget.estimatedTokens);
  assert.deepEqual(firstBudget.estimatedTokenRange, secondBudget.estimatedTokenRange);
  assert.ok(firstBudget.estimatedTokenRange.min <= firstBudget.estimatedTokens);
  assert.ok(firstBudget.estimatedTokens <= firstBudget.estimatedTokenRange.max);
  assert.deepEqual(firstBudget.selectedSections, secondBudget.selectedSections);
  assert.deepEqual(firstBudget.omittedSections, secondBudget.omittedSections);
}

test('prompt-budget policy wording does not contain placeholder text', () => {
  for (const policy of [
    ...Object.values(CODEX_PROMPT_BUDGET_POLICIES),
    ...Object.values(CLAUDE_PROMPT_BUDGET_POLICIES)
  ]) {
    assert.ok(!/placeholder/i.test(policy.name), `Policy name must not include placeholder wording: ${policy.name}`);
    assert.ok(
      !/placeholder/i.test(policy.minimumContextBias),
      `Policy minimumContextBias must not include placeholder wording: ${policy.name}`
    );
    assert.ok(policy.minimumContextBias.trim().length > 0, `Policy minimumContextBias must not be empty: ${policy.name}`);
  }
});

test('golden fixtures cover key prompt kinds with deterministic prompt-budget evidence', async () => {
  const fixtures: Array<{
    kind: RalphPromptKind;
    scenario: PromptScenarioFixture;
    expectedFocusHeading: string;
  }> = [
    { kind: 'bootstrap', scenario: promptScenarios.freshWorkspace, expectedFocusHeading: '## Task Focus' },
    { kind: 'iteration', scenario: promptScenarios.blockedTask, expectedFocusHeading: '## Task Focus' },
    { kind: 'continue-progress', scenario: promptScenarios.partialProgress, expectedFocusHeading: '## Task Focus' },
    { kind: 'fix-failure', scenario: promptScenarios.fixFailure, expectedFocusHeading: '## Task Focus' },
    { kind: 'replenish-backlog', scenario: promptScenarios.replenishBacklog, expectedFocusHeading: '## Backlog Replenishment Focus' },
    { kind: 'human-review-handoff', scenario: promptScenarios.humanReview, expectedFocusHeading: '## Task Focus' }
  ];

  for (const fixture of fixtures) {
    const input = buildScenarioPromptInput({
      scenario: fixture.scenario,
      kind: fixture.kind
    });
    const selectedTask = input.selectedTask;
    const validation = selectedValidation(selectedTask);
    const { first, second } = await renderTwice(input);

    assertBudgetIsDeterministic({
      expectedPolicyName: `${fixture.kind}:cliExec`,
      first,
      second
    });

    assert.ok(first.prompt.includes('## Prompt Strategy'));
    assert.ok(first.prompt.includes('## Preflight Snapshot'));
    assert.ok(first.prompt.includes('## Operating Rules'));
    assert.ok(first.prompt.includes('## Execution Contract'));
    assert.ok(first.prompt.includes('## Final Response Contract'));
    assert.ok(first.prompt.includes(fixture.expectedFocusHeading));

    const budget = first.evidence.promptBudget!;
    for (const requiredSection of REQUIRED_PROMPT_SECTIONS) {
      assert.ok(budget.requiredSections.includes(requiredSection));
      assert.ok(
        budget.selectedSections.includes(requiredSection),
        `${fixture.kind} should retain required section ${requiredSection}`
      );
    }

    if (fixture.scenario.selectedTaskId) {
      assert.match(first.prompt, new RegExp(`Selected task id: ${escapeRegExp(fixture.scenario.selectedTaskId)}`));
      if (validation) {
        assert.match(first.prompt, new RegExp(`Task validation hint: ${escapeRegExp(validation)}`));
        assert.match(first.prompt, new RegExp(`Effective validation command: ${escapeRegExp(validation)}`));
      }
    } else {
      assert.doesNotMatch(first.prompt, /Selected task id:/);
      assert.match(first.prompt, /The actionable backlog is exhausted\./);
      assert.match(first.prompt, /Validation command: none selected for backlog replenishment/);
    }
  }
});

test('golden fixtures cover planner, review, reviewer, and scm role section exclusions deterministically', async () => {
  const roleExcludedSections: PromptSectionName[] = [
    'objectiveContext',
    'repoContext',
    'runtimeContext',
    'taskPlanContext',
    'progressContext',
    'priorIterationContext'
  ];

  const reviewerSelectedTask = findSelectedTaskForScenario(promptScenarios.fixFailure);
  assert.ok(reviewerSelectedTask, 'reviewer fixture must include a selected task');

  const roleFixtures: Array<{
    role: RalphAgentRole;
    kind: RalphPromptKind;
    scenario: PromptScenarioFixture;
    expectedTemplateSuffix: string;
    objectiveNeedle: string;
    selectedTask?: RalphTask | null;
    selectedTaskClaim?: PromptGenerationInput['selectedTaskClaim'];
    expectedPromptSnippet?: RegExp;
  }> = [
    {
      role: 'planner',
      kind: 'iteration',
      scenario: promptScenarios.partialProgress,
      expectedTemplateSuffix: 'planning.md',
      objectiveNeedle: 'Keep prompt rendering deterministic across fresh sessions.'
    },
    {
      role: 'review',
      kind: 'iteration',
      scenario: promptScenarios.fixFailure,
      expectedTemplateSuffix: 'review-agent.md',
      objectiveNeedle: 'Repair fixture regressions without losing deterministic failure evidence.',
      expectedPromptSnippet: /Run the selected validation command when available/
    },
    {
      role: 'reviewer',
      kind: 'iteration',
      scenario: promptScenarios.fixFailure,
      expectedTemplateSuffix: 'review.md',
      objectiveNeedle: 'Repair fixture regressions without losing deterministic failure evidence.',
      selectedTask: { ...reviewerSelectedTask!, status: 'done' }
    },
    {
      role: 'scm',
      kind: 'iteration',
      scenario: promptScenarios.blockedTask,
      expectedTemplateSuffix: 'scm-agent.md',
      objectiveNeedle: 'Surface blocked tasks without mutating the durable backlog unexpectedly.',
      selectedTaskClaim: {
        stale: false,
        claim: {
          taskId: 'T4',
          agentId: 'agent-scm',
          claimedAt: '2026-04-15T21:00:00.000Z',
          provenanceId: 'prov-scm',
          status: 'active',
          featureBranch: 'feature/t4',
          integrationBranch: 'integration/t4',
          baseBranch: 'main'
        }
      },
      expectedPromptSnippet: /Base branch: main/
    }
  ];

  for (const fixture of roleFixtures) {
    const input = buildScenarioPromptInput({
      scenario: fixture.scenario,
      kind: fixture.kind,
      agentRole: fixture.role,
      selectedTask: fixture.selectedTask,
      selectedTaskClaim: fixture.selectedTaskClaim
    });
    const { first, second } = await renderTwice(input);
    assertBudgetIsDeterministic({
      expectedPolicyName: `${fixture.kind}:cliExec`,
      first,
      second
    });

    assert.match(first.templatePath, new RegExp(`${escapeRegExp(fixture.expectedTemplateSuffix)}$`));
    assert.match(first.prompt, /Selected task id: /);
    assert.match(first.prompt, /Omitted by active role policy\./);
    assert.doesNotMatch(first.prompt, new RegExp(escapeRegExp(fixture.objectiveNeedle)));

    if (fixture.expectedPromptSnippet) {
      assert.match(first.prompt, fixture.expectedPromptSnippet);
    }

    const budget = first.evidence.promptBudget!;
    for (const section of roleExcludedSections) {
      assert.ok(
        budget.omittedSections.includes(section),
        `${fixture.role} should omit section ${section}`
      );
      assert.ok(
        !budget.selectedSections.includes(section),
        `${fixture.role} should not select section ${section}`
      );
    }
  }
});

test('golden trim fixture keeps omitted-section metadata stable when trimming occurs', async () => {
  const largeObjective = 'Objective budget pressure evidence. '.repeat(180);
  const largeProgress = 'Progress budget pressure evidence. '.repeat(240);
  const input = buildScenarioPromptInput({
    scenario: promptScenarios.partialProgress,
    kind: 'continue-progress',
    target: 'ideHandoff',
    objectiveText: `# Product / project brief\n\n${largeObjective}\n${largeObjective}`,
    progressText: `# Progress\n\n- ${largeProgress}\n- ${largeProgress}\n- ${largeProgress}`
  });

  const { first, second } = await renderTwice(input);
  assertBudgetIsDeterministic({
    expectedPolicyName: 'continue-progress:ideHandoff',
    first,
    second
  });

  const firstBudget = first.evidence.promptBudget!;
  assert.equal(firstBudget.budgetMode, 'trimmed');
  assert.ok(firstBudget.omittedSections.length > 0);
  assert.match(first.prompt, /Omitted by prompt budget policy/);
  assert.deepEqual(firstBudget.omittedSections, second.evidence.promptBudget!.omittedSections);
  assert.deepEqual(firstBudget.selectedSections, second.evidence.promptBudget!.selectedSections);

  const omittedByPolicyOrder = firstBudget.omissionOrder.filter((section) => firstBudget.omittedSections.includes(section));
  assert.deepEqual(omittedByPolicyOrder, firstBudget.omittedSections);
});
