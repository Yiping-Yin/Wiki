'use client';
import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useNotedIds } from '../../lib/use-notes';

type SearchEntry = { id: string; title: string; href: string; category: string };

export default function NotesPage() {
  const ids = useNotedIds();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [meta, setMeta] = useState<Record<string, SearchEntry>>({});
  const [q, setQ] = useState('');

  // Pull current note bodies + lookup metadata from the search index
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const map: Record<string, string> = {};
    for (const id of ids) {
      map[id] = localStorage.getItem('wiki:notes:' + id) ?? '';
    }
    setNotes(map);
  }, [ids]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/search-index.json');
        if (!res.ok) return;
        const payload = await res.json();
        const store = payload.index?.documentVectors || payload.index?.storedFields || {};
        // MiniSearch v7 stores fields under index.storedFields
        const fields = payload.index?.storedFields ?? {};
        const out: Record<string, SearchEntry> = {};
        for (const [internalId, doc] of Object.entries<any>(fields)) {
          // need to map internalId → id; rely on documentIds
          // simpler: scan documentIds map
        }
        // Fallback path: re-derive via MiniSearch API
        const { default: MiniSearch } = await import('minisearch');
        const ms = MiniSearch.loadJS(payload.index, {
          idField: 'id',
          fields: ['title', 'category', 'body'],
          storeFields: ['title', 'href', 'category'],
        });
        const map: Record<string, SearchEntry> = {};
        for (const id of ids) {
          // MiniSearch internal: getStoredFields
          try {
            const stored = (ms as any).documentTermFreqs ? null : null;
            // simpler: use search by id substring
            const hits = ms.search(id.replace(/^.+\//, ''), { fuzzy: 0.1 }) as any[];
            const m = hits.find((h) => h.id === id);
            if (m) map[id] = { id, title: m.title, href: m.href, category: m.category };
          } catch {}
        }
        if (!cancelled) setMeta(map);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [ids]);

  const filtered = useMemo(() => {
    const lc = q.toLowerCase().trim();
    return ids.filter((id) => {
      if (!lc) return true;
      const t = (meta[id]?.title ?? '').toLowerCase();
      const b = (notes[id] ?? '').toLowerCase();
      return t.includes(lc) || b.includes(lc);
    });
  }, [ids, q, notes, meta]);

  const exportAll = () => {
    const lines: string[] = ['# My Wiki Notes', '', `_Exported ${new Date().toISOString()}_`, ''];
    for (const id of ids) {
      const m = meta[id];
      const body = notes[id] ?? '';
      if (!body.trim()) continue;
      lines.push('---');
      lines.push('');
      lines.push(`## ${m?.title ?? id}`);
      if (m?.category) lines.push(`*${m.category}*`);
      if (m?.href) lines.push(`[open in wiki](${m.href})`);
      lines.push('');
      lines.push(body);
      lines.push('');
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wiki-notes-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="prose-notion">
      <h1>📝 My Notes</h1>
      <p style={{ color: 'var(--muted)' }}>
        {ids.length === 0
          ? 'No notes yet. Open any doc and start writing in the My notes panel.'
          : `${ids.length} note${ids.length === 1 ? '' : 's'} across the wiki.`}
      </p>

      {ids.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: '0.5rem', margin: '1rem 0' }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="filter by title or note content…"
              style={{
                flex: 1, padding: '0.5rem 0.8rem', border: '1px solid var(--border)',
                borderRadius: 6, background: 'var(--bg)', color: 'var(--fg)', fontSize: '0.88rem',
              }}
            />
            <button
              onClick={exportAll}
              style={{
                background: 'var(--accent)', color: '#fff', border: 0,
                borderRadius: 6, padding: '0.5rem 0.9rem', cursor: 'pointer', fontSize: '0.85rem',
              }}
            >Export .md</button>
          </div>

          <ul style={{ listStyle: 'none', padding: 0 }}>
            {filtered.map((id) => {
              const m = meta[id];
              const body = notes[id] ?? '';
              return (
                <li key={id} style={{ borderBottom: '1px solid var(--border)', padding: '0.9rem 0' }}>
                  {m?.href ? (
                    <Link href={m.href} style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--fg)', textDecoration: 'none' }}>
                      {m.title}
                    </Link>
                  ) : (
                    <span style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--muted)' }}>{id}</span>
                  )}
                  {m?.category && (
                    <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: 1 }}>{m.category}</div>
                  )}
                  {body && (
                    <p style={{ fontSize: '0.85rem', marginTop: 6, color: 'var(--fg)', whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>
                      {body.length > 300 ? body.slice(0, 300) + '…' : body}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
