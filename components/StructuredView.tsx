'use client';
import { useEffect, useRef, useState } from 'react';
import { NoteRenderer } from './NoteRenderer';

type Result = { markdown: string; cached?: boolean; error?: string };

export function StructuredView({ id, autoGenerate = false }: { id: string; autoGenerate?: boolean }) {
  const [data, setData] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [probed, setProbed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<number | null>(null);

  // Probe cached structure on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/knowledge/structures/${id}.json`, { cache: 'force-cache' });
        if (r.ok && !cancelled) setData(await r.json());
      } catch {}
      if (!cancelled) setProbed(true);
    })();
    return () => { cancelled = true; };
  }, [id]);

  // Auto-generate after probe if requested and no cache hit
  useEffect(() => {
    if (autoGenerate && probed && !data && !loading && !error) {
      generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [probed, autoGenerate, data, loading, error]);

  useEffect(() => {
    if (loading) {
      setElapsed(0);
      timerRef.current = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [loading]);

  const generate = async () => {
    setLoading(true); setError(null);
    abortRef.current = new AbortController();
    try {
      const r = await fetch('/api/structure', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
        signal: abortRef.current.signal,
      });
      const j = await r.json();
      if (!r.ok) setError(j.error ?? 'failed');
      else setData(j);
    } catch (e: any) {
      if (e.name === 'AbortError') setError('Cancelled');
      else setError(e.message);
    }
    finally { setLoading(false); }
  };

  const cancel = () => { abortRef.current?.abort(); };

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
        margin: '1.2rem 0', padding: '1.1rem 1.3rem', border: 'var(--hairline)',
        borderRadius: 'var(--r-2)', fontSize: '0.88rem',
        background: 'linear-gradient(135deg, rgba(0,113,227,0.06), rgba(168,85,247,0.06))',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Spinner />
            <span style={{ fontWeight: 600 }}>Restructuring with Claude</span>
            <span style={{ color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
              · {elapsed}s
            </span>
          </div>
          <div style={{ fontSize: '0.76rem', color: 'var(--muted)', marginTop: 4 }}>
            {elapsed < 15 && 'Loading model + prompt…'}
            {elapsed >= 15 && elapsed < 45 && 'Generating Markdown — this can take 30-90s for long docs.'}
            {elapsed >= 45 && elapsed < 90 && 'Still working — large documents take longer.'}
            {elapsed >= 90 && 'Taking unusually long. You can cancel and try again, or wait — sometimes it just needs a minute.'}
          </div>
        </div>
        <button
          onClick={cancel}
          style={{
            background: 'transparent', border: 'var(--hairline)',
            borderRadius: 'var(--r-1)', padding: '0.4rem 0.9rem',
            cursor: 'pointer', color: 'var(--fg)', fontSize: '0.78rem', fontWeight: 500,
            whiteSpace: 'nowrap',
          }}
        >Cancel</button>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        margin: '1.2rem 0', padding: '1rem 1.2rem',
        border: '1px solid #d97706', borderRadius: 'var(--r-2)',
        background: 'rgba(217,119,6,0.08)',
        fontSize: '0.85rem',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
      }}>
        <span>⚠ {error}</span>
        <button
          onClick={generate}
          style={{
            background: 'var(--accent)', color: '#fff', border: 0,
            borderRadius: 'var(--r-1)', padding: '0.4rem 0.9rem',
            cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
          }}
        >Retry</button>
      </div>
    );
  }

  return (
    <div style={{
      margin: '1.2rem 0', padding: '1rem 1.3rem',
      border: '1px dashed var(--border-strong)', borderRadius: 'var(--r-2)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      background: 'linear-gradient(135deg, rgba(0,113,227,0.05), rgba(168,85,247,0.05))',
    }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>📖 Generate a structured reading view</div>
        <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 2 }}>
          Claude rewrites the OCR text into clean Markdown with headings, formulas, code blocks, and callouts. (~30-60s)
        </div>
      </div>
      <button
        onClick={generate}
        style={{
          background: 'var(--accent)', color: '#fff', border: 0,
          borderRadius: 'var(--r-1)', padding: '0.55rem 1.1rem',
          cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
          boxShadow: 'var(--shadow-1)',
        }}
      >Restructure</button>
    </div>
  );
}

function Spinner() {
  return (
    <div style={{
      width: 14, height: 14, borderRadius: '50%',
      border: '2px solid var(--accent-soft)',
      borderTopColor: 'var(--accent)',
      animation: 'spin 0.9s linear infinite',
    }} />
  );
}
