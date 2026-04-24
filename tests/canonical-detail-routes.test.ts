import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('canonical fixed detail routes exist for pursuits and panels', () => {
  assert.ok(fs.existsSync(path.join(repoRoot, 'app/panel/page.tsx')));
  assert.ok(fs.existsSync(path.join(repoRoot, 'app/pursuit/page.tsx')));
  assert.ok(fs.existsSync(path.join(repoRoot, 'app/panel/[id]/page.tsx')));
  assert.ok(fs.existsSync(path.join(repoRoot, 'app/pursuit/[id]/page.tsx')));
});

test('patterns, pursuits, shuttle, and pursuit-detail link to canonical fixed detail routes', () => {
  const patterns = read('app/PatternsClient.tsx');
  const pursuits = read('app/PursuitsClient.tsx');
  const pursuitDetail = read('app/PursuitDetailClient.tsx');
  const shuttle = read('macos-app/Loom/Sources/ShuttleView.swift');

  assert.match(patterns, /\/panel\/\$\{encodeURIComponent\(focusId\)\}/);
  assert.doesNotMatch(patterns, /\/panel\?panelId=/);
  assert.doesNotMatch(patterns, /\/panels\//);

  assert.match(pursuits, /\/pursuit\/\$\{encodeURIComponent\(pursuit\.id\)\}/);
  assert.doesNotMatch(pursuits, /\/pursuit\?pursuitId=/);
  assert.doesNotMatch(pursuits, /\/pursuits\/\$\{pursuit\.id\}/);

  assert.match(pursuitDetail, /\/panel\/\$\{encodeURIComponent\(panel\.id\)\}/);
  assert.doesNotMatch(pursuitDetail, /\/panel\?panelId=/);
  assert.doesNotMatch(pursuitDetail, /\/weaves\?focus=/);

  assert.match(shuttle, /userInfo: \["path": "\/pursuit\/\\\(encode\(p\.id\)\)"\]/);
  assert.match(shuttle, /userInfo: \["path": "\/panel\/\\\(encode\(p\.id\)\)"\]/);
  assert.doesNotMatch(shuttle, /\/pursuit\?pursuitId=/);
  assert.doesNotMatch(shuttle, /\/panel\?panelId=/);
});
