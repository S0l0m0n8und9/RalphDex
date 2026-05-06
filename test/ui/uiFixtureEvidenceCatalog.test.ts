import assert from 'node:assert/strict';
import test from 'node:test';
import { renderUiFixtureEvidence } from '../../src/ui/fixtureEvidence';
import { UI_STATE_FIXTURES } from './fixtures/uiStateFixtures';

test('renderUiFixtureEvidence emits deterministic sorted fixture evidence entries', () => {
  const entriesA = renderUiFixtureEvidence(UI_STATE_FIXTURES, 'fixture-evidence');
  const entriesB = renderUiFixtureEvidence(UI_STATE_FIXTURES, 'fixture-evidence');

  assert.equal(entriesA.length, UI_STATE_FIXTURES.length);
  assert.deepEqual(
    entriesA.map((entry) => entry.id),
    [...entriesA.map((entry) => entry.id)].sort((a, b) => a.localeCompare(b))
  );
  assert.deepEqual(
    entriesA.map((entry) => ({ id: entry.id, panelHash: entry.panelHash, sidebarHash: entry.sidebarHash })),
    entriesB.map((entry) => ({ id: entry.id, panelHash: entry.panelHash, sidebarHash: entry.sidebarHash }))
  );
});

test('renderUiFixtureEvidence preserves baseline a11y/webview hooks in exported HTML', () => {
  const entries = renderUiFixtureEvidence(UI_STATE_FIXTURES, 'fixture-evidence');

  for (const entry of entries) {
    assert.ok(entry.panelHtml.includes('<!DOCTYPE html>'), `panel doctype missing for ${entry.id}`);
    assert.ok(entry.sidebarHtml.includes('<!DOCTYPE html>'), `sidebar doctype missing for ${entry.id}`);
    assert.ok(entry.panelHtml.includes('role="tablist"'), `panel tablist role missing for ${entry.id}`);
    assert.ok(entry.panelHtml.includes('script nonce="fixture-evidence"'), `panel nonce missing for ${entry.id}`);
    assert.ok(entry.sidebarHtml.includes('script nonce="fixture-evidence"'), `sidebar nonce missing for ${entry.id}`);
  }
});

