'use client';
import Link from 'next/link';
import { useState, useMemo, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { chapters } from '../lib/nav';
import { knowledgeCategories, knowledgeTotal } from '../lib/knowledge-nav';
import { ThemeToggle } from './ThemeToggle';
import { SearchBox } from './SearchBox';
import { useReadingMode } from './ReadingMode';
import { useHistory } from '../lib/use-history';
import { usePins } from '../lib/use-pins';
import chapterMeta from '../lib/chapter-meta.json';

type ChMeta = { hasVideo?: boolean; hasMath?: boolean; hasCode?: boolean; hasMermaid?: boolean; hasPdf?: boolean; hasWidget?: boolean; wordCount?: number };
const META = chapterMeta as Record<string, ChMeta>;

export function Sidebar() {
  const [open, setOpen] = useState(false);
  const [pinned, setPinnedState] = useState(false);
  const [llmOpen, setLlmOpen] = useState(false);
  const [knowOpen, setKnowOpen] = useState(true);

  // Edge-hover trigger to peek the sidebar (GPT Atlas style)
  useEffect(() => {
    try {
      const v = localStorage.getItem('wiki:sidebar:pinned');
      if (v === '1') setPinnedState(true);
    } catch {}
    let hideTimer: number | null = null;
    const onMove = (e: MouseEvent) => {
      if (e.clientX < 16) {
        if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
        setOpen(true);
      } else if (e.clientX > 320) {
        if (hideTimer) clearTimeout(hideTimer);
        hideTimer = window.setTimeout(() => setOpen(false), 500);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('keydown', onKey);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, []);

  const togglePin = () => {
    setPinnedState((p) => {
      const next = !p;
      try { localStorage.setItem('wiki:sidebar:pinned', next ? '1' : '0'); } catch {}
      document.body.classList.toggle('sidebar-pinned', next);
      return next;
    });
  };

  useEffect(() => {
    document.body.classList.toggle('sidebar-pinned', pinned);
  }, [pinned]);

  const visible = open || pinned;
  const sections = Array.from(new Set(chapters.map((c) => c.section)));
  const pathname = usePathname();
  const [history] = useHistory();
  const { pins } = usePins();

  // Build a Set of viewed wiki slugs and per-category viewed counts
  const { viewedWikiSlugs, viewedByCategory } = useMemo(() => {
    const wikiSet = new Set<string>();
    const catCounts: Record<string, Set<string>> = {};
    for (const h of history) {
      // wiki/<slug>
      const wm = h.id.match(/^wiki\/(.+)$/);
      if (wm) { wikiSet.add(wm[1]); continue; }
      // know/<categorySlug>__<fileSlug>
      const km = h.id.match(/^know\/([^_]+(?:_[^_]+)*)__(.+)$/);
      if (km) {
        const cat = km[1];
        if (!catCounts[cat]) catCounts[cat] = new Set();
        catCounts[cat].add(km[2]);
      }
    }
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(catCounts)) out[k] = v.size;
    return { viewedWikiSlugs: wikiSet, viewedByCategory: out };
  }, [history]);

  const isActive = (href: string) => pathname === href;

  return (
    <>
      {/* Edge-hover hotzone — invisible 6px strip on left */}
      <div
        aria-hidden
        style={{
          position: 'fixed', top: 0, left: 0, bottom: 0, width: 6,
          zIndex: 65,
        }}
      />

      <aside
        className={`sidebar glass ${visible ? 'open' : ''}`}
        style={{
          width: 280,
          padding: '1.5rem 1.1rem 4rem',
          position: 'fixed', top: 0, left: 0, height: '100vh',
          overflowY: 'auto',
          display: 'flex', flexDirection: 'column',
          zIndex: 70,
          borderRight: 'var(--hairline)',
          transform: visible ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.32s var(--ease)',
          boxShadow: visible && !pinned ? 'var(--shadow-3)' : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
            <span style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'linear-gradient(135deg, #7c3aed, #4338ca)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1rem',
            }}>📚</span>
            <span>
              <span style={{ display: 'block', fontWeight: 800, fontSize: '0.95rem', color: 'var(--fg)' }}>My Wiki</span>
              <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--muted)' }}>Personal knowledge base</span>
            </span>
          </Link>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={togglePin}
              title={pinned ? 'Unpin sidebar (auto-hide)' : 'Pin sidebar (always show)'}
              aria-label="Pin sidebar"
              style={{
                background: pinned ? 'var(--accent)' : 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '0.3rem 0.55rem',
                cursor: 'pointer',
                color: pinned ? '#fff' : 'var(--fg)',
                fontSize: '0.85rem',
                lineHeight: 1,
              }}
            >📌</button>
            <ReadingToggle />
            <ThemeToggle />
          </div>
        </div>
        <SearchBox />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, margin: '0.8rem 0' }}>
          <NavLink href="/today" active={isActive('/today')}>📅 Today</NavLink>
          <NavLink href="/browse" active={isActive('/browse')}>🧭 Browse</NavLink>
          <NavLink href="/uploads" active={isActive('/uploads')}>📥 Uploads</NavLink>
          <NavLink href="/notes" active={isActive('/notes')}>📝 My notes</NavLink>
        </div>

        {/* Personal knowledge */}
        <Section title={`📚 My Knowledge (${knowledgeTotal})`} open={knowOpen} onToggle={() => setKnowOpen((o) => !o)}>
          <Link
            href="/knowledge"
            onClick={() => setOpen(false)}
            style={{ display: 'block', padding: '0.25rem 0.4rem', borderRadius: 4, fontSize: '0.85rem', color: 'var(--accent)', fontWeight: 600 }}
          >
            All categories
          </Link>
          {knowledgeCategories.map((c) => {
            const viewed = viewedByCategory[c.slug] ?? 0;
            const pct = c.count > 0 ? viewed / c.count : 0;
            const active = pathname.startsWith(`/knowledge/${c.slug}`);
            return (
              <Link
                key={c.slug}
                href={`/knowledge/${c.slug}`}
                onClick={() => setOpen(false)}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '0.22rem 0.4rem', borderRadius: 4, fontSize: '0.83rem',
                  color: active ? 'var(--accent)' : 'var(--fg)',
                  background: active ? 'var(--accent-soft)' : 'transparent',
                  fontWeight: active ? 600 : 400,
                  position: 'relative',
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {viewed === c.count && c.count > 0 && <span style={{ color: '#10b981', marginRight: 4 }}>✓</span>}
                  {viewed > 0 && viewed < c.count && <span style={{ color: '#10b981', marginRight: 4, opacity: 0.5 }}>◐</span>}
                  {c.label}
                </span>
                <span style={{ color: 'var(--muted)', fontSize: '0.7rem', whiteSpace: 'nowrap', marginLeft: 6, fontVariantNumeric: 'tabular-nums' }}>
                  {viewed > 0 ? `${viewed}/${c.count}` : c.count}
                </span>
              </Link>
            );
          })}
        </Section>

        {/* LLM reference wiki */}
        <Section title={`🤖 LLM Reference (${chapters.length})`} open={llmOpen} onToggle={() => setLlmOpen((o) => !o)}>
          {sections.map((sec) => (
            <div key={sec} style={{ marginTop: '0.5rem' }}>
              <div style={{ fontSize: '0.66rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: '0.2rem' }}>
                {sec}
              </div>
              {chapters.filter((c) => c.section === sec).map((c) => {
                const active = pathname === `/wiki/${c.slug}`;
                const viewed = viewedWikiSlugs.has(c.slug);
                const m = META[c.slug] ?? {};
                return (
                  <Link
                    key={c.slug}
                    href={`/wiki/${c.slug}`}
                    onClick={() => setOpen(false)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '0.22rem 0.4rem', borderRadius: 4, fontSize: '0.82rem',
                      color: active ? 'var(--accent)' : 'var(--fg)',
                      background: active ? 'var(--accent-soft)' : 'transparent',
                      fontWeight: active ? 600 : 400,
                    }}
                  >
                    {viewed && <span style={{ color: '#10b981', fontSize: '0.7rem' }}>✓</span>}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                      {c.title}
                    </span>
                    {m.hasVideo && (
                      <span title="Has YouTube video" style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 14, height: 11, borderRadius: 2,
                        background: '#dc2626', color: '#fff',
                        fontSize: '0.55rem', fontWeight: 700, flexShrink: 0,
                      }}>▶</span>
                    )}
                    {m.hasWidget && (
                      <span title="Interactive widget" style={{ fontSize: '0.7rem', color: '#7c3aed', flexShrink: 0 }}>◉</span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </Section>

        {/* Footer with progress */}
        <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: 'var(--hairline)', fontSize: '0.7rem', color: 'var(--muted)' }}>
          {history.length > 0 ? `${history.length} doc${history.length === 1 ? '' : 's'} visited` : 'Start exploring'}
          {' · '}
          <Link href="/today" style={{ color: 'var(--accent)' }}>see progress →</Link>
        </div>
      </aside>
    </>
  );
}

function ReadingToggle() {
  const [on, toggle] = useReadingMode();
  return (
    <button
      onClick={toggle}
      title={on ? 'Exit reading mode (R)' : 'Reading mode (R)'}
      aria-label="Toggle reading mode"
      style={{
        background: on ? 'var(--accent)' : 'transparent',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: '0.3rem 0.55rem',
        cursor: 'pointer',
        color: on ? '#fff' : 'var(--fg)',
        fontSize: '0.85rem',
        lineHeight: 1,
      }}
    >
      {on ? '📖' : '◉'}
    </button>
  );
}

function NavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      style={{
        fontSize: '0.85rem',
        color: active ? 'var(--accent)' : 'var(--muted)',
        background: active ? 'var(--accent-soft)' : 'transparent',
        padding: '4px 8px',
        borderRadius: 6,
        fontWeight: active ? 600 : 400,
      }}
    >
      {children}
    </Link>
  );
}

function Section({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: '1rem' }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', textAlign: 'left', background: 'transparent', border: 0,
          fontSize: '0.78rem', color: 'var(--muted)', textTransform: 'uppercase',
          letterSpacing: '0.08em', cursor: 'pointer', padding: '0.3rem 0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <span>{title}</span>
        <span style={{ fontSize: '0.7rem' }}>{open ? '▾' : '▸'}</span>
      </button>
      {open && <div style={{ display: 'flex', flexDirection: 'column' }}>{children}</div>}
    </div>
  );
}
