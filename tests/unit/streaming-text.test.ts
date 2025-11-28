import assert from 'node:assert';
import test from 'node:test';

import { enqueueIfChanged, resolveFlushValue } from '../../components/streaming-text';

test('enqueueIfChanged appends only new values', () => {
  const queue = enqueueIfChanged([], 'first');

  assert.deepStrictEqual(queue, ['first']);

  const sameQueue = enqueueIfChanged(queue, 'first');

  assert.strictEqual(sameQueue.length, 1);
  assert.deepStrictEqual(sameQueue, ['first']);

  const newQueue = enqueueIfChanged(sameQueue, 'second');

  assert.deepStrictEqual(newQueue, ['first', 'second']);
});

test('resolveFlushValue uses the latest queued value when not forced', () => {
  const queue = ['draft-1', 'draft-2', 'final'];

  const { nextValue, remainingQueue } = resolveFlushValue({
    forcedValue: undefined,
    lastRendered: '',
    queue,
  });

  assert.strictEqual(nextValue, 'final');
  assert.deepStrictEqual(remainingQueue, []);
});

test('resolveFlushValue respects forced values and avoids duplicates', () => {
  const queue = ['draft'];

  const forcedResult = resolveFlushValue({
    forcedValue: 'forced',
    lastRendered: 'previous',
    queue,
  });

  assert.strictEqual(forcedResult.nextValue, 'forced');
  assert.deepStrictEqual(forcedResult.remainingQueue, []);

  const unchangedResult = resolveFlushValue({
    forcedValue: 'forced',
    lastRendered: 'forced',
    queue,
  });

  assert.strictEqual(unchangedResult.nextValue, undefined);
  assert.deepStrictEqual(unchangedResult.remainingQueue, []);
});
