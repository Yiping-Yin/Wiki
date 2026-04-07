/**
 * POST /api/summarize  { id: string }
 *
 * Returns a cached AI summary of a knowledge doc.
 * If no cache exists, calls Claude to generate one and persists to disk.
 *
 * Cache: public/knowledge/summaries/<id>.json
 *   { id, summary, bullets: string[], keyTerms: string[], generatedAt }
 */
import Anthropic from '@anthropic-ai/sdk';
import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';

export const runtime = 'nodejs';

const SUMMARY_DIR = path.join(process.cwd(), 'public', 'knowledge', 'summaries');
const BODY_DIR = path.join(process.cwd(), 'public', 'knowledge', 'docs');

function safeId(id: string): string | null {
  if (!/^[a-z0-9_\-\u4e00-\u9fa5]+$/.test(id)) return null;
  return id;
}

export async function POST(req: Request) {
  let id: string;
  try {
    const j = await req.json();
    id = j.id;
  } catch {
    return Response.json({ error: 'invalid JSON' }, { status: 400 });
  }
  const safe = id ? safeId(id) : null;
  if (!safe) return Response.json({ error: 'invalid id' }, { status: 400 });

  const cachePath = path.join(SUMMARY_DIR, `${safe}.json`);
  if (existsSync(cachePath)) {
    try {
      const cached = JSON.parse(await fs.readFile(cachePath, 'utf-8'));
      return Response.json({ ...cached, cached: true });
    } catch {}
  }

  // Load body
  const bodyPath = path.join(BODY_DIR, `${safe}.json`);
  let body = '';
  let title = safe;
  try {
    const j = JSON.parse(await fs.readFile(bodyPath, 'utf-8'));
    body = j.body ?? '';
    title = j.title ?? safe;
  } catch {
    return Response.json({ error: 'doc not found' }, { status: 404 });
  }

  if (body.trim().length < 50) {
    return Response.json({ error: 'doc has no extractable text' }, { status: 422 });
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return Response.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 });

  const client = new Anthropic({ apiKey: key });
  const prompt = `Summarize this document. Output STRICT JSON only, no preamble or code fences:

{
  "summary": "<2-3 sentence overview>",
  "bullets": ["<key point 1>", "<key point 2>", "<key point 3>", "<key point 4>", "<key point 5>"],
  "keyTerms": ["<term>", "<term>", "<term>", "<term>", "<term>"]
}

Document title: ${title}

Document text (may contain OCR/extraction artefacts — extract the meaning, ignore formatting noise):
"""
${body.slice(0, 12000)}
"""`;

  try {
    const msg = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-6',
      max_tokens: 700,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = msg.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim();
    // strip code fences if any
    const cleaned = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // try extracting first {...} block
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
      else throw new Error('non-JSON response');
    }

    const result = {
      id: safe,
      summary: String(parsed.summary ?? ''),
      bullets: Array.isArray(parsed.bullets) ? parsed.bullets.slice(0, 8).map(String) : [],
      keyTerms: Array.isArray(parsed.keyTerms) ? parsed.keyTerms.slice(0, 12).map(String) : [],
      generatedAt: new Date().toISOString(),
    };

    await fs.mkdir(SUMMARY_DIR, { recursive: true });
    await fs.writeFile(cachePath, JSON.stringify(result, null, 2));

    return Response.json({ ...result, cached: false });
  } catch (e: any) {
    return Response.json({ error: 'summarization failed: ' + e.message }, { status: 500 });
  }
}
