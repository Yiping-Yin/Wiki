import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import { stageRuntimeBundle } from '../scripts/stage-loom-runtime.mjs';

const repoRoot = path.resolve(__dirname, '..');
const uploadsPageUrl = pathToFileURL(path.join(repoRoot, 'app', 'uploads', 'page.tsx')).href;
const uploadDocPageUrl = pathToFileURL(path.join(repoRoot, 'app', 'uploads', '[name]', 'page.tsx')).href;

function env(values: Record<string, string>) {
  return values as unknown as NodeJS.ProcessEnv;
}

function runIsolatedTsEval(script: string, options: { cwd?: string; env?: Record<string, string | undefined> } = {}) {
  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  for (const [key, value] of Object.entries(options.env ?? {})) {
    if (value === undefined) {
      delete childEnv[key];
      continue;
    }
    childEnv[key] = value;
  }
  return execFileSync(
    process.execPath,
    ['--import', 'tsx', '--eval', script],
    {
      cwd: repoRoot,
      env: childEnv,
      encoding: 'utf8',
    },
  ).trim();
}

test('next config can enable standalone output for loom runtime staging', () => {
  const source = readFileSync(path.join(repoRoot, 'next.config.mjs'), 'utf8');

  assert.match(source, /output:\s*process\.env\.LOOM_NEXT_OUTPUT\s*===\s*'standalone'\s*\?\s*'standalone'\s*:\s*undefined/);
});

test('build script requests standalone output for production builds', () => {
  const source = readFileSync(path.join(repoRoot, 'scripts', 'build.mjs'), 'utf8');

  assert.match(source, /LOOM_NEXT_OUTPUT:\s*'standalone'/);
});

test('build script prunes stale .next-app-dev route types before production build', () => {
  const source = readFileSync(path.join(repoRoot, 'scripts', 'build.mjs'), 'utf8');

  assert.match(source, /rmSync\(path\.join\(root, '\.next-app-dev', 'types'\), \{ recursive: true, force: true \}\)/);
});

test('build script clears stale pagefind output before regenerating search assets', () => {
  const source = readFileSync(path.join(repoRoot, 'scripts', 'build.mjs'), 'utf8');

  assert.match(source, /rmSync\(path\.join\(root, 'public', 'pagefind'\), \{ recursive: true, force: true \}\)/);
});

test('stageRuntimeBundle writes activation atomically via temp file and rename', () => {
  const source = readFileSync(path.join(repoRoot, 'scripts', 'stage-loom-runtime.mjs'), 'utf8');

  assert.match(source, /current\.json\.tmp/);
  assert.match(source, /await fs\.rename\(/);
});

test('stageRuntimeBundle writes a versioned runtime payload and updates current.json after staging', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'loom-stage-runtime-'));
  const buildRoot = path.join(root, '.next-build');
  await mkdir(path.join(buildRoot, 'standalone', '.next'), { recursive: true });
  await mkdir(path.join(buildRoot, 'static', 'chunks'), { recursive: true });
  await mkdir(path.join(root, 'public', 'assets'), { recursive: true });
  await mkdir(path.join(root, 'public', 'pagefind', 'fragment'), { recursive: true });
  await mkdir(path.join(root, 'public', 'pagefind', 'index'), { recursive: true });
  await mkdir(path.join(root, 'knowledge'), { recursive: true });
  await writeFile(path.join(buildRoot, 'BUILD_ID'), 'build-123', 'utf8');
  await writeFile(path.join(buildRoot, 'standalone', 'server.js'), 'console.log("ok")', 'utf8');
  await writeFile(path.join(buildRoot, 'static', 'chunks', 'app.js'), 'chunk', 'utf8');
  await writeFile(path.join(root, 'public', 'assets', 'logo.svg'), '<svg />', 'utf8');
  await writeFile(path.join(root, 'public', 'pagefind', 'pagefind.js'), 'export default {}', 'utf8');
  await writeFile(path.join(root, 'public', 'pagefind', 'pagefind-entry.json'), '{}', 'utf8');
  await writeFile(path.join(root, 'public', 'pagefind', 'fragment', 'en_123.pf_fragment'), 'fragment', 'utf8');
  await writeFile(path.join(root, 'public', 'pagefind', 'index', 'en_123.pf_index'), 'index', 'utf8');
  await writeFile(path.join(root, 'knowledge', 'secret.txt'), 'do not copy', 'utf8');

  const runtimeRoot = await stageRuntimeBundle({ repoRoot: root, homeOverride: root });

  assert.equal(path.basename(runtimeRoot), 'build-123');
  await stat(path.join(runtimeRoot, 'standalone', 'server.js'));
  await stat(path.join(runtimeRoot, 'standalone', '.next', 'static', 'chunks', 'app.js'));
  await stat(path.join(runtimeRoot, 'standalone', 'public', 'assets', 'logo.svg'));
  await stat(path.join(runtimeRoot, 'standalone', 'public', 'pagefind', 'pagefind.js'));
  await stat(path.join(runtimeRoot, 'standalone', 'public', 'pagefind', 'pagefind-entry.json'));
  await stat(path.join(runtimeRoot, 'standalone', 'public', 'pagefind', 'fragment', 'en_123.pf_fragment'));
  await stat(path.join(runtimeRoot, 'standalone', 'public', 'pagefind', 'index', 'en_123.pf_index'));
  assert.equal(existsSync(path.join(runtimeRoot, 'knowledge', 'secret.txt')), false);

  const activationPath = path.join(root, 'Library', 'Application Support', 'Loom', 'runtime', 'current.json');
  const activation = JSON.parse(await readFile(activationPath, 'utf8')) as {
    buildId: string;
    runtimeRoot: string;
  };

  assert.equal(activation.buildId, 'build-123');
  assert.equal(activation.runtimeRoot, runtimeRoot);
});

test('stageRuntimeBundle does not write current.json before the runtime payload is complete', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'loom-stage-runtime-incomplete-'));
  const buildRoot = path.join(root, '.next-build');
  await mkdir(path.join(buildRoot, 'standalone'), { recursive: true });
  await mkdir(path.join(root, 'public'), { recursive: true });
  await writeFile(path.join(buildRoot, 'BUILD_ID'), 'build-456', 'utf8');
  await writeFile(path.join(buildRoot, 'standalone', 'server.js'), 'console.log("ok")', 'utf8');

  await assert.rejects(
    () => stageRuntimeBundle({ repoRoot: root, homeOverride: root }),
    /static/i,
  );

  const activationPath = path.join(root, 'Library', 'Application Support', 'Loom', 'runtime', 'current.json');
  assert.equal(existsSync(activationPath), false);
});

test('stageRuntimeBundle validates staged runtime completeness before activation', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'loom-stage-runtime-validation-'));
  const buildRoot = path.join(root, '.next-build');
  await mkdir(path.join(buildRoot, 'standalone'), { recursive: true });
  await mkdir(path.join(buildRoot, 'static', 'chunks'), { recursive: true });
  await mkdir(path.join(root, 'public', 'assets'), { recursive: true });
  await mkdir(path.join(root, 'public', 'pagefind', 'fragment'), { recursive: true });
  await mkdir(path.join(root, 'public', 'pagefind', 'index'), { recursive: true });
  await writeFile(path.join(buildRoot, 'BUILD_ID'), 'build-789', 'utf8');
  await writeFile(path.join(buildRoot, 'static', 'chunks', 'app.js'), 'chunk', 'utf8');
  await writeFile(path.join(root, 'public', 'assets', 'logo.svg'), '<svg />', 'utf8');
  await writeFile(path.join(root, 'public', 'pagefind', 'pagefind.js'), 'export default {}', 'utf8');
  await writeFile(path.join(root, 'public', 'pagefind', 'pagefind-entry.json'), '{}', 'utf8');
  await writeFile(path.join(root, 'public', 'pagefind', 'fragment', 'en_123.pf_fragment'), 'fragment', 'utf8');
  await writeFile(path.join(root, 'public', 'pagefind', 'index', 'en_123.pf_index'), 'index', 'utf8');

  await assert.rejects(
    () => stageRuntimeBundle({ repoRoot: root, homeOverride: root }),
    /incomplete|server\.js/i,
  );

  const runtimeRoot = path.join(root, 'Library', 'Application Support', 'Loom', 'runtime', 'build-789');
  const activationPath = path.join(root, 'Library', 'Application Support', 'Loom', 'runtime', 'current.json');
  assert.equal(existsSync(runtimeRoot), false);
  assert.equal(existsSync(activationPath), false);
});

test('stageRuntimeBundle validates pagefind search assets before activation', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'loom-stage-runtime-pagefind-'));
  const buildRoot = path.join(root, '.next-build');
  await mkdir(path.join(buildRoot, 'standalone'), { recursive: true });
  await mkdir(path.join(buildRoot, 'static', 'chunks'), { recursive: true });
  await mkdir(path.join(root, 'public', 'assets'), { recursive: true });
  await mkdir(path.join(root, 'public', 'pagefind'), { recursive: true });
  await writeFile(path.join(buildRoot, 'BUILD_ID'), 'build-999', 'utf8');
  await writeFile(path.join(buildRoot, 'standalone', 'server.js'), 'console.log("ok")', 'utf8');
  await writeFile(path.join(buildRoot, 'static', 'chunks', 'app.js'), 'chunk', 'utf8');
  await writeFile(path.join(root, 'public', 'assets', 'logo.svg'), '<svg />', 'utf8');

  await assert.rejects(
    () => stageRuntimeBundle({ repoRoot: root, homeOverride: root }),
    /pagefind/i,
  );

  const runtimeRoot = path.join(root, 'Library', 'Application Support', 'Loom', 'runtime', 'build-999');
  const activationPath = path.join(root, 'Library', 'Application Support', 'Loom', 'runtime', 'current.json');
  assert.equal(existsSync(runtimeRoot), false);
  assert.equal(existsSync(activationPath), false);
});

test('stageRuntimeBundle preserves the active same-build runtime when replacement validation fails', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'loom-stage-runtime-preserve-'));
  const buildRoot = path.join(root, '.next-build');
  const runtimeBase = path.join(root, 'Library', 'Application Support', 'Loom', 'runtime');
  const existingRuntimeRoot = path.join(runtimeBase, 'build-stable');

  await mkdir(path.join(existingRuntimeRoot, 'standalone', '.next', 'static', 'chunks'), { recursive: true });
  await mkdir(path.join(existingRuntimeRoot, 'standalone', 'public', 'pagefind', 'fragment'), { recursive: true });
  await mkdir(path.join(existingRuntimeRoot, 'standalone', 'public', 'pagefind', 'index'), { recursive: true });
  await writeFile(path.join(existingRuntimeRoot, 'standalone', 'server.js'), 'console.log("old")', 'utf8');
  await writeFile(path.join(existingRuntimeRoot, 'standalone', '.next', 'static', 'chunks', 'app.js'), 'old-chunk', 'utf8');
  await writeFile(path.join(existingRuntimeRoot, 'standalone', 'public', 'pagefind', 'pagefind.js'), 'old-pagefind', 'utf8');
  await writeFile(path.join(existingRuntimeRoot, 'standalone', 'public', 'pagefind', 'pagefind-entry.json'), '{}', 'utf8');
  await writeFile(path.join(existingRuntimeRoot, 'standalone', 'public', 'pagefind', 'fragment', 'en_old.pf_fragment'), 'old-fragment', 'utf8');
  await writeFile(path.join(existingRuntimeRoot, 'standalone', 'public', 'pagefind', 'index', 'en_old.pf_index'), 'old-index', 'utf8');
  await writeFile(
    path.join(runtimeBase, 'current.json'),
    JSON.stringify({ buildId: 'build-stable', runtimeRoot: existingRuntimeRoot }, null, 2),
    'utf8',
  );

  await mkdir(path.join(buildRoot, 'standalone'), { recursive: true });
  await mkdir(path.join(buildRoot, 'static', 'chunks'), { recursive: true });
  await mkdir(path.join(root, 'public', 'assets'), { recursive: true });
  await mkdir(path.join(root, 'public', 'pagefind'), { recursive: true });
  await writeFile(path.join(buildRoot, 'BUILD_ID'), 'build-stable', 'utf8');
  await writeFile(path.join(buildRoot, 'standalone', 'server.js'), 'console.log("new")', 'utf8');
  await writeFile(path.join(buildRoot, 'static', 'chunks', 'app.js'), 'new-chunk', 'utf8');
  await writeFile(path.join(root, 'public', 'assets', 'logo.svg'), '<svg />', 'utf8');

  await assert.rejects(
    () => stageRuntimeBundle({ repoRoot: root, homeOverride: root }),
    /pagefind/i,
  );

  assert.equal(await readFile(path.join(existingRuntimeRoot, 'standalone', 'server.js'), 'utf8'), 'console.log("old")');
  const activation = JSON.parse(await readFile(path.join(runtimeBase, 'current.json'), 'utf8')) as {
    buildId?: string;
    runtimeRoot?: string;
  };
  assert.deepEqual(activation, { buildId: 'build-stable', runtimeRoot: existingRuntimeRoot });
});

test('installRuntimeMetadata persists the repo content root without rewriting runtime activation', async () => {
  const { installRuntimeMetadata } = await import('../scripts/install-loom-app.mjs');
  const root = await mkdtemp(path.join(os.tmpdir(), 'loom-install-runtime-'));
  const runtimeBase = path.join(root, 'Library', 'Application Support', 'Loom', 'runtime');
  const activationPath = path.join(runtimeBase, 'current.json');
  const activationRecord = {
    buildId: 'build-123',
    runtimeRoot: path.join(runtimeBase, 'build-123'),
  };

  await mkdir(runtimeBase, { recursive: true });
  await writeFile(activationPath, JSON.stringify(activationRecord, null, 2), 'utf8');

  await installRuntimeMetadata({
    repoRoot: '/tmp/wiki-project',
    homeOverride: root,
  });

  const config = JSON.parse(
    await readFile(path.join(root, 'Library', 'Application Support', 'Loom', 'content-root.json'), 'utf8'),
  ) as { contentRoot?: string };
  const activation = JSON.parse(await readFile(activationPath, 'utf8')) as {
    buildId?: string;
    runtimeRoot?: string;
  };

  assert.equal(config.contentRoot, '/tmp/wiki-project');
  assert.deepEqual(activation, activationRecord);
});

test('installLoomApp rolls back staged runtime metadata when app bundle install fails with no prior state', async () => {
  const { installLoomApp } = await import('../scripts/install-loom-app.mjs');
  const root = await mkdtemp(path.join(os.tmpdir(), 'loom-package-runtime-'));
  const appPath = path.join(root, 'Loom.app');
  const appSupportRoot = path.join(root, 'Library', 'Application Support', 'Loom');
  const runtimeBase = path.join(appSupportRoot, 'runtime');
  const stagedRuntimeRoot = path.join(runtimeBase, 'build-new');

  await mkdir(path.join(appPath, 'Contents', 'MacOS'), { recursive: true });
  await writeFile(path.join(appPath, 'Contents', 'Info.plist'), '<plist />', 'utf8');
  await writeFile(path.join(appPath, 'Contents', 'MacOS', 'Loom'), '#!/bin/sh\n', 'utf8');

  let stageCalled = false;
  let metadataCalled = false;

  await assert.rejects(
    () => installLoomApp({
      mode: 'user',
      repoRoot: '/tmp/wiki-project',
      sourceAppPath: appPath,
      homeOverride: root,
      dependencies: {
        stageRuntimeBundle: async ({ homeOverride } = {}) => {
          stageCalled = true;
          await mkdir(stagedRuntimeRoot, { recursive: true });
          await writeFile(
            path.join(homeOverride ?? root, 'Library', 'Application Support', 'Loom', 'runtime', 'current.json'),
            JSON.stringify({ buildId: 'build-new', runtimeRoot: stagedRuntimeRoot }, null, 2),
            'utf8',
          );
          return stagedRuntimeRoot;
        },
        installRuntimeMetadata: async ({ repoRoot: resolvedRepoRoot, homeOverride: resolvedHomeOverride } = {}) => {
          metadataCalled = true;
          await writeFile(
            path.join(resolvedHomeOverride ?? root, 'Library', 'Application Support', 'Loom', 'content-root.json'),
            JSON.stringify({ contentRoot: resolvedRepoRoot ?? '/tmp/wiki-project' }, null, 2),
            'utf8',
          );
        },
        installTo: async () => {
          throw new Error('install failed');
        },
      },
    }),
    /install failed/,
  );

  assert.equal(stageCalled, true);
  assert.equal(metadataCalled, true);
  assert.equal(existsSync(path.join(root, 'Library', 'Application Support', 'Loom', 'content-root.json')), false);
  assert.equal(existsSync(path.join(runtimeBase, 'current.json')), false);
  assert.equal(existsSync(stagedRuntimeRoot), false);
});

test('installLoomApp restores previous runtime metadata if app replacement fails after staging', async () => {
  const { installLoomApp } = await import('../scripts/install-loom-app.mjs');
  const root = await mkdtemp(path.join(os.tmpdir(), 'loom-install-rollback-'));
  const appPath = path.join(root, 'Loom.app');
  const appSupportRoot = path.join(root, 'Library', 'Application Support', 'Loom');
  const runtimeBase = path.join(appSupportRoot, 'runtime');
  const previousRuntimeRoot = path.join(runtimeBase, 'build-old');
  const stagedRuntimeRoot = path.join(runtimeBase, 'build-new');

  await mkdir(path.join(appPath, 'Contents', 'MacOS'), { recursive: true });
  await mkdir(previousRuntimeRoot, { recursive: true });
  await writeFile(path.join(appPath, 'Contents', 'Info.plist'), '<plist />', 'utf8');
  await writeFile(path.join(appPath, 'Contents', 'MacOS', 'Loom'), '#!/bin/sh\n', 'utf8');
  await writeFile(
    path.join(runtimeBase, 'current.json'),
    JSON.stringify({ buildId: 'build-old', runtimeRoot: previousRuntimeRoot }, null, 2),
    'utf8',
  );
  await writeFile(
    path.join(appSupportRoot, 'content-root.json'),
    JSON.stringify({ contentRoot: '/tmp/previous-project' }, null, 2),
    'utf8',
  );

  let stageCalled = false;

  await assert.rejects(
    () => installLoomApp({
      mode: 'user',
      repoRoot: '/tmp/wiki-project',
      sourceAppPath: appPath,
      homeOverride: root,
      dependencies: {
        stageRuntimeBundle: async ({ homeOverride } = {}) => {
          stageCalled = true;
          const supportRoot = path.join(homeOverride ?? root, 'Library', 'Application Support', 'Loom');
          const nextRuntimeBase = path.join(supportRoot, 'runtime');
          await mkdir(stagedRuntimeRoot, { recursive: true });
          await writeFile(
            path.join(nextRuntimeBase, 'current.json'),
            JSON.stringify({ buildId: 'build-new', runtimeRoot: stagedRuntimeRoot }, null, 2),
            'utf8',
          );
          return stagedRuntimeRoot;
        },
        installTo: async () => {
          throw new Error('install failed after staging');
        },
      },
    }),
    /install failed after staging/,
  );

  assert.equal(stageCalled, true);
  const activation = JSON.parse(await readFile(path.join(runtimeBase, 'current.json'), 'utf8')) as {
    buildId?: string;
    runtimeRoot?: string;
  };
  const contentRoot = JSON.parse(await readFile(path.join(appSupportRoot, 'content-root.json'), 'utf8')) as {
    contentRoot?: string;
  };

  assert.deepEqual(activation, { buildId: 'build-old', runtimeRoot: previousRuntimeRoot });
  assert.deepEqual(contentRoot, { contentRoot: '/tmp/previous-project' });
  assert.equal(existsSync(stagedRuntimeRoot), false);
  assert.equal(existsSync(previousRuntimeRoot), true);
});

test('installLoomApp rolls back staged runtime metadata if content root persistence fails after staging', async () => {
  const { installLoomApp } = await import('../scripts/install-loom-app.mjs');
  const root = await mkdtemp(path.join(os.tmpdir(), 'loom-install-metadata-rollback-'));
  const appPath = path.join(root, 'Loom.app');
  const appSupportRoot = path.join(root, 'Library', 'Application Support', 'Loom');
  const runtimeBase = path.join(appSupportRoot, 'runtime');
  const previousRuntimeRoot = path.join(runtimeBase, 'build-old');
  const stagedRuntimeRoot = path.join(runtimeBase, 'build-new');

  await mkdir(path.join(appPath, 'Contents', 'MacOS'), { recursive: true });
  await mkdir(previousRuntimeRoot, { recursive: true });
  await writeFile(path.join(appPath, 'Contents', 'Info.plist'), '<plist />', 'utf8');
  await writeFile(path.join(appPath, 'Contents', 'MacOS', 'Loom'), '#!/bin/sh\n', 'utf8');
  await writeFile(
    path.join(runtimeBase, 'current.json'),
    JSON.stringify({ buildId: 'build-old', runtimeRoot: previousRuntimeRoot }, null, 2),
    'utf8',
  );
  await writeFile(
    path.join(appSupportRoot, 'content-root.json'),
    JSON.stringify({ contentRoot: '/tmp/previous-project' }, null, 2),
    'utf8',
  );

  await assert.rejects(
    () => installLoomApp({
      mode: 'user',
      repoRoot: '/tmp/wiki-project',
      sourceAppPath: appPath,
      homeOverride: root,
      dependencies: {
        stageRuntimeBundle: async ({ homeOverride } = {}) => {
          const supportRoot = path.join(homeOverride ?? root, 'Library', 'Application Support', 'Loom');
          const nextRuntimeBase = path.join(supportRoot, 'runtime');
          await mkdir(stagedRuntimeRoot, { recursive: true });
          await writeFile(
            path.join(nextRuntimeBase, 'current.json'),
            JSON.stringify({ buildId: 'build-new', runtimeRoot: stagedRuntimeRoot }, null, 2),
            'utf8',
          );
          return stagedRuntimeRoot;
        },
        installRuntimeMetadata: async ({ repoRoot: resolvedRepoRoot, homeOverride: resolvedHomeOverride } = {}) => {
          await writeFile(
            path.join(resolvedHomeOverride ?? root, 'Library', 'Application Support', 'Loom', 'content-root.json'),
            JSON.stringify({ contentRoot: resolvedRepoRoot ?? '/tmp/wiki-project' }, null, 2),
            'utf8',
          );
          throw new Error('metadata persistence failed');
        },
        installTo: async () => {
          throw new Error('install should not run');
        },
      },
    }),
    /metadata persistence failed/,
  );

  const activation = JSON.parse(await readFile(path.join(runtimeBase, 'current.json'), 'utf8')) as {
    buildId?: string;
    runtimeRoot?: string;
  };
  const contentRoot = JSON.parse(await readFile(path.join(appSupportRoot, 'content-root.json'), 'utf8')) as {
    contentRoot?: string;
  };

  assert.deepEqual(activation, { buildId: 'build-old', runtimeRoot: previousRuntimeRoot });
  assert.deepEqual(contentRoot, { contentRoot: '/tmp/previous-project' });
  assert.equal(existsSync(stagedRuntimeRoot), false);
});

test('repo .next-build is only removed after runtime + app install metadata succeeds', async () => {
  const { maybePruneRepoBuildArtifacts } = await import('../scripts/install-loom-app.mjs');
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'loom-prune-gate-'));
  await mkdir(path.join(repoRoot, '.next-build'), { recursive: true });

  await maybePruneRepoBuildArtifacts({
    repoRoot,
    installSucceeded: false,
  });

  assert.equal(existsSync(path.join(repoRoot, '.next-build')), true);
});

test('installLoomApp prunes repo .next-build only after a successful install', async () => {
  const { installLoomApp } = await import('../scripts/install-loom-app.mjs');
  const root = await mkdtemp(path.join(os.tmpdir(), 'loom-install-prune-'));
  const repoRoot = path.join(root, 'repo');
  const appPath = path.join(root, 'Loom.app');
  const repoBuildRoot = path.join(repoRoot, '.next-build');
  const stagedRuntimeRoot = path.join(root, 'Library', 'Application Support', 'Loom', 'runtime', 'build-new');

  await mkdir(path.join(appPath, 'Contents', 'MacOS'), { recursive: true });
  await mkdir(repoBuildRoot, { recursive: true });
  await writeFile(path.join(repoBuildRoot, 'BUILD_ID'), 'build-new', 'utf8');
  await writeFile(path.join(appPath, 'Contents', 'Info.plist'), '<plist />', 'utf8');
  await writeFile(path.join(appPath, 'Contents', 'MacOS', 'Loom'), '#!/bin/sh\n', 'utf8');

  const result = await installLoomApp({
    mode: 'user',
    repoRoot,
    sourceAppPath: appPath,
    homeOverride: root,
    dependencies: {
      stageRuntimeBundle: async () => {
        await mkdir(stagedRuntimeRoot, { recursive: true });
        return stagedRuntimeRoot;
      },
      installRuntimeMetadata: async ({ repoRoot: resolvedRepoRoot, homeOverride: resolvedHomeOverride } = {}) => {
        await writeFile(
          path.join(resolvedHomeOverride ?? root, 'Library', 'Application Support', 'Loom', 'content-root.json'),
          JSON.stringify({ contentRoot: resolvedRepoRoot ?? repoRoot }, null, 2),
          'utf8',
        );
      },
      installTo: async (target) => {
        await mkdir(target, { recursive: true });
      },
    },
  });

  assert.equal(result.target, path.join(os.homedir(), 'Applications', 'Loom.app'));
  assert.equal(result.fallbackUsed, false);
  assert.equal(existsSync(repoBuildRoot), false);
  assert.equal(existsSync(path.join(stagedRuntimeRoot)), true);
});

test('installLoomApp treats repo .next-build pruning as best-effort after a successful install', async () => {
  const { installLoomApp } = await import('../scripts/install-loom-app.mjs');
  const root = await mkdtemp(path.join(os.tmpdir(), 'loom-install-prune-best-effort-'));
  const repoRoot = path.join(root, 'repo');
  const appPath = path.join(root, 'Loom.app');
  const repoBuildRoot = path.join(repoRoot, '.next-build');
  const stagedRuntimeRoot = path.join(root, 'Library', 'Application Support', 'Loom', 'runtime', 'build-new');

  await mkdir(path.join(appPath, 'Contents', 'MacOS'), { recursive: true });
  await mkdir(repoBuildRoot, { recursive: true });
  await writeFile(path.join(repoBuildRoot, 'BUILD_ID'), 'build-new', 'utf8');
  await writeFile(path.join(appPath, 'Contents', 'Info.plist'), '<plist />', 'utf8');
  await writeFile(path.join(appPath, 'Contents', 'MacOS', 'Loom'), '#!/bin/sh\n', 'utf8');

  const result = await installLoomApp({
    mode: 'user',
    repoRoot,
    sourceAppPath: appPath,
    homeOverride: root,
    dependencies: {
      stageRuntimeBundle: async () => {
        await mkdir(stagedRuntimeRoot, { recursive: true });
        return stagedRuntimeRoot;
      },
      installRuntimeMetadata: async ({ repoRoot: resolvedRepoRoot, homeOverride: resolvedHomeOverride } = {}) => {
        await writeFile(
          path.join(resolvedHomeOverride ?? root, 'Library', 'Application Support', 'Loom', 'content-root.json'),
          JSON.stringify({ contentRoot: resolvedRepoRoot ?? repoRoot }, null, 2),
          'utf8',
        );
      },
      installTo: async (target) => {
        await mkdir(target, { recursive: true });
      },
      maybePruneRepoBuildArtifacts: async () => {
        throw new Error('prune failed');
      },
    },
  });

  assert.equal(result.target, path.join(os.homedir(), 'Applications', 'Loom.app'));
  assert.equal(result.fallbackUsed, false);
  assert.equal(existsSync(repoBuildRoot), true);
  assert.equal(existsSync(path.join(stagedRuntimeRoot)), true);
});

test('packageLoomApp writes app and runtime archives plus install instructions', async () => {
  const { packageLoomApp } = await import('../scripts/package-loom-app.mjs');
  const { resolveActiveRuntimeRoot } = await import('../lib/runtime-roots');
  const root = await mkdtemp(path.join(os.tmpdir(), 'loom-package-runtime-'));
  const appPath = path.join(root, 'Loom.app');
  const runtimeRoot = path.join(root, 'Library', 'Application Support', 'Loom', 'runtime', 'build-123');
  const outputRoot = path.join(root, 'output');

  await mkdir(path.join(appPath, 'Contents', 'MacOS'), { recursive: true });
  await mkdir(path.join(runtimeRoot, 'standalone'), { recursive: true });
  await writeFile(path.join(appPath, 'Contents', 'Info.plist'), '<plist />', 'utf8');
  await writeFile(path.join(appPath, 'Contents', 'MacOS', 'Loom'), '#!/bin/sh\n', 'utf8');
  await writeFile(path.join(runtimeRoot, 'standalone', 'server.js'), 'console.log("ok")', 'utf8');

  const result = packageLoomApp({
    appPath,
    runtimeRoot,
    outputRoot,
    contentRoot: '/tmp/wiki-project',
  });

  await stat(result.appArchivePath);
  await stat(result.runtimeArchivePath);
  const outputEntries = await readdir(outputRoot);
  assert.deepEqual(outputEntries.sort(), ['INSTALL-LOOM.txt', 'Loom-replacement.zip', 'Loom-runtime.zip']);

  const runtimeListing = execFileSync('unzip', ['-Z1', result.runtimeArchivePath], { encoding: 'utf8' });
  assert.match(runtimeListing, /Library\/Application Support\/Loom\/runtime\/current\.json/);
  assert.match(runtimeListing, /Library\/Application Support\/Loom\/content-root\.json/);
  assert.match(runtimeListing, /Library\/Application Support\/Loom\/runtime\/build-123\/standalone\/server\.js/);

  const extractedRoot = path.join(root, 'extracted-runtime');
  await mkdir(extractedRoot, { recursive: true });
  execFileSync('ditto', ['-x', '-k', result.runtimeArchivePath, extractedRoot]);
  const activation = JSON.parse(
    await readFile(path.join(extractedRoot, 'Library', 'Application Support', 'Loom', 'runtime', 'current.json'), 'utf8'),
  ) as { buildId?: string; runtimeRoot?: string };
  const contentConfig = JSON.parse(
    await readFile(path.join(extractedRoot, 'Library', 'Application Support', 'Loom', 'content-root.json'), 'utf8'),
  ) as { contentRoot?: string };

  assert.equal(activation.buildId, 'build-123');
  assert.equal(activation.runtimeRoot, undefined);
  assert.equal(contentConfig.contentRoot, '/tmp/wiki-project');
  assert.equal(
    resolveActiveRuntimeRoot({ env: env({ HOME: extractedRoot }) }),
    path.join(extractedRoot, 'Library', 'Application Support', 'Loom', 'runtime', 'build-123'),
  );

  const readme = await readFile(path.join(outputRoot, 'INSTALL-LOOM.txt'), 'utf8');
  assert.match(readme, /Loom-runtime\.zip/);
  assert.match(readme, /content-root\.json/);
});

test('stageRuntimeForPackaging does not mutate the caller application support runtime activation', async () => {
  const { stageRuntimeForPackaging } = await import('../scripts/package-loom-app.mjs');
  const root = await mkdtemp(path.join(os.tmpdir(), 'loom-package-stage-'));
  const buildRoot = path.join(root, '.next-build');
  const liveAppSupportRoot = path.join(root, 'Library', 'Application Support', 'Loom');
  const liveRuntimeBase = path.join(liveAppSupportRoot, 'runtime');
  const liveActivationPath = path.join(liveRuntimeBase, 'current.json');

  await mkdir(path.join(buildRoot, 'standalone', '.next'), { recursive: true });
  await mkdir(path.join(buildRoot, 'static', 'chunks'), { recursive: true });
  await mkdir(path.join(root, 'public', 'assets'), { recursive: true });
  await mkdir(path.join(root, 'public', 'pagefind', 'fragment'), { recursive: true });
  await mkdir(path.join(root, 'public', 'pagefind', 'index'), { recursive: true });
  await mkdir(liveRuntimeBase, { recursive: true });
  await writeFile(path.join(buildRoot, 'BUILD_ID'), 'build-package', 'utf8');
  await writeFile(path.join(buildRoot, 'standalone', 'server.js'), 'console.log("ok")', 'utf8');
  await writeFile(path.join(buildRoot, 'static', 'chunks', 'app.js'), 'chunk', 'utf8');
  await writeFile(path.join(root, 'public', 'assets', 'logo.svg'), '<svg />', 'utf8');
  await writeFile(path.join(root, 'public', 'pagefind', 'pagefind.js'), 'export default {}', 'utf8');
  await writeFile(path.join(root, 'public', 'pagefind', 'pagefind-entry.json'), '{}', 'utf8');
  await writeFile(path.join(root, 'public', 'pagefind', 'fragment', 'en_123.pf_fragment'), 'fragment', 'utf8');
  await writeFile(path.join(root, 'public', 'pagefind', 'index', 'en_123.pf_index'), 'index', 'utf8');
  await writeFile(
    liveActivationPath,
    JSON.stringify({ buildId: 'live-build', runtimeRoot: path.join(liveRuntimeBase, 'live-build') }, null, 2),
    'utf8',
  );

  const previousActivation = await readFile(liveActivationPath, 'utf8');
  const staged = await stageRuntimeForPackaging({ repoRoot: root, homeOverride: root });

  assert.equal(await readFile(liveActivationPath, 'utf8'), previousActivation);
  assert.notEqual(path.dirname(path.dirname(staged.runtimeRoot)), liveRuntimeBase);
  await stat(path.join(staged.runtimeRoot, 'standalone', 'server.js'));

  await staged.cleanup();
  assert.equal(existsSync(staged.runtimeRoot), false);
});

test('package script finds Release app bundles before Debug bundles', async () => {
  const { findBuiltApp } = await import('../scripts/package-loom-app.mjs');
  const root = await mkdtemp(path.join(os.tmpdir(), 'loom-package-derived-data-'));
  const derivedDataRoot = path.join(root, 'DerivedData');
  const releaseApp = path.join(derivedDataRoot, 'Loom-release', 'Build', 'Products', 'Release', 'Loom.app');
  const debugApp = path.join(derivedDataRoot, 'Loom-debug', 'Build', 'Products', 'Debug', 'Loom.app');

  await mkdir(releaseApp, { recursive: true });
  await mkdir(debugApp, { recursive: true });

  const found = await findBuiltApp({ derivedDataRoot, preferredConfiguration: 'Release' });
  assert.equal(found, releaseApp);
});

test('uploads pages resolve uploads from the shared content root instead of process cwd', () => {
  const uploadsIndexSource = readFileSync(path.join(repoRoot, 'app', 'uploads', 'page.tsx'), 'utf8');
  const uploadDetailSource = readFileSync(path.join(repoRoot, 'app', 'uploads', '[name]', 'page.tsx'), 'utf8');

  assert.match(uploadsIndexSource, /resolveContentRoot/);
  assert.match(uploadDetailSource, /resolveContentRoot/);
  assert.doesNotMatch(uploadsIndexSource, /process\.cwd\(\)/);
  assert.doesNotMatch(uploadDetailSource, /process\.cwd\(\)/);
});
