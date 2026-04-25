import { NextResponse } from 'next/server';
import {
  appendDismissedFingerprint,
  readDismissedFingerprints,
} from '../../../lib/extractor-anchors-dismissed';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Phase 7.3 · Extractor-anchor dismissal API (dev / browser mode).
 *
 * Mirrors the shape of `/api/schema-corrections`. Native runs hit
 * `LoomExtractorAnchorsBridgeHandler` instead — this route is the
 * dev-server fallback that writes the same on-disk sidecar.
 *
 * GET  /api/extractor-anchors-dismissed?docId=<readingDocId>
 *   Returns `{ dismissedFingerprints: string[] }`
 *
 * POST /api/extractor-anchors-dismissed
 *   Body: { docId: "know/...", fingerprint: "<traceId>::keyQuotes[2]" }
 *   Returns `{ ok: true, dismissedFingerprints: string[] }`
 */

export async function GET(req: Request) {
  const url = new URL(req.url);
  const docId = url.searchParams.get('docId') ?? '';
  if (!docId) {
    return NextResponse.json({ error: 'docId required' }, { status: 400 });
  }
  const dismissedFingerprints = await readDismissedFingerprints(docId);
  return NextResponse.json({ dismissedFingerprints });
}

export async function POST(req: Request) {
  let body: { docId?: string; fingerprint?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  const docId = (body.docId ?? '').trim();
  const fingerprint = (body.fingerprint ?? '').trim();
  if (!docId) return NextResponse.json({ error: 'docId required' }, { status: 400 });
  if (!fingerprint)
    return NextResponse.json({ error: 'fingerprint required' }, { status: 400 });

  const dismissedFingerprints = await appendDismissedFingerprint(docId, fingerprint);
  return NextResponse.json({ ok: true, dismissedFingerprints });
}
