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
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); loadDocs().then(setDocs); }, []);

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

  // Wait for client hydration first.
  if (!mounted) return null;

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
  const WARPS = 8;
  const W = 400;
  const H = 200;
  const PAD = 48;
  const gap = (W - PAD * 2) / (WARPS - 1);

  // Each thread: position, shimmer period, direction (1=down, -1=up), phase delay
  const threads: { x: number; dur: number; dir: 1 | -1; delay: number }[] = [
    { x: PAD + 0 * gap, dur: 4.0, dir:  1, delay: 0    },
    { x: PAD + 1 * gap, dur: 5.2, dir: -1, delay: -1.4 },
    { x: PAD + 2 * gap, dur: 3.6, dir:  1, delay: -0.6 },
    { x: PAD + 3 * gap, dur: 4.8, dir: -1, delay: -3.0 },
    { x: PAD + 4 * gap, dur: 3.4, dir:  1, delay: -1.9 },
    { x: PAD + 5 * gap, dur: 5.6, dir: -1, delay: -3.8 },
    { x: PAD + 6 * gap, dur: 4.2, dir:  1, delay: -0.9 },
    { x: PAD + 7 * gap, dur: 3.8, dir: -1, delay: -2.4 },
  ];

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      minHeight: 'calc(100vh - 6rem)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      {/* §5 Aurora halo — ambient light diffusing from the silk.
          Two soft radial gradients: a warm pink-purple and a cool blue,
          offset from center, very low opacity. */}
      <div aria-hidden style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        background: `
          radial-gradient(ellipse 45% 55% at 42% 46%, rgba(191,90,242,0.07) 0%, transparent 70%),
          radial-gradient(ellipse 50% 45% at 58% 52%, rgba(10,132,255,0.05) 0%, transparent 70%)
        `,
      }} />
      <svg
        viewBox={`0 0 ${W} ${H}`}
        aria-hidden
        style={{
          position: 'relative',
          width: W, maxWidth: '72vw', height: 'auto',
          display: 'block', color: 'var(--fg)',
        }}
      >
        <defs>
          {/* Base thread: always visible, dim — the silk is always there */}
          <linearGradient id="home-warp-base"
            x1="0" y1="0" x2="0" y2={H}
            gradientUnits="userSpaceOnUse">
            <stop offset="0%"   stopColor="currentColor" stopOpacity="0"/>
            <stop offset="20%"  stopColor="currentColor" stopOpacity="0.15"/>
            <stop offset="50%"  stopColor="currentColor" stopOpacity="0.20"/>
            <stop offset="80%"  stopColor="currentColor" stopOpacity="0.15"/>
            <stop offset="100%" stopColor="currentColor" stopOpacity="0"/>
          </linearGradient>
          {/* Per-thread shimmer: a bright band that travels up/down the thread */}
          {threads.map((t, i) => (
              <linearGradient key={i} id={`home-shimmer-${i}`}
                x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"  stopColor="currentColor" stopOpacity="0"/>
                <stop offset="20%" stopColor="currentColor" stopOpacity="0.08">
                  <animate attributeName="offset"
                    values={t.dir === 1 ? '0.05;0.40;0.75;0.40;0.05' : '0.75;0.40;0.05;0.40;0.75'}
                    dur={`${t.dur}s`} begin={`${t.delay}s`}
                    repeatCount="indefinite" />
                </stop>
                <stop offset="35%" stopColor="currentColor" stopOpacity="0.70">
                  <animate attributeName="offset"
                    values={t.dir === 1 ? '0.15;0.48;0.82;0.48;0.15' : '0.82;0.48;0.15;0.48;0.82'}
                    dur={`${t.dur}s`} begin={`${t.delay}s`}
                    repeatCount="indefinite" />
                </stop>
                <stop offset="50%" stopColor="currentColor" stopOpacity="0.08">
                  <animate attributeName="offset"
                    values={t.dir === 1 ? '0.25;0.58;0.92;0.58;0.25' : '0.92;0.58;0.25;0.58;0.92'}
                    dur={`${t.dur}s`} begin={`${t.delay}s`}
                    repeatCount="indefinite" />
                </stop>
                <stop offset="100%" stopColor="currentColor" stopOpacity="0"/>
              </linearGradient>
          ))}
        </defs>

        {/* Warp threads: base layer (always visible) */}
        <g>
          {threads.map((t, i) => (
            <line key={`base-${i}`}
              x1={t.x} y1="0" x2={t.x} y2={H}
              stroke="url(#home-warp-base)"
              strokeWidth="1"
            />
          ))}
        </g>

        {/* Warp threads: shimmer layer (light traveling on silk) */}
        <g>
          {threads.map((t, i) => (
            <line key={`shimmer-${i}`}
              x1={t.x} y1="0" x2={t.x} y2={H}
              stroke={`url(#home-shimmer-${i})`}
              strokeWidth="1"
            />
          ))}
        </g>

        {/* Weft shuttle */}
        <rect x={PAD - 20} y={H / 2 - 0.5} width={70} height={1} rx={0.5} fill="var(--accent)">
          <animate attributeName="x" values={`${PAD - 20};${W - PAD - 50};${PAD - 20}`} keyTimes="0;0.5;1" dur="10s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0;0.45;0.45;0.45;0" keyTimes="0;0.08;0.45;0.92;1" dur="10s" repeatCount="indefinite" />
        </rect>
      </svg>
    </div>
  );
}
