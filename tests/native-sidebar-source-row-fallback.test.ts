import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('native source-category fallback rows use Button so sidebar taps are not swallowed', () => {
  const source = read('macos-app/Loom/Sources/KnowledgeSidebarView.swift');

  assert.match(source, /private func userCategoryRow\(_ cat: UserCategory\)/);
  assert.match(source, /if docs\.isEmpty \{/);
  assert.match(source, /Button \{/);
  assert.match(source, /navigate\(to: cat\.href\)/);
  assert.doesNotMatch(source, /\.onTapGesture \{ navigate\(to: cat\.href\) \}/);
});

test('native sidebar uses dark background and keeps large source categories collapsed by default', () => {
  const source = read('macos-app/Loom/Sources/KnowledgeSidebarView.swift');

  assert.match(source, /private var sidebarBackground: Color \{/);
  assert.match(source, /usesNightSidebarPalette \? LoomTokens\.night : LoomTokens\.paper/);
  assert.match(source, /\.background\(sidebarBackground\.ignoresSafeArea\(\)\)/);
  assert.match(source, /@AppStorage\("loom\.sidebar\.expandedCategories\.v2"\)/);
  assert.match(source, /get: \{ forceOpen \|\| userExpanded \}/);
  assert.doesNotMatch(source, /collapsedCategories/);
  assert.doesNotMatch(source, /get: \{ forceOpen \|\| !userCollapsed \}/);
});

test('native source sidebar renders folder trees instead of a flat document dump', () => {
  const source = read('macos-app/Loom/Sources/KnowledgeSidebarView.swift');

  assert.match(source, /struct SourceFolderNode: Identifiable, Hashable/);
  assert.match(source, /struct SourceFolderTreeRow: View/);
  assert.match(source, /let subcategory: String\?/);
  assert.match(source, /let sourcePath: String\?/);
  assert.match(source, /let folders = sourceFolderTree\(for: cat, docs: docs\)/);
  assert.match(source, /ForEach\(folders\) \{ folder in/);
  assert.match(source, /private func sourceFolderPath\(for doc: Doc, in cat: UserCategory\) -> String/);
  assert.match(source, /sourceFolderPath\(fromSourcePath: sourcePath, in: cat\)/);
  assert.match(source, /private func sourceFolderPath\(fromSourcePath sourcePath: String, in cat: UserCategory\) -> String/);
  assert.match(source, /fields\["subcategory"\] as\? String/);
  assert.match(source, /fields\["sourcePath"\] as\? String/);
  assert.doesNotMatch(source, /ForEach\(docs\) \{ doc in[\s\S]*Text\(doc\.title\)[\s\S]*\.buttonStyle\(\.plain\)[\s\S]*\} label: \{/);
});
