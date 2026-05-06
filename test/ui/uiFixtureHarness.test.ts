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

