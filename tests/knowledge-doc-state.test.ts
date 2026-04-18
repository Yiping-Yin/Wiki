import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canCaptureInline,
  LOOM_CAPTURE_DOC_MARKER,
  isKnowledgeDocPlaceholder,
  isWritableCaptureDoc,
} from '../lib/knowledge-doc-state';

test('treats title-only markdown as an empty knowledge doc', () => {
  assert.equal(
    isKnowledgeDocPlaceholder({
      title: 'UI build check',
      body: `${LOOM_CAPTURE_DOC_MARKER}\n# UI build check\n`,
    }),
    true,
  );
});

test('treats meaningful body text as a real knowledge doc', () => {
  assert.equal(
    isKnowledgeDocPlaceholder({
      title: 'Bigram Language Models',
      body: '# Bigram Language Models\n\n## Core idea\n\nA bigram model predicts the next token from the current token.',
    }),
    false,
  );
});

test('only text-extractable files qualify for inline capture organization', () => {
  assert.equal(canCaptureInline('notes.md'), true);
  assert.equal(canCaptureInline('outline.mdx'), true);
  assert.equal(canCaptureInline('lecture.txt'), true);
  assert.equal(canCaptureInline('slides.pdf'), false);
});

test('only Loom-owned placeholder docs are writable by the capture workflow', () => {
  assert.equal(
    isWritableCaptureDoc({
      ext: '.md',
      body: `${LOOM_CAPTURE_DOC_MARKER}\n# UI build check\n`,
    }),
    true,
  );

  assert.equal(
    isWritableCaptureDoc({
      ext: '.md',
      body: '# Imported lecture note\n',
    }),
    false,
  );

  assert.equal(
    isWritableCaptureDoc({
      ext: '.pdf',
      body: `${LOOM_CAPTURE_DOC_MARKER}\n# Imported PDF\n`,
    }),
    false,
  );
});
