import Anthropic from '@anthropic-ai/sdk';
import { promises as fs } from 'fs';
import path from 'path';
import { chapters } from '../../../lib/nav';
import { allDocs } from '../../../lib/knowledge';

export const runtime = 'nodejs';

type Source = { id: string; title: string; content: string; href: string };

async function loadCorpus(): Promise<Source[]> {
  const out: Source[] = [];

  // 1. LLM wiki chapters
  const wikiRoot = path.join(process.cwd(), 'app', 'wiki');
  for (const c of chapters) {
    try {
      const p = path.join(wikiRoot, c.slug, 'page.mdx');
      const content = await fs.readFile(p, 'utf-8');
      out.push({ id: `wiki/${c.slug}`, title: c.title, content, href: `/wiki/${c.slug}` });
    } catch {}
  }

  // 2. Personal knowledge — load body files
  const docsDir = path.join(process.cwd(), 'public', 'knowledge', 'docs');
  for (const d of allDocs) {
    try {
      const raw = await fs.readFile(path.join(docsDir, `${d.id}.json`), 'utf-8');
      const body = JSON.parse(raw).body ?? '';
      out.push({
        id: `know/${d.id}`,
        title: `${d.title} (${d.category})`,
        content: body.slice(0, 6000),
        href: `/knowledge/${d.categorySlug}/${d.fileSlug}`,
      });
    } catch {}
  }

  return out;
}

let _corpusCache: Source[] | null = null;
async function corpus() {
  if (_corpusCache) return _corpusCache;
  _corpusCache = await loadCorpus();
  return _corpusCache;
}

function score(content: string, q: string) {
  const terms = q.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  const text = content.toLowerCase();
  return terms.reduce((s, t) => s + (text.split(t).length - 1), 0);
}

export async function POST(req: Request) {
  const { q } = await req.json();
  if (!q) return Response.json({ error: 'missing q' }, { status: 400 });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return Response.json({ error: 'ANTHROPIC_API_KEY not set in .env.local' }, { status: 500 });

  const c = await corpus();
  const ranked = c.map((s) => ({ ...s, score: score(s.content, q) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  const context = ranked.map((r) => `## ${r.title}\n${r.content.slice(0, 2000)}`).join('\n\n---\n\n');

  const client = new Anthropic({ apiKey: key });
  const msg = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-6',
    max_tokens: 800,
    messages: [{
      role: 'user',
      content: `You are an assistant grounded in the user's personal wiki below. Answer concisely (under 250 words) using ONLY this context. Cite sources by their title in [brackets].\n\n<wiki>\n${context || '(no relevant docs found)'}\n</wiki>\n\nQuestion: ${q}`,
    }],
  });
  const text = msg.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
  return Response.json({
    answer: text,
    sources: ranked.map((r) => ({ id: r.id, title: r.title, href: r.href })),
  });
}
