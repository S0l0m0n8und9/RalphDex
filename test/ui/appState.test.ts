import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSettingsSurfaceSnapshot } from '../../src/config/settingsSurface';
import { DEFAULT_CONFIG } from '../../src/config/defaults';
import type { RalphDashboardState } from '../../src/ui/uiTypes';
import { applyOptimisticSettingUpdate } from '../../src/webview-ui/App';

function makeState(overrides: Partial<RalphDashboardState> = {}): RalphDashboardState {
  return {
    workspaceName: 'test-ws',
    loopState: 'idle',
    agentRole: 'build',
    nextIteration: 1,
    loopIteration: 1,
    iterationCap: 5,
    taskCounts: null,
    tasks: [],
    recentIterations: [],
    preflightReady: true,
    preflightSummary: 'ok',
    diagnostics: [],
    agentLanes: [],
    settingsSurface: buildSettingsSurfaceSnapshot({ ...DEFAULT_CONFIG, cliProvider: 'codex' }),
    dashboardSnapshot: null,
    snapshotStatus: { phase: 'idle', errorMessage: null },
    taskSeeding: { phase: 'idle', requestText: '', createdTaskCount: null, message: null, artifactPath: null },
    viewIntent: null,
    prdExists: true,
    ...overrides
  };
}

function findSettingValue(state: RalphDashboardState, key: string): unknown {
  return state.settingsSurface?.sections
    .flatMap((section) => section.entries)
    .find((entry) => entry.key === key)?.value;
}

test('applyOptimisticSettingUpdate immediately updates the rendered settings surface value', () => {
  const state = makeState();

  const next = applyOptimisticSettingUpdate(state, 'cliProvider', 'claude');

  assert.equal(findSettingValue(next, 'cliProvider'), 'claude');
  assert.equal(findSettingValue(state, 'cliProvider'), 'codex', 'original state should remain immutable');
});

test('applyOptimisticSettingUpdate leaves state unchanged when the setting surface is unavailable', () => {
  const state = makeState({ settingsSurface: null });

  assert.equal(applyOptimisticSettingUpdate(state, 'cliProvider', 'claude'), state);
});
