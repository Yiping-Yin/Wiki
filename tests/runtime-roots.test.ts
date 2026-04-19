import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { mkdir, writeFile, mkdtemp } from 'node:fs/promises';

import {
  contentRootConfigPath,
  resolveActiveRuntimeRoot,
  resolveContentRoot,
  runtimeActivationPath,
  runtimeBaseDir,
} from '../lib/runtime-roots';

test('runtime path helpers point at Application Support Loom runtime files', () => {
  const home = '/Users/example';

  assert.equal(runtimeBaseDir({ HOME: home } as NodeJS.ProcessEnv), '/Users/example/Library/Application Support/Loom/runtime');
  assert.equal(runtimeActivationPath({ HOME: home } as NodeJS.ProcessEnv), '/Users/example/Library/Application Support/Loom/runtime/current.json');
  assert.equal(contentRootConfigPath({ HOME: home } as NodeJS.ProcessEnv), '/Users/example/Library/Application Support/Loom/content-root.json');
});

test('resolveContentRoot prefers env override then persisted config then fallback', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'loom-runtime-roots-'));
  const configPath = contentRootConfigPath({ HOME: home } as NodeJS.ProcessEnv);
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify({ contentRoot: '/persisted/wiki' }), 'utf8');
  const fallbackHome = await mkdtemp(path.join(os.tmpdir(), 'loom-runtime-fallback-'));

  assert.equal(
    resolveContentRoot({
      env: { HOME: home, LOOM_CONTENT_ROOT: '/env/wiki' } as NodeJS.ProcessEnv,
      fallbackContentRoot: '/fallback/wiki',
    }),
    '/env/wiki',
  );

  assert.equal(
    resolveContentRoot({
      env: { HOME: home } as NodeJS.ProcessEnv,
      fallbackContentRoot: '/fallback/wiki',
    }),
    '/persisted/wiki',
  );

  assert.equal(
    resolveContentRoot({
      env: { HOME: fallbackHome } as NodeJS.ProcessEnv,
      fallbackContentRoot: '/fallback/wiki',
    }),
    '/fallback/wiki',
  );
});

test('resolveActiveRuntimeRoot reads current.json instead of guessing newest folder', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'loom-runtime-activation-'));
  const runtimeDir = runtimeBaseDir({ HOME: home } as NodeJS.ProcessEnv);
  await mkdir(runtimeDir, { recursive: true });
  await writeFile(
    runtimeActivationPath({ HOME: home } as NodeJS.ProcessEnv),
    JSON.stringify({ buildId: 'build-42', runtimeRoot: path.join(runtimeDir, 'build-42') }),
    'utf8',
  );

  assert.equal(
    resolveActiveRuntimeRoot({ env: { HOME: home } as NodeJS.ProcessEnv }),
    path.join(runtimeDir, 'build-42'),
  );
});
