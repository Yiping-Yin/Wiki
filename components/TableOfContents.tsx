'use client';
import { useEffect, useState } from 'react';

type Item = { id: string; text: string; level: number };

export function TableOfContents({ docId, docTitle }: { docId?: string; docTitle?: string } = {}) {
  const [items, setItems] = useState<Item[]>([]);
  const [active, setActive] = useState<string>('');

  useEffect(() => {
    const main = document.querySelector('main');
    if (!main) return;
    let intersectObs: IntersectionObserver | null = null;
    const slugify = (s: string) =>
      s.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
    let lastSig = '';
    const collect = () => {
      const headings = Array.from(main.querySelectorAll('h2, h3')) as HTMLElement[];
      // ensure each heading has an id so anchors work even when content was rendered without one.
      // Repeated headings (e.g., two "在文中的意义" sections) would collide on slug alone —
      // deduplicate by suffixing -2, -3, … so anchors and React keys stay unique.
      const usedIds = new Set<string>();
      headings.forEach((h) => {
        let id = h.id;
        if (!id) {
          const base = slugify(h.textContent ?? '');
          if (!base) return;
          id = base;
          let n = 2;
          while (usedIds.has(id)) id = `${base}-${n++}`;
          h.id = id;
        } else if (usedIds.has(id)) {
          // DOM already has a duplicate id from somewhere — rename ours
          const base = id;
          let n = 2;
          while (usedIds.has(id)) id = `${base}-${n++}`;
          h.id = id;
        }
        usedIds.add(id);
      });
      const sig = headings.map((h) => `${h.id}:${h.textContent}`).join('|');
      if (sig === lastSig) return;
      lastSig = sig;
      setItems(headings.map((h) => ({
        id: h.id,
        text: h.textContent ?? '',
        level: h.tagName === 'H2' ? 2 : 3,
      })));
      if (intersectObs) intersectObs.disconnect();
      intersectObs = new IntersectionObserver(
        (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)),
        { rootMargin: '-20% 0% -70% 0%' },
      );
      headings.forEach((h) => intersectObs!.observe(h));
    };
    collect();
    // Re-scan whenever the main content mutates (async StructuredView, click-to-generate, etc.)
    let raf = 0;
    const mut = new MutationObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(collect);
    });
    mut.observe(main, { childList: true, subtree: true, characterData: true });
    return () => {
      mut.disconnect();
      cancelAnimationFrame(raf);
      if (intersectObs) intersectObs.disconnect();
    };
  }, []);

  // §1 沉浸式 — no labels, no cards, no chrome. Just the heading
  // links, nothing else. The TOC is hidden by default (CSS opacity 0)
  // and only appears when the user hovers the right margin.
  if (items.length === 0) return <aside className="toc" />;

  return (
    <aside className="toc" style={{
      position: 'sticky', top: '2rem', alignSelf: 'flex-start',
      width: 240, padding: '0.6rem 0', fontSize: '0.82rem',
    }}>
      {items.map((it, idx) => (
        <a
          key={`${it.id}-${idx}`}
          href={`#${it.id}`}
          style={{
            display: 'block',
            padding: it.level === 3 ? '0.18rem 0 0.18rem 1.2rem' : '0.22rem 0',
            fontSize: it.level === 3 ? '0.78rem' : '0.82rem',
            opacity: it.level === 3 ? 0.75 : 1,
            color: active === it.id ? 'var(--accent)' : 'var(--muted)',
            borderLeft: active === it.id ? '2px solid var(--accent)' : '2px solid transparent',
            fontWeight: active === it.id ? 600 : 400,
            lineHeight: 1.4,
            textDecoration: 'none',
          }}
        >
          {it.text}
        </a>
      ))}
    </aside>
  );
}
