import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('static-export-safe doc route exists for native source reading', () => {
  assert.ok(fs.existsSync(path.join(repoRoot, 'app/doc/page.tsx')));
  assert.ok(fs.existsSync(path.join(repoRoot, 'app/DocClient.tsx')));
  assert.ok(fs.existsSync(path.join(repoRoot, 'app/collection/page.tsx')));
  assert.ok(fs.existsSync(path.join(repoRoot, 'app/CollectionClient.tsx')));
});

test('native ContentView rewrites source-doc bundle navigations onto /doc?href=', () => {
  const source = read('macos-app/Loom/Sources/ContentView.swift');

  assert.match(source, /flatDocPathIfNeeded/);
  assert.match(source, /components\.path = "\/doc"/);
  assert.match(source, /URLQueryItem\(name: "href", value: relative\)/);
  assert.match(source, /url\.host == "bundle"/);
  assert.match(source, /let routed = Self\.flatDocPathIfNeeded\(relative\)/);
  assert.match(source, /if routed != relative, let target = Self\.bundleURL\(for: relative\)/);
});

test('native ContentView keeps static-export fallback shells for path-based panel and pursuit urls', () => {
  const source = read('macos-app/Loom/Sources/ContentView.swift');
  const exportScript = read('scripts/build-static-export.mjs');

  assert.match(source, /if path\.hasPrefix\("\/panel\/"\), path\.count > "\/panel\/"\.count/);
  assert.match(source, /URLQueryItem\(name: "panelId", value: id\)/);
  assert.match(source, /if path\.hasPrefix\("\/pursuit\/"\), path\.count > "\/pursuit\/"\.count/);
  assert.match(source, /URLQueryItem\(name: "pursuitId", value: id\)/);
  assert.match(exportScript, /'app\/panel\/\[id\]'/);
  assert.match(exportScript, /'app\/pursuit\/\[id\]'/);
});

test('native ContentView rewrites source collection routes onto /collection?slug=', () => {
  const source = read('macos-app/Loom/Sources/ContentView.swift');

  assert.match(source, /if path\.hasPrefix\("\/knowledge\/"\)/);
  assert.match(source, /if parts\.count == 2 \{/);
  assert.match(source, /components\.path = "\/collection"/);
  assert.match(source, /URLQueryItem\(name: "slug", value: parts\[1\]\)/);
  assert.match(source, /if parts\[2\] == "cowork" \{/);
});

test('collection route reads manifests directly from loom://content and not mirrored native web state', () => {
  const collectionClient = read('app/CollectionClient.tsx');
  const contentView = read('macos-app/Loom/Sources/ContentView.swift');

  assert.match(collectionClient, /const NAV_URL = 'loom:\/\/content\/knowledge\/\.cache\/manifest\/knowledge-nav\.json'/);
  assert.match(collectionClient, /const MANIFEST_URL = 'loom:\/\/content\/knowledge\/\.cache\/manifest\/knowledge-manifest\.json'/);
  assert.doesNotMatch(collectionClient, /readLoomMirror|subscribeLoomMirror|loom\.knowledge\.nav\.v1|loom\.knowledge\.manifest\.v1/);
  assert.doesNotMatch(contentView, /knowledgeNavStorageKey|knowledgeManifestStorageKey|knowledgeMirrorEventName|mirrorKnowledgeToWebview|handleKnowledgeMirrorChanged/);
});
