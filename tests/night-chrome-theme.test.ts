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

  assert.match(source, /private var usesDarkChrome: Bool \{/);
  assert.match(source, /private var chromeColorScheme: ColorScheme \{/);
  assert.match(source, /private var sidebarColorScheme: ColorScheme \{/);
  assert.match(source, /@State private var themeClock: Date = Date\(\)/);
  assert.match(source, /now: themeClock/);
  assert.match(source, /Timer\.publish\(every: 300/);
  assert.match(source, /sidebarColorScheme == \.dark/);
  assert.match(source, /chromeBackground[\s\S]*usesDarkChrome \? LoomTokens\.night : LoomTokens\.paper/);
  assert.match(source, /\.environment\(\\\.colorScheme, sidebarColorScheme\)/);
  assert.match(source, /WindowConfigurator\(title: windowTitle, isNight: usesDarkChrome\)/);
  assert.match(source, /\.toolbarColorScheme\(usesDarkChrome \? \.dark : \.light, for: \.windowToolbar\)/);
  assert.doesNotMatch(source, /webState\.currentURL\.contains\("\/weaves"\)/);
  assert.doesNotMatch(source, /webState\.currentURL\.contains\("\/sources"\)/);
  assert.doesNotMatch(source, /webState\.currentURL\.contains\("\/knowledge\/"\)/);
});

test('auto theme follows local day and night instead of system dark mode', () => {
  const sidebar = read('macos-app/Loom/Sources/KnowledgeSidebarView.swift');
  const settings = read('macos-app/Loom/Sources/AppearanceSettingsView.swift');
  const minimal = read('macos-app/Loom/Sources/LoomMinimalRootView.swift');
  const captureWebView = read('macos-app/Loom/Sources/CaptureWebView.swift');
  const capturesView = read('macos-app/Loom/Sources/CapturesView.swift');
  const tokens = read('macos-app/Loom/Sources/LoomTokens.swift');
  const globalsV2 = read('app/globals-v2.css');

  assert.match(sidebar, /case "auto", "":\s*\n\s*return isNightTime\(now: now, calendar: calendar\) \? \.dark : \.light/);
  assert.match(sidebar, /static func isNightTime\(now: Date = Date\(\), calendar: Calendar = \.current\) -> Bool/);
  assert.match(sidebar, /hour < 6 \|\| hour >= 21/);
  assert.match(settings, /Text\("Auto"\)\.tag\("auto"\)/);
  assert.doesNotMatch(settings, /Text\("System"\)\.tag\("auto"\)/);
  assert.match(minimal, /@AppStorage\("theme"\) private var theme: String = "auto"/);
  assert.match(minimal, /@State private var themeClock: Date = Date\(\)/);
  assert.match(minimal, /WindowConfigurator\(title: "Loom", isNight: usesNightPalette\)/);
  assert.match(minimal, /CapturesView\(refreshToken: capturesRefreshToken, themeMode: webThemeMode\)/);
  assert.match(captureWebView, /var themeMode: String = "auto"/);
  assert.match(captureWebView, /LoomWebView\.themeSyncScript\(mode: themeMode\)/);
  assert.match(capturesView, /private let themeMode: String/);
  assert.match(tokens, /static let dsPaper\s+= Color\.dynamic\(light: 0xF4F0E4, dark: 0x221E18\)/);
  assert.match(tokens, /static let dsInk1\s+= Color\.dynamic\(light: 0x2A2520, dark: 0xE8E0CE\)/);
  assert.match(globalsV2, /\.light\s*\{[\s\S]*--paper-deep:\s*#F4F0E4;/);
  assert.match(globalsV2, /\.light\s*\{[\s\S]*--ink-1:\s*#2A2520;/);
  assert.doesNotMatch(globalsV2, /dark only here/);
});
