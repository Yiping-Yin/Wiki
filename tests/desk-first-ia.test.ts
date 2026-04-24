import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('Desk becomes the shelf-first home and Atlas routes degrade to Desk', () => {
  const deskPage = read('app/desk/DeskPage.tsx');
  const atlasPage = read('app/atlas/page.tsx');
  const atlasShelfPage = read('app/atlas/shelf/page.tsx');

  assert.match(deskPage, /AtlasClient/);
  assert.match(deskPage, /TodayClient/);
  assert.match(atlasPage, /redirect\('\/desk'\)/);
  assert.match(atlasShelfPage, /redirect\('\/desk'\)/);
});

test('native sidebar demotes Sources from Workspaces into Desk content sections', () => {
  const sidebar = read('macos-app/Loom/Sources/KnowledgeSidebarView.swift');
  const app = read('macos-app/Loom/Sources/LoomApp.swift');
  const help = read('macos-app/Loom/Sources/KeyboardHelpView.swift');
  const shuttle = read('macos-app/Loom/Sources/ShuttleView.swift');

  assert.match(sidebar, /static let workspaces: \[WorkspaceLink\] = \[/);
  assert.match(sidebar, /label: "Desk"[\s\S]*href: "\/desk"/);
  assert.doesNotMatch(sidebar, /\.init\(id: "sources",\s+label: "Sources"/);
  assert.match(sidebar, /sectionHeader\("Sources", destination: "\/sources"/);
  assert.match(sidebar, /sectionHeader\("LLM Wiki", destination: "\/llm-wiki"/);
  assert.ok(!sidebar.includes("return \"Sources · \\(rootDisplayName)\""));
  assert.match(sidebar, /link\.href == "\/desk"[\s\S]*isDeskContentPath\(currentHref\)/);

  assert.doesNotMatch(app, /postNav\("\/sources"\)/);
  assert.doesNotMatch(app, /Button\("Atlas"\)/);
  assert.match(app, /Button\("Patterns"\)/);

  assert.doesNotMatch(help, /\.init\(keys: "⌘4", label: "Sources"/);
  assert.doesNotMatch(help, /label: "Atlas — sources and wiki"/);
  assert.match(help, /keys: "⌘4", label: "Patterns/);

  assert.match(shuttle, /label: "Sources"[\s\S]*path: "\/sources"/);
});
