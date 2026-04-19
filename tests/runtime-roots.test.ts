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

test('runtime path helpers ignore empty-string home values', () => {
  const actualHome = os.homedir();

  assert.equal(runtimeBaseDir({ HOME: '', USERPROFILE: '' } as NodeJS.ProcessEnv), path.join(actualHome, 'Library', 'Application Support', 'Loom', 'runtime'));
  assert.equal(contentRootConfigPath({ HOME: '', USERPROFILE: '' } as NodeJS.ProcessEnv), path.join(actualHome, 'Library', 'Application Support', 'Loom', 'content-root.json'));
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

test('resolveContentRoot throws on malformed persisted config', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'loom-runtime-config-'));
  const configPath = contentRootConfigPath({ HOME: home } as NodeJS.ProcessEnv);
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, '{not json', 'utf8');

  assert.throws(
    () => resolveContentRoot({ env: { HOME: home } as NodeJS.ProcessEnv, fallbackContentRoot: '/fallback/wiki' }),
    /content-root\.json/i,
  );
});

test('resolveActiveRuntimeRoot rejects stale activation data when the runtime directory is missing', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'loom-runtime-stale-'));
  const runtimeDir = runtimeBaseDir({ HOME: home } as NodeJS.ProcessEnv);
  await mkdir(runtimeDir, { recursive: true });
  await writeFile(
    runtimeActivationPath({ HOME: home } as NodeJS.ProcessEnv),
    JSON.stringify({ buildId: 'build-42', runtimeRoot: path.join(runtimeDir, 'build-42') }),
    'utf8',
  );

  assert.equal(resolveActiveRuntimeRoot({ env: { HOME: home } as NodeJS.ProcessEnv }), null);
});

test('resolveActiveRuntimeRoot throws on malformed activation data', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'loom-runtime-malformed-'));
  const runtimeDir = runtimeBaseDir({ HOME: home } as NodeJS.ProcessEnv);
  await mkdir(runtimeDir, { recursive: true });
  await writeFile(runtimeActivationPath({ HOME: home } as NodeJS.ProcessEnv), '{not json', 'utf8');

  assert.throws(
    () => resolveActiveRuntimeRoot({ env: { HOME: home } as NodeJS.ProcessEnv }),
    /current\.json/i,
  );
});

test('resolveActiveRuntimeRoot reads current.json when the runtime directory exists', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'loom-runtime-activation-'));
  const runtimeDir = runtimeBaseDir({ HOME: home } as NodeJS.ProcessEnv);
  const activeRuntimeDir = path.join(runtimeDir, 'build-42');
  await mkdir(activeRuntimeDir, { recursive: true });
  await writeFile(
    runtimeActivationPath({ HOME: home } as NodeJS.ProcessEnv),
    JSON.stringify({ buildId: 'build-42', runtimeRoot: activeRuntimeDir }),
    'utf8',
  );

  assert.equal(
    resolveActiveRuntimeRoot({ env: { HOME: home } as NodeJS.ProcessEnv }),
    activeRuntimeDir,
  );
});
