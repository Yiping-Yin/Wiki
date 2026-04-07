import Anthropic from '@anthropic-ai/sdk';
import { promises as fs } from 'fs';
import path from 'path';
import { chapters } from '../../../lib/nav';

export const runtime = 'nodejs';

async function loadCorpus() {
  const root = path.join(process.cwd(), 'app', 'wiki');
  const out: { slug: string; title: string; content: string }[] = [];
  for (const c of chapters) {
    try {
      const p = path.join(root, c.slug, 'page.mdx');
      const content = await fs.readFile(p, 'utf-8');
      out.push({ slug: c.slug, title: c.title, content });
    } catch {}
  }
  return out;
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

  const corpus = await loadCorpus();
  const ranked = corpus.map((c) => ({ ...c, s: score(c.content, q) })).sort((a, b) => b.s - a.s).slice(0, 4);
  const context = ranked.map((c) => `## ${c.title}\n${c.content.slice(0, 2500)}`).join('\n\n---\n\n');

  const client = new Anthropic({ apiKey: key });
  const msg = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-6',
    max_tokens: 800,
    messages: [{
      role: 'user',
      content: `You are an assistant grounded in the LLM Wiki below. Answer the user's question concisely (under 200 words) using ONLY this context. Cite chapters by name.\n\n<wiki>\n${context}\n</wiki>\n\nQuestion: ${q}`,
    }],
  });
  const text = msg.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
  return Response.json({ answer: text, sources: ranked.map((c) => c.slug) });
}
