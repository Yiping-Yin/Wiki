import assert from 'node:assert/strict';
import test from 'node:test';

import { computeDesktopChatFocusSpacer } from '../lib/chat-focus-spacing';

test('desktop spacer matches overlay height plus gap', () => {
  assert.equal(
    computeDesktopChatFocusSpacer({
      overlayHeight: 240,
      gap: 18,
      active: true,
      smallScreen: false,
    }),
    258,
  );
});

test('desktop spacer is disabled for inactive or small-screen states', () => {
  assert.equal(
    computeDesktopChatFocusSpacer({
      overlayHeight: 240,
      active: false,
      smallScreen: false,
    }),
    0,
  );
  assert.equal(
    computeDesktopChatFocusSpacer({
      overlayHeight: 240,
      active: true,
      smallScreen: true,
    }),
    0,
  );
});
