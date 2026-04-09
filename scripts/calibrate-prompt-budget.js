#!/usr/bin/env node

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.join(__dirname, '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const compiledPromptBuilder = path.join(projectRoot, 'out', 'prompt', 'promptBuilder.js');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function usage() {
  return [
    'Usage: node scripts/calibrate-prompt-budget.js <workspace-path>',
    '',
    'The workspace must contain .ralph/prd.md and .ralph/tasks.json.',
    'The task file should include at least one actionable task so task-focused prompts can render.'
  ].join('\n');
}

function runOrExit(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    ...options
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function ensureCompiledArtifacts() {
  if (!fs.existsSync(compiledPromptBuilder)) {
    runOrExit(npmCommand, ['run', 'compile']);
  }
}

async function readRequiredText(filePath, label) {
  try {
    return await fsp.readFile(filePath, 'utf8');
  } catch (error) {
    const suffix = error instanceof Error ? ` ${error.message}` : '';
    fail(`Missing or unreadable ${label}: ${filePath}.${suffix}`);
  }
}

async function readOptionalText(filePath) {
  try {
    return await fsp.readFile(filePath, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return '';
    }

    throw error;
  }
}

function objectivePreview(objectiveText) {
  const normalized = objectiveText
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return normalized ?? 'Prompt budget calibration';
}

function createPriorIteration(selectedTask, overrides = {}) {
  return {
    iteration: 1,
    selectedTaskId: selectedTask.id,
    selectedTaskTitle: selectedTask.title,
    promptKind: 'iteration',
    promptPath: '/workspace/.ralph/prompts/iteration-001.prompt.md',
    artifactDir: '/workspace/.ralph/artifacts/iteration-001',
    executionStatus: 'succeeded',
    verificationStatus: 'passed',
    completionClassification: 'complete',
    followUpAction: 'continue_next_task',
    summary: 'Completed the previous Ralph slice.',
    verification: {
      validationFailureSignature: null,
      verifiers: []
    },
    noProgressSignals: [],
    remediation: null,
    diffSummary: null,
    stopReason: 'task_marked_complete',
    ...overrides
  };
}

function createState(rootPath, objectiveText, priorIteration) {
  if (!priorIteration) {
    return {
      version: 2,
      objectivePreview: objectivePreview(objectiveText),
      nextIteration: 1,
      lastPromptKind: null,
      lastPromptPath: null,
      lastRun: null,
      runHistory: [],
      lastIteration: null,
      iterationHistory: [],
      updatedAt: '2026-03-19T00:00:00.000Z'
    };
  }

  return {
    version: 2,
    objectivePreview: objectivePreview(objectiveText),
    nextIteration: 2,
    lastPromptKind: priorIteration.promptKind,
    lastPromptPath: path.join(rootPath, '.ralph', 'prompts', 'iteration-001.prompt.md'),
    lastRun: {
      iteration: 1,
      mode: 'singleExec',
      promptKind: priorIteration.promptKind,
      startedAt: '2026-03-19T00:00:00.000Z',
      finishedAt: '2026-03-19T00:05:00.000Z',
      status: priorIteration.executionStatus === 'failed' ? 'failed' : 'succeeded',
      exitCode: priorIteration.executionStatus === 'failed' ? 1 : 0,
      promptPath: path.join(rootPath, '.ralph', 'prompts', 'iteration-001.prompt.md'),
      transcriptPath: path.join(rootPath, '.ralph', 'runs', 'iteration-001.transcript.md'),
      lastMessagePath: path.join(rootPath, '.ralph', 'runs', 'iteration-001.last-message.md'),
      summary: priorIteration.summary
    },
    runHistory: [],
    lastIteration: {
      ...priorIteration,
      promptPath: path.join(rootPath, '.ralph', 'prompts', 'iteration-001.prompt.md'),
      artifactDir: path.join(rootPath, '.ralph', 'artifacts', 'iteration-001')
    },
    iterationHistory: [
      {
        ...priorIteration,
        promptPath: path.join(rootPath, '.ralph', 'prompts', 'iteration-001.prompt.md'),
        artifactDir: path.join(rootPath, '.ralph', 'artifacts', 'iteration-001')
      }
    ],
    updatedAt: '2026-03-19T00:05:00.000Z'
  };
}

function createPreflightReport() {
  return {
    ready: true,
    summary: 'Manual prompt-budget calibration render using workspace PRD and task file.',
    diagnostics: []
  };
}

function buildRows(rows) {
  const headers = {
    kind: 'Prompt kind',
    target: 'Target',
    estimatedTokens: 'Estimated tokens',
    targetTokens: 'Budget target',
    delta: 'Delta'
  };

  const widths = {
    kind: headers.kind.length,
    target: headers.target.length,
    estimatedTokens: headers.estimatedTokens.length,
    targetTokens: headers.targetTokens.length,
    delta: headers.delta.length
  };

  for (const row of rows) {
    widths.kind = Math.max(widths.kind, row.kind.length);
    widths.target = Math.max(widths.target, row.target.length);
    widths.estimatedTokens = Math.max(widths.estimatedTokens, String(row.estimatedTokens).length);
    widths.targetTokens = Math.max(widths.targetTokens, String(row.targetTokens).length);
    widths.delta = Math.max(widths.delta, row.delta.length);
  }

  const renderRow = (row) => [
    String(row.kind).padEnd(widths.kind),
    String(row.target).padEnd(widths.target),
    String(row.estimatedTokens).padStart(widths.estimatedTokens),
    String(row.targetTokens).padStart(widths.targetTokens),
    String(row.delta).padStart(widths.delta)
  ].join('  ');

  const separator = [
    '-'.repeat(widths.kind),
    '-'.repeat(widths.target),
    '-'.repeat(widths.estimatedTokens),
    '-'.repeat(widths.targetTokens),
    '-'.repeat(widths.delta)
  ].join('  ');

  return [
    renderRow(headers),
    separator,
    ...rows.map(renderRow)
  ].join('\n');
}

async function main() {
  const workspaceArg = process.argv[2];
  if (!workspaceArg) {
    fail(usage());
  }

  const workspacePath = path.resolve(workspaceArg);
  await ensureCompiledArtifacts();

  const { DEFAULT_CONFIG } = require(path.join(projectRoot, 'out', 'config', 'defaults.js'));
  const { buildPrompt, decidePromptKind } = require(path.join(projectRoot, 'out', 'prompt', 'promptBuilder.js'));
  const { resolveRalphPaths } = require(path.join(projectRoot, 'out', 'ralph', 'pathResolver.js'));
  const { countTaskStatuses, parseTaskFile, selectNextTask } = require(path.join(projectRoot, 'out', 'ralph', 'taskFile.js'));
  const { scanWorkspace } = require(path.join(projectRoot, 'out', 'services', 'workspaceScanner.js'));

  const config = {
    ...DEFAULT_CONFIG,
    promptBudgetProfile: 'codex'
  };
  const paths = resolveRalphPaths(workspacePath, config);
  const [objectiveText, taskFileText, progressText, summary] = await Promise.all([
    readRequiredText(paths.prdPath, '.ralph/prd.md'),
    readRequiredText(paths.taskFilePath, '.ralph/tasks.json'),
    readOptionalText(paths.progressPath),
    scanWorkspace(workspacePath, path.basename(workspacePath), {
      inspectionRootOverride: config.inspectionRootOverride
    })
  ]);

  const taskFile = parseTaskFile(taskFileText);
  const selectedTask = selectNextTask(taskFile);
  if (!selectedTask) {
    fail('Prompt calibration requires at least one actionable task in .ralph/tasks.json.');
  }

  const taskCounts = countTaskStatuses(taskFile);
  const validationCommand = summary.validationCommands[0] ?? null;
  const scenarioTaskFile = { version: 2, tasks: [] };
  const exhaustedCounts = {
    todo: 0,
    in_progress: 0,
    blocked: 0,
    done: taskCounts.done
  };

  const scenarios = [
    {
      kind: 'bootstrap',
      taskFile,
      taskCounts,
      selectedTask,
      state: createState(workspacePath, objectiveText, null)
    },
    {
      kind: 'iteration',
      taskFile,
      taskCounts,
      selectedTask,
      state: createState(workspacePath, objectiveText, createPriorIteration(selectedTask))
    },
    {
      kind: 'fix-failure',
      taskFile,
      taskCounts,
      selectedTask,
      state: createState(workspacePath, objectiveText, createPriorIteration(selectedTask, {
        executionStatus: 'failed',
        verificationStatus: 'failed',
        completionClassification: 'failed',
        followUpAction: 'retry_same_task',
        summary: 'The previous iteration failed validation and needs repair.',
        verification: {
          validationFailureSignature: validationCommand ?? 'validation command failed',
          verifiers: [
            {
              verifier: 'validationCommand',
              status: 'failed'
            }
          ]
        },
        noProgressSignals: ['Validation failed before task completion.'],
        stopReason: 'execution_failed'
      }))
    },
    {
      kind: 'continue-progress',
      taskFile,
      taskCounts,
      selectedTask,
      state: createState(workspacePath, objectiveText, createPriorIteration(selectedTask, {
        completionClassification: 'partial_progress',
        followUpAction: 'continue_same_task',
        summary: 'The previous iteration moved the task forward but did not finish it.',
        stopReason: null
      }))
    },
    {
      kind: 'replenish-backlog',
      taskFile: scenarioTaskFile,
      taskCounts: exhaustedCounts,
      selectedTask: null,
      state: createState(workspacePath, objectiveText, createPriorIteration(selectedTask, {
        summary: 'The previous iteration completed and exhausted the actionable backlog.',
        stopReason: 'no_actionable_task'
      }))
    },
    {
      kind: 'human-review-handoff',
      taskFile,
      taskCounts,
      selectedTask,
      state: createState(workspacePath, objectiveText, createPriorIteration(selectedTask, {
        completionClassification: 'needs_human_review',
        followUpAction: 'request_human_review',
        summary: 'The previous iteration hit a blocker that needs human review.',
        remediation: {
          taskId: selectedTask.id,
          summary: 'Human review is required before continuing this task.'
        },
        stopReason: 'human_review_needed'
      }))
    }
  ];

  const rows = [];
  for (const scenario of scenarios) {
    for (const target of ['cliExec', 'ideHandoff']) {
      const decision = decidePromptKind(scenario.state, target, {
        selectedTask: scenario.selectedTask,
        taskCounts: scenario.taskCounts,
        taskInspectionDiagnostics: []
      });
      if (decision.kind !== scenario.kind) {
        fail(`Scenario drift: expected ${scenario.kind} for ${target}, got ${decision.kind}.`);
      }

      const render = await buildPrompt({
        kind: scenario.kind,
        target,
        iteration: scenario.kind === 'bootstrap' ? 1 : 2,
        selectionReason: decision.reason,
        objectiveText,
        progressText,
        taskCounts: scenario.taskCounts,
        summary,
        state: scenario.state,
        paths,
        taskFile: scenario.taskFile,
        selectedTask: scenario.selectedTask,
        taskValidationHint: scenario.selectedTask?.validation ?? null,
        effectiveValidationCommand: scenario.selectedTask?.validation ?? validationCommand,
        normalizedValidationCommandFrom: null,
        validationCommand,
        preflightReport: createPreflightReport(),
        config
      });

      const promptBudget = render.evidence.promptBudget;
      if (!promptBudget) {
        fail(`Prompt budget metadata was not produced for ${scenario.kind}:${target}.`);
      }

      rows.push({
        kind: scenario.kind,
        target,
        estimatedTokens: promptBudget.estimatedTokens,
        targetTokens: promptBudget.targetTokens,
        delta: `${promptBudget.budgetDeltaTokens >= 0 ? '+' : ''}${promptBudget.budgetDeltaTokens}`
      });
    }
  }

  console.log(`Workspace: ${workspacePath}`);
  console.log(`Prompt budget profile: ${config.promptBudgetProfile}`);
  console.log(buildRows(rows));
}

void main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  fail(message);
});
