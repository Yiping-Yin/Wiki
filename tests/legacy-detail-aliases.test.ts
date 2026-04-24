import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, ...relativePath.split('/')), 'utf8');
}

test('legacy panel and pursuit detail routes are compatibility aliases, not placeholder shell generators', () => {
  const legacyPanel = read('app/panels/[id]/page.tsx');
  const legacyPursuit = read('app/pursuits/[id]/page.tsx');

  assert.doesNotMatch(legacyPanel, /export function generateStaticParams/);
  assert.doesNotMatch(legacyPursuit, /export function generateStaticParams/);

  assert.match(legacyPanel, /router\.replace\(`\/panel\/\$\{encodeURIComponent\(id\)\}`\)/);
  assert.match(legacyPursuit, /router\.replace\(`\/pursuit\/\$\{encodeURIComponent\(id\)\}`\)/);
});
