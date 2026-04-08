'use client';
import { useEffect, useState } from 'react';
import { NoteRenderer } from './NoteRenderer';

type Result = { markdown: string; cached?: boolean; error?: string };

export function StructuredView({ id }: { id: string }) {
  const [data, setData] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Probe cached structure on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/knowledge/structures/${id}.json`, { cache: 'force-cache' });
        if (r.ok && !cancelled) setData(await r.json());
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [id]);

  const generate = async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch('/api/structure', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const j = await r.json();
      if (!r.ok) setError(j.error ?? 'failed');
      else setData(j);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  if (data?.markdown) {
    return (
      <div style={{ marginTop: '1.2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>📖 Structured view</h2>
          {data.cached && <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>cached</span>}
        </div>
        <NoteRenderer source={data.markdown} addIds />
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{
        margin: '1.2rem 0', padding: '1rem 1.2rem', border: '1px solid var(--border)',
        borderRadius: 10, fontSize: '0.85rem', color: 'var(--muted)',
      }}>
        📖 Asking Claude to restructure this document into a clean reading view…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        margin: '1.2rem 0', padding: '0.8rem 1rem',
        border: '1px solid #d97706', borderRadius: 8, background: 'rgba(217,119,6,0.08)',
        fontSize: '0.85rem',
      }}>
        ⚠ {error}
      </div>
    );
  }

  return (
    <div style={{
      margin: '1.2rem 0', padding: '0.9rem 1.2rem',
      border: '1px dashed var(--border)', borderRadius: 10,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      background: 'linear-gradient(135deg, rgba(37,99,235,0.05), rgba(168,85,247,0.05))',
    }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>📖 Generate a structured reading view</div>
        <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 2 }}>
          Claude rewrites the OCR text into a clean Markdown document with headings, formulas, code blocks, and callouts.
        </div>
      </div>
      <button
        onClick={generate}
        style={{
          background: 'var(--accent)', color: '#fff', border: 0,
          borderRadius: 6, padding: '0.5rem 1rem', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
        }}
      >Restructure</button>
    </div>
  );
}
