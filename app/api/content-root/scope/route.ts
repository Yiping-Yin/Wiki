import { NextResponse } from 'next/server';
import { readScanScope, writeScanScope } from '../../../../lib/scan-scope';
import { invalidateKnowledgeStoreCache } from '../../../../lib/knowledge-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET  /api/content-root/scope  → current ScanScope
 * POST /api/content-root/scope  → overwrite ScanScope (body: { included: string[] })
 */

export async function GET() {
  const scope = await readScanScope();
  return NextResponse.json(scope);
}

export async function POST(req: Request) {
  let body: { included?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  const included = Array.isArray(body.included)
    ? body.included.filter((s): s is string => typeof s === 'string')
    : [];
  const saved = await writeScanScope({ included });
  // Invalidate in-memory caches so the next read honors the new scope after
  // ingest. Callers are expected to trigger /api/ingest explicitly so the
  // on-disk manifest is rebuilt.
  invalidateKnowledgeStoreCache();
  return NextResponse.json(saved);
}
