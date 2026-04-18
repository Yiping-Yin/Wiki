import assert from 'node:assert/strict';
import test from 'node:test';

import { computeChatFocusPosition } from '../lib/chat-focus-layout';

test('computeChatFocusPosition centers within the prose width and respects max-width', () => {
  const position = computeChatFocusPosition({
    blockBottom: 420,
    proseLeft: 120,
    proseWidth: 960,
    proseMaxWidth: '720px',
    scrollX: 0,
    scrollY: 80,
  });

  assert.deepEqual(position, {
    top: 516,
    left: 240,
    width: 720,
  });
});

test('computeChatFocusPosition expands when the prose width grows after resize', () => {
  const small = computeChatFocusPosition({
    blockBottom: 420,
    proseLeft: 40,
    proseWidth: 560,
    proseMaxWidth: '720px',
    scrollX: 0,
    scrollY: 80,
  });

  const large = computeChatFocusPosition({
    blockBottom: 420,
    proseLeft: 120,
    proseWidth: 960,
    proseMaxWidth: '720px',
    scrollX: 0,
    scrollY: 80,
  });

  assert.equal(small.width, 560);
  assert.equal(large.width, 720);
  assert.equal(large.left > small.left, true);
});
