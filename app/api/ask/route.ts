import Anthropic from '@anthropic-ai/sdk';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { embedQuery, cosine } from '../../../lib/embed';

export const runtime = 'nodejs';

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
  let q: string;
  try {
    const j = await req.json();
    q = j.q;
  } catch {
    return Response.json({ error: 'invalid JSON' }, { status: 400 });
  }
  if (!q || typeof q !== 'string') return Response.json({ error: 'missing q' }, { status: 400 });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return Response.json({ error: 'ANTHROPIC_API_KEY not set in .env.local' }, { status: 500 });

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

  // 4. Build context for Claude
  const context = sources
    .filter((s) => s.content.trim().length > 0)
    .map((s, i) => `[${i + 1}] ${s.title}\n${s.content}`)
    .join('\n\n---\n\n');

  // 5. Ask Claude
  const client = new Anthropic({ apiKey: key });
  const msg = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-6',
    max_tokens: 800,
    messages: [{
      role: 'user',
      content:
`You are an assistant grounded in the user's personal wiki. Answer the question using ONLY the sources below. Be concise (under 250 words). Cite sources by their bracketed number, e.g. [1], [3].

<sources>
${context || '(no relevant sources found — say so)'}
</sources>

Question: ${q}`,
    }],
  });

  const text = msg.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
  return Response.json({
    answer: text,
    sources: sources.map(({ id, title, href, score }) => ({ id, title, href, score })),
  });
}
