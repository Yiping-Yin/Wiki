'use client';
import { useEffect, useState } from 'react';

export function PDFNotes({ src, title, height = 600 }: { src: string; title?: string; height?: number }) {
  const key = `pdf-notes:${src}`;
  const [notes, setNotes] = useState('');
  const [open, setOpen] = useState(false);
  useEffect(() => { setNotes(localStorage.getItem(key) || ''); }, [key]);
  useEffect(() => { localStorage.setItem(key, notes); }, [notes, key]);
  return (
    <div style={{ margin: '1.2rem 0', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ padding: '0.5rem 0.8rem', background: 'var(--code-bg)', fontSize: '0.85rem', color: 'var(--muted)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
        <span>📄 {title ?? src} · <a href={src} target="_blank" rel="noreferrer">open</a></span>
        <button onClick={() => setOpen((o) => !o)} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 8px', cursor: 'pointer', color: 'var(--muted)', fontSize: '0.75rem' }}>
          {open ? 'Hide notes' : '✏ Notes'}
        </button>
      </div>
      <iframe src={src} title={title ?? 'PDF'} style={{ width: '100%', height, border: 0 }} />
      {open && (
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} placeholder="Your notes (saved locally)…"
          style={{ width: '100%', border: 0, borderTop: '1px solid var(--border)', padding: '0.6rem 0.8rem', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'inherit', fontSize: '0.85rem', resize: 'vertical' }} />
      )}
    </div>
  );
}
