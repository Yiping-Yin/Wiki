'use client';
import { useEffect, useState } from 'react';

type Item = { id: string; text: string; level: number };

export function TableOfContents() {
  const [items, setItems] = useState<Item[]>([]);
  const [active, setActive] = useState<string>('');

  useEffect(() => {
    const headings = Array.from(document.querySelectorAll('main h2, main h3')) as HTMLElement[];
    setItems(headings.map((h) => ({
      id: h.id,
      text: h.textContent ?? '',
      level: h.tagName === 'H2' ? 2 : 3,
    })));
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: '-20% 0% -70% 0%' },
    );
    headings.forEach((h) => obs.observe(h));
    return () => obs.disconnect();
  }, []);

  if (items.length === 0) return null;
  return (
    <aside className="toc" style={{
      position: 'sticky', top: '2rem', alignSelf: 'flex-start',
      width: 220, padding: '1rem', fontSize: '0.82rem',
      maxHeight: 'calc(100vh - 4rem)', overflowY: 'auto',
    }}>
      <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--muted)', marginBottom: '0.5rem' }}>
        On this page
      </div>
      {items.map((it) => (
        <a
          key={it.id}
          href={`#${it.id}`}
          style={{
            display: 'block',
            padding: it.level === 3 ? '0.18rem 0 0.18rem 1rem' : '0.18rem 0 0.18rem 0.5rem',
            color: active === it.id ? 'var(--accent)' : 'var(--muted)',
            borderLeft: active === it.id ? '2px solid var(--accent)' : '2px solid transparent',
          }}
        >
          {it.text}
        </a>
      ))}
    </aside>
  );
}
