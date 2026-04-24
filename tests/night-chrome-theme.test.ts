import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('window chrome follows the resolved app theme, not only the /weaves route', () => {
  const source = read('macos-app/Loom/Sources/ContentView.swift');

  assert.match(source, /private var isNightChrome: Bool \{/);
  assert.match(source, /private var usesDarkChrome: Bool \{/);
  assert.match(source, /sidebarColorScheme == \.dark/);
  assert.match(source, /chromeBackground[\s\S]*usesDarkChrome \? LoomTokens\.night : LoomTokens\.paper/);
  assert.match(source, /WindowConfigurator\(title: windowTitle, isNight: usesDarkChrome\)/);
  assert.match(source, /\.toolbarColorScheme\(usesDarkChrome \? \.dark : \.light, for: \.windowToolbar\)/);
  assert.doesNotMatch(source, /webState\.currentURL\.contains\("\/weaves"\)/);
});
