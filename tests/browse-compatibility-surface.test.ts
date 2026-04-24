import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('/browse is now a compatibility alias to Desk, not a second reference surface', () => {
  const browsePage = read('app/browse/page.tsx');

  assert.match(browsePage, /title: 'Desk · Loom'/);
  assert.match(browsePage, /redirect\('\/desk'\)/);
  assert.ok(!fs.existsSync(path.join(repoRoot, 'app/browse/BrowseClient.tsx')));
});
