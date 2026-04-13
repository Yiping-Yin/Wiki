'use client';
/**
 * §X · Cross-document thought backlinks.
 *
 * Read-time aggregation: given the current doc's href and docId, scan all
 * other traces' thought-anchor events for markdown links pointing to this
 * doc. Returns a list of backlinks — each one points back to the anchor
 * that references us, including its doc title and summary.
 *
 * Zero schema change. Uses the existing markdown content in anchor events
 * and the existing `Trace.source` metadata. Performance: O(total anchors)
 * on every render, good enough for single-user corpora up to ~10k anchors.
 */
import { useMemo } from 'react';
import { useAllTraces } from './hooks';
import type { Trace } from './types';

export type Backlink = {
  /** ID of the trace that contains the referring anchor */
  fromTraceId: string;
  /** docId of the source document containing the referring anchor */
  fromDocId: string;
  /** Readable title of the source document */
  fromDocTitle: string;
  /** href of the source document (for navigation) */
  fromDocHref: string;
  /** The anchor's summary (for display) */
  fromAnchorSummary: string;
  /** The anchor's id (for deep-linking) */
  fromAnchorId: string;
  /** Timestamp of the anchor event (for sort order) */
  at: number;
};

/**
 * Extract all markdown link URLs from an anchor content string.
 * Matches `[text](url)` syntax only; ignores wikilinks and raw URLs.
 */
function extractMarkdownLinkUrls(content: string): string[] {
  if (!content) return [];
  const urls: string[] = [];
  // Non-greedy match on [text](url), handling parentheses poorly but OK for
  // typical usage. For anchor notes, links are usually simple.
  const re = /\[[^\]]*\]\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const url = m[1].trim().split(/\s+/)[0]; // strip title if present
    if (url) urls.push(url);
  }
  return urls;
}

/**
 * Does a URL reference the given doc?
 *
 * Supports two canonical forms:
 *  - Exact href match: the URL equals the doc's href (e.g. `/wiki/attention`)
 *  - Relative href: the URL ends with the doc's href (handles `../wiki/...`)
 *
 * Anchor fragments (`#section-id`) are tolerated — they still count as a
 * link to the parent doc.
 */
function urlReferencesDoc(url: string, docHref: string): boolean {
  if (!url || !docHref) return false;
  // Strip fragment and query from the URL for comparison
  const cleanUrl = url.split('#')[0].split('?')[0];
  if (cleanUrl === docHref) return true;
  // Relative path: `./wiki/foo` or `wiki/foo` or `../foo/bar/wiki/foo`
  // Accept as match if the cleanUrl ends with docHref (with optional leading /)
  if (cleanUrl.endsWith(docHref)) return true;
  if (cleanUrl.endsWith(docHref.replace(/^\//, ''))) return true;
  return false;
}

/**
 * Build the backlink list for a given doc.
 *
 * @param docId the current doc's ID (e.g. `wiki/attention`)
 * @param docHref the current doc's canonical href (e.g. `/wiki/attention`)
 */
export function useBacklinksForDoc(docId: string | null, docHref: string | null): Backlink[] {
  const { traces } = useAllTraces();
  return useMemo(() => {
    if (!docId || !docHref || traces.length === 0) return [];

    const backlinks: Backlink[] = [];
    for (const trace of traces) {
      // Skip same-doc self-references — "referenced by this doc" is noise
      if (trace.source?.docId === docId) continue;
      const fromDocId = trace.source?.docId ?? '';
      const fromDocHref = trace.source?.href ?? '';
      const fromDocTitle = trace.title ?? fromDocId;
      if (!fromDocId) continue;

      // Keep only the LATEST anchor event per anchorId (matches the
      // container model: we want to show the current head of each
      // referring container, not every version)
      const latestByAnchor = new Map<string, any>();
      for (const e of trace.events) {
        if (e.kind !== 'thought-anchor') continue;
        const prev = latestByAnchor.get(e.anchorId);
        if (!prev || e.at > prev.at) latestByAnchor.set(e.anchorId, e);
      }

      for (const e of latestByAnchor.values()) {
        const urls = extractMarkdownLinkUrls(e.content ?? '');
        const references = urls.some((u) => urlReferencesDoc(u, docHref));
        if (!references) continue;
        backlinks.push({
          fromTraceId: trace.id,
          fromDocId,
          fromDocTitle,
          fromDocHref,
          fromAnchorSummary: e.summary,
          fromAnchorId: e.anchorId,
          at: e.at,
        });
      }
    }

    // Most recent first
    backlinks.sort((a, b) => b.at - a.at);
    return backlinks;
  }, [docId, docHref, traces]);
}
