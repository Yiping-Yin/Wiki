import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSourceExcerpt } from '../lib/chat-focus-source';

test('buildSourceExcerpt normalizes whitespace for compact source display', () => {
  assert.equal(
    buildSourceExcerpt('  This   is\n\n a    passage.  '),
    'This is a passage.',
  );
});

test('buildSourceExcerpt truncates long excerpts with an ellipsis', () => {
  const source = 'a'.repeat(240);
  const excerpt = buildSourceExcerpt(source, 32);

  assert.equal(excerpt.length, 33);
  assert.equal(excerpt.endsWith('…'), true);
});
