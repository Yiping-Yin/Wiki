import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  buildInstallFailure,
  installRuntimeMetadata,
  isPermissionFallbackError,
} from '../scripts/install-loom-app.mjs';
import { runInstalledAppSmoke } from '../scripts/installed-app-smoke.mjs';
import { assertNoStaleBuildArtifacts, findStaleBuildArtifacts, removeDuplicateArtifacts } from '../scripts/next-build-lock.mjs';
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

test('install script preserves an existing user-selected content root', async () => {
  const homeRoot = fs.mkdtempSync(path.join(tmpdir(), 'loom-install-home-'));
  const appSupport = path.join(homeRoot, 'Library', 'Application Support', 'Loom');
  const pickedRoot = path.join(homeRoot, 'Knowledge', 'INFS 3822');

  try {
    fs.mkdirSync(appSupport, { recursive: true });
    fs.writeFileSync(
      path.join(appSupport, 'content-root.json'),
      JSON.stringify({ contentRoot: pickedRoot }, null, 2),
      'utf8',
    );

    await installRuntimeMetadata({ repoRoot: '/repo/Wiki', homeOverride: homeRoot, env: { NODE_ENV: 'test' } });

    const persisted = JSON.parse(
      fs.readFileSync(path.join(appSupport, 'content-root.json'), 'utf8'),
    ) as { contentRoot?: string };
    assert.equal(persisted.contentRoot, pickedRoot);
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
});

test('install script initializes content root only when no user selection exists', async () => {
  const homeRoot = fs.mkdtempSync(path.join(tmpdir(), 'loom-install-home-'));
  const appSupport = path.join(homeRoot, 'Library', 'Application Support', 'Loom');

  try {
    await installRuntimeMetadata({ repoRoot: '/repo/Wiki', homeOverride: homeRoot, env: { NODE_ENV: 'test' } });

    const persisted = JSON.parse(
      fs.readFileSync(path.join(appSupport, 'content-root.json'), 'utf8'),
    ) as { contentRoot?: string };
    assert.equal(persisted.contentRoot, '/repo/Wiki');
  } finally {
    fs.rmSync(homeRoot, { recursive: true, force: true });
  }
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
    const archiveCalls: Array<{ sourcePath: string; archivePath: string }> = [];
    const result = packageLoomApp({
      appPath,
      runtimeRoot: null,
      outputRoot,
      contentRoot: tempRoot,
      archiveFile: (sourcePath, archivePath) => {
        archiveCalls.push({ sourcePath, archivePath });
        fs.writeFileSync(archivePath, `archive:${sourcePath}`);
      },
    });

    assert.equal(result.appArchivePath, path.join(outputRoot, 'Loom-replacement.zip'));
    assert.equal(result.runtimeArchivePath, null);
    assert.deepEqual(archiveCalls, [{ sourcePath: appPath, archivePath: result.appArchivePath }]);
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

test('build cleanup removes macOS metadata and Finder duplicate artifacts recursively', async () => {
  const tempRoot = fs.mkdtempSync(path.join(tmpdir(), 'loom-stale-artifacts-'));

  try {
    fs.mkdirSync(path.join(tempRoot, 'nested'), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, 'index.html'), '<!doctype html>');
    fs.writeFileSync(path.join(tempRoot, '.DS_Store'), 'finder metadata');
    fs.writeFileSync(path.join(tempRoot, 'chunk 2.js'), 'duplicate chunk');
    fs.writeFileSync(path.join(tempRoot, 'nested', '._index.html'), 'appledouble metadata');
    fs.writeFileSync(path.join(tempRoot, 'nested', 'style 12.css'), 'duplicate stylesheet');

    await removeDuplicateArtifacts(tempRoot);

    assert.equal(fs.existsSync(path.join(tempRoot, 'index.html')), true);
    assert.equal(fs.existsSync(path.join(tempRoot, '.DS_Store')), false);
    assert.equal(fs.existsSync(path.join(tempRoot, 'chunk 2.js')), false);
    assert.equal(fs.existsSync(path.join(tempRoot, 'nested', '._index.html')), false);
    assert.equal(fs.existsSync(path.join(tempRoot, 'nested', 'style 12.css')), false);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('build cleanup exposes stale artifacts for release gates', async () => {
  const tempRoot = fs.mkdtempSync(path.join(tmpdir(), 'loom-stale-artifacts-gate-'));

  try {
    fs.mkdirSync(path.join(tempRoot, 'nested 2'), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, 'index.html'), '<!doctype html>');
    fs.writeFileSync(path.join(tempRoot, 'search-index 3.json'), '{}');

    const stale = await findStaleBuildArtifacts(tempRoot);

    assert.deepEqual(stale.sort(), [
      path.join(tempRoot, 'nested 2'),
      path.join(tempRoot, 'search-index 3.json'),
    ].sort());
    await assert.rejects(
      () => assertNoStaleBuildArtifacts(tempRoot, 'test export'),
      /stale macOS\/Finder build artifacts remain in test export/,
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('build cleanup fails loudly when stale artifacts cannot be removed', async () => {
  const tempRoot = fs.mkdtempSync(path.join(tmpdir(), 'loom-stale-artifacts-locked-'));

  try {
    fs.writeFileSync(path.join(tempRoot, '.DS_Store'), 'finder metadata');
    fs.chmodSync(tempRoot, 0o500);

    await assert.rejects(
      () => removeDuplicateArtifacts(tempRoot),
      /failed to remove stale macOS\/Finder build artifacts/,
    );
  } finally {
    fs.chmodSync(tempRoot, 0o700);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('installed app smoke rejects stale macOS metadata in bundled web resources', async () => {
  const tempRoot = fs.mkdtempSync(path.join(tmpdir(), 'loom-installed-stale-web-'));
  const previousSkipCodesign = process.env.LOOM_SMOKE_SKIP_CODESIGN;

  try {
    const appPath = path.join(tempRoot, 'Loom.app');
    const contents = path.join(appPath, 'Contents');
    const resources = path.join(contents, 'Resources');
    const webRoot = path.join(resources, 'web');

    fs.mkdirSync(path.join(contents, 'MacOS'), { recursive: true });
    fs.mkdirSync(webRoot, { recursive: true });
    fs.writeFileSync(path.join(contents, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key>
  <string>com.yinyiping.loom</string>
  <key>CFBundleDisplayName</key>
  <string>Loom</string>
</dict>
</plist>
`, 'utf8');
    fs.writeFileSync(path.join(contents, 'MacOS', 'Loom'), 'binary');
    fs.writeFileSync(path.join(resources, 'PrivacyInfo.xcprivacy'), '<plist version="1.0"></plist>');
    fs.writeFileSync(path.join(webRoot, 'index.html'), '<!doctype html><script src="/_next/static/chunk.js"></script>');
    fs.writeFileSync(path.join(webRoot, 'desk.html'), '<!doctype html>');
    fs.writeFileSync(path.join(webRoot, 'knowledge.html'), '<!doctype html>');
    fs.writeFileSync(path.join(webRoot, 'search-index.json'), '{}');
    for (let index = 0; index < 55; index += 1) {
      fs.writeFileSync(path.join(webRoot, `asset-${index}.txt`), 'asset');
    }
    fs.writeFileSync(path.join(webRoot, '.DS_Store'), 'finder metadata');

    process.env.LOOM_SMOKE_SKIP_CODESIGN = '1';

    await assert.rejects(
      () => runInstalledAppSmoke({ appPath }),
      /stale macOS\/Finder artifacts: \.DS_Store/,
    );
  } finally {
    if (previousSkipCodesign === undefined) {
      delete process.env.LOOM_SMOKE_SKIP_CODESIGN;
    } else {
      process.env.LOOM_SMOKE_SKIP_CODESIGN = previousSkipCodesign;
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
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
  assert.match(buildInstallSource, /assertNoStaleBuildArtifacts\(path\.join\(repoRoot, '\.next-export'\), '\.next-export after static export'\)/);
  assert.match(buildInstallSource, /assertNoStaleBuildArtifacts\(path\.join\(repoRoot, '\.next-export'\), '\.next-export after Xcode staging'\)/);
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
