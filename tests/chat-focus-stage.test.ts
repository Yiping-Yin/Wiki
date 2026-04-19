import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveChatFocusStage } from '../lib/chat-focus-stage';

test('spark is the empty ready state', () => {
  assert.equal(
    resolveChatFocusStage({
      turnCount: 0,
      streaming: false,
      committing: false,
      canSend: true,
      hasNotice: false,
    }),
    'spark',
  );
});

test('blocked is the empty unavailable state', () => {
  assert.equal(
    resolveChatFocusStage({
      turnCount: 0,
      streaming: false,
      committing: false,
      canSend: false,
      hasNotice: true,
    }),
    'blocked',
  );
});

test('clarify covers the first active pass', () => {
  assert.equal(
    resolveChatFocusStage({
      turnCount: 0,
      streaming: true,
      committing: false,
      canSend: true,
      hasNotice: false,
    }),
    'clarify',
  );
  assert.equal(
    resolveChatFocusStage({
      turnCount: 1,
      streaming: false,
      committing: false,
      canSend: true,
      hasNotice: false,
    }),
    'clarify',
  );
});

test('accumulate starts on the second completed pass', () => {
  assert.equal(
    resolveChatFocusStage({
      turnCount: 2,
      streaming: false,
      committing: false,
      canSend: true,
      hasNotice: false,
    }),
    'accumulate',
  );
});
