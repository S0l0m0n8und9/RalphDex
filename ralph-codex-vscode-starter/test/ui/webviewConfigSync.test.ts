import assert from 'node:assert/strict';
import test from 'node:test';
import { SerialAsyncQueue, deepSet } from '../../src/ui/webviewConfigSync';

test('deepSet updates nested model tiering fields without replacing siblings', () => {
  const original = {
    simple: { model: 'a', provider: 'codex' },
    medium: { model: 'b', provider: 'claude' }
  };

  const updated = deepSet(structuredClone(original), 'simple.model', 'c');

  assert.deepEqual(updated, {
    simple: { model: 'c', provider: 'codex' },
    medium: { model: 'b', provider: 'claude' }
  });
});

test('SerialAsyncQueue runs writes in order', async () => {
  const queue = new SerialAsyncQueue();
  const order: string[] = [];

  const firstWrite = queue.enqueue(async () => {
    order.push('first:start');
    await new Promise((resolve) => setTimeout(resolve, 20));
    order.push('first:end');
  });
  const secondWrite = queue.enqueue(async () => {
    order.push('second:start');
    order.push('second:end');
  });
  await queue.whenIdle();
  await Promise.all([firstWrite, secondWrite]);

  assert.deepEqual(order, ['first:start', 'first:end', 'second:start', 'second:end']);
});
