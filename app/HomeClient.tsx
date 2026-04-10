'use client';
/**
 * Home (/) — the quietest page in Loom.
 *
 * §1 · 悄无声息 — no greeting copy, no streak gamification, no quick
 * actions duplicating the sidebar, no forced "today's discovery", no
 * categories grid duplicating /browse. The Sidebar holds navigation;
 * document pages hold anchored thinking; the GlobalLiveArtifact below
 * holds the free-mode Live Note. The home page itself only shows what is genuinely
 * unique to "right now": the documents you were just reading.
 *
 * If there is no reading history, the page still needs a visible first step.
 * Silence is fine; a blank failure-state is not.
 */
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useHistory } from '../lib/use-history';

type IndexDoc = { id: string; title: string; href: string; category: string };
type ResumeItem = { id: string; title: string; href: string; viewedAt: number };

let _idxCache: IndexDoc[] | null = null;
async function loadDocs(): Promise<IndexDoc[]> {
  if (_idxCache) return _idxCache;
  try {
    const r = await fetch('/search-index.json');
    if (!r.ok) return [];
    const payload = await r.json();
    const stored = payload.index?.storedFields ?? {};
    const docIds = payload.index?.documentIds ?? {};
    const out: IndexDoc[] = [];
    for (const [internal, fields] of Object.entries<any>(stored)) {
      if (!fields?.title || !fields?.href) continue;
      out.push({
        id: String(docIds[internal] ?? internal),
        title: fields.title,
        href: fields.href,
        category: fields.category ?? '',
      });
    }
    _idxCache = out;
    return out;
  } catch { return []; }
}

export function HomeClient(_props: unknown) {
  const [history] = useHistory();
  const [docs, setDocs] = useState<IndexDoc[]>([]);
  useEffect(() => { loadDocs().then(setDocs); }, []);

  const docsById = useMemo(() => {
    const m = new Map<string, IndexDoc>();
    for (const d of docs) m.set(d.id, d);
    return m;
  }, [docs]);

  const resume: ResumeItem[] = useMemo(() => {
    const seen = new Set<string>();
    const out: ResumeItem[] = [];
    for (const h of history) {
      if (seen.has(h.id) || out.length >= 5) continue;
      seen.add(h.id);
      const meta = docsById.get(h.id);
      out.push({
        id: h.id,
        title: meta?.title ?? h.title,
        href: meta?.href ?? h.href,
        viewedAt: h.viewedAt,
      });
    }
    return out;
  }, [history, docsById]);

  if (resume.length === 0) {
    return <HomeLoom />;
  }

  return (
    <div className="prose-notion" style={{ paddingTop: '4.5rem', paddingBottom: '2rem' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        marginBottom: 18,
      }}>
        <span aria-hidden style={{
          width: 18, height: 1,
          background: 'var(--accent)', opacity: 0.55,
        }} />
        <span className="t-caption2" style={{
          color: 'var(--muted)',
          textTransform: 'uppercase', letterSpacing: '0.10em',
          fontWeight: 700,
        }}>Resume</span>
        <span aria-hidden style={{
          flex: 1, height: 1, background: 'var(--mat-border)',
        }} />
      </div>
      <ul style={{
        listStyle: 'none', padding: 0, margin: 0,
        display: 'flex', flexDirection: 'column', gap: 2,
      }}>
        {resume.map((item) => (
          <li key={item.id}>
            <Link
              href={item.href}
              style={{
                display: 'flex', alignItems: 'baseline', gap: 14,
                padding: '0.65rem 0',
                color: 'var(--fg)', textDecoration: 'none',
                borderBottom: '0.5px solid var(--mat-border)',
              }}
            >
              <span style={{
                flex: 1, minWidth: 0,
                fontFamily: 'var(--display)',
                fontSize: '1rem',
                fontWeight: 500,
                letterSpacing: '-0.012em',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{item.title}</span>
              <span suppressHydrationWarning className="t-caption" style={{
                color: 'var(--muted)', flexShrink: 0,
                fontVariantNumeric: 'tabular-nums',
              }}>{relativeTime(item.viewedAt)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w`;
  const mo = Math.floor(d / 30);
  return `${mo}mo`;
}

/**
 * HomeLoom — the empty-state loom.
 *
 * §32 · 8 warps = LOOM. The 7 wefts are negative space — the user fills them.
 * §25 · self-reference: the kesi warp IS the home page.
 * §27 · Loom is a verb: light plays on silk, the shuttle passes.
 *
 * Silk shimmer: each thread stays at base opacity. A bright highlight
 * travels along each thread like sunlight catching taut silk — direction,
 * speed, and phase differ per thread. The thread never disappears;
 * the light moves ON it.
 */
function HomeLoom() {
  // 12 static silk-sheen warps — full viewport height, pure CSS.
  const WARPS = 12;

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: 'calc(100vh - 6rem)',
    }}>
      {/* §5 Aurora halo */}
      <div aria-hidden style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        background: `
          radial-gradient(ellipse 45% 55% at 42% 46%, rgba(191,90,242,0.07) 0%, transparent 70%),
          radial-gradient(ellipse 50% 45% at 58% 52%, rgba(10,132,255,0.05) 0%, transparent 70%)
        `,
      }} />
      {/* 12 warp threads — absolute positioned for reliable full height */}
      {Array.from({ length: WARPS }, (_, i) => {
        const left = 50 + (i - (WARPS - 1) / 2) * 1.8; // centered, 1.8vw apart
        return (
          <div key={i} aria-hidden style={{
            position: 'absolute',
            left: `${left}vw`,
            top: '8vh',
            bottom: '8vh',
            width: 1,
            background: `linear-gradient(to bottom,
              transparent 0%,
              color-mix(in srgb, var(--fg) 30%, transparent) 20%,
              color-mix(in srgb, var(--fg) 50%, transparent) 45%,
              color-mix(in srgb, var(--fg) 54%, transparent) 50%,
              color-mix(in srgb, var(--fg) 50%, transparent) 55%,
              color-mix(in srgb, var(--fg) 30%, transparent) 80%,
              transparent 100%
            )`,
          }} />
        );
      })}
    </div>
  );
}
