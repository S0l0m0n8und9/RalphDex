import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import * as path from 'node:path';
import test from 'node:test';

const projectRoot = path.join(__dirname, '..', '..');
const smokeScriptPath = path.join(projectRoot, 'scripts', 'run-e2e-orchestration-smoke.js');

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
  // The smoke emits its JSON summary with JSON.stringify(..., null, 2) so the
  // opening `{` appears at column 0 on its own line and the matching `}` is
  // the final non-whitespace character of stdout. Scan the lines in reverse
  // for the last standalone `{` so we ignore the pretty-printed nested
  // objects that also start with `{\n` but are indented.
  const lines = stdout.split(/\r?\n/);
  let startLine = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i] === '{') {
      startLine = i;
      break;
    }
  }
  assert.notEqual(startLine, -1, 'Expected the smoke script to emit a trailing JSON summary.');
  return JSON.parse(lines.slice(startLine).join('\n'));
}

test('run-e2e-orchestration-smoke skips cleanly without RALPH_E2E_ORCHESTRATION', async () => {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.RALPH_E2E_ORCHESTRATION;
  delete env.RALPH_E2E_ORCHESTRATION_KEEP_WORKSPACE;

  const result = await runSmokeScript(env);

  assert.equal(result.code, 0, `Expected skip path to succeed. stderr:\n${result.stderr}`);
  assert.match(
    result.stdout,
    /Skipping orchestration E2E smoke\./,
    'Skip path must print the expected skip message.'
  );
});

test('run-e2e-orchestration-smoke exercises graph + fan-in + handoff + role policy when opted in', async () => {
  const result = await runSmokeScript({
    RALPH_E2E_ORCHESTRATION: '1'
  });

  assert.equal(
    result.code,
    0,
    `Expected the orchestration smoke to succeed. stderr:\n${result.stderr}`
  );

  const summary = parseTrailingJson(result.stdout);
  const graph = summary.graph as Record<string, unknown>;
  assert.equal(graph.runId, 'run-smoke-001', 'Graph scenario must run with the deterministic run id.');
  assert.equal(graph.spanCount, 5, 'A node span must exist for every orchestration node.');

  const planGraph = summary.planGraph as Record<string, unknown>;
  assert.equal(planGraph.finalResult, true, 'Fan-in must succeed after all children complete.');
  assert.ok(
    typeof planGraph.firstErrors === 'number' && (planGraph.firstErrors as number) > 0,
    'Fan-in must surface at least one blocking error when children are incomplete.'
  );

  const handoff = summary.handoff as Record<string, unknown>;
  assert.equal(handoff.acceptedId, 'h-smoke-001');
  assert.equal(handoff.rejectedId, 'h-smoke-002');

  const rolePolicy = summary.rolePolicy as Record<string, unknown>;
  assert.equal(
    rolePolicy.reviewerAllowsDone,
    false,
    'Reviewer role must not be allowed to emit in_progress→done (policy_violation trigger).'
  );
  assert.equal(rolePolicy.reviewerRequiresHumanGate, true);
});
