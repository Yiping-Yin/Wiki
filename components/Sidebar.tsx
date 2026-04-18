'use client';
import Link from 'next/link';
import { useRef, useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { chapters } from '../lib/nav';
import {
  LEGACY_SIDEBAR_PINNED_KEY,
  resolveInitialSidebarMode,
  SIDEBAR_MODE_KEY,
  shouldForcePinnedSidebarForPath,
  type SidebarMode,
} from '../lib/sidebar-mode';
import { SearchBox } from './SearchBox';
import chapterMeta from '../lib/chapter-meta.json';
import { useKnowledgeNav } from '../lib/use-knowledge-nav';
import { useSmallScreen } from '../lib/use-small-screen';

type ChMeta = { hasVideo?: boolean; hasMath?: boolean; hasCode?: boolean; hasMermaid?: boolean; hasPdf?: boolean; hasWidget?: boolean; wordCount?: number };
const META = chapterMeta as Record<string, ChMeta>;

export function Sidebar() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<SidebarMode>('hidden');
  const [llmOpen, setLlmOpen] = useState(false);
  const [knowOpen, setKnowOpen] = useState(false);
  const { knowledgeCategories } = useKnowledgeNav();

  // Restore preference + edge-hover peek (only when hidden)
  useEffect(() => {
    try {
      const v = localStorage.getItem(SIDEBAR_MODE_KEY);
      if (v === 'mini') {
        // Migrate broken mini state to hidden
        setMode('hidden');
        localStorage.setItem(SIDEBAR_MODE_KEY, 'hidden');
      } else {
        setMode(resolveInitialSidebarMode({
          storedMode: v,
          legacyPinned: localStorage.getItem(LEGACY_SIDEBAR_PINNED_KEY),
          viewportWidth: window.innerWidth,
        }));
      }
    } catch {}
    let hideTimer: number | null = null;
    let rafId = 0;
    let lastX = 0;
    const tick = () => {
      rafId = 0;
      if (lastX < 16) {
        if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
        setOpen(true);
      } else if (lastX > 320) {
        if (hideTimer) clearTimeout(hideTimer);
        hideTimer = window.setTimeout(() => setOpen(false), 500);
      }
    };
    const onMove = (e: MouseEvent) => {
      if (e.clientX >= 16 && e.clientX <= 320) return;
      lastX = e.clientX;
      if (!rafId) rafId = requestAnimationFrame(tick);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('keydown', onKey);
      if (hideTimer) clearTimeout(hideTimer);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  const cycleMode = () => {
    setMode((m) => {
      const next: SidebarMode = m === 'hidden' ? 'pinned' : 'hidden';
      try { localStorage.setItem(SIDEBAR_MODE_KEY, next); } catch {}
      return next;
    });
  };

  const pathname = usePathname();
  const isReadingPage =
    pathname.startsWith('/wiki/') ||
    pathname.startsWith('/knowledge/') ||
    pathname.startsWith('/uploads/');

  useEffect(() => {
    document.body.classList.toggle('sidebar-pinned', mode === 'pinned' && !isReadingPage);
    document.body.classList.remove('sidebar-mini');
  }, [mode, isReadingPage]);

  useEffect(() => {
    if (pathname.startsWith('/knowledge')) setKnowOpen(true);
    if (pathname.startsWith('/wiki/')) setLlmOpen(true);
  }, [pathname]);

  // Auto-close on reading pages so content gets full width
  useEffect(() => {
    if (isReadingPage) setOpen(false);
  }, [isReadingPage, pathname]);
  const smallScreen = useSmallScreen();
  const forcePinned = !smallScreen && shouldForcePinnedSidebarForPath(pathname);
  const pinned = (mode === 'pinned' || forcePinned) && !isReadingPage;
  const visible = open || pinned;
  const sections = Array.from(new Set(chapters.map((c) => c.section)));
  const router = useRouter();

  const isActive = (href: string) => {
    if (href === '/patterns') return pathname === '/patterns' || pathname === '/kesi';
    if (href === '/atlas') return pathname === '/knowledge' || pathname === '/atlas';
    return pathname === href;
  };

  return (
    <>
      {/* Stealth · no edge handle. Mouse near left edge auto-opens sidebar.
          ⌘\ keyboard shortcut also works. */}

      {/* Mobile / accessible hamburger — top-left, only when not visible */}
      {!visible && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="mobile-menu-btn"
          style={{
            position: 'fixed',
            top: 'max(44px, env(safe-area-inset-top, 0px) + 28px)',
            left: 'max(12px, env(safe-area-inset-left, 0px) + 6px)',
            zIndex: 66,
            background: 'var(--bg-translucent)',
            border: 'var(--hairline)',
            borderRadius: 'var(--r-1)',
            padding: '0.34rem 0.48rem',
            cursor: 'pointer',
            color: 'var(--fg)',
            backdropFilter: 'saturate(180%) blur(20px)',
            WebkitBackdropFilter: 'saturate(180%) blur(20px)',
            boxShadow: 'var(--shadow-1)',
            fontSize: '0.82rem',
            lineHeight: 1,
          }}
        >☰</button>
      )}

      {/* Backdrop when overlay is open (not pinned) */}
      {open && !pinned && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 68,
            background: 'rgba(0,0,0,0.15)',
            backdropFilter: 'blur(2px)',
            WebkitBackdropFilter: 'blur(2px)',
          }}
        />
      )}

      <aside
        className={`sidebar material-thick ${visible ? 'open' : ''}`}
        style={{
          width: 'min(288px, calc(100vw - 32px))',
          padding: '1.5rem 1rem 4rem 1.1rem',
          position: 'fixed', top: 0, left: 0,
          height: '100vh',
          overflowY: 'auto',
          display: 'flex', flexDirection: 'column',
          zIndex: 70,
          borderRight: '0.5px solid var(--mat-border)',
          borderRadius: 0,
          transform: visible ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.34s var(--ease-spring)',
          boxShadow: visible && !pinned ? 'var(--shadow-3)' : 'none',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: '1rem', gap: 6,
        }}>
          <Link
            href="/"
            style={{
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              minWidth: 0,
              flex: 1,
              paddingLeft: 1,
            }}
          >
            <span
              style={{
                fontFamily: 'var(--display)',
                fontSize: '0.98rem',
                fontWeight: isActive('/') ? 620 : 560,
                letterSpacing: '-0.028em',
                color: isActive('/') ? 'var(--fg)' : 'color-mix(in srgb, var(--fg) 92%, var(--muted))',
                lineHeight: 1,
              }}
            >
              Loom
            </span>
          </Link>
          <button
            onClick={cycleMode}
            title={pinned ? 'Unpin' : 'Pin'}
            aria-label="Toggle pin"
            style={{
              background: 'transparent',
              border: 0,
              borderRadius: 4,
              padding: '0.25rem',
              cursor: 'pointer',
              color: pinned ? 'var(--accent)' : 'var(--muted)',
              fontSize: '0.7rem',
              lineHeight: 1,
              flexShrink: 0,
              opacity: pinned ? 1 : 0.5,
              transition: 'opacity 0.18s var(--ease), color 0.18s var(--ease)',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = pinned ? '1' : '0.5'; }}
          >◰</button>
        </div>
        {smallScreen && <SearchBox />}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, margin: '0.8rem 0 0.4rem' }}>
          <NavLink href="/today" active={isActive('/today')}>Today</NavLink>
          <NavLink href="/atlas" active={isActive('/atlas')}>Atlas</NavLink>
          <NavLink href="/patterns" active={isActive('/patterns')}>Patterns</NavLink>
        </div>

        {/* Personal knowledge */}
        <Section title="The Atlas" open={knowOpen} onToggle={() => setKnowOpen((o) => !o)}
          trailing={<NewTopicButton onCreated={(href) => { setOpen(false); router.push(href); }} />}
        >
          {knowledgeCategories.map((c) => (
            <CategoryRow
              key={c.slug}
              cat={c}
              activePath={pathname}
              onNav={() => setOpen(false)}
            />
          ))}
        </Section>

        {/* LLM reference wiki */}
        <Section title="LLM Reference" open={llmOpen} onToggle={() => setLlmOpen((o) => !o)}>
          {sections.map((sec) => (
            <div key={sec} style={{ marginTop: '0.5rem' }}>
              <div style={{ fontSize: '0.66rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: '0.2rem' }}>
                {sec}
              </div>
              {chapters.filter((c) => c.section === sec).map((c) => {
                const active = pathname === `/wiki/${c.slug}`;
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
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                      {c.title}
                    </span>
                    {m.hasVideo && (
                      <span title="Has YouTube video" style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 14, height: 11, borderRadius: 2,
                        background: 'var(--tint-red)', color: 'var(--bg)',
                        fontSize: '0.55rem', fontWeight: 700, flexShrink: 0,
                      }}>▶</span>
                    )}
                    {m.hasWidget && (
                      <span title="Interactive widget" style={{ fontSize: '0.7rem', color: 'var(--tint-purple)', flexShrink: 0 }}>◉</span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </Section>

        <div style={{ marginTop: '1.2rem', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <SubtleLink href="/browse" active={isActive('/browse')} onNav={() => setOpen(false)}>Browse</SubtleLink>
          <SubtleLink href="/about" active={isActive('/about')} onNav={() => setOpen(false)}>About</SubtleLink>
          <SubtleLink href="/help" active={isActive('/help')} onNav={() => setOpen(false)}>Help</SubtleLink>
        </div>

        {/* §11, §31 — no footer chrome. The sidebar's job is navigation,
            not telling the user how many docs they've visited. */}
      </aside>
    </>
  );
}

function CategoryRow({
  cat, activePath, onNav,
}: {
  cat: { slug: string; label: string; count: number; subs: { label: string; order: number; count: number }[] };
  activePath?: string | null;
  onNav: () => void;
}) {
  const active = (activePath ?? '').startsWith(`/knowledge/${cat.slug}`);
  const hasSubs = cat.subs.some((s) => s.label);
  const [expanded, setExpanded] = useState(active && hasSubs);
  return (
    <div style={{ marginTop: 1 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 2,
        borderRadius: 6,
        background: active ? 'var(--accent-soft)' : 'transparent',
      }}>
        {hasSubs ? (
          <button
            onClick={() => setExpanded((e) => !e)}
            aria-label={expanded ? 'Collapse' : 'Expand'}
            style={{
              width: 18, height: 22, padding: 0, border: 0, background: 'transparent',
              color: 'var(--muted)', cursor: 'pointer', fontSize: '0.68rem',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >{expanded ? '▾' : '▸'}</button>
        ) : <span style={{ width: 18, flexShrink: 0 }} />}
        <Link
          href={`/knowledge/${cat.slug}`}
          onClick={onNav}
          style={{
            flex: 1, minWidth: 0,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6,
            padding: '0.22rem 0.4rem 0.22rem 0',
            fontSize: '0.83rem', textDecoration: 'none',
            color: active ? 'var(--accent)' : 'var(--fg)',
            fontWeight: active ? 600 : 500,
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
            {cat.label}
          </span>
        </Link>
      </div>
      {expanded && hasSubs && (
        <div style={{ marginLeft: 22, borderLeft: '0.5px solid var(--mat-border)', paddingLeft: 6, marginTop: 2 }}>
          {cat.subs.filter((s) => s.label).map((s) => (
            <Link
              key={s.label}
              href={`/knowledge/${cat.slug}#${encodeURIComponent(s.label)}`}
              onClick={onNav}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6,
                padding: '0.18rem 0.4rem', borderRadius: 4,
                fontSize: '0.76rem', color: 'var(--fg-secondary)',
                textDecoration: 'none',
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                {s.label}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
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

function SubtleLink({
  href,
  active,
  onNav,
  children,
}: {
  href: string;
  active: boolean;
  onNav: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onNav}
      style={{
        display: 'block',
        padding: '0.18rem 0.2rem',
        fontSize: '0.8rem',
        color: active ? 'var(--accent)' : 'var(--muted)',
        textDecoration: 'none',
        fontWeight: active ? 600 : 500,
      }}
    >
      {children}
    </Link>
  );
}

function Section({
  title,
  open,
  onToggle,
  trailing,
  children,
  collapsible = true,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  trailing?: React.ReactNode;
  children: React.ReactNode;
  collapsible?: boolean;
}) {
  return (
    <div style={{ marginTop: '1.2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {collapsible ? (
          <button
            onClick={onToggle}
            style={{
              flex: 1, textAlign: 'left', background: 'transparent', border: 0,
              color: 'var(--muted)',
              cursor: 'pointer', padding: '0.3rem 0',
              fontSize: '0.7rem',
              fontWeight: 600,
              letterSpacing: 0,
              textTransform: 'none',
              fontFamily: 'var(--display)',
            }}
          >
            {title}
          </button>
        ) : (
          <div
            style={{
              flex: 1,
              color: 'var(--muted)',
              padding: '0.3rem 0',
              fontSize: '0.7rem',
              fontWeight: 600,
              fontFamily: 'var(--display)',
            }}
          >
            {title}
          </div>
        )}
        {trailing}
      </div>
      {open && <div style={{ display: 'flex', flexDirection: 'column', marginTop: 4 }}>{children}</div>}
    </div>
  );
}

/** Inline "new topic" creation — §16: click → type → enter → done. */
function NewTopicButton({ onCreated }: { onCreated: (href: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) setTimeout(() => inputRef.current?.focus(), 50);
  }, [editing]);

  // Listen for native ⌘N from macOS app
  useEffect(() => {
    const onNative = () => setEditing(true);
    window.addEventListener('loom:new-topic', onNative);
    return () => window.removeEventListener('loom:new-topic', onNative);
  }, []);

  const submit = async () => {
    const name = value.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const r = await fetch('/api/knowledge/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (r.ok) {
        const j = await r.json();
        setEditing(false);
        setValue('');
        onCreated(j.href);
      }
    } catch {} finally { setBusy(false); }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') { setEditing(false); setValue(''); }
        }}
        onBlur={() => { if (!value.trim()) { setEditing(false); setValue(''); } }}
        placeholder="Topic name…"
        disabled={busy}
        style={{
          width: 100, border: 0, borderBottom: '1px solid var(--accent)',
          background: 'transparent', color: 'var(--fg)',
          fontSize: '0.72rem', padding: '2px 0', outline: 'none',
          fontFamily: 'var(--display)',
        }}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      aria-label="New topic"
      title="New topic"
      style={{
        background: 'transparent', border: 0, cursor: 'pointer',
        color: 'var(--muted)', fontSize: '0.85rem', lineHeight: 1,
        padding: '0 4px', opacity: 0.4, flexShrink: 0,
        transition: 'opacity 0.18s var(--ease), color 0.18s var(--ease)',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--accent)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.4'; e.currentTarget.style.color = 'var(--muted)'; }}
    >+</button>
  );
}
