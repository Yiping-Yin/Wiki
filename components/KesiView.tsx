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
import { continuePanelLifecycle, openPanelReview } from '../lib/panel-resume';

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
  traceIds: string[];
  primaryTraceId: string;
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

type DirectedPanelRelations = {
  incoming: Panel[];
  outgoing: Panel[];
};

function buildPanels(traces: Trace[]): BasePanel[] {
  const tracesByDocId = new Map<string, Trace[]>();
  for (const trace of traces) {
    if (!trace.source?.docId) continue;
    if (trace.parentId !== null) continue;
    const existing = tracesByDocId.get(trace.source.docId) ?? [];
    existing.push(trace);
    tracesByDocId.set(trace.source.docId, existing);
  }

  const out: BasePanel[] = [];
  for (const [docId, traceSet] of tracesByDocId) {
    const representative = [...traceSet].sort(
      (a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt,
    )[0];
    if (!representative?.source?.docId) continue;

    let cAt = 0;
    let cSum = '';
    const latestByAnchor = new Map<string, PanelSection>();
    let stitchCount = 0;

    for (const trace of traceSet) {
      for (const e of trace.events) {
        if (e.kind === 'crystallize' && e.at > cAt) {
          cAt = e.at;
          cSum = e.summary;
        }
        if (e.kind !== 'thought-anchor') continue;
        stitchCount += 1;
        const anchorKey = [
          e.anchorId,
          e.anchorBlockId ?? '',
          e.anchorBlockText ?? '',
          String(e.anchorCharStart ?? ''),
          String(e.anchorCharEnd ?? ''),
        ].join('::');
        const prev = latestByAnchor.get(anchorKey);
        if (!prev || e.at > prev.at) {
          latestByAnchor.set(anchorKey, {
            anchorId: e.anchorId,
            summary: e.summary,
            quote: e.quote,
            at: e.at,
          });
        }
      }
    }
    if (cAt === 0) continue;

    const sections = Array.from(latestByAnchor.values())
      .sort((a, b) => a.at - b.at);

    out.push({
      traceIds: traceSet.map((trace) => trace.id),
      primaryTraceId: representative.id,
      docId,
      href: representative.source.href,
      title: representative.source.sourceTitle ?? representative.title,
      summary: cSum,
      crystallizedAt: cAt,
      stitches: stitchCount,
      tint: tintFor(docId),
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
  if (href.startsWith('/uploads/')) return 'Intake';
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
      collectionLabel: 'Intake',
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

function extractMarkdownLinkUrls(content: string): string[] {
  if (!content) return [];
  const urls: string[] = [];
  const re = /\[[^\]]*\]\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const url = m[1].trim().split(/\s+/)[0];
    if (url) urls.push(url);
  }
  return urls;
}

function urlReferencesDoc(url: string, docHref: string): boolean {
  if (!url || !docHref) return false;
  const cleanUrl = url.split('#')[0].split('?')[0];
  if (cleanUrl === docHref) return true;
  if (cleanUrl.endsWith(docHref)) return true;
  if (cleanUrl.endsWith(docHref.replace(/^\//, ''))) return true;
  return false;
}

function syncKesiFocusParam(docId: string | null) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (docId) url.searchParams.set('focus', docId);
  else url.searchParams.delete('focus');
  window.history.replaceState({}, '', url.toString());
}

type ViewMode = 'recent' | 'dense';
type SourceFilter = 'all' | 'knowledge' | 'wiki' | 'upload';
type RecencyFilter = 'all' | 'fresh' | 'cooling' | 'stale';

export function KesiView() {
  const { traces, loading } = useAllTraces();
  const removeEvents = useRemoveEvents();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [focusDocId, setFocusDocId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('recent');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [recencyFilter, setRecencyFilter] = useState<RecencyFilter>('all');
  const { knowledgeCategories } = useKnowledgeNav();

  useEffect(() => {
    setMounted(true);
    try {
      const params = new URLSearchParams(window.location.search);
      setFocusDocId(params.get('focus'));
    } catch {
      setFocusDocId(null);
    }
  }, []);

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

  const panels = useMemo(() => {
    return buildPanels(traces).map((panel) => {
      const meta = panelSourceMeta(panel.href, knowledgeCategories);
      return {
        ...panel,
        family: familyLabelForHref(panel.href, knowledgeCategories),
        summary: panelSummary(panel.summary, panel.sections),
        ...meta,
        learning: summarizeLearningSurface(tracesByDocId.get(panel.docId) ?? [], 0),
      };
    });
  }, [traces, knowledgeCategories, tracesByDocId]);

  const relationCounts = useMemo(() => {
    const counts = new Map<string, { incoming: number; outgoing: number }>();
    const panelByHref = new Map(panels.map((panel) => [panel.href, panel] as const));
    const seen = new Set<string>();

    for (const panel of panels) {
      counts.set(panel.docId, { incoming: 0, outgoing: 0 });
    }

    for (const panel of panels) {
      const traceSet = tracesByDocId.get(panel.docId) ?? [];
      const latestByAnchor = new Map<string, { content: string; at: number }>();
      for (const trace of traceSet) {
        for (const event of trace.events) {
          if (event.kind !== 'thought-anchor') continue;
          const prev = latestByAnchor.get(event.anchorId);
          if (!prev || event.at > prev.at) {
            latestByAnchor.set(event.anchorId, { content: event.content, at: event.at });
          }
        }
      }

      for (const { content } of latestByAnchor.values()) {
        for (const url of extractMarkdownLinkUrls(content)) {
          const target = Array.from(panelByHref.values()).find((candidate) => urlReferencesDoc(url, candidate.href));
          if (!target || target.docId === panel.docId) continue;
          const key = `${panel.docId}=>${target.docId}`;
          if (seen.has(key)) continue;
          seen.add(key);
          counts.get(panel.docId)!.outgoing += 1;
          counts.get(target.docId)!.incoming += 1;
        }
      }
    }

    return counts;
  }, [panels, tracesByDocId]);

  const relationPreview = useMemo(() => {
    const previews = new Map<string, DirectedPanelRelations>();
    const panelByHref = new Map(panels.map((panel) => [panel.href, panel] as const));
    const seen = new Set<string>();

    for (const panel of panels) {
      previews.set(panel.docId, { incoming: [], outgoing: [] });
    }

    for (const panel of panels) {
      const traceSet = tracesByDocId.get(panel.docId) ?? [];
      const latestByAnchor = new Map<string, { content: string; at: number }>();
      for (const trace of traceSet) {
        for (const event of trace.events) {
          if (event.kind !== 'thought-anchor') continue;
          const prev = latestByAnchor.get(event.anchorId);
          if (!prev || event.at > prev.at) {
            latestByAnchor.set(event.anchorId, { content: event.content, at: event.at });
          }
        }
      }

      for (const { content } of latestByAnchor.values()) {
        for (const url of extractMarkdownLinkUrls(content)) {
          const target = Array.from(panelByHref.values()).find((candidate) => urlReferencesDoc(url, candidate.href));
          if (!target || target.docId === panel.docId) continue;
          const key = `${panel.docId}=>${target.docId}`;
          if (seen.has(key)) continue;
          seen.add(key);
          previews.set(panel.docId, {
            incoming: previews.get(panel.docId)?.incoming ?? [],
            outgoing: [...(previews.get(panel.docId)?.outgoing ?? []), target],
          });
          previews.set(target.docId, {
            incoming: [...(previews.get(target.docId)?.incoming ?? []), panel],
            outgoing: previews.get(target.docId)?.outgoing ?? [],
          });
        }
      }
    }

    return previews;
  }, [panels, tracesByDocId]);

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

  const focusPanel = focusDocId
    ? sortedPanels.find((panel) => panel.docId === focusDocId) ?? null
    : null;
  const returnPanel = focusPanel ?? sortedPanels[0] ?? null;
  const refreshPanels = sortedPanels
    .filter((panel) => panel.learning.nextAction === 'refresh' && panel.docId !== returnPanel?.docId)
    .slice(0, 4);
  const continuePanels = sortedPanels
    .filter((panel) => (
      panel.docId !== returnPanel?.docId
      && panel.learning.nextAction !== 'refresh'
      && panel.learning.nextAction !== 'capture'
    ))
    .slice(0, 4);

  const renderRelationButtons = (
    label: string,
    items: Panel[],
    limit: number,
    opts?: { marginTop?: number },
  ) => {
    if (items.length === 0) return null;
    return (
      <div
        className="t-caption2"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          color: 'var(--muted)',
          letterSpacing: '0.04em',
          marginTop: opts?.marginTop ?? 0,
        }}
      >
        <span>{label}</span>
        {items.slice(0, limit).map((relatedPanel, index) => (
          <button
            key={relatedPanel.docId}
            type="button"
            onClick={() => focusPanelInKesi(relatedPanel)}
            style={{
              appearance: 'none',
              border: 0,
              background: 'transparent',
              color: 'var(--accent)',
              fontSize: '0.72rem',
              fontWeight: 700,
              letterSpacing: '0.02em',
              padding: 0,
              cursor: 'pointer',
            }}
          >
            {relatedPanel.title}
            {index < Math.min(items.length, limit) - 1 ? <span style={{ color: 'var(--muted)' }}> · </span> : null}
          </button>
        ))}
      </div>
    );
  };

  const openReview = (panel: Panel, anchorId: string | null = null) => {
    openPanelReview(router, {
      href: panel.href,
      anchorId: anchorId ?? panel.sections[0]?.anchorId ?? null,
    });
  };

  const openRefresh = (panel: Panel) => {
    continuePanelLifecycle(router, {
      href: panel.href,
      nextAction: 'refresh',
      latestAnchorId: panel.sections[0]?.anchorId ?? null,
      refreshSource: 'kesi',
    });
  };

  const openPrimaryAction = (panel: Panel) => {
    if (panel.learning.nextAction === 'revisit') return openReview(panel);
    continuePanelLifecycle(router, {
      href: panel.href,
      nextAction: panel.learning.nextAction,
      latestAnchorId: panel.sections[0]?.anchorId ?? null,
      refreshSource: 'kesi',
    });
  };

  const focusPanelInKesi = (panel: Panel) => {
    setFocusDocId(panel.docId);
    syncKesiFocusParam(panel.docId);
  };

  const clearFocus = () => {
    setFocusDocId(null);
    syncKesiFocusParam(null);
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
          <button
            type="button"
            onClick={() => router.push(returnPanel ? `/graph?focus=${encodeURIComponent(returnPanel.docId)}` : '/graph')}
            style={{
              appearance: 'none',
              border: 0,
              background: 'transparent',
              color: 'var(--fg-secondary)',
              fontSize: '0.72rem',
              fontWeight: 700,
              letterSpacing: '0.04em',
              padding: 0,
              cursor: 'pointer',
              marginRight: 10,
            }}
          >
            Relations
          </button>
          {focusPanel && (
            <button
              type="button"
              onClick={clearFocus}
              style={{
                appearance: 'none',
                border: 0,
                background: 'transparent',
                color: 'var(--fg-secondary)',
                fontSize: '0.72rem',
                fontWeight: 700,
                letterSpacing: '0.04em',
                padding: 0,
                cursor: 'pointer',
                marginRight: 10,
              }}
            >
              Clear focus
            </button>
          )}
        </div>

        {returnPanel && (
          <section
            style={{
              padding: '0.1rem 0 1rem',
              marginBottom: 18,
              borderBottom: '0.5px solid var(--mat-border)',
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
                {focusPanel ? 'Focused panel' : 'Return to weave'}
              </span>
              <span aria-hidden style={{ flex: 1, height: 1, background: 'var(--mat-border)' }} />
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
                {(() => {
                  const related = relationPreview.get(returnPanel.docId) ?? { incoming: [], outgoing: [] };
                  if (related.incoming.length === 0 && related.outgoing.length === 0) return null;
                  return (
                    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {renderRelationButtons('Referenced by', related.incoming, 3)}
                      {renderRelationButtons('Points to', related.outgoing, 3)}
                    </div>
                  );
                })()}
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
            style={{
              padding: '0.1rem 0 0.2rem',
              marginBottom: 18,
              borderBottom: '0.5px solid var(--mat-border)',
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
                Return soon
              </span>
              <span aria-hidden style={{ flex: 1, height: 1, background: 'var(--mat-border)' }} />
              <span className="t-caption2" style={{ color: 'var(--tint-orange)', letterSpacing: '0.08em', fontWeight: 700 }}>
                {refreshPanels.length}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {refreshPanels.map((panel, index) => (
                <div
                  key={panel.docId}
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
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => openRefresh(panel)}
                    style={actionStyle(true)}
                  >
                    Return
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {continuePanels.length > 0 && (
          <section
            style={{
              padding: '0.1rem 0 0.2rem',
              marginBottom: 18,
              borderBottom: '0.5px solid var(--mat-border)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span aria-hidden style={{ width: 14, height: 1, background: 'var(--accent)', opacity: 0.55 }} />
              <span
                className="t-caption2"
                style={{
                  color: 'var(--muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  fontWeight: 700,
                }}
              >
                Keep weaving
              </span>
              <span aria-hidden style={{ flex: 1, height: 1, background: 'var(--mat-border)' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {continuePanels.map((panel, index) => (
                <div
                  key={panel.docId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '0.78rem 0',
                    borderBottom: index < continuePanels.length - 1 ? '0.5px solid var(--mat-border)' : 'none',
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
                      <span>{primaryActionLabel(panel.learning.nextAction)}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => openPrimaryAction(panel)}
                    style={actionStyle(true)}
                  >
                    {primaryActionLabel(panel.learning.nextAction)}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '0.25rem 0 0.65rem',
            marginBottom: 16,
            borderBottom: '0.5px solid var(--mat-border)',
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
            label={`Intake · ${filterCounts.upload}`}
          />
          <ToolbarChip
            active={recencyFilter === 'all'}
            onClick={() => setRecencyFilter('all')}
            label={`Any time · ${filterCounts.all}`}
          />
          <ToolbarChip
            active={recencyFilter === 'fresh'}
            onClick={() => setRecencyFilter('fresh')}
            label={`Near · ${filterCounts.fresh}`}
          />
          <ToolbarChip
            active={recencyFilter === 'cooling'}
            onClick={() => setRecencyFilter('cooling')}
            label={`Holding · ${filterCounts.cooling}`}
          />
          <ToolbarChip
            active={recencyFilter === 'stale'}
            onClick={() => setRecencyFilter('stale')}
            label={`Far · ${filterCounts.stale}`}
          />
        </div>

        {sortedPanels.length === 0 && (
          <div
            style={{
              padding: '0.8rem 0',
              color: 'var(--muted)',
              fontStyle: 'italic',
              borderBottom: '0.5px solid var(--mat-border)',
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
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {group.items.map((panel) => (
                  <div
                    key={panel.docId}
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
                        void Promise.all(
                          panel.traceIds.map((traceId) =>
                            removeEvents(traceId, (ev) => ev.kind === 'crystallize'),
                          ),
                        );
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
                      {panel.collectionLabel && panel.collectionLabel !== panel.family && (
                        <>
                          <span aria-hidden>·</span>
                          <span>{panel.collectionLabel}</span>
                        </>
                      )}
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
                    {(() => {
                      const related = relationPreview.get(panel.docId) ?? { incoming: [], outgoing: [] };
                      if (related.incoming.length === 0 && related.outgoing.length === 0) return null;
                      return (
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 6,
                            marginBottom: panel.sections.length > 0 ? 12 : 8,
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {renderRelationButtons('Referenced by', related.incoming, 2)}
                          {renderRelationButtons('Points to', related.outgoing, 2)}
                        </div>
                      );
                    })()}

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: panel.sections.length > 0 ? 12 : 0 }}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          focusPanelInKesi(panel);
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
        style={{
          padding: '0.1rem 0 1rem',
          marginBottom: 18,
          borderBottom: '0.5px solid var(--mat-border)',
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
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0.25rem 0 0.65rem',
          marginBottom: 18,
          color: 'var(--muted)',
          borderBottom: '0.5px solid var(--mat-border)',
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
        padding: '0.3rem 0.1rem',
        borderRadius: 999,
        border: 0,
        borderBottom: `1px solid ${active ? 'var(--accent)' : 'transparent'}`,
        background: 'transparent',
        color: active ? 'var(--fg)' : 'var(--muted)',
        fontSize: '0.78rem',
        fontWeight: active ? 650 : 500,
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
      return 'Return';
    case 'rehearse':
      return 'Write';
    case 'examine':
      return 'Ask';
    case 'capture':
      return 'Open';
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
