import assert from 'node:assert/strict';
import test from 'node:test';
import * as vscode from 'vscode';
import { DEFAULT_CONFIG } from '../src/config/defaults';
import { detectModelTieringEnableConflict, readConfig } from '../src/config/readConfig';
import { RalphCodexConfig } from '../src/config/types';
import { buildPreflightReport } from '../src/ralph/preflight';
import { inspectTaskFileText } from '../src/ralph/taskFile';
import { vscodeTestHarness } from './support/vscodeTestHarness';

const CONFLICT_CODE = 'model_tiering_enable_conflict';

function workspaceFolder(rootPath: string): vscode.WorkspaceFolder {
  return {
    uri: vscode.Uri.file(rootPath),
    name: 'workspace',
    index: 0
  };
}

const fileStatus = {
  prdPath: true,
  progressPath: true,
  taskFilePath: true,
  stateFilePath: true,
  promptDir: true,
  runDir: true,
  logDir: true,
  artifactDir: true
};

function preflightReportFor(config: RalphCodexConfig) {
  const taskInspection = inspectTaskFileText(JSON.stringify({
    version: 2,
    tasks: [{ id: 'T1', title: 'Task', status: 'todo', dependencies: [] }]
  }, null, 2));

  return buildPreflightReport({
    rootPath: '/workspace',
    workspaceTrusted: true,
    config,
    taskInspection,
    taskCounts: null,
    selectedTask: null,
    taskValidationHint: null,
    validationCommand: null,
    normalizedValidationCommandFrom: null,
    validationCommandReadiness: { command: null, status: 'missing', executable: null },
    fileStatus
  });
}

test.beforeEach(() => {
  vscodeTestHarness().reset();
});

// --- Pure detector ---------------------------------------------------------

test('detectModelTieringEnableConflict reports a conflict only when both values are explicit and disagree', () => {
  const flatWins = detectModelTieringEnableConflict(true, false);
  assert.deepEqual(flatWins, {
    flatKey: 'ralphCodex.enableModelTiering',
    nestedKey: 'ralphCodex.modelTiering.enabled',
    flatValue: true,
    nestedValue: false,
    effectiveValue: true
  });

  const flatWinsFalse = detectModelTieringEnableConflict(false, true);
  assert.equal(flatWinsFalse?.effectiveValue, false);
  assert.equal(flatWinsFalse?.flatValue, false);
  assert.equal(flatWinsFalse?.nestedValue, true);
});

test('detectModelTieringEnableConflict is silent when the values agree', () => {
  assert.equal(detectModelTieringEnableConflict(true, true), null);
  assert.equal(detectModelTieringEnableConflict(false, false), null);
});

test('detectModelTieringEnableConflict is silent when either value is implicit', () => {
  assert.equal(detectModelTieringEnableConflict(true, undefined), null);
  assert.equal(detectModelTieringEnableConflict(undefined, false), null);
  assert.equal(detectModelTieringEnableConflict(undefined, undefined), null);
});

// --- readConfig wiring ------------------------------------------------------

test('readConfig records the conflict and applies the flat alias as the effective value', () => {
  vscodeTestHarness().setConfiguration({
    enableModelTiering: true,
    modelTiering: { enabled: false }
  });

  const config = readConfig(workspaceFolder('/repo'));

  assert.deepEqual(config.modelTieringEnableConflict, {
    flatKey: 'ralphCodex.enableModelTiering',
    nestedKey: 'ralphCodex.modelTiering.enabled',
    flatValue: true,
    nestedValue: false,
    effectiveValue: true
  });
  // The flat alias wins: model tiering is effectively enabled.
  assert.equal(config.modelTiering.enabled, true);
});

test('readConfig omits the conflict when the two enable flags agree', () => {
  vscodeTestHarness().setConfiguration({
    enableModelTiering: true,
    modelTiering: { enabled: true }
  });

  const config = readConfig(workspaceFolder('/repo'));

  assert.equal(config.modelTieringEnableConflict, undefined);
  assert.equal(config.modelTiering.enabled, true);
});

test('readConfig omits the conflict when only one enable flag is explicit', () => {
  vscodeTestHarness().setConfiguration({ enableModelTiering: false });
  assert.equal(readConfig(workspaceFolder('/repo')).modelTieringEnableConflict, undefined);

  vscodeTestHarness().reset();
  vscodeTestHarness().setConfiguration({ modelTiering: { enabled: true } });
  assert.equal(readConfig(workspaceFolder('/repo')).modelTieringEnableConflict, undefined);

  vscodeTestHarness().reset();
  // A nested object without an explicit `enabled` key is not an explicit signal.
  vscodeTestHarness().setConfiguration({
    enableModelTiering: true,
    modelTiering: { simpleThreshold: 4 }
  });
  assert.equal(readConfig(workspaceFolder('/repo')).modelTieringEnableConflict, undefined);
});

// --- preflight surfacing ----------------------------------------------------

test('buildPreflightReport surfaces the conflict as a non-blocking workspace warning', () => {
  const report = preflightReportFor({
    ...DEFAULT_CONFIG,
    modelTieringEnableConflict: {
      flatKey: 'ralphCodex.enableModelTiering',
      nestedKey: 'ralphCodex.modelTiering.enabled',
      flatValue: true,
      nestedValue: false,
      effectiveValue: true
    }
  });

  const diagnostic = report.diagnostics.find((entry) => entry.code === CONFLICT_CODE);
  assert.ok(diagnostic, 'expected a model_tiering_enable_conflict diagnostic');
  assert.equal(diagnostic?.severity, 'warning');
  assert.equal(diagnostic?.category, 'workspaceRuntime');
  // Names both keys and the winning effective value so operators can reconcile.
  assert.match(diagnostic?.message ?? '', /ralphCodex\.enableModelTiering=true/);
  assert.match(diagnostic?.message ?? '', /ralphCodex\.modelTiering\.enabled=false/);
  assert.match(diagnostic?.message ?? '', /enabled=true/);
  // A warning must not block readiness.
  assert.equal(report.ready, true);
});

test('buildPreflightReport stays silent when no conflict is recorded', () => {
  const report = preflightReportFor(DEFAULT_CONFIG);
  assert.equal(report.diagnostics.some((entry) => entry.code === CONFLICT_CODE), false);
});
