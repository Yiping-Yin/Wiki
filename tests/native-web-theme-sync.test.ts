import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('native shell explicitly syncs the resolved theme into the webview', () => {
  const source = read('macos-app/Loom/Sources/ContentView.swift');

  assert.match(source, /private var webThemeMode: String/);
  assert.match(source, /LoomWebView\(url: server\.webviewURL, debugState: webState, forcedTheme: webThemeMode\)/);
  assert.match(source, /let forcedTheme: String/);
  assert.match(source, /static func themeSyncScript\(mode: String\) -> String/);
  assert.match(source, /localStorage\.setItem\('wiki:theme', mode\)/);
  assert.match(source, /root\.classList\.toggle\('dark', mode === 'dark'\)/);
  assert.match(source, /root\.classList\.toggle\('light', mode === 'light'\)/);
  assert.match(source, /root\.style\.setProperty\('--bg', palette\.bg\)/);
  assert.match(source, /root\.style\.setProperty\('--fg', palette\.fg\)/);
  assert.match(source, /root\.style\.setProperty\('--fg-secondary', palette\.fgSecondary\)/);
  assert.match(source, /root\.style\.setProperty\('--muted', palette\.muted\)/);
  assert.match(source, /themeSyncScript\(mode: forcedTheme\)/);
  assert.match(source, /context\.coordinator\.applyTheme\(forcedTheme, to: nsView\)/);
});
