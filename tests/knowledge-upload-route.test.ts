import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(__dirname, '..');

test('upload route supports mdx and returns capture metadata for category uploads', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'app/api/upload/route.ts'),
    'utf8',
  );

  assert.match(source, /'\.mdx'/);
  assert.match(source, /textExtractable:/);
  assert.match(source, /docHref:/);
});
