import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const root = process.cwd();
const nextBin = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
const buildIdPath = path.join(root, '.next-build', 'BUILD_ID');
const middlewareManifestPath = path.join(root, '.next-build', 'server', 'middleware-manifest.json');
const port = Number(process.env.LOOM_SMOKE_PORT || 3100);
const base = `http://127.0.0.1:${port}`;
const runChat = process.env.LOOM_SMOKE_CHAT === '1';
const manifestPaths = [
  path.join(root, 'knowledge', '.cache', 'manifest', 'knowledge-manifest.json'),
];
let docs = [];
for (const candidate of manifestPaths) {
  if (!existsSync(candidate)) continue;
  try {
    docs = JSON.parse(readFileSync(candidate, 'utf8'));
    break;
  } catch {}
}
const sampleKnowledgeDoc = docs.find((doc) => doc?.categorySlug && doc?.fileSlug && doc?.title);

if (!existsSync(buildIdPath) || !existsSync(middlewareManifestPath)) {
  console.error('Missing complete .next-build output. Run `npm run build` before `npm run smoke`.');
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function fetchWithTimeout(url, init = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function waitForReady(timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetchWithTimeout(`${base}/api/health`, {}, 2000);
      if (res.ok) return;
    } catch {}
    await delay(400);
  }
  throw new Error(`Server did not become ready within ${timeoutMs}ms`);
}

async function checkHealth() {
  const res = await fetchWithTimeout(`${base}/api/health`);
  assert(res.ok, `/api/health returned ${res.status}`);
  const body = await res.json();
  assert(body?.ok === true, '/api/health payload missing ok=true');
  console.log('health ok');
}

async function checkPage(route, expectedText) {
  const res = await fetchWithTimeout(`${base}${route}`);
  assert(res.ok, `${route} returned ${res.status}`);
  const html = await res.text();
  assert(html.includes(expectedText), `${route} missing expected text: ${expectedText}`);
  console.log(`${route} ok`);
}

async function checkKnowledgeDoc() {
  if (!sampleKnowledgeDoc) {
    console.log('/knowledge sample skipped (no manifest doc)');
    return;
  }
  const route = `/knowledge/${sampleKnowledgeDoc.categorySlug}/${sampleKnowledgeDoc.fileSlug}`;
  const res = await fetchWithTimeout(`${base}${route}`);
  assert(res.ok, `${route} returned ${res.status}`);
  const html = await res.text();
  assert(html.includes(sampleKnowledgeDoc.title), `${route} missing expected title`);

  const docBodyRes = await fetchWithTimeout(`${base}/api/doc-body?id=${encodeURIComponent(`know/${sampleKnowledgeDoc.id}`)}`);
  assert(docBodyRes.ok, `/api/doc-body returned ${docBodyRes.status}`);
  const docBody = await docBodyRes.json();
  assert(typeof docBody?.body === 'string', '/api/doc-body missing body string');
  console.log(`${route} ok`);
  console.log('/api/doc-body ok');
}

async function checkChat() {
  const res = await fetchWithTimeout(`${base}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cli: 'claude',
      messages: [{ role: 'user', content: 'Reply with exactly: hi' }],
    }),
  }, 30000);
  assert(res.ok, `/api/chat returned ${res.status}`);
  assert((res.headers.get('content-type') || '').includes('text/event-stream'), '/api/chat did not return SSE');
  const text = await res.text();
  assert(text.includes('data: {"delta":"hi"}'), '/api/chat missing expected delta');
  assert(text.includes('data: [DONE]'), '/api/chat missing [DONE]');
  console.log('/api/chat ok');
}

const child = spawn(process.execPath, [nextBin, 'start', '-p', String(port), '-H', '127.0.0.1'], {
  cwd: root,
  env: { ...process.env, LOOM_DIST_DIR: '.next-build' },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let stdout = '';
let stderr = '';
child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

const shutdown = () => {
  if (!child.killed) child.kill('SIGTERM');
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

try {
  await waitForReady();
  await checkHealth();
  await checkPage('/', '<title>Loom</title>');
  await checkPage('/offline', 'Offline');
  await checkKnowledgeDoc();
  if (runChat) {
    await checkChat();
  } else {
    console.log('/api/chat skipped (set LOOM_SMOKE_CHAT=1 to enable)');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  if (stdout.trim()) console.error('\nstdout:\n' + stdout.trim());
  if (stderr.trim()) console.error('\nstderr:\n' + stderr.trim());
  shutdown();
  process.exit(1);
}

shutdown();
await new Promise((resolve) => child.once('exit', resolve));
console.log('smoke ok');
