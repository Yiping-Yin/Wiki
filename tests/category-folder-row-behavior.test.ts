import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(__dirname, '..');

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('category folder rows separate toggle and primary-open actions', () => {
  const source = read('app/knowledge/[category]/CategoryLandingClient.tsx');

  assert.match(source, /onOpenFolder:\s*\(folder: FolderNode\) => void;/);
  assert.match(source, /aria-label=\{\`Toggle \$\{node\.name \|\| 'section'\}\`\}/);
  assert.match(source, /onClick=\{\(\) => toggle\(node\.fullPath, !open\)\}/);
  assert.match(source, /onClick=\{\(\) => onOpenFolder\(node\)\}/);
  assert.match(source, /className="loom-category-open"/);
  assert.match(source, /const openFolder = \(folder: FolderNode\) => \{/);
  assert.match(source, /const focus = folder\.focusSurface \?\? folder\.allSurfaces\[0\] \?\? null;/);
  assert.match(source, /if \(!focus\) \{/);
  assert.match(source, /<FolderTreeRow[\s\S]*onOpenFolder=\{openFolder\}/);
  assert.match(source, /onMouseEnter=\{\(e\) => \{/);
  assert.match(source, /target\.style\.color = 'var\(--accent\)'/);
  assert.match(source, /target\.style\.textDecoration = 'underline'/);
  assert.match(source, /onMouseLeave=\{\(e\) => \{/);
});

test('category folder tree mirrors local folders without expanding every file by default', () => {
  const source = read('app/knowledge/[category]/CategoryLandingClient.tsx');

  assert.match(source, /Build an N-level tree that mirrors the source-folder structure/);
  assert.match(source, /files only appear after the matching\s+\/\/ local folder is opened/);
  assert.match(source, /sourcePath: string;/);
  assert.match(source, /function folderPathFromDoc\(doc: CategoryDocCard, category: KnowledgeCategory\)/);
  assert.match(source, /const raw = folderPathFromDoc\(doc, category\)\.trim\(\);/);
  assert.match(source, /const isExpanded = \(node: FolderNode\) => \{/);
  assert.match(source, /if \(node\.fullPath in expandOverrides\) return expandOverrides\[node\.fullPath\];/);
  assert.match(source, /return false;/);
  assert.doesNotMatch(source, /return node\.depth === 0;/);
});

test('static search index preserves local folder metadata for native source trees', () => {
  const source = read('scripts/build-search-index.ts');
  const exportSource = read('scripts/build-static-export.mjs');

  assert.match(source, /subcategory: m\.subcategory \?\? ''/);
  assert.match(source, /sourcePath: m\.sourcePath/);
  assert.match(source, /storeFields: \['title', 'href', 'category', 'subcategory', 'sourcePath'\]/);
  assert.match(exportSource, /function resolveContentRootForStaticExport\(\)/);
  assert.match(exportSource, /content-root\.json/);
  assert.match(exportSource, /path\.join\(contentRoot, 'knowledge', '\.cache', 'indexes', 'search-index\.json'\)/);
});
