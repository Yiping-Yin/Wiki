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

    const seenEdges = new Set<string>();
    const previewMap = new Map<string, { incoming: PanelNode[]; outgoing: PanelNode[] }>();
    const flowEdges: Array<{
      id: string;
      source: string;
      target: string;
      animated: boolean;
      style: { stroke: string; strokeWidth: number };
    }> = [];

    for (const panel of panels) {
      previewMap.set(panel.docId, { incoming: [], outgoing: [] });
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
          const targetPanel =
            Array.from(panelByHref.values()).find((candidate) => urlReferencesDoc(url, candidate.href)) ??
            Array.from(panelByDocId.values()).find((candidate) => urlReferencesDoc(url, candidate.href));
          if (!targetPanel || targetPanel.docId === panel.docId) continue;
          const key = `${panel.docId}=>${targetPanel.docId}`;
          if (seenEdges.has(key)) continue;
          seenEdges.add(key);
          const sourcePreview = previewMap.get(panel.docId) ?? { incoming: [], outgoing: [] };
          const targetPreview = previewMap.get(targetPanel.docId) ?? { incoming: [], outgoing: [] };
          previewMap.set(panel.docId, {
            ...sourcePreview,
            outgoing: [...sourcePreview.outgoing, targetPanel],
          });
          previewMap.set(targetPanel.docId, {
            ...targetPreview,
            incoming: [...targetPreview.incoming, panel],
          });
          flowEdges.push({
            id: key,
            source: panel.docId,
            target: targetPanel.docId,
            animated: false,
            style: { stroke: 'var(--accent)', strokeWidth: 1.15 },
          });
        }
      }
    }

    return {
      nodes: flowNodes,
      edges: flowEdges,
      panelCount: panels.length,
      relationCount: flowEdges.length,
      panels,
      relationPreview: previewMap,
    };
  }, [traces, focusDocId]);

  const panelByDocId = useMemo(
    () => new Map(panels.map((panel) => [panel.docId, panel] as const)),
    [panels],
  );
  const focusPanel = focusDocId ? panelByDocId.get(focusDocId) ?? null : null;
  const focusRelated = focusPanel
    ? relationPreview.get(focusPanel.docId) ?? { incoming: [], outgoing: [] }
    : { incoming: [], outgoing: [] };

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
                        {focusRelated.incoming.slice(0, 4).map((panel, index) => (
                          <button
                            key={`in-${panel.docId}`}
                            type="button"
                            onClick={() => focusPanelNode(panel)}
                            style={focusLinkStyle}
                          >
                            {panel.title}
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
                        {focusRelated.outgoing.slice(0, 4).map((panel, index) => (
                          <button
                            key={`out-${panel.docId}`}
                            type="button"
                            onClick={() => focusPanelNode(panel)}
                            style={focusLinkStyle}
                          >
                            {panel.title}
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
                  Open source
                </button>
                <button type="button" onClick={() => router.push('/kesi')} style={focusLinkStyle}>
                  Open Kesi
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
          nodes={nodes}
          edges={edges}
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
