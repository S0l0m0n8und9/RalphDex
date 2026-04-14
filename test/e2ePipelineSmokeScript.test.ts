import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import * as path from 'node:path';
import test from 'node:test';
import { PIPELINE_SMOKE_PR_URL } from './support/fakeCodexExecFixture';

const projectRoot = path.join(__dirname, '..', '..');
const smokeScriptPath = path.join(projectRoot, 'scripts', 'run-e2e-pipeline-smoke.js');

function runSmokeScript(env: NodeJS.ProcessEnv): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [smokeScriptPath], {
      cwd: projectRoot,
      env: {
        ...process.env,
        ...env
      }
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

function parseTrailingJson(stdout: string): Record<string, unknown> {
  const start = stdout.lastIndexOf('{');
  assert.notEqual(start, -1, 'Expected the smoke script to emit a trailing JSON summary.');
  return JSON.parse(stdout.slice(start));
}

test('run-e2e-pipeline-smoke reports review and SCM command execution in the success summary', async () => {
  const result = await runSmokeScript({
    RALPH_E2E: '1'
  });

  assert.equal(result.code, 0, `Expected the smoke script to succeed. stderr:\n${result.stderr}`);

  const summary = parseTrailingJson(result.stdout);
  const executedCommands = summary.executedCommands;
  assert.ok(Array.isArray(executedCommands), 'Success summary must include executedCommands.');
  assert.ok(
    executedCommands.includes('ralphCodex.runPipeline'),
    'Success summary must record the top-level pipeline command.'
  );
  assert.ok(
    executedCommands.includes('ralphCodex.runReviewAgent'),
    'Success summary must record the review command execution.'
  );
  assert.ok(
    executedCommands.includes('ralphCodex.runScmAgent'),
    'Success summary must record the SCM command execution.'
  );
  assert.equal(
    summary.prUrl,
    PIPELINE_SMOKE_PR_URL,
    'Success summary must preserve the SCM PR URL extracted from the pipeline artifact.'
  );
});

test('run-e2e-pipeline-smoke preserves workspace and artifact details when the SCM assertion fails', async () => {
  const result = await runSmokeScript({
    RALPH_E2E: '1',
    RALPH_E2E_PIPELINE_FAKE_SCM_NO_PR: '1'
  });

  assert.equal(result.code, 1, 'Expected the smoke script to fail when the fake SCM run omits a PR URL.');
  assert.match(
    result.stderr,
    /Pipeline E2E smoke workspace preserved at .+/,
    'Failure output must preserve the temp workspace path for debugging.'
  );
  assert.match(
    result.stderr,
    /--- Pipeline artifact: .+ ---/,
    'Failure output must dump at least one pipeline artifact.'
  );
  assert.match(
    result.stderr,
    /"status": "complete"/,
    'Failure output must include serialized pipeline artifact contents.'
  );
  assert.match(
    result.stderr,
    /--- tasks\.json ---/,
    'Failure output must dump tasks.json for debugging.'
  );
});
