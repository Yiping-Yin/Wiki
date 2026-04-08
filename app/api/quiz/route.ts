/**
 * POST /api/quiz  { id: string }
 *
 * Generates 3 multiple-choice questions via the LOCAL `claude` CLI, cached.
 * No API key required.
 */
import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { runClaude } from '../../../lib/claude-cli';

export const runtime = 'nodejs';
export const maxDuration = 300;

const QUIZ_DIR = path.join(process.cwd(), 'public', 'knowledge', 'quizzes');
const KNOWLEDGE_DIR = path.join(process.cwd(), 'public', 'knowledge', 'docs');
const WIKI_DIR = path.join(process.cwd(), 'app', 'wiki');

function safeId(id: string): string | null {
  if (!/^[a-z0-9_\-\u4e00-\u9fa5/]+$/.test(id)) return null;
  return id;
}
function cacheKey(id: string): string { return id.replace(/\//g, '__'); }

async function loadBody(id: string): Promise<{ body: string; title: string } | null> {
  if (id.startsWith('wiki/')) {
    const slug = id.slice('wiki/'.length);
    try {
      const raw = await fs.readFile(path.join(WIKI_DIR, slug, 'page.mdx'), 'utf-8');
      const title = (raw.match(/^#\s+(.+)$/m)?.[1] ?? slug).trim();
      return { body: raw, title };
    } catch { return null; }
  }
  try {
    const raw = await fs.readFile(path.join(KNOWLEDGE_DIR, `${id}.json`), 'utf-8');
    const j = JSON.parse(raw);
    return { body: j.body ?? '', title: j.title ?? id };
  } catch { return null; }
}

export async function POST(req: Request) {
  let id: string;
  try { id = (await req.json()).id; }
  catch { return Response.json({ error: 'invalid JSON' }, { status: 400 }); }
  const safe = id ? safeId(id) : null;
  if (!safe) return Response.json({ error: 'invalid id' }, { status: 400 });

  const cacheFile = path.join(QUIZ_DIR, `${cacheKey(safe)}.json`);
  if (existsSync(cacheFile)) {
    try {
      return Response.json({ ...JSON.parse(await fs.readFile(cacheFile, 'utf-8')), cached: true });
    } catch {}
  }

  const doc = await loadBody(safe);
  if (!doc) return Response.json({ error: 'doc not found' }, { status: 404 });
  if (doc.body.trim().length < 100) {
    return Response.json({ error: 'doc too short to quiz' }, { status: 422 });
  }

  const prompt = `Create 3 multiple-choice questions to test understanding of this document. Output STRICT JSON, no preamble or fences:

{
  "questions": [
    {
      "q": "<question stem>",
      "choices": ["<A>", "<B>", "<C>", "<D>"],
      "correct": 0,
      "explain": "<1-2 sentence explanation>"
    }
  ]
}

Rules:
- Test conceptual understanding, not trivia
- "correct" is the 0-indexed position of the right answer
- Distractors should be plausible
- One easy, one medium, one hard

Document title: ${doc.title}

Document text:
"""
${doc.body.slice(0, 12000)}
"""`;

  try {
    const text = await runClaude(prompt, { timeoutMs: 180000 });
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
      questions: (parsed.questions ?? []).slice(0, 5).map((q: any) => ({
        q: String(q.q ?? ''),
        choices: Array.isArray(q.choices) ? q.choices.slice(0, 4).map(String) : [],
        correct: Number.isInteger(q.correct) ? Math.max(0, Math.min(3, q.correct)) : 0,
        explain: String(q.explain ?? ''),
      })).filter((q: any) => q.q && q.choices.length === 4),
      generatedAt: new Date().toISOString(),
    };
    if (result.questions.length === 0) {
      return Response.json({ error: 'model returned no usable questions' }, { status: 500 });
    }
    await fs.mkdir(QUIZ_DIR, { recursive: true });
    await fs.writeFile(cacheFile, JSON.stringify(result, null, 2));
    return Response.json({ ...result, cached: false });
  } catch (e: any) {
    return Response.json({ error: 'quiz generation failed: ' + e.message }, { status: 500 });
  }
}
