'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LearningNextAction } from '../../lib/learning-status';
import { continuePanelLifecycle, openPanelReview } from '../../lib/panel-resume';
import { useAllPanels, type Panel as StoredPanel } from '../../lib/panel';
import { buildWeavePreview, setWeaveStatus, useAllWeaves } from '../../lib/weave';
import 'reactflow/dist/style.css';

const ReactFlow = dynamic(() => import('reactflow').then((m) => m.default), { ssr: false });
const Background = dynamic(() => import('reactflow').then((m) => m.Background), { ssr: false });

type PanelNode = StoredPanel & {
  family: string;
};

type RelatedPanel = {
  id: string;
  panel: PanelNode;
  weight: number;
  evidence: Array<{ anchorId?: string; snippet: string; at: number }>;
  status: 'suggested' | 'confirmed' | 'rejected';
};

type DirectedRelatedPanel = RelatedPanel & {
  direction: 'incoming' | 'outgoing';
};

function primaryActionLabel(nextAction: LearningNextAction) {
  if (nextAction === 'refresh') return 'Refresh';
  if (nextAction === 'rehearse') return 'Rehearsal';
  if (nextAction === 'examine') return 'Examiner';
  return 'Review';
}

function familyForHref(href: string): string {
  if (href.startsWith('/wiki/')) return 'LLM Reference';
  const know = href.match(/^\/knowledge\/([^/]+)/);
  if (know) return know[1];
  if (href.startsWith('/uploads/')) return 'Uploads';
  return 'Other';
}

type ScopeFilter = 'all' | 'nearby' | 'incoming' | 'outgoing';

function syncGraphParams({
  docId,
  query,
  family,
  scope,
}: {
  docId: string | null;
  query: string;
  family: string;
  scope: ScopeFilter;
}) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (docId) url.searchParams.set('focus', docId);
  else url.searchParams.delete('focus');
  if (query.trim()) url.searchParams.set('q', query.trim());
  else url.searchParams.delete('q');
  if (family !== 'all') url.searchParams.set('family', family);
  else url.searchParams.delete('family');
  if (scope !== 'all') url.searchParams.set('scope', scope);
  else url.searchParams.delete('scope');
  window.history.replaceState({}, '', url.toString());
}

export default function GraphPage() {
  const router = useRouter();
  const { panels: storedPanels, loading } = useAllPanels();
  const { weaves, loading: weavesLoading } = useAllWeaves();
  const [focusDocId, setFocusDocId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [familyFilter, setFamilyFilter] = useState<string>('all');
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      setFocusDocId(params.get('focus'));
      setQuery(params.get('q') ?? '');
      setFamilyFilter(params.get('family') ?? 'all');
      const requestedScope = params.get('scope');
      setScopeFilter(
        requestedScope === 'nearby' || requestedScope === 'incoming' || requestedScope === 'outgoing'
          ? requestedScope
          : params.get('focus')
            ? 'nearby'
            : 'all',
      );
    } catch {
      setFocusDocId(null);
      setQuery('');
      setFamilyFilter('all');
      setScopeFilter('all');
    }
  }, []);

  const { nodes, edges, panelCount, relationCount, panels, relationPreview } = useMemo(() => {
    const basePanels = storedPanels.filter((panel) => panel.status !== 'provisional' && panel.status !== 'superseded');
    const panels = basePanels.map((panel) => ({
      ...panel,
      family: familyForHref(panel.href),
    }));
    const panelByDocId = new Map(panels.map((panel) => [panel.docId, panel] as const));

    const grouped = new Map<string, PanelNode[]>();
    for (const panel of panels) {
      const existing = grouped.get(panel.family) ?? [];
      existing.push(panel);
      grouped.set(panel.family, existing);
    }

    const families = Array.from(grouped.keys()).sort();
    const flowNodes = families.flatMap((family, familyIndex) => {
      const items = grouped.get(family) ?? [];
      return items.map((panel, index) => ({
        id: panel.docId,
        data: {
          label: panel.title,
          family,
          summary: panel.summary,
          next: panel.learning.nextAction,
        },
        position: {
          x: familyIndex * 330,
          y: index * 150,
        },
        style: {
          width: 250,
          padding: 14,
          border: panel.docId === focusDocId
            ? '0.5px solid color-mix(in srgb, var(--accent) 38%, var(--mat-border))'
            : '0.5px solid var(--mat-border)',
          borderRadius: 14,
          background: panel.docId === focusDocId
            ? 'color-mix(in srgb, var(--accent) 8%, var(--bg-elevated))'
            : 'color-mix(in srgb, var(--bg-elevated) 92%, white)',
          color: 'var(--fg)',
          boxShadow: panel.docId === focusDocId ? 'var(--shadow-2)' : 'var(--shadow-1)',
        },
      }));
    });

    const flowEdges: Array<{
      id: string;
      source: string;
      target: string;
      animated: boolean;
      style: { stroke: string; strokeWidth: number };
    }> = [];
    const preview = buildWeavePreview(panels, weaves);
    const orderedPreview = new Map(
      Array.from(preview.entries()).map(([docId, value]) => [
        docId,
        {
          incoming: value.incoming.map((item) => ({
            id: item.id,
            panel: item.panel,
            weight: item.weight,
            evidence: item.evidence,
            status: item.status,
          })),
          outgoing: value.outgoing.map((item) => ({
            id: item.id,
            panel: item.panel,
            weight: item.weight,
            evidence: item.evidence,
            status: item.status,
          })),
        },
      ]),
    );
    for (const weave of weaves) {
      if (weave.status === 'rejected') continue;
      if (!panelByDocId.has(weave.fromPanelId) || !panelByDocId.has(weave.toPanelId)) continue;
      flowEdges.push({
        id: weave.id,
        source: weave.fromPanelId,
        target: weave.toPanelId,
        animated: false,
        style: { stroke: 'var(--accent)', strokeWidth: 0.9 + Math.min(weave.evidence.length || 1, 4) * 0.3 },
      });
    }

    return {
      nodes: flowNodes,
      edges: flowEdges,
      panelCount: panels.length,
      relationCount: flowEdges.length,
      panels,
      relationPreview: orderedPreview,
    };
  }, [storedPanels, focusDocId, weaves]);

  const panelByDocId = useMemo(
    () => new Map(panels.map((panel) => [panel.docId, panel] as const)),
    [panels],
  );
  const familyOptions = useMemo(
    () => ['all', ...Array.from(new Set(panels.map((panel) => panel.family))).sort()],
    [panels],
  );
  const focusPanel = focusDocId ? panelByDocId.get(focusDocId) ?? null : null;
  const focusRelated = focusPanel
    ? relationPreview.get(focusPanel.docId) ?? { incoming: [], outgoing: [] }
    : { incoming: [], outgoing: [] };
  const scopeCounts = {
    nearby: focusRelated.incoming.length + focusRelated.outgoing.length,
    incoming: focusRelated.incoming.length,
    outgoing: focusRelated.outgoing.length,
  };
  const focusInsights = useMemo(() => {
    if (!focusPanel) return null;
    const nearby: DirectedRelatedPanel[] = [
      ...focusRelated.incoming.map((item) => ({ ...item, direction: 'incoming' as const })),
      ...focusRelated.outgoing.map((item) => ({ ...item, direction: 'outgoing' as const })),
    ];
    if (nearby.length === 0) return null;
    const sameFamilyCount = nearby.filter((item) => item.panel.family === focusPanel.family).length;
    const strongest = [...nearby].sort(
      (a, b) => b.weight - a.weight || a.panel.title.localeCompare(b.panel.title),
    )[0];
    return {
      nearbyCount: nearby.length,
      sameFamilyCount,
      strongest,
    };
  }, [focusPanel, focusRelated.incoming, focusRelated.outgoing]);

  const visibleDocIds = useMemo(() => {
    const q = query.trim().toLowerCase();
    const ids = new Set<string>();
    const matchesBaseFilters = (panel: PanelNode) => {
      const matchesFamily = familyFilter === 'all' || panel.family === familyFilter;
      const matchesQuery = !q
        || panel.title.toLowerCase().includes(q)
        || panel.summary.toLowerCase().includes(q)
        || panel.family.toLowerCase().includes(q);
      return matchesFamily && matchesQuery;
    };

    if (scopeFilter === 'all' || !focusPanel) {
      for (const panel of panels) {
        if (matchesBaseFilters(panel)) ids.add(panel.docId);
      }
    } else {
      ids.add(focusPanel.docId);
      const related =
        scopeFilter === 'incoming'
          ? focusRelated.incoming
          : scopeFilter === 'outgoing'
            ? focusRelated.outgoing
            : [...focusRelated.incoming, ...focusRelated.outgoing];
      for (const item of related) {
        if (matchesBaseFilters(item.panel)) ids.add(item.panel.docId);
      }
    }

    if (focusPanel) ids.add(focusPanel.docId);
    return ids;
  }, [familyFilter, focusPanel, focusRelated.incoming, focusRelated.outgoing, panels, query, scopeFilter]);

  const visibleNodes = useMemo(
    () => nodes.filter((node) => visibleDocIds.has(node.id)),
    [nodes, visibleDocIds],
  );
  const visibleEdges = useMemo(
    () => edges.filter((edge) => visibleDocIds.has(edge.source) && visibleDocIds.has(edge.target)),
    [edges, visibleDocIds],
  );

  useEffect(() => {
    syncGraphParams({
      docId: focusDocId,
      query,
      family: familyFilter,
      scope: scopeFilter,
    });
  }, [familyFilter, focusDocId, query, scopeFilter]);

  const focusPanelNode = (panel: PanelNode) => {
    setFocusDocId(panel.docId);
    setScopeFilter((prev) => (prev === 'all' ? 'nearby' : prev));
  };

  const markWeave = async (id: string, status: 'confirmed' | 'rejected') => {
    await setWeaveStatus(id, status);
  };

  const clearFocus = () => {
    setFocusDocId(null);
    setScopeFilter('all');
  };

  const copyView = async () => {
    if (typeof window === 'undefined' || !navigator.clipboard) return;
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  const openReview = (panel: PanelNode, anchorId?: string | null) => {
    openPanelReview(router, {
      href: panel.href,
      anchorId: anchorId ?? panel.latestAnchorId,
    });
  };

  const openRefresh = (panel: PanelNode) => {
    continuePanelLifecycle(router, {
      href: panel.href,
      nextAction: 'refresh',
      latestAnchorId: panel.latestAnchorId,
      refreshSource: 'graph',
    });
  };

  const openPrimaryAction = (panel: PanelNode) => {
    if (panel.learning.nextAction === 'revisit') return openReview(panel);
    continuePanelLifecycle(router, {
      href: panel.href,
      nextAction: panel.learning.nextAction,
      latestAnchorId: panel.latestAnchorId,
      refreshSource: 'graph',
    });
  };

  const openRelationEvidence = (
    direction: 'incoming' | 'outgoing',
    related: RelatedPanel,
  ) => {
    const evidenceAnchorId = related.evidence[0]?.anchorId ?? null;
    if (!evidenceAnchorId) {
      return openReview(direction === 'incoming' ? related.panel : (focusPanel ?? related.panel));
    }
    if (direction === 'incoming') {
      return openReview(related.panel, evidenceAnchorId);
    }
    if (focusPanel) {
      return openReview(focusPanel, evidenceAnchorId);
    }
    return openReview(related.panel, evidenceAnchorId);
  };

  if (loading || weavesLoading || panelCount === 0) return null;

  return (
    <div style={{ width: '100%', height: '100vh', background: 'var(--bg)' }}>
      <div style={{ padding: '1rem 1.5rem 0.9rem', borderBottom: '0.5px solid var(--mat-border)' }}>
        <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 650, letterSpacing: '-0.02em' }}>
          Relations
        </h1>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '0.25rem 0 0.65rem',
            marginTop: 14,
            borderTop: '0.5px solid var(--mat-border)',
          }}
        >
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
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
          {familyOptions.map((family) => {
            const active = familyFilter === family;
            return (
              <button
                key={family}
                type="button"
                onClick={() => setFamilyFilter(family)}
                style={{
                  appearance: 'none',
                  border: 0,
                  borderBottom: `0.5px solid ${active ? 'var(--accent)' : 'var(--mat-border)'}`,
                  background: 'transparent',
                  color: active ? 'var(--accent)' : 'var(--fg-secondary)',
                  padding: '0.28rem 0',
                  fontSize: '0.76rem',
                  fontWeight: active ? 700 : 600,
                  letterSpacing: '0.02em',
                  cursor: 'pointer',
                }}
              >
                {family === 'all' ? 'All' : family}
              </button>
            );
          })}
        </div>
        {focusPanel && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
            {([
              ['all', 'All'],
              ['nearby', 'Nearby'],
              ['incoming', 'Incoming'],
              ['outgoing', 'Outgoing'],
            ] as const).map(([value, label]) => {
              const active = scopeFilter === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setScopeFilter(value)}
                  style={{
                    appearance: 'none',
                    border: 0,
                    borderBottom: `0.5px solid ${active ? 'var(--accent)' : 'var(--mat-border)'}`,
                    background: 'transparent',
                    color: active ? 'var(--accent)' : 'var(--fg-secondary)',
                    padding: '0.28rem 0',
                    fontSize: '0.76rem',
                    fontWeight: active ? 700 : 600,
                    letterSpacing: '0.02em',
                    cursor: 'pointer',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}
        {focusPanel && (
          <div
            style={{
              marginTop: 10,
              paddingTop: 10,
              borderTop: '0.5px solid var(--mat-border)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 260 }}>
                <div
                  style={{
                    fontFamily: 'var(--display)',
                    fontSize: '1rem',
                    fontWeight: 600,
                    letterSpacing: '-0.016em',
                    lineHeight: 1.35,
                    marginBottom: 6,
                  }}
                >
                  {focusPanel.title}
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
                  <span>{focusPanel.family}</span>
                  <span aria-hidden>·</span>
                  <span>{new Date(focusPanel.crystallizedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                </div>
                <div
                  style={{
                    color: 'var(--fg-secondary)',
                    fontSize: '0.84rem',
                    lineHeight: 1.5,
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                  }}
                >
                  {focusPanel.summary || 'This panel is woven, and its threads are visible here.'}
                </div>
                {(focusRelated.incoming.length > 0 || focusRelated.outgoing.length > 0) && (
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {focusRelated.incoming.length > 0 && (
                      <RelatedList
                        label="Referenced by"
                        direction="incoming"
                        items={focusRelated.incoming}
                        onSelect={focusPanelNode}
                        onOpenEvidence={openRelationEvidence}
                        onConfirm={markWeave}
                        onReject={markWeave}
                      />
                    )}
                    {focusRelated.outgoing.length > 0 && (
                      <RelatedList
                        label="Points to"
                        direction="outgoing"
                        items={focusRelated.outgoing}
                        onSelect={focusPanelNode}
                        onOpenEvidence={openRelationEvidence}
                        onConfirm={markWeave}
                        onReject={markWeave}
                      />
                    )}
                  </div>
                )}
              </div>
              <div
                className="t-caption2"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  flexWrap: 'wrap',
                  marginTop: 2,
                }}
              >
                <button type="button" onClick={() => router.push(focusPanel.href)} style={focusLinkStyle}>
                  Open this source
                </button>
                <button type="button" onClick={() => openPrimaryAction(focusPanel)} style={focusLinkStyle}>
                  {primaryActionLabel(focusPanel.learning.nextAction)}
                </button>
                <button type="button" onClick={clearFocus} style={focusLinkStyle}>
                  Clear focus
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      <div style={{ height: 'calc(100vh - 84px)' }}>
        <ReactFlow
          nodes={visibleNodes}
          edges={visibleEdges}
          fitView
          minZoom={0.35}
          maxZoom={1.4}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          proOptions={{ hideAttribution: true }}
          onNodeClick={(_, node) => {
            const panel = panelByDocId.get(node.id);
            if (panel) focusPanelNode(panel);
          }}
          onPaneClick={clearFocus}
        >
          <Background color="var(--mat-border)" gap={24} size={0.8} />
        </ReactFlow>
      </div>
    </div>
  );
}

const focusLinkStyle = {
  appearance: 'none' as const,
  border: 0,
  background: 'transparent',
  color: 'var(--accent)',
  fontSize: '0.72rem',
  fontWeight: 700,
  letterSpacing: '0.02em',
  padding: 0,
  cursor: 'pointer',
};

function RelatedList({
  label,
  direction,
  items,
  onSelect,
  onOpenEvidence,
  onConfirm,
  onReject,
}: {
  label: string;
  direction: 'incoming' | 'outgoing';
  items: RelatedPanel[];
  onSelect: (panel: PanelNode) => void;
  onOpenEvidence: (direction: 'incoming' | 'outgoing', related: RelatedPanel) => void;
  onConfirm: (id: string, status: 'confirmed' | 'rejected') => Promise<void>;
  onReject: (id: string, status: 'confirmed' | 'rejected') => Promise<void>;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div
        className="t-caption2"
        style={{
          color: 'var(--muted)',
          letterSpacing: '0.04em',
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.slice(0, 5).map((related) => (
          <div
            key={`${label}-${related.panel.docId}`}
            style={{
              padding: '0.38rem 0',
              borderTop: '0.5px solid var(--mat-border)',
            }}
          >
            <button
              type="button"
              onClick={() => onSelect(related.panel)}
              style={{
                appearance: 'none',
                border: 0,
                padding: 0,
                background: 'transparent',
                textAlign: 'left',
                cursor: 'pointer',
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 8,
                  flexWrap: 'wrap',
                  fontSize: '0.78rem',
                  lineHeight: 1.35,
                }}
              >
                <span style={{ color: 'var(--accent)', fontWeight: 700 }}>
                  {related.panel.title}
                </span>
              </div>
              {related.evidence[0]?.snippet ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenEvidence(direction, related);
                  }}
                  style={{
                    appearance: 'none',
                    border: 0,
                    padding: 0,
                    background: 'transparent',
                    textAlign: 'left',
                    cursor: 'pointer',
                    color: 'var(--fg-secondary)',
                    fontSize: '0.76rem',
                    lineHeight: 1.45,
                    marginTop: 2,
                  }}
                >
                  {related.evidence[0].snippet}
                </button>
              ) : null}
            </button>
            <div
              className="t-caption2"
              style={{
                marginTop: 6,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
                color: 'var(--muted)',
              }}
              onClick={(event) => event.stopPropagation()}
            >
              {related.status === 'suggested' ? (
                <>
                  <button type="button" onClick={() => void onConfirm(related.id, 'confirmed')} style={focusLinkStyle}>
                    Confirm
                  </button>
                  <button type="button" onClick={() => void onReject(related.id, 'rejected')} style={focusLinkStyle}>
                    Reject
                  </button>
                </>
              ) : (
                <span>{related.status === 'confirmed' ? 'Confirmed' : 'Rejected'}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
