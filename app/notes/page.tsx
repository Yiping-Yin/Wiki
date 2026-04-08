'use client';
/**
 * /notes — Apple Notes-style 2-pane editor.
 *
 * Left:  searchable list of notes (one per documented doc id).
 * Right: editor + preview tabs for the selected note.
 *        Includes link back to the source document.
 *
 * All notes still live in localStorage `wiki:notes:<docId>` (single source of
 * truth shared with the inline DocNotes component on every doc page).
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useNotedIds, useNote } from '../../lib/use-notes';
import { NoteRenderer } from '../../components/NoteRenderer';

type IndexDoc = { id: string; title: string; href: string; category: string };

let _idxCache: IndexDoc[] | null = null;
async function loadDocs(): Promise<IndexDoc[]> {
  if (_idxCache) return _idxCache;
  try {
    const r = await fetch('/search-index.json');
    if (!r.ok) return [];
    const payload = await r.json();
    const stored = payload.index?.storedFields ?? {};
    const docIds = payload.index?.documentIds ?? {};
    const out: IndexDoc[] = [];
    for (const [internal, fields] of Object.entries<any>(stored)) {
      if (!fields?.title || !fields?.href) continue;
      out.push({ id: String(docIds[internal] ?? internal), title: fields.title, href: fields.href, category: fields.category ?? '' });
    }
    _idxCache = out;
    return out;
  } catch { return []; }
}

export default function NotesPage() {
  const ids = useNotedIds();
  const [docs, setDocs] = useState<IndexDoc[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [bodies, setBodies] = useState<Record<string, string>>({});

  useEffect(() => { loadDocs().then(setDocs); }, []);

  // Load all note bodies (fast — they're tiny strings)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const map: Record<string, string> = {};
    for (const id of ids) map[id] = localStorage.getItem('wiki:notes:' + id) ?? '';
    setBodies(map);
  }, [ids]);

  const docsById = useMemo(() => {
    const m = new Map<string, IndexDoc>();
    for (const d of docs) m.set(d.id, d);
    return m;
  }, [docs]);

  const items = useMemo(() => {
    return ids
      .map((id) => ({
        id,
        meta: docsById.get(id) ?? null,
        body: bodies[id] ?? '',
      }))
      .filter((it) => {
        if (!q.trim()) return true;
        const lc = q.toLowerCase();
        return (it.meta?.title ?? '').toLowerCase().includes(lc) || it.body.toLowerCase().includes(lc);
      })
      .sort((a, b) => (a.meta?.title ?? a.id).localeCompare(b.meta?.title ?? b.id));
  }, [ids, docsById, bodies, q]);

  // Auto-select first item on mount or when selection invalidated
  useEffect(() => {
    if (items.length === 0) { setSelectedId(null); return; }
    if (!selectedId || !items.find((i) => i.id === selectedId)) {
      setSelectedId(items[0].id);
    }
  }, [items, selectedId]);

  const selected = items.find((i) => i.id === selectedId) ?? null;

  return (
    <div style={{
      display: 'flex',
      height: 'calc(100vh - 0px)',
      maxHeight: '100vh',
      overflow: 'hidden',
    }}>
      {/* Left: list */}
      <div style={{
        width: 320, flexShrink: 0,
        borderRight: 'var(--hairline)',
        background: 'var(--surface-2)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '1.2rem 1.1rem 0.8rem' }}>
          <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted)', fontWeight: 700, marginBottom: 6 }}>
            <Link href="/" style={{ color: 'var(--muted)', textDecoration: 'none' }}>Home ›</Link>
          </div>
          <h1 style={{
            margin: 0, fontSize: '1.65rem', fontWeight: 700,
            fontFamily: 'var(--display)', letterSpacing: '-0.02em',
            padding: 0, border: 0, lineHeight: 1.15,
          }}>📝 Notes</h1>
          <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 4 }}>
            {ids.length} note{ids.length === 1 ? '' : 's'}
          </div>
        </div>

        <div style={{ padding: '0 1.1rem 0.8rem' }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search notes…"
            style={{
              width: '100%', padding: '0.45rem 0.7rem',
              border: 'var(--hairline)', borderRadius: 'var(--r-1)',
              background: 'var(--bg)', color: 'var(--fg)',
              fontSize: '0.82rem', outline: 'none',
            }}
          />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 1rem' }}>
          {items.length === 0 && (
            <div style={{ padding: '2rem 1.1rem', color: 'var(--muted)', fontSize: '0.85rem', textAlign: 'center' }}>
              {ids.length === 0
                ? 'No notes yet. Open any doc and write in the My notes panel.'
                : 'No matches.'}
            </div>
          )}
          {items.map((it) => {
            const isActive = it.id === selectedId;
            const title = it.meta?.title ?? prettifyId(it.id);
            const preview = (it.body || '').replace(/\n/g, ' ').slice(0, 80);
            return (
              <div
                key={it.id}
                onClick={() => setSelectedId(it.id)}
                style={{
                  padding: '0.75rem 1.1rem',
                  cursor: 'pointer',
                  background: isActive ? 'var(--bg)' : 'transparent',
                  borderLeft: '3px solid ' + (isActive ? 'var(--accent)' : 'transparent'),
                  borderBottom: '0.5px solid var(--border)',
                }}
              >
                <div style={{
                  fontWeight: isActive ? 700 : 600,
                  fontSize: '0.85rem',
                  color: isActive ? 'var(--accent)' : 'var(--fg)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{title}</div>
                {preview && (
                  <div style={{
                    fontSize: '0.72rem', color: 'var(--muted)', marginTop: 3, lineHeight: 1.4,
                    overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                  }}>
                    {preview}
                  </div>
                )}
                {it.meta?.category && (
                  <div style={{ fontSize: '0.66rem', color: 'var(--muted)', marginTop: 4, opacity: 0.7 }}>
                    {it.meta.category}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Right: editor */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {selected ? <NoteEditor key={selected.id} id={selected.id} meta={selected.meta} /> : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: '0.9rem' }}>
            Select a note from the list
          </div>
        )}
      </div>
    </div>
  );
}

function NoteEditor({ id, meta }: { id: string; meta: IndexDoc | null }) {
  const [value, setValue] = useNote(id);
  const [mode, setMode] = useState<'edit' | 'preview' | 'split'>('split');

  return (
    <>
      {/* Header */}
      <div style={{
        padding: '1rem 1.6rem 0.7rem',
        borderBottom: 'var(--hairline)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
            {meta?.category ?? 'note'}
          </div>
          <div style={{
            fontSize: '1.4rem', fontWeight: 700,
            fontFamily: 'var(--display)', letterSpacing: '-0.018em',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {meta?.title ?? prettifyId(id)}
          </div>
        </div>
        <div style={{
          display: 'inline-flex', background: 'var(--surface-2)',
          borderRadius: 'var(--r-1)', padding: 2, border: 'var(--hairline)',
        }}>
          {(['edit', 'split', 'preview'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                background: mode === m ? 'var(--bg)' : 'transparent',
                color: mode === m ? 'var(--fg)' : 'var(--muted)',
                border: 0, padding: '4px 12px', borderRadius: 6,
                cursor: 'pointer', fontSize: '0.74rem', fontWeight: 600,
                boxShadow: mode === m ? 'var(--shadow-1)' : 'none',
                transition: 'all 0.2s var(--ease)',
              }}
            >{m}</button>
          ))}
        </div>
        {meta && (
          <Link
            href={meta.href}
            style={{
              background: 'var(--accent)', color: '#fff',
              border: 0, borderRadius: 'var(--r-1)',
              padding: '6px 12px', fontSize: '0.78rem', fontWeight: 600,
              textDecoration: 'none',
            }}
          >Open doc →</Link>
        )}
      </div>

      {/* Editor body */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {(mode === 'edit' || mode === 'split') && (
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Markdown welcome. Use [[Doc title]] to link to other wiki/knowledge pages."
              style={{
                flex: 1,
                width: '100%', padding: '1.4rem 1.6rem',
                border: 0, background: 'var(--bg)',
                color: 'var(--fg)', fontSize: '0.95rem', lineHeight: 1.65,
                fontFamily: 'var(--sans)',
                outline: 'none', resize: 'none',
              }}
            />
          </div>
        )}
        {mode === 'split' && (
          <div style={{ width: '0.5px', background: 'var(--border)' }} />
        )}
        {(mode === 'preview' || mode === 'split') && (
          <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '1.4rem 1.6rem' }}>
            {value ? (
              <NoteRenderer source={value} />
            ) : (
              <div style={{ color: 'var(--muted)', fontSize: '0.9rem', fontStyle: 'italic' }}>
                Nothing to preview
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function prettifyId(id: string): string {
  return id.replace(/^wiki\//, '').replace(/^know\//, '').replace(/^upload\//, '').replace(/^.*__/, '').replace(/-/g, ' ');
}
