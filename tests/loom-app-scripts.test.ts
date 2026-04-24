import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import {
  buildInstallFailure,
  isPermissionFallbackError,
} from '../scripts/install-loom-app.mjs';
import { resolveOutputRoot } from '../scripts/package-loom-app.mjs';

test('install script treats ditto permission stderr as fallback-eligible', () => {
  const error = buildInstallFailure(1, 'ditto: /Applications/Loom.app: Permission denied\n') as Error & { code?: string };

  assert.equal(error.code, 'EACCES');
  assert.equal(isPermissionFallbackError(error), true);
});

test('install script does not classify generic ditto failures as permission fallbacks', () => {
  const error = buildInstallFailure(1, 'ditto: some unrelated failure\n') as Error & { code?: string };

  assert.equal(isPermissionFallbackError(error), false);
});

test('package script resolves output under the repository root instead of a machine-specific path', () => {
  const fakeScriptUrl = pathToFileURL(
    path.join('/tmp', 'workspace', 'Wiki', 'scripts', 'package-loom-app.mjs'),
  ).href;

  assert.equal(
    resolveOutputRoot(fakeScriptUrl),
    path.join('/tmp', 'workspace', 'Wiki', 'output'),
  );
});

test('release app scripts build the static export before Xcode Release packaging', () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(path.resolve(__dirname, '..'), 'package.json'), 'utf8'),
  ) as { scripts?: Record<string, string> };

  for (const name of ['app', 'app:user', 'app:system']) {
    const script = pkg.scripts?.[name] ?? '';
    const exportIndex = script.indexOf('node scripts/build-static-export.mjs');
    const xcodeIndex = script.indexOf('xcodebuild -project Loom.xcodeproj -scheme Loom -configuration Release build');

    assert.notEqual(exportIndex, -1, `${name} must run build-static-export.mjs`);
    assert.notEqual(xcodeIndex, -1, `${name} must run the Release Xcode build`);
    assert.equal(exportIndex < xcodeIndex, true, `${name} must export before xcodebuild`);
  }
});

test('installed app smoke is sandbox-compatible and does not call CLI AI', () => {
  const repoRoot = path.resolve(__dirname, '..');
  const pkg = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'),
  ) as { scripts?: Record<string, string> };
  const source = fs.readFileSync(path.join(repoRoot, 'scripts', 'installed-app-smoke.mjs'), 'utf8');

  assert.equal(pkg.scripts?.['app:smoke'], 'node scripts/installed-app-smoke.mjs');
  assert.match(source, /com\.yinyiping\.loom/);
  assert.match(source, /Resources/);
  assert.match(source, /index\.html/);
  assert.match(source, /PrivacyInfo\.xcprivacy/);
  assert.match(source, /com\.apple\.security\.app-sandbox/);
  assert.match(source, /codesign/);
  assert.doesNotMatch(source, /CODEX_BIN|CLAUDE_BIN|\/api\/chat|server\.js/);
});

test('Release Xcode bundle staging fails when the static export is missing', () => {
  const spec = fs.readFileSync(
    path.join(path.resolve(__dirname, '..'), 'macos-app', 'Loom', 'project.yml'),
    'utf8',
  );

  assert.match(spec, /CONFIGURATION:-/);
  assert.match(spec, /Release/);
  assert.match(spec, /exit 1/);
  assert.match(spec, /build-static-export\.mjs/);
});
