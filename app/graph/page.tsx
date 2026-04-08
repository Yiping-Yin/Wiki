'use client';
import dynamic from 'next/dynamic';

const ForceGraph = dynamic(() => import('../../components/ForceGraph').then((m) => m.ForceGraph), { ssr: false });

export default function GraphPage() {
  return (
    <div style={{ position: 'relative', height: '100vh' }}>
      <div style={{
        position: 'absolute', top: 16, left: 16, zIndex: 10,
        background: 'rgba(15,17,21,0.85)', color: '#fff',
        padding: '0.7rem 1rem', borderRadius: 8, maxWidth: 320,
        fontSize: '0.85rem', backdropFilter: 'blur(8px)',
      }}>
        <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 4 }}>🕸 Knowledge Graph</div>
        <div style={{ opacity: 0.7, fontSize: '0.78rem', lineHeight: 1.5 }}>
          D3 force-directed graph of all 501 docs. Edges are top-3 vector neighbors per doc.
          Drag nodes · scroll to zoom · click to open.
        </div>
      </div>
      <ForceGraph />
    </div>
  );
}
