import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDashboardHtml } from '../../src/ui/sidebarHtml';
import type { RalphDashboardState } from '../../src/ui/uiTypes';

function defaultState(overrides: Partial<RalphDashboardState> = {}): RalphDashboardState {
  return {
    workspaceName: 'test-ws',
    loopState: 'idle',
    agentRole: 'build',
    nextIteration: 1,
    iterationCap: 5,
    taskCounts: null,
    tasks: [],
    recentIterations: [],
    preflightReady: true,
    preflightSummary: 'ok',
    diagnostics: [],
    agentLanes: [],
    config: null,
    ...overrides
  };
}

test('buildDashboardHtml returns valid HTML with nonce-gated script and style', () => {
  const html = buildDashboardHtml(defaultState(), 'abc123');
  assert.ok(html.includes('nonce-abc123'));
  assert.ok(html.includes('<style nonce="abc123">'));
  assert.ok(html.includes('<script nonce="abc123">'));
  assert.ok(html.includes('<!DOCTYPE html>'));
});

test('buildDashboardHtml shows progress bar with block characters', () => {
  const html = buildDashboardHtml(defaultState({
    taskCounts: { todo: 1, in_progress: 1, blocked: 0, done: 2 }
  }), 'n3');

  assert.ok(html.includes('█'));
  assert.ok(html.includes('2/4 done'));
  assert.ok(html.includes('50%'));
});

test('buildDashboardHtml shows phase indicator when running', () => {
  const html = buildDashboardHtml(defaultState({
    loopState: 'running',
    agentLanes: [{ agentId: 'default', phase: 'execute', iteration: 3 }]
  }), 'n4');

  assert.ok(html.includes('phase-indicator'));
  assert.ok(html.includes('iter 3'));
  assert.ok(html.includes('execute'));
});

test('buildDashboardHtml keeps all buttons enabled during running state for parallel launches', () => {
  const html = buildDashboardHtml(defaultState({ loopState: 'running' }), 'n5');
  // Sidebar buttons stay enabled — claims handle contention.
  const disabledButtons = (html.match(/<button[^>]*disabled[^>]*>/g) ?? []).length;
  assert.equal(disabledButtons, 0, `Expected 0 disabled buttons, got ${disabledButtons}`);
});

test('buildDashboardHtml renders agent and action button grids', () => {
  const html = buildDashboardHtml(defaultState(), 'n6');
  assert.ok(html.includes('ralphCodex.runRalphLoop'));
  assert.ok(html.includes('ralphCodex.runReviewAgent'));
  assert.ok(html.includes('ralphCodex.runWatchdogAgent'));
  assert.ok(html.includes('ralphCodex.runScmAgent'));
  assert.ok(html.includes('ralphCodex.runRalphIteration'));
  assert.ok(html.includes('ralphCodex.generatePrompt'));
  assert.ok(html.includes('ralphCodex.initializeWorkspace'));
});

test('buildDashboardHtml includes Open Dashboard button', () => {
  const html = buildDashboardHtml(defaultState(), 'n7');
  assert.ok(html.includes('ralphCodex.openDashboard'));
  assert.ok(html.includes('Open Dashboard'));
});

test('buildDashboardHtml renders header with workspace name and state', () => {
  const html = buildDashboardHtml(defaultState({ workspaceName: 'my-project' }), 'n8');
  assert.ok(html.includes('my-project'));
  assert.ok(html.includes('Ralphdex'));
  assert.ok(html.includes('idle'));
});

test('buildDashboardHtml includes command-ack message handler', () => {
  const html = buildDashboardHtml(defaultState(), 'n9');
  assert.ok(html.includes('command-ack'));
  assert.ok(html.includes('resetButton'));
});
