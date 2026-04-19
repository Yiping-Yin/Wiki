import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { mkdir, writeFile, mkdtemp } from 'node:fs/promises';

import {
  contentRootConfigPath,
  resolveActiveRuntimeRoot,
  resolveContentRoot,
  runtimeActivationPath,
  runtimeBaseDir,
} from '../lib/runtime-roots';

function env(values: Record<string, string>) {
  return values as unknown as NodeJS.ProcessEnv;
}

function canonicalPath(filePath: string) {
  return realpathSync(filePath);
}

const require = createRequire(import.meta.url);
const repoRoot = process.cwd();
const serverConfigUrl = pathToFileURL(path.join(repoRoot, 'lib', 'server-config.ts')).href;
const uploadRouteUrl = pathToFileURL(path.join(repoRoot, 'app', 'api', 'upload', 'route.ts')).href;
const knowledgeCreateRouteUrl = pathToFileURL(path.join(repoRoot, 'app', 'api', 'knowledge', 'create', 'route.ts')).href;

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

test('runtime path helpers point at Application Support Loom runtime files', () => {
  const home = '/Users/example';

  assert.equal(runtimeBaseDir(env({ HOME: home })), '/Users/example/Library/Application Support/Loom/runtime');
  assert.equal(runtimeActivationPath(env({ HOME: home })), '/Users/example/Library/Application Support/Loom/runtime/current.json');
  assert.equal(contentRootConfigPath(env({ HOME: home })), '/Users/example/Library/Application Support/Loom/content-root.json');
});

test('runtime path helpers ignore empty-string home values', () => {
  const actualHome = os.homedir();

  assert.equal(runtimeBaseDir(env({ HOME: '', USERPROFILE: '' })), path.join(actualHome, 'Library', 'Application Support', 'Loom', 'runtime'));
  assert.equal(contentRootConfigPath(env({ HOME: '', USERPROFILE: '' })), path.join(actualHome, 'Library', 'Application Support', 'Loom', 'content-root.json'));
});

test('resolveContentRoot prefers env override then persisted config then fallback', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'loom-runtime-roots-'));
  const configPath = contentRootConfigPath(env({ HOME: home }));
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify({ contentRoot: '/persisted/wiki' }), 'utf8');
  const fallbackHome = await mkdtemp(path.join(os.tmpdir(), 'loom-runtime-fallback-'));

  assert.equal(
    resolveContentRoot({
      env: env({ HOME: home, LOOM_CONTENT_ROOT: '/env/wiki' }),
      fallbackContentRoot: '/fallback/wiki',
    }),
    '/env/wiki',
  );

  assert.equal(
    resolveContentRoot({
      env: env({ HOME: home }),
      fallbackContentRoot: '/fallback/wiki',
    }),
    '/persisted/wiki',
  );

  assert.equal(
    resolveContentRoot({
      env: env({ HOME: fallbackHome }),
      fallbackContentRoot: '/fallback/wiki',
    }),
    '/fallback/wiki',
  );
});

test('resolveContentRoot throws on malformed persisted config', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'loom-runtime-config-'));
  const configPath = contentRootConfigPath(env({ HOME: home }));
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, '{not json', 'utf8');

  assert.throws(
    () => resolveContentRoot({ env: env({ HOME: home }), fallbackContentRoot: '/fallback/wiki' }),
    /content-root\.json/i,
  );
});

test('resolveActiveRuntimeRoot rejects stale activation data when the runtime directory is missing', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'loom-runtime-stale-'));
  const runtimeDir = runtimeBaseDir(env({ HOME: home }));
  await mkdir(runtimeDir, { recursive: true });
  await writeFile(
    runtimeActivationPath(env({ HOME: home })),
    JSON.stringify({ buildId: 'build-42', runtimeRoot: path.join(runtimeDir, 'build-42') }),
    'utf8',
  );

  assert.equal(resolveActiveRuntimeRoot({ env: env({ HOME: home }) }), null);
});

test('resolveActiveRuntimeRoot throws on malformed activation data', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'loom-runtime-malformed-'));
  const runtimeDir = runtimeBaseDir(env({ HOME: home }));
  await mkdir(runtimeDir, { recursive: true });
  await writeFile(runtimeActivationPath(env({ HOME: home })), '{not json', 'utf8');

  assert.throws(
    () => resolveActiveRuntimeRoot({ env: env({ HOME: home }) }),
    /current\.json/i,
  );
});

test('resolveActiveRuntimeRoot reads current.json when the runtime directory exists', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'loom-runtime-activation-'));
  const runtimeDir = runtimeBaseDir(env({ HOME: home }));
  const activeRuntimeDir = path.join(runtimeDir, 'build-42');
  await mkdir(activeRuntimeDir, { recursive: true });
  await writeFile(
    runtimeActivationPath(env({ HOME: home })),
    JSON.stringify({ buildId: 'build-42', runtimeRoot: activeRuntimeDir }),
    'utf8',
  );

  assert.equal(
    resolveActiveRuntimeRoot({ env: env({ HOME: home }) }),
    activeRuntimeDir,
  );
});

test('content-root resolver can point knowledge APIs at a non-cwd project tree', async (t) => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'loom-content-root-'));
  const manifestRoot = path.join(projectRoot, 'knowledge', '.cache', 'manifest');
  await mkdir(manifestRoot, { recursive: true });
  await writeFile(
    path.join(manifestRoot, 'knowledge-nav.json'),
    JSON.stringify({ knowledgeCategories: [], knowledgeTotal: 0 }),
    'utf8',
  );

  const priorContentRoot = process.env.LOOM_CONTENT_ROOT;
  process.env.LOOM_CONTENT_ROOT = projectRoot;
  t.after(() => {
    if (priorContentRoot === undefined) {
      delete process.env.LOOM_CONTENT_ROOT;
      return;
    }
    process.env.LOOM_CONTENT_ROOT = priorContentRoot;
  });

  const moduleUrl = new URL('../lib/knowledge-store.ts', import.meta.url);
  moduleUrl.searchParams.set('loom-content-root', projectRoot);
  const { knowledgeNavPath } = await import(moduleUrl.href);

  assert.equal(
    knowledgeNavPath(),
    path.join(projectRoot, 'knowledge', '.cache', 'manifest', 'knowledge-nav.json'),
  );
});

test('server-config keeps knowledge root separate from content root', async () => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'loom-content-project-'));
  const knowledgeRoot = await mkdtemp(path.join(os.tmpdir(), 'loom-knowledge-root-'));
  const output = runIsolatedTsEval(
    `
      const mod = await import(${JSON.stringify(serverConfigUrl)});
      const { CONTENT_ROOT, KNOWLEDGE_ROOT } = mod.default ?? mod;
      console.log(JSON.stringify({ CONTENT_ROOT, KNOWLEDGE_ROOT }));
    `,
    {
      env: {
        LOOM_CONTENT_ROOT: projectRoot,
        LOOM_KNOWLEDGE_ROOT: knowledgeRoot,
      },
    },
  );
  const parsed = JSON.parse(output) as { CONTENT_ROOT: string; KNOWLEDGE_ROOT: string };

  assert.equal(parsed.CONTENT_ROOT, projectRoot);
  assert.equal(parsed.KNOWLEDGE_ROOT, knowledgeRoot);
});

test('server-config falls back without throwing when persisted content-root config is malformed', async () => {
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'loom-server-config-home-'));
  const persistedConfigPath = contentRootConfigPath(env({ HOME: runtimeHome }));
  await mkdir(path.dirname(persistedConfigPath), { recursive: true });
  await writeFile(persistedConfigPath, '{not json', 'utf8');
  const fallbackRoot = await mkdtemp(path.join(os.tmpdir(), 'loom-server-config-fallback-'));
  const output = runIsolatedTsEval(
    `
      process.chdir(${JSON.stringify(fallbackRoot)});
      const mod = await import(${JSON.stringify(serverConfigUrl)});
      const { CONTENT_ROOT, CONTENT_ROOT_CONFIG_ERROR } = mod.default ?? mod;
      console.log(JSON.stringify({
        CONTENT_ROOT,
        CONTENT_ROOT_CONFIG_ERROR: CONTENT_ROOT_CONFIG_ERROR?.message ?? null,
      }));
    `,
    {
      cwd: fallbackRoot,
      env: {
        HOME: runtimeHome,
        USERPROFILE: undefined,
        LOOM_CONTENT_ROOT: undefined,
        LOOM_KNOWLEDGE_ROOT: undefined,
      },
    },
  );
  const parsed = JSON.parse(output) as {
    CONTENT_ROOT: string;
    CONTENT_ROOT_CONFIG_ERROR: string | null;
  };

  assert.equal(parsed.CONTENT_ROOT, canonicalPath(fallbackRoot));
  assert.match(parsed.CONTENT_ROOT_CONFIG_ERROR ?? '', /content-root\.json/i);
});

test('upload route triggers ingest from the execution root instead of the content root', async () => {
  const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), 'loom-runtime-root-'));
  const contentRoot = await mkdtemp(path.join(os.tmpdir(), 'loom-route-content-'));
  const knowledgeRoot = await mkdtemp(path.join(os.tmpdir(), 'loom-route-knowledge-'));
  const output = runIsolatedTsEval(
    `
      import { createRequire } from 'node:module';
      const require = createRequire(import.meta.url);
      const childProcess = require('node:child_process');
      let capturedCwd;
      childProcess.execFile = (file, args, options, callback) => {
        capturedCwd = options?.cwd;
        callback?.(null);
        return {};
      };

      process.chdir(${JSON.stringify(runtimeRoot)});
      const mod = await import(${JSON.stringify(uploadRouteUrl)});
      const { POST } = mod.default ?? mod;
      const formData = new FormData();
      formData.set('file', new File(['hello'], 'notes.txt', { type: 'text/plain' }));
      formData.set('category', 'Course Notes');
      const response = await POST(new Request('http://localhost/api/upload', { method: 'POST', body: formData }));
      console.log(JSON.stringify({ status: response.status, capturedCwd }));
    `,
    {
      env: {
        LOOM_CONTENT_ROOT: contentRoot,
        LOOM_KNOWLEDGE_ROOT: knowledgeRoot,
      },
    },
  );
  const parsed = JSON.parse(output) as { status: number; capturedCwd: string };

  assert.equal(parsed.status, 200);
  assert.equal(parsed.capturedCwd, canonicalPath(runtimeRoot));
  assert.notEqual(parsed.capturedCwd, canonicalPath(contentRoot));
});

test('knowledge create route triggers ingest from the execution root instead of the content root', async () => {
  const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), 'loom-runtime-root-'));
  const contentRoot = await mkdtemp(path.join(os.tmpdir(), 'loom-route-content-'));
  const knowledgeRoot = await mkdtemp(path.join(os.tmpdir(), 'loom-route-knowledge-'));
  const output = runIsolatedTsEval(
    `
      import { createRequire } from 'node:module';
      const require = createRequire(import.meta.url);
      const childProcess = require('node:child_process');
      let capturedCwd;
      childProcess.execFile = (file, args, options, callback) => {
        capturedCwd = options?.cwd;
        callback?.(null);
        return {};
      };

      process.chdir(${JSON.stringify(runtimeRoot)});
      const mod = await import(${JSON.stringify(knowledgeCreateRouteUrl)});
      const { POST } = mod.default ?? mod;
      const response = await POST(new Request('http://localhost/api/knowledge/create', {
        method: 'POST',
        body: JSON.stringify({ name: 'C++' }),
        headers: { 'content-type': 'application/json' },
      }));
      console.log(JSON.stringify({ status: response.status, capturedCwd }));
    `,
    {
      env: {
        LOOM_CONTENT_ROOT: contentRoot,
        LOOM_KNOWLEDGE_ROOT: knowledgeRoot,
      },
    },
  );
  const parsed = JSON.parse(output) as { status: number; capturedCwd: string };

  assert.equal(parsed.status, 200);
  assert.equal(parsed.capturedCwd, canonicalPath(runtimeRoot));
  assert.notEqual(parsed.capturedCwd, canonicalPath(contentRoot));
});
