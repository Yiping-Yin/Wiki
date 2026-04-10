'use client';
/**
 * KesiView · the portfolio of crystallized panels.
 *
 * /kesi should show finished pieces of understanding, not abstract swatches.
 * Each crystallized reading trace becomes a readable panel: title, final
 * summary, and the first few woven sections that make up its thought map.
 */
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAllTraces, useRemoveEvents, type Trace } from '../lib/trace';

const TINTS = [
  'var(--tint-blue)',   'var(--tint-indigo)', 'var(--tint-purple)',
  'var(--tint-pink)',   'var(--tint-red)',    'var(--tint-orange)',
  'var(--tint-yellow)', 'var(--tint-green)',  'var(--tint-mint)',
  'var(--tint-teal)',   'var(--tint-cyan)',
];

function tintFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length];
}

type PanelSection = {
  anchorId: string;
  summary: string;
  quote?: string;
  at: number;
};

type Panel = {
  traceId: string;
  docId: string;
  href: string;
  title: string;
  summary: string;
  crystallizedAt: number;
  depth: number;
  tint: string;
  sections: PanelSection[];
};

function buildPanels(traces: Trace[]): Panel[] {
  const out: Panel[] = [];
  for (const t of traces) {
    if (!t.source?.docId) continue;
    if (t.parentId !== null) continue;

    let cAt = 0;
    let cSum = '';
    for (const e of t.events) {
      if (e.kind === 'crystallize' && e.at > cAt) {
        cAt = e.at;
        cSum = e.summary;
      }
    }
    if (cAt === 0) continue;

    const latestByAnchor = new Map<string, PanelSection>();
    for (const e of t.events) {
      if (e.kind !== 'thought-anchor') continue;
      const prev = latestByAnchor.get(e.anchorId);
      if (!prev || e.at > prev.at) {
        latestByAnchor.set(e.anchorId, {
          anchorId: e.anchorId,
          summary: e.summary,
          quote: e.quote,
          at: e.at,
        });
      }
    }

    const sections = Array.from(latestByAnchor.values())
      .sort((a, b) => a.at - b.at);

    out.push({
      traceId: t.id,
      docId: t.source.docId,
      href: t.source.href,
      title: t.source.sourceTitle ?? t.title,
      summary: cSum,
      crystallizedAt: cAt,
      depth: t.events.length,
      tint: tintFor(t.source.docId),
      sections,
    });
  }

  out.sort((a, b) => b.crystallizedAt - a.crystallizedAt);
  return out;
}

export function KesiView() {
  const { traces, loading } = useAllTraces();
  const removeEvents = useRemoveEvents();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const panels = useMemo(() => buildPanels(traces), [traces]);

  if (loading || !mounted) return null;
  if (panels.length === 0) return <EmptyKesiCanvas />;

  return (
    <div
      style={{
        width: '100%',
        minHeight: 'calc(100vh - 4rem)',
        padding: '2.4rem 1.25rem 4rem',
        background: `
          radial-gradient(ellipse 60% 50% at 50% 24%, rgba(255,255,255,0.92) 0%, transparent 70%),
          radial-gradient(ellipse 70% 60% at 24% 24%, color-mix(in srgb, var(--accent) 5%, transparent) 0%, transparent 60%)
        `,
      }}
    >
      <div
        style={{
          width: 'min(1180px, 100%)',
          margin: '0 auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <span aria-hidden style={{ width: 18, height: 1, background: 'var(--accent)', opacity: 0.55 }} />
          <span className="t-caption2" style={{ color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.10em', fontWeight: 700 }}>
            Kesi
          </span>
          <span aria-hidden style={{ flex: 1, height: 1, background: 'var(--mat-border)' }} />
          <span className="t-caption2" style={{ color: 'var(--accent)', letterSpacing: '0.08em', fontWeight: 700 }}>
            {panels.length}
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: 20,
          }}
        >
          {panels.map((panel) => (
            <div
              key={panel.traceId}
              className="material-thick card-lift"
              style={{
                position: 'relative',
                borderRadius: 22,
                padding: '1rem 1.05rem 1.05rem',
                border: '0.5px solid var(--mat-border)',
                color: 'var(--fg)',
                cursor: 'pointer',
              }}
              onClick={() => router.push(panel.href)}
              onMouseEnter={(e) => {
                const btn = e.currentTarget.querySelector('[aria-label="Remove from Kesi"]') as HTMLElement | null;
                if (btn) btn.style.opacity = '0.5';
              }}
              onMouseLeave={(e) => {
                const btn = e.currentTarget.querySelector('[aria-label="Remove from Kesi"]') as HTMLElement | null;
                if (btn) { btn.style.opacity = '0'; btn.style.color = 'var(--muted)'; btn.style.background = 'transparent'; }
              }}
            >
              {/* Delete button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void removeEvents(panel.traceId, (ev) => ev.kind === 'crystallize');
                }}
                aria-label="Remove from Kesi"
                title="Remove from Kesi"
                style={{
                  position: 'absolute', top: 10, right: 12, zIndex: 2,
                  background: 'transparent', border: 0, cursor: 'pointer',
                  color: 'var(--muted)', fontSize: '0.88rem', lineHeight: 1,
                  padding: '4px 6px', borderRadius: 6,
                  opacity: 0,
                  transition: 'opacity 0.18s var(--ease), color 0.18s var(--ease), background 0.18s var(--ease)',
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget;
                  el.style.opacity = '1';
                  el.style.color = 'var(--tint-red)';
                  el.style.background = 'var(--surface-2)';
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget;
                  el.style.opacity = '0';
                  el.style.color = 'var(--muted)';
                  el.style.background = 'transparent';
                }}
              >×</button>

              <div style={{ marginBottom: 12 }}>
                <div
                  aria-hidden
                  style={{
                    height: 18,
                    borderRadius: 999,
                    background: `
                      repeating-linear-gradient(
                        90deg,
                        color-mix(in srgb, ${panel.tint} 70%, transparent) 0 1px,
                        transparent 1px 12px
                      )
                    `,
                    opacity: 0.7,
                  }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span className="t-caption2" style={{ color: panel.tint, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
                  Panel
                </span>
                <span aria-hidden style={{ flex: 1, height: 1, background: 'var(--mat-border)' }} />
                <span className="t-caption2" style={{ color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                  {panel.sections.length}◆
                </span>
              </div>

              <div
                style={{
                  fontFamily: 'var(--display)',
                  fontSize: '1.2rem',
                  fontWeight: 650,
                  letterSpacing: '-0.02em',
                  lineHeight: 1.2,
                  marginBottom: 10,
                }}
              >
                {panel.title}
              </div>

              <div
                style={{
                  color: 'var(--fg-secondary)',
                  fontSize: '0.9rem',
                  lineHeight: 1.55,
                  marginBottom: panel.sections.length > 0 ? 14 : 6,
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                }}
              >
                {panel.summary}
              </div>

              {panel.sections.length > 0 && (
                <div
                  style={{
                    borderTop: '0.5px solid var(--mat-border)',
                    paddingTop: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  {panel.sections.slice(0, 4).map((section) => (
                    <div key={section.anchorId}>
                      <div className="t-caption2" style={{ color: panel.tint, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 4 }}>
                        ◆ Woven Section
                      </div>
                      <div
                        style={{
                          color: 'var(--fg)',
                          fontSize: '0.88rem',
                          lineHeight: 1.5,
                          overflow: 'hidden',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                        }}
                      >
                        {section.summary}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EmptyKesiCanvas() {
  return (
    <div className="kesi-empty-quiet">
      <svg
        viewBox="0 0 280 96"
        aria-hidden
        style={{ width: 280, height: 96, display: 'block', color: 'var(--fg)' }}
      >
        <defs>
          <linearGradient id="silk-thread"
            x1="0" y1="6" x2="0" y2="90"
            gradientUnits="userSpaceOnUse">
            <stop offset="0%"  stopColor="currentColor" stopOpacity="0.16"/>
            <stop offset="22%" stopColor="currentColor" stopOpacity="0.40"/>
            <stop offset="50%" stopColor="currentColor" stopOpacity="0.62"/>
            <stop offset="78%" stopColor="currentColor" stopOpacity="0.40"/>
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.16"/>
          </linearGradient>
        </defs>
        <g strokeLinecap="butt">
          {Array.from({ length: 12 }, (_, i) => {
            const x = 14 + i * 23;
            return (
              <line
                key={i}
                x1={x} y1="6" x2={x} y2="90"
                stroke="url(#silk-thread)"
                strokeWidth="0.6"
              />
            );
          })}
        </g>
      </svg>
      <style>{`
        .kesi-empty-quiet {
          width: 100%;
          min-height: calc(100vh - 4rem);
          display: flex;
          align-items: center;
          justify-content: center;
        }
      `}</style>
    </div>
  );
}
