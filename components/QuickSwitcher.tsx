'use client';
/**
 * VS Code / Notion / Linear-style fuzzy doc switcher.
 * Cmd+P (or Ctrl+P) opens; type to fuzzy match titles; ↑↓ navigate; Enter opens.
 * Uses the search index for the candidate list — no extra fetch.
 */
import { useEffect, useRef, useState } from 'react';

type Doc = { id: string; title: string; href: string; category: string };

let _idx: Doc[] | null = null;
async function loadDocs(): Promise<Doc[]> {
  if (_idx) return _idx;
  try {
    const r = await fetch('/search-index.json');
    if (!r.ok) return [];
    const payload = await r.json();
    const stored = payload.index?.storedFields ?? {};
    const docIds = payload.index?.documentIds ?? {};
    const out: Doc[] = [];
    for (const [internal, fields] of Object.entries<any>(stored)) {
      if (!fields?.title || !fields?.href) continue;
      out.push({
        id: String(docIds[internal] ?? internal),
        title: fields.title,
        href: fields.href,
        category: fields.category ?? '',
      });
    }
    _idx = out;
    return out;
  } catch { return []; }
}

// Subsequence fuzzy score: returns -Infinity if no match, else lower is better
function fuzzy(needle: string, hay: string): number {
  if (!needle) return 0;
  const n = needle.toLowerCase();
  const h = hay.toLowerCase();
  let i = 0, j = 0, score = 0, lastMatch = -1, runStart = -1;
  while (i < n.length && j < h.length) {
    if (n[i] === h[j]) {
      if (lastMatch === j - 1) score -= 3;       // adjacency bonus
      if (j === 0 || h[j - 1] === ' ') score -= 5; // word-start bonus
      if (runStart === -1) runStart = j;
      lastMatch = j;
      i++;
    }
    j++;
  }
  if (i < n.length) return Infinity;
  score += j - lastMatch; // prefer matches near the start
  return score;
}

export function QuickSwitcher() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [docs, setDocs] = useState<Doc[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) {
      loadDocs().then(setDocs);
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQ(''); setActive(0);
    }
  }, [open]);

  const filtered = (() => {
    if (!q.trim()) return docs.slice(0, 30);
    const scored = docs
      .map((d) => ({ d, s: fuzzy(q, d.title) }))
      .filter((x) => isFinite(x.s))
      .sort((a, b) => a.s - b.s)
      .slice(0, 50);
    return scored.map((x) => x.d);
  })();

  const goto = (i: number) => {
    const d = filtered[i];
    if (d) { setOpen(false); window.location.href = d.href; }
  };

  if (!open) return null;

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && setOpen(false)}
      style={{
        position: 'fixed', inset: 0, zIndex: 120,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '12vh',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        animation: 'lpFade 0.18s var(--ease)',
      }}
    >
      <div className="glass" style={{
        width: 'min(640px, 92vw)', borderRadius: 'var(--r-3)',
        overflow: 'hidden', boxShadow: 'var(--shadow-3)',
      }}>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => { setQ(e.target.value); setActive(0); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, filtered.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
            else if (e.key === 'Enter') { e.preventDefault(); goto(active); }
          }}
          placeholder="Jump to document…"
          style={{
            width: '100%', padding: '1.1rem 1.3rem', border: 0,
            background: 'transparent', color: 'var(--fg)',
            fontSize: '1.05rem', outline: 'none',
            borderBottom: 'var(--hairline)',
            fontFamily: 'var(--display)', fontWeight: 500,
            letterSpacing: '-0.005em',
          }}
        />
        <div style={{ maxHeight: '54vh', overflowY: 'auto' }}>
          {filtered.length === 0 && q && (
            <div style={{ padding: '1rem', color: 'var(--muted)', fontSize: '0.85rem' }}>No matches.</div>
          )}
          {filtered.map((d, i) => (
            <div
              key={d.id}
              onClick={() => goto(i)}
              onMouseEnter={() => setActive(i)}
              style={{
                padding: '0.6rem 1rem', cursor: 'pointer',
                background: i === active ? 'var(--accent-soft)' : 'transparent',
                borderLeft: '3px solid ' + (i === active ? 'var(--accent)' : 'transparent'),
                display: 'flex', alignItems: 'center', gap: 10,
              }}
            >
              <span style={{ fontSize: '0.9rem', color: i === active ? 'var(--accent)' : 'var(--muted)' }}>›</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.9rem', fontWeight: i === active ? 600 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {d.title}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {d.category}
                </div>
              </div>
            </div>
          ))}
          {!q && (
            <div style={{ padding: '0.7rem 1rem', fontSize: '0.72rem', color: 'var(--muted)', borderTop: 'var(--hairline)' }}>
              Type to fuzzy match · ↑↓ navigate · ↵ open · Esc close
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
