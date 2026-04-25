/**
 * Phase 7.3 · Provisional anchor loader for the reading-page layer.
 *
 * Companion to `lib/loom-schema-records.ts` (Phase 7.1). Where 7.1
 * surfaced the syllabus payload as a Course Context strip, 7.3
 * projects `TranscriptSchema.keyQuotes` and `TextbookSchema.keyTerms`
 * onto the matching reading page as gray-outlined provisional
 * anchors. The provisional anchors live next to user / AI thought
 * anchors but render dimmer (CSS `[data-attribution="extractor"][data-status="provisional"]`)
 * and never demand attention — curiosity-led, not quiz-led.
 *
 * Two writers consume this module's output:
 *   1. `ExtractorAnchorLayer` — renders dots + tooltips; on click,
 *      promotes a provisional to a real `thought-anchor` event with
 *      `attribution: "mixed"` via the existing IndexedDB capture path
 *      (`appendEventForDoc`). On dismiss, posts to the dismissal
 *      sidecar (this file's `dismissExtractorAnchor`).
 *   2. Test harnesses (`tests/extractor-anchors.test.ts`) use the
 *      type alone — no rendering.
 *
 * Q2 of plan §8 is locked: the wire-format `attribution` is
 * `"extractor"`. The `lib/trace/types.ts` enum was widened in Phase
 * 7.1; this module is the first emission. Confirmation upgrades the
 * value to `"mixed"` because the user has now interacted with it.
 *
 * Native vs dev:
 *   - Native (`loom://`) reads through the URL-scheme handler at
 *     `loom://native/extractor-anchors-for-doc/<docId>.json`.
 *   - Dev / browser hits the matching Next.js route. Both converge
 *     on the same on-disk dismissal sidecar at
 *     `knowledge/.cache/extractor-anchors-dismissed/<slug>.json`.
 */

import { fetchNativeJson } from './loom-native-json';
import { isNativeMode } from './is-native-mode';

/** A single source span, mirroring the Swift `SourceSpan` shape. */
export type SourceSpan = {
  quote?: string;
  pageNum?: number;
  verified?: boolean;
};

/**
 * A provisional anchor projected from a transcript or textbook
 * schema. Renders in the reading page's margin alongside user-created
 * anchors but with the gray-outline `provisional` style.
 *
 * Identity:
 *   - `id` is a stable React key (same as `fingerprint` today).
 *   - `fingerprint` keys the dismissal sidecar; persisting the same
 *     fingerprint twice is idempotent.
 *
 * Attribution:
 *   - Always `"extractor"` while provisional. On user confirm, the
 *     IndexedDB write happens with `attribution: "mixed"` because the
 *     user has touched it.
 */
export type ProvisionalAnchor = {
  id: string;
  docId: string;
  attribution: 'extractor';
  status: 'provisional';
  origin: { extractorId: string; field: string };
  text: string;
  pageNum?: number;
  fingerprint: string;
  sourceSpans: SourceSpan[];
  /** Trace id of the originating ingestion trace, for tooltip + persist. */
  traceId: string;
  /** Originating ingest sourceDocId (`ingested:<filename>`), for tooltip. */
  sourceDocId: string;
};

/** Wire shape for the native endpoint payload. */
type WirePayload = {
  docId: string;
  anchors: WireAnchor[];
};

type WireAnchor = {
  id: string;
  docId: string;
  traceId: string;
  extractorId: string;
  sourceDocId: string;
  fieldPath: string;
  text: string;
  pageNum?: number;
  fingerprint: string;
  attribution: string;
  status: string;
  sourceSpans?: Array<Record<string, unknown>>;
};

function coerceSpan(raw: unknown): SourceSpan {
  if (!raw || typeof raw !== 'object') return {};
  const obj = raw as Record<string, unknown>;
  return {
    quote: typeof obj.quote === 'string' ? obj.quote : undefined,
    pageNum: typeof obj.pageNum === 'number' ? obj.pageNum : undefined,
    verified: typeof obj.verified === 'boolean' ? obj.verified : undefined,
  };
}

function coerceAnchor(raw: unknown): ProvisionalAnchor | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as WireAnchor;
  if (typeof obj.id !== 'string' || obj.id === '') return null;
  if (typeof obj.docId !== 'string' || obj.docId === '') return null;
  if (typeof obj.text !== 'string' || obj.text === '') return null;
  if (typeof obj.fingerprint !== 'string' || obj.fingerprint === '') return null;
  if (obj.attribution !== 'extractor') return null;
  if (obj.status !== 'provisional') return null;
  return {
    id: obj.id,
    docId: obj.docId,
    attribution: 'extractor',
    status: 'provisional',
    origin: {
      extractorId: typeof obj.extractorId === 'string' ? obj.extractorId : '',
      field: typeof obj.fieldPath === 'string' ? obj.fieldPath : '',
    },
    text: obj.text,
    pageNum: typeof obj.pageNum === 'number' ? obj.pageNum : undefined,
    fingerprint: obj.fingerprint,
    sourceSpans: Array.isArray(obj.sourceSpans) ? obj.sourceSpans.map(coerceSpan) : [],
    traceId: typeof obj.traceId === 'string' ? obj.traceId : '',
    sourceDocId: typeof obj.sourceDocId === 'string' ? obj.sourceDocId : '',
  };
}

/**
 * Fetch the provisional extractor anchors for a reading docId.
 *
 * Returns an empty list when no transcript / textbook trace's
 * filename slug matches the docId — same silent behavior as the
 * Course Context strip's "no match" path. Returns null only when
 * the runtime can't reach the resolver (non-native + no /api route
 * configured).
 *
 * Dismissed fingerprints are filtered server-side by Swift before
 * the payload reaches the web — so this never returns anchors the
 * user has dismissed.
 */
export async function loadProvisionalAnchors(
  docId: string,
): Promise<ProvisionalAnchor[] | null> {
  if (!docId) return [];
  if (isNativeMode()) {
    const encoded = encodeURIComponent(docId);
    const url = `loom://native/extractor-anchors-for-doc/${encoded}.json`;
    const raw = await fetchNativeJson<WirePayload>(url);
    if (!raw) return [];
    if (!Array.isArray(raw.anchors)) return [];
    return raw.anchors.map(coerceAnchor).filter(
      (a): a is ProvisionalAnchor => a !== null,
    );
  }

  // Dev / browser fallback. The matching Next.js route walks the
  // dev-mode trace store (or returns empty in CI / SSR runs).
  try {
    const response = await fetch(
      `/api/extractor-anchors?docId=${encodeURIComponent(docId)}`,
      { cache: 'no-store' },
    );
    if (!response.ok) return [];
    const body = (await response.json()) as WirePayload;
    if (!Array.isArray(body.anchors)) return [];
    return body.anchors.map(coerceAnchor).filter(
      (a): a is ProvisionalAnchor => a !== null,
    );
  } catch {
    return [];
  }
}

/** Wire shape returned by the dismissal bridge / API. */
type DismissResponse = { dismissedFingerprints?: string[] };

type NativeHandler = {
  postMessage: (payload: unknown) => Promise<unknown>;
};

function getDismissBridge(): NativeHandler | null {
  if (typeof window === 'undefined') return null;
  const handlers = (window as unknown as {
    webkit?: { messageHandlers?: Record<string, NativeHandler | undefined> };
  }).webkit?.messageHandlers;
  return handlers?.loomExtractorAnchors ?? null;
}

/**
 * Dismiss a provisional anchor. Persists the fingerprint to the
 * dismissal sidecar so subsequent reads of the same docId never
 * re-emit it. Idempotent — re-dismissing is a no-op.
 *
 * The caller (`ExtractorAnchorLayer`) optimistically removes the
 * anchor from its local list; this function persists the decision.
 * On error, the caller should re-add it on the next reload (the
 * sidecar is the source of truth).
 */
export async function dismissExtractorAnchor(input: {
  docId: string;
  fingerprint: string;
}): Promise<string[]> {
  if (!input.docId || !input.fingerprint) return [];
  const bridge = isNativeMode() ? getDismissBridge() : null;
  if (bridge) {
    try {
      const raw = (await bridge.postMessage({
        action: 'dismiss',
        docId: input.docId,
        fingerprint: input.fingerprint,
      })) as DismissResponse | null;
      return Array.isArray(raw?.dismissedFingerprints)
        ? raw!.dismissedFingerprints!
        : [];
    } catch (error) {
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  // Dev / browser — hit the Next.js API route.
  const response = await fetch('/api/extractor-anchors-dismissed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      docId: input.docId,
      fingerprint: input.fingerprint,
    }),
    cache: 'no-store',
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `extractor-anchors-dismissed failed: ${response.status}`);
  }
  const body = (await response.json()) as DismissResponse;
  return Array.isArray(body.dismissedFingerprints)
    ? body.dismissedFingerprints
    : [];
}
