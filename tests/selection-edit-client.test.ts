import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractJson,
  isVerbatimSubstring,
  wordCount,
} from '../lib/selection-edit-client';

test('wordCount handles empty and whitespace-only strings', () => {
  assert.equal(wordCount(''), 0);
  assert.equal(wordCount('   '), 0);
});

test('wordCount counts across single and multiple spaces', () => {
  assert.equal(wordCount('one'), 1);
  assert.equal(wordCount('one two three'), 3);
  assert.equal(wordCount('one   two\nthree\tfour'), 4);
});

test('extractJson parses a pure JSON object', () => {
  assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
});

test('extractJson recovers JSON buried in surrounding prose', () => {
  const raw = 'Sure thing! Here is the output:\n\n{"content":"hi","citations":[]}\n\nLet me know.';
  assert.deepEqual(extractJson(raw), { content: 'hi', citations: [] });
});

test('extractJson throws when no JSON object present', () => {
  assert.throws(() => extractJson('plain text only'));
});

test('isVerbatimSubstring is case-insensitive and whitespace-normalized', () => {
  assert.equal(isVerbatimSubstring('Hello World', 'foo hello   world bar'), true);
  assert.equal(isVerbatimSubstring('nothing', 'foo bar'), false);
  assert.equal(isVerbatimSubstring('', 'anything'), false);
});

test('isVerbatimSubstring catches fabricated claims', () => {
  const source = 'The experiment showed a 12% improvement with the new protocol.';
  const fabricated = 'The experiment showed a 73% improvement';
  assert.equal(isVerbatimSubstring(fabricated, source), false);
});
