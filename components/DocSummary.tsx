'use client';
import { useEffect, useState } from 'react';

type Summary = {
  summary: string;
  bullets: string[];
  keyTerms: string[];
  cached?: boolean;
  error?: string;
};

export function DocSummary({ id }: { id: string }) {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);

  // Try to fetch a cached summary on mount (HEAD-style: hit the endpoint, it returns cached if exists)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Probe via the static cache file directly (no API hit if cached)
        const r = await fetch(`/knowledge/summaries/${id}.json`, { cache: 'force-cache' });
        if (r.ok && !cancelled) {
          const j = await r.json();
          setData(j);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [id]);

  const generate = async () => {
    setLoading(true);
    setError(null);
    setRequested(true);
    try {
      const r = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const j = await r.json();
      if (!r.ok) {
        setError(j.error ?? 'failed');
      } else {
        setData(j);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (!data && !requested) {
    return (
      <div style={{
        margin: '1.2rem 0', padding: '0.8rem 1rem',
        border: '1px dashed var(--border)', borderRadius: 8,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'var(--code-bg)',
      }}>
        <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          ✨ Generate an AI summary of this document
        </span>
        <button
          onClick={generate}
          style={{
            background: 'var(--accent)', color: '#fff', border: 0,
            borderRadius: 6, padding: '0.4rem 0.9rem', cursor: 'pointer', fontSize: '0.82rem',
          }}
        >Generate</button>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{
        margin: '1.2rem 0', padding: '1rem', border: '1px solid var(--border)',
        borderRadius: 8, fontSize: '0.85rem', color: 'var(--muted)',
      }}>
        ✨ Asking Claude to summarize…
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

  if (!data) return null;

  return (
    <div style={{
      margin: '1.2rem 0', padding: '1rem 1.2rem',
      border: '1px solid var(--border)', borderRadius: 10,
      background: 'linear-gradient(135deg, rgba(37,99,235,0.05), rgba(168,85,247,0.05))',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', fontWeight: 700 }}>
          ✨ AI Summary
        </span>
        {data.cached && <span style={{ fontSize: '0.65rem', color: 'var(--muted)' }}>cached</span>}
      </div>
      {data.summary && <p style={{ margin: '0.4rem 0 0.8rem', fontSize: '0.92rem', lineHeight: 1.55 }}>{data.summary}</p>}
      {data.bullets?.length > 0 && (
        <ul style={{ margin: '0.4rem 0 0.6rem 1rem', padding: 0, fontSize: '0.85rem', lineHeight: 1.5 }}>
          {data.bullets.map((b, i) => <li key={i}>{b}</li>)}
        </ul>
      )}
      {data.keyTerms?.length > 0 && (
        <div style={{ marginTop: '0.6rem', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {data.keyTerms.map((t, i) => (
            <span key={i} style={{
              fontSize: '0.7rem', padding: '2px 8px',
              background: 'rgba(37,99,235,0.12)', color: 'var(--accent)',
              borderRadius: 10,
            }}>{t}</span>
          ))}
        </div>
      )}
    </div>
  );
}
