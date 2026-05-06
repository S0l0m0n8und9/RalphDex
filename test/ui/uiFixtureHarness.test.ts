import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPanelDashboardHtml } from '../../src/ui/panelHtml';
import { buildDashboardHtml } from '../../src/ui/sidebarHtml';
import { UI_STATE_FIXTURES } from './fixtures/uiStateFixtures';

test('UI fixture catalogue renders dashboard and sidebar HTML deterministically', () => {
  for (const fixture of UI_STATE_FIXTURES) {
    const panel = buildPanelDashboardHtml(fixture.state, 'fixture-nonce');
    const sidebar = buildDashboardHtml(fixture.state, 'fixture-nonce');

    assert.ok(panel.includes('<!DOCTYPE html>'), `panel html missing doctype for ${fixture.id}`);
    assert.ok(sidebar.includes('<!DOCTYPE html>'), `sidebar html missing doctype for ${fixture.id}`);
    assert.ok(panel.includes('script nonce="fixture-nonce"'), `panel CSP nonce missing for ${fixture.id}`);
    assert.ok(sidebar.includes('script nonce="fixture-nonce"'), `sidebar CSP nonce missing for ${fixture.id}`);
  }
});

test('UI fixture catalogue includes required UX states for baseline visual coverage', () => {
  const ids = new Set(UI_STATE_FIXTURES.map((fixture) => fixture.id));
  const required = [
    'empty-workspace',
    'no-prd',
    'prd-no-tasks',
    'provider-not-configured',
    'provider-ready',
    'idle-with-tasks',
    'running-single-agent',
    'running-multi-agent',
    'blocked-preflight',
    'needs-human-review',
    'repeated-no-progress',
    'failed-iteration',
    'all-tasks-done',
    'settings-invalid',
    'task-seeding-success',
    'task-seeding-error'
  ];

  for (const id of required) {
    assert.ok(ids.has(id), `missing required UI fixture: ${id}`);
  }
});

test('UI fixture catalogue enforces state-copy contract for readiness and workflow language', () => {
  const byId = new Map(UI_STATE_FIXTURES.map((fixture) => [fixture.id, fixture]));

  const noPrd = byId.get('no-prd');
  assert.ok(noPrd, 'missing no-prd fixture');
  const noPrdHtml = buildPanelDashboardHtml(noPrd!.state, 'fixture-nonce');
  assert.ok(noPrdHtml.includes('Setup Required'));
  assert.ok(noPrdHtml.includes('Open PRD Wizard'));

  const blockedPreflight = byId.get('blocked-preflight');
  assert.ok(blockedPreflight, 'missing blocked-preflight fixture');
  const blockedPreflightHtml = buildPanelDashboardHtml(blockedPreflight!.state, 'fixture-nonce');
  assert.ok(blockedPreflightHtml.includes('Readiness Blocked'));
  assert.ok(blockedPreflightHtml.includes('Open Settings'));

  const runningSingle = byId.get('running-single-agent');
  assert.ok(runningSingle, 'missing running-single-agent fixture');
  const runningSingleHtml = buildPanelDashboardHtml(runningSingle!.state, 'fixture-nonce');
  assert.ok(runningSingleHtml.includes('Loop running'));

  const idleWithTasks = byId.get('idle-with-tasks');
  assert.ok(idleWithTasks, 'missing idle-with-tasks fixture');
  const idleWithTasksHtml = buildPanelDashboardHtml(idleWithTasks!.state, 'fixture-nonce');
  assert.ok(idleWithTasksHtml.includes('Run Full Workflow'));
  assert.ok(idleWithTasksHtml.includes('Latest Run Report'));
  assert.ok(!idleWithTasksHtml.includes('Latest Pipeline Run'));
  assert.ok(!idleWithTasksHtml.includes('Run Pipeline'));
});

