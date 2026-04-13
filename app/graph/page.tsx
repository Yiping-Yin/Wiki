'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { summarizeLearningSurface } from '../../lib/learning-status';
import { useAllTraces, type Trace } from '../../lib/trace';
import 'reactflow/dist/style.css';

const ReactFlow = dynamic(() => import('reactflow').then((m) => m.default), { ssr: false });
const Background = dynamic(() => import('reactflow').then((m) => m.Background), { ssr: false });

type PanelNode = {
  docId: string;
  href: string;
  title: string;
  family: string;
  summary: string;
  crystallizedAt: number;
  learning: ReturnType<typeof summarizeLearningSurface>;
};

type RelatedPanel = {
  panel: PanelNode;
  weight: number;
  snippet: string;
};

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

function familyForHref(href: string): string {
  if (href.startsWith('/wiki/')) return 'LLM Reference';
  const know = href.match(/^\/knowledge\/([^/]+)/);
  if (know) return know[1];
  if (href.startsWith('/uploads/')) return 'Uploads';
  return 'Other';
}

function latestPanelSummary(traces: Trace[]) {
  let latestSummary = '';
  let latestAt = 0;
  for (const trace of traces) {
    for (const event of trace.events) {
      if (event.kind !== 'thought-anchor') continue;
      if (event.at >= latestAt) {
        latestAt = event.at;
        latestSummary = event.summary || event.content;
      }
    }
  }
  return latestSummary;
}

function relationSnippet(summary: string, content: string) {
  const base = summary.trim() || content.trim();
  if (!base) return '';
  const single = base.replace(/\s+/g, ' ').trim();
  return single.length > 96 ? `${single.slice(0, 96)}…` : single;
}

function buildPanels(traces: Trace[]) {
  const tracesByDocId = new Map<string, Trace[]>();
  for (const trace of traces) {
    if (trace.kind !== 'reading' || trace.parentId || !trace.source?.docId) continue;
    const existing = tracesByDocId.get(trace.source.docId) ?? [];
    existing.push(trace);
    tracesByDocId.set(trace.source.docId, existing);
  }

  const panels: PanelNode[] = [];
  for (const [docId, traceSet] of tracesByDocId) {
    const representative = [...traceSet].sort(
      (a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt,
    )[0];
    if (!representative?.source?.href) continue;

    let crystallizedAt = 0;
    for (const trace of traceSet) {
      for (const event of trace.events) {
        if (event.kind === 'crystallize' && !event.anchorId && event.at > crystallizedAt) {
          crystallizedAt = event.at;
        }
      }
    }
    if (!crystallizedAt) continue;

    panels.push({
      docId,
      href: representative.source.href,
      title: representative.source.sourceTitle ?? representative.title,
      family: familyForHref(representative.source.href),
      summary: latestPanelSummary(traceSet),
      crystallizedAt,
      learning: summarizeLearningSurface(traceSet, 0),
    });
  }

  panels.sort((a, b) => b.crystallizedAt - a.crystallizedAt);
  return { panels, tracesByDocId };
}

function syncFocusParam(docId: string | null) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (docId) url.searchParams.set('focus', docId);
  else url.searchParams.delete('focus');
  window.history.replaceState({}, '', url.toString());
}

export default function GraphPage() {
  const router = useRouter();
  const { traces } = useAllTraces();
  const [focusDocId, setFocusDocId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [familyFilter, setFamilyFilter] = useState<string>('all');
  const [scopeFilter, setScopeFilter] = useState<'all' | 'nearby' | 'incoming' | 'outgoing'>('all');

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      setFocusDocId(params.get('focus'));
    } catch {
      setFocusDocId(null);
    }
  }, []);

  const { nodes, edges, panelCount, relationCount, panels, relationPreview } = useMemo(() => {
    const { panels, tracesByDocId } = buildPanels(traces);
    const panelByDocId = new Map(panels.map((panel) => [panel.docId, panel] as const));
    const panelByHref = new Map(panels.map((panel) => [panel.href, panel] as const));

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

    const edgeWeights = new Map<string, number>();
    const previewMap = new Map<string, { incoming: Map<string, RelatedPanel>; outgoing: Map<string, RelatedPanel> }>();
    const flowEdges: Array<{
      id: string;
      source: string;
      target: string;
      animated: boolean;
      style: { stroke: string; strokeWidth: number };
    }> = [];

    for (const panel of panels) {
      previewMap.set(panel.docId, { incoming: new Map(), outgoing: new Map() });
      const traceSet = tracesByDocId.get(panel.docId) ?? [];
      const latestByAnchor = new Map<string, { content: string; summary: string; at: number }>();
      for (const trace of traceSet) {
        for (const event of trace.events) {
          if (event.kind !== 'thought-anchor') continue;
          const prev = latestByAnchor.get(event.anchorId);
          if (!prev || event.at > prev.at) {
            latestByAnchor.set(event.anchorId, {
              content: event.content,
              summary: event.summary,
              at: event.at,
            });
          }
        }
      }
      for (const { content, summary } of latestByAnchor.values()) {
        for (const url of extractMarkdownLinkUrls(content)) {
          const targetPanel =
            Array.from(panelByHref.values()).find((candidate) => urlReferencesDoc(url, candidate.href)) ??
            Array.from(panelByDocId.values()).find((candidate) => urlReferencesDoc(url, candidate.href));
          if (!targetPanel || targetPanel.docId === panel.docId) continue;
          const key = `${panel.docId}=>${targetPanel.docId}`;
          edgeWeights.set(key, (edgeWeights.get(key) ?? 0) + 1);

          const sourcePreview = previewMap.get(panel.docId) ?? { incoming: new Map(), outgoing: new Map() };
          const targetPreview = previewMap.get(targetPanel.docId) ?? { incoming: new Map(), outgoing: new Map() };
          sourcePreview.outgoing.set(targetPanel.docId, {
            panel: targetPanel,
            weight: edgeWeights.get(key) ?? 1,
            snippet: relationSnippet(summary, content),
          });
          targetPreview.incoming.set(panel.docId, {
            panel,
            weight: edgeWeights.get(key) ?? 1,
            snippet: relationSnippet(summary, content),
          });
          previewMap.set(panel.docId, sourcePreview);
          previewMap.set(targetPanel.docId, targetPreview);
        }
      }
    }

    for (const [key, weight] of edgeWeights) {
      const [source, target] = key.split('=>');
      flowEdges.push({
        id: key,
        source,
        target,
        animated: false,
        style: { stroke: 'var(--accent)', strokeWidth: 0.9 + Math.min(weight, 4) * 0.3 },
      });
    }

    const orderedPreview = new Map<string, { incoming: RelatedPanel[]; outgoing: RelatedPanel[] }>();
    for (const [docId, value] of previewMap) {
      const sortByWeight = (items: Iterable<RelatedPanel>) =>
        Array.from(items).sort((a, b) => b.weight - a.weight || a.panel.title.localeCompare(b.panel.title));
      orderedPreview.set(docId, {
        incoming: sortByWeight(value.incoming.values()),
        outgoing: sortByWeight(value.outgoing.values()),
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
  }, [traces, focusDocId]);

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

  const focusPanelNode = (panel: PanelNode) => {
    setFocusDocId(panel.docId);
    syncFocusParam(panel.docId);
  };

  if (panelCount === 0) return null;

  return (
    <div style={{ width: '100%', height: '100vh', background: 'var(--bg)' }}>
      <div style={{ padding: '1rem 1.5rem 0.9rem', borderBottom: '0.5px solid var(--mat-border)' }}>
        <div
          className="t-caption2"
          style={{ color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, marginBottom: 6 }}
        >
          Kesi relations
        </div>
        <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 650, letterSpacing: '-0.02em' }}>
          Panels and the threads between them
        </h1>
        <div style={{ fontSize: '0.84rem', color: 'var(--muted)', marginTop: 4 }}>
          {panelCount} woven panels · {relationCount} cross-document references
        </div>
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
          <span
            aria-hidden
            style={{ color: 'var(--muted)', fontSize: '0.8rem', lineHeight: 1 }}
          >
            Graph
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
          <span
            className="t-caption2"
            style={{
              color: 'var(--muted)',
              fontFamily: 'var(--mono)',
              fontVariantNumeric: 'tabular-nums',
              flexShrink: 0,
            }}
          >
            {visibleNodes.length}
          </span>
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
              ['nearby', `Nearby · ${scopeCounts.nearby}`],
              ['incoming', `Incoming · ${scopeCounts.incoming}`],
              ['outgoing', `Outgoing · ${scopeCounts.outgoing}`],
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
              Focused panel
            </div>
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
                      <div
                        className="t-caption2"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          flexWrap: 'wrap',
                          color: 'var(--muted)',
                          letterSpacing: '0.04em',
                        }}
                      >
                        <span>Referenced by</span>
                        {focusRelated.incoming.slice(0, 4).map((related, index) => (
                          <button
                            key={`in-${related.panel.docId}`}
                            type="button"
                            onClick={() => focusPanelNode(related.panel)}
                            style={focusLinkStyle}
                          >
                            <span>{related.panel.title}</span>
                            <span style={{ color: 'var(--muted)' }}> ×{related.weight}</span>
                            {related.snippet ? (
                              <span style={{ color: 'var(--muted)' }}> — {related.snippet}</span>
                            ) : null}
                            {index < Math.min(focusRelated.incoming.length, 4) - 1 ? <span style={{ color: 'var(--muted)' }}> · </span> : null}
                          </button>
                        ))}
                      </div>
                    )}
                    {focusRelated.outgoing.length > 0 && (
                      <div
                        className="t-caption2"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          flexWrap: 'wrap',
                          color: 'var(--muted)',
                          letterSpacing: '0.04em',
                        }}
                      >
                        <span>Points to</span>
                        {focusRelated.outgoing.slice(0, 4).map((related, index) => (
                          <button
                            key={`out-${related.panel.docId}`}
                            type="button"
                            onClick={() => focusPanelNode(related.panel)}
                            style={focusLinkStyle}
                          >
                            <span>{related.panel.title}</span>
                            <span style={{ color: 'var(--muted)' }}> ×{related.weight}</span>
                            {related.snippet ? (
                              <span style={{ color: 'var(--muted)' }}> — {related.snippet}</span>
                            ) : null}
                            {index < Math.min(focusRelated.outgoing.length, 4) - 1 ? <span style={{ color: 'var(--muted)' }}> · </span> : null}
                          </button>
                        ))}
                      </div>
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
                <button type="button" onClick={() => router.push(`/kesi?focus=${encodeURIComponent(focusPanel.docId)}`)} style={focusLinkStyle}>
                  Open this panel in Kesi
                </button>
              </div>
            </div>
          </div>
        )}
        <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 6 }}>
          Click any panel to inspect its relations.
        </div>
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
