import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Phase 7.3 · Extractor-anchor read API (dev / browser mode).
 *
 * Native runs use `loom://native/extractor-anchors-for-doc/<docId>.json`
 * which Swift's `LoomExtractorAnchorsBridge` answers by walking the
 * persisted ingestion traces directly. There is no equivalent
 * web-side trace store today (LoomTraces live in IndexedDB on the
 * client, not on the dev Next.js server), so this dev-mode route
 * simply returns an empty list — the reading page renders without
 * a provisional layer in `npm run dev`.
 *
 * Returning an empty list (rather than 501 / 503) keeps the client
 * code symmetric: `loadProvisionalAnchors()` always resolves to an
 * array, and the `ExtractorAnchorLayer` collapses to nothing when
 * the list is empty. End-to-end testing happens inside the macOS
 * shell where the Swift resolver is wired up.
 *
 * GET /api/extractor-anchors?docId=<readingDocId>
 *   Returns `{ docId, anchors: [] }`
 */

export async function GET(req: Request) {
  const url = new URL(req.url);
  const docId = url.searchParams.get('docId') ?? '';
  if (!docId) {
    return NextResponse.json({ error: 'docId required' }, { status: 400 });
  }
  return NextResponse.json({ docId, anchors: [] });
}
