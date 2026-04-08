'use client';
import { useState } from 'react';

export function CollapsiblePdf({ src, title, height = 720 }: { src: string; title?: string; height?: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ margin: '1.2rem 0', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%', textAlign: 'left',
          padding: '0.6rem 0.9rem', background: 'var(--code-bg)',
          border: 0, borderBottom: open ? '1px solid var(--border)' : 'none',
          cursor: 'pointer', fontSize: '0.85rem', color: 'var(--fg)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}
      >
        <span>📄 {open ? 'Hide' : 'Show'} original PDF</span>
        <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>{open ? '▾' : '▸'}</span>
      </button>
      {open && <iframe src={src} title={title ?? 'PDF'} style={{ width: '100%', height, border: 0 }} />}
    </div>
  );
}
