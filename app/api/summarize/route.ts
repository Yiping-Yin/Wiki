/**
 * POST /api/summarize  { id: string }
 *
 * Returns a cached AI summary of a knowledge doc.
 * Uses the selected local CLI — no API key required.
 *
 * Cache: public/knowledge/summaries/<id>.json
 *   { id, summary, bullets[], keyTerms[], generatedAt }
 */
import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import { invokeLocalRuntime } from '../../../lib/ai-runtime/invoke';
import { pickCli } from '../../../lib/claude-cli';
import { extractJson } from '../../../lib/ai/extract-json';
import { legacyPublicCachePath, runtimeCacheDir, runtimeCachePath } from '../../../lib/generated-cache';
import { readKnowledgeDocBody } from '../../../lib/knowledge-doc-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

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

  const cachePaths = [runtimeCachePath('summaries', safe), legacyPublicCachePath('summaries', safe)];
  for (const cachePath of cachePaths) {
    if (!existsSync(cachePath)) continue;
    try {
      const cached = JSON.parse(await fs.readFile(cachePath, 'utf-8'));
      return Response.json({ ...cached, cached: true });
    } catch {}
  }

  let docBody = '';
  let title = safe;
  const j = await readKnowledgeDocBody(safe);
  if (!j) {
    return Response.json({ error: 'doc not found' }, { status: 404 });
  }
  docBody = j.body ?? '';
  title = j.title ?? safe;

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

  const result = await invokeLocalRuntime({
    preferred: cli,
    prompt,
    timeoutMs: 180000,
  });

  if (result.runtime === null) {
    return Response.json({ error: result.userMessage }, { status: 500 });
  }

  const parsed = extractJson(result.text);
  if (!parsed) {
    return Response.json({ error: 'summarization failed: non-JSON response' }, { status: 500 });
  }

  const summaryResult = {
    id: safe,
    summary: String(parsed.summary ?? ''),
    bullets: Array.isArray(parsed.bullets) ? parsed.bullets.slice(0, 8).map(String) : [],
    keyTerms: Array.isArray(parsed.keyTerms) ? parsed.keyTerms.slice(0, 12).map(String) : [],
    generatedAt: new Date().toISOString(),
  };
  const cachePath = runtimeCachePath('summaries', safe);
  await fs.mkdir(runtimeCacheDir('summaries'), { recursive: true });
  await fs.writeFile(cachePath, JSON.stringify(summaryResult, null, 2));
  return Response.json({
    ...summaryResult,
    cached: false,
    runtime: result.runtime,
    fellBack: result.fellBack,
    notice: result.notice,
  });
}
