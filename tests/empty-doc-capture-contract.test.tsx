import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(__dirname, '..');

test('knowledge doc page routes empty docs into the capture surface', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'app/knowledge/[category]/[slug]/page.tsx'),
    'utf8',
  );

  assert.match(source, /EmptyDocCaptureSurface/);
  assert.match(source, /isEligibleCaptureDoc/);
  assert.doesNotMatch(source, /const showCapture = isKnowledgeDocPlaceholder/);
});

test('capture surface does not reuse Today free-input semantics', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'components/knowledge/EmptyDocCaptureSurface.tsx'),
    'utf8',
  );

  assert.doesNotMatch(source, /free-recompile/);
  assert.match(source, /capture-organize/);
  assert.match(source, /Organize into note/);
});
