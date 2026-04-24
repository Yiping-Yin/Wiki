import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const repoRoot = path.resolve(__dirname, '..');

test('app store copy stays aligned with Phase 6 bundle and subtitle constraints', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'docs', 'app-store-copy.md'), 'utf8');

  assert.match(source, /Bundle ID: `com\.yinyiping\.loom`/);
  assert.doesNotMatch(source, /com\.loom\.app/);
  assert.match(source, /Subtitle: A screen that replaces paper/);
  assert.match(source, /28 characters/);
  assert.match(source, /2880 x 1800/);
  assert.match(source, /developer\.apple\.com\/help\/app-store-connect\/reference\/app-information\/screenshot-specifications/);
});

test('public privacy page names the sandboxed app identifiers', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'public', 'privacy.html'), 'utf8');

  assert.match(source, /com\.yinyiping\.loom/);
  assert.match(source, /Last updated 2026-04-24/);
  assert.doesNotMatch(source, /com\.loom\.app/);
});

test('screenshot script defaults to Mac App Store dimensions and configurable inputs', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as {
    scripts?: Record<string, string>;
  };
  const source = fs.readFileSync(path.join(repoRoot, 'scripts', 'app-store-screenshots.mjs'), 'utf8');
  const gitignore = fs.readFileSync(path.join(repoRoot, '.gitignore'), 'utf8');

  assert.equal(pkg.scripts?.['app:screenshots'], 'node scripts/app-store-screenshots.mjs');
  assert.match(source, /LOOM_SCREENSHOT_WIDTH \?\? 2880/);
  assert.match(source, /LOOM_SCREENSHOT_HEIGHT \?\? 1800/);
  assert.match(source, /LOOM_SCREENSHOT_SCALE \?\? 2/);
  assert.match(source, /const WIDTH = Math\.round\(OUT_WIDTH \/ SCALE\)/);
  assert.match(source, /const HEIGHT = Math\.round\(OUT_HEIGHT \/ SCALE\)/);
  assert.match(source, /\.app-store\/screenshots/);
  assert.match(source, /deviceScaleFactor: SCALE/);
  assert.match(gitignore, /^\.app-store\/$/m);
});
