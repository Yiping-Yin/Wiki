import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

import { resolveActiveRuntimeRoot } from '../lib/runtime-roots';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requestedPort = Number(process.env.LOOM_APP_SMOKE_PORT || 3101);

function assertOk(condition: unknown, message: string): asserts condition {
  assert.equal(Boolean(condition), true, message);
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 30_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function waitForReady(base: string, timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetchWithTimeout(`${base}/api/health`, {}, 2_000);
      if (response.ok) return;
    } catch {}
    await delay(400);
  }
  throw new Error(`Installed runtime did not become ready within ${timeoutMs}ms`);
}

function parseSseText(body: string) {
  let full = '';
  for (const line of body.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    const payload = line.slice(6).trim();
    if (!payload || payload === '[DONE]') continue;
    const parsed = JSON.parse(payload) as { delta?: string; notice?: string; error?: string };
    if (parsed.error) throw new Error(parsed.error);
    if (parsed.delta) full += parsed.delta;
  }
  return full;
}

function resolveOptionalExecutableEnv(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return path.isAbsolute(trimmed) ? trimmed : path.resolve(repoRoot, trimmed);
}

async function findAvailablePort(startPort: number) {
  let port = startPort;
  while (port < startPort + 25) {
    const free = await new Promise<boolean>((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.once('listening', () => {
        server.close(() => resolve(true));
      });
      server.listen(port, '127.0.0.1');
    });
    if (free) return port;
    port += 1;
  }
  throw new Error(`Could not find a free port near ${startPort}`);
}

async function run() {
  const runtimeRoot = resolveActiveRuntimeRoot();
  if (!runtimeRoot) {
    throw new Error('No active installed Loom runtime found in Application Support.');
  }

  const port = await findAvailablePort(requestedPort);
  const base = `http://127.0.0.1:${port}`;
  const contentRoot = await mkdtemp(path.join(os.tmpdir(), 'loom-installed-smoke-content-'));
  const knowledgeRoot = await mkdtemp(path.join(os.tmpdir(), 'loom-installed-smoke-knowledge-'));
  const cwd = path.join(runtimeRoot, 'standalone');
  const child = spawn(process.execPath, ['server.js'], {
    cwd,
    env: {
      ...process.env,
      HOSTNAME: '127.0.0.1',
      PORT: String(port),
      CODEX_BIN: resolveOptionalExecutableEnv(process.env.CODEX_BIN),
      CLAUDE_BIN: resolveOptionalExecutableEnv(process.env.CLAUDE_BIN),
      LOOM_EXECUTION_ROOT: repoRoot,
      LOOM_CONTENT_ROOT: contentRoot,
      LOOM_KNOWLEDGE_ROOT: knowledgeRoot,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

  const shutdown = async () => {
    if (!child.killed) child.kill('SIGTERM');
    await new Promise((resolve) => child.once('exit', resolve));
  };

  try {
    await waitForReady(base, 30_000);

    const health = await fetchWithTimeout(`${base}/api/health`);
    assertOk(health.ok, `health returned ${health.status}`);

    const preHealth = await fetchWithTimeout(`${base}/api/ai-health`);
    assertOk(preHealth.ok, `ai-health returned ${preHealth.status}`);
    const pre = await preHealth.json() as {
      providers?: Array<{ cli: string; ok: boolean; code: string }>;
    };

    const chat = await fetchWithTimeout(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Reply with exactly OK.' }],
        cli: 'codex',
        stage: 'clarify-passage',
      }),
    });
    assertOk(chat.ok, `chat returned ${chat.status}`);
    const chatText = parseSseText(await chat.text());
    assert.equal(chatText.trim(), 'OK', 'chat smoke expected exact OK response');

    const postHealth = await fetchWithTimeout(`${base}/api/ai-health`);
    assertOk(postHealth.ok, `post-chat ai-health returned ${postHealth.status}`);
    const post = await postHealth.json() as {
      providers?: Array<{ cli: string; ok: boolean; code: string }>;
    };

    const preCodex = pre.providers?.find((provider) => provider.cli === 'codex') ?? null;
    const postCodex = post.providers?.find((provider) => provider.cli === 'codex') ?? null;
    assertOk(postCodex, 'post-chat ai-health missing codex provider');
    if (preCodex?.code === 'timeout') {
      assert.equal(postCodex.ok, true, 'successful chat should reconcile stale codex timeout health');
      assert.equal(postCodex.code, 'ok', 'successful chat should mark codex healthy');
    }

    const topicName = `Installed smoke ${Date.now()}`;
    const create = await fetchWithTimeout(`${base}/api/knowledge/create`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: topicName }),
    });
    assertOk(create.ok, `knowledge/create returned ${create.status}`);
    const created = await create.json() as { href?: string };
    assertOk(created.href, 'knowledge/create did not return href');

    const slug = created.href!.split('/').filter(Boolean).at(-1);
    assertOk(slug, 'could not derive doc slug from create href');
    const docId = `${slug}__${slug}`;

    const organize = await fetchWithTimeout(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Turn this into a short markdown note about smoke verification.' }],
        cli: 'codex',
        stage: 'capture-organize',
      }),
    }, 60_000);
    assertOk(organize.ok, `capture-organize returned ${organize.status}`);
    const organizedBody = parseSseText(await organize.text());
    assertOk(organizedBody.trim().length > 0, 'capture-organize returned empty note');

    const save = await fetchWithTimeout(`${base}/api/knowledge/doc`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ docId, body: organizedBody }),
    });
    assertOk(save.ok, `knowledge/doc returned ${save.status}`);

    const page = await fetchWithTimeout(`${base}${created.href}`);
    assertOk(page.ok, `doc page returned ${page.status}`);
    const html = await page.text();
    assert.equal(html.includes('This topic is still empty'), false, 'doc page still shows empty capture copy');
    assert.equal(html.includes('Organize into note'), false, 'doc page still shows capture action');

    console.log('installed app smoke ok');
  } catch (error) {
    if (stdout.trim()) console.error(`stdout:\n${stdout.trim()}`);
    if (stderr.trim()) console.error(`stderr:\n${stderr.trim()}`);
    throw error;
  } finally {
    await shutdown().catch(() => {});
    await rm(contentRoot, { recursive: true, force: true }).catch(() => {});
    await rm(knowledgeRoot, { recursive: true, force: true }).catch(() => {});
  }
}

void run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
