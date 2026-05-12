import { NextResponse } from 'next/server';
import {
  addCorrection,
  clearCorrections,
  readCorrections,
  type SourceCorrection,
} from '../../../lib/source-corrections';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Source Correct API — store / read / clear literal text fixes for a doc.
 *
 * Protocol:
 *  - POST { id, before, after, contextBefore?, contextAfter? } → append
 *    correction. Edit distance clamped to ≤ 20 chars so this can't become a
 *    freeform rewrite path.
 *  - GET ?id=<docId> → list current corrections.
 *  - DELETE ?id=<docId> → clear all corrections for the doc.
 */

const MAX_EDIT_DIST = 20;

function levenshtein(a: string, b: string): number {
  // Standard DP — used only to bound correction size; n*m stays small since
  // we only call it on typo-scale strings.
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev: number[] = new Array(n + 1);
  const cur: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j += 1) prev[j] = j;
  for (let i = 1; i <= m; i += 1) {
    cur[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j += 1) prev[j] = cur[j];
  }
  return prev[n];
}

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const corrections = await readCorrections(id);
  return NextResponse.json({ corrections });
}

export async function POST(req: Request) {
  let body: {
    id?: string;
    before?: string;
    after?: string;
    contextBefore?: string;
    contextAfter?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const id = (body.id ?? '').trim();
  const before = body.before ?? '';
  const after = body.after ?? '';
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  if (!before) return NextResponse.json({ error: 'before required' }, { status: 400 });
  if (before === after) return NextResponse.json({ error: 'no change' }, { status: 400 });

  const dist = levenshtein(before, after);
  if (dist > MAX_EDIT_DIST) {
    return NextResponse.json({
      error: `edit distance ${dist} exceeds ${MAX_EDIT_DIST} — use the edit surface for substantive rewrites, not Source Correct`,
    }, { status: 400 });
  }

  const correction: Omit<SourceCorrection, 'at'> = {
    before,
    after,
    ...(typeof body.contextBefore === 'string' ? { contextBefore: body.contextBefore } : {}),
    ...(typeof body.contextAfter === 'string' ? { contextAfter: body.contextAfter } : {}),
  };
  const corrections = await addCorrection(id, correction);
  return NextResponse.json({ ok: true, corrections });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  await clearCorrections(id);
  return NextResponse.json({ ok: true });
}
