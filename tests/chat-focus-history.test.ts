import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildClarificationPasses,
  getDisplayedPassAnswer,
  getCurrentSynthesis,
  resolvePassSelection,
  resolvePinnedPassAfterTurnChange,
  shouldShowClarificationHistory,
} from '../lib/chat-focus-history';

test('getCurrentSynthesis returns the latest completed answer', () => {
  const turns = [
    { q: 'What does this formula mean?', a: 'First answer' },
    { q: 'Why is there a denominator?', a: 'Second answer' },
  ];

  assert.equal(getCurrentSynthesis(turns, ''), 'Second answer');
});

test('getCurrentSynthesis prefers the streaming answer when present', () => {
  const turns = [
    { q: 'What does this formula mean?', a: 'First answer' },
  ];

  assert.equal(getCurrentSynthesis(turns, 'Streaming answer'), 'Streaming answer');
});

test('buildClarificationPasses keeps prior passes and labels them for compact history', () => {
  const turns = [
    { q: 'What does this probability table represent?', a: 'Pass 1' },
    { q: 'Why is the denominator summing over j?', a: 'Pass 2' },
    { q: 'How does this connect to bigram counts?', a: 'Pass 3' },
  ];

  assert.deepEqual(buildClarificationPasses(turns), [
    {
      index: 0,
      question: 'What does this probability table represent?',
      answer: 'Pass 1',
      label: '1 · probability table',
      delta: 'Added: probability table',
    },
    {
      index: 1,
      question: 'Why is the denominator summing over j?',
      answer: 'Pass 2',
      label: '2 · denominator',
      delta: 'Added: denominator',
    },
  ]);
});

test('clarification history appears once there is a previous pass to revisit', () => {
  assert.equal(shouldShowClarificationHistory(0), false);
  assert.equal(shouldShowClarificationHistory(1), false);
  assert.equal(shouldShowClarificationHistory(2), true);
});

test('displayed clarification falls back to the latest synthesis when nothing is pinned', () => {
  assert.equal(getDisplayedPassAnswer([
    { index: 0, question: 'A', answer: 'First', label: '1 · first', delta: 'Added: first' },
  ], null, 'Current'), 'Current');
});

test('displayed clarification prefers the pinned pass when one is selected', () => {
  assert.equal(getDisplayedPassAnswer([
    { index: 0, question: 'A', answer: 'First', label: '1 · first', delta: 'Added: first' },
    { index: 1, question: 'B', answer: 'Second', label: '2 · second', delta: 'Added: second' },
  ], 1, 'Current'), 'Second');
});

test('resolvePassSelection toggles the same pass off', () => {
  assert.equal(resolvePassSelection(1, 1), null);
  assert.equal(resolvePassSelection(null, 1), 1);
});

test('pinned pass resets after a new turn completes', () => {
  assert.equal(resolvePinnedPassAfterTurnChange(1, 3, 4), null);
  assert.equal(resolvePinnedPassAfterTurnChange(1, 3, 3), 1);
  assert.equal(resolvePinnedPassAfterTurnChange(null, 3, 4), null);
});
