/**
 * POST /api/recommend
 *
 * Body: { recent: [{title}], weak: [{title, score, total}], noted: [{title}] }
 *
 * Asks the selected local CLI to generate 3 personalised "today's focus" cards.
 * Output is strict JSON: { items: [{ title, why, action }] }
 *
 * Client caches the result for the day (localStorage key includes the date).
 */
import { runCli, pickCli } from '../../../lib/claude-cli';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 90;

type Item = { title?: string };
type Weak = { title?: string; score?: number; total?: number };

export async function POST(req: Request) {
  let body: { recent?: Item[]; weak?: Weak[]; noted?: Item[]; cli?: string };
  try { body = await req.json(); }
  catch { return Response.json({ error: 'invalid json' }, { status: 400 }); }
  const cli = pickCli(body);

  const recent = (body.recent ?? []).slice(0, 5).map((r) => r.title ?? '').filter(Boolean);
  const weak = (body.weak ?? []).slice(0, 4).map((w) => `${w.title ?? ''} (${w.score}/${w.total})`).filter(Boolean);
  const noted = (body.noted ?? []).slice(0, 4).map((n) => n.title ?? '').filter(Boolean);

  if (recent.length === 0 && weak.length === 0 && noted.length === 0) {
    return Response.json({ items: [] });
  }

  const prompt = `You are an inline study coach inside a personal knowledge wiki.
Based on the user's recent activity, generate exactly 3 short personalised
"focus for today" suggestions. Keep them concrete and actionable.

Output STRICT JSON only, no preamble or fences:

{
  "items": [
    { "title": "<2-5 word headline>", "why": "<1 sentence reason>", "action": "<verb-led action they can take>" },
    { "title": "...", "why": "...", "action": "..." },
    { "title": "...", "why": "...", "action": "..." }
  ]
}

User context:
Recently viewed: ${recent.length > 0 ? recent.join('; ') : '(none)'}
Weak quiz spots: ${weak.length > 0 ? weak.join('; ') : '(none)'}
Has notes on: ${noted.length > 0 ? noted.join('; ') : '(none)'}

Begin JSON:`;

  try {
    const text = await runCli(prompt, { cli, timeoutMs: 60000 });
    const cleaned = text.trim().replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();
    let parsed: any;
    try { parsed = JSON.parse(cleaned); }
    catch {
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
      else throw new Error('non-JSON');
    }
    const items = Array.isArray(parsed.items) ? parsed.items.slice(0, 3).map((it: any) => ({
      title: String(it.title ?? '').slice(0, 60),
      why: String(it.why ?? '').slice(0, 200),
      action: String(it.action ?? '').slice(0, 100),
    })).filter((it: any) => it.title) : [];
    return Response.json({ items });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
