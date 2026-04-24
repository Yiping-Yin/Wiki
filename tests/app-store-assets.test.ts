import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('app store copy stays aligned with Phase 6 bundle and subtitle constraints', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'docs', 'app-store-copy.md'), 'utf8');

  assert.match(source, /Bundle ID: `com\.yinyiping\.loom`/);
  assert.doesNotMatch(source, /com\.loom\.app/);
  assert.match(source, /Subtitle: A screen that replaces paper/);
  assert.match(source, /28 characters/);
  assert.match(source, /Privacy Policy URL: `https:\/\/loom\.app\/privacy\.html`/);
  assert.match(source, /Support URL: `https:\/\/loom\.app\/support\.html`/);
  assert.match(source, /2880 x 1800/);
  assert.match(source, /Default screenshot format: JPEG/);
  for (const label of ['Library', 'Home', 'S\u014dan', 'Patterns', 'Frontispiece']) {
    assert.match(source, new RegExp(`- ${label}:`));
  }
  assert.doesNotMatch(source, /Knowledge docs:/);
  assert.match(source, /developer\.apple\.com\/help\/app-store-connect\/reference\/app-information\/screenshot-specifications/);
});

test('public privacy page names the sandboxed app identifiers', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'public', 'privacy.html'), 'utf8');

  assert.match(source, /com\.yinyiping\.loom/);
  assert.match(source, /Last updated 2026-04-24/);
  assert.match(source, /There is no Loom analytics service/);
  assert.match(source, /\/support\.html/);
  assert.doesNotMatch(source, /com\.loom\.app/);
});

test('public support page gives App Store reviewers a concrete support URL', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'public', 'support.html'), 'utf8');

  assert.match(source, /Loom Support/);
  assert.match(source, /com\.yinyiping\.loom/);
  assert.match(source, /github\.com\/Yiping-Yin\/Wiki\/issues/);
  assert.match(source, /\/privacy\.html/);
  assert.match(source, /Last updated 2026-04-24/);
});

test('screenshot script defaults to Mac App Store dimensions and configurable inputs', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as {
    scripts?: Record<string, string>;
  };
  const source = fs.readFileSync(path.join(repoRoot, 'scripts', 'app-store-screenshots.mjs'), 'utf8');
  const gitignore = fs.readFileSync(path.join(repoRoot, '.gitignore'), 'utf8');

  assert.equal(pkg.scripts?.['app:screenshots'], 'node scripts/app-store-screenshots.mjs');
  assert.equal(pkg.scripts?.['app:preflight'], 'node scripts/app-store-preflight.mjs');
  assert.match(source, /LOOM_SCREENSHOT_WIDTH \?\? 2880/);
  assert.match(source, /LOOM_SCREENSHOT_HEIGHT \?\? 1800/);
  assert.match(source, /LOOM_SCREENSHOT_SCALE \?\? 2/);
  assert.match(source, /LOOM_SCREENSHOT_FORMAT \?\? 'jpeg'/);
  assert.match(source, /LOOM_SCREENSHOT_QUALITY \?\? 86/);
  assert.match(source, /const WIDTH = Math\.round\(OUT_WIDTH \/ SCALE\)/);
  assert.match(source, /const HEIGHT = Math\.round\(OUT_HEIGHT \/ SCALE\)/);
  assert.match(source, /\.app-store\/screenshots/);
  assert.match(source, /slug: '01-library',\s+url: '\/desk'/);
  assert.match(source, /slug: '03-draft',\s+url: '\/soan'/);
  assert.doesNotMatch(source, /url: '\/knowledge'/);
  assert.match(source, /sessionStorage\.setItem\('loom:ai-key-banner-dismissed', '1'\)/);
  assert.match(source, /nextjs-portal/);
  assert.match(source, /deviceScaleFactor: SCALE/);
  assert.match(gitignore, /^\.app-store\/$/m);
});

test('app store preflight covers submission artifacts', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'scripts', 'app-store-preflight.mjs'), 'utf8');

  for (const expected of [
    '01-library.jpg',
    '03-draft.jpg',
    '05-frontispiece.jpg',
    'jpegSize',
    'PrivacyInfo.xcprivacy',
    'public/privacy.html',
    'public/support.html',
    'com\\.apple\\.security\\.app-sandbox',
    'NSPrivacyTracking',
    'NSPrivacyCollectedDataTypeOtherUserContent',
  ]) {
    assert.match(source, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
