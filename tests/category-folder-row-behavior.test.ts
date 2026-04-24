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
