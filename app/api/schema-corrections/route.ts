import { NextResponse } from 'next/server';
import {
  appendSchemaCorrection,
  readSchemaCorrections,
  type SchemaCorrection,
} from '../../../lib/schema-corrections';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Phase 7.1 · Schema corrections API (dev / browser mode).
 *
 * POST /api/schema-corrections
 *   Body: {
 *     extractorId: "syllabus-pdf",
 *     sourceDocId: "ingested:Course Overview_FINS3640.pdf",
 *     fieldPath: "courseCode",
 *     newValue: "FINS 3640",
 *     originalValue: "FINS3640"
 *   }
 *   Returns `{ ok: true, corrections: SchemaCorrection[] }`
 *
 * GET /api/schema-corrections?extractorId=...&sourceDocId=...
 *   Returns `{ corrections: SchemaCorrection[] }`
 *
 * Under the shipped native app this route is never hit — the WKWebView
 * serves static `loom://bundle/` pages and there's no Next.js server.
 * Native corrections flow through
 * `window.webkit.messageHandlers.loomSchemaCorrections.postMessage(...)`
 * which routes to `LoomSchemaCorrectionsBridgeHandler.swift` and writes
 * the same sidecar file on disk.
 */

export async function GET(req: Request) {
  const url = new URL(req.url);
  const extractorId = url.searchParams.get('extractorId') ?? '';
  const sourceDocId = url.searchParams.get('sourceDocId') ?? '';
  if (!extractorId) {
    return NextResponse.json({ error: 'extractorId required' }, { status: 400 });
  }
  if (!sourceDocId) {
    return NextResponse.json({ error: 'sourceDocId required' }, { status: 400 });
  }
  const corrections = await readSchemaCorrections(extractorId, sourceDocId);
  return NextResponse.json({ corrections });
}

export async function POST(req: Request) {
  let body: {
    extractorId?: string;
    sourceDocId?: string;
    fieldPath?: string;
    newValue?: string;
    corrected?: string;
    originalValue?: string;
    original?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const extractorId = (body.extractorId ?? '').trim();
  const sourceDocId = (body.sourceDocId ?? '').trim();
  const fieldPath = (body.fieldPath ?? '').trim();
  const corrected = (body.newValue ?? body.corrected ?? '').trim();
  const original = (body.originalValue ?? body.original ?? '').trim();

  if (!extractorId) return NextResponse.json({ error: 'extractorId required' }, { status: 400 });
  if (!sourceDocId) return NextResponse.json({ error: 'sourceDocId required' }, { status: 400 });
  if (!fieldPath) return NextResponse.json({ error: 'fieldPath required' }, { status: 400 });
  if (!corrected) return NextResponse.json({ error: 'newValue required' }, { status: 400 });
  if (corrected === original) return NextResponse.json({ error: 'no change' }, { status: 400 });

  const entry: Omit<SchemaCorrection, 'at'> = {
    fieldPath,
    original,
    corrected,
  };
  const corrections = await appendSchemaCorrection(extractorId, sourceDocId, entry);
  return NextResponse.json({ ok: true, corrections });
}
