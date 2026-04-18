import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveClarificationViewMode } from '../lib/chat-focus-view';

test('clarification defaults to synthesis once editorial body exists', () => {
  assert.equal(resolveClarificationViewMode(undefined, true), 'synthesis');
  assert.equal(resolveClarificationViewMode(null, true), 'synthesis');
});

test('source remains the only view before an answer exists', () => {
  assert.equal(resolveClarificationViewMode(undefined, false), 'source');
  assert.equal(resolveClarificationViewMode('synthesis', false), 'source');
});

test('explicit source selection is preserved when editorial body exists', () => {
  assert.equal(resolveClarificationViewMode('source', true), 'source');
});
