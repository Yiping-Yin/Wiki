import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('native pursuits payload includes concrete source and panel attachment items', () => {
  const sourceText = read('macos-app/Loom/Sources/ContentView.swift');

  assert.match(sourceText, /"sourceItems":/);
  assert.match(sourceText, /"panelItems":/);
});

test('PursuitDetailClient renders attached sources and panels from native pursuit records rather than stub pools', () => {
  const sourceText = read('app/PursuitDetailClient.tsx');

  assert.doesNotMatch(sourceText, /function stubSourcesFor/);
  assert.doesNotMatch(sourceText, /function stubPanelsFor/);
  assert.match(sourceText, /const sources = pursuit\.sourceItems \?\? \[\]/);
  assert.match(sourceText, /const panels = pursuit\.panelItems \?\? \[\]/);
});
