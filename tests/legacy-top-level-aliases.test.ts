import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('legacy top-level routes are compatibility aliases and not owning implementations', () => {
  const today = read('app/today/page.tsx');
  const graph = read('app/graph/page.tsx');
  const desk = read('app/desk/page.tsx');

  assert.match(today, /redirect\('\/desk'\)|router\.replace\('\/desk'\)/);
  assert.match(graph, /router\.replace\(query \? `\/weaves\?\$\{query\}` : '\/weaves'\)|redirect\(target\)/);
  assert.doesNotMatch(desk, /export \{ default \} from '\.\.\/today\/page'/);
});
