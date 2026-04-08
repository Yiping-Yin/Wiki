'use client';
import dynamic from 'next/dynamic';
import { Suspense, useState } from 'react';

const AtlasView = dynamic(() => import('../../components/AtlasView'), { ssr: false });
const Sunburst = dynamic(() => import('../../components/Sunburst').then((m) => m.Sunburst), { ssr: false });

type View = 'map' | 'sunburst';

export default function AtlasPage() {
  return (
    <Suspense fallback={null}>
      <AtlasPageInner />
    </Suspense>
  );
}

function AtlasPageInner() {
  const [view, setView] = useState<View>('map');

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
      {/* Title + view tabs */}
      <div style={{
        position: 'absolute', top: 16, left: 16, zIndex: 10,
        background: 'rgba(15,17,21,0.85)', color: '#fff',
        padding: '0.7rem 1rem', borderRadius: 'var(--r-2)', maxWidth: 360,
        fontSize: '0.85rem',
        backdropFilter: 'saturate(180%) blur(20px)',
        WebkitBackdropFilter: 'saturate(180%) blur(20px)',
        border: '0.5px solid rgba(255,255,255,0.1)',
      }}>
        <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 6 }}>🗺 Knowledge Atlas</div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          <Tab active={view === 'map'} onClick={() => setView('map')}>🌍 Map</Tab>
          <Tab active={view === 'sunburst'} onClick={() => setView('sunburst')}>🌞 Sunburst</Tab>
        </div>
        <div style={{ opacity: 0.7, fontSize: '0.76rem', lineHeight: 1.5 }}>
          {view === 'map' && 'Each dot is a doc. Position = semantic similarity (UMAP). Hills = high-density topics.'}
          {view === 'sunburst' && 'Hierarchical view: Knowledge / LLM Reference → category → docs. Click to zoom.'}
        </div>
      </div>

      {view === 'map' && <AtlasView />}
      {view === 'sunburst' && <Sunburst />}
    </div>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? 'var(--accent)' : 'transparent',
        color: '#fff',
        border: '0.5px solid ' + (active ? 'var(--accent)' : 'rgba(255,255,255,0.2)'),
        borderRadius: 6,
        padding: '4px 10px', cursor: 'pointer',
        fontSize: '0.78rem', fontWeight: 600,
        transition: 'all 0.2s var(--ease)',
      }}
    >{children}</button>
  );
}
