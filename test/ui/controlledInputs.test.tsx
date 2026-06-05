import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { App, applyOptimisticWizardMessage } from '../../src/webview-ui/App';
import type { PrdWizardTaskDraft } from '../../src/webview/prdCreationWizardTypes';
import type { RalphDashboardState } from '../../src/ui/uiTypes';
import type { SettingsSurfaceEntrySnapshot, SettingsSurfaceSnapshot } from '../../src/config/settingsSurface';
import type { WizardState } from '../../src/webview/prdCreationWizardTypes';

interface WebviewApiProbe {
  posted: Array<{ type?: string;[key: string]: unknown }>;
  lastPosted(type: string): { type?: string;[key: string]: unknown } | undefined;
  reset(): void;
}
const api = (): WebviewApiProbe => {
  const probe = (globalThis as unknown as { __RALPH_WEBVIEW_API__?: WebviewApiProbe }).__RALPH_WEBVIEW_API__;
  if (!probe) throw new Error('register-dom.cjs harness not loaded');
  return probe;
};

beforeEach(() => api().reset());
afterEach(() => cleanup());

// ---------------------------------------------------------------------------
// PRD wizard text fields — edits must apply optimistically so the controlled
// inputs do not reset and bounce the caret to the end (BUG: caret jump).
// ---------------------------------------------------------------------------

function makeWizardState(overrides: Partial<WizardState> = {}): WizardState {
  return {
    mode: 'new', step: 1, projectType: 'web-app',
    objective: 'abc', techStack: '', outOfScope: '', existingConventions: '',
    draft: null, prdReadiness: null, taskGenerationStatus: 'idle', taskGenerationMessage: null,
    tasksStale: false, generationState: 'idle', generationMessage: null,
    operationStatus: 'idle', operationMessage: null, warning: null, error: null,
    currentPrdPreview: null, writeSummary: null,
    paths: { prdPath: '.ralph/prd.md', tasksPath: '.ralph/tasks.json' },
    ...overrides,
  };
}

test('wizard objective field reflects an edit immediately (optimistic, no host echo)', () => {
  const { container } = render(<App mode="prd-wizard" initialState={makeWizardState({ objective: 'abc' })} />);
  const textarea = container.querySelector('[data-field="objective"]') as HTMLTextAreaElement;
  assert.equal(textarea.value, 'abc');

  fireEvent.change(textarea, { target: { value: 'Xabc' } });

  assert.equal(api().lastPosted('update-field')?.value, 'Xabc', 'edit is forwarded to the host');
  assert.equal(textarea.value, 'Xabc', 'controlled value reflects the edit without a host round-trip');
});

test('wizard draft PRD textarea reflects an edit immediately', () => {
  const { container } = render(<App mode="prd-wizard" initialState={makeWizardState({ step: 3, draft: { prdText: 'hello', tasks: [] } })} />);
  const textarea = container.querySelector('[data-action="draft-prd-text"]') as HTMLTextAreaElement;
  fireEvent.change(textarea, { target: { value: 'Xhello' } });
  assert.equal(textarea.value, 'Xhello');
});

test('clearing acceptance/dependencies stores an empty array, not a one-empty-string array', () => {
  const task = { id: 'T1', title: 't', status: 'todo', acceptance: ['a'], dependsOn: ['x'] } as unknown as PrdWizardTaskDraft;
  const base = makeWizardState({ step: 5, draft: { prdText: '', tasks: [task] } });

  const afterAcceptance = applyOptimisticWizardMessage(base, { type: 'update-task-acceptance', taskId: 'T1', value: '' });
  assert.deepEqual(afterAcceptance.draft?.tasks[0].acceptance, []);

  const afterDeps = applyOptimisticWizardMessage(base, { type: 'update-task-dependencies', taskId: 'T1', value: '' });
  assert.deepEqual((afterDeps.draft?.tasks[0] as { dependsOn?: unknown }).dependsOn, []);
});

// ---------------------------------------------------------------------------
// Settings checkboxes
// ---------------------------------------------------------------------------

function booleanEntry(key: string, value: boolean): SettingsSurfaceEntrySnapshot {
  return {
    key, manifestKey: `ralphCodex.${key}`, sectionId: 'loop-dynamics', title: key,
    description: '', control: 'boolean', defaultValue: true, value, isNew: false,
  };
}

function enumEntry(key: string, value: string): SettingsSurfaceEntrySnapshot {
  return {
    key, manifestKey: `ralphCodex.${key}`, sectionId: 'loop-dynamics', title: key,
    description: '', control: 'enum', defaultValue: 'autonomous', value, isNew: false,
    options: ['supervised', 'autonomous'],
  };
}

function makeDashboardState(surface: SettingsSurfaceSnapshot): RalphDashboardState {
  return {
    workspaceName: 'ws', loopState: 'idle', agentRole: 'build',
    nextIteration: 1, loopIteration: 1, iterationCap: 5,
    taskCounts: null, tasks: [], recentIterations: [], preflightReady: true, preflightSummary: 'ok',
    diagnostics: [], agentLanes: [], dashboardSnapshot: null,
    snapshotStatus: { phase: 'idle', errorMessage: null },
    taskSeeding: { phase: 'idle', requestText: '', createdTaskCount: null, message: null, artifactPath: null },
    viewIntent: { activeTab: 'settings' }, prdExists: true,
    settingsSurface: surface,
  } as RalphDashboardState;
}

function loopSection(entries: SettingsSurfaceEntrySnapshot[]): SettingsSurfaceSnapshot {
  return { sections: [{ id: 'loop-dynamics', title: 'Loop & Autonomy', description: '', hasNewSettings: false, entries }] };
}

test('an unmanaged settings checkbox can be unticked and posts value=false', () => {
  const surface = loopSection([booleanEntry('stopOnHumanReviewNeeded', true)]);
  const { container } = render(<App mode="dashboard" initialState={makeDashboardState(surface)} />);
  const box = container.querySelector('[data-setting="stopOnHumanReviewNeeded"]') as HTMLInputElement;
  assert.equal(box.checked, true);
  assert.equal(box.disabled, false);

  fireEvent.click(box);

  assert.equal(api().lastPosted('update-setting')?.value, false);
  assert.equal(box.checked, false);
});

test('unmanaged checkbox stays unticked after a faithful host echo (value=false)', () => {
  const { container } = render(<App mode="dashboard" initialState={makeDashboardState(loopSection([booleanEntry('stopOnHumanReviewNeeded', true)]))} />);
  fireEvent.click(container.querySelector('[data-setting="stopOnHumanReviewNeeded"]') as HTMLInputElement);

  act(() => {
    window.dispatchEvent(new window.MessageEvent('message', {
      data: { type: 'state', state: makeDashboardState(loopSection([booleanEntry('stopOnHumanReviewNeeded', false)])) },
    }));
  });

  assert.equal((container.querySelector('[data-setting="stopOnHumanReviewNeeded"]') as HTMLInputElement).checked, false);
});

test('autonomy-managed checkbox is disabled with an explanatory note when autonomyMode is autonomous', () => {
  const surface = loopSection([enumEntry('autonomyMode', 'autonomous'), booleanEntry('autoReplenishBacklog', true)]);
  const { container } = render(<App mode="dashboard" initialState={makeDashboardState(surface)} />);
  const box = container.querySelector('[data-setting="autoReplenishBacklog"]') as HTMLInputElement;
  assert.equal(box.disabled, true, 'managed checkbox should be disabled under autonomous mode');
  assert.ok(container.textContent?.includes('Managed by Autonomy Mode'), 'should show the managed note');
});

test('autonomy-managed checkbox is editable under supervised mode', () => {
  const surface = loopSection([enumEntry('autonomyMode', 'supervised'), booleanEntry('autoReplenishBacklog', false)]);
  const { container } = render(<App mode="dashboard" initialState={makeDashboardState(surface)} />);
  const box = container.querySelector('[data-setting="autoReplenishBacklog"]') as HTMLInputElement;
  assert.equal(box.disabled, false, 'managed checkbox should be editable under supervised mode');
  assert.ok(!container.textContent?.includes('Managed by Autonomy Mode'));
});
