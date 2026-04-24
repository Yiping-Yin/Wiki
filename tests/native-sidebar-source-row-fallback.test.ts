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
