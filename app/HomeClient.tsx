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
import { useRouter } from 'next/navigation';
import { QuietGuideCard } from '../components/QuietGuideCard';
import { summarizeLearningSurface, type LearningSurfaceSummary } from '../lib/learning-status';
import { setReviewResume, continuePanelLifecycle } from '../lib/panel-resume';
import { useHistory } from '../lib/use-history';
import { useAllTraces, type Trace } from '../lib/trace';

type IndexDoc = { id: string; title: string; href: string; category: string };
type ResumeItem = {
  id: string;
  title: string;
  href: string;
  viewedAt: number;
  learning: LearningSurfaceSummary;
  latestSummary: string;
};

let _idxCache: IndexDoc[] | null = null;
async function loadDocs(): Promise<IndexDoc[]> {
  if (_idxCache) return _idxCache;
  try {
    const r = await fetch('/api/search-index');
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
  const { traces } = useAllTraces();
  const router = useRouter();
  useEffect(() => { loadDocs().then(setDocs); }, []);

  const docsById = useMemo(() => {
    const m = new Map<string, IndexDoc>();
    for (const d of docs) m.set(d.id, d);
    return m;
  }, [docs]);

  const tracesByDocId = useMemo(() => {
    const map = new Map<string, Trace[]>();
    for (const trace of traces) {
      if (trace.kind !== 'reading' || trace.parentId || !trace.source?.docId) continue;
      const existing = map.get(trace.source.docId) ?? [];
      existing.push(trace);
      map.set(trace.source.docId, existing);
    }
    return map;
  }, [traces]);

  const resume: ResumeItem[] = useMemo(() => {
    const seen = new Set<string>();
    const out: ResumeItem[] = [];
    for (const h of history) {
      if (seen.has(h.id) || out.length >= 5) continue;
      seen.add(h.id);
      const meta = docsById.get(h.id);
      const traceSet = tracesByDocId.get(h.id) ?? [];
      let latestSummary = '';
      let latestAnchorAt = 0;
      for (const trace of traceSet) {
        for (const event of trace.events) {
          if (event.kind !== 'thought-anchor') continue;
          if (event.at >= latestAnchorAt) {
            latestAnchorAt = event.at;
            latestSummary = event.summary;
          }
        }
      }
      out.push({
        id: h.id,
        title: meta?.title ?? h.title,
        href: meta?.href ?? h.href,
        viewedAt: h.viewedAt,
        learning: summarizeLearningSurface(traceSet, h.viewedAt),
        latestSummary,
      });
    }
    return out;
  }, [history, docsById, tracesByDocId]);

  const kesiCount = useMemo(() => {
    let count = 0;
    for (const trace of traces) {
      if (trace.parentId !== null || !trace.source?.docId) continue;
      if (trace.events.some((event) => event.kind === 'crystallize')) count += 1;
    }
    return count;
  }, [traces]);

  if (resume.length === 0) {
    return <HomeLoom kesiCount={kesiCount} />;
  }

  const current = resume[0] ?? null;

  const openReview = (item: ResumeItem, anchorId: string | null = null) => {
    setReviewResume({ href: item.href, anchorId: anchorId ?? item.learning.latestAnchorId });
    router.push(item.href);
  };

  const openPrimaryAction = (item: ResumeItem) => {
    if (item.learning.nextAction === 'revisit') {
      openReview(item);
      return;
    }
    continuePanelLifecycle(router, {
      href: item.href,
      nextAction: item.learning.nextAction,
      latestAnchorId: item.learning.latestAnchorId,
      refreshSource: 'kesi',
    });
  };

  return (
    <div className="prose-notion" style={{ paddingTop: '4.5rem', paddingBottom: '2rem' }}>
      {current && (
        <QuietGuideCard
          eyebrow="Keep this thread warm"
          title={current.title}
          meta={<span>{relativeTime(current.viewedAt)}</span>}
          summary={current.latestSummary || 'Return to the document you were shaping most recently.'}
          actions={[
            { label: homePrimaryActionLabel(current.learning.nextAction), onClick: () => openPrimaryAction(current), primary: true },
            { label: 'Open source', onClick: () => router.push(current.href) },
          ]}
        />
      )}

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
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{
                  display: 'block',
                  fontFamily: 'var(--display)',
                  fontSize: '1rem',
                  fontWeight: 500,
                  letterSpacing: '-0.012em',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>{item.title}</span>
                {item.latestSummary ? (
                  <span style={{
                    display: 'block',
                    color: 'var(--fg-secondary)',
                    fontSize: '0.83rem',
                    lineHeight: 1.5,
                    marginTop: 4,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>{item.latestSummary}</span>
                ) : null}
              </span>
              <span suppressHydrationWarning className="t-caption" style={{
                color: 'var(--muted)',
                fontVariantNumeric: 'tabular-nums',
                flexShrink: 0,
              }}>{relativeTime(item.viewedAt)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function homePrimaryActionLabel(nextAction: LearningSurfaceSummary['nextAction']) {
  switch (nextAction) {
    case 'refresh':
      return 'Return';
    case 'rehearse':
      return 'Write';
    case 'examine':
      return 'Ask';
    case 'capture':
      return 'Open';
    default:
      return 'Return';
  }
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
 * Sky palettes keyed to the hour of day.
 * Each palette defines the gradient stops for the sky background,
 * mountain fill colors, cloud tints, and star visibility.
 */
type SkyPalette = {
  sky: string[];        // gradient stops top→bottom
  mountain: [string, string, string]; // far, mid, near ridge
  cloud: string;        // cloud tint base
  cloudOpacity: [number, number, number]; // layer 1, 2, 3 opacity
  stars: number;        // star opacity (0 = hidden)
  bookGlow: number;     // glow intensity around the book
};

function getSkyPalette(): SkyPalette {
  const h = new Date().getHours();

  // Night: 21–4
  if (h >= 21 || h < 4) return {
    sky: ['#060810', '#0a0e1a', '#101828', '#151a30', '#1a1e38', '#1e2240', '#222848', '#282e50'],
    mountain: ['#12102a', '#0e0c20', '#08061a'],
    cloud: '#282448',
    cloudOpacity: [0.3, 0.35, 0.4],
    stars: 0.7,
    bookGlow: 0.25,
  };

  // Pre-dawn: 4–6
  if (h < 6) return {
    sky: ['#0a0e1a', '#151a30', '#2a2050', '#3a2858', '#5a3868', '#7a4a78', '#a06048', '#c88050'],
    mountain: ['#2a1840', '#1e1030', '#140c28'],
    cloud: '#c0a0b0',
    cloudOpacity: [0.35, 0.4, 0.5],
    stars: 0.3,
    bookGlow: 0.2,
  };

  // Dawn: 6–8
  if (h < 8) return {
    sky: ['#1a1830', '#2a2050', '#4a3068', '#7a4a78', '#c47a6a', '#e8a870', '#f0c890', '#f8e0b0'],
    mountain: ['#3a2858', '#2a1e40', '#1a1230'],
    cloud: '#e8d0d8',
    cloudOpacity: [0.4, 0.55, 0.65],
    stars: 0.05,
    bookGlow: 0.12,
  };

  // Morning: 8–11
  if (h < 11) return {
    sky: ['#4a6090', '#6080b0', '#80a0cc', '#a0c0e0', '#c0d8ee', '#d8e8f4', '#e8f0f8', '#f0f6fc'],
    mountain: ['#506878', '#405868', '#304858'],
    cloud: '#e8e8f0',
    cloudOpacity: [0.35, 0.45, 0.55],
    stars: 0,
    bookGlow: 0.06,
  };

  // Midday: 11–14
  if (h < 14) return {
    sky: ['#3870a8', '#5090c0', '#70a8d8', '#90c0e8', '#b0d4f0', '#c8e0f4', '#dce8f6', '#e8f0fa'],
    mountain: ['#607080', '#506070', '#405060'],
    cloud: '#f0f0f8',
    cloudOpacity: [0.3, 0.4, 0.5],
    stars: 0,
    bookGlow: 0.04,
  };

  // Afternoon: 14–17
  if (h < 17) return {
    sky: ['#4870a0', '#6088b8', '#80a0cc', '#a0b8d8', '#c0d0e0', '#d8e0e8', '#e0e4ec', '#e8e8f0'],
    mountain: ['#586878', '#486068', '#385058'],
    cloud: '#e0dce8',
    cloudOpacity: [0.35, 0.45, 0.55],
    stars: 0,
    bookGlow: 0.06,
  };

  // Golden hour: 17–19
  if (h < 19) return {
    sky: ['#2a2040', '#3a2850', '#5a3868', '#8a5070', '#c47a6a', '#e8a060', '#f0c070', '#f8d898'],
    mountain: ['#3a2848', '#2a1e38', '#1e1428'],
    cloud: '#e8c8c0',
    cloudOpacity: [0.4, 0.5, 0.6],
    stars: 0,
    bookGlow: 0.1,
  };

  // Dusk: 19–21
  return {
    sky: ['#0a0e1a', '#151a30', '#2a2050', '#4a3068', '#7a4a78', '#c47a6a', '#e8a870', '#e8dcc8'],
    mountain: ['#3a2858', '#2a1e40', '#1a1230'],
    cloud: '#d8c8e0',
    cloudOpacity: [0.4, 0.55, 0.7],
    stars: 0.15,
    bookGlow: 0.18,
  };
}

/**
 * HomeLoom — the empty-state scene.
 *
 * A person sits on a mountain ridge reading above a sea of clouds.
 * The sky changes with the time of day — dawn, midday, dusk, night.
 * §1 · 润物细无声 — no text, no UI, just atmosphere.
 * §25 · The weaver sits above the noise, reading.
 */
function HomeLoom({ kesiCount }: { kesiCount: number }) {
  const p = getSkyPalette();

  // Layout: sky top 55%, horizon glow at 55%, mountains 40-65%, reader at ~42%, clouds 55-100%
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: 'calc(100vh - 3rem)',
        overflow: 'hidden',
      }}
    >
      <div aria-hidden style={{ position: 'absolute', inset: 0 }}>
        {/* Sky gradient — time-of-day aware */}
        <div style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(to bottom, ${p.sky.map((c, i) =>
            `${c} ${Math.round(i / (p.sky.length - 1) * 100)}%`
          ).join(', ')})`,
        }} />

        {/* Horizon glow — warm light at the horizon line */}
        <div style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: '40%',
          height: '30%',
          background: `radial-gradient(ellipse 80% 50% at 50% 40%,
            ${p.sky[p.sky.length - 2]}88 0%, transparent 70%)`,
          pointerEvents: 'none',
        }} />

        {/* Stars — visible at night/dusk, hidden during day */}
        {p.stars > 0 && (
          <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '45%', opacity: p.stars }}>
            {[[12, 8], [25, 15], [38, 6], [52, 18], [67, 10], [78, 22], [88, 5],
              [15, 28], [42, 32], [70, 26], [8, 38], [55, 3], [92, 15], [30, 24],
              [60, 35], [85, 30], [20, 42], [48, 8], [75, 38], [35, 18]].map(([x, y], i) => (
              <circle key={i} cx={`${x}%`} cy={`${y}%`} r={i % 3 === 0 ? 1.2 : 0.7}
                fill="white" opacity={0.3 + (i % 4) * 0.15} />
            ))}
          </svg>
        )}

        {/* All scene elements in one SVG — proper z-order and proportions */}
        <svg
          viewBox="0 0 1600 900"
          preserveAspectRatio="xMidYMid slice"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        >
        <defs>
          <radialGradient id="bookLight" cx="50%" cy="30%">
            <stop offset="0%" stopColor="#fff8e0" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#fff8e0" stopOpacity="0" />
          </radialGradient>
          {/* Soft glow around the reader */}
          <radialGradient id="readerGlow" cx="50%" cy="50%">
            <stop offset="0%" stopColor={p.sky[p.sky.length - 2]} stopOpacity="0.3" />
            <stop offset="100%" stopColor={p.sky[p.sky.length - 2]} stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* ── Far mountains ── */}
        <path
          d="M0,520 Q120,400 250,450 Q380,350 500,420 Q600,320 740,400
             Q850,300 960,380 Q1060,290 1180,370 Q1300,310 1400,360
             Q1500,300 1600,350 L1600,580 L0,580 Z"
          fill={p.mountain[0]} opacity={0.45}
        />

        {/* ── Mid mountains ── */}
        <path
          d="M0,560 Q100,460 220,500 Q340,420 460,480 Q560,380 680,450
             Q780,370 900,430 Q1000,360 1120,420 Q1220,370 1340,410
             Q1440,360 1540,400 Q1580,390 1600,400 L1600,600 L0,600 Z"
          fill={p.mountain[1]} opacity={0.7}
        />

        {/* ── Near ridge — gentle plateau where reader sits ── */}
        <path
          d="M0,600 Q200,560 400,575 Q550,555 700,548
             Q750,545 800,543 Q850,545 900,548
             Q1050,555 1200,575 Q1400,560 1600,600
             L1600,620 L0,620 Z"
          fill={p.mountain[2]}
        />

        {/* ── Glow behind reader ── */}
        <ellipse cx="800" cy="500" rx="180" ry="120" fill="url(#readerGlow)" />

        {/* ── Reader silhouette — large, centered on ridge ── */}
        <g transform="translate(800, 543)" style={{ transformBox: 'fill-box' }}>
          {/* Seated figure — approx 80px wide, origin at bottom center */}
          {/* Head */}
          <ellipse cx="0" cy="-95" rx="14" ry="16" fill={p.mountain[2]} />
          {/* Hair — flowing slightly */}
          <path d="M-14,-98 Q-16,-115 -4,-118 Q6,-120 14,-112 Q16,-105 14,-95
                   M-14,-98 Q-20,-92 -22,-82" fill={p.mountain[2]} />
          {/* Neck */}
          <rect x="-5" y="-80" width="10" height="8" fill={p.mountain[2]} />
          {/* Torso — seated, slight forward lean */}
          <path d="M-20,-73 Q-24,-50 -26,-30 Q-28,-20 -35,-8
                   L35,-8 Q28,-20 26,-30 Q24,-50 20,-73 Z"
            fill={p.mountain[2]} />
          {/* Left arm — bent, holding book */}
          <path d="M-20,-65 Q-30,-55 -34,-42 Q-36,-36 -30,-32 L-14,-35"
            fill={p.mountain[2]} stroke={p.mountain[2]} strokeWidth="3" />
          {/* Right arm */}
          <path d="M20,-65 Q28,-55 30,-42 Q32,-36 26,-32 L14,-35"
            fill={p.mountain[2]} stroke={p.mountain[2]} strokeWidth="3" />
          {/* Book — bright, angled in lap */}
          <rect x="-16" y="-44" width="32" height="20" rx="2"
            fill="#e8dcc8" opacity={0.9}
            transform="rotate(-5, 0, -34)" />
          {/* Book glow */}
          <ellipse cx="0" cy="-50" rx="30" ry="24"
            fill="url(#bookLight)" opacity={p.bookGlow} />
          {/* Legs — crossed, seated */}
          <path d="M-22,-10 Q-32,0 -40,6 Q-44,10 -38,12 L-18,5 Z"
            fill={p.mountain[2]} />
          <path d="M22,-10 Q32,0 40,6 Q44,10 38,12 L18,5 Z"
            fill={p.mountain[2]} />
        </g>

        {/* ── Ground plane below ridge — fills to cloud zone ── */}
        <rect x="0" y="618" width="1600" height="282" fill={p.mountain[2]} />
        </svg>

      {/* Cloud sea — multiple layers with different speeds, below the ridge */}
      <style>{`
        @keyframes cloudDrift1 { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes cloudDrift2 { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes cloudDrift3 { from { transform: translateX(0); } to { transform: translateX(-50%); } }
      `}</style>

        {/* Cloud layer 1 — far, slow */}
        <div style={{
          position: 'absolute',
          bottom: '12%',
          left: 0,
          width: '200%',
          height: '28%',
          animation: 'cloudDrift1 90s linear infinite',
          opacity: p.cloudOpacity[0],
        }}>
        <svg viewBox="0 0 2400 300" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
          <path d="M0,120 Q80,60 180,100 Q300,30 440,80 Q560,10 700,70
                   Q820,20 960,60 Q1080,10 1200,80
                   Q1280,60 1380,100 Q1500,30 1640,80 Q1760,10 1900,70
                   Q2020,20 2160,60 Q2280,10 2400,80
                   L2400,300 L0,300 Z"
            fill={p.cloud} />
        </svg>
        </div>

        {/* Cloud layer 2 — mid speed */}
        <div style={{
          position: 'absolute',
          bottom: '4%',
          left: 0,
          width: '200%',
          height: '30%',
          animation: 'cloudDrift2 60s linear infinite',
          opacity: p.cloudOpacity[1],
        }}>
        <svg viewBox="0 0 2400 300" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
          <path d="M0,100 Q100,40 220,80 Q360,10 500,60 Q620,0 760,50
                   Q880,10 1020,55 Q1140,5 1200,40
                   Q1300,40 1420,80 Q1560,10 1700,60 Q1820,0 1960,50
                   Q2080,10 2220,55 Q2340,5 2400,40
                   L2400,300 L0,300 Z"
            fill={p.cloud} />
        </svg>
        </div>

        {/* Cloud layer 3 — near, faster */}
        <div style={{
          position: 'absolute',
          bottom: '-4%',
          left: 0,
          width: '200%',
          height: '28%',
          animation: 'cloudDrift3 40s linear infinite',
          opacity: p.cloudOpacity[2],
        }}>
        <svg viewBox="0 0 2400 300" preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
          <path d="M0,80 Q120,20 260,60 Q400,0 540,50 Q660,5 800,40
                   Q920,0 1060,45 Q1200,10 1200,50
                   Q1320,20 1460,60 Q1600,0 1740,50 Q1860,5 2000,40
                   Q2120,0 2260,45 Q2400,10 2400,50
                   L2400,300 L0,300 Z"
            fill={p.cloud} />
        </svg>
        </div>

        {/* Bottom fade to page background */}
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '6%',
          background: 'linear-gradient(to bottom, transparent, var(--bg))',
          pointerEvents: 'none',
        }} />
      </div>

      <div
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 24,
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          flexWrap: 'wrap',
          justifyContent: 'center',
          paddingInline: 16,
        }}
      >
        {kesiCount > 0 && (
          <Link
            href="/kesi"
            style={{
              textDecoration: 'none',
              color: 'var(--fg-secondary)',
              padding: '0.34rem 0',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              borderBottom: '0.5px solid var(--mat-border)',
            }}
          >
            <span className="t-caption2" style={{ color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}>
              Kesi
            </span>
            <span style={{ fontFamily: 'var(--display)', fontWeight: 600 }}>{kesiCount}</span>
          </Link>
        )}
        <Link
          href="/knowledge"
          style={{
            textDecoration: 'none',
            color: 'var(--fg-secondary)',
            padding: '0.34rem 0',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            borderBottom: '0.5px solid var(--mat-border)',
          }}
        >
          <span className="t-caption2" style={{ color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}>
            Knowledge
          </span>
        </Link>
      </div>
    </div>
  );
}
