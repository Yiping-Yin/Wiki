import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildClarificationPasses,
  getCurrentSynthesis,
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

test('clarification history appears only after the third pass', () => {
  assert.equal(shouldShowClarificationHistory(0), false);
  assert.equal(shouldShowClarificationHistory(2), false);
  assert.equal(shouldShowClarificationHistory(3), true);
});
