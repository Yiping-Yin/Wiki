'use client';
/**
 * PatternsView · the portfolio of crystallized panels.
 *
 * /patterns should show finished pieces of understanding, not abstract swatches.
 * Each crystallized reading trace becomes a readable panel: title, final
 * summary, and the first few woven sections that make up its thought map.
 */
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LearningTargetStateBadge } from './LearningTargetStateBadge';
import { QuietGuideCard } from './QuietGuideCard';
import { QuietScene, QuietSceneColumn } from './QuietScene';
import { QuietSceneIntro } from './QuietSceneIntro';
import { StageShell } from './StageShell';
import { buildPanelLearningTarget } from '../lib/learning-targets';
import type { LearningRecency } from '../lib/learning-status';
import {
  describeLearningTargetState,
  isLearningTargetInWorkQueue,
  learningTargetReturnLabel,
  learningTargetStateRank,
  useLearningTargetState,
} from '../lib/learning-target-state';
import { useAppendEvent } from '../lib/trace';
import { useKnowledgeNav } from '../lib/use-knowledge-nav';
import { useSmallScreen } from '../lib/use-small-screen';
import { continuePanelLifecycle, openPanelReview } from '../lib/panel-resume';
import {
  isRenderablePanel,
  panelDisplaySummary,
  panelFamilyLabel,
  panelRevisionCount,
  panelRevisionLabel,
  panelSourceMeta,
  revisionChanges,
  sortedPanelRevisions,
  useAllPanels,
  type Panel as StoredPanel,
} from '../lib/panel';
import { buildWeavePreview, useAllWeaves, type DirectedWeavePreview, type WeavePreviewItem } from '../lib/weave';
import { BlindRecall } from './unified/BlindRecall';
import { WeaveKindBadge } from './WeaveKindBadge';

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

type Panel = StoredPanel & {
  stitches: number;
  tint: string;
  family: string;
  sourceType: 'knowledge' | 'wiki' | 'upload' | 'other';
  collectionLabel: string;
  collectionHref?: string;
};

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

function syncPatternsFocusParam(docId: string | null) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (docId) url.searchParams.set('focus', docId);
  else url.searchParams.delete('focus');
  window.history.replaceState({}, '', url.toString());
}

type ViewMode = 'recent' | 'dense';
type PatternsLens = 'archive' | 'work';
type SourceFilter = 'all' | 'knowledge' | 'wiki' | 'upload';
type RecencyFilter = 'all' | 'fresh' | 'cooling' | 'stale';

export function PatternsView() {
  const { panels: storedPanels, loading: panelsLoading } = useAllPanels();
  const { weaves, loading: weavesLoading } = useAllWeaves();
  const append = useAppendEvent();
  const targetState = useLearningTargetState();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [focusDocId, setFocusDocId] = useState<string | null>(null);
  const [revisionPanelId, setRevisionPanelId] = useState<string | null>(null);
  const [blindRecallPanel, setBlindRecallPanel] = useState<Panel | null>(null);
  const [query, setQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('recent');
  const [lens, setLens] = useState<PatternsLens>('archive');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [recencyFilter, setRecencyFilter] = useState<RecencyFilter>('all');
  const compactSurface = useSmallScreen(1024);
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

  const panels = useMemo<Panel[]>(() => {
    const basePanels: StoredPanel[] = storedPanels.filter(isRenderablePanel);

    return basePanels.map((panel): Panel => {
      const meta = panelSourceMeta(panel.href, knowledgeCategories);
      return {
        ...panel,
        stitches: panel.sections.length,
        tint: tintFor(panel.docId),
        family: panelFamilyLabel(panel.href, knowledgeCategories),
        summary: panelDisplaySummary(panel.summary, panel.sections),
        ...meta,
      };
    });
  }, [storedPanels, knowledgeCategories]);

  const relationPreview = useMemo(() => {
    return buildWeavePreview(panels, weaves);
  }, [panels, weaves]);

  const visiblePanels = useMemo(() => {
    const q = query.trim();
    return panels.filter((panel) => {
      if (
        lens === 'work'
        && panel.docId !== focusDocId
        && !isLearningTargetInWorkQueue(buildPanelLearningTarget(panel), targetState.state)
      ) return false;
      if (sourceFilter !== 'all' && panel.sourceType !== sourceFilter) return false;
      if (recencyFilter !== 'all' && panel.learning.recency !== recencyFilter) return false;
      if (!q) return true;
      return matchesQuery(panel, q);
    });
  }, [focusDocId, lens, panels, query, sourceFilter, recencyFilter, targetState.state]);

  const sortedPanels = useMemo(() => {
    const next = [...visiblePanels];
    next.sort((a, b) => {
      const lifecycleRank = (panel: Panel) => (panel.status === 'contested' ? 0 : 1);
      const stateRank = (panel: Panel) => learningTargetStateRank(buildPanelLearningTarget(panel), targetState.state);
      if (viewMode === 'dense') {
        return lifecycleRank(a) - lifecycleRank(b)
          || stateRank(a) - stateRank(b)
          || b.stitches - a.stitches
          || recencySort(a.learning.recency) - recencySort(b.learning.recency)
          || b.crystallizedAt - a.crystallizedAt;
      }
      return lifecycleRank(a) - lifecycleRank(b)
        || stateRank(a) - stateRank(b)
        || recencySort(a.learning.recency) - recencySort(b.learning.recency)
        || b.crystallizedAt - a.crystallizedAt
        || b.stitches - a.stitches;
    });
    return next;
  }, [targetState.state, viewMode, visiblePanels]);

  const groupedPanels = useMemo(() => {
    const groups = new Map<string, Panel[]>();
    for (const panel of sortedPanels.filter((item) => item.status === 'settled')) {
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
  const firstContested = sortedPanels.find((panel) => panel.status === 'contested') ?? null;
  const returnPanel = focusPanel ?? firstContested ?? sortedPanels[0] ?? null;
  const contestedPanels = sortedPanels
    .filter((panel) => panel.status === 'contested' && panel.docId !== returnPanel?.docId)
    .slice(0, 4);
  const refreshPanels = sortedPanels
    .filter((panel) => panel.status === 'settled' && panel.learning.nextAction === 'refresh' && panel.docId !== returnPanel?.docId)
    .slice(0, 4);
  const continuePanels = sortedPanels
    .filter((panel) => (
      panel.status === 'settled'
      && panel.docId !== returnPanel?.docId
      && panel.learning.nextAction !== 'refresh'
      && panel.learning.nextAction !== 'capture'
    ))
    .slice(0, 4);
  const secondaryThreads = [
    ...contestedPanels.map((panel) => ({ panel, kind: 'review' as const, label: 'Needs review', cta: 'Review' })),
    ...refreshPanels.map((panel) => ({ panel, kind: 'refresh' as const, label: 'Ready to return', cta: 'Return' })),
    ...continuePanels.map((panel) => ({ panel, kind: 'continue' as const, label: 'Keep warm', cta: primaryActionLabel(panel) })),
  ].slice(0, 6);

  const renderRelationButtons = (
    label: string,
    items: WeavePreviewItem<Panel>[],
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, flex: 1 }}>
          {[...items]
            .sort((a, b) => {
              const aRank = learningTargetStateRank(buildPanelLearningTarget(a.panel), targetState.state);
              const bRank = learningTargetStateRank(buildPanelLearningTarget(b.panel), targetState.state);
              return aRank - bRank || b.weight - a.weight;
            })
            .slice(0, limit)
            .map((relatedPanel) => {
              const panelTarget = buildPanelLearningTarget(relatedPanel.panel);
              const panelState = describeLearningTargetState(panelTarget, targetState.state);
              const panelReturnLabel = learningTargetReturnLabel(panelTarget, targetState.state);
              return (
            <div key={relatedPanel.id} style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, opacity: panelState?.kind && panelState.kind !== 'pinned' ? 0.9 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => focusPanelInPatterns(relatedPanel.panel)}
                  style={{
                    appearance: 'none',
                    border: 0,
                    background: 'transparent',
                    color: relatedPanel.status === 'confirmed' ? 'var(--accent)' : 'var(--fg-secondary)',
                    fontSize: '0.72rem',
                    fontWeight: relatedPanel.status === 'confirmed' ? 700 : 600,
                    letterSpacing: '0.02em',
                    padding: 0,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  {relatedPanel.panel.title}
                  {relatedPanel.status === 'confirmed' ? <span style={{ color: 'var(--muted)' }}> · held</span> : null}
                </button>
                <WeaveKindBadge weaveId={relatedPanel.id} kind={relatedPanel.kind} />
              </div>
              {panelState && <LearningTargetStateBadge label={panelState.label} />}
              {panelReturnLabel && (
                <div className="t-caption2" style={{ color: 'var(--muted)' }}>
                  Returned · {panelReturnLabel}
                </div>
              )}
              {relatedPanel.evidence[0]?.snippet ? (
                <button
                  type="button"
                  onClick={() => openReview(
                    label === 'Referenced by' ? relatedPanel.panel : (focusPanel ?? relatedPanel.panel),
                    relatedPanel.evidence[0]?.anchorId ?? null,
                  )}
                  style={{
                    appearance: 'none',
                    border: 0,
                    background: 'transparent',
                    color: 'var(--fg-secondary)',
                    fontSize: '0.72rem',
                    lineHeight: 1.4,
                    padding: 0,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  {relatedPanel.evidence[0].snippet}
                </button>
              ) : null}
            </div>
          );
        })}
        </div>
      </div>
    );
  };

  const openReview = (panel: Panel, anchorId: string | null = null) => {
    openPanelReview(router, {
      href: panel.href,
      anchorId: anchorId ?? panel.latestAnchorId ?? null,
    });
  };

  const openRefresh = (panel: Panel) => {
    continuePanelLifecycle(router, {
      href: panel.href,
      nextAction: 'refresh',
      latestAnchorId: panel.latestAnchorId ?? null,
      refreshSource: 'patterns',
    });
  };

  const openPrimaryAction = (panel: Panel) => {
    if (panel.status === 'contested') {
      return openReview(panel, panel.latestAnchorId);
    }
    if (panel.learning.nextAction === 'revisit') return openReview(panel);
    continuePanelLifecycle(router, {
      href: panel.href,
      nextAction: panel.learning.nextAction,
      latestAnchorId: panel.latestAnchorId ?? null,
      refreshSource: 'patterns',
    });
  };

  const openSecondaryThread = (
    panel: Panel,
    kind: 'review' | 'refresh' | 'continue',
  ) => {
    if (kind === 'review') {
      openReview(panel, panel.latestAnchorId);
      return;
    }
    if (kind === 'refresh') {
      openRefresh(panel);
      return;
    }
    openPrimaryAction(panel);
  };

  const focusPanelInPatterns = (panel: Panel) => {
    setFocusDocId(panel.docId);
    syncPatternsFocusParam(panel.docId);
  };

  const clearFocus = () => {
    setFocusDocId(null);
    syncPatternsFocusParam(null);
  };

  const toggleRevisionPanel = (docId: string) => {
    setRevisionPanelId((current) => (current === docId ? null : docId));
  };

  const content = !mounted || panelsLoading || weavesLoading
    ? <LoadingPatternsShell />
    : panels.length === 0
      ? <EmptyPatternsCanvas />
      : (
        <>
        {returnPanel && (
          <section
            style={{
              padding: '0.15rem 0 1.1rem',
              marginBottom: 20,
              borderBottom: '0.5px solid var(--mat-border)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: compactSurface ? 14 : 18, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: compactSurface ? 0 : 260 }}>
                <div
                  className="t-caption2"
                  style={{
                    color: 'var(--muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    fontWeight: 700,
                    marginBottom: 8,
                  }}
                >
                  Foreground pattern
                </div>
                <div
                  style={{
                    fontFamily: 'var(--display)',
                    fontSize: compactSurface ? '1.08rem' : '1.18rem',
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
                  {panelRevisionLabel(returnPanel) && (
                    <>
                      <span aria-hidden>·</span>
                      <button
                        type="button"
                        onClick={() => toggleRevisionPanel(returnPanel.docId)}
                        style={inlineMetaActionStyle(revisionPanelId === returnPanel.docId)}
                      >
                        {panelRevisionLabel(returnPanel)} · {panelRevisionCount(returnPanel)}
                      </button>
                    </>
                  )}
                  {returnPanel.collectionLabel && returnPanel.collectionLabel !== returnPanel.family && (
                    <>
                      <span aria-hidden>·</span>
                      <span>{returnPanel.collectionLabel}</span>
                    </>
                  )}
                  {(() => {
                    const target = buildPanelLearningTarget(returnPanel);
                    const state = describeLearningTargetState(target, targetState.state);
                    return state ? <LearningTargetStateBadge label={state.label} /> : null;
                  })()}
                </div>

                <div
                  style={{
                    color: 'var(--fg-secondary)',
                    fontSize: compactSurface ? '0.84rem' : '0.9rem',
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
                  const target = buildPanelLearningTarget(returnPanel);
                  const returnLabel = learningTargetReturnLabel(target, targetState.state);
                  if (!returnLabel) return null;
                  return (
                    <div className="t-caption2" style={{ color: 'var(--muted)', marginTop: 8 }}>
                      Returned · {returnLabel}
                    </div>
                  );
                })()}
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
                {revisionPanelId === returnPanel.docId && returnPanel.revisions.length > 1 && (
                  <PanelRevisionTimeline panel={returnPanel} />
                )}
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  alignItems: compactSurface ? 'stretch' : 'flex-start',
                  width: compactSurface ? '100%' : 'auto',
                }}
              >
                <button
                  type="button"
                  onClick={() => openPrimaryAction(returnPanel)}
                  style={actionStyle(true)}
                >
                  {primaryActionLabel(returnPanel)}
                </button>
                <div
                  className="t-caption2"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    flexWrap: 'wrap',
                    color: 'var(--muted)',
                  }}
                >
                  <button type="button" onClick={() => router.push(returnPanel.href)} style={secondaryLinkStyle}>
                    Source
                  </button>
                  {returnPanel.collectionHref && returnPanel.collectionHref !== returnPanel.href && (
                    <button type="button" onClick={() => router.push(returnPanel.collectionHref!)} style={secondaryLinkStyle}>
                      Collection
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => router.push(`/graph?focus=${encodeURIComponent(returnPanel.docId)}`)}
                    style={secondaryLinkStyle}
                  >
                    Relations
                  </button>
                  <button
                    type="button"
                    onClick={() => setBlindRecallPanel(returnPanel)}
                    style={secondaryLinkStyle}
                    title="Test your memory of this panel"
                  >
                    Self-test
                  </button>
                  {focusPanel && (
                    <button type="button" onClick={clearFocus} style={secondaryLinkStyle}>
                      Clear focus
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {secondaryThreads.length > 0 && (
          <section
            style={{
              padding: '0.1rem 0 0.2rem',
              marginBottom: 18,
              borderBottom: '0.5px solid var(--mat-border)',
            }}
          >
            <div
              className="t-caption2"
              style={{
                color: 'var(--muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                fontWeight: 700,
                marginBottom: 6,
              }}
            >
              Other active threads
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {secondaryThreads.map(({ panel, kind, label, cta }, index) => (
                <div key={panel.docId}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '0.78rem 0',
                      borderBottom: index < contestedPanels.length - 1 ? '0.5px solid var(--mat-border)' : 'none',
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
                        <span>{label}</span>
                        <span aria-hidden>·</span>
                        <span>{panel.family}</span>
                        <span aria-hidden>·</span>
                        <span>{formatWhen(panel.updatedAt || panel.crystallizedAt)}</span>
                        {panelRevisionLabel(panel) && (
                          <>
                            <span aria-hidden>·</span>
                            <button
                              type="button"
                              onClick={() => toggleRevisionPanel(panel.docId)}
                              style={inlineMetaActionStyle(revisionPanelId === panel.docId)}
                            >
                              {panelRevisionLabel(panel)} · {panelRevisionCount(panel)}
                            </button>
                          </>
                        )}
                        {(() => {
                          const target = buildPanelLearningTarget(panel);
                          const state = describeLearningTargetState(target, targetState.state);
                          return state ? <LearningTargetStateBadge label={state.label} /> : null;
                        })()}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => openSecondaryThread(panel, kind)}
                      style={actionStyle(true)}
                    >
                      {cta}
                    </button>
                  </div>
                  {revisionPanelId === panel.docId && panel.revisions.length > 1 && (
                    <PanelRevisionTimeline panel={panel} compact />
                  )}
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
            placeholder="Find a woven pattern…"
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
          <button
            type="button"
            onClick={() => setShowFilters((current) => !current)}
            style={secondaryLinkStyle}
          >
            {showFilters ? 'Hide lenses' : 'Show lenses'}
          </button>
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

        <div
          className="t-caption2"
          style={{
            color: 'var(--muted)',
            marginBottom: showFilters ? 10 : 18,
            letterSpacing: '0.04em',
          }}
        >
          {sortedPanels.length} settled · {sourceFilter === 'all' ? 'all sources' : sourceFilter} · {recencyFilter === 'all' ? 'any time' : recencyFilter}
        </div>

        {showFilters && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
          <ToolbarChip
            active={lens === 'archive'}
            onClick={() => setLens('archive')}
            label="Archive"
          />
          <ToolbarChip
            active={lens === 'work'}
            onClick={() => setLens('work')}
            label="Work queue"
          />
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
            label="All"
          />
          <ToolbarChip
            active={sourceFilter === 'knowledge'}
            onClick={() => setSourceFilter('knowledge')}
            label="Atlas"
          />
          <ToolbarChip
            active={sourceFilter === 'wiki'}
            onClick={() => setSourceFilter('wiki')}
            label="LLM"
          />
          <ToolbarChip
            active={sourceFilter === 'upload'}
            onClick={() => setSourceFilter('upload')}
            label="Intake"
          />
          <ToolbarChip
            active={recencyFilter === 'all'}
            onClick={() => setRecencyFilter('all')}
            label="Any time"
          />
          <ToolbarChip
            active={recencyFilter === 'fresh'}
            onClick={() => setRecencyFilter('fresh')}
            label="Near"
          />
          <ToolbarChip
            active={recencyFilter === 'cooling'}
            onClick={() => setRecencyFilter('cooling')}
            label="Holding"
          />
          <ToolbarChip
            active={recencyFilter === 'stale'}
            onClick={() => setRecencyFilter('stale')}
            label="Far"
          />
        </div>
        )}

        {sortedPanels.length === 0 && (
          <div
            style={{
              padding: '0.8rem 0',
              color: 'var(--muted)',
              fontStyle: 'italic',
              borderBottom: '0.5px solid var(--mat-border)',
            }}
          >
            {lens === 'work'
              ? `No work-queue pattern matches “${query}”.`
              : `No woven pattern matches “${query}”.`}
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
                      borderRadius: 'var(--r-3)',
                      padding: compactSurface ? '1rem 1.05rem' : '1.2rem 1.4rem',
                      borderLeft: `4px solid ${panel.tint}`,
                      borderTop: '0.5px solid var(--mat-border)',
                      borderBottom: '0.5px solid var(--mat-border)',
                      borderRight: '0.5px solid var(--mat-border)',
                      background: 'var(--mat-reg-bg)',
                      backdropFilter: 'var(--mat-blur)',
                      WebkitBackdropFilter: 'var(--mat-blur)',
                      boxShadow: 'var(--shadow-1)',
                      color: 'var(--fg)',
                      cursor: 'pointer',
                      transition: 'transform 0.25s var(--ease-spring), box-shadow 0.25s var(--ease), background 0.2s var(--ease)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = 'var(--shadow-2)';
                      e.currentTarget.style.background = 'var(--mat-thick-bg)';
                      const btn = e.currentTarget.querySelector('[aria-label="Remove from Patterns"]') as HTMLElement | null;
                      if (btn) btn.style.opacity = '0.5';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = 'var(--shadow-1)';
                      e.currentTarget.style.background = 'var(--mat-reg-bg)';
                      const btn = e.currentTarget.querySelector('[aria-label="Remove from Patterns"]') as HTMLElement | null;
                      if (btn) { btn.style.opacity = '0'; btn.style.color = 'var(--muted)'; btn.style.background = 'transparent'; }
                    }}
                    onClick={() => openPrimaryAction(panel)}
                  >

                    {/* Delete button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void Promise.all(
                          panel.traceIds.map((traceId) =>
                            append(traceId, { kind: 'panel-reopen', at: Date.now() }),
                          ),
                        );
                      }}
                      aria-label="Remove from Patterns"
                      title="Remove from Patterns"
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
                          fontSize: compactSurface ? '1rem' : '1.1rem',
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
                      {panelRevisionLabel(panel) && (
                        <>
                          <span aria-hidden>·</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleRevisionPanel(panel.docId);
                            }}
                            style={inlineMetaActionStyle(revisionPanelId === panel.docId)}
                          >
                            {panelRevisionLabel(panel)} · {panelRevisionCount(panel)}
                          </button>
                        </>
                      )}
                      {panel.collectionLabel && panel.collectionLabel !== panel.family && (
                        <>
                          <span aria-hidden>·</span>
                          <span>{panel.collectionLabel}</span>
                        </>
                      )}
                      {(() => {
                        const target = buildPanelLearningTarget(panel);
                        const state = describeLearningTargetState(target, targetState.state);
                        return state ? <LearningTargetStateBadge label={state.label} /> : null;
                      })()}
                    </div>

                    <div
                      style={{
                        color: 'var(--fg-secondary)',
                        fontSize: compactSurface ? '0.82rem' : '0.88rem',
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
                    {revisionPanelId === panel.docId && panel.revisions.length > 1 && (
                      <div onClick={(e) => e.stopPropagation()} style={{ marginBottom: panel.sections.length > 0 ? 12 : 8 }}>
                        <PanelRevisionTimeline panel={panel} compact />
                      </div>
                    )}
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
                          focusPanelInPatterns(panel);
                        }}
                        style={actionStyle(true)}
                      >
                        {primaryActionLabel(panel)}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(panel.href);
                        }}
                        style={secondaryLinkStyle}
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
                          style={secondaryLinkStyle}
                        >
                          Collection
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setBlindRecallPanel(panel);
                        }}
                        style={secondaryLinkStyle}
                        title="Say it from memory — don't look"
                      >
                        Recall
                      </button>
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
                                fontSize: compactSurface ? '0.76rem' : '0.82rem',
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
      <>
        <PatternsShell>
          {content}
        </PatternsShell>
        {blindRecallPanel && (
          <BlindRecall
            panel={blindRecallPanel}
            onClose={() => setBlindRecallPanel(null)}
          />
        )}
      </>
      );
      }



function PatternsShell({ children }: { children: ReactNode }) {
  return (
    <StageShell
      variant="archive"
      contentVariant="archive"
      style={{
        minHeight: 'calc(100vh - 4rem)',
        paddingTop: '2.4rem',
        paddingBottom: '4rem',
      }}
    >
      <QuietScene tone="patterns" style={{ minHeight: 'calc(100vh - 8rem)' }}>
        {children}
      </QuietScene>
    </StageShell>
  );
}

function LoadingPatternsShell() {
  return (
    <PatternsShell>
      <QuietSceneColumn
        style={{
          minHeight: 'calc(100vh - 10rem)',
          justifyContent: 'center',
        }}
      >
        <QuietSceneIntro
          eyebrow="Patterns"
          title="Loading your patterns"
          summary="Patterns is reading the current panel and weave layer. This should load in a moment."
        />
      </QuietSceneColumn>
    </PatternsShell>
  );
}

function LoadingStroke({
  width,
  height = 12,
}: {
  width: number | string;
  height?: number;
}) {
  return (
    <div
      aria-hidden
      style={{
        width,
        height,
        borderRadius: 999,
        background: 'var(--surface-2)',
      }}
    />
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

function inlineMetaActionStyle(active: boolean) {
  return {
    appearance: 'none' as const,
    border: 0,
    background: 'transparent',
    color: active ? 'var(--accent)' : 'var(--fg-secondary)',
    fontSize: '0.71rem',
    fontWeight: 650,
    letterSpacing: '0.03em',
    padding: 0,
    cursor: 'pointer',
  };
}

const secondaryLinkStyle = {
  appearance: 'none' as const,
  border: 0,
  background: 'transparent',
  color: 'var(--fg-secondary)',
  fontSize: '0.71rem',
  fontWeight: 650,
  letterSpacing: '0.03em',
  padding: 0,
  cursor: 'pointer',
};

function actionStyle(primary: boolean) {
  return {
    padding: '0.36rem 0.64rem',
    borderRadius: 999,
    border: `0.5px solid ${primary ? 'color-mix(in srgb, var(--accent) 28%, var(--mat-border))' : 'var(--mat-border)'}`,
    background: primary ? 'color-mix(in srgb, var(--accent-soft) 72%, transparent)' : 'transparent',
    color: primary ? 'var(--fg)' : 'var(--fg-secondary)',
    fontSize: '0.74rem',
    fontWeight: 650,
    letterSpacing: '0.03em',
    cursor: 'pointer',
  } as const;
}

function PanelRevisionTimeline({
  panel,
  compact = false,
}: {
  panel: Panel;
  compact?: boolean;
}) {
  const revisions = sortedPanelRevisions(panel);

  return (
    <div
      style={{
        marginTop: 10,
        paddingTop: 10,
        borderTop: '0.5px solid var(--mat-border)',
        display: 'flex',
        flexDirection: 'column',
        gap: compact ? 8 : 10,
      }}
    >
      <div
        className="t-caption2"
        style={{
          color: 'var(--accent)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          fontWeight: 700,
        }}
      >
        Revision timeline
      </div>
      {revisions.map((revision, index) => {
        const previous = revisions[index + 1] ?? null;
        const changes = revisionChanges(revision, previous);
        return (
          <div
            key={revision.at}
            style={{
              padding: compact ? '0.55rem 0.65rem' : '0.7rem 0.8rem',
              borderRadius: 10,
              border: '0.5px solid var(--mat-border)',
              background: index === 0
                ? 'color-mix(in srgb, var(--accent) 6%, var(--bg-elevated))'
                : 'color-mix(in srgb, var(--bg-elevated) 92%, white)',
            }}
          >
            <div
              className="t-caption2"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
                color: 'var(--muted)',
                letterSpacing: '0.03em',
                marginBottom: 6,
              }}
            >
              <span>{index === 0 ? 'Current' : `Revision ${revisions.length - index}`}</span>
              <span aria-hidden>·</span>
              <span>{formatWhen(revision.at)}</span>
            </div>
            <div
              style={{
                fontFamily: 'var(--display)',
                fontSize: compact ? '0.88rem' : '0.94rem',
                fontWeight: 650,
                letterSpacing: '-0.012em',
                lineHeight: 1.4,
                marginBottom: 6,
              }}
            >
              {revision.summary}
            </div>
            {changes.centralClaimChanged && revision.centralClaim !== revision.summary && (
              <div style={{ color: 'var(--fg-secondary)', fontSize: '0.8rem', lineHeight: 1.5, marginBottom: 6 }}>
                <strong style={{ color: 'var(--fg)' }}>Claim:</strong> {revision.centralClaim}
              </div>
            )}
            <RevisionChangeList label="Added distinctions" items={changes.addedDistinctions} tone="accent" />
            <RevisionChangeList label="Resolved distinctions" items={changes.removedDistinctions} tone="muted" />
            <RevisionChangeList label="Opened tensions" items={changes.addedTensions} tone="warning" />
            <RevisionChangeList label="Closed tensions" items={changes.removedTensions} tone="muted" />
          </div>
        );
      })}
    </div>
  );
}

function RevisionChangeList({
  label,
  items,
  tone,
}: {
  label: string;
  items: string[];
  tone: 'accent' | 'warning' | 'muted';
}) {
  if (items.length === 0) return null;
  const color = tone === 'accent'
    ? 'var(--accent)'
    : tone === 'warning'
      ? 'var(--tint-orange)'
      : 'var(--fg-secondary)';

  return (
    <div style={{ marginTop: 6 }}>
      <div
        className="t-caption2"
        style={{
          color,
          letterSpacing: '0.04em',
          fontWeight: 700,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {items.map((item) => (
          <div key={`${label}:${item}`} style={{ color: 'var(--fg-secondary)', fontSize: '0.78rem', lineHeight: 1.45 }}>
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function primaryActionLabel(panel: Panel) {
  if (panel.status === 'contested') return 'Review';
  const nextAction = panel.learning.nextAction;
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

function recencySort(recency: LearningRecency) {
  return recency === 'stale' ? 0 : recency === 'cooling' ? 1 : 2;
}

function EmptyPatternsCanvas() {
  return (
    <QuietSceneColumn
      style={{
        minHeight: 'calc(100vh - 10rem)',
        justifyContent: 'center',
      }}
    >
      <QuietSceneIntro
        eyebrow="Patterns"
        title="No patterns yet"
        summary="Patterns becomes meaningful after you capture, review, and crystallize a few sources. Start from Atlas, read one source, and crystallize the first pattern."
        actions={[
          { label: 'Open Atlas', onClick: () => window.location.assign('/atlas'), primary: true },
          { label: 'Open Today', onClick: () => window.location.assign('/today') },
        ]}
      />
    </QuietSceneColumn>
  );
}
