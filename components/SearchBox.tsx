'use client';
import { useEffect, useState } from 'react';

type Result = { url: string; meta: { title?: string }; excerpt: string };

declare global { interface Window { pagefind?: any } }

export function SearchBox() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Result[]>([]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setOpen(true); }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open || !q) { setResults([]); return; }
    let cancelled = false;
    (async () => {
      try {
        if (!window.pagefind) {
          // @ts-ignore
          window.pagefind = await import(/* webpackIgnore: true */ '/pagefind/pagefind.js');
        }
        const search = await window.pagefind.search(q);
        const data = await Promise.all(search.results.slice(0, 8).map((r: any) => r.data()));
        if (!cancelled) setResults(data);
      } catch {
        if (!cancelled) setResults([]);
      }
    })();
    return () => { cancelled = true; };
  }, [q, open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          width: '100%', textAlign: 'left', background: 'var(--code-bg)',
          border: '1px solid var(--border)', borderRadius: 6, padding: '0.4rem 0.6rem',
          color: 'var(--muted)', fontSize: '0.82rem', cursor: 'pointer',
        }}
      >
        🔍 Search… <span style={{ float: 'right', fontSize: '0.7rem' }}>⌘K</span>
      </button>
      {open && (
        <div
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100,
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '15vh',
          }}
        >
          <div style={{ width: 'min(560px, 92vw)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search the wiki…"
              style={{ width: '100%', padding: '1rem', border: 0, background: 'transparent', color: 'var(--fg)', fontSize: '1rem', outline: 'none', borderBottom: '1px solid var(--border)' }}
            />
            <div style={{ maxHeight: '50vh', overflowY: 'auto' }}>
              {results.length === 0 && q && (
                <div style={{ padding: '1rem', color: 'var(--muted)', fontSize: '0.85rem' }}>
                  No results. (Run <code>npm run build</code> to generate the search index.)
                </div>
              )}
              {results.map((r, i) => (
                <a key={i} href={r.url} style={{ display: 'block', padding: '0.7rem 1rem', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 600 }}>{r.meta?.title ?? r.url}</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }} dangerouslySetInnerHTML={{ __html: r.excerpt }} />
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
