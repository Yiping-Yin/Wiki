import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('main Loom window disables automatic tabbing so the system title pill does not reappear', () => {
  const appSource = read('macos-app/Loom/Sources/LoomApp.swift');
  const contentSource = read('macos-app/Loom/Sources/ContentView.swift');

  assert.match(appSource, /Window\("Loom"/);
  assert.doesNotMatch(appSource, /WindowGroup \{/);
  assert.match(appSource, /NSWindow\.allowsAutomaticWindowTabbing = false/);
  assert.match(contentSource, /window\.tabbingMode = \.disallowed/);
  assert.match(contentSource, /tabGroup\?\.isTabBarVisible == true/);
  assert.match(contentSource, /window\.toggleTabBar\(nil\)/);
  assert.match(contentSource, /window\.appearance = NSAppearance\(named: isNight \? \.darkAqua : \.aqua\)/);
  assert.match(contentSource, /window\.title = "Loom"/);
  assert.doesNotMatch(contentSource, /window\.title = title/);
});
