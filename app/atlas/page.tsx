'use client';
import dynamic from 'next/dynamic';

const AtlasView = dynamic(() => import('../../components/AtlasView'), { ssr: false });

export default function AtlasPage() {
  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
      <div style={{
        position: 'absolute', top: 16, left: 16, zIndex: 10,
        background: 'rgba(15,17,21,0.85)', color: '#fff', padding: '0.7rem 1rem',
        borderRadius: 8, fontSize: '0.85rem', maxWidth: 320, backdropFilter: 'blur(8px)',
      }}>
        <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 4 }}>🗺 Knowledge Atlas</div>
        <div style={{ opacity: 0.7, fontSize: '0.78rem', lineHeight: 1.5 }}>
          Each dot is a document. Position is determined by semantic similarity (UMAP of local embeddings).
          Color = auto-detected cluster. Hills = high-density topics.
          Scroll to zoom · drag to pan · click a dot to open the page.
        </div>
      </div>
      <AtlasView />
    </div>
  );
}
