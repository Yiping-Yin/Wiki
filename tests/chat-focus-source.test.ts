import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSourceExcerpt, buildSourceStub } from '../lib/chat-focus-source';

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

test('buildSourceStub returns preview and truncation state', () => {
  const stub = buildSourceStub('This   is a very long passage that should be truncated for a compact source stub.', 20);

  assert.equal(stub.full, 'This is a very long passage that should be truncated for a compact source stub.');
  assert.equal(stub.preview, 'This is a very long…');
  assert.equal(stub.truncated, true);
});
