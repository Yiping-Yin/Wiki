import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(__dirname, '..');

test('package exposes an installed-app smoke command', () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'),
  ) as { scripts?: Record<string, string> };

  assert.equal(pkg.scripts?.['app:smoke'], 'tsx scripts/installed-app-smoke.ts');
});

test('installed app smoke uses the staged runtime with isolated content and knowledge roots', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'scripts', 'installed-app-smoke.ts'),
    'utf8',
  );

  assert.match(source, /resolveActiveRuntimeRoot/);
  assert.match(source, /LOOM_EXECUTION_ROOT/);
  assert.match(source, /LOOM_CONTENT_ROOT/);
  assert.match(source, /LOOM_KNOWLEDGE_ROOT/);
  assert.match(source, /mkdtemp/);
  assert.match(source, /server\.js/);
});

test('installed app smoke verifies health, AI chat, topic creation, and capture writeback', () => {
  const source = fs.readFileSync(
    path.join(repoRoot, 'scripts', 'installed-app-smoke.ts'),
    'utf8',
  );

  assert.match(source, /\/api\/health/);
  assert.match(source, /\/api\/ai-health/);
  assert.match(source, /\/api\/chat/);
  assert.match(source, /\/api\/knowledge\/create/);
  assert.match(source, /\/api\/knowledge\/doc/);
  assert.match(source, /This topic is still empty/);
  assert.match(source, /Organize into note/);
});
