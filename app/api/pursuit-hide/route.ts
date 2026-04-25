import { NextResponse } from 'next/server';
import {
  hidePursuit,
  readPursuitHide,
  restorePursuit,
} from '../../../lib/pursuit-hide';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Phase 7.2 · Per-pursuit hide API (dev / browser mode).
 *
 * POST /api/pursuit-hide
 *   Body: {
 *     action: "hide" | "restore",
 *     pursuitId: "<uuid>",
 *     sourceDocId: "ingested:Course Overview_FINS3640.pdf"
 *   }
 *   Returns `{ ok: true, hiddenPursuitIds: string[] }`
 *
 * GET /api/pursuit-hide?sourceDocId=...
 *   Returns `{ hiddenPursuitIds: string[] }`
 *
 * Under the shipped native app this route is never hit — the
 * WKWebView posts via `loomPursuitHide.postMessage`, which routes to
 * `LoomPursuitHideBridgeHandler.swift` and writes the same sidecar.
 */

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sourceDocId = url.searchParams.get('sourceDocId') ?? '';
  if (!sourceDocId) {
    return NextResponse.json({ error: 'sourceDocId required' }, { status: 400 });
  }
  const hiddenPursuitIds = await readPursuitHide(sourceDocId);
  return NextResponse.json({ hiddenPursuitIds });
}

export async function POST(req: Request) {
  let body: {
    action?: string;
    pursuitId?: string;
    sourceDocId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const action = (body.action ?? '').trim();
  const pursuitId = (body.pursuitId ?? '').trim();
  const sourceDocId = (body.sourceDocId ?? '').trim();

  if (!action) return NextResponse.json({ error: 'action required' }, { status: 400 });
  if (!pursuitId) return NextResponse.json({ error: 'pursuitId required' }, { status: 400 });
  if (!sourceDocId) return NextResponse.json({ error: 'sourceDocId required' }, { status: 400 });

  if (action === 'hide') {
    const hiddenPursuitIds = await hidePursuit(pursuitId, sourceDocId);
    return NextResponse.json({ ok: true, hiddenPursuitIds });
  }
  if (action === 'restore') {
    const hiddenPursuitIds = await restorePursuit(pursuitId, sourceDocId);
    return NextResponse.json({ ok: true, hiddenPursuitIds });
  }
  return NextResponse.json({ error: `unknown action: ${action}` }, { status: 400 });
}
