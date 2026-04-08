/**
 * POST /api/summarize  { id: string }
 *
 * Returns a cached AI summary of a knowledge doc.
 * Uses the LOCAL `claude` CLI — no API key required.
 *
 * Cache: public/knowledge/summaries/<id>.json
 *   { id, summary, bullets[], keyTerms[], generatedAt }
 */
import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { runCli, pickCli } from '../../../lib/claude-cli';

export const runtime = 'nodejs';
export const maxDuration = 300;

const SUMMARY_DIR = path.join(process.cwd(), 'public', 'knowledge', 'summaries');
const BODY_DIR = path.join(process.cwd(), 'public', 'knowledge', 'docs');

function safeId(id: string): string | null {
  if (!/^[a-z0-9_\-\u4e00-\u9fa5]+$/.test(id)) return null;
  return id;
}

export async function POST(req: Request) {
  let body: any;
  try { body = await req.json(); }
  catch { return Response.json({ error: 'invalid JSON' }, { status: 400 }); }
  const id: string = body.id;
  const safe = id ? safeId(id) : null;
  if (!safe) return Response.json({ error: 'invalid id' }, { status: 400 });
  const cli = pickCli(body);

  const cachePath = path.join(SUMMARY_DIR, `${safe}.json`);
  if (existsSync(cachePath)) {
    try {
      const cached = JSON.parse(await fs.readFile(cachePath, 'utf-8'));
      return Response.json({ ...cached, cached: true });
    } catch {}
  }

  const bodyPath = path.join(BODY_DIR, `${safe}.json`);
  let docBody = '';
  let title = safe;
  try {
    const j = JSON.parse(await fs.readFile(bodyPath, 'utf-8'));
    docBody = j.body ?? '';
    title = j.title ?? safe;
  } catch {
    return Response.json({ error: 'doc not found' }, { status: 404 });
  }

  if (docBody.trim().length < 50) {
    return Response.json({ error: 'doc has no extractable text' }, { status: 422 });
  }

  const prompt = `Summarize this document. Output STRICT JSON only, no preamble, no code fences:

{
  "summary": "<2-3 sentence overview>",
  "bullets": ["<key point 1>", "<key point 2>", "<key point 3>", "<key point 4>", "<key point 5>"],
  "keyTerms": ["<term>", "<term>", "<term>", "<term>", "<term>"]
}

Document title: ${title}

Document text (may contain OCR artefacts — extract the meaning, ignore formatting noise):
"""
${docBody.slice(0, 12000)}
"""`;

  try {
    const text = await runCli(prompt, { cli, timeoutMs: 180000 });
    const cleaned = text.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
    let parsed: any;
    try { parsed = JSON.parse(cleaned); }
    catch {
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
