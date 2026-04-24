/**
 * Phase 7.1 · Schema records loader.
 *
 * Companion to `lib/loom-panel-records.ts` / `loom-pursuit-records.ts`
 * — fetches extracted SyllabusSchema (and sibling schemas) from the
 * Swift native bridge so reading pages can render a "Course Context"
 * strip without a separate HTTP server.
 *
 * Two entry points:
 *   - `loadSchemaForReadingDoc(docId)` — the common case. Called from
 *     `CourseContextStrip` with the reading page's docId
 *     (`know/<cat>__<file>`); Swift's `SchemaResolver` walks sibling
 *     ingestion traces and returns the best match (or null, in which
 *     case the strip hides itself per plan §5.1).
 *   - `loadSchemaByTraceId(traceId)` — direct lookup reserved for
 *     Phase 7.2 detail surfaces. Not used by the strip today.
 *
 * Browser / dev mode: these endpoints only exist under the native
 * shell (via `loom://native/...`), so both functions return null
 * when `isNativeMode()` is false. Reading pages that want to test
 * this locally should run inside the macOS app.
 */

import { fetchNativeJson } from './loom-native-json';

/** A single user correction layered over the extracted schema. */
export type SchemaCorrection = {
  fieldPath: string;
  original: string;
  corrected: string;
  at: number;
};

/** The response shape from `loom://native/schema-for-doc/<docId>.json`. */
export type SchemaRecord = {
  traceId: string;
  extractorId: string;
  sourceDocId: string;
  sourceTitle: string;
  /**
   * Parsed schema JSON — shape depends on `extractorId`. Phase 7.1
   * only surfaces `syllabus-pdf` to the reading page, but the payload
   * is intentionally typed as `unknown` so Phase 7.2 / 7.3 can add
   * more extractor kinds without a contract break here.
   */
  schema: unknown;
  corrections: SchemaCorrection[];
  updatedAt: number;
};

function coerceRecord(raw: unknown): SchemaRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.traceId !== 'string' || obj.traceId === '') return null;
  if (typeof obj.extractorId !== 'string' || obj.extractorId === '') return null;
  const corrections = Array.isArray(obj.corrections)
    ? obj.corrections.filter(
        (c): c is SchemaCorrection =>
          !!c &&
          typeof c === 'object' &&
          typeof (c as SchemaCorrection).fieldPath === 'string' &&
          typeof (c as SchemaCorrection).corrected === 'string',
      )
    : [];
  return {
    traceId: obj.traceId,
    extractorId: obj.extractorId,
    sourceDocId: typeof obj.sourceDocId === 'string' ? obj.sourceDocId : '',
    sourceTitle: typeof obj.sourceTitle === 'string' ? obj.sourceTitle : '',
    schema: obj.schema,
    corrections,
    updatedAt: typeof obj.updatedAt === 'number' ? obj.updatedAt : 0,
  };
}

export async function loadSchemaForReadingDoc(
  docId: string,
): Promise<SchemaRecord | null> {
  if (!docId) return null;
  const encoded = encodeURIComponent(docId);
  const url = `loom://native/schema-for-doc/${encoded}.json`;
  const raw = await fetchNativeJson<unknown>(url);
  return coerceRecord(raw);
}

export async function loadSchemaByTraceId(
  traceId: string,
): Promise<SchemaRecord | null> {
  if (!traceId) return null;
  const encoded = encodeURIComponent(traceId);
  const url = `loom://native/schema/${encoded}.json`;
  const raw = await fetchNativeJson<unknown>(url);
  return coerceRecord(raw);
}
