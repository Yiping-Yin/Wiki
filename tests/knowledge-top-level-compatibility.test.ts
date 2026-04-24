import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('/knowledge is a Sources compatibility alias, not a second home', () => {
  const knowledge = read('app/knowledge/page.tsx');

  assert.match(knowledge, /redirect\('\/sources'\)|router\.replace\('\/sources'\)/);
  assert.doesNotMatch(knowledge, /getSourceLibraryGroups/);
  assert.doesNotMatch(knowledge, /KnowledgeHomeClient/);
});
