#!/usr/bin/env node

const fsp = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.join(__dirname, '..');
const nodeCommand = process.execPath;

function runRealSmoke() {
  const scriptPath = path.join(projectRoot, 'scripts', 'run-real-cli-smoke.js');
  const env = {
    ...process.env,
    RALPH_REAL_CLI_SMOKE_KEEP_WORKSPACE: '1'
  };

  return spawnSync(nodeCommand, [scriptPath], {
    cwd: projectRoot,
    encoding: 'utf8',
    env,
    stdio: 'pipe'
  });
}

function parseSmokeJson(stdout) {
  const trimmed = stdout.trim();
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace <= firstBrace) {
    throw new Error('Dogfood smoke did not emit JSON output.');
  }
  return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
}

function toFailureCategory(result) {
  if (result.verificationStatus !== 'passed') {
    return 'verification_failure';
  }
  if (result.executionStatus !== 'succeeded') {
    return 'execution_failure';
  }
  if (result.completionClassification === 'needs_human_review') {
    return 'needs_human_review';
  }
  return null;
}

async function buildDogfoodReport(smokeOutput) {
  const latestResultPath = smokeOutput.latestResult?.summaryPath
    ? path.join(path.dirname(smokeOutput.latestResult.summaryPath), 'result.json')
    : path.join(smokeOutput.rootPath, '.ralph', 'artifacts', 'latest-result.json');

  let startedAt = null;
  let finishedAt = null;
  let durationMs = null;
  let taskCount = null;
  try {
    const latest = JSON.parse(await fsp.readFile(latestResultPath, 'utf8'));
    startedAt = latest.startedAt ?? null;
    finishedAt = latest.finishedAt ?? null;
    if (startedAt && finishedAt) {
      const start = Date.parse(startedAt);
      const end = Date.parse(finishedAt);
      if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
        durationMs = end - start;
      }
    }
  } catch {}

  try {
    const tasksFile = path.join(smokeOutput.rootPath, '.ralph', 'tasks.json');
    const tasksJson = JSON.parse(await fsp.readFile(tasksFile, 'utf8'));
    taskCount = Array.isArray(tasksJson.tasks) ? tasksJson.tasks.length : null;
  } catch {}

  return {
    kind: 'dogfoodReport',
    generatedAt: new Date().toISOString(),
    provider: 'codex',
    model: smokeOutput.model ?? null,
    taskCount,
    stopReason: smokeOutput.result?.stopReason ?? null,
    completionClassification: smokeOutput.result?.completionClassification ?? null,
    executionStatus: smokeOutput.result?.executionStatus ?? null,
    verificationStatus: smokeOutput.result?.verificationStatus ?? null,
    failureCategory: toFailureCategory(smokeOutput.result ?? {}),
    startedAt,
    finishedAt,
    durationMs,
    smokeWorkspacePath: smokeOutput.rootPath
  };
}

async function main() {
  const smoke = runRealSmoke();
  if (smoke.error) {
    throw smoke.error;
  }

  if (smoke.stdout) {
    process.stdout.write(smoke.stdout);
  }
  if (smoke.stderr) {
    process.stderr.write(smoke.stderr);
  }

  const parsed = parseSmokeJson(smoke.stdout ?? '');
  const report = await buildDogfoodReport(parsed);

  const reportDir = path.join(projectRoot, '.ralph', 'artifacts', 'dogfood');
  await fsp.mkdir(reportDir, { recursive: true });
  const timestamp = report.generatedAt.replace(/[:.]/g, '-');
  const reportPath = path.join(reportDir, `dogfood-${timestamp}.json`);
  await fsp.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify({
    dogfoodReportPath: reportPath,
    provider: report.provider,
    model: report.model,
    taskCount: report.taskCount,
    stopReason: report.stopReason,
    durationMs: report.durationMs,
    failureCategory: report.failureCategory
  }, null, 2));

  if (smoke.status !== 0) {
    process.exit(smoke.status);
  }
}

void main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exit(1);
});

