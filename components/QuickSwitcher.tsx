'use client';
/**
 * Spotlight-style ⌘P switcher.
 *
 * Searches three result kinds with grouped sections:
 *   • Collections   — top-level folders (e.g. UNSW · FINS 3640)
 *   • Weeks         — sub-sections inside a collection (e.g. Week 3)
 *   • Documents     — individual files
 *
 * Trigger: ⌘P / Ctrl+P · Esc closes · ↑↓ navigates · Enter opens.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { contextFromPathname } from '../lib/doc-context';
import { useSmallScreen } from '../lib/use-small-screen';
import { useKnowledgeNav } from '../lib/use-knowledge-nav';

type Doc = { id: string; title: string; href: string; category: string };
type Result =
  | { kind: 'doc'; key: string; title: string; sub: string; href: string }
  | { kind: 'collection'; key: string; title: string; sub: string; href: string }
  | { kind: 'week'; key: string; title: string; sub: string; href: string };

let _idx: Doc[] | null = null;
async function loadDocs(): Promise<Doc[]> {
  if (_idx) return _idx;
  try {
    const r = await fetch('/api/search-index');
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

/** Subsequence fuzzy score. -∞ = no match, lower better. */
function fuzzy(needle: string, hay: string): number {
  if (!needle) return 0;
  const n = needle.toLowerCase();
  const h = hay.toLowerCase();
  let i = 0, j = 0, score = 0, lastMatch = -1;
  while (i < n.length && j < h.length) {
    if (n[i] === h[j]) {
      if (lastMatch === j - 1) score -= 3;
      if (j === 0 || h[j - 1] === ' ') score -= 5;
      lastMatch = j;
      i++;
    }
    j++;
  }
  if (i < n.length) return Infinity;
  score += j - lastMatch;
  return score;
}

export function QuickSwitcher() {
  const pathname = usePathname() ?? '/';
  const ctx = contextFromPathname(pathname);
  const smallScreen = useSmallScreen();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [docs, setDocs] = useState<Doc[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { knowledgeCategories } = useKnowledgeNav();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'p' || e.key === 'k')) {
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

  const collections: Result[] = useMemo(
    () => knowledgeCategories.map((c) => ({
      kind: 'collection', key: `c:${c.slug}`,
      title: c.label, sub: 'Collection',
      href: `/knowledge/${c.slug}`,
    })),
    [knowledgeCategories],
  );

  const weeks: Result[] = useMemo(() => {
    const out: Result[] = [];
    for (const c of knowledgeCategories) {
      for (const s of c.subs) {
        if (!s.label) continue;
        out.push({
          kind: 'week',
          key: `w:${c.slug}:${s.label}`,
          title: s.label,
          sub: c.label,
          href: `/knowledge/${c.slug}#${encodeURIComponent(s.label)}`,
        });
      }
    }
    return out;
  }, [knowledgeCategories]);

  const allDocResults: Result[] = useMemo(
    () => docs.map((d) => ({
      kind: 'doc', key: `d:${d.id}`,
      title: d.title, sub: d.category, href: d.href,
    })),
    [docs],
  );

  // Learning tool actions — discoverable via ⌘P search
  const toolActions: Result[] = useMemo(() => [
    { kind: 'doc' as const, key: 'tool:rehearsal', title: 'Rehearsal', sub: 'Deepen a panel from memory', href: '__action:rehearsal' },
    { kind: 'doc' as const, key: 'tool:examiner', title: 'Examiner', sub: 'Verify a woven understanding', href: '__action:examiner' },
    { kind: 'doc' as const, key: 'tool:kesi', title: 'Kesi', sub: ctx.isFree ? 'Open the settled fabric' : 'Open the current panel in kesi', href: ctx.isFree ? '/kesi' : `__action:kesi:${ctx.docId}` },
    { kind: 'doc' as const, key: 'tool:relations', title: 'Relations', sub: ctx.isFree ? 'Open the panel relation layer' : 'Open the current panel in relations', href: ctx.isFree ? '/graph' : `__action:relations:${ctx.docId}` },
    { kind: 'doc' as const, key: 'tool:ingestion', title: 'Import', sub: 'Drag-drop files', href: '__action:ingestion' },
    { kind: 'doc' as const, key: 'tool:recursing', title: 'Reconstructions', sub: 'Past rehearsals', href: '__action:recursing' },
    { kind: 'doc' as const, key: 'tool:thoughtmap', title: 'Thought Map', sub: '⌘/ · Settle the current weave', href: '__action:thoughtmap' },
    { kind: 'doc' as const, key: 'tool:help', title: 'Help', sub: 'Usage guide', href: '/help' },
    { kind: 'doc' as const, key: 'tool:export-json', title: 'Export Notes (JSON)', sub: 'Full backup', href: '__action:export-json' },
    { kind: 'doc' as const, key: 'tool:export-md', title: 'Export Notes (Markdown)', sub: 'Human-readable', href: '__action:export-md' },
  ], [ctx.docId, ctx.isFree]);

  // Score & merge — content first, tools last.
  const grouped = useMemo(() => {
    const score = (label: string) => fuzzy(q, label);
    const rank = (r: Result) => Math.min(score(r.title), score(`${r.title} ${r.sub}`));
    const filterAndSort = (arr: Result[], cap: number) => {
      if (!q.trim()) return arr.slice(0, cap);
      const scored = arr
        .map((r) => ({ r, s: rank(r) }))
        .filter((x) => isFinite(x.s))
        .sort((a, b) => a.s - b.s)
        .slice(0, cap);
      return scored.map((x) => x.r);
    };
    return {
      collections: filterAndSort(collections, q.trim() ? 5 : 0),
      weeks:       filterAndSort(weeks,       q.trim() ? 8 : 0),
      tools:       filterAndSort(toolActions,  q.trim() ? 5 : 0),
      docs:        filterAndSort(allDocResults, q.trim() ? 30 : 12),
    };
  }, [q, collections, weeks, allDocResults, toolActions]);

  // Flatten to a single keyboard-navigable list
  const flat: Result[] = useMemo(
    () => [...grouped.collections, ...grouped.weeks, ...grouped.docs, ...grouped.tools],
    [grouped],
  );

  useEffect(() => { setActive(0); }, [q]);

  // Scroll active row into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const el = list.querySelector(`[data-row="${active}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const goto = (i: number) => {
    const r = flat[i];
    if (!r) return;
    setOpen(false);
    // Handle tool actions via overlay toggle events
    if (r.href === '__action:rehearsal') {
      window.dispatchEvent(new CustomEvent('loom:overlay:open', { detail: { id: 'rehearsal' } }));
      window.dispatchEvent(new CustomEvent('loom:overlay:toggle', { detail: { id: 'rehearsal' } }));
    } else if (r.href === '__action:examiner') {
      window.dispatchEvent(new CustomEvent('loom:overlay:open', { detail: { id: 'examiner' } }));
      window.dispatchEvent(new CustomEvent('loom:overlay:toggle', { detail: { id: 'examiner' } }));
    } else if (r.href === '__action:ingestion') {
      window.dispatchEvent(new CustomEvent('loom:overlay:open', { detail: { id: 'ingestion' } }));
      window.dispatchEvent(new CustomEvent('loom:overlay:toggle', { detail: { id: 'ingestion' } }));
    } else if (r.href === '__action:recursing') {
      window.dispatchEvent(new CustomEvent('loom:overlay:open', { detail: { id: 'recursing' } }));
      window.dispatchEvent(new CustomEvent('loom:overlay:toggle', { detail: { id: 'recursing' } }));
    } else if (r.href === '__action:thoughtmap') {
      window.dispatchEvent(new CustomEvent('loom:review:set-active', { detail: { active: true } }));
    } else if (r.href.startsWith('__action:kesi:')) {
      const docId = r.href.slice('__action:kesi:'.length);
      window.location.href = `/kesi?focus=${encodeURIComponent(docId)}`;
    } else if (r.href.startsWith('__action:relations:')) {
      const docId = r.href.slice('__action:relations:'.length);
      window.location.href = `/graph?focus=${encodeURIComponent(docId)}`;
    } else if (r.href === '__action:export-json') {
      window.dispatchEvent(new CustomEvent('loom:export', { detail: { format: 'json' } }));
    } else if (r.href === '__action:export-md') {
      window.dispatchEvent(new CustomEvent('loom:export', { detail: { format: 'markdown' } }));
    } else {
      window.location.href = r.href;
    }
  };

  if (!open) return null;

  let cursor = 0;
  const renderGroup = (label: string, rows: Result[]) => {
    if (rows.length === 0) return null;
    const startIdx = cursor;
    cursor += rows.length;
    return (
      <div key={label}>
        <div className="t-caption2" style={{
          padding: '10px 18px 4px',
          textTransform: 'uppercase', letterSpacing: '0.10em',
          color: 'var(--muted)', fontWeight: 700,
        }}>{label}</div>
        {rows.map((r, j) => {
          const i = startIdx + j;
          const isActive = i === active;
          return (
            <div
              key={r.key}
              data-row={i}
              onClick={() => goto(i)}
              onMouseEnter={() => setActive(i)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '0.65rem 1.1rem 0.65rem 0.15rem',
                cursor: 'pointer',
                background: isActive ? 'var(--accent-soft)' : 'transparent',
                borderLeft: '1px solid ' + (isActive ? 'var(--accent)' : 'transparent'),
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="t-subhead" style={{
                  fontWeight: isActive ? 700 : 600, color: 'var(--fg)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{r.title}</div>
                <div className="t-caption" style={{
                  color: 'var(--muted)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{r.sub}</div>
              </div>
              {isActive && (
                <span className="t-caption2" style={{
                  color: 'var(--muted)', fontFamily: 'var(--mono)',
                  border: '0.5px solid var(--mat-border)',
                  borderRadius: 4, padding: '2px 6px',
                  flexShrink: 0,
                }}>↵</span>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && setOpen(false)}
      style={{
        position: 'fixed', inset: 0, zIndex: 120,
        background: 'rgba(0,0,0,0.28)',
        display: 'flex',
        alignItems: smallScreen ? 'stretch' : 'flex-start',
        justifyContent: 'center',
        paddingTop: smallScreen ? 0 : '11vh',
        backdropFilter: 'saturate(125%) blur(7px)',
        WebkitBackdropFilter: 'saturate(125%) blur(7px)',
        animation: 'lpFade 0.18s var(--ease)',
      }}
    >
      <div style={{
        width: smallScreen ? '100vw' : 'min(680px, 92vw)',
        minHeight: smallScreen ? '100vh' : 'auto',
        background: 'color-mix(in srgb, var(--bg) 96%, var(--bg-elevated))',
        borderTop: smallScreen ? 'none' : '0.5px solid var(--mat-border)',
        borderBottom: smallScreen ? 'none' : '0.5px solid var(--mat-border)',
        overflow: 'hidden',
        paddingTop: smallScreen ? 'max(8px, env(safe-area-inset-top, 0px))' : 0,
        paddingBottom: smallScreen ? 'max(8px, env(safe-area-inset-bottom, 0px))' : 0,
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: smallScreen ? '0.85rem 1rem' : '0.85rem 1.1rem', borderBottom: '0.5px solid var(--mat-border)' }}>
          <span style={{ color: 'var(--muted)', fontSize: '1.05rem' }}>⌕</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, flat.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
              else if (e.key === 'Enter') { e.preventDefault(); goto(active); }
            }}
            placeholder="Search collections, weeks, documents…"
            style={{
              flex: 1, padding: 0, border: 0,
              background: 'transparent', color: 'var(--fg)',
              fontSize: '1.05rem', outline: 'none',
              fontFamily: 'var(--display)', fontWeight: 500,
              letterSpacing: '-0.005em',
            }}
          />
        </div>
        <div ref={listRef} style={{ maxHeight: smallScreen ? 'none' : '60vh', flex: smallScreen ? 1 : 'none', overflowY: 'auto', padding: '4px 0 8px' }}>
          {flat.length === 0 && q ? (
            <div style={{ padding: '1.4rem 1.2rem', color: 'var(--muted)' }} className="t-footnote">
              No matches for &ldquo;{q}&rdquo;.
            </div>
          ) : (
            <>
              {renderGroup('Collections', grouped.collections)}
              {renderGroup('Weeks', grouped.weeks)}
              {renderGroup(q.trim() ? 'Documents' : 'Recent', grouped.docs)}
              {renderGroup('Tools', grouped.tools)}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
