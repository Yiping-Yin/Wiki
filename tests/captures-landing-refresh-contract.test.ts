import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('captures landing refreshes the native capture list beyond first mount', () => {
  const source = read('app/loom-render/captures/page.tsx');

  assert.match(source, /fetch\('loom:\/\/native\/captures-list\.json'\)/);
  assert.match(source, /const loadCapturesList = useCallback/);
  assert.match(source, /refreshCapturesList/);
  assert.match(source, /addEventListener\('focus'/);
  assert.match(source, /addEventListener\('pageshow'/);
  assert.match(source, /addEventListener\('visibilitychange'/);
  assert.match(source, /addEventListener\('loom:capture-saved'/);
  assert.match(source, /addEventListener\('loom:captures:refresh'/);
  assert.match(source, /document\.visibilityState === 'visible'/);
  assert.match(source, /setInterval\([^,]+,\s*15000\)/);
  assert.match(source, /removeEventListener\('loom:capture-saved'/);
  assert.match(source, /clearInterval/);
});

test('native capture save forces captures webview back to a fresh landing URL', () => {
  const minimalRoot = read('macos-app/Loom/Sources/LoomMinimalRootView.swift');
  const capturesView = read('macos-app/Loom/Sources/CapturesView.swift');

  assert.match(minimalRoot, /@State private var capturesRefreshToken: Int = 0/);
  assert.match(minimalRoot, /capturesRefreshToken \+= 1\s*\n\s*navigate\(\.captures\)/);
  assert.match(minimalRoot, /NotificationCenter\.default\.post\(name: \.loomCaptureSaved/);
  assert.match(minimalRoot, /CapturesView\(refreshToken: capturesRefreshToken, themeMode: webThemeMode\)/);
  assert.match(capturesView, /init\(refreshToken: Int = 0, themeMode: String = "light"\)/);
  assert.match(capturesView, /loom:\/\/bundle\/loom-render\/captures\/\?refresh=\\\(refreshToken\)/);
});

test('native capture save bridges into the mounted captures webview without reloading it', () => {
  const appDelegate = read('macos-app/Loom/Sources/LoomApp.swift');
  const captureWebView = read('macos-app/Loom/Sources/CaptureWebView.swift');

  assert.match(appDelegate, /static let loomCaptureSaved = Notification\.Name\("loomCaptureSaved"\)/);
  assert.match(captureWebView, /private var captureSavedObserver: NSObjectProtocol\?/);
  assert.match(captureWebView, /forName: \.loomCaptureSaved/);
  assert.match(captureWebView, /window\.dispatchEvent\(new Event\('loom:capture-saved'\)\)/);
  assert.doesNotMatch(captureWebView, /forName: \.loomRefreshActivePage[\s\S]*webView\.reload\(\)/);
});

test('capture webview preserves reader-detail navigation across Swift view updates', () => {
  const captureWebView = read('macos-app/Loom/Sources/CaptureWebView.swift');

  assert.match(captureWebView, /private func shouldLoadTarget\(_ target: URL, current: URL\?\) -> Bool/);
  assert.match(captureWebView, /private static func isCaptureDetailPath\(_ path: String\) -> Bool/);
  assert.match(captureWebView, /path\.hasPrefix\("\/loom-render\/capture\/"\)/);
  assert.match(captureWebView, /path\.hasPrefix\("\/loom-render\/snapshot\/"\)/);
  assert.match(captureWebView, /target\.path\.hasPrefix\("\/loom-render\/captures\/"\)/);
  assert.match(captureWebView, /return false\s*\/\/ preserve in-webview capture detail navigation/);
  assert.match(captureWebView, /private static func firstScrollView\(in view: NSView\) -> NSScrollView\?/);
  assert.match(captureWebView, /private static func configureNativeScrolling\(for webView: WKWebView\)/);
  assert.match(captureWebView, /scrollView\.hasVerticalScroller = true/);
  assert.match(captureWebView, /scrollView\.verticalScrollElasticity = \.allowed/);
  assert.match(captureWebView, /DispatchQueue\.main\.async \{\s*\n\s*Self\.configureNativeScrolling\(for: webView\)/);
  assert.match(captureWebView, /if shouldLoadTarget\(url, current: webView\.url\) \{/);
  assert.match(captureWebView, /Self\.isCaptureDetailPath\(current\.path\)/);
  assert.doesNotMatch(captureWebView, /if webView\.url != url \{\s*\n\s*webView\.load\(URLRequest\(url: url\)\)/);
});

test('capture delete failures are visible instead of console-only', () => {
  const captureWebView = read('macos-app/Loom/Sources/CaptureWebView.swift');

  assert.match(captureWebView, /let alert = NSAlert\(\)/);
  assert.match(captureWebView, /alert\.messageText = "Could not delete capture"/);
  assert.match(captureWebView, /alert\.informativeText = error\.localizedDescription/);
  assert.match(captureWebView, /alert\.runModal\(\)/);
});

test('capture URL activation restores cross-space window behavior after burst clicks', () => {
  const appDelegate = read('macos-app/Loom/Sources/LoomApp.swift');

  assert.match(appDelegate, /private var captureSpaceRestoreBehavior: NSWindow\.CollectionBehavior\?/);
  assert.match(appDelegate, /private var captureSpaceRestoreToken: UUID\?/);
  assert.match(appDelegate, /originalBehavior\.remove\(\.canJoinAllSpaces\)/);
  assert.match(appDelegate, /captureSpaceRestoreToken = token/);
  assert.match(appDelegate, /guard let self, self\.captureSpaceRestoreToken == token else \{ return \}/);
  assert.match(appDelegate, /window\?\.collectionBehavior = originalBehavior/);
  assert.match(appDelegate, /self\.captureSpaceRestoreBehavior = nil/);
});

test('capture rows open Loom reader first when a stored snapshot is available', () => {
  const capturesPage = read('app/loom-render/captures/page.tsx');

  assert.match(capturesPage, /const readerHref = useMemo/);
  assert.match(capturesPage, /filename: entry\.snapshotFilename,\s*\n\s*title: entry\.title,\s*\n\s*eyebrow: entry\.eyebrow,/);
  assert.match(capturesPage, /const primaryHref = readerHref/);
  assert.match(capturesPage, /href=\{primaryHref\}/);
  assert.match(capturesPage, /href=\{snapshotHref\}/);
  assert.match(capturesPage, /aria-label="Open source snapshot"/);
});

test('captures date groups default open enough rows to avoid an empty-looking landing page', () => {
  const capturesPage = read('app/loom-render/captures/page.tsx');

  assert.match(capturesPage, /captures\.layout\.v2\./);
  assert.match(capturesPage, /\.sort\(\(\[a\], \[b\]\) => meta\[a\]\.sortKey - meta\[b\]\.sortKey\)/);
  assert.match(capturesPage, /defaultOpen: group\.defaultOpen \|\| index < 3/);
});
