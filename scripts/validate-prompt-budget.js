#!/usr/bin/env node

/**
 * Deterministic prompt budget validation gate.
 *
 * Renders all fixture scenarios (from the test harness) across both prompt
 * targets (cliExec, ideHandoff) and compares estimated token counts against
 * a committed baseline JSON file.  Fails if any scenario deviates by more
 * than the configured threshold (default ±20 %).
 *
 * Usage:
 *   node scripts/validate-prompt-budget.js                  # validate
 *   node scripts/validate-prompt-budget.js --update          # regenerate baseline
 *   PROMPT_BUDGET_THRESHOLD=25 node scripts/validate-prompt-budget.js
 */

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.join(__dirname, '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const compiledFixtures = path.join(projectRoot, 'out-test', 'test', 'fixtures', 'promptScenarios.js');
const compiledPromptBuilder = path.join(projectRoot, 'out', 'prompt', 'promptBuilder.js');
const baselinePath = path.join(projectRoot, 'scripts', 'prompt-budget-baseline.json');

const DEFAULT_THRESHOLD_PERCENT = 20;

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function ensureCompiled() {
  if (!fs.existsSync(compiledPromptBuilder) || !fs.existsSync(compiledFixtures)) {
    console.log('Compiling project and tests...');
    const result = spawnSync(npmCommand, ['run', 'compile'], {
      cwd: projectRoot,
      stdio: 'inherit'
    });
    if (result.status !== 0) process.exit(result.status ?? 1);

    const testResult = spawnSync(npmCommand, ['run', 'compile:tests'], {
      cwd: projectRoot,
      stdio: 'inherit'
    });
    if (testResult.status !== 0) process.exit(testResult.status ?? 1);
  }
}

function createPaths(rootPath) {
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
    artifactDir: `${rootPath}/.ralph/artifacts`
  };
}

function taskCounts(taskFile) {
  return taskFile.tasks.reduce((counts, task) => {
    counts[task.status] = (counts[task.status] || 0) + 1;
    return counts;
  }, { todo: 0, in_progress: 0, blocked: 0, done: 0 });
}

async function renderAllScenarios() {
  ensureCompiled();

  const {
    promptScenarioList,
    buildWorkspaceStateForScenario,
    findSelectedTaskForScenario,
    taskCountsForScenario
  } = require(compiledFixtures);

  const { buildPrompt, decidePromptKind } = require(compiledPromptBuilder);

  const measurements = {};

  for (const scenario of promptScenarioList) {
    const state = buildWorkspaceStateForScenario(scenario);
    const selectedTask = findSelectedTaskForScenario(scenario);
    const counts = taskCountsForScenario(scenario);

    for (const target of ['cliExec', 'ideHandoff']) {
      const decision = decidePromptKind(state, target, {
        selectedTask,
        taskCounts: counts
      });

      const render = await buildPrompt({
        kind: decision.kind,
        target,
        iteration: state.nextIteration,
        selectionReason: decision.reason,
        objectiveText: scenario.prd,
        progressText: scenario.progress,
        taskCounts: counts,
        summary: scenario.workspaceScan,
        state,
        paths: createPaths(scenario.workspaceScan.rootPath),
        taskFile: scenario.taskFile,
        selectedTask,
        taskValidationHint: selectedTask?.validation ?? null,
        effectiveValidationCommand: selectedTask?.validation ?? null,
        normalizedValidationCommandFrom: null,
        validationCommand: scenario.workspaceScan.validationCommands[0] ?? null,
        preflightReport: {
          ready: true,
          summary: `Budget validation scenario ${scenario.name}.`,
          diagnostics: []
        },
        config: {
          promptTemplateDirectory: '',
          promptIncludeVerifierFeedback: true,
          promptPriorContextBudget: 8
        }
      });

      const budget = render.evidence.promptBudget;
      if (!budget) {
        fail(`No promptBudget evidence for ${scenario.name}:${target}`);
      }

      const key = `${scenario.name}:${decision.kind}:${target}`;
      measurements[key] = {
        scenario: scenario.name,
        kind: decision.kind,
        target,
        estimatedTokens: budget.estimatedTokens,
        targetTokens: budget.targetTokens,
        budgetDeltaTokens: budget.budgetDeltaTokens,
        budgetMode: budget.budgetMode
      };
    }
  }

  return measurements;
}

function readBaseline() {
  try {
    return JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function writeBaseline(measurements) {
  const baseline = {
    generatedAt: new Date().toISOString(),
    thresholdPercent: DEFAULT_THRESHOLD_PERCENT,
    measurements
  };

  fs.writeFileSync(baselinePath, JSON.stringify(baseline, null, 2) + '\n', 'utf8');
  return baseline;
}

function formatTable(rows) {
  const headers = { key: 'Scenario', estimated: 'Estimated', baseline: 'Baseline', delta: 'Delta %', status: 'Status' };
  const widths = {
    key: headers.key.length,
    estimated: headers.estimated.length,
    baseline: headers.baseline.length,
    delta: headers.delta.length,
    status: headers.status.length
  };

  for (const row of rows) {
    widths.key = Math.max(widths.key, row.key.length);
    widths.estimated = Math.max(widths.estimated, String(row.estimated).length);
    widths.baseline = Math.max(widths.baseline, String(row.baseline).length);
    widths.delta = Math.max(widths.delta, row.delta.length);
    widths.status = Math.max(widths.status, row.status.length);
  }

  const renderRow = (r) => [
    String(r.key).padEnd(widths.key),
    String(r.estimated).padStart(widths.estimated),
    String(r.baseline).padStart(widths.baseline),
    String(r.delta).padStart(widths.delta),
    String(r.status).padEnd(widths.status)
  ].join('  ');

  const separator = [
    '-'.repeat(widths.key),
    '-'.repeat(widths.estimated),
    '-'.repeat(widths.baseline),
    '-'.repeat(widths.delta),
    '-'.repeat(widths.status)
  ].join('  ');

  return [renderRow(headers), separator, ...rows.map(renderRow)].join('\n');
}

async function main() {
  const isUpdate = process.argv.includes('--update');
  const thresholdPercent = Number(process.env.PROMPT_BUDGET_THRESHOLD) || DEFAULT_THRESHOLD_PERCENT;

  const measurements = await renderAllScenarios();

  if (isUpdate) {
    writeBaseline(measurements);
    console.log(`Prompt budget baseline written to ${path.relative(projectRoot, baselinePath)}`);
    console.log(`${Object.keys(measurements).length} scenario measurements recorded.`);
    return;
  }

  const baseline = readBaseline();
  if (!baseline) {
    // No baseline exists yet — generate it and pass.
    writeBaseline(measurements);
    console.log(`No baseline found. Generated initial baseline at ${path.relative(projectRoot, baselinePath)}`);
    console.log(`${Object.keys(measurements).length} scenario measurements recorded.`);
    return;
  }

  const rows = [];
  let failures = 0;

  for (const [key, current] of Object.entries(measurements)) {
    const baselineEntry = baseline.measurements[key];
    if (!baselineEntry) {
      rows.push({
        key,
        estimated: current.estimatedTokens,
        baseline: 'NEW',
        delta: 'N/A',
        status: 'WARN'
      });
      continue;
    }

    const baselineTokens = baselineEntry.estimatedTokens;
    const currentTokens = current.estimatedTokens;
    const deltaPercent = baselineTokens === 0
      ? (currentTokens === 0 ? 0 : 100)
      : ((currentTokens - baselineTokens) / baselineTokens) * 100;

    const exceeded = Math.abs(deltaPercent) > thresholdPercent;
    if (exceeded) failures++;

    rows.push({
      key,
      estimated: currentTokens,
      baseline: baselineTokens,
      delta: `${deltaPercent >= 0 ? '+' : ''}${deltaPercent.toFixed(1)}%`,
      status: exceeded ? 'FAIL' : 'OK'
    });
  }

  // Check for removed scenarios
  for (const key of Object.keys(baseline.measurements)) {
    if (!(key in measurements)) {
      rows.push({
        key,
        estimated: 'REMOVED',
        baseline: baseline.measurements[key].estimatedTokens,
        delta: 'N/A',
        status: 'WARN'
      });
    }
  }

  console.log(`Prompt budget validation (threshold: +/-${thresholdPercent}%)\n`);
  console.log(formatTable(rows));
  console.log();

  if (failures > 0) {
    console.error(
      `${failures} scenario(s) exceeded the +/-${thresholdPercent}% threshold.\n` +
      `Run "node scripts/validate-prompt-budget.js --update" to accept the new baseline.`
    );
    process.exit(1);
  }

  console.log('All scenarios within budget threshold.');
}

void main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  fail(message);
});
