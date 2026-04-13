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
import { LearningStatusInline } from './LearningStatusInline';
import { summarizeLearningSurface, type LearningSurfaceSummary } from '../lib/learning-status';
import { useAllTraces, useRemoveEvents, type Trace } from '../lib/trace';
import { useKnowledgeNav } from '../lib/use-knowledge-nav';
import { REVIEW_RESUME_KEY, type ReviewResumePayload } from '../lib/review-resume';
import { REFRESH_RESUME_KEY, type RefreshResumePayload } from '../lib/refresh-resume';
import { OVERLAY_RESUME_KEY, type OverlayResumePayload } from '../lib/overlay-resume';

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

type BasePanel = {
  traceId: string;
  docId: string;
  href: string;
  title: string;
  summary: string;
  crystallizedAt: number;
  stitches: number;
  tint: string;
  sections: PanelSection[];
};

type Panel = BasePanel & {
  family: string;
  sourceType: 'knowledge' | 'wiki' | 'upload' | 'other';
  collectionLabel: string;
  collectionHref?: string;
  learning: LearningSurfaceSummary;
};

function buildPanels(traces: Trace[]): BasePanel[] {
  const out: BasePanel[] = [];
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
    let stitchCount = 0;
    for (const e of t.events) {
      if (e.kind !== 'thought-anchor') continue;
      stitchCount += 1;
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
      stitches: stitchCount,
      tint: tintFor(t.source.docId),
      sections,
    });
  }

  out.sort((a, b) => b.crystallizedAt - a.crystallizedAt);
  return out;
}

function matchesQuery(panel: Panel, q: string) {
  const hay = [
    panel.title,
    panel.summary,
    ...panel.sections.flatMap((s) => [s.summary, s.quote ?? '']),
  ]
    .join(' ')
    .toLowerCase();
  return hay.includes(q.toLowerCase());
}

function formatWhen(ts: number) {
  const diff = Date.now() - ts;
  const day = 86_400_000;
  if (diff < day) return 'today';
  if (diff < day * 2) return 'yesterday';
  if (diff < day * 7) return `${Math.floor(diff / day)}d ago`;
  if (diff < day * 30) return `${Math.floor(diff / (day * 7))}w ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function familyLabelForHref(
  href: string,
  knowledgeCategories: Array<{ slug: string; label: string }>,
) {
  if (href.startsWith('/wiki/')) return 'LLM Reference';
  const m = href.match(/^\/knowledge\/([^/]+)/);
  if (m) {
    const cat = knowledgeCategories.find((c) => c.slug === m[1]);
    if (!cat) return 'Knowledge';
    const top = cat.label.match(/^([^·]+?)\s*·/);
    return top ? top[1].trim() : cat.label;
  }
  if (href.startsWith('/uploads/')) return 'Uploads';
  return 'Other';
}

function panelSourceMeta(
  href: string,
  knowledgeCategories: Array<{ slug: string; label: string }>,
) {
  if (href.startsWith('/wiki/')) {
    return {
      sourceType: 'wiki' as const,
      collectionLabel: 'LLM Reference',
      collectionHref: '/browse',
    };
  }
  const know = href.match(/^\/knowledge\/([^/]+)/);
  if (know) {
    const cat = knowledgeCategories.find((item) => item.slug === know[1]);
    return {
      sourceType: 'knowledge' as const,
      collectionLabel: cat?.label ?? 'Knowledge',
      collectionHref: `/knowledge/${know[1]}`,
    };
  }
  if (href.startsWith('/uploads/')) {
    return {
      sourceType: 'upload' as const,
      collectionLabel: 'Uploads',
      collectionHref: '/uploads',
    };
  }
  return {
    sourceType: 'other' as const,
    collectionLabel: 'Other',
    collectionHref: undefined,
  };
}

function panelSummary(summary: string, sections: PanelSection[]) {
  if (summary.trim()) return summary;
  const first = sections.find((s) => s.summary.trim());
  if (first) return first.summary;
  const quote = sections.find((s) => s.quote?.trim())?.quote?.trim();
  if (quote) return quote.length > 180 ? `${quote.slice(0, 180)}…` : quote;
  return '';
}

type ViewMode = 'recent' | 'dense';
type SourceFilter = 'all' | 'knowledge' | 'wiki' | 'upload';
type RecencyFilter = 'all' | 'fresh' | 'cooling' | 'stale';

export function KesiView() {
  const { traces, loading } = useAllTraces();
  const removeEvents = useRemoveEvents();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('recent');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [recencyFilter, setRecencyFilter] = useState<RecencyFilter>('all');
  const { knowledgeCategories } = useKnowledgeNav();

  useEffect(() => { setMounted(true); }, []);

  const panels = useMemo(() => {
    return buildPanels(traces).map((panel) => {
      const meta = panelSourceMeta(panel.href, knowledgeCategories);
      return {
        ...panel,
        family: familyLabelForHref(panel.href, knowledgeCategories),
        summary: panelSummary(panel.summary, panel.sections),
        ...meta,
        learning: summarizeLearningSurface(
          traces.find((trace) => trace.id === panel.traceId) ?? null,
        ),
      };
    });
  }, [traces, knowledgeCategories]);

  const visiblePanels = useMemo(() => {
    const q = query.trim();
    return panels.filter((panel) => {
      if (sourceFilter !== 'all' && panel.sourceType !== sourceFilter) return false;
      if (recencyFilter !== 'all' && panel.learning.recency !== recencyFilter) return false;
      if (!q) return true;
      return matchesQuery(panel, q);
    });
  }, [panels, query, sourceFilter, recencyFilter]);

  const sortedPanels = useMemo(() => {
    const next = [...visiblePanels];
    next.sort((a, b) => {
      if (viewMode === 'dense') {
        return b.stitches - a.stitches
          || recencySort(a.learning.recency) - recencySort(b.learning.recency)
          || b.crystallizedAt - a.crystallizedAt;
      }
      return recencySort(a.learning.recency) - recencySort(b.learning.recency)
        || b.crystallizedAt - a.crystallizedAt
        || b.stitches - a.stitches;
    });
    return next;
  }, [visiblePanels, viewMode]);

  const groupedPanels = useMemo(() => {
    const groups = new Map<string, Panel[]>();
    for (const panel of sortedPanels) {
      if (!groups.has(panel.family)) groups.set(panel.family, []);
      groups.get(panel.family)!.push(panel);
    }
    return Array.from(groups.entries()).map(([label, items]) => ({ label, items }));
  }, [sortedPanels]);

  const filterCounts = useMemo(() => {
    return {
      all: panels.length,
      knowledge: panels.filter((panel) => panel.sourceType === 'knowledge').length,
      wiki: panels.filter((panel) => panel.sourceType === 'wiki').length,
      upload: panels.filter((panel) => panel.sourceType === 'upload').length,
      fresh: panels.filter((panel) => panel.learning.recency === 'fresh').length,
      cooling: panels.filter((panel) => panel.learning.recency === 'cooling').length,
      stale: panels.filter((panel) => panel.learning.recency === 'stale').length,
    };
  }, [panels]);

  const returnPanel = sortedPanels[0] ?? null;
  const refreshPanels = sortedPanels
    .filter((panel) => panel.learning.nextAction === 'refresh' && panel.traceId !== returnPanel?.traceId)
    .slice(0, 4);

  const openReview = (panel: Panel, anchorId: string | null = null) => {
    const payload: ReviewResumePayload = {
      href: panel.href,
      anchorId: anchorId ?? panel.sections[0]?.anchorId ?? null,
    };
    try {
      sessionStorage.setItem(REVIEW_RESUME_KEY, JSON.stringify(payload));
    } catch {}
    router.push(panel.href);
  };

  const openRefresh = (panel: Panel) => {
    const reviewPayload: ReviewResumePayload = {
      href: panel.href,
      anchorId: panel.sections[0]?.anchorId ?? null,
    };
    const refreshPayload: RefreshResumePayload = {
      href: panel.href,
      source: 'kesi',
    };
    try {
      sessionStorage.setItem(REVIEW_RESUME_KEY, JSON.stringify(reviewPayload));
      sessionStorage.setItem(REFRESH_RESUME_KEY, JSON.stringify(refreshPayload));
    } catch {}
    router.push(panel.href);
  };

  const openOverlay = (panel: Panel, overlay: OverlayResumePayload['overlay']) => {
    const payload: OverlayResumePayload = {
      href: panel.href,
      overlay,
    };
    try {
      sessionStorage.setItem(OVERLAY_RESUME_KEY, JSON.stringify(payload));
    } catch {}
    router.push(panel.href);
  };

  const openPrimaryAction = (panel: Panel) => {
    if (panel.learning.nextAction === 'refresh') {
      openRefresh(panel);
    } else if (panel.learning.nextAction === 'rehearse') {
      openOverlay(panel, 'rehearsal');
    } else if (panel.learning.nextAction === 'examine') {
      openOverlay(panel, 'examiner');
    } else {
      openReview(panel);
    }
  };

  const content = !mounted || loading
    ? <LoadingKesiShell />
    : panels.length === 0
      ? <EmptyKesiCanvas />
      : (
        <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <span aria-hidden style={{ width: 18, height: 1, background: 'var(--accent)', opacity: 0.55 }} />
          <span className="t-caption2" style={{ color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.10em', fontWeight: 700 }}>
            Kesi
          </span>
          <span aria-hidden style={{ flex: 1, height: 1, background: 'var(--mat-border)' }} />
          <span className="t-caption2" style={{ color: 'var(--accent)', letterSpacing: '0.08em', fontWeight: 700 }}>
            {sortedPanels.length}
          </span>
        </div>

        {returnPanel && (
          <section
            className="material-thick"
            style={{
              padding: '1rem 1.05rem 1.05rem',
              borderRadius: 'var(--r-3)',
              marginBottom: 18,
              boxShadow: 'var(--shadow-1)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span aria-hidden style={{ width: 14, height: 1, background: returnPanel.tint, opacity: 0.65 }} />
              <span
                className="t-caption2"
                style={{
                  color: 'var(--muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  fontWeight: 700,
                }}
              >
                Return to weave
              </span>
              <span aria-hidden style={{ flex: 1, height: 1, background: 'var(--mat-border)' }} />
              <LearningStatusInline status={returnPanel.learning} compact />
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 260 }}>
                <div
                  style={{
                    fontFamily: 'var(--display)',
                    fontSize: '1.18rem',
                    fontWeight: 650,
                    letterSpacing: '-0.02em',
                    lineHeight: 1.25,
                    marginBottom: 6,
                  }}
                >
                  {returnPanel.title}
                </div>

                <div
                  className="t-caption2"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    flexWrap: 'wrap',
                    color: 'var(--muted)',
                    letterSpacing: '0.04em',
                    marginBottom: 8,
                  }}
                >
                  <span>{returnPanel.family}</span>
                  <span aria-hidden>·</span>
                  <span>{formatWhen(returnPanel.crystallizedAt)}</span>
                  <span aria-hidden>·</span>
                  <span>{returnPanel.stitches} stitches</span>
                  {returnPanel.collectionLabel && returnPanel.collectionLabel !== returnPanel.family && (
                    <>
                      <span aria-hidden>·</span>
                      <span>{returnPanel.collectionLabel}</span>
                    </>
                  )}
                </div>

                <div
                  style={{
                    color: 'var(--fg-secondary)',
                    fontSize: '0.9rem',
                    lineHeight: 1.55,
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    maxWidth: '72ch',
                  }}
                >
                  {returnPanel.summary}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => openPrimaryAction(returnPanel)}
                  style={actionStyle(true)}
                >
                  {primaryActionLabel(returnPanel.learning.nextAction)}
                </button>
                <button
                  type="button"
                  onClick={() => router.push(returnPanel.href)}
                  style={actionStyle(false)}
                >
                  Source
                </button>
                {returnPanel.collectionHref && returnPanel.collectionHref !== returnPanel.href && (
                  <button
                    type="button"
                    onClick={() => router.push(returnPanel.collectionHref!)}
                    style={actionStyle(false)}
                  >
                    Collection
                  </button>
                )}
              </div>
            </div>
          </section>
        )}

        {refreshPanels.length > 0 && (
          <section
            className="material-thick"
            style={{
              padding: '0.95rem 1.05rem',
              borderRadius: 'var(--r-3)',
              marginBottom: 18,
              boxShadow: 'var(--shadow-1)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span aria-hidden style={{ width: 14, height: 1, background: 'var(--tint-orange)', opacity: 0.65 }} />
              <span
                className="t-caption2"
                style={{
                  color: 'var(--muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  fontWeight: 700,
                }}
              >
                Needs refresh
              </span>
              <span aria-hidden style={{ flex: 1, height: 1, background: 'var(--mat-border)' }} />
              <span className="t-caption2" style={{ color: 'var(--tint-orange)', letterSpacing: '0.08em', fontWeight: 700 }}>
                {refreshPanels.length}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {refreshPanels.map((panel, index) => (
                <div
                  key={panel.traceId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '0.78rem 0',
                    borderBottom: index < refreshPanels.length - 1 ? '0.5px solid var(--mat-border)' : 'none',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: 'var(--display)',
                        fontSize: '0.98rem',
                        fontWeight: 600,
                        letterSpacing: '-0.012em',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {panel.title}
                    </div>
                    <div
                      className="t-caption2"
                      style={{
                        marginTop: 5,
                        color: 'var(--muted)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        flexWrap: 'wrap',
                      }}
                    >
                      <span>{panel.family}</span>
                      <span aria-hidden>·</span>
                      <span>{formatWhen(panel.crystallizedAt)}</span>
                      <span aria-hidden>·</span>
                      <span>{Math.max(1, Math.round(panel.learning.daysSinceTouch))}d cold</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => openRefresh(panel)}
                    style={actionStyle(true)}
                  >
                    Refresh
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        <div
          className="material-thick"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '0.5rem 0.8rem',
            borderRadius: 999,
            marginBottom: 18,
            boxShadow: 'var(--shadow-1)',
          }}
        >
          <span
            aria-hidden
            style={{ color: 'var(--muted)', fontSize: '0.8rem', lineHeight: 1 }}
          >
            ⌕
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a woven panel…"
            style={{
              flex: 1,
              minWidth: 0,
              border: 0,
              outline: 'none',
              background: 'transparent',
              color: 'var(--fg)',
              fontFamily: 'var(--display)',
              fontSize: '0.92rem',
              letterSpacing: '-0.01em',
            }}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              style={{
                border: 0,
                background: 'transparent',
                color: 'var(--muted)',
                cursor: 'pointer',
                padding: 0,
                fontSize: '0.9rem',
                lineHeight: 1,
              }}
            >
              ×
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
          <ToolbarChip
            active={viewMode === 'recent'}
            onClick={() => setViewMode('recent')}
            label="Recent"
          />
          <ToolbarChip
            active={viewMode === 'dense'}
            onClick={() => setViewMode('dense')}
            label="Dense"
          />
          <ToolbarChip
            active={sourceFilter === 'all'}
            onClick={() => setSourceFilter('all')}
            label={`All · ${filterCounts.all}`}
          />
          <ToolbarChip
            active={sourceFilter === 'knowledge'}
            onClick={() => setSourceFilter('knowledge')}
            label={`Knowledge · ${filterCounts.knowledge}`}
          />
          <ToolbarChip
            active={sourceFilter === 'wiki'}
            onClick={() => setSourceFilter('wiki')}
            label={`LLM · ${filterCounts.wiki}`}
          />
          <ToolbarChip
            active={sourceFilter === 'upload'}
            onClick={() => setSourceFilter('upload')}
            label={`Uploads · ${filterCounts.upload}`}
          />
          <ToolbarChip
            active={recencyFilter === 'all'}
            onClick={() => setRecencyFilter('all')}
            label={`Any time · ${filterCounts.all}`}
          />
          <ToolbarChip
            active={recencyFilter === 'fresh'}
            onClick={() => setRecencyFilter('fresh')}
            label={`Fresh · ${filterCounts.fresh}`}
          />
          <ToolbarChip
            active={recencyFilter === 'cooling'}
            onClick={() => setRecencyFilter('cooling')}
            label={`Cooling · ${filterCounts.cooling}`}
          />
          <ToolbarChip
            active={recencyFilter === 'stale'}
            onClick={() => setRecencyFilter('stale')}
            label={`Stale · ${filterCounts.stale}`}
          />
        </div>

        {sortedPanels.length === 0 && (
          <div
            className="material-thick"
            style={{
              padding: '1rem 1.1rem',
              borderRadius: 14,
              color: 'var(--muted)',
              fontStyle: 'italic',
            }}
          >
            No woven panel matches “{query}”.
          </div>
        )}

        {/* Warp threads — vertical separators that run through all panels,
            like the continuous warp of a kesi fabric. */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
          }}
        >
          {/* Warp overlay */}
          <div aria-hidden style={{
            position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1,
            backgroundImage: `repeating-linear-gradient(90deg,
              transparent 0,
              transparent calc(50% - 0.25px),
              var(--mat-border) calc(50% - 0.25px),
              var(--mat-border) calc(50% + 0.25px),
              transparent calc(50% + 0.25px))`,
            opacity: 0.3,
          }} />
          {groupedPanels.map((group) => (
            <section key={group.label} style={{ position: 'relative', zIndex: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span aria-hidden style={{ width: 14, height: 1, background: 'var(--accent)', opacity: 0.45 }} />
                <span className="t-caption2" style={{ color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
                  {group.label}
                </span>
                <span aria-hidden style={{ flex: 1, height: 1, background: 'var(--mat-border)' }} />
                <span className="t-caption2" style={{ color: 'var(--muted)', opacity: 0.7 }}>
                  {group.items.length}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {group.items.map((panel) => (
                  <div
                    key={panel.traceId}
                    style={{
                      position: 'relative',
                      borderRadius: 14,
                      padding: '1rem 1.2rem',
                      borderLeft: `3px solid ${panel.tint}`,
                      background: `linear-gradient(90deg, color-mix(in srgb, ${panel.tint} 6%, transparent), transparent 40%)`,
                      color: 'var(--fg)',
                      cursor: 'pointer',
                    }}
                    onClick={() => openPrimaryAction(panel)}
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

                    <div style={{
                      display: 'flex', alignItems: 'baseline', gap: 10,
                      marginBottom: 7,
                    }}>
                      <div
                        style={{
                          flex: 1,
                          fontFamily: 'var(--display)',
                          fontSize: '1.1rem',
                          fontWeight: 650,
                          letterSpacing: '-0.02em',
                          lineHeight: 1.3,
                        }}
                      >
                        {panel.title}
                      </div>
                      <span className="t-caption2" style={{ color: 'var(--muted)', fontFamily: 'var(--mono)', flexShrink: 0 }}>
                        {panel.sections.length}◆
                      </span>
                    </div>

                    <div
                      className="t-caption2"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        color: 'var(--muted)',
                        letterSpacing: '0.03em',
                        fontWeight: 600,
                        marginBottom: 8,
                        flexWrap: 'wrap',
                      }}
                    >
                      <span>{panel.family}</span>
                      <span aria-hidden>·</span>
                      <span>{formatWhen(panel.crystallizedAt)}</span>
                      <span aria-hidden>·</span>
                      <span>{panel.stitches} stitches</span>
                      {panel.collectionLabel && panel.collectionLabel !== panel.family && (
                        <>
                          <span aria-hidden>·</span>
                          <span>{panel.collectionLabel}</span>
                        </>
                      )}
                      {panel.summary && (
                        <>
                          <span aria-hidden>·</span>
                          <span>finished</span>
                        </>
                      )}
                    </div>

                    <div style={{ marginBottom: 8 }}>
                      <LearningStatusInline status={panel.learning} compact />
                    </div>

                    <div
                      style={{
                        color: 'var(--fg-secondary)',
                        fontSize: '0.88rem',
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

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: panel.sections.length > 0 ? 12 : 0 }}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openPrimaryAction(panel);
                        }}
                        style={actionStyle(true)}
                      >
                        {primaryActionLabel(panel.learning.nextAction)}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(panel.href);
                        }}
                        style={actionStyle(false)}
                      >
                        Source
                      </button>
                      {panel.collectionHref && panel.collectionHref !== panel.href && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(panel.collectionHref!);
                          }}
                          style={actionStyle(false)}
                        >
                          Collection
                        </button>
                      )}
                    </div>

                    {panel.sections.length > 0 && (
                      <div
                        style={{
                          borderTop: '0.5px solid var(--mat-border)',
                          paddingTop: 12,
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                          gap: 10,
                        }}
                      >
                        {panel.sections.slice(0, 4).map((section) => (
                          <div
                            key={section.anchorId}
                            onClick={(e) => {
                              e.stopPropagation();
                              openReview(panel, section.anchorId);
                            }}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                e.stopPropagation();
                                openReview(panel, section.anchorId);
                              }
                            }}
                            style={{ cursor: 'pointer' }}
                          >
                            <div
                              style={{
                                color: panel.tint,
                                fontSize: '0.82rem',
                                lineHeight: 1.45,
                                fontWeight: 600,
                                overflow: 'hidden',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                              }}
                            >
                              ◆ {section.summary}
                            </div>
                            {section.quote && (
                              <div
                                className="t-caption2"
                                style={{
                                  color: 'var(--muted)',
                                  fontStyle: 'italic',
                                  lineHeight: 1.45,
                                  marginTop: 4,
                                  overflow: 'hidden',
                                  display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                              }}
                            >
                              {section.quote.length > 120 ? `${section.quote.slice(0, 120)}…` : section.quote}
                            </div>
                          )}
                        </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
        </>
      );

  return (
    <KesiShell>
      {content}
    </KesiShell>
  );
}

function KesiShell({ children }: { children: React.ReactNode }) {
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
        {children}
      </div>
    </div>
  );
}

function LoadingKesiShell() {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <span aria-hidden style={{ width: 18, height: 1, background: 'var(--accent)', opacity: 0.55 }} />
        <span className="t-caption2" style={{ color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.10em', fontWeight: 700 }}>
          Kesi
        </span>
        <span aria-hidden style={{ flex: 1, height: 1, background: 'var(--mat-border)' }} />
      </div>

      <div
        className="material-thick"
        style={{
          padding: '1rem 1.05rem 1.05rem',
          borderRadius: 'var(--r-3)',
          marginBottom: 18,
          boxShadow: 'var(--shadow-1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span aria-hidden style={{ width: 14, height: 1, background: 'var(--accent)', opacity: 0.4 }} />
          <span className="t-caption2" style={{ color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
            Return to weave
          </span>
          <span aria-hidden style={{ flex: 1, height: 1, background: 'var(--mat-border)' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ width: '42%', height: 16, borderRadius: 999, background: 'var(--surface-2)' }} />
          <div style={{ width: '78%', height: 12, borderRadius: 999, background: 'var(--surface-2)' }} />
          <div style={{ width: '64%', height: 12, borderRadius: 999, background: 'var(--surface-2)' }} />
        </div>
      </div>

      <div
        className="material-thick"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0.5rem 0.8rem',
          borderRadius: 999,
          marginBottom: 18,
          boxShadow: 'var(--shadow-1)',
          color: 'var(--muted)',
        }}
      >
        <span aria-hidden style={{ fontSize: '0.8rem', lineHeight: 1 }}>⌕</span>
        <span
          style={{
            flex: 1,
            height: 12,
            borderRadius: 999,
            background: 'var(--surface-2)',
          }}
        />
      </div>

      <EmptyKesiCanvas />
    </>
  );
}

function ToolbarChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '0.42rem 0.72rem',
        borderRadius: 999,
        border: `0.5px solid ${active ? 'var(--accent)' : 'var(--mat-border)'}`,
        background: active ? 'var(--accent-soft)' : 'var(--bg-translucent)',
        color: active ? 'var(--fg)' : 'var(--muted)',
        fontSize: '0.76rem',
        fontWeight: 700,
        letterSpacing: '0.04em',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

function actionStyle(primary: boolean) {
  return {
    padding: '0.42rem 0.72rem',
    borderRadius: 999,
    border: `0.5px solid ${primary ? 'var(--accent)' : 'var(--mat-border)'}`,
    background: primary ? 'var(--accent-soft)' : 'transparent',
    color: primary ? 'var(--fg)' : 'var(--fg-secondary)',
    fontSize: '0.76rem',
    fontWeight: 700,
    letterSpacing: '0.04em',
    cursor: 'pointer',
  } as const;
}

function primaryActionLabel(nextAction: LearningSurfaceSummary['nextAction']) {
  switch (nextAction) {
    case 'refresh':
      return 'Refresh';
    case 'rehearse':
      return 'Rehearsal';
    case 'examine':
      return 'Examiner';
    case 'capture':
      return 'Source';
    case 'revisit':
    default:
      return 'Review';
  }
}

function recencySort(recency: LearningSurfaceSummary['recency']) {
  return recency === 'stale' ? 0 : recency === 'cooling' ? 1 : 2;
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
