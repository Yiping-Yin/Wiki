import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('source-first empty states point to /sources instead of /atlas', () => {
  const soan = read('app/SoanClient.tsx');
  const constellation = read('app/ConstellationClient.tsx');
  const patterns = read('app/PatternsClient.tsx');
  const pursuits = read('app/PursuitsClient.tsx');
  const docClient = read('app/DocClient.tsx');
  const coworks = read('app/coworks/CoworksIndexClient.tsx');
  const collection = read('app/CollectionClient.tsx');

  assert.match(soan, /Open Sources →/);
  assert.match(soan, /href="\/sources"/);
  assert.match(constellation, /Open Sources →/);
  assert.match(constellation, /href="\/sources"/);
  assert.match(patterns, /Open Sources →/);
  assert.match(patterns, /href="\/sources"/);
  assert.match(pursuits, /Open Sources →/);
  assert.match(pursuits, /href="\/sources"/);
  assert.match(docClient, /Open Sources →/);
  assert.match(docClient, /<Link href="\/sources" className="loom-empty-state-action">/);
  assert.match(coworks, /label="Open Sources →"/);
  assert.match(coworks, /href="\/sources"/);
  assert.match(collection, /current source set/);
  assert.match(collection, /Open Sources →/);
  assert.match(collection, /href="\/sources"/);
});

test('panel source meta routes wiki and sources to their phase-2 homes', () => {
  const selectors = read('lib/panel/selectors.ts');

  assert.match(selectors, /collectionLabel: 'LLM Wiki'/);
  assert.match(selectors, /collectionHref: '\/llm-wiki'/);
  assert.match(selectors, /collectionLabel: category\?\.label \?\? 'Sources'/);
  assert.match(selectors, /collectionHref: `\/knowledge\/\$\{match\[1\]\}`/);
});
