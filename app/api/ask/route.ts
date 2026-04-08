import { promises as fs } from 'node:fs';
import path from 'node:path';
import { embedQuery, cosine } from '../../../lib/embed';
import { runCli, pickCli } from '../../../lib/claude-cli';

export const runtime = 'nodejs';
export const maxDuration = 300;

type IndexedDoc = { id: string; title: string; href: string; vector: number[] };
type Index = { dim: number; docs: IndexedDoc[] };

let _indexCache: Index | null = null;
let _bodyCache: Map<string, string> | null = null;

async function loadIndex(): Promise<Index | null> {
  if (_indexCache) return _indexCache;
  try {
    const raw = await fs.readFile(path.join(process.cwd(), 'public', 'rag-index.json'), 'utf-8');
    _indexCache = JSON.parse(raw) as Index;
    return _indexCache;
  } catch {
    return null;
  }
}

async function loadBody(id: string): Promise<string> {
  if (!_bodyCache) _bodyCache = new Map();
  if (_bodyCache.has(id)) return _bodyCache.get(id)!;
  let body = '';
  try {
    if (id.startsWith('wiki/')) {
      const slug = id.slice('wiki/'.length);
      const p = path.join(process.cwd(), 'app', 'wiki', slug, 'page.mdx');
      body = await fs.readFile(p, 'utf-8');
    } else if (id.startsWith('know/')) {
      const docId = id.slice('know/'.length);
      const p = path.join(process.cwd(), 'public', 'knowledge', 'docs', `${docId}.json`);
      body = JSON.parse(await fs.readFile(p, 'utf-8')).body ?? '';
    }
  } catch {}
  _bodyCache.set(id, body);
  return body;
}

export async function POST(req: Request) {
  let body: any;
  try { body = await req.json(); }
  catch { return Response.json({ error: 'invalid JSON' }, { status: 400 }); }
  const q: string = body.q;
  if (!q || typeof q !== 'string') return Response.json({ error: 'missing q' }, { status: 400 });
  const cli = pickCli(body);

  const idx = await loadIndex();
  if (!idx) {
    return Response.json({
      error: 'rag-index.json missing — run `npx tsx scripts/build-rag-index.ts` first',
    }, { status: 503 });
  }

  // 1. Embed query locally
  const qVec = await embedQuery(q);

  // 2. Cosine similarity → top 6
  const ranked = idx.docs
    .map((d) => ({ d, score: cosine(qVec, d.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  // 3. Hydrate bodies for the top 6
  const sources = await Promise.all(
    ranked.map(async ({ d, score }) => ({
      id: d.id,
      title: d.title,
      href: d.href,
      score: Math.round(score * 1000) / 1000,
      content: (await loadBody(d.id)).slice(0, 2200),
    })),
  );

  // 4. Build context for Claude CLI
  const context = sources
    .filter((s) => s.content.trim().length > 0)
    .map((s, i) => `[${i + 1}] ${s.title}\n${s.content}`)
    .join('\n\n---\n\n');

  const prompt = `You are an assistant grounded in the user's personal wiki. Answer the question using ONLY the sources below. Be concise (under 250 words). Cite sources by their bracketed number, e.g. [1], [3].

<sources>
${context || '(no relevant sources found — say so)'}
</sources>

Question: ${q}`;

  try {
    const text = await runCli(prompt, { cli, timeoutMs: 120000 });
    return Response.json({
      answer: text,
      sources: sources.map(({ id, title, href, score }) => ({ id, title, href, score })),
    });
  } catch (e: any) {
    return Response.json({ error: 'claude CLI failed: ' + e.message }, { status: 500 });
  }
}
