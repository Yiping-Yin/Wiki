'use client';

/**
 * CoverClient — a source's opening page.
 *
 * Per-document front matter. Three entry paths, in priority order:
 *
 *   1. `?href=/wiki/xyz` — look up that specific doc in the bundled
 *      search index. If found, render its real title / category; if
 *      the href is real but not indexed (a loose MDX, a Markdown
 *      upload), fall back to the placeholder with the real href.
 *
 *   2. No `?href=`, but the user has read something before — read the
 *      most-recent native record and
 *      cover that. Enriches with search-index metadata when possible.
 *      The page then reads like "here is what you were last in",
 *      which is the honest interpretation of returning to Home.
 *
 *   3. No `?href=`, no recents — a true first run. Shows the canonical
 *      "The Bridge · Amelia Whitlock" placeholder. This is the one
 *      surface where a fabricated example is acceptable: it is
 *      teaching the reader what a Loom cover looks like, not passing
 *      off an invented interior as theirs.
 *
 * Vellum-light treatment:
 *   - eyebrow "Source · added 14 march" (or "last opened…" for recents)
 *   - Cormorant italic title + italic subtitle
 *   - ornament + italic-serif author / category
 *   - metadata chip: "248 pages · 14 threads woven · last opened…"
 *   - primary action: "Open to where you left off" (recents)
 *                  or  "Open to page 142"            (placeholder)
 *   - secondary hint: "⌘F to find a passage"
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { subscribeLoomMirror } from '../lib/loom-mirror-store';
import {
  RECENT_RECORDS_KEY,
  loadLatestRecentRecord,
  type LoomRecentRecord,
} from '../lib/loom-recent-records';
import { fetchSearchIndex } from '../lib/search-index-client';
import Ornament from '../components/Ornament';
import CoverPlate from '../components/CoverPlate';

type Cover = {
  title: string;
  subtitle?: string;
  category?: string;
  href: string;
};

/**
 * First-run placeholder. Only used when there is neither a `?href=` nor
 * a mirrored recent record. The name is the canonical example from
 * `loom-reading.jsx`'s CoverSurface — kept so the surface has something
 * plausible to render on the very first page load.
 */
const PLACEHOLDER: Cover = {
  title: 'The Bridge',
  subtitle: 'on building what lasts',
  category: 'Essays and notebooks · 2019 – 2024',
  href: '/wiki',
};

/**
 * Pull the MiniSearch `storedFields` into an href-keyed Cover lookup.
 * Tolerant of unexpected shapes — anything without a string title+href
 * is skipped. `category` passes through when present so the author
 * line can use a real category rather than falling back to the
 * placeholder author.
 */
function parseIndex(payload: unknown): Record<string, Cover> {
  const out: Record<string, Cover> = {};
  const stored = (payload as { index?: { storedFields?: Record<string, unknown> } })?.index?.storedFields;
  if (!stored) return out;
  for (const value of Object.values(stored)) {
    const v = value as { title?: unknown; href?: unknown; category?: unknown };
    if (typeof v?.title === 'string' && typeof v?.href === 'string') {
      out[v.href] = {
        title: v.title,
        category: typeof v.category === 'string' ? v.category : undefined,
        href: v.href,
      };
    }
  }
  return out;
}

/**
 * Human "last opened ___" phrasing. Kept short — this slots into the
 * eyebrow and the right-hand meta column, so "yesterday evening" /
 * "three days ago" reads better than an exact timestamp.
 *
 * Returns null on missing/unparseable timestamps so the caller can
 * decide whether to fall through to the placeholder copy.
 */
function formatLastOpened(at: number | string | undefined): string | null {
  if (at === undefined) return null;
  const t = typeof at === 'number' ? at : Date.parse(String(at));
  if (!Number.isFinite(t)) return null;
  const now = new Date();
  const then = new Date(t);
  const ms = now.getTime() - then.getTime();
  if (ms < 0) return 'just now';
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return 'a moment ago';
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
  // Same-calendar-day bucketing. "today, late afternoon" reads more
  // like a novel's time-stamp than "4 hours ago".
  const sameDay = now.toDateString() === then.toDateString();
  if (sameDay) {
    const h = then.getHours();
    if (h < 5) return 'earlier this morning';
    if (h < 12) return 'this morning';
    if (h < 17) return 'earlier today';
    if (h < 21) return 'this evening';
    return 'tonight';
  }
  const days = Math.floor(ms / 86_400_000);
  if (days === 1) {
    const h = then.getHours();
    if (h >= 17) return 'yesterday evening';
    if (h >= 12) return 'yesterday afternoon';
    return 'yesterday';
  }
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.round(days / 7)} ${Math.round(days / 7) === 1 ? 'week' : 'weeks'} ago`;
  if (days < 365) return `${Math.round(days / 30)} ${Math.round(days / 30) === 1 ? 'month' : 'months'} ago`;
  return `${Math.round(days / 365)} ${Math.round(days / 365) === 1 ? 'year' : 'years'} ago`;
}

/**
 * Route the cover's primary action through the native navigation
 * bridge when one is available, else fall back to a normal page
 * navigation. Mirrors the pattern HomeClient uses for "Return to the
 * passage" so covers and Home agree on how to re-enter a doc.
 */
type LoomNavigateWindow = {
  webkit?: {
    messageHandlers?: {
      loomNavigate?: { postMessage: (msg: unknown) => void };
    };
  };
};

function callNativeBridge(action: string, payload?: Record<string, unknown>): boolean {
  try {
    const handler = (window as unknown as LoomNavigateWindow).webkit?.messageHandlers
      ?.loomNavigate;
    if (handler?.postMessage) {
      handler.postMessage({ action, ...(payload ?? {}) });
      return true;
    }
  } catch (_) {}
  return false;
}

export default function CoverClient() {
  const params = useSearchParams();
  const wantedHref = params?.get('href') ?? null;

  const [cover, setCover] = useState<Cover>(PLACEHOLDER);
  // `resolved` gates the primary action's aria-disabled state while
  // the search-index fetch is in flight. First-run (no href, no
  // recents) is resolved immediately because the placeholder is
  // self-contained.
  const [resolved, setResolved] = useState<boolean>(!wantedHref);
  const [recent, setRecent] = useState<LoomRecentRecord | null>(null);
  const [isFallback, setIsFallback] = useState<boolean>(!wantedHref);

  // Hydrate the recent-record on mount and re-read whenever the Swift
  // shell (or a sibling tab) announces a change. The recent list is
  // only consulted when there's no `?href=` — see the resolver below —
  // but we still subscribe unconditionally so a user who opens a doc
  // while the cover is mounted doesn't have to reload to see their
  // new "last opened" reflected.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;
    const refresh = async () => {
      const next = await loadLatestRecentRecord();
      if (!cancelled) setRecent(next);
    };
    void refresh();
    const dispose = subscribeLoomMirror(RECENT_RECORDS_KEY, 'loom-recents-updated', () => {
      void refresh();
    });
    return () => {
      cancelled = true;
      dispose();
    };
  }, []);

  // Resolver — picks which href to cover and enriches it with
  // search-index metadata. Three branches match the three entry paths
  // documented at the top of the file.
  useEffect(() => {
    let cancelled = false;

    // Branch 3: first run — no href, no recents. Keep the placeholder
    // and don't hit the network. `recent === null` after mount means
    // storage was empty or malformed.
    if (!wantedHref && recent === null) {
      setCover(PLACEHOLDER);
      setIsFallback(true);
      setResolved(true);
      return;
    }

    // Branches 1 & 2 both want the search index for metadata
    // enrichment. The only difference is which href they ask about.
    const target = wantedHref ?? recent?.href ?? null;
    if (!target) {
      // recent was briefly non-null but lost its href — treat as
      // first-run rather than flashing a broken cover.
      setCover(PLACEHOLDER);
      setIsFallback(true);
      setResolved(true);
      return;
    }

    // Optimistic render: for recents we already know title+href
    // locally, so paint them immediately and let the index fetch
    // refine the category/subtitle. For `?href=` we have only the
    // href, so show placeholder copy with the real href until the
    // index resolves.
    if (!wantedHref && recent) {
      setCover({
        title: recent.title,
        subtitle: 'your last opened book',
        href: recent.href,
      });
      setIsFallback(false);
    } else {
      setCover({ ...PLACEHOLDER, href: target });
      setIsFallback(false);
    }
    setResolved(false);

    (async () => {
      try {
        const res = await fetchSearchIndex();
        if (!res.ok) throw new Error(`search index ${res.status}`);
        const data = await res.json();
        const idx = parseIndex(data);
        const hit = idx[target];
        if (cancelled) return;
        if (hit) {
          // Real doc in bundle index — prefer its title+category, but
          // keep the recent-sourced subtitle when we have one and the
          // index didn't supply one.
          setCover({
            title: hit.title,
            category: hit.category,
            href: hit.href,
            subtitle: !wantedHref && recent ? 'your last opened book' : undefined,
          });
        } else if (!wantedHref && recent) {
          // Recent href exists but isn't in the bundle index — still
          // render its title, just without category enrichment.
          setCover({
            title: recent.title,
            subtitle: 'your last opened book',
            href: recent.href,
          });
        } else {
          // `?href=` points at something not in the index. Fall back
          // to the placeholder copy with the real href so the "Open"
          // action still takes you somewhere.
          setCover({ ...PLACEHOLDER, href: target });
        }
        setResolved(true);
      } catch {
        if (!cancelled) {
          setResolved(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wantedHref, recent]);

  // Eyebrow copy. For a recent-backed cover we want "last opened
  // yesterday evening" rather than the static "added 14 march"
  // placeholder line — that's the whole reason we pulled the recents
  // in the first place.
  const lastOpened = !wantedHref && recent ? formatLastOpened(recent.at) : null;
  const eyebrow = lastOpened
    ? `Source · last opened ${lastOpened}`
    : 'Source · added 14 march';

  // Meta chip — right column. For the placeholder / un-indexed cases
  // we keep the literary "248 pages · 14 threads woven · last opened
  // yesterday evening" line so the surface never feels empty. For a
  // recent-backed cover, swap the right cell to the real relative
  // timestamp when we have one.
  const metaLastOpened = lastOpened ?? 'yesterday evening';

  // Primary action label. Recents get the warmer "Open to where you
  // left off" so the cover reads as a re-entry surface rather than a
  // cold start. Anything else keeps the canonical "Open to page 142".
  const primaryLabel = !wantedHref && recent
    ? 'Open to where you left off'
    : 'Open to page 142';

  // Author / category line. When the search index supplied a real
  // category, use it. For a recent-backed cover without a category
  // hit, hide the author line entirely — per the task spec, we don't
  // want to invent authorship for real documents. The first-run
  // placeholder keeps "Amelia Whitlock" because it is explicitly an
  // example, not a real doc.
  const authorLine =
    cover.category
      ? cover.category
      : isFallback
        ? 'Amelia Whitlock'
        : null;

  // Click routing for the primary action. Prefer the native bridge
  // when present (keeps navigation inside the shell's Coordinator,
  // which handles reading-state restoration); fall back to the Link
  // default when running in a plain browser.
  const handleOpen = (event: React.MouseEvent<HTMLAnchorElement>) => {
    const href = cover.href || '/wiki';
    if (callNativeBridge('navigate', { href })) {
      event.preventDefault();
    }
  };

  return (
    <main className="loom-cover">
      <div className="loom-cover-eyebrow">
        {eyebrow}
      </div>

      <h1 className="loom-cover-title">
        {cover.title}
      </h1>
      {cover.subtitle && (
        <div className="loom-cover-subtitle">{cover.subtitle}</div>
      )}

      <CoverOrnament />

      {authorLine && (
        <div className="loom-cover-author">
          {authorLine}
        </div>
      )}

      {/* Frontispiece plate — PlateMark-framed warp × weft motif.
          Mockup's verso (loom-reading.jsx:27) renders an example-specific
          bridge elevation; Loom's Cover is generic, so the plate shows
          the motif that is *always* thematically correct here: Loom
          itself being woven. */}
      <CoverPlate />

      <div className="loom-cover-meta">
        <span>
          <span className="loom-cover-meta-number">248</span> pages
        </span>
        <span style={{ textAlign: 'center' }}>
          <span className="loom-cover-meta-number">14</span> threads woven
        </span>
        <span style={{ textAlign: 'right' }}>
          last opened {metaLastOpened}
        </span>
      </div>

      <div className="loom-cover-actions">
        <Link
          href={cover.href || '/wiki'}
          className="loom-cover-action"
          aria-disabled={!resolved}
          onClick={handleOpen}
        >
          {primaryLabel}
        </Link>
        <span className="loom-cover-action-hint">
          ⌘F to find a passage
        </span>
      </div>
    </main>
  );
}

function CoverOrnament() {
  return (
    <div
      className="loom-cover-ornament"
      style={{ display: 'flex', justifyContent: 'center' }}
    >
      <Ornament color="var(--accent)" size={14} />
    </div>
  );
}
