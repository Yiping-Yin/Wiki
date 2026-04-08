'use client';
import Link from 'next/link';
import { useState } from 'react';
import { chapters } from '../lib/nav';
import { knowledgeCategories, knowledgeTotal } from '../lib/knowledge-nav';
import { ThemeToggle } from './ThemeToggle';
import { SearchBox } from './SearchBox';

export function Sidebar() {
  const [open, setOpen] = useState(false);
  const [llmOpen, setLlmOpen] = useState(false);
  const [knowOpen, setKnowOpen] = useState(true);
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
          width: 280, borderRight: '1px solid var(--border)',
          padding: '1.5rem 1.1rem 4rem', position: 'sticky', top: 0,
          height: '100vh', overflowY: 'auto', background: 'var(--bg)',
          display: 'flex', flexDirection: 'column',
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
          <ThemeToggle />
        </div>
        <SearchBox />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, margin: '0.8rem 0' }}>
          <Link href="/today" style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>📅 Today</Link>
          <Link href="/notes" style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>📝 My notes</Link>
          <Link href="/atlas" style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>🗺 Knowledge atlas</Link>
          <Link href="/graph" style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>🕸 Knowledge graph</Link>
          <Link href="/demo" style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>🎛 Feature demo</Link>
        </div>

        {/* Personal knowledge — at top, expanded by default */}
        <Section title={`📚 My Knowledge (${knowledgeTotal})`} open={knowOpen} onToggle={() => setKnowOpen((o) => !o)}>
          <Link
            href="/knowledge"
            onClick={() => setOpen(false)}
            style={{ display: 'block', padding: '0.25rem 0.4rem', borderRadius: 4, fontSize: '0.85rem', color: 'var(--accent)', fontWeight: 600 }}
          >
            All categories
          </Link>
          {knowledgeCategories.map((c) => (
            <Link
              key={c.slug}
              href={`/knowledge/${c.slug}`}
              onClick={() => setOpen(false)}
              style={{ display: 'block', padding: '0.22rem 0.4rem', borderRadius: 4, fontSize: '0.83rem', color: 'var(--fg)' }}
            >
              {c.label} <span style={{ color: 'var(--muted)', fontSize: '0.7rem' }}>· {c.count}</span>
            </Link>
          ))}
        </Section>

        {/* LLM reference wiki — collapsed by default */}
        <Section title={`🤖 LLM Reference (${chapters.length})`} open={llmOpen} onToggle={() => setLlmOpen((o) => !o)}>
          {sections.map((sec) => (
            <div key={sec} style={{ marginTop: '0.5rem' }}>
              <div style={{ fontSize: '0.66rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: '0.2rem' }}>
                {sec}
              </div>
              {chapters.filter((c) => c.section === sec).map((c) => (
                <Link
                  key={c.slug}
                  href={`/wiki/${c.slug}`}
                  onClick={() => setOpen(false)}
                  style={{ display: 'block', padding: '0.2rem 0.4rem', borderRadius: 4, fontSize: '0.82rem', color: 'var(--fg)' }}
                >
                  {c.title}
                </Link>
              ))}
            </div>
          ))}
        </Section>
      </aside>
    </>
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
