'use client';
/**
 * Loom Shuttle.
 *
 * Searches collections, sections, documents, and actions in one surface.
 * Trigger: ⌘K / ⌘P.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { contextFromPathname } from '../lib/doc-context';
import { getAiSurface } from '../lib/ai/stage-model';
import { openLoomOverlay, openLoomReview } from '../lib/ai/surface-actions';
import { SHUTTLE_OPEN_EVENT } from '../lib/shuttle';
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
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { sourceLibraryGroups } = useKnowledgeNav();
  const rehearsalSurface = getAiSurface('rehearsal');
  const examinerSurface = getAiSurface('examiner');
  const ingestionSurface = getAiSurface('ingestion');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'p' || e.key === 'k')) {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener(SHUTTLE_OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(SHUTTLE_OPEN_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setLoading(true);
      loadDocs().then((loaded) => {
        setDocs(loaded);
        setLoading(false);
      });
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQ(''); setActive(0);
    }
  }, [open]);

  const collections: Result[] = useMemo(
    () => sourceLibraryGroups.flatMap((group) => group.categories.map((category) => ({
      kind: 'collection' as const,
      key: `c:${group.id}:${category.slug}`,
      title: category.label,
      sub: group.label,
      href: `/knowledge/${category.slug}`,
    }))),
    [sourceLibraryGroups],
  );

  const sourceSections: Result[] = useMemo(
    () => sourceLibraryGroups.flatMap((group) => group.categories.flatMap((category) => category.subs
      .filter((section) => section.label)
      .map((section) => ({
        kind: 'week' as const,
        key: `w:${group.id}:${category.slug}:${section.label}`,
        title: section.label,
        sub: `${group.label} · ${category.label}`,
        href: `/knowledge/${category.slug}#${encodeURIComponent(section.label)}`,
      })))),
    [sourceLibraryGroups],
  );

  const allDocResults: Result[] = useMemo(
    () => docs.map((d) => ({
      kind: 'doc', key: `d:${d.id}`,
      title: d.title, sub: d.category, href: d.href,
    })),
    [docs],
  );

  // Learning tool actions — discoverable via ⌘P search
  const toolActions: Result[] = useMemo(() => [
    { kind: 'doc' as const, key: 'tool:rehearsal', title: rehearsalSurface.launcherTitle, sub: rehearsalSurface.title, href: '__action:rehearsal' },
    { kind: 'doc' as const, key: 'tool:examiner', title: examinerSurface.launcherTitle, sub: examinerSurface.title, href: '__action:examiner' },
    { kind: 'doc' as const, key: 'tool:patterns', title: 'Patterns', sub: ctx.isFree ? 'Open Patterns' : 'Open the current panel in Patterns', href: ctx.isFree ? '/patterns' : `__action:patterns:${ctx.docId}` },
    { kind: 'doc' as const, key: 'tool:relations', title: 'Relations', sub: ctx.isFree ? 'Open the relations graph' : 'Open the current panel in relations', href: ctx.isFree ? '/graph' : `__action:relations:${ctx.docId}` },
    { kind: 'doc' as const, key: 'tool:ingestion', title: ingestionSurface.launcherTitle, sub: ingestionSurface.title, href: '__action:ingestion' },
    { kind: 'doc' as const, key: 'tool:recursing', title: 'Reconstructions', sub: 'Past rehearsals', href: '__action:recursing' },
    { kind: 'doc' as const, key: 'tool:thoughtmap', title: 'Thought Map', sub: '⌘/ · Open the thought map for current doc', href: '__action:thoughtmap' },
    { kind: 'doc' as const, key: 'tool:help', title: 'Help', sub: 'Usage guide', href: '/help' },
    { kind: 'doc' as const, key: 'tool:export-json', title: 'Export Notes (JSON)', sub: 'Full backup', href: '__action:export-json' },
    { kind: 'doc' as const, key: 'tool:export-md', title: 'Export Notes (Markdown)', sub: 'Human-readable', href: '__action:export-md' },
  ], [ctx.docId, ctx.isFree, examinerSurface.launcherTitle, examinerSurface.title, ingestionSurface.launcherTitle, ingestionSurface.title, rehearsalSurface.launcherTitle, rehearsalSurface.title]);

  // Score & merge — content first, tools last.
  const grouped = useMemo(() => {
    const hasQuery = q.trim().length > 0;
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
      collections: filterAndSort(collections, hasQuery ? 4 : 0),
      sourceSections: filterAndSort(sourceSections, hasQuery ? 6 : 0),
      sourceDocs:  filterAndSort(allDocResults.filter((item) => item.href.startsWith('/knowledge/')), hasQuery ? 10 : 4),
      wikiDocs:    filterAndSort(allDocResults.filter((item) => item.href.startsWith('/wiki/')), hasQuery ? 10 : 4),
      otherDocs:   filterAndSort(allDocResults.filter((item) => !item.href.startsWith('/knowledge/') && !item.href.startsWith('/wiki/')), hasQuery ? 4 : 2),
      tools:       filterAndSort(toolActions, hasQuery ? 4 : 3),
    };
  }, [q, collections, sourceSections, allDocResults, toolActions]);

  // Flatten to a single keyboard-navigable list
  const flat: Result[] = useMemo(
    () => [
      ...grouped.collections,
      ...grouped.sourceSections,
      ...grouped.sourceDocs,
      ...grouped.wikiDocs,
      ...grouped.otherDocs,
      ...grouped.tools,
    ],
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
      openLoomOverlay({ id: 'rehearsal' });
    } else if (r.href === '__action:examiner') {
      openLoomOverlay({ id: 'examiner' });
    } else if (r.href === '__action:ingestion') {
      openLoomOverlay({ id: 'ingestion' });
    } else if (r.href === '__action:recursing') {
      openLoomOverlay({ id: 'recursing' });
    } else if (r.href === '__action:thoughtmap') {
      openLoomReview();
    } else if (r.href.startsWith('__action:patterns:')) {
      const docId = r.href.slice('__action:patterns:'.length);
      window.location.href = `/patterns?focus=${encodeURIComponent(docId)}`;
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
          padding: '12px 18px 6px',
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
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '0.62rem 1rem',
                cursor: 'pointer',
                background: isActive ? 'color-mix(in srgb, var(--accent) 7%, transparent)' : 'transparent',
                borderLeft: '2px solid ' + (isActive ? 'var(--accent)' : 'transparent'),
                borderBottom: '0.5px solid color-mix(in srgb, var(--mat-border) 70%, transparent)',
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
        background: 'rgba(7,9,14,0.24)',
        display: 'flex',
        alignItems: smallScreen ? 'stretch' : 'flex-start',
        justifyContent: 'center',
        paddingTop: smallScreen ? 0 : '10vh',
        backdropFilter: 'saturate(115%) blur(14px)',
        WebkitBackdropFilter: 'saturate(115%) blur(14px)',
        animation: 'lpFade 0.18s var(--ease)',
      }}
    >
      <div style={{
        width: smallScreen ? '100vw' : 'min(590px, 90vw)',
        minHeight: smallScreen ? '100vh' : 'auto',
        background: 'color-mix(in srgb, var(--mat-thick-bg) 88%, white 12%)',
        backdropFilter: 'saturate(135%) blur(28px)',
        WebkitBackdropFilter: 'saturate(135%) blur(28px)',
        border: smallScreen ? 'none' : '0.5px solid var(--mat-border)',
        borderRadius: smallScreen ? 0 : 22,
        boxShadow: smallScreen ? 'none' : '0 20px 64px rgba(0,0,0,0.22)',
        overflow: 'hidden',
        paddingTop: smallScreen ? 'max(8px, env(safe-area-inset-top, 0px))' : 0,
        paddingBottom: smallScreen ? 'max(8px, env(safe-area-inset-bottom, 0px))' : 0,
        display: 'flex',
        flexDirection: 'column',
      }}>
        <div style={{ padding: smallScreen ? '0.95rem 1rem 0.45rem' : '0.95rem 1.2rem 0.45rem' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            borderBottom: '0.5px solid color-mix(in srgb, var(--mat-border) 85%, transparent)',
            paddingBottom: 0.8,
          }}>
            <span style={{ color: 'var(--muted)', fontSize: '0.95rem' }}>⌕</span>
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
                fontSize: '1.02rem', outline: 'none',
                fontFamily: 'var(--display)', fontWeight: 500,
                letterSpacing: '-0.005em',
              }}
            />
            {!smallScreen && (
              <span
                className="t-caption2"
                style={{
                  color: 'var(--muted)',
                  fontFamily: 'var(--mono)',
                  border: '0.5px solid var(--mat-border)',
                  borderRadius: 999,
                  padding: '0.18rem 0.48rem',
                  letterSpacing: '0.04em',
                  flexShrink: 0,
                }}
              >
                ESC
              </span>
            )}
          </div>
        </div>
        <div ref={listRef} style={{ maxHeight: smallScreen ? 'none' : '46vh', flex: smallScreen ? 1 : 'none', overflowY: 'auto', padding: '0 0 10px' }}>
          {loading ? (
            <div
              style={{
                padding: smallScreen ? '1.4rem 1rem 1.1rem' : '1.6rem 1.2rem 1.2rem',
                color: 'var(--muted)',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <div className="t-callout" style={{ color: 'var(--fg)', fontWeight: 600 }}>
                Preparing the Shuttle
              </div>
              <div className="t-footnote">
                Pulling your source library, LLM Wiki, and available actions into one view.
              </div>
            </div>
          ) : flat.length === 0 && q ? (
            <div style={{ padding: '1.4rem 1.2rem', color: 'var(--muted)' }} className="t-footnote">
              No matches for &ldquo;{q}&rdquo;.
            </div>
          ) : flat.length === 0 ? (
            <div
              style={{
                padding: smallScreen ? '1.4rem 1rem 1.1rem' : '1.6rem 1.2rem 1.2rem',
                color: 'var(--muted)',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <div className="t-callout" style={{ color: 'var(--fg)', fontWeight: 600 }}>
                Nothing to shuttle yet
              </div>
              <div className="t-footnote">
                Open Atlas, LLM Wiki, or Today once, and recent documents will start to gather here.
              </div>
            </div>
          ) : (
            <>
              {!q.trim() && (
                <div
                  className="t-caption2"
                  style={{
                    padding: '0.72rem 1rem 0.2rem',
                    color: 'var(--muted)',
                    letterSpacing: '0.04em',
                    textAlign: 'center',
                  }}
                >
                  Your next quiet move, without leaving the desk.
                </div>
              )}
              {renderGroup('Source Library', grouped.collections)}
              {renderGroup('Source Sections', grouped.sourceSections)}
              {renderGroup(q.trim() ? 'Raw Sources' : 'Recent Raw Sources', grouped.sourceDocs)}
              {renderGroup('LLM Wiki', grouped.wikiDocs)}
              {renderGroup(q.trim() ? 'Other Results' : 'Recent Elsewhere', grouped.otherDocs)}
              {renderGroup('Actions', grouped.tools)}
            </>
          )}
        </div>
        <div
          className="t-caption2"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            justifyContent: 'center',
            padding: smallScreen ? '0.72rem 1rem 0.95rem' : '0.72rem 1rem 1rem',
            color: 'var(--muted)',
            borderTop: '0.5px solid var(--mat-border)',
            letterSpacing: '0.04em',
          }}
        >
          <span>Shuttle through your source library</span>
          <span aria-hidden>·</span>
          <span>↑↓ move</span>
          <span aria-hidden>·</span>
          <span>↵ open</span>
          <span aria-hidden>·</span>
          <span>Esc close</span>
        </div>
      </div>
    </div>
  );
}
