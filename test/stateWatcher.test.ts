import assert from 'node:assert/strict';
import test from 'node:test';
import { RalphStateWatcher } from '../src/ui/stateWatcher';
import { vscodeTestHarness } from './support/vscodeTestHarness';

test.beforeEach(() => {
  vscodeTestHarness().reset();
});

test('state watcher watches durable task, claim, dead-letter, and task-artifact files', () => {
  const harness = vscodeTestHarness();
  const watcher = new RalphStateWatcher('C:\\repo');

  assert.equal(harness.state.createdFileSystemWatchers.length, 2);
  const patterns = harness.state.createdFileSystemWatchers.map((entry) => {
    const pattern = entry.pattern as { pattern?: unknown };
    return String(pattern?.pattern ?? '');
  });

  assert.ok(patterns.includes('{tasks.json,state.json,claims.json,dead-letter.json}'));
  assert.ok(patterns.includes('artifacts/**/{task-plan.json,failure-analysis.json,recovery-state.json}'));

  watcher.dispose();
});
