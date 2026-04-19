import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveChatFocusLayoutMode } from '../lib/chat-focus-layout-mode';
import { resolveChatFocusStage } from '../lib/chat-focus-stage';

test('desktop uses split layout only for accumulated clarification', () => {
  assert.equal(
    resolveChatFocusLayoutMode({
      smallScreen: false,
      stage: resolveChatFocusStage({
        turnCount: 2,
        streaming: false,
        committing: false,
        canSend: true,
        hasNotice: false,
      }),
    }),
    'split',
  );
});

test('small screens always stay stacked', () => {
  assert.equal(
    resolveChatFocusLayoutMode({
      smallScreen: true,
      stage: resolveChatFocusStage({
        turnCount: 2,
        streaming: false,
        committing: false,
        canSend: true,
        hasNotice: false,
      }),
    }),
    'stacked',
  );
});

test('desktop spark, blocked, and clarify stay stacked', () => {
  assert.equal(
    resolveChatFocusLayoutMode({
      smallScreen: false,
      stage: resolveChatFocusStage({
        turnCount: 0,
        streaming: false,
        committing: false,
        canSend: true,
        hasNotice: false,
      }),
    }),
    'stacked',
  );
  assert.equal(
    resolveChatFocusLayoutMode({
      smallScreen: false,
      stage: resolveChatFocusStage({
        turnCount: 0,
        streaming: false,
        committing: false,
        canSend: false,
        hasNotice: true,
      }),
    }),
    'stacked',
  );
  assert.equal(
    resolveChatFocusLayoutMode({
      smallScreen: false,
      stage: resolveChatFocusStage({
        turnCount: 1,
        streaming: false,
        committing: false,
        canSend: true,
        hasNotice: false,
      }),
    }),
    'stacked',
  );
});
