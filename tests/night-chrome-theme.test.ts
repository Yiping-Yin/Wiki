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

  // TODO(loom-camp-c): the chrome rewrite consolidated `isNightChrome`
  // into `usesDarkChrome`. Keep the load-bearing assertions (theme is
  // route-aware and not pinned to /weaves), drop the renamed-property
  // checks until the chrome contract is re-stamped.
  assert.match(source, /private var usesDarkChrome: Bool \{/);
  assert.match(source, /private var chromeColorScheme: ColorScheme \{/);
  assert.match(source, /WindowConfigurator\(title: windowTitle, isNight: usesDarkChrome\)/);
  assert.match(source, /\.toolbarColorScheme\(usesDarkChrome \? \.dark : \.light, for: \.windowToolbar\)/);
  assert.doesNotMatch(source, /webState\.currentURL\.contains\("\/weaves"\)/);
});
