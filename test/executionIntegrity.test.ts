import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import {
  RalphIntegrityFailureError,
  readVerifiedExecutionPlanArtifact,
  readVerifiedPromptArtifact,
  toIntegrityFailureError
} from '../src/ralph/executionIntegrity';
import { hashText } from '../src/ralph/integrity';
import type { PreparedIterationContext } from '../src/ralph/iterationPreparation';
import type { RalphExecutionPlan } from '../src/ralph/types';

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ralph-integrity-'));
}

function makeMinimalPlan(overrides: Partial<RalphExecutionPlan> = {}): RalphExecutionPlan {
  return {
    schemaVersion: 1,
    kind: 'executionPlan',
    provenanceId: 'run-i001-cli-20260101T000000Z',
    iteration: 1,
    selectedTaskId: 'T1',
    selectedTaskTitle: 'Test task',
    taskValidationHint: null,
    effectiveValidationCommand: null,
    normalizedValidationCommandFrom: null,
    promptKind: 'continue-progress',
    promptTarget: 'cliExec',
    selectionReason: 'test',
    rootPolicy: {
      workspaceRootPath: '/tmp',
      inspectionRootPath: '/tmp',
      executionRootPath: '/tmp',
      verificationRootPath: '/tmp',
      selectionStrategy: 'workspaceRoot',
      selectionSummary: 'test',
      policySummary: 'test'
    },
    templatePath: '/tmp/template.md',
    promptPath: '/tmp/prompt.md',
    promptArtifactPath: '/tmp/prompt-artifact.md',
    promptEvidencePath: '/tmp/prompt-evidence.json',
    promptHash: 'sha256:abc',
    promptByteLength: 0,
    artifactDir: '/tmp',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides
  };
}

function makeMinimalPreparedContext(
  plan: RalphExecutionPlan,
  executionPlanHash: string
): Pick<PreparedIterationContext, 'executionPlan' | 'executionPlanHash'> {
  return {
    executionPlan: plan,
    executionPlanHash
  } as unknown as PreparedIterationContext;
}

// ---------------------------------------------------------------------------
// readVerifiedExecutionPlanArtifact
// ---------------------------------------------------------------------------

test('readVerifiedExecutionPlanArtifact returns parsed plan when hash matches', async () => {
  const dir = await makeTempDir();
  const planPath = path.join(dir, 'plan.json');
  const plan = makeMinimalPlan();
  const planText = JSON.stringify(plan);
  await fs.writeFile(planPath, planText, 'utf8');
  const hash = hashText(planText);

  const result = await readVerifiedExecutionPlanArtifact(planPath, hash);

  assert.equal(result.provenanceId, plan.provenanceId);
  assert.equal(result.kind, 'executionPlan');
});

test('readVerifiedExecutionPlanArtifact throws RalphIntegrityFailureError on read error', async () => {
  const nonExistentPath = path.join(os.tmpdir(), 'ralph-does-not-exist-' + Date.now() + '.json');

  await assert.rejects(
    () => readVerifiedExecutionPlanArtifact(nonExistentPath, 'sha256:irrelevant'),
    (err: unknown) => {
      assert.ok(err instanceof RalphIntegrityFailureError);
      assert.equal(err.details.stage, 'executionPlanHash');
      assert.equal(err.details.actualExecutionPlanHash, null);
      return true;
    }
  );
});

test('readVerifiedExecutionPlanArtifact throws RalphIntegrityFailureError on hash mismatch', async () => {
  const dir = await makeTempDir();
  const planPath = path.join(dir, 'plan.json');
  const planText = JSON.stringify(makeMinimalPlan());
  await fs.writeFile(planPath, planText, 'utf8');
  const actualHash = hashText(planText);
  const wrongHash = 'sha256:0000000000000000000000000000000000000000000000000000000000000000';

  await assert.rejects(
    () => readVerifiedExecutionPlanArtifact(planPath, wrongHash),
    (err: unknown) => {
      assert.ok(err instanceof RalphIntegrityFailureError);
      assert.equal(err.details.stage, 'executionPlanHash');
      assert.equal(err.details.expectedExecutionPlanHash, wrongHash);
      assert.equal(err.details.actualExecutionPlanHash, actualHash);
      return true;
    }
  );
});

test('readVerifiedExecutionPlanArtifact throws RalphIntegrityFailureError on JSON parse failure', async () => {
  const dir = await makeTempDir();
  const planPath = path.join(dir, 'plan.json');
  const badJson = 'not valid json {{{';
  await fs.writeFile(planPath, badJson, 'utf8');
  const hash = hashText(badJson);

  await assert.rejects(
    () => readVerifiedExecutionPlanArtifact(planPath, hash),
    (err: unknown) => {
      assert.ok(err instanceof RalphIntegrityFailureError);
      assert.equal(err.details.stage, 'executionPlanHash');
      // Hash was correct so actual hash should equal expected hash
      assert.equal(err.details.expectedExecutionPlanHash, hash);
      assert.equal(err.details.actualExecutionPlanHash, hash);
      return true;
    }
  );
});

// ---------------------------------------------------------------------------
// readVerifiedPromptArtifact
// ---------------------------------------------------------------------------

test('readVerifiedPromptArtifact returns prompt text when hash matches', async () => {
  const dir = await makeTempDir();
  const promptPath = path.join(dir, 'prompt.md');
  const promptText = '# Hello world prompt';
  await fs.writeFile(promptPath, promptText, 'utf8');
  const hash = hashText(promptText);
  const plan = makeMinimalPlan({ promptArtifactPath: promptPath, promptHash: hash });

  const result = await readVerifiedPromptArtifact(plan);

  assert.equal(result, promptText);
});

test('readVerifiedPromptArtifact throws RalphIntegrityFailureError on read error', async () => {
  const nonExistentPath = path.join(os.tmpdir(), 'ralph-prompt-missing-' + Date.now() + '.md');
  const plan = makeMinimalPlan({ promptArtifactPath: nonExistentPath, promptHash: 'sha256:irrelevant' });

  await assert.rejects(
    () => readVerifiedPromptArtifact(plan),
    (err: unknown) => {
      assert.ok(err instanceof RalphIntegrityFailureError);
      assert.equal(err.details.stage, 'promptArtifactHash');
      assert.equal(err.details.actualPromptHash, null);
      assert.equal(err.details.expectedPromptHash, 'sha256:irrelevant');
      return true;
    }
  );
});

test('readVerifiedPromptArtifact throws RalphIntegrityFailureError on hash mismatch', async () => {
  const dir = await makeTempDir();
  const promptPath = path.join(dir, 'prompt.md');
  const promptText = '# Prompt content';
  await fs.writeFile(promptPath, promptText, 'utf8');
  const actualHash = hashText(promptText);
  const wrongHash = 'sha256:0000000000000000000000000000000000000000000000000000000000000000';
  const plan = makeMinimalPlan({ promptArtifactPath: promptPath, promptHash: wrongHash });

  await assert.rejects(
    () => readVerifiedPromptArtifact(plan),
    (err: unknown) => {
      assert.ok(err instanceof RalphIntegrityFailureError);
      assert.equal(err.details.stage, 'promptArtifactHash');
      assert.equal(err.details.expectedPromptHash, wrongHash);
      assert.equal(err.details.actualPromptHash, actualHash);
      return true;
    }
  );
});

// ---------------------------------------------------------------------------
// toIntegrityFailureError
// ---------------------------------------------------------------------------

test('toIntegrityFailureError passes through an existing RalphIntegrityFailureError unchanged', () => {
  const original = new RalphIntegrityFailureError({
    stage: 'executionPlanHash',
    message: 'original failure',
    expectedExecutionPlanHash: 'sha256:aaa',
    actualExecutionPlanHash: 'sha256:bbb',
    expectedPromptHash: null,
    actualPromptHash: null,
    expectedPayloadHash: null,
    actualPayloadHash: null
  });
  const plan = makeMinimalPlan({ promptHash: 'sha256:prompt' });
  const prepared = makeMinimalPreparedContext(plan, 'sha256:plan');

  const result = toIntegrityFailureError(original, prepared as PreparedIterationContext);

  assert.strictEqual(result, original);
});

test('toIntegrityFailureError extracts stdinPayloadHash failure from matching error message', () => {
  const actual = 'sha256:' + 'a'.repeat(64);
  const expected = 'sha256:' + 'b'.repeat(64);
  const message = `stdin payload hash ${actual} did not match planned prompt hash ${expected}.`;
  const error = new Error(message);
  const plan = makeMinimalPlan({ promptHash: 'sha256:planprompt' });
  const prepared = makeMinimalPreparedContext(plan, 'sha256:planexec');

  const result = toIntegrityFailureError(error, prepared as PreparedIterationContext);

  assert.ok(result instanceof RalphIntegrityFailureError);
  assert.equal(result.details.stage, 'stdinPayloadHash');
  assert.equal(result.details.actualPayloadHash, actual);
  assert.equal(result.details.expectedPayloadHash, expected);
  assert.equal(result.details.expectedExecutionPlanHash, 'sha256:planexec');
  assert.equal(result.details.expectedPromptHash, 'sha256:planprompt');
});

test('toIntegrityFailureError returns null for an unrecognized error', () => {
  const plan = makeMinimalPlan();
  const prepared = makeMinimalPreparedContext(plan, 'sha256:hash');

  const result = toIntegrityFailureError(new Error('some unrelated error'), prepared as PreparedIterationContext);

  assert.equal(result, null);
});

test('toIntegrityFailureError returns null for a non-Error value', () => {
  const plan = makeMinimalPlan();
  const prepared = makeMinimalPreparedContext(plan, 'sha256:hash');

  const result = toIntegrityFailureError('string error', prepared as PreparedIterationContext);

  assert.equal(result, null);
});
