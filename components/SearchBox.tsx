'use client';
import { useEffect, useRef, useState } from 'react';

type Result = { id: string; title: string; href: string; category: string; score: number };

let _msPromise: Promise<any> | null = null;
async function loadIndex() {
  if (_msPromise) return _msPromise;
  _msPromise = (async () => {
    const [{ default: MiniSearch }, res] = await Promise.all([
      import('minisearch'),
      fetch('/search-index.json'),
    ]);
    if (!res.ok) throw new Error('search index missing — run `npx tsx scripts/build-search-index.ts`');
    const payload = await res.json();
    return MiniSearch.loadJS(payload.index, {
      idField: 'id',
      fields: ['title', 'category', 'body'],
      storeFields: ['title', 'href', 'category'],
      searchOptions: { boost: { title: 4, category: 2 }, fuzzy: 0.15, prefix: true },
    });
  })();
  return _msPromise;
}

export function SearchBox() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setOpen(true); }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    if (!open || !q.trim()) { setResults([]); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const ms = await loadIndex();
        const hits = ms.search(q, { combineWith: 'AND' }).slice(0, 20);
        if (!cancelled) {
          setResults(hits as Result[]);
          setActiveIdx(0);
        }
      } catch (e: any) {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [q, open]);

  const goto = (i: number) => {
    const r = results[i];
    if (r) { setOpen(false); window.location.href = r.href; }
  };

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
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 100,
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh',
            backdropFilter: 'blur(4px)',
          }}
        >
          <div style={{ width: 'min(620px, 92vw)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, results.length - 1)); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
                else if (e.key === 'Enter') { e.preventDefault(); goto(activeIdx); }
              }}
              placeholder="Search 501 docs…"
              style={{
                width: '100%', padding: '1rem 1.2rem', border: 0, background: 'transparent',
                color: 'var(--fg)', fontSize: '1rem', outline: 'none',
                borderBottom: '1px solid var(--border)',
              }}
            />
            <div style={{ maxHeight: '54vh', overflowY: 'auto' }}>
              {loading && <div style={{ padding: '1rem', color: 'var(--muted)', fontSize: '0.85rem' }}>searching…</div>}
              {!loading && q && results.length === 0 && (
                <div style={{ padding: '1rem', color: 'var(--muted)', fontSize: '0.85rem' }}>No results.</div>
              )}
              {results.map((r, i) => (
                <div
                  key={r.id}
                  onClick={() => goto(i)}
                  onMouseEnter={() => setActiveIdx(i)}
                  style={{
                    padding: '0.6rem 1rem', cursor: 'pointer',
                    background: i === activeIdx ? 'var(--code-bg)' : 'transparent',
                    borderLeft: i === activeIdx ? '3px solid var(--accent)' : '3px solid transparent',
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{r.title}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 2 }}>{r.category}</div>
                </div>
              ))}
              {!q && (
                <div style={{ padding: '1rem', color: 'var(--muted)', fontSize: '0.78rem' }}>
                  Type to search · ↑↓ navigate · ↵ open · Esc close
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
