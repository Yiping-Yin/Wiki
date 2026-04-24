import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('/desk becomes the shelf-first primary surface', () => {
  const deskPage = read('app/desk/DeskPage.tsx');
  const atlasClient = read('app/AtlasClient.tsx');

  assert.match(deskPage, /AtlasClient/);
  assert.match(deskPage, /TodayClient/);
  assert.match(atlasClient, /loom-atlas-title">Your sources</);
  assert.match(atlasClient, /sourceShelf/);
  assert.match(atlasClient, /referenceDocs/);
  assert.match(atlasClient, /href="\/sources"/);
  assert.match(atlasClient, /href="\/llm-wiki"/);
});

test('/atlas becomes a compatibility alias to /desk', () => {
  const atlasPage = read('app/atlas/page.tsx');

  assert.match(atlasPage, /redirect\('\/desk'\)/);
});

test('/sources becomes the canonical source-library home', () => {
  const sourcesPage = read('app/sources/page.tsx');

  assert.match(sourcesPage, /KnowledgeHomeClient/);
  assert.match(sourcesPage, /getSourceLibraryGroups/);
  assert.match(sourcesPage, /title: 'Sources · Loom'/);
});

test('/knowledge redirects to /sources as a compatibility alias', () => {
  const knowledgePage = read('app/knowledge/page.tsx');

  assert.match(knowledgePage, /redirect\('\/sources'\)/);
});

test('/llm-wiki has a dedicated home route', () => {
  const wikiPage = read('app/llm-wiki/page.tsx');

  assert.match(wikiPage, /title: 'LLM Wiki · Loom'/);
  assert.match(wikiPage, /<StageShell/);
  assert.match(wikiPage, /getWikiHomeSections/);
  assert.match(wikiPage, /eyebrow="Reference"/);
});
