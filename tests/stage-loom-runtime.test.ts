import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { stageRuntimeBundle } from '../scripts/stage-loom-runtime.mjs';

const repoRoot = path.resolve(__dirname, '..');

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
