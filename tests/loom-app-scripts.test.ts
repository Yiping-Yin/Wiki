import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  buildInstallFailure,
  isPermissionFallbackError,
} from '../scripts/install-loom-app.mjs';
import {
  createDittoArchiveArgs,
  findPackageSourceApp,
  packageLoomApp,
  resolveOutputRoot,
} from '../scripts/package-loom-app.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

test('package script falls back to the installed app after install cleanup removes DerivedData app', async () => {
  const tempRoot = fs.mkdtempSync(path.join(tmpdir(), 'loom-installed-app-test-'));

  try {
    const installedRoot = path.join(tempRoot, 'Applications');
    const appPath = path.join(installedRoot, 'Loom.app');
    fs.mkdirSync(path.join(appPath, 'Contents'), { recursive: true });

    const found = await findPackageSourceApp({
      derivedDataRoot: path.join(tempRoot, 'DerivedData'),
      applicationRoots: [installedRoot],
    });

    assert.equal(found, appPath);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('package script skips the retired runtime archive when no runtime is staged', () => {
  const tempRoot = fs.mkdtempSync(path.join(tmpdir(), 'loom-package-test-'));

  try {
    const appPath = path.join(tempRoot, 'Loom.app');
    fs.mkdirSync(path.join(appPath, 'Contents', 'Resources', 'web'), { recursive: true });
    fs.writeFileSync(path.join(appPath, 'Contents', 'Info.plist'), '<plist version="1.0"></plist>');
    fs.writeFileSync(path.join(appPath, 'Contents', 'Resources', 'web', 'index.html'), '<!doctype html>');

    const outputRoot = path.join(tempRoot, 'output');
    const result = packageLoomApp({
      appPath,
      runtimeRoot: null,
      outputRoot,
      contentRoot: tempRoot,
    });

    assert.equal(result.appArchivePath, path.join(outputRoot, 'Loom-replacement.zip'));
    assert.equal(result.runtimeArchivePath, null);
    assert.equal(fs.existsSync(result.appArchivePath), true);
    assert.equal(fs.existsSync(path.join(outputRoot, 'Loom-runtime.zip')), false);

    const readme = fs.readFileSync(path.join(outputRoot, 'INSTALL-LOOM.txt'), 'utf8');
    assert.match(readme, /Resources\/web/);
    assert.match(readme, /Runtime archive: not produced/);
    assert.doesNotMatch(readme, /runtime\/current\.json/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('package script creates clean archives without AppleDouble metadata', () => {
  const args = createDittoArchiveArgs('/tmp/Loom.app', '/tmp/Loom-replacement.zip');

  assert.deepEqual(args, [
    '-c',
    '-k',
    '--norsrc',
    '--noextattr',
    '--keepParent',
    '/tmp/Loom.app',
    '/tmp/Loom-replacement.zip',
  ]);
  assert.equal(args.includes('--sequesterRsrc'), false);
});

test('release app scripts build the static export before Xcode Release packaging', () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(path.resolve(__dirname, '..'), 'package.json'), 'utf8'),
  ) as { scripts?: Record<string, string> };
  const buildInstallSource = fs.readFileSync(
    path.join(path.resolve(__dirname, '..'), 'scripts', 'build-install-loom-app.mjs'),
    'utf8',
  );

  assert.equal(pkg.scripts?.['app:package'], 'node scripts/package-loom-app.mjs');
  assert.equal(pkg.scripts?.['app'], 'node scripts/build-install-loom-app.mjs auto');
  assert.equal(pkg.scripts?.['app:user'], 'node scripts/build-install-loom-app.mjs user');
  assert.equal(pkg.scripts?.['app:system'], 'node scripts/build-install-loom-app.mjs system');

  const exportIndex: number = buildInstallSource.indexOf('scripts/build-static-export.mjs');
  const xcodeIndex: number = buildInstallSource.indexOf("run('xcodebuild'");
  const installIndex: number = buildInstallSource.indexOf('scripts/install-loom-app.mjs');
  const cleanIndex: number = buildInstallSource.indexOf('scripts/clean-loom-app-bundles.mjs');

  assert.notEqual(exportIndex, -1, 'build-install-loom-app.mjs must run build-static-export.mjs');
  assert.notEqual(xcodeIndex, -1, 'build-install-loom-app.mjs must run the Release Xcode build');
  assert.notEqual(installIndex, -1, 'build-install-loom-app.mjs must install the built app');
  assert.notEqual(cleanIndex, -1, 'build-install-loom-app.mjs must clean DerivedData app bundles');
  assert.equal(exportIndex < xcodeIndex, true, 'static export must run before xcodebuild');
  assert.equal(xcodeIndex < installIndex, true, 'xcodebuild must run before install');
  assert.equal(buildInstallSource.includes('finally'), true, 'cleanup must run after failures too');
  assert.doesNotMatch(buildInstallSource, /cd\s+macos-app\/Loom|cd\s+\.\.\/\.\./);
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
