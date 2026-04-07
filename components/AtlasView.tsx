'use client';
import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import DeckGL from '@deck.gl/react';
import { OrthographicView } from '@deck.gl/core';
import { ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import { HeatmapLayer, ContourLayer } from '@deck.gl/aggregation-layers';

type Doc = { id: string; slug: string; title: string; source: 'wiki' | 'knowledge'; x: number; y: number; cluster: number };
type Cluster = { id: number; label: string; x: number; y: number; size: number; samples: string[] };
type Atlas = { generatedAt: string; docs: Doc[]; clusters: Cluster[] };

const PALETTE: [number, number, number][] = [
  [239, 68, 68], [249, 115, 22], [234, 179, 8], [34, 197, 94], [20, 184, 166], [59, 130, 246],
  [99, 102, 241], [168, 85, 247], [236, 72, 153], [244, 63, 94], [16, 185, 129], [14, 165, 233],
];

export default function AtlasView() {
  const params = useSearchParams();
  const focusId = params.get('focus');

  const [atlas, setAtlas] = useState<Atlas | null>(null);
  const [hover, setHover] = useState<Doc | null>(null);
  const [showHeat, setShowHeat] = useState(true);
  const [showContour, setShowContour] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [viewState, setViewState] = useState<any>({ target: [0, 0, 0], zoom: 2 });

  useEffect(() => {
    fetch('/atlas.json')
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setAtlas(d))
      .catch(() => setAtlas(null));
  }, []);

  // Re-target when atlas loads or focusId changes
  const focusedDoc = useMemo(() => {
    if (!atlas || !focusId) return null;
    // accept "wiki/slug", "know/id", or just "slug"/"id"
    return atlas.docs.find((d) => d.id === focusId)
      || atlas.docs.find((d) => d.slug === focusId)
      || atlas.docs.find((d) => focusId.endsWith('/' + d.slug))
      || null;
  }, [atlas, focusId]);

  useEffect(() => {
    if (focusedDoc) {
      setViewState({ target: [focusedDoc.x, focusedDoc.y, 0], zoom: 6, transitionDuration: 800 });
    }
  }, [focusedDoc]);

  const layers = useMemo(() => {
    if (!atlas) return [];
    const ls: any[] = [];
    if (showHeat) {
      ls.push(new HeatmapLayer<Doc>({
        id: 'heat',
        data: atlas.docs,
        getPosition: (d) => [d.x, d.y],
        getWeight: 1,
        radiusPixels: 60,
        intensity: 1,
        threshold: 0.05,
        colorRange: [
          [10, 14, 24, 0],
          [22, 78, 99, 100],
          [21, 128, 61, 160],
          [202, 138, 4, 200],
          [194, 65, 12, 230],
          [220, 38, 38, 255],
        ],
      }));
    }
    if (showContour) {
      ls.push(new ContourLayer<Doc>({
        id: 'contour',
        data: atlas.docs,
        getPosition: (d) => [d.x, d.y],
        cellSize: 4,
        contours: [
          { threshold: 1, color: [120, 130, 150, 80], strokeWidth: 1 },
          { threshold: 2, color: [140, 150, 170, 110], strokeWidth: 1 },
          { threshold: 3, color: [180, 190, 210, 140], strokeWidth: 1.5 },
          { threshold: 5, color: [220, 230, 250, 180], strokeWidth: 2 },
        ],
        gpuAggregation: false,
      }));
    }
    ls.push(new ScatterplotLayer<Doc>({
      id: 'docs',
      data: atlas.docs,
      getPosition: (d) => [d.x, d.y],
      getRadius: (d) => (focusedDoc && d.id === focusedDoc.id ? 4 : 1.6),
      radiusUnits: 'common',
      radiusMinPixels: 4,
      radiusMaxPixels: 24,
      getFillColor: (d) => {
        const c = PALETTE[d.cluster % PALETTE.length];
        return [...c, 230] as [number, number, number, number];
      },
      getLineColor: (d) => (focusedDoc && d.id === focusedDoc.id ? [255, 255, 0, 255] : [255, 255, 255, 200]),
      lineWidthMinPixels: focusedDoc ? 2 : 1,
      stroked: true,
      pickable: true,
      onHover: (info) => setHover(info.object as Doc | null),
      onClick: (info) => {
        if (!info.object) return;
        const d = info.object as Doc;
        if (d.source === 'wiki') window.location.href = `/wiki/${d.slug}`;
        else if (d.source === 'knowledge') window.location.href = `/knowledge/${d.slug}`;
      },
      updateTriggers: {
        getFillColor: atlas.docs,
        getRadius: focusedDoc?.id ?? '',
        getLineColor: focusedDoc?.id ?? '',
        lineWidthMinPixels: focusedDoc?.id ?? '',
      },
    }));
    if (showLabels) {
      ls.push(new TextLayer<Cluster>({
        id: 'cluster-labels',
        data: atlas.clusters,
        getPosition: (c) => [c.x, c.y],
        getText: (c) => c.label.toUpperCase(),
        getSize: 16,
        getColor: [255, 255, 255, 230],
        getAngle: 0,
        sizeUnits: 'pixels',
        background: true,
        getBackgroundColor: [15, 17, 21, 200],
        backgroundPadding: [6, 3],
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
        fontWeight: 700,
        outlineWidth: 0,
      }));
    }
    return ls;
  }, [atlas, showHeat, showContour, showLabels, focusedDoc]);

  if (!atlas) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#9aa0a6', textAlign: 'center', padding: '2rem' }}>
        <div>
          <div style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>🗺 No atlas yet</div>
          <div style={{ fontSize: '0.85rem' }}>
            Run <code style={{ background: '#161a22', padding: '2px 6px', borderRadius: 4 }}>npx tsx scripts/build-atlas.ts</code> to generate it.
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <DeckGL
        views={new OrthographicView({ id: 'ortho', flipY: false })}
        viewState={viewState}
        onViewStateChange={(e: any) => setViewState(e.viewState)}
        controller={{ scrollZoom: { speed: 0.01, smooth: true }, dragPan: true, dragRotate: false }}
        layers={layers}
        style={{ background: 'radial-gradient(ellipse at center, #0a0e18 0%, #000 100%)' }}
      />

      {/* legend / toggles */}
      <div style={{
        position: 'absolute', top: 16, right: 16, zIndex: 10,
        background: 'rgba(15,17,21,0.85)', color: '#fff', padding: '0.7rem 1rem',
        borderRadius: 8, fontSize: '0.78rem', backdropFilter: 'blur(8px)',
      }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Layers</div>
        <label style={{ display: 'block', cursor: 'pointer' }}>
          <input type="checkbox" checked={showHeat} onChange={(e) => setShowHeat(e.target.checked)} /> Heatmap
        </label>
        <label style={{ display: 'block', cursor: 'pointer' }}>
          <input type="checkbox" checked={showContour} onChange={(e) => setShowContour(e.target.checked)} /> Contours
        </label>
        <label style={{ display: 'block', cursor: 'pointer' }}>
          <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} /> Cluster labels
        </label>
        <div style={{ marginTop: 6, opacity: 0.6 }}>{atlas.docs.length} docs · {atlas.clusters.length} clusters</div>
        {focusedDoc && (
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.15)' }}>
            <div style={{ opacity: 0.6, fontSize: '0.7rem' }}>FOCUSED</div>
            <div style={{ fontWeight: 600 }}>{focusedDoc.title}</div>
            <button
              onClick={() => setViewState({ target: [0, 0, 0], zoom: 2, transitionDuration: 600 })}
              style={{ marginTop: 4, background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: '0.7rem' }}
            >Zoom out</button>
          </div>
        )}
      </div>

      {/* hover tooltip */}
      {hover && (
        <div style={{
          position: 'fixed', pointerEvents: 'none', zIndex: 20,
          left: '50%', bottom: 24, transform: 'translateX(-50%)',
          background: 'rgba(15,17,21,0.95)', color: '#fff',
          padding: '0.5rem 0.9rem', borderRadius: 8, fontSize: '0.85rem',
          border: `2px solid rgb(${PALETTE[hover.cluster % PALETTE.length].join(',')})`,
        }}>
          <strong>{hover.title}</strong>
          <span style={{ opacity: 0.6, marginLeft: 8, fontSize: '0.72rem' }}>
            {hover.source} · cluster {hover.cluster}
          </span>
        </div>
      )}
    </>
  );
}
