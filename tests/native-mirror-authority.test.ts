import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('native ContentView exposes core objects through loom://native endpoints without mirrored web state', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'macos-app/Loom/Sources/ContentView.swift'),
    'utf8',
  );

  assert.doesNotMatch(source, /window\.__loomNativeStore = window\.__loomNativeStore \|\| \{\};/);
  assert.doesNotMatch(source, /window\.__loomNativeStore\[/);
  assert.match(source, /delete window\.__loomNativeStore/);
  assert.match(source, /dispatchNativeProjectionChanged\(storageKey: String, eventName: String\)/);
  assert.ok(source.includes("window.dispatchEvent(new CustomEvent('\\(escapedEvent)'));"));
  assert.ok(source.includes("localStorage.removeItem('\\(escapedKey)')"));
  assert.match(source, /purgeLegacyMirrorStorageInWebview\(\)/);
  assert.match(source, /static let legacyMirrorStorageKeys = \[/);
  assert.match(source, /initialMirrorBootstrapScript\(\)/);
  assert.match(source, /addUserScript\([\s\S]*injectionTime: \.atDocumentStart/);

  assert.doesNotMatch(source, /localStorage\.setItem\('\\\(Coordinator\.panelsStorageKey\\\)'/);
  assert.doesNotMatch(source, /localStorage\.setItem\('\\\(Coordinator\.pursuitsStorageKey\\\)'/);
  assert.doesNotMatch(source, /localStorage\.setItem\('\\\(Coordinator\.soanStorageKey\\\)'/);
  assert.doesNotMatch(source, /localStorage\.setItem\('\\\(Coordinator\.weavesStorageKey\\\)'/);
  assert.doesNotMatch(source, /localStorage\.setItem\('\\\(Self\.recentRecordsKey\\\)'/);
});
