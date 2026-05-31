import assert from 'node:assert/strict';
import test from 'node:test';
import * as vscode from 'vscode';
import { DEFAULT_CONFIG } from '../src/config/defaults';
import {
  detectModelTieringEnableConflict,
  explicitBoolean,
  explicitNestedTieringEnabled,
  readConfig
} from '../src/config/readConfig';
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

// --- Explicit-value scope precedence ---------------------------------------
// inspect() precedence must mirror config.get() for a resource-scoped
// configuration (workspaceFolderValue > workspaceValue > globalValue) so the
// detected conflict and the flat-alias override stay consistent at folder
// scope in multi-root workspaces.

test('explicitBoolean honors workspaceFolderValue over workspace and global scope', () => {
  assert.equal(explicitBoolean({ workspaceFolderValue: true, workspaceValue: false, globalValue: false }), true);
  assert.equal(explicitBoolean({ workspaceFolderValue: false, workspaceValue: true }), false);
  // Falls back through the precedence chain when higher scopes are absent.
  assert.equal(explicitBoolean({ workspaceValue: true }), true);
  assert.equal(explicitBoolean({ globalValue: false }), false);
  // Implicit (manifest default only) stays undefined.
  assert.equal(explicitBoolean({}), undefined);
  assert.equal(explicitBoolean(undefined), undefined);
});

test('explicitNestedTieringEnabled honors workspaceFolderValue over workspace and global scope', () => {
  assert.equal(
    explicitNestedTieringEnabled({
      workspaceFolderValue: { enabled: true },
      workspaceValue: { enabled: false }
    }),
    true
  );
  assert.equal(explicitNestedTieringEnabled({ workspaceValue: { enabled: false } }), false);
  assert.equal(explicitNestedTieringEnabled({ globalValue: { enabled: true } }), true);
  // A folder-scoped object without a boolean `enabled` key is not explicit.
  assert.equal(explicitNestedTieringEnabled({ workspaceFolderValue: { simpleThreshold: 4 } }), undefined);
  assert.equal(explicitNestedTieringEnabled(undefined), undefined);
});

test('a disagreement pinned at folder scope is detected as a conflict', () => {
  // Flat alias enabled at folder scope, nested disabled at workspace scope:
  // config.get() would resolve the flat alias as the effective value, so the
  // detector must see it too (flat alias wins).
  const flat = explicitBoolean({ workspaceFolderValue: true });
  const nested = explicitNestedTieringEnabled({ workspaceValue: { enabled: false } });
  assert.deepEqual(detectModelTieringEnableConflict(flat, nested), {
    flatKey: 'ralphCodex.enableModelTiering',
    nestedKey: 'ralphCodex.modelTiering.enabled',
    flatValue: true,
    nestedValue: false,
    effectiveValue: true
  });
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
