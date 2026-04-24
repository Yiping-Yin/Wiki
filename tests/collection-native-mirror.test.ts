import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('CollectionClient reads native knowledge data from the mirror store instead of direct loom fetches', () => {
  const source = read('app/CollectionClient.tsx');

  assert.match(source, /readLoomMirror/);
  assert.match(source, /subscribeLoomMirror/);
  assert.match(source, /loom\.knowledge\.nav\.v1/);
  assert.match(source, /loom\.knowledge\.manifest\.v1/);
  assert.doesNotMatch(source, /loom:\/\/content\/knowledge\/\.cache\/manifest\/knowledge-nav\.json/);
  assert.doesNotMatch(source, /loom:\/\/content\/knowledge\/\.cache\/manifest\/knowledge-manifest\.json/);
});
