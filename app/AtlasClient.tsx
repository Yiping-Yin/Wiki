'use client';

/**
 * AtlasClient — habitat/library surface.
 *
 * Renders the user's library as colored book spines standing on a wooden
 * shelf. Each spine has a gold top band, a small glyph, the vertical
 * title, and a footer band + category label. The currently-reading doc
 * (first entry in the sidebar's recent-records list) is lifted with a
 * gold "reading ribbon" hanging from the top.
 *
 * Design reference:
 *   /Users/yinyiping/Downloads/Wiki Logo/loom-habitat.jsx → AtlasSurface
 *
 * Data source:
 *   fetchSearchIndex() → MiniSearch dump. We read `payload.index.storedFields`
 *   which is the same shape every other caller in the app expects
 *   (LinkPreview, SearchBox, /quizzes, /notes, /highlights, …).
 */

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { subscribeLoomMirror } from '../lib/loom-mirror-store';
import {
  RECENT_RECORDS_KEY,
  loadLatestRecentRecord,
} from '../lib/loom-recent-records';
import { fetchSearchIndex } from '../lib/search-index-client';

type AtlasDoc = {
  href: string;
  title: string;
  category?: string;
  body?: string;
};

// Earth-tone palette mirror of the V.* tokens in loom-tokens.jsx. Kept inline
// (not pulled from CSS vars) because each spine needs its own deterministic
// color and we mix light/dark stops per spine via color-mix() in CSS.
const INK_PALETTE = ['#9E7C3E', '#A8783E', '#8F4646', '#5C6E4E', '#3A477A', '#5E3D5C', '#5C3F2A'];
const GLYPHS = ['✦', '◆', '·', '◇', '✧'];

function hashSpineColor(href: string): string {
  let h = 0;
  for (let i = 0; i < href.length; i++) h = (h * 31 + href.charCodeAt(i)) | 0;
  return INK_PALETTE[Math.abs(h) % INK_PALETTE.length];
}

function parseIndexPayload(payload: unknown): AtlasDoc[] {
  // The app's canonical search index is a MiniSearch dump whose stored
  // fields live at `index.storedFields`. Defensive fallback to the raw
  // array shape in case someone ever points fetchSearchIndex() at a
  // pre-dumped array.
  if (Array.isArray(payload)) {
    return payload.filter((doc): doc is AtlasDoc =>
      !!doc && typeof doc === 'object' && typeof (doc as AtlasDoc).href === 'string' && typeof (doc as AtlasDoc).title === 'string',
    );
  }
  const stored = (payload as { index?: { storedFields?: Record<string, unknown> } })?.index?.storedFields;
  if (!stored) return [];
  const out: AtlasDoc[] = [];
  for (const value of Object.values(stored)) {
    if (!value || typeof value !== 'object') continue;
    const fields = value as { title?: unknown; href?: unknown; category?: unknown; body?: unknown };
    if (typeof fields.title !== 'string' || typeof fields.href !== 'string') continue;
    if (!fields.title || !fields.href) continue;
    out.push({
      title: fields.title,
      href: fields.href,
      category: typeof fields.category === 'string' ? fields.category : undefined,
      body: typeof fields.body === 'string' ? fields.body : undefined,
    });
  }
  return out;
}

export default function AtlasClient() {
  const [docs, setDocs] = useState<AtlasDoc[]>([]);
  const [activeHref, setActiveHref] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchSearchIndex();
        if (!res.ok) {
          if (!cancelled) setLoaded(true);
          return;
        }
        const payload = await res.json();
        if (cancelled) return;
        setDocs(parseIndexPayload(payload));
      } catch (_) {
        /* silent — atlas tolerates missing index, renders empty shelf */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    const refreshRecent = async () => {
      const latest = await loadLatestRecentRecord();
      if (!cancelled) setActiveHref(latest?.href ?? null);
    };
    void refreshRecent();
    const disposeRecent = subscribeLoomMirror(
      RECENT_RECORDS_KEY,
      'loom-recents-updated',
      () => {
        void refreshRecent();
      },
    );
    return () => {
      cancelled = true;
      disposeRecent();
    };
  }, []);

  // Sort so the shelf reads in a stable order. Group by category first so
  // books from the same collection cluster, then by title so each cluster
  // is internally predictable.
  const shelf = useMemo(() => {
    return [...docs].sort((a, b) => {
      const ca = (a.category ?? '').toLowerCase();
      const cb = (b.category ?? '').toLowerCase();
      if (ca !== cb) return ca.localeCompare(cb);
      return a.title.localeCompare(b.title);
    });
  }, [docs]);

  const totalBound = shelf.length;

  // Threads remain omitted until the recurring-phrase pipeline is
  // mirrored here. An absent ledger is more honest than fabricated
  // recurring phrases.
  const threads: string[] = [];

  const subtitle = !loaded
    ? 'gathering the shelf…'
    : totalBound === 0
      ? ''
      : `${totalBound} bound.`;

  return (
    <div className="loom-atlas">
      <header className="loom-atlas-header" style={{ position: 'relative' }}>
        <div className="loom-atlas-eyebrow">Desk</div>
        <div className="loom-atlas-title-row">
          <h1 className="loom-atlas-title">Your library</h1>
          {subtitle && <p className="loom-atlas-subtitle">{subtitle}</p>}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            flexWrap: 'wrap',
            marginTop: '0.75rem',
          }}
        >
          <Link
            href="/sources"
            style={{
              textDecoration: 'none',
              color: 'var(--accent-text)',
              fontFamily: 'var(--serif)',
              fontStyle: 'italic',
              fontWeight: 600,
            }}
          >
            Open sources
          </Link>
          <span aria-hidden style={{ color: 'var(--muted)' }}>·</span>
          <Link
            href="/llm-wiki"
            style={{
              textDecoration: 'none',
              color: 'var(--fg-secondary)',
              fontFamily: 'var(--serif)',
              fontStyle: 'italic',
            }}
          >
            Open LLM Wiki
          </Link>
        </div>
        {/* Shelf legend — mockup loom-habitat.jsx:52. Tells the reader
            what the three spine states mean: gold halo = reading now,
            bronze dot = thread returning, muted dim = cooling off. */}
        <div className="loom-atlas-legend" aria-hidden="true">
          <span className="loom-atlas-legend-dot loom-atlas-legend-dot--reading-now">reading now</span>
          <span className="loom-atlas-legend-dot loom-atlas-legend-dot--returning">thread returning</span>
          <span className="loom-atlas-legend-dot loom-atlas-legend-dot--cooling">cooling</span>
        </div>
      </header>

      {loaded && totalBound === 0 ? (
        <div className="loom-empty-state" role="note">
          <div className="loom-empty-state-ornament" aria-hidden="true">── · ──</div>
          <p className="loom-empty-state-copy">
            No books on the shelf yet. Open a folder in Settings → Data
            (⌘,) to build your sources shelf.
          </p>
          <Link href="/sources" className="loom-empty-state-action">
            Open sources →
          </Link>
        </div>
      ) : (
        <section className="loom-atlas-shelf-area">
          <div className="loom-atlas-shelf-board" aria-hidden="true" />
          <div className="loom-atlas-books" role="list">
            {shelf.map((doc, i) => (
              <Book
                key={doc.href}
                doc={doc}
                active={doc.href === activeHref}
                color={hashSpineColor(doc.href)}
                glyph={GLYPHS[i % GLYPHS.length]}
                heightVariance={(i * 37) % 90}
                widthVariance={(i * 13) % 22}
              />
            ))}
          </div>
        </section>
      )}

      {threads.length > 0 && (
        <section className="loom-atlas-threads">
          <div className="loom-atlas-threads-eyebrow">Threads · {threads.length}</div>
          {threads.map((label) => (
            <div key={label} className="loom-atlas-thread">
              <div className="loom-atlas-thread-label">{label}</div>
            </div>
          ))}
          <div className="loom-atlas-threads-hint">⌘K to explore</div>
        </section>
      )}
    </div>
  );
}

type BookProps = {
  doc: AtlasDoc;
  active: boolean;
  color: string;
  glyph: string;
  heightVariance: number;
  widthVariance: number;
};

function Book({ doc, active, color, glyph, heightVariance, widthVariance }: BookProps) {
  const h = 220 + heightVariance;
  const w = 42 + widthVariance;
  return (
    <a
      href={doc.href}
      className={`loom-atlas-book${active ? ' is-active' : ''}`}
      style={{
        // CSS custom properties on an anchor — the typed inline style requires
        // a cast because React doesn't know about `--spine-color`.
        ['--spine-color' as unknown as string]: color,
        height: `${h / 16}rem`,
        width: `${w / 16}rem`,
      } as React.CSSProperties}
      title={doc.title}
      role="listitem"
    >
      <div className="loom-atlas-book-band" aria-hidden="true" />
      <div className="loom-atlas-book-title">{doc.title}</div>
      <div className="loom-atlas-book-foot">
        <span className="loom-atlas-book-glyph" aria-hidden="true">{glyph}</span>
        <div className="loom-atlas-book-band" aria-hidden="true" />
        <span className="loom-atlas-book-pages">{doc.category ?? ''}</span>
      </div>
      {active ? <div className="loom-atlas-book-ribbon" aria-hidden="true" /> : null}
    </a>
  );
}
