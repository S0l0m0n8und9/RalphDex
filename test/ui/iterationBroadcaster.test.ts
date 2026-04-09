import assert from 'node:assert/strict';
import test from 'node:test';
import { IterationBroadcaster } from '../../src/ui/iterationBroadcaster';
import type { RalphBroadcastEvent } from '../../src/ui/uiTypes';

test('IterationBroadcaster emits phase events', () => {
  const broadcaster = new IterationBroadcaster();
  const events: RalphBroadcastEvent[] = [];
  broadcaster.onEvent((e) => events.push(e));

  broadcaster.emitPhase(1, 'inspect');
  broadcaster.emitPhase(1, 'execute');

  assert.equal(events.length, 2);
  assert.equal(events[0].type, 'phase');
  if (events[0].type === 'phase') {
    assert.equal(events[0].phase, 'inspect');
    assert.equal(events[0].iteration, 1);
    assert.ok(events[0].timestamp);
  }
  if (events[1].type === 'phase') {
    assert.equal(events[1].phase, 'execute');
  }

  broadcaster.dispose();
});

test('IterationBroadcaster emits loop lifecycle events', () => {
  const broadcaster = new IterationBroadcaster();
  const events: RalphBroadcastEvent[] = [];
  broadcaster.onEvent((e) => events.push(e));

  broadcaster.emitLoopStart(5);
  broadcaster.emitIterationStart({
    iteration: 1,
    iterationCap: 5,
    selectedTaskId: 'T1',
    selectedTaskTitle: 'Fix bug'
  });
  broadcaster.emitIterationEnd({
    iteration: 1,
    classification: 'complete',
    stopReason: null
  });
  broadcaster.emitLoopEnd(1, 'task_marked_complete');

  assert.equal(events.length, 4);
  assert.equal(events[0].type, 'loop-start');
  assert.equal(events[1].type, 'iteration-start');
  assert.equal(events[2].type, 'iteration-end');
  assert.equal(events[3].type, 'loop-end');

  if (events[1].type === 'iteration-start') {
    assert.equal(events[1].selectedTaskId, 'T1');
  }
  if (events[2].type === 'iteration-end') {
    assert.equal(events[2].classification, 'complete');
  }
  if (events[3].type === 'loop-end') {
    assert.equal(events[3].stopReason, 'task_marked_complete');
    assert.equal(events[3].totalIterations, 1);
  }

  broadcaster.dispose();
});

test('IterationBroadcaster stops firing after dispose', () => {
  const broadcaster = new IterationBroadcaster();
  const events: RalphBroadcastEvent[] = [];
  broadcaster.onEvent((e) => events.push(e));

  broadcaster.emitPhase(1, 'inspect');
  assert.equal(events.length, 1);

  broadcaster.dispose();
  broadcaster.emitPhase(2, 'execute');
  // After dispose, no more events should fire
  assert.equal(events.length, 1);
});
