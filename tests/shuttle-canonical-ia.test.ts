import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function assertOrdered(text: string, labels: string[]) {
  let previous = -1;
  for (const label of labels) {
    const current = text.indexOf(label);
    assert.notEqual(current, -1, `missing ordered marker: ${label}`);
    assert.ok(current > previous, `${label} appears out of order`);
    previous = current;
  }
}

test('primary native navigation uses the canonical vocabulary', () => {
  const shuttle = read('macos-app/Loom/Sources/ShuttleView.swift');
  const sidebar = read('macos-app/Loom/Sources/KnowledgeSidebarView.swift');
  const app = read('macos-app/Loom/Sources/LoomApp.swift');
  const help = read('macos-app/Loom/Sources/KeyboardHelpView.swift');

  assert.match(shuttle, /label: "Desk"/);
  assert.match(shuttle, /path: "\/desk"/);
  assert.match(shuttle, /label: "Sources"[\s\S]*path: "\/sources"[\s\S]*keywords: \[[^\]]*"atlas"[^\]]*"browse"[^\]]*"knowledge"/);
  assert.match(shuttle, /label: "Weaves"[\s\S]*keywords: \[[^\]]*"relations"/);
  assert.match(sidebar, /label: "Desk"/);
  assert.match(sidebar, /href: "\/desk"/);
  assert.match(sidebar, /private var deskContentRows/);
  assert.match(sidebar, /label: "Sources"[\s\S]*destination: "\/sources"[\s\S]*isPrimary: true/);
  assert.match(sidebar, /label: "Reference"[\s\S]*detail: "LLM Wiki"[\s\S]*destination: "\/llm-wiki"[\s\S]*isPrimary: false/);
  assert.doesNotMatch(sidebar, /sectionHeader\("Sources"/);
  assert.doesNotMatch(sidebar, /sectionHeader\("LLM Wiki"/);
  assert.match(sidebar, /label: "Weaves"/);
  assert.match(sidebar, /href: "\/weaves"/);
  assert.match(app, /Button\("Desk"\)/);
  assert.match(app, /Button\("Patterns"\)/);
  assert.match(app, /Button\("Weaves"\)/);
  assert.match(help, /label: "Desk"/);
  assert.match(help, /label: "Patterns/);
  assert.match(help, /label: "Weaves — the constellation"/);

  assert.doesNotMatch(shuttle, /label: "Knowledge"/);
  assert.doesNotMatch(shuttle, /label: "Browse"/);
  assert.doesNotMatch(shuttle, /label: "Today"/);
  assert.doesNotMatch(shuttle, /label: "Relations"/);
  assert.doesNotMatch(shuttle, /label: "Atlas"/);
  assert.doesNotMatch(sidebar, /label: "Today"/);
  assert.doesNotMatch(sidebar, /label: "Relations"/);
  assert.doesNotMatch(sidebar, /label: "Browse"/);
  assert.doesNotMatch(sidebar, /\.init\(id: "sources",\s+label: "Sources"/);
  assert.doesNotMatch(sidebar, /label: "Atlas"/);
  assert.doesNotMatch(app, /postNav\("(?:\/knowledge|\/browse|\/atlas|\/sources)"\)/);
  assert.doesNotMatch(help, /\.init\(keys: "⌘4", label: "Sources"/);
});

test('native Shuttle keeps empty state command-first and active search knowledge-first', () => {
  const shuttle = read('macos-app/Loom/Sources/ShuttleView.swift');

  const filteredStart = shuttle.indexOf('private var filtered: [ShuttleHit]');
  const filteredEnd = shuttle.indexOf('var body:', filteredStart);
  const filtered = shuttle.slice(filteredStart, filteredEnd);
  const activeStart = filtered.indexOf('if activeQuery {');
  const emptyStart = filtered.indexOf('} else {', activeStart);

  assertOrdered(filtered.slice(activeStart, emptyStart), [
    'pursuitHits.map',
    'panelHits.map',
    'soanHits.map',
    'weaveHits.map',
    'docHits.map',
    'navHits.map',
  ]);
  assertOrdered(filtered.slice(emptyStart), [
    'navHits.map',
    'docHits.map',
    'pursuitHits.map',
    'panelHits.map',
    'soanHits.map',
    'weaveHits.map',
  ]);

  const resultsStart = shuttle.indexOf('private var resultsList: some View');
  const resultsEnd = shuttle.indexOf('private func sectionLabel', resultsStart);
  const resultsList = shuttle.slice(resultsStart, resultsEnd);
  const activeResultsStart = resultsList.indexOf('if activeQuery {');
  const emptyResultsStart = resultsList.indexOf('let navOffset = 0', activeResultsStart);

  assertOrdered(resultsList.slice(activeResultsStart, emptyResultsStart), [
    'sectionLabel("Pursuits")',
    'sectionLabel("Reading panels")',
    'sectionLabel("Sōan")',
    'sectionLabel("Weaves")',
    'sectionLabel("Books and sources")',
    'sectionLabel("Go to")',
  ]);
  assertOrdered(resultsList.slice(emptyResultsStart), [
    'sectionLabel("Go to")',
    'sectionLabel("Documents")',
    'sectionLabel("Pursuits")',
    'sectionLabel("Panels")',
    'sectionLabel("Sōan")',
    'sectionLabel("Weaves")',
  ]);
});
