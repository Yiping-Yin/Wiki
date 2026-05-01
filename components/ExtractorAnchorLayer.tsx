'use client';
/**
 * Phase 7.3 · Provisional anchor layer for reading pages.
 *
 * Sibling to `AnchorLayer`: where `AnchorLayer` renders user / AI
 * thought-anchor events from the IndexedDB trace store, this layer
 * renders schema-derived `keyQuotes` (TranscriptSchema) and
 * `keyTerms` (TextbookSchema) as gray-outlined provisionals.
 *
 * UX rules (plan §6 Phase 7.3 deliverable B):
 *   - Provisional anchors render dimmer than user anchors (opacity
 *     0.7, gray border) — they say "the extractor noticed this",
 *     not "you must study this".
 *   - Hover → tooltip with `from <extractorId>: <fieldPath>` + page
 *     badge.
 *   - Click → confirm: writes a real `thought-anchor` event into
 *     IndexedDB with `attribution: "mixed"` (user has now interacted
 *     with extractor-origin content). After confirm, AnchorLayer
 *     picks it up as a normal anchor; this layer hides it locally.
 *   - Right-click → dismiss: persists the fingerprint to the
 *     dismissal sidecar so subsequent reads filter it out.
 *   - No automatic "would you like to confirm?" prompts. Quiet by
 *     default (curiosity-led, not quiz-led).
 *
 * Positioning strategy:
 *   Provisional anchors don't carry block ids — only the verbatim
 *   quote. We walk the prose container's children, find the first
 *   block whose normalised text contains the quote (case-insensitive,
 *   whitespace-tolerant), and anchor the dot at that block's vertical
 *   position. Blocks the locator can't find render at the bottom of
 *   the doc instead of being silently dropped (plan §3 never-do #8).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTracesForDoc } from '../lib/trace';
import { appendEventForDoc } from '../lib/trace/source-bound';
import { contextFromPathname } from '../lib/doc-context';
import {
  ensureBlockAnchorId,
  filteredChildren,
  normalizeBlockText,
} from '../lib/passage-locator';
import {
  dismissExtractorAnchor,
  loadProvisionalAnchors,
  type ProvisionalAnchor,
} from '../lib/extractor-anchors';
import type { TraceEvent } from '../lib/trace/types';
import { buildThoughtAnchorViewsFromTraces } from './thought-anchor-model';

const STAGE_SELECTOR = 'main .doc-stage';
const PROSE_SELECTOR = '.loom-source-prose';

type Located = {
  anchor: ProvisionalAnchor;
  /** Document-coordinate top of the source block. */
  top: number;
  /** Page (or fallback) container right offset for the dot. */
  fixedRight: number;
  /** True when the block was found by quote match; false when we
   *  fell back to the bottom of the prose. */
  exact: boolean;
};

export function ExtractorAnchorLayer({ docId }: { docId: string }) {
  const [anchors, setAnchors] = useState<ProvisionalAnchor[] | null>(null);
  const [confirmedFingerprints, setConfirmedFingerprints] = useState<Set<string>>(
    () => new Set(),
  );
  const [dismissedFingerprints, setDismissedFingerprints] = useState<Set<string>>(
    () => new Set(),
  );
  const [hovered, setHovered] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const [located, setLocated] = useState<Located[]>([]);

  const { traces } = useTracesForDoc(docId);

  // Skip provisionals whose passage already has a user-created
  // thought-anchor at the same quote — avoids double-rendering after
  // a confirm. Computed from the live IndexedDB read so it stays
  // current as the user captures more anchors.
  const userQuotes = useMemo(() => {
    const set = new Set<string>();
    const items = buildThoughtAnchorViewsFromTraces(
      traces.filter((t) => t.kind === 'reading' && !t.parentId),
    );
    for (const item of items) {
      if (item.quote) {
        set.add(normaliseQuote(item.quote));
      }
    }
    return set;
  }, [traces]);

  // Initial fetch.
  useEffect(() => {
    let cancelled = false;
    setAnchors(null);
    setHovered(null);
    setPinned(null);
    if (!docId) return () => {
      cancelled = true;
    };
    (async () => {
      const next = await loadProvisionalAnchors(docId);
      if (!cancelled) setAnchors(next ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [docId]);

  // Re-locate every anchor against the current DOM. Re-runs on
  // scroll / resize so positions stay accurate as content reflows.
  useEffect(() => {
    if (!anchors || anchors.length === 0) {
      setLocated([]);
      return;
    }
    const visible = anchors.filter(
      (a) =>
        !confirmedFingerprints.has(a.fingerprint) &&
        !dismissedFingerprints.has(a.fingerprint) &&
        !userQuotes.has(normaliseQuote(a.text)),
    );

    const recompute = () => {
      const prose = document.querySelector(PROSE_SELECTOR) as HTMLElement | null;
      const stage = document.querySelector(STAGE_SELECTOR) as HTMLElement | null;
      if (!prose) {
        setLocated([]);
        return;
      }
      const stageRect = stage?.getBoundingClientRect();
      const stageAbsTop = stageRect ? stageRect.top + window.scrollY : 0;
      const fixedRight = stageRect
        ? Math.max(24, window.innerWidth - stageRect.right + 24)
        : 24;
      const proseRect = prose.getBoundingClientRect();
      const proseBottom = proseRect.bottom + window.scrollY - stageAbsTop;

      const out: Located[] = [];
      for (const anchor of visible) {
        const block = findBlockForQuote(prose, anchor.text);
        if (block) {
          const r = block.getBoundingClientRect();
          out.push({
            anchor,
            top: r.top + window.scrollY - stageAbsTop + 4,
            fixedRight,
            exact: true,
          });
        } else {
          out.push({
            anchor,
            // Fall back to a position near the bottom of the prose.
            // The user can still confirm / dismiss the anchor; we
            // just can't pin it inline.
            top: Math.max(0, proseBottom - 24),
            fixedRight,
            exact: false,
          });
        }
      }
      setLocated(out);
    };

    recompute();
    const onResize = () => recompute();
    const onScroll = () => recompute();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll);
    };
  }, [anchors, confirmedFingerprints, dismissedFingerprints, userQuotes]);

  // Cluster anchors that land at nearly the same vertical position
  // so they don't visually stack into a single dot. Same idiom as
  // AnchorLayer's clustering pass.
  const clustered = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of located) {
      const key = `${Math.round(item.top / 8)}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const seen = new Map<string, number>();
    return located.map((item) => {
      const key = `${Math.round(item.top / 8)}`;
      const idx = seen.get(key) ?? 0;
      seen.set(key, idx + 1);
      return {
        ...item,
        clusterIndex: idx,
        clusterCount: counts.get(key) ?? 1,
      };
    });
  }, [located]);

  const handleConfirm = useCallback(
    async (anchor: ProvisionalAnchor) => {
      // Optimistically remove from the local list — the IndexedDB
      // write below will surface the same passage as a real anchor
      // through `useReadingThoughtAnchors`.
      setConfirmedFingerprints((prev) => {
        const next = new Set(prev);
        next.add(anchor.fingerprint);
        return next;
      });
      setHovered(null);
      setPinned(null);

      // Anchor the new event onto the matched block. If we couldn't
      // find a block, we still write the event with the quote so it
      // shows up in the LiveArtifact even if it can't position
      // visually — better than silent loss.
      const ctx = contextFromPathname(window.location.pathname);
      if (ctx.isFree || !ctx.docId) return;

      const prose = document.querySelector(PROSE_SELECTOR) as HTMLElement | null;
      let blockId = '';
      let blockText = '';
      let charStart = 0;
      let charEnd = 0;
      if (prose) {
        const block = findBlockForQuote(prose, anchor.text);
        if (block) {
          blockId = ensureBlockAnchorId(block, prose);
          blockText = normalizeBlockText(block);
          const idx = blockText.toLowerCase().indexOf(
            normaliseQuote(anchor.text).toLowerCase(),
          );
          if (idx >= 0) {
            charStart = idx;
            charEnd = idx + anchor.text.length;
          } else {
            charEnd = anchor.text.length;
          }
        }
      }

      const anchorId = blockId
        ? `${blockId}::frag:${charStart}-${charEnd}`
        : `extractor::${anchor.fingerprint}`;

      const event: Extract<TraceEvent, { kind: 'thought-anchor' }> = {
        kind: 'thought-anchor',
        anchorType: 'paragraph',
        anchorId,
        anchorBlockId: blockId || undefined,
        anchorBlockText: blockText || undefined,
        anchorOffsetPx: 4,
        anchorCharStart: charStart,
        anchorCharEnd: charEnd,
        rangeStartId: blockId || undefined,
        rangeStartText: blockText || undefined,
        rangeEndId: blockId || undefined,
        rangeEndText: blockText || undefined,
        summary: '',
        content: '',
        quote: anchor.text,
        thoughtType: 'citation',
        // User has confirmed an extractor-found anchor — the content
        // origin was extractor + user, so attribution is `mixed` per
        // plan §5.3 / Phase 7.3 deliverable C.
        attribution: 'mixed',
        at: Date.now(),
      };

      try {
        await appendEventForDoc(
          { docId: ctx.docId, href: ctx.href, sourceTitle: ctx.sourceTitle },
          event,
        );
      } catch (err) {
        // On failure, restore the provisional so the user sees it
        // again and can retry.
        setConfirmedFingerprints((prev) => {
          const next = new Set(prev);
          next.delete(anchor.fingerprint);
          return next;
        });
        // Surface to console for now — toast UI for a future polish
        // pass; reading page already has a similar pattern.
        // eslint-disable-next-line no-console
        console.error('[Loom] confirm extractor anchor failed', err);
      }
    },
    [],
  );

  const handleDismiss = useCallback(
    async (anchor: ProvisionalAnchor) => {
      setDismissedFingerprints((prev) => {
        const next = new Set(prev);
        next.add(anchor.fingerprint);
        return next;
      });
      setHovered(null);
      setPinned(null);
      try {
        await dismissExtractorAnchor({
          docId: anchor.docId,
          fingerprint: anchor.fingerprint,
        });
      } catch (err) {
        setDismissedFingerprints((prev) => {
          const next = new Set(prev);
          next.delete(anchor.fingerprint);
          return next;
        });
        // eslint-disable-next-line no-console
        console.error('[Loom] dismiss extractor anchor failed', err);
      }
    },
    [],
  );

  if (!anchors || clustered.length === 0) return null;

  return (
    <>
      {clustered.map((item) => {
        const isHovered = hovered === item.anchor.fingerprint;
        const isPinned = pinned === item.anchor.fingerprint;
        const showCard = isHovered || isPinned;
        return (
          <div
            key={item.anchor.id}
            className="loom-extractor-anchor"
            data-attribution="extractor"
            data-status="provisional"
            data-extractor-id={item.anchor.origin.extractorId}
            data-fingerprint={item.anchor.fingerprint}
            style={{
              position: 'absolute',
              top: item.top,
              right: 12 + item.clusterIndex * 10,
              zIndex: 10,
            }}
          >
            <button
              type="button"
              className="loom-extractor-anchor-dot"
              aria-label={`Provisional anchor from ${item.anchor.origin.extractorId} ${item.anchor.origin.field}`}
              onMouseEnter={() => setHovered(item.anchor.fingerprint)}
              onMouseLeave={() => setHovered((h) => (h === item.anchor.fingerprint ? null : h))}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!item.exact) return; // can't confirm what we couldn't place
                void handleConfirm(item.anchor);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void handleDismiss(item.anchor);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setPinned((p) => (p === item.anchor.fingerprint ? null : item.anchor.fingerprint));
                } else if (e.key === 'Backspace' || e.key === 'Delete') {
                  e.preventDefault();
                  void handleDismiss(item.anchor);
                }
              }}
            >
              <span aria-hidden className="loom-extractor-anchor-mark" />
            </button>
            {showCard && (
              <div
                role="tooltip"
                className="loom-extractor-anchor-tooltip"
                onMouseEnter={() => setHovered(item.anchor.fingerprint)}
                onMouseLeave={() => setHovered((h) => (h === item.anchor.fingerprint ? null : h))}
              >
                <div className="loom-extractor-anchor-tip-eyebrow">
                  <span>EXT · {item.anchor.origin.extractorId}</span>
                  {item.anchor.pageNum != null && (
                    <span className="loom-extractor-anchor-tip-page">
                      p. {item.anchor.pageNum}
                    </span>
                  )}
                </div>
                <div className="loom-extractor-anchor-tip-field">
                  {item.anchor.origin.field}
                </div>
                <div className="loom-extractor-anchor-tip-quote">
                  &ldquo;{item.anchor.text}&rdquo;
                </div>
                <div className="loom-extractor-anchor-tip-actions">
                  <button
                    type="button"
                    className="loom-extractor-anchor-tip-action is-primary"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void handleConfirm(item.anchor);
                    }}
                    disabled={!item.exact}
                    title={
                      item.exact
                        ? 'Confirm — keeps this as a real anchor'
                        : 'Quote not found in current text — cannot confirm'
                    }
                  >
                    confirm
                  </button>
                  <button
                    type="button"
                    className="loom-extractor-anchor-tip-action"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void handleDismiss(item.anchor);
                    }}
                    title="Dismiss — hides this provisional permanently"
                  >
                    dismiss
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

/**
 * Find the first child block whose normalised text includes the
 * provisional anchor's quote. Returns null when no block matches —
 * the layer falls back to a bottom-of-prose render in that case.
 *
 * Matching is case-insensitive and whitespace-tolerant (the quote
 * may have lost layout whitespace during PDF extraction); we compare
 * a flattened lowercase form of both sides.
 */
function findBlockForQuote(prose: HTMLElement, quote: string): HTMLElement | null {
  const needle = normaliseQuote(quote).toLowerCase();
  if (!needle || needle.length < 4) return null;
  for (const block of filteredChildren(prose)) {
    const haystack = normaliseQuote(block.innerText || block.textContent || '').toLowerCase();
    if (!haystack) continue;
    if (haystack.includes(needle)) return block;
  }
  // Light fuzzy fallback — if the full quote misses, try the first
  // 80 chars (works around extractor quotes that include a trailing
  // ellipsis or attribution that doesn't survive PDF whitespace).
  if (needle.length > 80) {
    const head = needle.slice(0, 80);
    for (const block of filteredChildren(prose)) {
      const haystack = normaliseQuote(block.innerText || block.textContent || '').toLowerCase();
      if (haystack.includes(head)) return block;
    }
  }
  return null;
}

function normaliseQuote(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
