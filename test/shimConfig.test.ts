import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DEFAULT_CONFIG } from '../src/config/defaults';
import { createShimWorkspaceConfiguration, readShimConfig, SHIM_CONFIG_FILENAME } from '../src/shim/shimConfig';

async function createWorkspaceRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ralph-shim-config-'));
}

test('readShimConfig prefers .ralph-config.json values over env fallbacks', async (t) => {
  const workspaceRoot = await createWorkspaceRoot();
  t.after(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  await fs.writeFile(
    path.join(workspaceRoot, SHIM_CONFIG_FILENAME),
    JSON.stringify(
      {
        model: 'file-model',
        ralphIterationCap: 7,
        ralphCodex: {
          approvalMode: 'on-request'
        }
      },
      null,
      2
    )
  );

  const config = readShimConfig(workspaceRoot, {
    RALPH_CODEX_MODEL: 'env-model',
    RALPH_CODEX_RALPH_ITERATION_CAP: '12',
    RALPH_CODEX_APPROVAL_MODE: 'untrusted'
  });

  assert.equal(config.model, 'file-model');
  assert.equal(config.ralphIterationCap, 7);
  assert.equal(config.approvalMode, 'on-request');
});

test('readShimConfig falls back to environment variables when the file is absent', async (t) => {
  const workspaceRoot = await createWorkspaceRoot();
  t.after(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  const config = readShimConfig(workspaceRoot, {
    RALPH_CODEX_MODEL: 'env-model',
    RALPH_CODEX_STOP_ON_HUMAN_REVIEW_NEEDED: 'false',
    RALPH_CODEX_VERIFIER_MODES: '["gitDiff","taskState"]'
  });
  const workspaceConfiguration = createShimWorkspaceConfiguration(workspaceRoot, {
    RALPH_CODEX_MODEL: 'env-model'
  });

  assert.equal(config.model, 'env-model');
  assert.equal(config.stopOnHumanReviewNeeded, false);
  assert.deepEqual(config.verifierModes, ['gitDiff', 'taskState']);
  assert.equal(workspaceConfiguration.get('model'), 'env-model');
});

test('readShimConfig falls back to defaults for missing values', async (t) => {
  const workspaceRoot = await createWorkspaceRoot();
  t.after(async () => {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  });

  const config = readShimConfig(workspaceRoot, {});
  const workspaceConfiguration = createShimWorkspaceConfiguration(workspaceRoot, {});

  assert.equal(config.model, DEFAULT_CONFIG.model);
  assert.equal(config.approvalMode, DEFAULT_CONFIG.approvalMode);
  assert.deepEqual(config.verifierModes, DEFAULT_CONFIG.verifierModes);
  assert.equal(workspaceConfiguration.get('ralphCodex.model'), DEFAULT_CONFIG.model);
  assert.equal(workspaceConfiguration.get('missingKey', 'fallback-value'), 'fallback-value');
});
