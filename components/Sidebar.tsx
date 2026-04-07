'use client';
import Link from 'next/link';
import { useState } from 'react';
import { chapters } from '../lib/nav';
import { ThemeToggle } from './ThemeToggle';
import { SearchBox } from './SearchBox';

export function Sidebar() {
  const [open, setOpen] = useState(false);
  const sections = Array.from(new Set(chapters.map((c) => c.section)));

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="mobile-menu-btn"
        style={{
          position: 'fixed', top: 12, left: 12, zIndex: 60,
          background: 'var(--bg)', border: '1px solid var(--border)',
          borderRadius: 6, padding: '0.4rem 0.6rem', cursor: 'pointer', color: 'var(--fg)',
        }}
      >☰</button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 70 }}
        />
      )}

      <aside
        className={`sidebar ${open ? 'open' : ''}`}
        style={{
          width: 270, borderRight: '1px solid var(--border)',
          padding: '1.5rem 1.1rem', position: 'sticky', top: 0,
          height: '100vh', overflowY: 'auto', background: 'var(--bg)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <Link href="/" style={{ fontWeight: 800, fontSize: '1.05rem' }}>📚 LLM Wiki</Link>
          <ThemeToggle />
        </div>
        <SearchBox />
        <Link href="/graph" style={{ display: 'block', fontSize: '0.85rem', color: 'var(--muted)', margin: '0.6rem 0 0.4rem' }}>
          🕸 Knowledge graph
        </Link>
        <Link href="/demo" style={{ display: 'block', fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '0.8rem' }}>
          🎛 Feature demo
        </Link>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
          {sections.map((sec) => (
            <div key={sec} style={{ marginTop: '0.7rem' }}>
              <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: '0.3rem' }}>
                {sec}
              </div>
              {chapters.filter((c) => c.section === sec).map((c) => (
                <Link
                  key={c.slug}
                  href={`/wiki/${c.slug}`}
                  onClick={() => setOpen(false)}
                  style={{ display: 'block', padding: '0.25rem 0.4rem', borderRadius: 4, fontSize: '0.88rem', color: 'var(--fg)' }}
                >
                  {c.title}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
