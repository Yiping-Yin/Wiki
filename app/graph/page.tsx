'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { summarizeLearningSurface } from '../../lib/learning-status';
import { useAllTraces, type Trace } from '../../lib/trace';
import { REVIEW_RESUME_KEY, type ReviewResumePayload } from '../../lib/review-resume';
import { REFRESH_RESUME_KEY, type RefreshResumePayload } from '../../lib/refresh-resume';
import { OVERLAY_RESUME_KEY, type OverlayResumePayload } from '../../lib/overlay-resume';
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

export default function GraphPage() {
  const router = useRouter();
  const { traces } = useAllTraces();

  const { nodes, edges, panelCount, relationCount, panels } = useMemo(() => {
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
          border: '0.5px solid var(--mat-border)',
          borderRadius: 14,
          background: 'color-mix(in srgb, var(--bg-elevated) 92%, white)',
          color: 'var(--fg)',
          boxShadow: 'var(--shadow-1)',
        },
      }));
    });

    const seenEdges = new Set<string>();
    const flowEdges: Array<{
      id: string;
      source: string;
      target: string;
      animated: boolean;
      style: { stroke: string; strokeWidth: number };
    }> = [];

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
          const targetPanel =
            Array.from(panelByHref.values()).find((candidate) => urlReferencesDoc(url, candidate.href)) ??
            Array.from(panelByDocId.values()).find((candidate) => urlReferencesDoc(url, candidate.href));
          if (!targetPanel || targetPanel.docId === panel.docId) continue;
          const key = `${panel.docId}=>${targetPanel.docId}`;
          if (seenEdges.has(key)) continue;
          seenEdges.add(key);
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
    };
  }, [traces]);

  const panelByDocId = useMemo(
    () => new Map(panels.map((panel) => [panel.docId, panel] as const)),
    [panels],
  );

  const openReview = (panel: PanelNode) => {
    const payload: ReviewResumePayload = { href: panel.href, anchorId: null };
    try {
      sessionStorage.setItem(REVIEW_RESUME_KEY, JSON.stringify(payload));
    } catch {}
    router.push(panel.href);
  };

  const openRefresh = (panel: PanelNode) => {
    const reviewPayload: ReviewResumePayload = { href: panel.href, anchorId: null };
    const refreshPayload: RefreshResumePayload = { href: panel.href, source: 'kesi' };
    try {
      sessionStorage.setItem(REVIEW_RESUME_KEY, JSON.stringify(reviewPayload));
      sessionStorage.setItem(REFRESH_RESUME_KEY, JSON.stringify(refreshPayload));
    } catch {}
    router.push(panel.href);
  };

  const openOverlay = (panel: PanelNode, overlay: OverlayResumePayload['overlay']) => {
    const payload: OverlayResumePayload = { href: panel.href, overlay };
    try {
      sessionStorage.setItem(OVERLAY_RESUME_KEY, JSON.stringify(payload));
    } catch {}
    router.push(panel.href);
  };

  const openPrimaryAction = (panel: PanelNode) => {
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
        <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 6 }}>
          Click any panel to continue it through its current weave.
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
            if (panel) openPrimaryAction(panel);
          }}
        >
          <Background color="var(--mat-border)" gap={24} size={0.8} />
        </ReactFlow>
      </div>
    </div>
  );
}
