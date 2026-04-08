/**
 * POST /api/complete  { context: string, doc?: { title, body } }
 *
 * Returns a single short next-sentence completion via the local claude CLI.
 * Used by NoteEditor for inline ghost-text suggestions.
 *
 * Output: { suggestion: string }
 *
 * The suggestion is one sentence (≤ 30 words). It's NOT a full essay — just
 * what the user might write next given what they have so far.
 */
import { runCli, pickCli } from '../../../lib/claude-cli';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  let body: { context: string; doc?: { title?: string; body?: string }; cli?: string };
  try { body = await req.json(); }
  catch { return Response.json({ error: 'invalid json' }, { status: 400 }); }
  if (!body.context || body.context.length < 4) {
    return Response.json({ suggestion: '' });
  }
  const cli = pickCli(body);

  const docCtx = body.doc?.body
    ? `\n\nThe user is taking notes on this document:\nTitle: ${body.doc.title ?? '(unknown)'}\n${body.doc.body.slice(0, 1500)}`
    : '';

  const prompt = `You are an inline writing assistant inside a personal knowledge wiki.
The user is in the middle of writing a note. Suggest ONE short continuation
(at most 30 words, one sentence) that would naturally continue what they wrote.
Output ONLY the continuation text, no quotes, no preamble, no labels.
If no good continuation exists, output an empty string.${docCtx}

Note so far:
"""
${body.context.slice(-1500)}
"""

Continuation:`;

  try {
    const text = await runCli(prompt, { cli, timeoutMs: 25000 });
    let suggestion = text.trim()
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/^Continuation:\s*/i, '')
      .split('\n')[0]
      .slice(0, 200);
    return Response.json({ suggestion });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
