/**
 * POST /api/decompose
 * Body: { source: { title, body? }, focus?: string }
 *
 * Asks the selected local CLI to identify 3-7 prerequisite concepts for the given material.
 * Returns JSON: { concepts: [{ name, why }] }
 *
 * Non-streaming. Spawns the selected local CLI, captures stdout, parses JSON.
 */
import { runCli, pickCli } from '../../../lib/claude-cli';
import { extractJson } from '../../../lib/ai/extract-json';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const SYSTEM_PROMPT = `You are a learning decomposer for Loom — a personal AI study tool.

Given a piece of source material (a paper, problem, chapter, code), identify the
3 to 7 most important PREREQUISITE concepts a learner must already know to fully
understand it.

Rules:
- Return ONLY a JSON object, no prose, no markdown fences.
- Each concept should be ATOMIC — one term, definition, or technique.
- "why" must be one short sentence explaining how this prereq is used.
- Order concepts roughly by depth of dependency (foundations first).
- If the material is itself a single concept, decompose into its components.

Format:
{
  "concepts": [
    { "name": "concept name", "why": "one sentence" }
  ]
}`;

function buildPrompt(source: { title: string; body?: string }, focus?: string): string {
  const parts: string[] = [];
  parts.push(SYSTEM_PROMPT);
  parts.push('');
  parts.push('--- SOURCE ---');
  parts.push(`Title: ${source.title}`);
  if (source.body) {
    // Cap body to keep prompt reasonable
    const body = source.body.slice(0, 6000);
    parts.push('');
    parts.push(body);
  }
  if (focus) {
    parts.push('');
    parts.push('--- FOCUS ---');
    parts.push(focus);
  }
  parts.push('');
  parts.push('Now output the JSON object:');
  return parts.join('\n');
}


export async function POST(req: Request) {
  let body: { source: { title: string; body?: string }; focus?: string; cli?: 'claude' | 'codex' };
  try { body = await req.json(); }
  catch { return Response.json({ error: 'invalid json' }, { status: 400 }); }

  if (!body?.source?.title) {
    return Response.json({ error: 'source.title required' }, { status: 400 });
  }

  const cli = pickCli(body);
  const prompt = buildPrompt(body.source, body.focus);
  try {
    const stdout = await runCli(prompt, { cli, timeoutMs: 110_000 });
    const parsed = extractJson(stdout);
    if (!parsed || !Array.isArray(parsed.concepts)) {
      return Response.json({
        error: 'failed to parse concepts',
        raw: stdout.slice(0, 500),
      }, { status: 502 });
    }

    const concepts = parsed.concepts
      .filter((c: any) => c && typeof c.name === 'string')
      .slice(0, 8)
      .map((c: any) => ({
        name: String(c.name).trim().slice(0, 80),
        why: String(c.why ?? '').trim().slice(0, 240),
      }));

    return Response.json({ concepts });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
